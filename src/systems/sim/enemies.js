import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2, fastUnorderedRemove } from '../../core/utils.js';
import { enemyProfile } from '../../data/enemies.js';
import { triggerReactiveArmor } from '../abilities.js';
import { damageEnemy, damagePlayer, explodeBarrel, killEnemy } from '../combat.js';
import { triggerGameOver } from '../flow.js';
import { ensureScriptedBoss, fireArtillery } from '../spawning.js';
import { logEvent } from '../../ui/hud.js';
import { stepBoss, stepBossArena, stepTitanHarpoon, updateTitanPartCache } from './bosses.js';
import { clearEnemyShields, clearShieldsOwnedBy } from './enemy-defense.js';
import { pushEnemyBullet, scaledShot } from './enemy-bullets.js';
import { primeEnemy, stepEnemyHazards, stepNewEnemy, sweepDefeated } from './new-enemies.js';
import { getEnemyById, populateEnemyGrid, queryGridCallback } from '../../core/spatial-grid.js';

var repCurrentEnemy = null;
var repCurrentIdx = -1;
var repForceX = 0;
var repForceY = 0;

function repulseCallback(otherId) {
  if (otherId === repCurrentIdx) return;
  var other = getEnemyById(otherId);
  if (!other || other.hp <= 0 || other.burrowed) return;
  var rx = repCurrentEnemy.x - other.x;
  var ry = repCurrentEnemy.y - other.y;
  var rdist2 = rx * rx + ry * ry;
  if (rdist2 > 0 && rdist2 < 38 * 38) {
    var rdist = Math.sqrt(rdist2);
    var force = (1 - rdist / 38) * 420;
    repForceX += (rx / rdist) * force;
    repForceY += (ry / rdist) * force;
  }
}

function isFreshKind(kind) {
  return kind === 'spitter' || kind === 'scurrier' || kind === 'warden' || kind === 'burrower' || kind === 'mine' || kind === 'stormTower';
}

export function stepEnemies(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  stepBossArena(dt, frame);
  sweepDefeated();
  ensureScriptedBoss();
  populateEnemyGrid(rt.state.enemies);

  var cam = rt.state.camera;
  var cx = cam ? cam.x : p.x;
  var cy = cam ? cam.y : p.y;
  var vpW = cam ? (cam.viewW || cam.w || 960) : ((rt.ui && rt.ui.width) || boundW);
  var vpH = cam ? (cam.viewH || cam.h || 640) : ((rt.ui && rt.ui.height) || boundH);
  var zone3Dist = Math.hypot(vpW, vpH) * 0.5 * 1.85;

  for (var j = rt.state.enemies.length - 1; j >= 0; j -= 1) {
    var e = rt.state.enemies[j];
    if (!e || e.hp <= 0) continue;
    var isCulled = (e.x < -120 || e.x > boundW + 120 || e.y < -120 || e.y > boundH + 120);

    // Zone 3 check (> 1.85 x Viewport): silent cull normal mobs after 3s with token recycling; hyper-catchup (3.5x speed) for elite/boss after 2.5s until within 750px
    var distToCam = Math.hypot(e.x - cx, e.y - cy);
    if (distToCam > zone3Dist) {
      if (!e.isBoss && e.kind !== 'elite') {
        e.zone3Timer = (e.zone3Timer || 0) + dt;
        if (e.zone3Timer >= 3.0) {
          rt.state.recycledTokens = (rt.state.recycledTokens || 0) + 1;
          fastUnorderedRemove(rt.state.enemies, j);
          continue;
        }
      } else {
        e.zone3Timer = (e.zone3Timer || 0) + dt;
        if (e.zone3Timer >= 2.5) {
          e.hyperCatchup = true;
        }
      }
    } else {
      e.zone3Timer = 0;
      if (e.hyperCatchup && distToCam <= 750) {
        e.hyperCatchup = false;
      }
    }

    if (e.jitterTimer > 0) e.jitterTimer = Math.max(0, e.jitterTimer - dt);
    if (e.armorBreakTimer > 0) e.armorBreakTimer = Math.max(0, e.armorBreakTimer - dt);
    var dx = p.x - e.x;
    var dy = p.y - e.y;
    var d = Math.hypot(dx, dy) || 1;

    // +20% base mobility compensation, long-distance catchup (>550px: x1.35), hyper-catchup (x3.5), Wolf Pack surge (x1.15)
    var speed = e.speed * 1.20 * (e.kind === 'rusher' ? 1 + Math.sin(rt.state.waveTime * 5 + e.phase) * 0.08 : e.kind === 'elite' ? 1 + Math.sin(rt.state.waveTime * 3 + e.phase) * 0.12 : 1);
    if (d > 550) speed *= 1.35;
    if (e.hyperCatchup) speed *= 3.5;
    if (rt.state.wolfPackSurge && (e.kind === 'crawler' || e.kind === 'rusher')) speed *= 1.15;

    if (e.commandBuffTimer > 0) {
      e.commandBuffTimer -= dt;
      if (e.kind !== 'scurrier') speed *= 1.4;
    }
    if (e.empTimer > 0 && (e.shieldHp > 0 || e.shieldTimer > 0)) clearEnemyShields(e);
    if (e.shieldTimer > 0) {
      e.shieldTimer -= dt;
      if (e.shieldTimer <= 0 || !(e.shieldHp > 0)) clearEnemyShields(e);
      else e.knockbackImmune = true;
    }

    var empFrozen = false;
    if (e.empTimer > 0) {
      e.empTimer -= dt;
      speed *= 0.3;
      empFrozen = true;
      if (e.kind === 'warden') clearShieldsOwnedBy(e);
      if (rng('combat') < 0.25) {
        spawnParticles(e.x, e.y, '#5be7ff', 2, 70, 1.8);
      }
    }

    var skipMove = false;
    if (e.kind === 'rusher') {
      if (e.burstCd === undefined) { e.burstCd = 1.5 + rng('spawn') * 1.0; e.burstTime = 0; }
      if (!empFrozen && !isCulled) {
        if (e.burstTime > 0) {
          e.burstTime -= dt;
          speed = e.speed * 1.55 * 1.20;
          if (e.burstAngle !== undefined) {
            dx = Math.cos(e.burstAngle);
            dy = Math.sin(e.burstAngle);
            d = 1;
          }
          if (e.burstTime <= 0) {
            e.burstCd = 2.4;
          }
        } else if (e.burstCd > 0) {
          e.burstCd -= dt;
          if (e.burstCd <= 0.30 && e.burstCd > 0) {
            speed = e.speed * 0.25;
            e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
          } else if (e.burstCd > 0.30) {
            var pvx = p.vx || 0;
            var pvy = p.vy || 0;
            var pSpd = Math.hypot(pvx, pvy);
            var flankSide = e.flankSide || 1;
            var targetX, targetY;
            if (pSpd > 15) {
              var nx = -pvy / pSpd;
              var ny = pvx / pSpd;
              targetX = p.x + pvx * 0.8 + flankSide * nx * 130;
              targetY = p.y + pvy * 0.8 + flankSide * ny * 130;
            } else {
              var baseAng = Math.atan2(e.y - p.y, e.x - p.x);
              targetX = p.x + Math.cos(baseAng + flankSide * 0.6) * 120;
              targetY = p.y + Math.sin(baseAng + flankSide * 0.6) * 120;
            }
            dx = targetX - e.x;
            dy = targetY - e.y;
            d = Math.hypot(dx, dy) || 1;
          }
          if (e.burstCd <= 0) {
            e.burstTime = 0.30;
            e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
            speed = e.speed * 1.55 * 1.20;
            dx = Math.cos(e.burstAngle);
            dy = Math.sin(e.burstAngle);
            d = 1;
          }
        }
      }
    } else if (e.kind === 'crawler' && rt.state.wolfPackSurge && !empFrozen && !isCulled) {
      var slotAngle = (e.phase || 0) + rt.state.waveTime * 0.6;
      var slotX = p.x + Math.cos(slotAngle) * 80;
      var slotY = p.y + Math.sin(slotAngle) * 80;
      var distToSlot = Math.hypot(slotX - e.x, slotY - e.y);
      if (distToSlot > 20) {
        dx = slotX - e.x;
        dy = slotY - e.y;
        d = distToSlot;
      }
    } else if (e.kind === 'artillery') {
      var distToP = d;
      e.barrelAngle = Math.atan2(p.y - e.y, p.x - e.x);
      if (isCulled) {
        speed = e.speed;
      } else {
        e.timeAlive = (e.timeAlive || 0) + dt;
        if (!e.deployed) {
          if ((distToP >= 180 && distToP <= 340) || e.timeAlive > 4) {
            e.deployed = true;
            e.siegeTimer = 0.9;
            e.cooldown = 0;
            speed = 0;
          }
        } else {
          speed = 0;
          if (!empFrozen) {
            if (e.siegeTimer > 0) {
              e.siegeTimer -= dt;
              if (e.siegeTimer <= 0) {
                fireArtillery(e);
                e.cooldown = 3.8;
              }
            } else if (e.cooldown > 0) {
              e.cooldown -= dt;
              if (e.cooldown <= 0) {
                fireArtillery(e);
                e.cooldown = 3.8;
              }
            }
          }
        }
      }
    } else if (isFreshKind(e.kind)) {
      var motion = stepNewEnemy(e, dt, frame, empFrozen);
      if (motion) {
        dx = motion.dx;
        dy = motion.dy;
        d = motion.d || 1;
        speed = motion.speed;
      }
    } else if (e.isBoss && e.kind !== 'titan') {
      var bossMotion = stepBoss(e, dt, frame, empFrozen);
      if (bossMotion) {
        if (bossMotion.handled) {
          skipMove = true;
          e.vx = bossMotion.vx || 0;
          e.vy = bossMotion.vy || 0;
        } else {
          dx = bossMotion.dx;
          dy = bossMotion.dy;
          d = bossMotion.d || 1;
          speed = bossMotion.speed;
        }
      }
    }

    if (!skipMove) {
      e.vx = speed > 0 ? (dx / d) * speed : 0;
      e.vy = speed > 0 ? (dy / d) * speed : 0;

      // 55px Spatial Hash Grid 0-GC local repulsion separation (K_repulsion = 420, d <= 38px)
      if (!e.isBoss && !empFrozen && e.kind !== 'mine' && e.kind !== 'stormTower' && !e.burrowed) {
        repCurrentEnemy = e;
        repCurrentIdx = j;
        repForceX = 0;
        repForceY = 0;
        queryGridCallback(e.x, e.y, 38, repulseCallback);
        var repLen = Math.hypot(repForceX, repForceY);
        if (repLen > 350) {
          repForceX = (repForceX / repLen) * 350;
          repForceY = (repForceY / repLen) * 350;
        }
        e.vx += repForceX;
        e.vy += repForceY;
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    e.touchCooldown = Math.max(0, e.touchCooldown - dt);

    if (e.burnStacks > 0) {
      e.burnTimer = (e.burnTimer || 3.0) - dt;
      e.burnTick = (e.burnTick || 0) + dt;
      if (e.burnTick >= 0.5) {
        e.burnTick = 0;
        damageEnemy(e, e.burnStacks * 12, { source: 'burn', x: e.x, y: e.y });
        spawnParticles(e.x, e.y, '#ff4d2e', 3, 60, 1.5);
        if (e.hp <= 0) { killEnemy(e, 'burn'); continue; }
      }
      if (e.burnTimer <= 0) e.burnStacks = 0;
    }

    if (e.kind === 'elite') {
      if (e.affix === 'mirror' || e.affix2 === 'mirror') {
        e.shieldAngle = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.shieldBrokenTimer > 0) {
          e.shieldBrokenTimer = Math.max(0, e.shieldBrokenTimer - dt);
        }
      }
      if (e.affix === 'command' || e.affix2 === 'command') {
        if (!empFrozen) {
          e.commandTimer = (e.commandTimer !== undefined ? e.commandTimer : 2.5) - dt;
          if (e.commandTimer <= 0) {
            e.commandTimer = 2.5;
            rt.state.shockRings.push({
              x: e.x,
              y: e.y,
              r: 8,
              maxR: 150,
              life: 0.45,
              maxLife: 0.45,
              color: '#e69535'
            });
            spawnParticles(e.x, e.y, '#f59e0b', 12, 140, 2.5);
            var cmdR2 = 150 * 150;
            for (var ci = 0; ci < rt.state.enemies.length; ci += 1) {
              var ce = rt.state.enemies[ci];
              if (ce.kind === 'crawler' || ce.kind === 'rusher') {
                if (dist2(e.x, e.y, ce.x, ce.y) <= cmdR2) {
                  ce.commandBuffTimer = 2.5;
                  spawnParticles(ce.x, ce.y, '#e69535', 4, 80, 2);
                }
              }
            }
          }
        }
      }
      if (e.affix === 'blink' || e.affix2 === 'blink') {
        if (!empFrozen) {
          e.blinkTimer = (e.blinkTimer !== undefined ? e.blinkTimer : 3.2) - dt;
          e.blinkTelegraph = (e.blinkTimer <= 0.3 && e.blinkTimer > 0);
          if (e.blinkTimer <= 0) {
            e.blinkTimer = 3.2;
            e.blinkTelegraph = false;
            var flankSide = rng('combat') < 0.5 ? 1 : -1;
            var flankAngle = (p.aim !== undefined ? p.aim : 0) + flankSide * (Math.PI / 2);
            var oldX = e.x;
            var oldY = e.y;
            e.x = clamp(p.x + Math.cos(flankAngle) * 110, e.r, boundW - e.r);
            e.y = clamp(p.y + Math.sin(flankAngle) * 110, e.r, boundH - e.r);
            spawnParticles(oldX, oldY, '#75d1b0', 10, 140, 2.5);
            spawnParticles(oldX, oldY, '#ffffff', 8, 110, 2);
            spawnParticles(e.x, e.y, '#75d1b0', 12, 160, 3);
            spawnParticles(e.x, e.y, '#ffffff', 8, 130, 2);
            AudioFX.dash();
          }
        }
      }

      if (!empFrozen && !isCulled) {
        e.shootCd = (e.shootCd || 3.5) - dt;
        if (e.shootCd <= 0) {
          e.shootCd = 3.5;
          var baseAngle = Math.atan2(p.y - e.y, p.x - e.x);
          var spread = [-0.26, 0, 0.26];
          for (var si = 0; si < spread.length; si += 1) {
            var sa = baseAngle + spread[si];
            var eliteShot = scaledShot(14, 115, true);
            pushEnemyBullet({
              type: 'basic',
              x: e.x + Math.cos(sa) * (e.r + 4),
              y: e.y + Math.sin(sa) * (e.r + 4),
              vx: Math.cos(sa) * eliteShot.speed,
              vy: Math.sin(sa) * eliteShot.speed,
              r: 3.5,
              damage: eliteShot.damage,
              life: 6,
              color: '#75d1b0',
              glowColor: '#7cf0c8'
            });
          }
          spawnParticles(e.x, e.y, '#75d1b0', 5, 80, 2);
        }
      }

      if (!e.ringTriggered && !isCulled && e.hp < e.maxHp * 0.5) {
        e.ringTriggered = true;
        var rdx = p.x - e.x;
        var rdy = p.y - e.y;
        var edpDist2 = rdx * rdx + rdy * rdy;
        if (edpDist2 <= 120 * 120) {
          var edpDist = Math.sqrt(edpDist2) || 1;
          var pushX = (rdx / edpDist) * 15;
          var pushY = (rdy / edpDist) * 15;
          p.x = clamp(p.x + pushX, p.r, boundW - p.r);
          p.y = clamp(p.y + pushY, p.r, boundH - p.r);
          p.slowTimer = Math.max(p.slowTimer || 0, 0.5);
        }
        rt.state.shockRings.push({ x: e.x, y: e.y, r: 8, maxR: 120, life: 0.35, maxLife: 0.35, color: '#75d1b0' });
        rt.state.shake = Math.max(rt.state.shake, 5);
        spawnParticles(e.x, e.y, '#75d1b0', 12, 160, 3);
        AudioFX.dash();
      }
    }

    if (e.kind === 'titan') {
      updateTitanPartCache(e, p);
      if (e.partCache) e.partCache._frameTime = rt.state.waveTime;
      if (e.treadDestroyed) {
        e.speed = (e.baseSpeed || 50) * 0.6;
      }
      if (e.radiatorExposeTimer > 0) {
        e.radiatorExposeTimer -= dt;
        if (e.radiatorExposeTimer <= 0) {
          e.radiatorExposed = false;
        }
      }

      // Titan crushing: explode barrels within (e.r + b.r + 15)
      if (rt.state.barrels && rt.state.barrels.length) {
        for (var bi = rt.state.barrels.length - 1; bi >= 0; bi -= 1) {
          var b = rt.state.barrels[bi];
          var crushDist = (e.r || 40) + (b.r || 14) + 15;
          if (dist2(e.x, e.y, b.x, b.y) <= crushDist * crushDist) {
            explodeBarrel(b, bi, false);
          }
        }
      }

      // Drop 6s molten lava footprint every 0.45s
      e.treadLavaTimer = (e.treadLavaTimer || 0.45) - dt;
      if (e.treadLavaTimer <= 0) {
        e.treadLavaTimer = 0.45;
        if (!rt.state.artilleryTargets) rt.state.artilleryTargets = [];
        rt.state.artilleryTargets.push({
          x: e.x,
          y: e.y,
          r: 28,
          timer: 6.0,
          maxTimer: 6.0,
          wave: rt.state.wave || 1,
          state: 'molten',
          damageTickTimer: 0
        });
      }

      // Titan Harpoon (triggers if distance > 750px)
      stepTitanHarpoon(e, dt, frame);

      if (!empFrozen && !e.leftCannonDestroyed) {
        e.shootCd = (e.shootCd || 2.8) - dt;
        if (e.shootCd <= 0) {
          e.shootCd = 2.8;
          var tBaseAngle = Math.atan2(p.y - e.y, p.x - e.x);
          var twinOffsets = [-0.14, 0.14];
          for (var tii = 0; tii < twinOffsets.length; tii += 1) {
            var ta = tBaseAngle + twinOffsets[tii];
            var twin = scaledShot(18, 140, true);
            pushEnemyBullet({
              type: 'basic',
              fromBoss: true,
              x: e.x + Math.cos(ta) * (e.r + 8),
              y: e.y + Math.sin(ta) * (e.r + 8),
              vx: Math.cos(ta) * twin.speed,
              vy: Math.sin(ta) * twin.speed,
              r: 5.5,
              damage: twin.damage,
              life: 7,
              glow: true,
              color: '#ff5533',
              glowColor: '#ff3b1a'
            });
          }
          spawnParticles(e.x, e.y, '#ff5533', 8, 120, 3);
          AudioFX.mortarLaunch();
        }
      }

      var phaseEarly = 0;
      if (rt.state.recipe && typeof rt.state.recipe.bossPhaseEarly === 'number') phaseEarly = rt.state.recipe.bossPhaseEarly;
      if (phaseEarly < 0) phaseEarly = 0;
      if (phaseEarly > 0.4) phaseEarly = 0.4;
      if (!e.phase2Triggered && e.hp <= e.maxHp * (0.5 + phaseEarly)) {
        e.phase2Triggered = true;
        rt.state.banner = 3.5;
        rt.state.bannerText = 'TITAN ENRAGED // BARRAGE PROTOCOL';
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN ENRAGED // BARRAGE PROTOCOL';
        logEvent('TITAN ENRAGED // BARRAGE PROTOCOL');
        rt.state.shake = Math.max(rt.state.shake, 14);
        triggerHaptic([50, 40, 80, 40, 100]);
        AudioFX.blast();
        AudioFX.stormSiren();

        var tdx = p.x - e.x;
        var tdy = p.y - e.y;
        var tpDist2 = tdx * tdx + tdy * tdy;
        if (tpDist2 <= 180 * 180) {
          var tpDist = Math.sqrt(tpDist2) || 1;
          p.x = clamp(p.x + (tdx / tpDist) * 30, p.r, boundW - p.r);
          p.y = clamp(p.y + (tdy / tpDist) * 30, p.r, boundH - p.r);
          p.slowTimer = Math.max(p.slowTimer || 0, 0.6);
        }
        rt.state.shockRings.push({
          x: e.x,
          y: e.y,
          r: 14,
          maxR: 180,
          life: 0.45,
          maxLife: 0.45,
          color: '#ff4d2e'
        });
        spawnParticles(e.x, e.y, '#ff4d2e', 24, 220, 4);
        spawnParticles(e.x, e.y, '#ffd27d', 16, 170, 3);
        pushFxEvent('titanPhase', e.x, e.y, null);
      }

      if (e.phase2Triggered && !empFrozen) {
        e.spiralCd = (e.spiralCd || 3.2) - dt;
        if (e.spiralCd <= 0) {
          e.spiralCd = 3.2;
          e.spiralAngle = (e.spiralAngle || 0) + 0.38;
          if (!e.radiatorDestroyed) {
            e.radiatorExposed = true;
            e.radiatorExposeTimer = 3.2;
            spawnParticles(e.x, e.y, '#ffd27d', 10, 120, 2.5);
          }
          for (var spi = 0; spi < 8; spi += 1) {
            var sAng = e.spiralAngle + (spi * TAU / 8);
            var spiral = scaledShot(16, 130, true);
            pushEnemyBullet({
              type: 'spiral',
              fromBoss: true,
              x: e.x + Math.cos(sAng) * (e.r + 6),
              y: e.y + Math.sin(sAng) * (e.r + 6),
              vx: Math.cos(sAng) * spiral.speed,
              vy: Math.sin(sAng) * spiral.speed,
              r: 4.5,
              damage: spiral.damage,
              life: 6.5,
              glow: true,
              color: '#ff7733',
              glowColor: '#ff4d2e'
            });
          }
          spawnParticles(e.x, e.y, '#ff7733', 12, 140, 3);
          AudioFX.shoot();
        }

        if (!e.rightPodDestroyed) {
          e.summonCd = (e.summonCd || 6.0) - dt;
          if (e.summonCd <= 0) {
            e.summonCd = 6.0;
            for (var smi = 0; smi < 2; smi += 1) {
              var smOffset = smi === 0 ? -40 : 40;
              var summoned = enemyProfile('rusher', rt.state.wave, rt.state.recipe);
              rt.state.enemies.push({
                kind: 'rusher',
                x: clamp(e.x + smOffset, 24, boundW - 24),
                y: clamp(e.y + (rng('spawn') - 0.5) * 30, 24, boundH - 24),
                r: summoned.r,
                hp: summoned.hp,
                maxHp: summoned.maxHp,
                speed: summoned.speed,
                damage: summoned.damage,
                color: summoned.color,
                touchCooldown: 0,
                phase: rng('spawn') * TAU,
                burstCd: 1.2,
                burstTime: 0,
                burstAngle: 0,
                trail: []
              });
              spawnParticles(e.x + smOffset, e.y, '#e1a644', 8, 120, 2.5);
            }
            AudioFX.levelUp();
          }
        }
      }
    }

    var tdx = p.x - e.x;
    var tdy = p.y - e.y;
    var touchR = (p.r || 16) + (e.r || 12);
    var touchD2 = tdx * tdx + tdy * tdy;
    if (!isCulled && !e.burrowed && e.kind !== 'mine' && e.kind !== 'stormTower' && e.kind !== 'scurrier' && touchD2 <= touchR * touchR && e.touchCooldown <= 0 && p.invulnerable <= 0) {
      var touched = damagePlayer(e.damage, 'contact');
      e.touchCooldown = 0.85;
      if (touched > 0) {
        p.invulnerable = 0.7;
        AudioFX.hurt();
        triggerHaptic([45]);
        rt.state.shake = Math.max(rt.state.shake, 10);
        rt.state.hurtFlash = 0.55;
        spawnParticles(p.x, p.y, '#df6b4f', 10, 160, 3);
        if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(e.x, e.y);
      }
    }
  }
  sweepDefeated();
  populateEnemyGrid(rt.state.enemies);
  stepEnemyHazards(dt, frame);
  sweepDefeated();
  if (p.hp <= 0 && !rt.state.over) triggerGameOver();
}

export function decorateSpawn(kind, e) {
  primeEnemy(kind, e);
}
