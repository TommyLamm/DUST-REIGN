import { AudioFX } from '../../audio/audio-fx.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { fastUnorderedRemove } from '../../core/utils.js';
import { triggerReactiveArmor } from '../abilities.js';
import { damageEnemy, damagePlayer, killEnemy } from '../combat.js';
import { triggerGameOver } from '../flow.js';
import { ensureScriptedBoss } from '../spawning.js';
import { stepBossArena } from './bosses.js';
import { clearEnemyShields, clearShieldsOwnedBy } from './enemy-defense.js';
import { stepEnemyHazards, sweepDefeated } from './new-enemies.js';
import { getEnemyById, populateEnemyGrid, queryGridCallback } from '../../core/spatial-grid.js';
import { primeEnemyStrategy, stepEnemyStrategy } from './enemy-registry.js';

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
  primeEnemyStrategy(kind, e);
}
