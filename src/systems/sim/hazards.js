import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { rt } from '../../core/runtime.js';
import { clamp, dist2 } from '../../core/utils.js';
import { explodeBarrel, killEnemy } from '../combat.js';

export function stepHazards(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  // Core spawn check
  if (!rt.state.coreSpawned && rt.state.waveTime >= rt.state.coreSpawnTime) {
    rt.state.coreSpawned = true;
    var cMargin = 60;
    var cx = cMargin + Math.random() * (boundW - cMargin * 2);
    var cy = cMargin + Math.random() * (boundH - cMargin * 2);
    for (var cTry = 0; cTry < 10; cTry += 1) {
      if (Math.hypot(cx - p.x, cy - p.y) >= 140) break;
      cx = cMargin + Math.random() * (boundW - cMargin * 2);
      cy = cMargin + Math.random() * (boundH - cMargin * 2);
    }
    if (Math.hypot(cx - p.x, cy - p.y) < 140) {
      var cAngle = Math.atan2(cy - p.y, cx - p.x);
      cx = clamp(p.x + Math.cos(cAngle) * 140, cMargin, boundW - cMargin);
      cy = clamp(p.y + Math.sin(cAngle) * 140, cMargin, boundH - cMargin);
    }
    rt.state.volatileCores.push({ x: cx, y: cy, r: 12, hp: 30, maxHp: 30, rot: 0 });
    spawnParticles(cx, cy, '#f5a623', 8, 100, 2);
  }
  for (var vci = 0; vci < rt.state.volatileCores.length; vci += 1) {
    rt.state.volatileCores[vci].rot += dt * 2.5;
  }

  if (rt.state.barrels) {
    for (var bai = rt.state.barrels.length - 1; bai >= 0; bai -= 1) {
      var bObj = rt.state.barrels[bai];
      if (bObj.state === 'flying') {
        bObj.x += bObj.vx * dt;
        bObj.y += bObj.vy * dt;
        bObj.rot += dt * 14;
        bObj.flyingTimer -= dt;

        if (rt.state.particles) {
          var backAng = Math.atan2(bObj.vy, bObj.vx) + Math.PI;
          rt.state.particles.push({
            x: bObj.x + Math.cos(backAng) * bObj.r,
            y: bObj.y + Math.sin(backAng) * bObj.r,
            vx: Math.cos(backAng + (Math.random() - 0.5) * 0.5) * (70 + Math.random() * 50),
            vy: Math.sin(backAng + (Math.random() - 0.5) * 0.5) * (70 + Math.random() * 50),
            life: 0.15 + Math.random() * 0.1,
            maxLife: 0.25,
            size: 2.2,
            color: Math.random() < 0.5 ? '#ff4d2e' : '#f5a623',
            gravity: 0
          });
        }

        if (bObj.x <= bObj.r || bObj.x >= boundW - bObj.r || bObj.y <= bObj.r || bObj.y >= boundH - bObj.r) {
          explodeBarrel(bObj, bai, true);
          continue;
        }

        if (bObj.flyingTimer <= 0) {
          explodeBarrel(bObj, bai, true);
          continue;
        }

        var hitBig = false;
        if (!bObj.hitEnemies) bObj.hitEnemies = [];
        for (var ebi = rt.state.enemies.length - 1; ebi >= 0; ebi -= 1) {
          var tgtEnemy = rt.state.enemies[ebi];
          if (dist2(bObj.x, bObj.y, tgtEnemy.x, tgtEnemy.y) <= (bObj.r + tgtEnemy.r) * (bObj.r + tgtEnemy.r)) {
            var isHeavy = (tgtEnemy.kind === 'brute' || tgtEnemy.kind === 'elite' || tgtEnemy.kind === 'titan');
            if (isHeavy) {
              hitBig = true;
              break;
            } else if (bObj.hitEnemies.indexOf(tgtEnemy) === -1) {
              bObj.hitEnemies.push(tgtEnemy);
              tgtEnemy.hp -= 35;
              if (rt.state.stats) rt.state.stats.damageDealt += 35;
              var tkdx = tgtEnemy.x - bObj.x;
              var tkdy = tgtEnemy.y - bObj.y;
              var tkd = Math.hypot(tkdx, tkdy) || 1;
              tgtEnemy.x += (tkdx / tkd) * 35;
              tgtEnemy.y += (tkdy / tkd) * 35;
              spawnParticles(tgtEnemy.x, tgtEnemy.y, '#ff8833', 6, 120, 2);
              AudioFX.hit();
              if (tgtEnemy.hp <= 0) killEnemy(ebi);
            }
          }
        }

        if (hitBig) {
          explodeBarrel(bObj, bai, true);
          continue;
        }
      }
    }
  }

  if (rt.state.spires) {
    for (var spi = 0; spi < rt.state.spires.length; spi += 1) {
      var spObj = rt.state.spires[spi];
      if (spObj.resonanceTimer > 0) {
        spObj.resonanceTimer = Math.max(0, spObj.resonanceTimer - dt);
        if (Math.random() < 0.35 && rt.state.particles) {
          var sparkAng = Math.random() * TAU;
          var sparkDist = Math.random() * spObj.r * 1.5;
          rt.state.particles.push({
            x: spObj.x + Math.cos(sparkAng) * sparkDist,
            y: spObj.y + Math.sin(sparkAng) * sparkDist,
            vx: Math.cos(sparkAng) * (40 + Math.random() * 50),
            vy: Math.sin(sparkAng) * (40 + Math.random() * 50),
            life: 0.15 + Math.random() * 0.1,
            maxLife: 0.25,
            size: 2,
            color: Math.random() < 0.6 ? '#5be7ff' : '#ffffff',
            gravity: 0
          });
        }
      }
      spObj.pulseTimer = (spObj.pulseTimer || 0) + dt;
      if (spObj.resonanceTimer <= 0 && Math.random() < 0.04 && rt.state.particles) {
        var pSparkAng = Math.random() * TAU;
        rt.state.particles.push({
          x: spObj.x + Math.cos(pSparkAng) * (spObj.r * 0.8),
          y: spObj.y + Math.sin(pSparkAng) * (spObj.r * 0.8),
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
          life: 0.12,
          maxLife: 0.12,
          size: 1.5,
          color: '#5be7ff',
          gravity: 0
        });
      }
    }
  }
}
