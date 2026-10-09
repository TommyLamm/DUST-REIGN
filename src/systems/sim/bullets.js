import { AudioFX } from '../../audio/audio-fx.js';
import { spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2 } from '../../core/utils.js';
import { triggerSpireMicroResonance } from '../abilities.js';
import { applyEnemySlow, stepCardEffects } from '../card-effects.js';
import { damageEnemy, explodeBarrel, explodeCore, killEnemy } from '../combat.js';
import { stormWind } from '../flow.js';
import { addScore } from '../scoring.js';
import { noteMetaEvent } from '../meta.js';
import { arcChainProfile, spawnKineticShrapnel, spawnPlasmaMeltdownZone } from '../weapons.js';
import { logEvent } from '../../ui/hud.js';

function notePartDestroyed() {
  addScore(200, 'style');
  if (!rt.state.stats) return;
  rt.state.stats.partsDestroyed = (rt.state.stats.partsDestroyed || 0) + 1;
  noteMetaEvent('parts', { count: rt.state.stats.partsDestroyed });
}

function nearestEnemy(x, y, range, ignore) {
  var best = null;
  var bestD = range * range;
  var enemies = rt.state.enemies || [];
  var i;
  for (i = 0; i < enemies.length; i += 1) {
    var enemy = enemies[i];
    if (!enemy || enemy === ignore || enemy.hp <= 0 || enemy.burrowed || enemy.untargetable) continue;
    var d2 = dist2(x, y, enemy.x, enemy.y);
    if (d2 < bestD) {
      best = enemy;
      bestD = d2;
    }
  }
  return best;
}

function steerHoming(b, dt) {
  if (!b.homing) return;
  var target = nearestEnemy(b.x, b.y, 2400, null);
  if (!target) return;
  var desired = Math.atan2(target.y - b.y, target.x - b.x);
  var current = Math.atan2(b.vy, b.vx);
  var diff = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  var maxTurn = 7 * dt;
  if (diff > maxTurn) diff = maxTurn;
  if (diff < -maxTurn) diff = -maxTurn;
  var speed = Math.hypot(b.vx, b.vy) || 460;
  var next = current + diff;
  b.vx = Math.cos(next) * speed;
  b.vy = Math.sin(next) * speed;
}

function dropScorch(b) {
  if (!b.scorchLine) return;
  b.scorchAcc = (b.scorchAcc || 0) + 1;
  if (b.scorchAcc < 3) return;
  b.scorchAcc = 0;
  if (!rt.state.scorchMarks) rt.state.scorchMarks = [];
  if (rt.state.scorchMarks.length > 40) rt.state.scorchMarks.shift();
  rt.state.scorchMarks.push({
    x: b.x,
    y: b.y,
    r: 12,
    life: 1,
    tick: 0,
    dmg: b.scorchDamage || Math.max(1, b.damage * 0.2)
  });
}

function burstVanguard(b) {
  if (!b.vanguardBurst || b.burstDone) return;
  b.burstDone = true;
  var radius = 90;
  var damage = Math.max(1, b.damage * 0.6);
  var enemies = rt.state.enemies || [];
  var i;
  for (i = enemies.length - 1; i >= 0; i -= 1) {
    var enemy = enemies[i];
    var reach = radius + (enemy.r || 0);
    if (dist2(b.x, b.y, enemy.x, enemy.y) > reach * reach) continue;
    damageEnemy(enemy, damage, { source: 'bullet', x: b.x, y: b.y });
    if (enemy.hp <= 0) killEnemy(enemy, 'bullet');
  }
  if (rt.state.shockRings) {
    rt.state.shockRings.push({
      x: b.x,
      y: b.y,
      r: 8,
      maxR: radius,
      life: 0.24,
      maxLife: 0.24,
      color: '#5be7ff'
    });
  }
  pushFxEvent('burst', b.x, b.y, { preset: 'mortar', tint: '#5be7ff', scale: 0.7 });
}

function noteArcHit(p, x, y) {
  if (!p || (p.weaponMode || 'standard') !== 'arc-welder' || (p.mastery || 0) < 3) return;
  p.arcHits = (p.arcHits || 0) + 1;
  if (p.arcHits % 30 !== 0) return;
  var radius = 70;
  var damage = Math.max(8, Math.round((p.damage || 26) * 0.5));
  var enemies = rt.state.enemies || [];
  var i;
  for (i = enemies.length - 1; i >= 0; i -= 1) {
    var enemy = enemies[i];
    var reach = radius + (enemy.r || 0);
    if (dist2(x, y, enemy.x, enemy.y) > reach * reach) continue;
    damageEnemy(enemy, damage, { source: 'emp', x: x, y: y });
    enemy.empTimer = Math.max(enemy.empTimer || 0, 0.6);
    if (enemy.hp <= 0) killEnemy(enemy, 'emp');
  }
  pushFxEvent('burst', x, y, { preset: 'emp', scale: 0.45 });
}

export function stepBullets(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  stepCardEffects(dt);
  for (var bi = rt.state.bullets.length - 1; bi >= 0; bi -= 1) {
    var b = rt.state.bullets[bi];
    steerHoming(b, dt);
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 4) b.trail.shift();
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.isVulcan && rng('combat') < 0.45) {
      rt.state.particles.push({
        x: b.x,
        y: b.y,
        vx: -b.vx * 0.12 + (rng('combat') - 0.5) * 40,
        vy: -b.vy * 0.12 + (rng('combat') - 0.5) * 40,
        life: 0.14 + rng('combat') * 0.14,
        maxLife: 0.28,
        size: 2.2,
        color: rng('combat') < 0.5 ? '#ff4500' : '#ffd700',
        gravity: 5
      });
    }
    var wind = stormWind();
    if (wind) {
      var windStep = ((p && p.stormRider) ? 48 : 16) * (wind.power / 38);
      b.x += Math.cos(wind.angle) * windStep * dt;
      b.y += Math.sin(wind.angle) * windStep * dt;
    }
    dropScorch(b);
    b.life -= dt;

    if (b.bounces > 0) {
      var bouncedX = false;
      var normX = 0;
      if (b.x - b.r <= 0 && b.vx < 0) {
        b.vx = -b.vx;
        b.x = clamp(b.x, b.r, boundW - b.r);
        bouncedX = true;
        normX = 1;
      } else if (b.x + b.r >= boundW && b.vx > 0) {
        b.vx = -b.vx;
        b.x = clamp(b.x, b.r, boundW - b.r);
        bouncedX = true;
        normX = -1;
      }
      if (bouncedX) {
        var normAngleX = normX > 0 ? 0 : Math.PI;
        for (var rsi = 0; rsi < 6; rsi += 1) {
          var sAngle = normAngleX + (rng('combat') - 0.5) * 1.5;
          var sSpeed = 70 + rng('combat') * 90;
          rt.state.particles.push({
            x: b.x,
            y: b.y,
            vx: Math.cos(sAngle) * sSpeed,
            vy: Math.sin(sAngle) * sSpeed,
            life: 0.15 + rng('combat') * 0.25,
            maxLife: 0.4,
            size: 2.4,
            color: '#ffe7a4',
            gravity: 12
          });
        }
        if (rt.state.opticalFlashes) {
          rt.state.opticalFlashes.push({
            x: b.x,
            y: b.y,
            nx: normX,
            ny: 0,
            r: b.r * 2.8,
            life: 0.1,
            maxLife: 0.1,
            color: '#fff4bd'
          });
        }
      }

      var bouncedY = false;
      var normY = 0;
      if (b.y - b.r <= 0 && b.vy < 0) {
        b.vy = -b.vy;
        b.y = clamp(b.y, b.r, boundH - b.r);
        bouncedY = true;
        normY = 1;
      } else if (b.y + b.r >= boundH && b.vy > 0) {
        b.vy = -b.vy;
        b.y = clamp(b.y, b.r, boundH - b.r);
        bouncedY = true;
        normY = -1;
      }
      if (bouncedY) {
        var normAngleY = normY > 0 ? Math.PI / 2 : -Math.PI / 2;
        for (var rsi2 = 0; rsi2 < 6; rsi2 += 1) {
          var sAngle2 = normAngleY + (rng('combat') - 0.5) * 1.5;
          var sSpeed2 = 70 + rng('combat') * 90;
          rt.state.particles.push({
            x: b.x,
            y: b.y,
            vx: Math.cos(sAngle2) * sSpeed2,
            vy: Math.sin(sAngle2) * sSpeed2,
            life: 0.15 + rng('combat') * 0.25,
            maxLife: 0.4,
            size: 2.4,
            color: '#ffe7a4',
            gravity: 12
          });
        }
        if (rt.state.opticalFlashes) {
          rt.state.opticalFlashes.push({
            x: b.x,
            y: b.y,
            nx: 0,
            ny: normY,
            r: b.r * 2.8,
            life: 0.1,
            maxLife: 0.1,
            color: '#fff4bd'
          });
        }
      }

      if (bouncedX || bouncedY) {
        b.vx *= 0.9;
        b.vy *= 0.9;
        b.bounces -= 1;
        if (p.kineticShrapnel && !b.isShrapnel) {
          spawnKineticShrapnel(b, b.x, b.y);
        }
        if (b.isPlasmaMeltdown) {
          spawnPlasmaMeltdownZone(b.x, b.y);
        }
      }
    } else if (b.isPlasmaMeltdown) {
      if (b.x - b.r <= 0 || b.x + b.r >= boundW || b.y - b.r <= 0 || b.y + b.r >= boundH) {
        spawnPlasmaMeltdownZone(clamp(b.x, b.r, boundW - b.r), clamp(b.y, b.r, boundH - b.r));
        hitSomething = true;
      }
    }

    var hitSomething = false;

    for (var cIdx = rt.state.volatileCores.length - 1; cIdx >= 0; cIdx -= 1) {
      var cTarget = rt.state.volatileCores[cIdx];
      if (b.hits && b.hits.indexOf(cTarget) !== -1) continue;
      if (dist2(b.x, b.y, cTarget.x, cTarget.y) <= (b.r + cTarget.r) * (b.r + cTarget.r)) {
        if (!b.hits) b.hits = [];
        b.hits.push(cTarget);
        cTarget.hp -= b.damage;
        if (rt.state.stats) {
          rt.state.stats.shotsHit += 1;
          rt.state.stats.damageDealt += b.damage;
        }
        spawnParticles(b.x, b.y, '#f5a623', 4, 80, 2);
        AudioFX.hit();
        if (cTarget.hp <= 0) {
          explodeCore(cTarget, cIdx);
        }
        if (b.pierce > 0) {
          b.pierce -= 1;
          b.damage *= 0.7;
        } else {
          hitSomething = true;
        }
        break;
      }
    }

    if (!hitSomething && rt.state.barrels) {
      for (var bIdx = rt.state.barrels.length - 1; bIdx >= 0; bIdx -= 1) {
        var bBarrel = rt.state.barrels[bIdx];
        if (b.hits && b.hits.indexOf(bBarrel) !== -1) continue;
        if (dist2(b.x, b.y, bBarrel.x, bBarrel.y) <= (b.r + bBarrel.r) * (b.r + bBarrel.r)) {
          if (!b.hits) b.hits = [];
          b.hits.push(bBarrel);
          bBarrel.hp -= b.damage;
          if (rt.state.stats) {
            rt.state.stats.shotsHit += 1;
            rt.state.stats.damageDealt += b.damage;
          }
          spawnParticles(b.x, b.y, '#ff8833', 5, 90, 2);
          AudioFX.hit();
          if (bBarrel.hp <= 0) {
            explodeBarrel(bBarrel, bIdx, false);
          }
          if (b.pierce > 0) {
            b.pierce -= 1;
            b.damage *= 0.7;
          } else {
            hitSomething = true;
          }
          break;
        }
      }
    }

    if (!hitSomething) {
      for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
        var enemy = rt.state.enemies[ei];
        if (b.hits && b.hits.indexOf(enemy) !== -1) continue;
        if (enemy.burrowed || enemy.untargetable) continue;
        if (dist2(b.x, b.y, enemy.x, enemy.y) <= (b.r + enemy.r) * (b.r + enemy.r)) {
          if (enemy.kind === 'elite' && (enemy.affix === 'mirror' || enemy.affix2 === 'mirror') && (!enemy.shieldBrokenTimer || enemy.shieldBrokenTimer <= 0)) {
            var hitAngle = (dist2(b.x, b.y, enemy.x, enemy.y) > 0.001) ? Math.atan2(b.y - enemy.y, b.x - enemy.x) : Math.atan2(-b.vy, -b.vx);
            var angleDiff = Math.atan2(Math.sin(hitAngle - (enemy.shieldAngle || 0)), Math.cos(hitAngle - (enemy.shieldAngle || 0)));
            if (Math.abs(angleDiff) <= 1.14) {
              b.vx = -b.vx;
              b.vy = -b.vy;
              spawnParticles(b.x, b.y, '#5be7ff', 8, 140, 2.5);
              spawnParticles(b.x, b.y, '#ffffff', 4, 100, 1.8);
              AudioFX.hit();
              hitSomething = true;
              break;
            }
          }
          if (!b.hits) b.hits = [];
          b.hits.push(enemy);

          var isCrit = false;
          if (b.forceCrit || b.ambush) {
            isCrit = true;
          } else if (p.highCaliber && rng('combat') < 0.20) {
            isCrit = true;
          } else if (enemy.vx !== undefined && enemy.vy !== undefined) {
            var bSpeed = Math.hypot(b.vx, b.vy);
            var eSpeed = Math.hypot(enemy.vx, enemy.vy);
            if (bSpeed > 0 && eSpeed > 0) {
              var dot = (b.vx * enemy.vx + b.vy * enemy.vy) / (bSpeed * eSpeed);
              if (dot < -0.35) isCrit = true;
            }
          }

          var critMult = p.highCaliber ? 2.2 : 1.75;
          var damageDealt = isCrit ? b.damage * critMult : b.damage;
          if (b.isBreacher && (p.mastery || 0) >= 2 && dist2(b.x, b.y, p.x, p.y) <= 120 * 120) {
            damageDealt *= 1.4;
          }
          damageEnemy(enemy, damageDealt, { source: 'bullet', crit: isCrit, bullet: b, x: b.x, y: b.y });
          if (b.isBreacher && (p.mastery || 0) >= 3) applyEnemySlow(enemy, 0.4, 0.7);

          if (enemy.kind === 'titan') {
            var e = enemy;
            var tAim = Math.atan2(p.y - e.y, p.x - e.x);
            var lcX = e.x + Math.cos(tAim - Math.PI / 2) * 22;
            var lcY = e.y + Math.sin(tAim - Math.PI / 2) * 22;
            var rpX = e.x + Math.cos(tAim + Math.PI / 2) * 22;
            var rpY = e.y + Math.sin(tAim + Math.PI / 2) * 22;
            var dLc = dist2(b.x, b.y, lcX, lcY);
            var dRp = dist2(b.x, b.y, rpX, rpY);
            if (dLc <= dRp) {
              if (!e.leftCannonDestroyed) {
                e.leftCannonHp = (e.leftCannonHp !== undefined ? e.leftCannonHp : Math.round((e.maxHp || e.hp) * 0.22)) - b.damage;
                if (e.leftCannonHp <= 0) {
                  e.leftCannonHp = 0;
                  e.leftCannonDestroyed = true;
                  e.empTimer = Math.max(e.empTimer || 0, 1.8);
                  notePartDestroyed();
                  rt.state.orbs.push({ kind: 'repair', x: lcX, y: lcY, vx: (rng('loot') - 0.5) * 85, vy: (rng('loot') - 0.5) * 85, r: 10, value: 0, life: 25 });
                  AudioFX.blast();
                  rt.state.shake = Math.max(rt.state.shake, 14);
                  triggerHaptic([40, 50, 60]);
                  if (rt.state.shockRings) {
                    rt.state.shockRings.push({ x: lcX, y: lcY, r: 8, maxR: 70, life: 0.3, maxLife: 0.3, color: '#ff4d2e' });
                  }
                  spawnParticles(lcX, lcY, '#ff4d2e', 22, 190, 4);
                  spawnParticles(lcX, lcY, '#ffd27d', 16, 150, 3);
                  spawnParticles(lcX, lcY, '#5be7ff', 12, 120, 2);
                  logEvent('TITAN COMPONENT DESTROYED // LEFT CANNON OFFLINE');
                  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN LEFT CANNON DESTROYED // TWIN CANNON OFFLINE [STUN 1.8s]';
                }
              }
            } else {
              if (!e.rightPodDestroyed) {
                e.rightPodHp = (e.rightPodHp !== undefined ? e.rightPodHp : Math.round((e.maxHp || e.hp) * 0.22)) - b.damage;
                if (e.rightPodHp <= 0) {
                  e.rightPodHp = 0;
                  e.rightPodDestroyed = true;
                  e.empTimer = Math.max(e.empTimer || 0, 1.8);
                  notePartDestroyed();
                  rt.state.orbs.push({ kind: 'overdrive', x: rpX, y: rpY, vx: (rng('loot') - 0.5) * 95, vy: (rng('loot') - 0.5) * 95, r: 11, value: 0, life: 25 });
                  AudioFX.blast();
                  rt.state.shake = Math.max(rt.state.shake, 14);
                  triggerHaptic([40, 50, 60]);
                  if (rt.state.shockRings) {
                    rt.state.shockRings.push({ x: rpX, y: rpY, r: 8, maxR: 70, life: 0.3, maxLife: 0.3, color: '#ff4d2e' });
                  }
                  spawnParticles(rpX, rpY, '#ff4d2e', 22, 190, 4);
                  spawnParticles(rpX, rpY, '#ffd27d', 16, 150, 3);
                  spawnParticles(rpX, rpY, '#5be7ff', 12, 120, 2);
                  logEvent('TITAN COMPONENT DESTROYED // REINFORCEMENTS DISABLED');
                  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN RIGHT POD DESTROYED // MINIONS OFFLINE [STUN 1.8s]';
                }
              }
            }
          }

          if (rt.state.stats) {
            rt.state.stats.shotsHit += 1;
            if (isCrit) rt.state.stats.crits += 1;
          }

          var kb = b.knockback !== undefined ? b.knockback : (isCrit ? 6 : 0);
          if (kb > 0 && !(enemy.commandBuffTimer > 0) && !enemy.knockbackImmune) {
            var bLen = Math.hypot(b.vx, b.vy) || 1;
            enemy.x += (b.vx / bLen) * kb;
            enemy.y += (b.vy / bLen) * kb;
          }

          if (isCrit) {
            var cap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
            p.energy = Math.min(cap, (p.energy || 0) + 4.0);
            spawnParticles(enemy.x, enemy.y, '#fbda8a', 8, 140, 3);
            AudioFX.critHit();
          } else {
            spawnParticles(b.x, b.y, b.isArcWelder ? '#5be7ff' : '#f7d48a', 4, 80, 2);
            if (enemy.hp <= 0) {} else AudioFX.hit();
          }

          if (b.isArcWelder && rt.state.enemies) {
            noteArcHit(p, enemy.x, enemy.y);
            var chain = arcChainProfile(p);
            var arcCandidates = [];
            for (var aei = 0; aei < rt.state.enemies.length; aei += 1) {
              var other = rt.state.enemies[aei];
              if (other === enemy || other.hp <= 0) continue;
              var d2 = dist2(enemy.x, enemy.y, other.x, other.y);
              if (d2 <= chain.range * chain.range) {
                arcCandidates.push({ enemy: other, dist2: d2 });
              }
            }
            if (arcCandidates.length > 0) {
              arcCandidates.sort(function (e1, e2) { return e1.dist2 - e2.dist2; });
              var targets = arcCandidates.slice(0, chain.targets);
              var arcDmg = Math.max(1, Math.round(b.damage * chain.ratio));
              for (var ati = 0; ati < targets.length; ati += 1) {
                var tgt = targets[ati].enemy;
                damageEnemy(tgt, arcDmg, { source: 'bullet', x: enemy.x, y: enemy.y });
                noteArcHit(p, tgt.x, tgt.y);
                if (rt.state.lightningArcs) {
                  rt.state.lightningArcs.push({
                    x1: enemy.x,
                    y1: enemy.y,
                    x2: tgt.x,
                    y2: tgt.y,
                    life: 0.12,
                    maxLife: 0.12,
                    color: '#5be7ff'
                  });
                }
                spawnParticles(tgt.x, tgt.y, '#5be7ff', 4, 85, 2);
                if (tgt.hp <= 0) {
                  var tgtIdx = rt.state.enemies.indexOf(tgt);
                  if (tgtIdx !== -1) {
                    killEnemy(tgt, 'bullet');
                    if (tgtIdx < ei) ei -= 1;
                  }
                }
              }
            }
          }
          if (b.isArcWelder && rt.state.spires && rt.state.spires.length > 0) {
            for (var asi = 0; asi < rt.state.spires.length; asi += 1) {
              var aspire = rt.state.spires[asi];
              if (dist2(enemy.x, enemy.y, aspire.x, aspire.y) <= 180 * 180) {
                triggerSpireMicroResonance(aspire, enemy.x, enemy.y);
              }
            }
          }

          if (b.isPlasmaMeltdown) {
            spawnPlasmaMeltdownZone(b.x, b.y);
          }

          if (isCrit) pushFxEvent('crit', enemy.x, enemy.y, null);

          if (enemy.hp <= 0) {
            var mainIdx = rt.state.enemies.indexOf(enemy);
            if (mainIdx !== -1) killEnemy(enemy, 'bullet');
          }

          if (isCrit && b.masteryRicochet && !b.didMasteryBounce) {
            var bounceTo = nearestEnemy(enemy.x, enemy.y, 160, enemy);
            if (bounceTo) {
              b.didMasteryBounce = true;
              var bounceSpeed = Math.hypot(b.vx, b.vy) || 700;
              var bounceAngle = Math.atan2(bounceTo.y - enemy.y, bounceTo.x - enemy.x);
              b.vx = Math.cos(bounceAngle) * bounceSpeed;
              b.vy = Math.sin(bounceAngle) * bounceSpeed;
              b.x = enemy.x + Math.cos(bounceAngle) * ((enemy.r || 10) + b.r + 2);
              b.y = enemy.y + Math.sin(bounceAngle) * ((enemy.r || 10) + b.r + 2);
              b._deferRemove = true;
            }
          }

          if (b.pierce > 0) {
            b.pierce -= 1;
            if (p.kineticShrapnel && !b.isShrapnel) {
              spawnKineticShrapnel(b, enemy.x, enemy.y);
            }
            if (!b.isVanguard && !b.isOverchargeSpike) b.damage *= 0.7;
            rt.state.shockRings.push({
              x: enemy.x,
              y: enemy.y,
              r: 6,
              maxR: 28,
              life: 0.16,
              maxLife: 0.16,
              color: b.isVanguard ? '#5be7ff' : '#a8f5e5'
            });
            var backAngle = Math.atan2(b.vy, b.vx) + Math.PI;
            for (var pji = 0; pji < 5; pji += 1) {
              var jetAngle = backAngle + (rng('combat') - 0.5) * 0.45;
              var jetSpeed = 150 + rng('combat') * 110;
              rt.state.particles.push({
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(jetAngle) * jetSpeed,
                vy: Math.sin(jetAngle) * jetSpeed,
                life: 0.15 + rng('combat') * 0.15,
                maxLife: 0.3,
                size: 2.5,
                color: '#a8f5e5',
                gravity: 6
              });
            }
          } else if (b._deferRemove) {
            b._deferRemove = false;
          } else {
            hitSomething = true;
          }
          break;
        }
      }
    }

    if (hitSomething || b.life <= 0 || b.x < -60 || b.y < -60 || b.x > boundW + 60 || b.y > boundH + 60) {
      if (b.vanguardBurst) burstVanguard(b);
      rt.state.bullets.splice(bi, 1);
    }
  }
}
