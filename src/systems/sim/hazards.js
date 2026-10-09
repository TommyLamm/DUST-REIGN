import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { clamp, dist2 } from '../../core/utils.js';
import { damageEnemy, explodeBarrel, killEnemy } from '../combat.js';
import { noteContractEvent } from '../contracts.js';
import { noteMetaEvent } from '../meta.js';

function armBarrelChain(x, y, radius, depth) {
  var barrels = rt.state.barrels || [];
  var i;
  for (i = 0; i < barrels.length; i += 1) {
    var barrel = barrels[i];
    if (!barrel || barrel.chainFuse > 0) continue;
    var reach = radius + (barrel.r || 14);
    if (Math.hypot(barrel.x - x, barrel.y - y) <= reach) {
      barrel.chainFuse = 0.2;
      barrel.chainDepth = (depth || 1) + 1;
    }
  }
}

function noteBarrelChain(depth) {
  if (!(depth > 1) || !rt.state.stats) return;
  if (depth > (rt.state.stats.barrelChainMax || 0)) {
    rt.state.stats.barrelChainMax = depth;
    noteMetaEvent('barrel-chain', { count: depth });
  }
}

function rememberBarrels() {
  var list = rt.state.barrels || [];
  var snap = [];
  var i;
  for (i = 0; i < list.length; i += 1) {
    snap.push({ x: list[i].x, y: list[i].y, r: list[i].r || 14, ref: list[i] });
  }
  rt.state._barrelSnap = snap;
}

function detectChainedBarrels() {
  if (rt.state._barrelChainMute) {
    rt.state._barrelChainMute = 0;
    rememberBarrels();
    return;
  }
  var snap = rt.state._barrelSnap || [];
  var live = rt.state.barrels || [];
  var i;
  for (i = 0; i < snap.length; i += 1) {
    if (live.indexOf(snap[i].ref) === -1) armBarrelChain(snap[i].x, snap[i].y, 110, 1);
  }
}

export function stepHazards(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  detectChainedBarrels();
  // Core spawn check
  if (!rt.state.coreSpawned && rt.state.waveTime >= rt.state.coreSpawnTime) {
    rt.state.coreSpawned = true;
    var cMargin = 60;
    var cx = cMargin + rng('spawn') * (boundW - cMargin * 2);
    var cy = cMargin + rng('spawn') * (boundH - cMargin * 2);
    for (var cTry = 0; cTry < 10; cTry += 1) {
      if (Math.hypot(cx - p.x, cy - p.y) >= 140) break;
      cx = cMargin + rng('spawn') * (boundW - cMargin * 2);
      cy = cMargin + rng('spawn') * (boundH - cMargin * 2);
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
      if (bObj.chainFuse > 0) {
        bObj.chainFuse -= dt;
        if (bObj.chainFuse <= 0) {
          var chainDepth = bObj.chainDepth || 2;
          var chainX = bObj.x;
          var chainY = bObj.y;
          var chainR = bObj.r || 14;
          explodeBarrel(bObj, bai, true);
          noteBarrelChain(chainDepth);
          armBarrelChain(chainX, chainY, 125, chainDepth);
          continue;
        }
      }
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
            vx: Math.cos(backAng + (rng('combat') - 0.5) * 0.5) * (70 + rng('combat') * 50),
            vy: Math.sin(backAng + (rng('combat') - 0.5) * 0.5) * (70 + rng('combat') * 50),
            life: 0.15 + rng('combat') * 0.1,
            maxLife: 0.25,
            size: 2.2,
            color: rng('combat') < 0.5 ? '#ff4d2e' : '#f5a623',
            gravity: 0
          });
        }

        if (bObj.x <= bObj.r || bObj.x >= boundW - bObj.r || bObj.y <= bObj.r || bObj.y >= boundH - bObj.r) {
          var wallX = bObj.x;
          var wallY = bObj.y;
          explodeBarrel(bObj, bai, true);
          armBarrelChain(wallX, wallY, 125, 1);
          continue;
        }

        if (bObj.flyingTimer <= 0) {
          var fuseX = bObj.x;
          var fuseY = bObj.y;
          explodeBarrel(bObj, bai, true);
          armBarrelChain(fuseX, fuseY, 125, 1);
          continue;
        }

        var hitBig = false;
        if (!bObj.hitEnemies) bObj.hitEnemies = [];
        for (var ebi = rt.state.enemies.length - 1; ebi >= 0; ebi -= 1) {
          var tgtEnemy = rt.state.enemies[ebi];
          if (dist2(bObj.x, bObj.y, tgtEnemy.x, tgtEnemy.y) <= (bObj.r + tgtEnemy.r) * (bObj.r + tgtEnemy.r)) {
            var isHeavy = (tgtEnemy.kind === 'brute' || tgtEnemy.kind === 'elite' || tgtEnemy.isBoss || tgtEnemy.kind === 'titan');
            if (isHeavy) {
              hitBig = true;
              break;
            } else if (bObj.hitEnemies.indexOf(tgtEnemy) === -1) {
              bObj.hitEnemies.push(tgtEnemy);
              damageEnemy(tgtEnemy, 35, { source: 'barrel', x: bObj.x, y: bObj.y });
              var tkdx = tgtEnemy.x - bObj.x;
              var tkdy = tgtEnemy.y - bObj.y;
              var tkd = Math.hypot(tkdx, tkdy) || 1;
              tgtEnemy.x += (tkdx / tkd) * 35;
              tgtEnemy.y += (tkdy / tkd) * 35;
              spawnParticles(tgtEnemy.x, tgtEnemy.y, '#ff8833', 6, 120, 2);
              AudioFX.hit();
              if (tgtEnemy.hp <= 0) killEnemy(tgtEnemy, 'barrel');
            }
          }
        }

        if (hitBig) {
          var hitX = bObj.x;
          var hitY = bObj.y;
          explodeBarrel(bObj, bai, true);
          armBarrelChain(hitX, hitY, 125, 1);
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
        if (rng('combat') < 0.35 && rt.state.particles) {
          var sparkAng = rng('combat') * TAU;
          var sparkDist = rng('combat') * spObj.r * 1.5;
          rt.state.particles.push({
            x: spObj.x + Math.cos(sparkAng) * sparkDist,
            y: spObj.y + Math.sin(sparkAng) * sparkDist,
            vx: Math.cos(sparkAng) * (40 + rng('combat') * 50),
            vy: Math.sin(sparkAng) * (40 + rng('combat') * 50),
            life: 0.15 + rng('combat') * 0.1,
            maxLife: 0.25,
            size: 2,
            color: rng('combat') < 0.6 ? '#5be7ff' : '#ffffff',
            gravity: 0
          });
        }
      }
      spObj.pulseTimer = (spObj.pulseTimer || 0) + dt;
      if (spObj.resonanceTimer > 0.9) {
        if (!spObj.chainNoted && rt.state.contract && rt.state.contract.id === 'spire-chain' && !rt.state.contract.done) {
          spObj.chainNoted = true;
          var chainHits = 0;
          var chainEi;
          var chainEnemies = rt.state.enemies || [];
          for (chainEi = 0; chainEi < chainEnemies.length; chainEi += 1) {
            var chainEnemy = chainEnemies[chainEi];
            var chainReach = 260 + (chainEnemy.r || 0);
            if (dist2(spObj.x, spObj.y, chainEnemy.x, chainEnemy.y) <= chainReach * chainReach) chainHits += 1;
          }
          noteContractEvent('spire-chain', { hits: chainHits, x: spObj.x, y: spObj.y });
        }
      } else {
        spObj.chainNoted = false;
      }
      if (spObj.resonanceTimer <= 0 && rng('combat') < 0.04 && rt.state.particles) {
        var pSparkAng = rng('combat') * TAU;
        rt.state.particles.push({
          x: spObj.x + Math.cos(pSparkAng) * (spObj.r * 0.8),
          y: spObj.y + Math.sin(pSparkAng) * (spObj.r * 0.8),
          vx: (rng('combat') - 0.5) * 30,
          vy: (rng('combat') - 0.5) * 30,
          life: 0.12,
          maxLife: 0.12,
          size: 1.5,
          color: '#5be7ff',
          gravity: 0
        });
      }
    }
  }
  rememberBarrels();
}
