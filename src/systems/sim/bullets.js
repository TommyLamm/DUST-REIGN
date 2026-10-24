import { AudioFX } from '../../audio/audio-fx.js';
import { spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../../core/settings.js';
import { getEnemyById, populateEnemyGrid, queryGrid, queryGridCallback } from '../../core/spatial-grid.js';
import { clamp, dist2, fastUnorderedRemove } from '../../core/utils.js';
import { triggerSpireAbsorption, triggerSpireMicroResonance } from '../abilities.js';
import { applyEnemySlow, onCrit, stepCardEffects } from '../card-effects.js';
import { damageEnemy, explodeBarrel, explodeCore, killEnemy } from '../combat.js';
import { stormWind } from '../flow.js';
import { addScore } from '../scoring.js';
import { noteMetaEvent } from '../meta.js';
import { arcChainProfile, spawnKineticShrapnel, spawnPlasmaMeltdownZone } from '../weapons.js';
import { logEvent } from '../../ui/hud.js';
import { spawnCombatText } from '../../render/fx.js';
import { checkMultiPartBulletHit } from './boss-parts.js';

var queriedEnemyIds = [];
var ehPullBullet = null;
function ehPullCallback(eId) {
  if (!ehPullBullet) return;
  var foe = getEnemyById(eId);
  if (!foe || foe.hp <= 0 || foe.isBoss || foe.burrowed) return;
  var d2 = dist2(ehPullBullet.x, ehPullBullet.y, foe.x, foe.y);
  if (d2 <= 150 * 150 && d2 > 16) {
    var dist = Math.sqrt(d2) || 1;
    var pull = (1 - dist / 150) * 160 * 0.016;
    foe.x += ((ehPullBullet.x - foe.x) / dist) * pull;
    foe.y += ((ehPullBullet.y - foe.y) / dist) * pull;
  }
}
var MAX_ARC_CANDIDATES = 64;
var ARC_CANDIDATES = [];
for (var i = 0; i < MAX_ARC_CANDIDATES; i += 1) {
  ARC_CANDIDATES.push({ enemy: null, dist2: 0 });
}

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

function triggerColossusGraviton(b) {
  if (!b.colossusGraviton || b.gravitonDone || !rt.state) return;
  b.gravitonDone = true;
  if (!rt.state.tacticalEntities) rt.state.tacticalEntities = [];
  var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
  var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
  rt.state.tacticalEntities.push({
    kind: 'singularity-vortex',
    x: clamp(b.x, 20, boundW - 20),
    y: clamp(b.y, 20, boundH - 20),
    r: 130,
    life: 0.4,
    maxLife: 0.4,
    tearTimer: 0,
    absorbedDamage: 120,
    hp: 999
  });
  if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
  spawnParticles(b.x, b.y, '#bd5bff', 18, 160, 3);
}

function noteArcHit(p, x, y) {
  if (p && (p.apocalypseThor || p.staticTempest)) {
    p.thorHits = (p.thorHits || 0) + 1;
    if (p.thorHits % 3 === 0 && rt.state && rt.state.enemies) {
      for (var ti = rt.state.enemies.length - 1; ti >= 0; ti -= 1) {
        var te = rt.state.enemies[ti];
        if (dist2(x, y, te.x, te.y) <= 90 * 90) {
          damageEnemy(te, 180, { source: 'apocalypse_thor', x: x, y: y });
          te.empTimer = Math.max(te.empTimer || 0, 1.5);
          onEnemyEmp(te);
          if (te.hp <= 0) killEnemy(te, 'apocalypse_thor');
        }
      }
      if (!rt.state.hazards) rt.state.hazards = [];
      rt.state.hazards.push({
        kind: 'ionized-ground',
        x: x,
        y: y,
        r: 70,
        life: 3.0,
        maxLife: 3.0,
        tickTimer: 0
      });
      if (rt.state.lightningArcs) {
        rt.state.lightningArcs.push({
          x1: x,
          y1: 0,
          x2: x,
          y2: y,
          life: 0.25,
          maxLife: 0.25,
          color: '#5be7ff'
        });
      }
      rt.state.shake = Math.max(rt.state.shake || 0, 12);
      if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
      logEvent('APOCALYPSE THOR // ORBITAL ION STRIKE 180 DMG');
    }
  }
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
  populateEnemyGrid(rt.state.enemies);
  stepCardEffects(dt);
  for (var bi = rt.state.bullets.length - 1; bi >= 0; bi -= 1) {
    var b = rt.state.bullets[bi];
    steerHoming(b, dt);
    if (!b.trailBuf) {
      b.trailBuf = new Float32Array(8);
      b.trailHead = -1;
      b.trailCount = 0;
      b.trailPool = [{ x: b.x, y: b.y }, { x: b.x, y: b.y }, { x: b.x, y: b.y }, { x: b.x, y: b.y }];
      b.trail = [];
    }
    var bHead = (b.trailHead + 1) & 3;
    b.trailHead = bHead;
    b.trailBuf[bHead * 2] = b.x;
    b.trailBuf[bHead * 2 + 1] = b.y;
    if (b.trailCount < 4) b.trailCount += 1;
    for (var bti = 0; bti < b.trailCount; bti += 1) {
      var bIdx = (bHead - b.trailCount + 1 + bti + 8) & 3;
      var bPt = b.trailPool[bti];
      bPt.x = b.trailBuf[bIdx * 2];
      bPt.y = b.trailBuf[bIdx * 2 + 1];
      b.trail[bti] = bPt;
    }
    b.trail.length = b.trailCount;
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
    var tEntities = rt.state.tacticalEntities;
    if (tEntities && tEntities.length > 0) {
      for (var tei = 0; tei < tEntities.length; tei += 1) {
        var tent = tEntities[tei];
        if (!tent || tent.life <= 0) continue;
        if (tent.kind === 'aegis-barrier') {
          var isPen = b.isVanguard || b.isColossus || (b.pierce !== undefined && b.pierce >= 2);
          if (isPen && !b._aegisBoosted) {
            var abDist2 = dist2(tent.x, tent.y, b.x, b.y);
            var abReach = tent.r + 18;
            if (abDist2 <= abReach * abReach) {
              var halfArc = (tent.arc || (130 * Math.PI / 180)) * 0.5;
              var abAng = Math.atan2(b.y - tent.y, b.x - tent.x);
              var abDiff = Math.abs(Math.atan2(Math.sin(abAng - tent.angle), Math.cos(abAng - tent.angle)));
              if (abDiff <= halfArc + 0.35) {
                b._aegisBoosted = true;
                b.forceCrit = true;
                b.crit = true;
                b.damage = Math.round(b.damage * 1.25);
                pushFxEvent('burst', b.x, b.y, { preset: 'emp', tint: '#00f3ff', scale: 0.55 });
                spawnParticles(b.x, b.y, '#00f3ff', 8, 120, 2);
                if (AudioFX && typeof AudioFX.ricochet === 'function') AudioFX.ricochet();
              }
            }
          }
        } else if (tent.kind === 'singularity-vortex') {
          if (b._lastVortexCharged !== tent) {
            var svDist2 = dist2(tent.x, tent.y, b.x, b.y);
            if (svDist2 <= tent.r * tent.r) {
              b._lastVortexCharged = tent;
              tent.absorbedDamage = Math.min(200, (tent.absorbedDamage || 0) + b.damage * 0.25);
              spawnParticles(b.x, b.y, '#bd5bff', 3, 50, 1.2);
            }
          }
        } else if (tent.kind === 'sentry-turret') {
          var isArc = b.isArcWelder || (b.chainCount !== undefined && b.chainCount > 0);
          if (isArc && !b._turretOvercharged) {
            var stDist2 = dist2(tent.x, tent.y, b.x, b.y);
            if (stDist2 <= 36 * 36) {
              b._turretOvercharged = true;
              tent.overchargeTimer = 3.5;
              spawnParticles(tent.x, tent.y, '#5be7ff', 6, 90, 2);
              if (rt.state.lightningArcs) {
                rt.state.lightningArcs.push({
                  x1: b.x, y1: b.y, x2: tent.x, y2: tent.y,
                  life: 0.15, maxLife: 0.15, color: '#5be7ff'
                });
              }
              if (AudioFX && typeof AudioFX.ricochet === 'function') AudioFX.ricochet();
            }
          }
        }
      }
    }
    b.life -= dt;
    if (b.isEventHorizon && !b._ehDetonated) {
      ehPullBullet = b;
      queryGridCallback(b.x, b.y, 150, ehPullCallback);
      if (rng('combat') < 0.25) {
        spawnParticles(b.x, b.y, '#9d4edd', 2, 40, 1.2);
      }
    }

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
        if (AudioFX && typeof AudioFX.ricochet === 'function') AudioFX.ricochet();
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

    if (!hitSomething && rt.state.spires) {
      for (var spIdx = rt.state.spires.length - 1; spIdx >= 0; spIdx -= 1) {
        var spTarget = rt.state.spires[spIdx];
        if (dist2(b.x, b.y, spTarget.x, spTarget.y) <= (b.r + (spTarget.r || 18)) * (b.r + (spTarget.r || 18))) {
          triggerSpireAbsorption(spTarget, b);
          if (AudioFX && typeof AudioFX.ricochet === 'function') AudioFX.ricochet();
          hitSomething = true;
          break;
        }
      }
    }

    if (!hitSomething) {
      queryGrid(b.x, b.y, b.r + 32, queriedEnemyIds);
      for (var qi = 0; qi < queriedEnemyIds.length; qi += 1) {
        var qId = queriedEnemyIds[qi];
        var enemy = getEnemyById(qId);
        if (!enemy || enemy.hp <= 0) continue;
        if (qId < 32) {
          if (((b.hitMask0 || 0) & (1 << qId)) !== 0) continue;
        } else if (qId < 64) {
          if (((b.hitMask1 || 0) & (1 << (qId - 32))) !== 0) continue;
        } else if (qId < 96) {
          if (((b.hitMask2 || 0) & (1 << (qId - 64))) !== 0) continue;
        } else if (qId < 128) {
          if (((b.hitMask3 || 0) & (1 << (qId - 96))) !== 0) continue;
        } else {
          if (b.hits && b.hits.indexOf(enemy) !== -1) continue;
        }
        if (enemy.burrowed || enemy.untargetable) continue;
        if (dist2(b.x, b.y, enemy.x, enemy.y) <= (b.r + enemy.r) * (b.r + enemy.r)) {
          if (enemy.kind === 'elite' && (enemy.affix === 'mirror' || enemy.affix2 === 'mirror') && (!enemy.shieldBrokenTimer || enemy.shieldBrokenTimer <= 0)) {
            var hitAngle = (dist2(b.x, b.y, enemy.x, enemy.y) > 0.001) ? Math.atan2(b.y - enemy.y, b.x - enemy.x) : Math.atan2(-b.vy, -b.vx);
            var angleDiff = Math.atan2(Math.sin(hitAngle - (enemy.shieldAngle || 0)), Math.cos(hitAngle - (enemy.shieldAngle || 0)));
            if (Math.abs(angleDiff) >= 1.8) {
              b._isMirrorBackstab = true;
            }
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
          if (qId < 32) {
            b.hitMask0 = (b.hitMask0 || 0) | (1 << qId);
          } else if (qId < 64) {
            b.hitMask1 = (b.hitMask1 || 0) | (1 << (qId - 32));
          } else if (qId < 96) {
            b.hitMask2 = (b.hitMask2 || 0) | (1 << (qId - 64));
          } else if (qId < 128) {
            b.hitMask3 = (b.hitMask3 || 0) | (1 << (qId - 96));
          } else {
            if (!b.hits) b.hits = [];
            b.hits.push(enemy);
          }
          b.hasHitEnemy = true;
          p.consecutiveHits = (p.consecutiveHits || 0) + 1;

          var res = p.resonanceFireControl;
          var streakCritBonus = 0;
          if (res) {
            var streak = p.consecutiveHits || 0;
            if (streak >= 6) streakCritBonus = (res.tier >= 2 ? 0.15 : 0.10) * (res.tune || 1);
          }

          var isCrit = false;
          var isCounter = false;
          if (b.forceCrit || b.ambush) {
            isCrit = true;
          } else if (p.highCaliber && rng('combat') < 0.20) {
            isCrit = true;
          } else if (streakCritBonus > 0 && rng('combat') < streakCritBonus) {
            isCrit = true;
          } else if (enemy.vx !== undefined && enemy.vy !== undefined) {
            var bSpeed = Math.hypot(b.vx, b.vy);
            var eSpeed = Math.hypot(enemy.vx, enemy.vy);
            if (bSpeed > 0 && eSpeed > 0) {
              var dot = (b.vx * enemy.vx + b.vy * enemy.vy) / (bSpeed * eSpeed);
              var isCharging = (enemy.burstTime > 0) ||
                (enemy.burstCd !== undefined && enemy.burstCd <= 0.35 && enemy.burstCd > 0) ||
                (enemy.telegraph > 0) ||
                (enemy.lungeTimer > 0) ||
                (enemy.phaseState === 'telegraph') ||
                (eSpeed > 160);
              if (dot < -0.35) {
                isCrit = true;
                if (isCharging) isCounter = true;
              } else if (isCharging && dot < 0.1) {
                isCrit = true;
                isCounter = true;
              }
            }
          }

          var critMult = p.highCaliber ? 2.2 : 1.75;
          if (isCounter) {
            critMult *= 1.35;
            if (enemy.burstTime > 0) enemy.burstTime = 0;
            if (enemy.vx !== undefined) enemy.vx *= 0.5;
            if (enemy.vy !== undefined) enemy.vy *= 0.5;
            if (enemy.burstCd !== undefined) enemy.burstCd = 2.0;
            spawnCombatText(enemy.x, enemy.y - 16, 'COUNTER!', true);
          }
          if (res && res.tier >= 2 && (p.consecutiveHits || 0) >= 12) {
            critMult += 0.35;
          }
          var damageDealt = isCrit ? b.damage * critMult : b.damage;
          if (b.isBreacher && (p.mastery || 0) >= 2 && dist2(b.x, b.y, p.x, p.y) <= 120 * 120) {
            damageDealt *= 1.4;
          }
          rt.state.lastHitWasCrit = isCrit;
          if (b._isMirrorBackstab) {
            b._isMirrorBackstab = false;
            damageDealt *= 1.5;
            enemy.mirrorBackHits = (enemy.mirrorBackHits || 0) + 1;
            if (enemy.mirrorBackHits >= 3 || damageDealt >= 45) {
              enemy.mirrorBackHits = 0;
              enemy.shieldBrokenTimer = 3.5;
              enemy.empTimer = Math.max(enemy.empTimer || 0, 3.5);
              spawnCombatText(enemy.x, enemy.y - 14, 'SHIELD SHATTER!', true);
              if (AudioFX && typeof AudioFX.shieldShatter === 'function') AudioFX.shieldShatter();
              else AudioFX.critHit();
              pushFxEvent('shieldBreak', enemy.x, enemy.y, { kind: enemy.kind, color: '#38bdf8' });
              spawnParticles(enemy.x, enemy.y, '#38bdf8', 16, 180, 3);
            }
          }
          var distToP2 = dist2(b.x, b.y, p.x, p.y);
          var isHeavy = b.isVanguard || b.isColossus || b.isBreacher;
          var isExecution = false;
          if (isHeavy && distToP2 < 90 * 90 && enemy.staggerTimer > 0) {
            isExecution = true;
            damageDealt *= 1.5;
            spawnCombatText(enemy.x, enemy.y - 18, 'EXECUTE!', true);
            if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
            if (rt.state.shockRings) {
              rt.state.shockRings.push({
                x: enemy.x, y: enemy.y, r: 8, maxR: 80,
                life: 0.22, maxLife: 0.22, color: '#f59e0b'
              });
            }
            pushFxEvent('burst', enemy.x, enemy.y, { preset: 'emp', tint: '#f59e0b', scale: 0.6 });
            if (rt.state.enemies) {
              for (var nei = rt.state.enemies.length - 1; nei >= 0; nei -= 1) {
                var nFoe = rt.state.enemies[nei];
                if (!nFoe || nFoe === enemy || nFoe.hp <= 0 || nFoe.burrowed || nFoe.knockbackImmune) continue;
                var nDist2 = dist2(enemy.x, enemy.y, nFoe.x, nFoe.y);
                if (nDist2 <= 80 * 80) {
                  var nd = Math.sqrt(nDist2) || 1;
                  nFoe.x += ((nFoe.x - enemy.x) / nd) * 35;
                  nFoe.y += ((nFoe.y - enemy.y) / nd) * 35;
                  nFoe._recentKb = (nFoe._recentKb || 0) + 15;
                  nFoe._recentKbTimer = 0.35;
                  nFoe.staggerTimer = Math.max(nFoe.staggerTimer || 0, 0.3);
                }
              }
            }
          }

          if (b.isBreacher && (p.mastery || 0) >= 3 && distToP2 <= 80 * 80) {
            if (enemy.maxStaggerHp > 0 && enemy.staggerHp > 0) {
              var breachCut = Math.round(enemy.maxStaggerHp * 0.35);
              enemy.staggerHp -= breachCut;
              if (enemy.staggerHp <= 0) {
                enemy.staggerTimer = 1.6;
                enemy.staggerHp = enemy.maxStaggerHp;
                spawnCombatText(enemy.x, enemy.y - 14, 'STAGGER BREAK!', true);
                if (AudioFX && typeof AudioFX.critHit === 'function') AudioFX.critHit();
                if (rt.state) {
                  rt.state.combo = (rt.state.combo || 0) + 2;
                  rt.state.comboTimer = Math.max(rt.state.comboTimer || 0, 3.5);
                }
              }
            }
          }

          if (b.isVanguard && (p.mastery || 0) >= 3) {
            b._vanguardHitCount = (b._vanguardHitCount || 0) + 1;
            if (b._vanguardHitCount === 3) {
              pushFxEvent('burst', enemy.x, enemy.y, { preset: 'emp', tint: '#5be7ff', scale: 0.7 });
              if (rt.state.shockRings) {
                rt.state.shockRings.push({
                  x: enemy.x, y: enemy.y, r: 8, maxR: 70,
                  life: 0.20, maxLife: 0.20, color: '#5be7ff'
                });
              }
              var vDmg = Math.max(15, Math.round(b.damage * 0.5));
              if (rt.state.enemies) {
                for (var vei = rt.state.enemies.length - 1; vei >= 0; vei -= 1) {
                  var vFoe = rt.state.enemies[vei];
                  if (!vFoe || vFoe === enemy || vFoe.hp <= 0) continue;
                  if (dist2(enemy.x, enemy.y, vFoe.x, vFoe.y) <= 70 * 70) {
                    damageEnemy(vFoe, vDmg, { source: 'vanguard_pulse', x: enemy.x, y: enemy.y });
                    if (vFoe.hp <= 0) killEnemy(vFoe, 'vanguard_pulse');
                  }
                }
              }
            }
          }

          if (b.isEventHorizon && !b._ehDetonated && (enemy.kind === 'elite' || enemy.isBoss || enemy.parts)) {
            b._ehDetonated = true;
            var ehRadius = 180;
            var ehDmg = Math.max(80, Math.round(b.damage * 0.85));
            if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
            if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
            spawnCombatText(enemy.x, enemy.y - 20, 'EVENT HORIZON!', true);
            if (rt.state.shockRings) {
              rt.state.shockRings.push({
                x: enemy.x, y: enemy.y, r: 10, maxR: ehRadius,
                life: 0.35, maxLife: 0.35, color: '#9d4edd'
              });
            }
            pushFxEvent('burst', enemy.x, enemy.y, { preset: 'emp', tint: '#9d4edd', scale: 1.2 });
            spawnParticles(enemy.x, enemy.y, '#9d4edd', 24, 180, 3.5);
            spawnParticles(enemy.x, enemy.y, '#ffffff', 12, 120, 2);

            var ebList = rt.state.enemyBullets;
            if (ebList) {
              for (var ebi = ebList.length - 1; ebi >= 0; ebi -= 1) {
                var ebullet = ebList[ebi];
                if (dist2(enemy.x, enemy.y, ebullet.x, ebullet.y) <= ehRadius * ehRadius) {
                  spawnParticles(ebullet.x, ebullet.y, '#9d4edd', 2, 40, 1.2);
                  ebList.splice(ebi, 1);
                }
              }
            }

            if (rt.state.enemies) {
              for (var ehi = rt.state.enemies.length - 1; ehi >= 0; ehi -= 1) {
                var ehFoe = rt.state.enemies[ehi];
                if (!ehFoe || ehFoe.hp <= 0 || ehFoe === enemy) continue;
                if (dist2(enemy.x, enemy.y, ehFoe.x, ehFoe.y) <= ehRadius * ehRadius) {
                  damageEnemy(ehFoe, ehDmg, { source: 'event_horizon', x: enemy.x, y: enemy.y });
                  ehFoe.staggerTimer = Math.max(ehFoe.staggerTimer || 0, 1.2);
                  if (ehFoe.hp <= 0) killEnemy(ehFoe, 'event_horizon');
                }
              }
            }

            p.shield = Math.min(30, (p.shield || 0) + 15);
            spawnParticles(p.x, p.y, '#9d4edd', 8, 100, 2);
          }

          p.hitmarkerTime = rt.renderTime || 0;
          p.hitmarkerType = (isExecution || (enemy.staggerHp <= 0 && enemy.staggerTimer > 0)) ? 3 : ((isCrit || isCounter) ? 2 : 1);

          var isClose = distToP2 <= 120 * 120;
          damageEnemy(enemy, damageDealt, {
            source: isExecution ? 'execution' : 'bullet',
            execution: isExecution,
            crit: isCrit,
            isCounter: isCounter,
            isClose: isClose,
            bullet: b,
            x: b.x,
            y: b.y
          });
          if (b.isBreacher && (p.mastery || 0) >= 3) applyEnemySlow(enemy, 0.4, 0.7);

          if (p.thermalShock) {
            enemy.burnStacks = Math.min(5, (enemy.burnStacks || 0) + 1);
            enemy.burnTimer = 3.0;
            spawnParticles(b.x, b.y, '#ff6a3d', 2, 60, 1.5);
          }

          if (b.isPrismatic) {
            enemy._prismaticHits = (enemy._prismaticHits || 0) + 1;
            if (enemy._prismaticHits >= 2) {
              var lostHp = Math.max(0, (enemy.maxHp || enemy.hp) - enemy.hp);
              var trueDmg = Math.max(1, Math.round(lostHp * 0.08));
              damageEnemy(enemy, trueDmg, { source: 'true', crit: true, x: enemy.x, y: enemy.y });
              spawnCombatText(enemy.x, enemy.y - 12, 'PRISMATIC ' + trueDmg, true);
              spawnParticles(enemy.x, enemy.y, '#ffd700', 8, 120, 2);
              enemy._prismaticHits = 0;
            }
          }

          if (enemy.parts) {
            if (checkMultiPartBulletHit(enemy, b)) {
              // Multi-part collision handled
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
            enemy._recentKb = (enemy._recentKb || 0) + kb;
            enemy._recentKbTimer = 0.4;
          }

          if (isCrit) {
            var cap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
            p.energy = Math.min(cap, (p.energy || 0) + 4.0);
            spawnParticles(enemy.x, enemy.y, '#fbda8a', 8, 140, 3);
            AudioFX.critHit();
            if (!isReducedMotion()) {
              rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.033);
            }
            enemy.jitterTimer = 0.033;
            enemy.jitterAngle = Math.atan2(b.vy, b.vx);
            enemy.jitterAmount = 3.5;
            onCrit(enemy, { bullet: b, player: p, damage: damageDealt });
          } else {
            spawnParticles(b.x, b.y, b.isArcWelder ? '#5be7ff' : '#f7d48a', 4, 80, 2);
            if (enemy.hp <= 0) {} else AudioFX.hit();
          }

          if (b.isArcWelder && rt.state.enemies) {
            noteArcHit(p, enemy.x, enemy.y);
            var chain = arcChainProfile(p);
            var arcRange2 = chain.range * chain.range;
            var arcCandidateCount = 0;
            for (var aei = 0; aei < rt.state.enemies.length; aei += 1) {
              var other = rt.state.enemies[aei];
              if (other === enemy || other.hp <= 0) continue;
              var d2 = dist2(enemy.x, enemy.y, other.x, other.y);
              if (d2 <= arcRange2) {
                if (arcCandidateCount < MAX_ARC_CANDIDATES) {
                  var arcSlot = ARC_CANDIDATES[arcCandidateCount];
                  arcSlot.enemy = other;
                  arcSlot.dist2 = d2;
                  arcCandidateCount += 1;
                }
              }
            }
            if (arcCandidateCount > 0) {
              for (var asi = 1; asi < arcCandidateCount; asi += 1) {
                var curEnemy = ARC_CANDIDATES[asi].enemy;
                var curDist = ARC_CANDIDATES[asi].dist2;
                var asj = asi - 1;
                while (asj >= 0 && ARC_CANDIDATES[asj].dist2 > curDist) {
                  ARC_CANDIDATES[asj + 1].enemy = ARC_CANDIDATES[asj].enemy;
                  ARC_CANDIDATES[asj + 1].dist2 = ARC_CANDIDATES[asj].dist2;
                  asj -= 1;
                }
                ARC_CANDIDATES[asj + 1].enemy = curEnemy;
                ARC_CANDIDATES[asj + 1].dist2 = curDist;
              }
              var targetCount = Math.min(arcCandidateCount, chain.targets);
              var arcDmg = Math.max(1, Math.round(b.damage * chain.ratio));
              for (var ati = 0; ati < targetCount; ati += 1) {
                var tgt = ARC_CANDIDATES[ati].enemy;
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
                  killEnemy(tgt, 'bullet');
                }
              }
              for (var aci = 0; aci < arcCandidateCount; aci += 1) {
                ARC_CANDIDATES[aci].enemy = null;
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
            killEnemy(enemy, 'bullet');
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
            if (p.shatterArmorPierced && enemy && !enemy.shattered) {
              enemy.shattered = true;
              enemy.damageTakenMult = (enemy.damageTakenMult || 1) * 1.30;
              spawnParticles(enemy.x, enemy.y, '#5be7ff', 8, 120, 2);
            }
            if (p.kineticShrapnel && !b.isShrapnel) {
              spawnKineticShrapnel(b, enemy.x, enemy.y);
            }
            if (b.colossusDisintegration) {
              var fanAngle = Math.atan2(b.vy, b.vx);
              var fanRadius = 90;
              var fanDmg = Math.max(1, Math.round(b.damage * 0.35));
              var fEnemies = rt.state.enemies || [];
              for (var fsi = fEnemies.length - 1; fsi >= 0; fsi -= 1) {
                var fFoe = fEnemies[fsi];
                if (!fFoe || fFoe.hp <= 0 || fFoe === enemy) continue;
                if (dist2(enemy.x, enemy.y, fFoe.x, fFoe.y) <= (fanRadius + (fFoe.r || 0)) * (fanRadius + (fFoe.r || 0))) {
                  var fAng = Math.atan2(fFoe.y - enemy.y, fFoe.x - enemy.x);
                  var fDiff = Math.abs(Math.atan2(Math.sin(fAng - fanAngle), Math.cos(fAng - fanAngle)));
                  if (fDiff <= (Math.PI / 3)) {
                    damageEnemy(fFoe, fanDmg, { source: 'disintegration', x: enemy.x, y: enemy.y });
                    spawnParticles(fFoe.x, fFoe.y, '#00f3ff', 4, 80, 2);
                    if (fFoe.hp <= 0) killEnemy(fFoe, 'disintegration');
                  }
                }
              }
              var eBullets = rt.state.enemyBullets || [];
              for (var ebi = eBullets.length - 1; ebi >= 0; ebi -= 1) {
                var eBullet = eBullets[ebi];
                if (dist2(enemy.x, enemy.y, eBullet.x, eBullet.y) <= fanRadius * fanRadius) {
                  var ebAng = Math.atan2(eBullet.y - enemy.y, eBullet.x - enemy.x);
                  var ebDiff = Math.abs(Math.atan2(Math.sin(ebAng - fanAngle), Math.cos(ebAng - fanAngle)));
                  if (ebDiff <= (Math.PI / 3)) {
                    spawnParticles(eBullet.x, eBullet.y, '#00f3ff', 3, 60, 1.5);
                    eBullets.splice(ebi, 1);
                  }
                }
              }
              pushFxEvent('burst', enemy.x, enemy.y, { preset: 'emp', tint: '#00f3ff', scale: 0.6 });
            }
            if (!b.isVanguard && !b.isOverchargeSpike && !b.isColossus) b.damage *= 0.7;
            rt.state.shockRings.push({
              x: enemy.x,
              y: enemy.y,
              r: 6,
              maxR: 28,
              life: 0.16,
              maxLife: 0.16,
              color: b.isColossus ? '#00f3ff' : (b.isVanguard ? '#5be7ff' : '#a8f5e5')
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
      if (!b.hasHitEnemy && p.resonanceFireControl) {
        p.consecutiveHits = 0;
      }
      if (b.vanguardBurst) burstVanguard(b);
      if (b.colossusGraviton) triggerColossusGraviton(b);
      fastUnorderedRemove(rt.state.bullets, bi);
    }
  }
}
