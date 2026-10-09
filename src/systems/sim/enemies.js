import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2 } from '../../core/utils.js';
import { triggerReactiveArmor } from '../abilities.js';
import { isStormFront, triggerGameOver } from '../flow.js';
import { fireArtillery } from '../spawning.js';
import { logEvent } from '../../ui/hud.js';

export function stepEnemies(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  for (var j = rt.state.enemies.length - 1; j >= 0; j -= 1) {
    var e = rt.state.enemies[j];
    var dx = p.x - e.x;
    var dy = p.y - e.y;
    var d = Math.hypot(dx, dy) || 1;
    var speed = e.speed * (e.kind === 'rusher' ? 1 + Math.sin(rt.state.waveTime * 5 + e.phase) * 0.08 : e.kind === 'elite' ? 1 + Math.sin(rt.state.waveTime * 3 + e.phase) * 0.12 : 1);
    if (e.commandBuffTimer > 0) {
      e.commandBuffTimer -= dt;
      speed *= 1.4;
    }

    var empFrozen = false;
    if (e.empTimer > 0) {
      e.empTimer -= dt;
      speed *= 0.3;
      empFrozen = true;
      if (Math.random() < 0.25) {
        spawnParticles(e.x, e.y, '#5be7ff', 2, 70, 1.8);
      }
    }

    if (e.kind === 'rusher') {
      if (e.burstCd === undefined) { e.burstCd = 1.5 + Math.random() * 1.0; e.burstTime = 0; }
      if (!empFrozen) {
        if (e.burstTime > 0) {
          e.burstTime -= dt;
          speed = e.speed * 1.55;
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
          if (e.burstCd <= 0.35 && e.burstCd > 0) {
            speed = e.speed * 0.25;
            e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
          }
          if (e.burstCd <= 0) {
            e.burstTime = 0.35;
            e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
            speed = e.speed * 1.55;
            dx = Math.cos(e.burstAngle);
            dy = Math.sin(e.burstAngle);
            d = 1;
          }
        }
      }
    } else if (e.kind === 'artillery') {
      e.timeAlive = (e.timeAlive || 0) + dt;
      var distToP = Math.hypot(p.x - e.x, p.y - e.y);
      e.barrelAngle = Math.atan2(p.y - e.y, p.x - e.x);
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

    e.vx = speed > 0 ? (dx / d) * speed : 0;
    e.vy = speed > 0 ? (dy / d) * speed : 0;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.touchCooldown = Math.max(0, e.touchCooldown - dt);

    if (e.kind === 'elite') {
      if (e.affix === 'mirror') {
        e.shieldAngle = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.shieldBrokenTimer > 0) {
          e.shieldBrokenTimer = Math.max(0, e.shieldBrokenTimer - dt);
        }
      } else if (e.affix === 'command') {
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
      } else if (e.affix === 'blink') {
        if (!empFrozen) {
          e.blinkTimer = (e.blinkTimer !== undefined ? e.blinkTimer : 3.2) - dt;
          e.blinkTelegraph = (e.blinkTimer <= 0.3 && e.blinkTimer > 0);
          if (e.blinkTimer <= 0) {
            e.blinkTimer = 3.2;
            e.blinkTelegraph = false;
            var flankSide = Math.random() < 0.5 ? 1 : -1;
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

      if (!empFrozen) {
        e.shootCd = (e.shootCd || 3.5) - dt;
        if (e.shootCd <= 0) {
          e.shootCd = 3.5;
          var baseAngle = Math.atan2(p.y - e.y, p.x - e.x);
          var spread = [-0.26, 0, 0.26];
          for (var si = 0; si < spread.length; si += 1) {
            var sa = baseAngle + spread[si];
            rt.state.enemyBullets.push({
              x: e.x + Math.cos(sa) * (e.r + 4),
              y: e.y + Math.sin(sa) * (e.r + 4),
              vx: Math.cos(sa) * 115,
              vy: Math.sin(sa) * 115,
              r: 3.5,
              damage: 14,
              life: 6
            });
          }
          spawnParticles(e.x, e.y, '#75d1b0', 5, 80, 2);
        }
      }

      if (!e.ringTriggered && e.hp < e.maxHp * 0.5) {
        e.ringTriggered = true;
        var edpDist = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        if (edpDist <= 120) {
          var pushX = ((p.x - e.x) / edpDist) * 15;
          var pushY = ((p.y - e.y) / edpDist) * 15;
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
      if (!empFrozen && !e.leftCannonDestroyed) {
        e.shootCd = (e.shootCd || 2.8) - dt;
        if (e.shootCd <= 0) {
          e.shootCd = 2.8;
          var tBaseAngle = Math.atan2(p.y - e.y, p.x - e.x);
          var twinOffsets = [-0.14, 0.14];
          for (var tii = 0; tii < twinOffsets.length; tii += 1) {
            var ta = tBaseAngle + twinOffsets[tii];
            rt.state.enemyBullets.push({
              x: e.x + Math.cos(ta) * (e.r + 8),
              y: e.y + Math.sin(ta) * (e.r + 8),
              vx: Math.cos(ta) * 140,
              vy: Math.sin(ta) * 140,
              r: 5.5,
              damage: 18,
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

      if (!e.phase2Triggered && e.hp <= e.maxHp * 0.5) {
        e.phase2Triggered = true;
        rt.state.banner = 3.5;
        rt.state.bannerText = 'TITAN ENRAGED // BARRAGE PROTOCOL';
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN ENRAGED // BARRAGE PROTOCOL';
        logEvent('TITAN ENRAGED // BARRAGE PROTOCOL');
        rt.state.shake = Math.max(rt.state.shake, 14);
        triggerHaptic([50, 40, 80, 40, 100]);
        AudioFX.blast();
        AudioFX.stormSiren();

        var tpDist = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        if (tpDist <= 180) {
          p.x = clamp(p.x + ((p.x - e.x) / tpDist) * 30, p.r, boundW - p.r);
          p.y = clamp(p.y + ((p.y - e.y) / tpDist) * 30, p.r, boundH - p.r);
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
          for (var spi = 0; spi < 8; spi += 1) {
            var sAng = e.spiralAngle + (spi * TAU / 8);
            rt.state.enemyBullets.push({
              x: e.x + Math.cos(sAng) * (e.r + 6),
              y: e.y + Math.sin(sAng) * (e.r + 6),
              vx: Math.cos(sAng) * 130,
              vy: Math.sin(sAng) * 130,
              r: 4.5,
              damage: 16,
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
              rt.state.enemies.push({
                kind: 'rusher',
                x: clamp(e.x + smOffset, 24, boundW - 24),
                y: clamp(e.y + (Math.random() - 0.5) * 30, 24, boundH - 24),
                r: 10,
                hp: 26 + rt.state.wave * 5,
                maxHp: 26 + rt.state.wave * 5,
                speed: 91 + rt.state.wave * 3.2,
                damage: 9 + rt.state.wave * 0.8,
                color: '#e1a644',
                touchCooldown: 0,
                phase: Math.random() * TAU,
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

    if (d <= p.r + e.r && e.touchCooldown <= 0 && p.invulnerable <= 0) {
      p.hp -= e.damage;
      p.invulnerable = 0.7;
      e.touchCooldown = 0.85;
      AudioFX.hurt();
      triggerHaptic([45]);
      rt.state.shake = Math.max(rt.state.shake, 10);
      rt.state.hurtFlash = 0.55;
      pushFxEvent('playerHit', p.x, p.y, null);
      spawnParticles(p.x, p.y, '#df6b4f', 10, 160, 3);
      if (isStormFront()) rt.state.stormHurt = true;
      if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(e.x, e.y);
      if (p.hp <= 0) triggerGameOver();
    }
  }
  if (p.hp <= 0 && !rt.state.over) triggerGameOver();
}
