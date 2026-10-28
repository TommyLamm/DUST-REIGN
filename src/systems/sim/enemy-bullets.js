import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { addDecal, spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2, fastUnorderedRemove } from '../../core/utils.js';
import { triggerReactiveArmor } from '../abilities.js';
import { damageEnemy, damagePlayer, killEnemy } from '../combat.js';
import { noteContractEvent } from '../contracts.js';
import { addScore } from '../scoring.js';
import { logEvent, setStatusText } from '../../ui/hud.js';
import { spawnCombatText } from '../../render/fx.js';
import { spawnVisualBolt } from '../../render/projectiles.js';

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
    var drop = list.findIndex(function (b) { return !b.fromBoss; });
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
    timer: 2.4,
    maxTimer: 2.4,
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
        fastUnorderedRemove(rt.state.enemyBullets, ebi);
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
    var isSCombo = rt.state && (rt.state.combo || 0) >= 23;
    var grazeReach = hitRadius + 18 * (typeof p.grazeRadiusMult === 'number' ? p.grazeRadiusMult : 1) + (isSCombo ? 4 : 0);
    if (p.aegisDeployed && ebDist <= (hitRadius + 18)) {
      var ebAngle = Math.atan2(eb.y - p.y, eb.x - p.x);
      var angleDiff = Math.abs(Math.atan2(Math.sin(ebAngle - (p.aim || 0)), Math.cos(ebAngle - (p.aim || 0))));
      if (angleDiff <= (80 * Math.PI / 180)) {
        var refAng = (p.aim || 0) + (rng('combat') - 0.5) * 0.12;
        var refSpd = Math.max(520, Math.hypot(eb.vx, eb.vy) * 1.25);
        if (!rt.state.bullets) rt.state.bullets = [];
        rt.state.bullets.push({
          x: eb.x,
          y: eb.y,
          vx: Math.cos(refAng) * refSpd,
          vy: Math.sin(refAng) * refSpd,
          r: 4.0,
          damage: (eb.damage || 15) * 2.0,
          pierce: 1,
          bounces: 0,
          life: 1.2,
          colorCore: '#5be7ff',
          trail: [],
          reflected: true
        });
        spawnParticles(eb.x, eb.y, '#5be7ff', 8, 120, 2);
        if (AudioFX && typeof AudioFX.shoot === 'function') AudioFX.shoot();
        spawnCombatText(eb.x, eb.y - 10, 'AEGIS REFLECT 2X', true);
        fastUnorderedRemove(rt.state.enemyBullets, ebi);
        continue;
      }
    }
    if (ebDist <= hitRadius) {
      hitPlayer = true;
      if (p.invulnerable <= 0) {
        var bulletSrc = 'bullet';
        if (eb.fromBoss) {
          // Prefer owner so dread flak cannot be mistaken for a Sovereign lethal.
          bulletSrc = 'boss:' + (eb.ownerKind || eb.type || 'shot');
        } else if (eb.ownerKind) bulletSrc = 'bullet:' + eb.ownerKind;
        var bulletHit = damagePlayer(eb.damage, bulletSrc, eb.x, eb.y);
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
    } else if (!eb.noGraze && eb.type !== 'acid' && ebDist <= grazeReach && !eb.grazed) {
      eb.grazed = true;
      if (rt.state.stats) rt.state.stats.grazes += 1;
      addScore(isSCombo ? 30 : 15, 'graze');
      noteContractEvent('graze', { x: eb.x, y: eb.y });
      if (p.grazeKineticCharge) {
        p.kineticCharges = Math.min(10, (p.kineticCharges || 0) + 1);
      }
      var grazeCap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
      p.energy = Math.min(grazeCap, (p.energy || 0) + 8.0);
      rt.state.grazeCombo = (rt.state.grazeCombo || 0) + 1;
      rt.state.grazeTimer = 2.5;
      if (rt.state && (rt.state.combo || 0) > 0) {
        rt.state.comboTimer = Math.min(4.0, (rt.state.comboTimer || 0) + 0.6);
      }
      var pEbDist = Math.hypot(eb.x - p.x, eb.y - p.y) || 1;
      var edgeX = p.x + ((eb.x - p.x) / pEbDist) * (p.r || 16);
      var edgeY = p.y + ((eb.y - p.y) / pEbDist) * (p.r || 16);
      if (typeof spawnVisualBolt === 'function') {
        spawnVisualBolt(edgeX, edgeY, eb.x, eb.y, 0.12, '#ffd700');
      }
      if (rt.state.grazeCombo >= 5) {
        rt.state.grazeCombo = 0;
        p.overdrive = Math.max(p.overdrive, 1.2);
        AudioFX.pickup('overdrive');
        logEvent('GRAZE SURGE // MICRO-OVERCLOCK READY');
        setStatusText('GRAZE SURGE // MICRO-OVERCLOCK READY');
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
      fastUnorderedRemove(rt.state.enemyBullets, ebi);
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

          // Mortar friendly fire to enemy swarms
          if (rt.state.enemies) {
            for (var mei = rt.state.enemies.length - 1; mei >= 0; mei -= 1) {
              var mFoe = rt.state.enemies[mei];
              if (!mFoe || mFoe.hp <= 0 || mFoe.burrowed) continue;
              if (dist2(at.x, at.y, mFoe.x, mFoe.y) <= (at.r + mFoe.r) * (at.r + mFoe.r)) {
                var mFoeDmg = Math.round(55 + (at.wave || 1) * 1.8);
                damageEnemy(mFoe, mFoeDmg, { source: 'mortar', x: at.x, y: at.y });
                var mdx = mFoe.x - at.x;
                var mdy = mFoe.y - at.y;
                var md = Math.hypot(mdx, mdy) || 1;
                mFoe.x += (mdx / md) * 30;
                mFoe.y += (mdy / md) * 30;
                spawnParticles(mFoe.x, mFoe.y, '#ed6842', 6, 120, 2);
                if (mFoe.hp <= 0) killEnemy(mFoe, 'mortar');
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

        // Molten burn friendly fire
        if (rt.state.enemies && at.damageTickTimer >= 0.5) {
          for (var fmi = rt.state.enemies.length - 1; fmi >= 0; fmi -= 1) {
            var moltenFoe = rt.state.enemies[fmi];
            if (!moltenFoe || moltenFoe.hp <= 0 || moltenFoe.burrowed) continue;
            if (dist2(at.x, at.y, moltenFoe.x, moltenFoe.y) <= (at.r + moltenFoe.r) * (at.r + moltenFoe.r)) {
              damageEnemy(moltenFoe, 15, { source: 'molten', x: at.x, y: at.y });
              spawnParticles(moltenFoe.x, moltenFoe.y, '#df4028', 3, 70, 1.8);
              if (moltenFoe.hp <= 0) killEnemy(moltenFoe, 'molten');
            }
          }
        }
        if (at.timer <= 0) {
          fastUnorderedRemove(rt.state.artilleryTargets, ati);
        }
      }
    }
  }
}
