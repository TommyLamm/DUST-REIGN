import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { addDecal, spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2 } from '../../core/utils.js';
import { triggerReactiveArmor } from '../abilities.js';
import { isStormFront, triggerGameOver } from '../flow.js';
import { logEvent } from '../../ui/hud.js';

export function stepEnemyBullets(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  for (var ebi = rt.state.enemyBullets.length - 1; ebi >= 0; ebi -= 1) {
    var eb = rt.state.enemyBullets[ebi];
    if (p.gravitonBulwark && !eb.gravitonSlowed) {
      var bulwarkR = Math.max(180, p.magnetRadius || 180);
      if (dist2(eb.x, eb.y, p.x, p.y) <= bulwarkR * bulwarkR) {
        eb.vx *= 0.65;
        eb.vy *= 0.65;
        eb.gravitonSlowed = true;
        spawnParticles(eb.x, eb.y, '#9d4edd', 2, 40, 1.5);
      }
    }
    eb.x += eb.vx * dt;
    eb.y += eb.vy * dt;
    eb.life -= dt;
    var ebDist2 = dist2(eb.x, eb.y, p.x, p.y);
    var hitPlayer = false;
    var ebDist = Math.sqrt(ebDist2);
    var hitRadius = p.r + eb.r;
    if (ebDist <= hitRadius) {
      hitPlayer = true;
      if (p.invulnerable <= 0) {
        p.hp -= eb.damage;
        p.invulnerable = 0.5;
        AudioFX.hurt();
        triggerHaptic([45]);
        rt.state.shake = Math.max(rt.state.shake, 6);
        rt.state.hurtFlash = 0.45;
        pushFxEvent('playerHit', p.x, p.y, null);
        spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
        if (isStormFront()) rt.state.stormHurt = true;
        if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(eb.x, eb.y);
        if (p.hp <= 0) triggerGameOver();
      }
    } else if (ebDist <= (hitRadius + 18) && !eb.grazed) {
      eb.grazed = true;
      if (rt.state.stats) rt.state.stats.grazes += 1;
      rt.state.score += 15;
      p.energy = Math.min(p.maxEnergy, (p.energy || 0) + 8.0);
      rt.state.grazeCombo = (rt.state.grazeCombo || 0) + 1;
      rt.state.grazeTimer = 2.5;
      if (rt.state.grazeCombo >= 5) {
        rt.state.grazeCombo = 0;
        p.overdrive = Math.max(p.overdrive, 1.2);
        AudioFX.pickup('overdrive');
        logEvent('GRAZE SURGE // MICRO-OVERCLOCK READY');
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'GRAZE SURGE // MICRO-OVERCLOCK READY';
        spawnParticles(p.x, p.y, '#f0cf88', 12, 160, 2.5);
      }
      for (var gi = 0; gi < 4; gi += 1) {
        var ga = Math.random() * TAU;
        var gv = 55 + Math.random() * 55;
        rt.state.particles.push({
          x: eb.x,
          y: eb.y,
          vx: Math.cos(ga) * gv,
          vy: Math.sin(ga) * gv,
          life: 0.16 + Math.random() * 0.14,
          maxLife: 0.3,
          size: 2,
          color: '#fbda8a',
          gravity: 10
        });
      }
      AudioFX.graze();
      pushFxEvent('graze', eb.x, eb.y, { px: p.x, py: p.y });
    }
    if (hitPlayer || eb.life <= 0 || eb.x < -40 || eb.y < -40 || eb.x > boundW + 40 || eb.y > boundH + 40) {
      rt.state.enemyBullets.splice(ebi, 1);
    }
  }
}

export function stepArtilleryTargets(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  if (rt.state.artilleryTargets) {
    for (var ati = rt.state.artilleryTargets.length - 1; ati >= 0; ati -= 1) {
      var at = rt.state.artilleryTargets[ati];
      at.timer -= dt;
      if (at.state === 'warning') {
        if (at.timer <= 0) {
          at.state = 'molten';
          at.timer = 2.0;
          at.maxTimer = 2.0;
          at.damageTickTimer = 0;
          AudioFX.mortarImpact();
          rt.state.shake = Math.max(rt.state.shake, 8);
          rt.state.shockRings.push({
            x: at.x,
            y: at.y,
            r: 8,
            maxR: at.r,
            life: 0.25,
            maxLife: 0.25,
            color: '#ed6842'
          });
          spawnParticles(at.x, at.y, '#f5a623', 18, 180, 3);
          spawnParticles(at.x, at.y, '#df4028', 12, 140, 3);
          addDecal(at.x, at.y, at.r * 0.85, 14, 0.42, '#1b1715');
          pushFxEvent('mortar', at.x, at.y, { r: at.r });

          var pMortarDist = Math.hypot(p.x - at.x, p.y - at.y);
          if (pMortarDist <= (at.r + p.r)) {
            var mkdx = p.x - at.x;
            var mkdy = p.y - at.y;
            var mkd = Math.hypot(mkdx, mkdy) || 1;
            p.x = clamp(p.x + (mkdx / mkd) * 15, p.r, boundW - p.r);
            p.y = clamp(p.y + (mkdy / mkd) * 15, p.r, boundH - p.r);

            if (p.invulnerable <= 0) {
              var mortarDmg = Math.round(24 + at.wave * 1.4);
              p.hp -= mortarDmg;
              p.invulnerable = 0.45;
              AudioFX.hurt();
              triggerHaptic([45]);
              rt.state.shake = Math.max(rt.state.shake, 7);
              rt.state.hurtFlash = 0.45;
              pushFxEvent('playerHit', p.x, p.y, null);
              spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
              if (isStormFront()) rt.state.stormHurt = true;
              if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(at.x, at.y);
              if (p.hp <= 0) triggerGameOver();
            }
          }
        }
      } else if (at.state === 'molten') {
        var pMoltenDist = Math.hypot(p.x - at.x, p.y - at.y);
        if (pMoltenDist <= (at.r + p.r)) {
          at.damageTickTimer += dt;
          if (at.damageTickTimer >= 0.5) {
            at.damageTickTimer -= 0.5;
            if (p.invulnerable <= 0) {
              p.hp -= 5;
              p.invulnerable = 0.2;
              AudioFX.hurt();
              triggerHaptic([15]);
              rt.state.shake = Math.max(rt.state.shake, 2.5);
              rt.state.hurtFlash = 0.25;
              pushFxEvent('playerHit', p.x, p.y, { light: 1 });
              spawnParticles(p.x, p.y, '#df6b4f', 4, 80, 2);
              if (isStormFront()) rt.state.stormHurt = true;
              if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(at.x, at.y);
              if (p.hp <= 0) triggerGameOver();
            }
          }
        } else {
          at.damageTickTimer = 0;
        }
        if (at.timer <= 0) {
          rt.state.artilleryTargets.splice(ati, 1);
        }
      }
    }
  }
}
