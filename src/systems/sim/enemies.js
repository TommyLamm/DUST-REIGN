  if (p) p.contactLock = Math.max(0, (p.contactLock || 0) - dt);
import { AudioFX } from '../../audio/audio-fx.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2, fastUnorderedRemove } from '../../core/utils.js';
import { triggerReactiveArmor } from '../abilities.js';
import { damageEnemy, damagePlayer, killEnemy } from '../combat.js';
import { triggerGameOver } from '../flow.js';
import { ensureScriptedBoss } from '../spawning.js';
import { stepBossArena } from './bosses.js';
import { clearEnemyShields, clearShieldsOwnedBy } from './enemy-defense.js';
import { stepEnemyHazards, sweepDefeated } from './new-enemies.js';
import { getEnemyById, populateEnemyGrid, queryGridCallback } from '../../core/spatial-grid.js';
import { primeEnemyStrategy, stepEnemyStrategy } from './enemy-registry.js';
import { spawnCombatText } from '../../render/fx.js';
import { edgePressure, shoveEnemyOffEdge } from './world-edge.js';

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

var dominoSource = null;
var dominoSourceIdx = -1;

function dominoCallback(otherId) {
  if (otherId === dominoSourceIdx || !dominoSource) return;
  var other = getEnemyById(otherId);
  if (!other || other.hp <= 0 || other.burrowed || other.untargetable) return;
  var d2 = dist2(dominoSource.x, dominoSource.y, other.x, other.y);
  var hitR = (dominoSource.r || 12) + (other.r || 12);
  if (d2 <= hitR * hitR && d2 > 0) {
    var kb = dominoSource._recentKb || 12;
    var crushDmg = Math.max(12, Math.round(kb * 1.5));
    damageEnemy(other, crushDmg, { source: 'domino_crush', x: other.x, y: other.y });
    damageEnemy(dominoSource, Math.round(crushDmg * 0.5), { source: 'domino_crush', x: dominoSource.x, y: dominoSource.y });
    other.staggerTimer = Math.max(other.staggerTimer || 0, 0.45);
    other._recentKb = (other._recentKb || 0) + kb * 0.6;
    other._recentKbTimer = 0.35;
    var dist = Math.sqrt(d2) || 1;
    var nx = (other.x - dominoSource.x) / dist;
    var ny = (other.y - dominoSource.y) / dist;
    other.x += nx * (kb * 0.5);
    other.y += ny * (kb * 0.5);
    spawnCombatText(other.x, other.y - 12, 'CRUSH!', true);
    spawnParticles(other.x, other.y, '#f59e0b', 4, 80, 2);
    if (AudioFX && typeof AudioFX.critHit === 'function') AudioFX.critHit();
    if (other.hp <= 0) killEnemy(other, 'domino_crush');
    if (dominoSource.hp <= 0) killEnemy(dominoSource, 'domino_crush');
    dominoSource._recentKb *= 0.5;
  }
}


/** Pure move-speed multiplier stack (excludes kind wobble / buffs / EMP). */
export function enemyChaseSpeedMult(distToPlayer, hyperCatchup, wolfPack) {
  var mult = 1.08;
  if (hyperCatchup) mult *= 2.2;
  else if (distToPlayer > 550) mult *= 1.35;
  if (wolfPack) mult *= 1.15;
  return mult;
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

  var playerEdge = edgePressure(p.x, p.y, p.r, boundW, boundH);
  for (var j = rt.state.enemies.length - 1; j >= 0; j -= 1) {
    var e = rt.state.enemies[j];
    if (!e || e.hp <= 0) continue;
    var isCulled = (e.x < -120 || e.x > boundW + 120 || e.y < -120 || e.y > boundH + 120);

    // Zone 3 check (> 1.85 x Viewport): silent cull normal mobs after 3s with token recycling; hyper-catchup (2.2x speed) for elite/boss after 2.5s until within 750px
    var distToCam = Math.hypot(e.x - cx, e.y - cy);
    if (distToCam > zone3Dist) {
      if (!e.isBoss && e.kind !== 'elite') {
        e.zone3Timer = (e.zone3Timer || 0) + dt;
        if (e.zone3Timer >= 3.0) {
          // Soft bank cap on large worlds so a long kite cannot stockpile a spawn bomb.
          var bankCap = (boundW >= 2400) ? 8 : 99;
          if ((rt.state.recycledTokens || 0) < bankCap) {
            rt.state.recycledTokens = (rt.state.recycledTokens || 0) + 1;
          }
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
    if (e.staggerTimer > 0) e.staggerTimer = Math.max(0, e.staggerTimer - dt);
    if (e.wallSlamCd > 0) e.wallSlamCd = Math.max(0, e.wallSlamCd - dt);
    if (e._recentKbTimer > 0) e._recentKbTimer = Math.max(0, e._recentKbTimer - dt);
    if (e._recentKb >= 12 && !e.burrowed && !e.isBoss && e.hp > 0) {
      dominoSource = e;
      dominoSourceIdx = j;
      queryGridCallback(e.x, e.y, (e.r || 12) + 24, dominoCallback);
    }
    else e._recentKb = 0;
    var dx = p.x - e.x;
    var dy = p.y - e.y;
    var d = Math.hypot(dx, dy) || 1;

    // +8% base mobility compensation; far-range catchup (>550px: x1.35) OR hyper-catchup (x2.2), never both; Wolf Pack surge (x1.15)
    var wolfBoost = !!(rt.state.wolfPackSurge && (e.kind === 'crawler' || e.kind === 'rusher'));
    var speed = e.speed * enemyChaseSpeedMult(d, !!e.hyperCatchup, wolfBoost) * (e.kind === 'rusher' ? 1 + Math.sin(rt.state.waveTime * 5 + e.phase) * 0.08 : e.kind === 'elite' ? 1 + Math.sin(rt.state.waveTime * 3 + e.phase) * 0.12 : 1);

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
    if (e.staggerTimer > 0) {
      speed *= 0.15;
      if (e.burstTime > 0) e.burstTime = 0;
      if (e.burstCd !== undefined && e.burstCd < 0.5) e.burstCd = 1.5;
      if (e.telegraph > 0) e.telegraph = 0;
      if (e.lungeTimer > 0) e.lungeTimer = 0;
      if (e.shootCd !== undefined && e.shootCd < 1.0) e.shootCd = 1.5;
      if (rng('combat') < 0.20) {
        spawnParticles(e.x, e.y, '#f59e0b', 2, 50, 1.5);
      }
    }
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
    var stratMotion = stepEnemyStrategy(e, dt, frame, empFrozen, isCulled);
    if (stratMotion) {
      if (stratMotion.handled || stratMotion.skipMove) {
        skipMove = true;
        if (stratMotion.vx !== undefined) e.vx = stratMotion.vx;
        if (stratMotion.vy !== undefined) e.vy = stratMotion.vy;
      } else {
        if (stratMotion.dx !== undefined) dx = stratMotion.dx;
        if (stratMotion.dy !== undefined) dy = stratMotion.dy;
        if (stratMotion.d !== undefined) d = stratMotion.d;
        if (stratMotion.speed !== undefined && stratMotion.speed !== null) speed = stratMotion.speed;
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

      var minX = e.r || 12;
      var maxX = boundW - (e.r || 12);
      var minY = e.r || 12;
      var maxY = boundH - (e.r || 12);
      var hitWall = false;

      if (e.x <= minX) {
        e.x = minX;
        if (e.vx < -20 || (e._recentKb && e._recentKb > 3)) hitWall = true;
        e.vx = 0;
      } else if (e.x >= maxX) {
        e.x = maxX;
        if (e.vx > 20 || (e._recentKb && e._recentKb > 3)) hitWall = true;
        e.vx = 0;
      }

      if (e.y <= minY) {
        e.y = minY;
        if (e.vy < -20 || (e._recentKb && e._recentKb > 3)) hitWall = true;
        e.vy = 0;
      } else if (e.y >= maxY) {
        e.y = maxY;
        if (e.vy > 20 || (e._recentKb && e._recentKb > 3)) hitWall = true;
        e.vy = 0;
      }

      if (hitWall && (e.wallSlamCd || 0) <= 0) {
        e.wallSlamCd = 0.6;
        e._recentKb = 0;
        damageEnemy(e, 25, { source: 'wall_slam', x: e.x, y: e.y });
        e.staggerTimer = Math.max(e.staggerTimer || 0, 0.5);
        spawnCombatText(e.x, e.y - 14, 'WALL SLAM!', true);
        if (AudioFX && typeof AudioFX.critHit === 'function') AudioFX.critHit();
        spawnParticles(e.x, e.y, '#e69535', 8, 120, 2);
        if (rt.state) rt.state.shake = Math.max(rt.state.shake || 0, 6);
        if (e.hp <= 0) {
          killEnemy(e, 'wall_slam');
          continue;
        }
      }
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

    var tdx = p.x - e.x;
    var tdy = p.y - e.y;
    var touchR = (p.r || 16) + (e.r || 12);
    var touchD2 = tdx * tdx + tdy * tdy;
    // Keep swarm bodies from wedging the hull against the hatch stripe.
    if (playerEdge.pressed && !isCulled && !e.burrowed && !e.isBoss && e.kind !== 'mine' && e.kind !== 'stormTower') {
      var nearPin = touchD2 <= (touchR + 36) * (touchR + 36);
      if (nearPin) shoveEnemyOffEdge(e, playerEdge, 95 * dt, boundW, boundH, false);
    }
    // Melee proximity flare (VFX only — no damage/timing retune).
    e.meleeProximityWarn = 0;
    if (!isCulled && !e.burrowed && e.kind !== 'mine' && e.kind !== 'stormTower' && e.kind !== 'scurrier' && !e.isBoss) {
      var warnR = touchR + 44;
      if (touchD2 <= warnR * warnR) {
        var warnDist = Math.sqrt(touchD2);
        e.meleeProximityWarn = Math.max(0.12, 1 - warnDist / warnR);
      }
    }
    if (!isCulled && !e.burrowed && e.kind !== 'mine' && e.kind !== 'stormTower' && e.kind !== 'scurrier' && touchD2 <= touchR * touchR && e.touchCooldown <= 0 && p.invulnerable <= 0 && !(p.contactLock > 0)) {
      var contactDmg = e.damage;
      if (e.kind === 'burrower') {
        contactDmg = Math.max(1, Math.round(contactDmg * 0.25));
        // First burrower waves: slightly longer i-frames after teach hit.
        if (((rt.state.wave | 0) <= 13) && !(rt.state.boss && rt.state.boss.hp > 0)) e._burrowTeach = true;
      }
      if (playerEdge.pressed) contactDmg = Math.max(1, Math.round(e.damage * 0.55));
      if (rt.state.boss && rt.state.boss.hp > 0 && (e.kind === 'elite' || e.kind === 'brute')) {
        contactDmg = Math.max(1, Math.round(contactDmg * 0.7));
      }
      // Early-wave teaching soft: open-recipe brutes hit like trucks on wave 1–3.
      var earlyBrute = e.kind === 'brute' && ((rt.state.wave | 0) <= 3) && !(rt.state.boss && rt.state.boss.hp > 0);
      if (earlyBrute) contactDmg = Math.max(1, Math.min(Math.round(contactDmg * 0.6), 16));
      // Elite debuts wave 3 at 21 contact — teaching cliff after brute soft (#219). Cap like first Titan.
      var earlyElite = e.kind === 'elite' && ((rt.state.wave | 0) <= 3) && !(rt.state.boss && rt.state.boss.hp > 0);
      if (earlyElite) contactDmg = Math.max(1, Math.min(Math.round(contactDmg * 0.65), 14));
      // Mid-early teaching: artillery 19-contact debuts w2 — soft until w5 outside bosses.
      var earlyArtillery = e.kind === 'artillery' && ((rt.state.wave | 0) <= 5) && !(rt.state.boss && rt.state.boss.hp > 0);
      if (earlyArtillery) contactDmg = Math.max(1, Math.min(Math.round(contactDmg * 0.7), 12));
      // Scurrier debuts w7 at 18 contact + arming blast — teaching soft through w9.
      var earlyScurrier = e.kind === 'scurrier' && ((rt.state.wave | 0) <= 9) && !(rt.state.boss && rt.state.boss.hp > 0);
      if (earlyScurrier) contactDmg = Math.max(1, Math.min(Math.round(contactDmg * 0.55), 10));
      var firstTitan = false;
      if (e.kind === 'titan') {
        var beaten = rt.state.bossesDefeated || [];
        firstTitan = beaten.indexOf('titan') === -1 && (rt.state.wave || 1) <= 5;
        if (firstTitan) contactDmg = Math.max(1, Math.min(Math.round(contactDmg * 0.55), 14));
      }
      // Wave 14+ / sovereign: never apply elite contact (damagePlayer deny alone still leaked attribution).
      var eliteMute = (e.kind === 'elite') && (((rt.state.wave | 0) >= 14) || (rt.state.recipe && (rt.state.recipe.boss === 'sovereign' || rt.state.recipe.boss === 'dreadnought')));
      if (eliteMute) {
        e.touchCooldown = 0.85;
        continue;
      }
      if (e.kind === 'dreadnought' || e.kind === 'sovereign') {
        contactDmg = Math.max(1, Math.round(contactDmg * 0.55));
      }
      var touched = damagePlayer(contactDmg, 'contact:' + (e.kind || 'enemy'), e.x, e.y);
      // Slightly longer per-target touch CD + short player-side contact lock (fairness vs stack melt; no DPS retune).
      e.touchCooldown = firstTitan ? 1.25 : ((earlyBrute || earlyElite || earlyArtillery || earlyScurrier || e._burrowTeach) ? 1.15 : (e.kind === 'dreadnought' ? 1.15 : 1.05));
      if (touched > 0) {
        p.invulnerable = playerEdge.pressed ? 1.05 : (e.kind === 'dreadnought' ? 1.0 : 0.7);
        p.contactLock = Math.max(p.contactLock || 0, playerEdge.pressed ? 0.55 : 0.42);
        if (playerEdge.pressed) {
          shoveEnemyOffEdge(e, playerEdge, 34, boundW, boundH, true);
          p.x = clamp(p.x + playerEdge.nx * 16, p.r, boundW - p.r);
          p.y = clamp(p.y + playerEdge.ny * 16, p.r, boundH - p.r);
        } else if (!e.knockbackImmune) {
          // Modest separation shove so point-blank contact does not stick (feel only).
          var push = Math.hypot(tdx, tdy) || 1;
          e.x -= (tdx / push) * 28;
          e.y -= (tdy / push) * 28;
          e.x = clamp(e.x, e.r || 12, boundW - (e.r || 12));
          e.y = clamp(e.y, e.r || 12, boundH - (e.r || 12));
          spawnParticles(e.x, e.y, '#d889ff', 6, 120, 2.2);
        }
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
  if (p.hp <= 0 && !rt.state.over) {
    // Author deathCause here — callers may have emptied HP without damagePlayer lethal branch.
    if (!rt.state.deathCause) {
      var sticky = rt.state.lastDamageSource || '';
      var nonElite = rt.state.lastNonEliteDamageSource || '';
      if (sticky === 'bullet:elite' || sticky === 'contact:elite') {
        var recent = rt.state.recentDamageSources || [];
        var fromRecent = '';
        for (var ri = recent.length - 1; ri >= 0; ri -= 1) {
          if (recent[ri] && recent[ri] !== 'bullet:elite' && recent[ri] !== 'contact:elite') { fromRecent = recent[ri]; break; }
        }
        rt.state.deathCause = nonElite || fromRecent || 'unknown';
      } else {
        rt.state.deathCause = sticky || nonElite || 'unknown';
      }
    }
    if (((rt.state.wave | 0) >= 14) && (rt.state.deathCause === 'bullet:elite' || rt.state.deathCause === 'contact:elite')) {
      var scrubNon = rt.state.lastNonEliteDamageSource || '';
      var scrubRecent = rt.state.recentDamageSources || [];
      var scrubFrom = '';
      for (var sri = scrubRecent.length - 1; sri >= 0; sri -= 1) {
        if (scrubRecent[sri] && scrubRecent[sri] !== 'bullet:elite' && scrubRecent[sri] !== 'contact:elite') { scrubFrom = scrubRecent[sri]; break; }
      }
      rt.state.deathCause = scrubNon || scrubFrom || 'unknown';
    }
    triggerGameOver();
  }
}

export function decorateSpawn(kind, e) {
  primeEnemyStrategy(kind, e);
}
