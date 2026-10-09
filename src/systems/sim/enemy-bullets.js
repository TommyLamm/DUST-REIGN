import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { addDecal, spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2 } from '../../core/utils.js';
import { triggerReactiveArmor } from '../abilities.js';
import { damagePlayer } from '../combat.js';
import { noteContractEvent } from '../contracts.js';
import { addScore } from '../scoring.js';
import { logEvent } from '../../ui/hud.js';

var EB_CAP = 260;

export function scaledShot(baseDamage, baseSpeed, eliteOrBoss) {
  var scale = 1;
  var recipe = rt.state && rt.state.recipe;
  var speedScale = 1;
  if (eliteOrBoss && recipe && typeof recipe.bulletScale === 'number' && recipe.bulletScale > 0) {
    scale = recipe.bulletScale;
  }
  if (eliteOrBoss && recipe && typeof recipe.bulletSpeedScale === 'number' && recipe.bulletSpeedScale > 0) {
    speedScale = recipe.bulletSpeedScale;
  }
  if (!eliteOrBoss) return { damage: baseDamage, speed: baseSpeed, scale: 1 };
  return {
    damage: Math.round(baseDamage * scale),
    speed: baseSpeed * (1 + (scale - 1) * 0.5) * speedScale,
    scale: scale
  };
}

export function pushEnemyBullet(bullet) {
  if (!rt.state.enemyBullets) rt.state.enemyBullets = [];
  var list = rt.state.enemyBullets;
  if (!bullet.type) bullet.type = 'basic';
  while (list.length >= EB_CAP) {
    var drop = -1;
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (!list[i].fromBoss) {
        drop = i;
        break;
      }
    }
    if (drop < 0) break;
    list.splice(drop, 1);
  }
  list.push(bullet);
}

function detonateAcid(eb) {
  if (!rt.state.acidPools) rt.state.acidPools = [];
  rt.state.acidPools.push({
    x: eb.targetX,
    y: eb.targetY,
    r: 38,
    timer: 3,
    maxTimer: 3,
    tick: 0
  });
  var p = rt.state.player;
  if (p && Math.hypot(p.x - eb.targetX, p.y - eb.targetY) <= 38 + p.r) {
    var hit = damagePlayer(eb.damage, 'acid');
    if (hit > 0) {
      p.invulnerable = 0.16;
      AudioFX.hurt();
      triggerHaptic([20]);
      rt.state.shake = Math.max(rt.state.shake, 5);
      rt.state.hurtFlash = 0.3;
      spawnParticles(p.x, p.y, '#c6e35a', 6, 90, 2);
      if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(eb.targetX, eb.targetY);
    }
  }
  spawnParticles(eb.targetX, eb.targetY, '#c6e35a', 10, 110, 2.5);
  addDecal(eb.targetX, eb.targetY, 16, 8, 0.35, '#3d4a18');
  pushFxEvent('burst', eb.targetX, eb.targetY, { preset: 'mortar', tint: '#c6e35a', scale: 0.55 });
  AudioFX.mortarImpact();
}

export function stepEnemyBullets(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  for (var ebi = rt.state.enemyBullets.length - 1; ebi >= 0; ebi -= 1) {
    var eb = rt.state.enemyBullets[ebi];
    if (eb.type === 'acid') {
      eb.age = (eb.age || 0) + dt;
      var flight = eb.flight > 0 ? eb.flight : 0.7;
      var u = eb.age / flight;
      if (u > 1) u = 1;
      var lift = Math.sin(u * Math.PI) * (eb.arc || 36);
      eb.x = eb.originX + (eb.targetX - eb.originX) * u;
      eb.y = eb.originY + (eb.targetY - eb.originY) * u - lift;
      if (eb.age >= flight) {
        detonateAcid(eb);
        rt.state.enemyBullets.splice(ebi, 1);
      }
      continue;
    }
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
        var bulletHit = damagePlayer(eb.damage, 'bullet');
        if (bulletHit > 0) {
          p.invulnerable = 0.5;
          AudioFX.hurt();
          triggerHaptic([45]);
          rt.state.shake = Math.max(rt.state.shake, 6);
          rt.state.hurtFlash = 0.45;
          spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
          if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(eb.x, eb.y);
        }
      }
    } else if (!eb.noGraze && eb.type !== 'acid' && ebDist <= (hitRadius + 18) && !eb.grazed) {
      eb.grazed = true;
      if (rt.state.stats) rt.state.stats.grazes += 1;
      addScore(15, 'graze');
      noteContractEvent('graze', { x: eb.x, y: eb.y });
      var grazeCap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
      p.energy = Math.min(grazeCap, (p.energy || 0) + 8.0);
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
        var ga = rng('combat') * TAU;
        var gv = 55 + rng('combat') * 55;
        rt.state.particles.push({
          x: eb.x,
          y: eb.y,
          vx: Math.cos(ga) * gv,
          vy: Math.sin(ga) * gv,
          life: 0.16 + rng('combat') * 0.14,
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
              var mortarHit = damagePlayer(mortarDmg, 'mortar');
              if (mortarHit > 0) {
                p.invulnerable = 0.45;
                AudioFX.hurt();
                triggerHaptic([45]);
                rt.state.shake = Math.max(rt.state.shake, 7);
                rt.state.hurtFlash = 0.45;
                spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
                if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(at.x, at.y);
              }
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
              var moltenHit = damagePlayer(5, 'molten');
              if (moltenHit > 0) {
                p.invulnerable = 0.2;
                AudioFX.hurt();
                triggerHaptic([15]);
                rt.state.shake = Math.max(rt.state.shake, 2.5);
                rt.state.hurtFlash = 0.25;
                spawnParticles(p.x, p.y, '#df6b4f', 4, 80, 2);
                if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(at.x, at.y);
              }
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
