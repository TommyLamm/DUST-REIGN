import { AudioFX } from '../audio/audio-fx.js';
import { DASH_PULSE_DURATION, DASH_PULSE_RADIUS, MAX_COMBO } from '../config.js';
import { addDecal, spawnParticles } from '../core/pools.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../core/settings.js';
import { clamp, dist2 } from '../core/utils.js';
import { onDash, onEmp, onShieldBreak } from './card-effects.js';
import { damageEnemy, killEnemy } from './combat.js';
import { onEnemyEmp } from './sim/enemy-defense.js';
import { noteContractEvent } from './contracts.js';
import { noteMetaEvent } from './meta.js';
import { addScore } from './scoring.js';
import { logEvent } from '../ui/hud.js';

var DASH_HEAT_MAX = 3;
var DASH_HEAT_WINDOW = 3;
var heatClockState = null;
var heatClockTime = 0;

// Dash travel: a short real move instead of a blink. The profile breaks away
// slowly (start resistance), accelerates, then lands softly.
export var DASH_TRAVEL_TIME = 0.18;

export function dashTravelProgress(t) {
  var u = Math.pow(clamp(t, 0, 1), 1.6);
  return u * u * (3 - 2 * u);
}

// Layers 0–3 → 0.35 / 0.65 / 0.95 / 1.25. Lookup keeps the self-check's 0.35 exact.
export function justDashCooldown(heat) {
  var h = heat | 0;
  if (h < 0) h = 0;
  if (h > DASH_HEAT_MAX) h = DASH_HEAT_MAX;
  if (h === 0) return 0.35;
  if (h === 1) return 0.65;
  if (h === 2) return 0.95;
  return 1.25;
}

// Heat applies only after a sim tick (dashHeatArmed). The opening Just Dash stays 0.35.
function liveJustHeat(p) {
  if (!p || !p.dashHeatArmed) return 0;
  var h = p.dashHeat | 0;
  if (h < 0) return 0;
  if (h > DASH_HEAT_MAX) return DASH_HEAT_MAX;
  return h;
}

function heatWindow(p) {
  var n = p && p.dashHeatReset;
  if (typeof n === 'number' && n > 0) return n;
  return DASH_HEAT_WINDOW;
}

function applyJustDashHeat(p) {
  var next = (p.dashHeat || 0) + 1;
  if (next > DASH_HEAT_MAX) next = DASH_HEAT_MAX;
  p.dashHeat = next;
  p.dashHeatTimer = heatWindow(p);
  p.dashHeatArmed = false;
}

export function stepDashHeat(dt) {
  if (!rt.state || !rt.state.player) return;
  var p = rt.state.player;
  if (!((p.dashHeat || 0) > 0)) {
    p.dashHeat = 0;
    p.dashHeatTimer = 0;
    p.dashHeatArmed = false;
    return;
  }
  var step = Number(dt) || 0;
  if (step > 0) p.dashHeatTimer = (p.dashHeatTimer || 0) - step;
  if (!((p.dashHeatTimer || 0) > 0)) {
    p.dashHeat = 0;
    p.dashHeatTimer = 0;
    p.dashHeatArmed = false;
    return;
  }
  if (step > 0) p.dashHeatArmed = true;
}

// Called from the HUD tick. Decays with waveTime so pause / hitstop / interlude do not cool heat.
export function syncDashHeatClock() {
  var state = rt.state;
  if (!state || !state.player) {
    heatClockState = null;
    return;
  }
  var waveTime = state.waveTime || 0;
  if (heatClockState !== state) {
    heatClockState = state;
    heatClockTime = waveTime;
    return;
  }
  var delta = waveTime - heatClockTime;
  heatClockTime = waveTime;
  if (delta > 0 && delta <= 0.25) stepDashHeat(delta);
}

// Inter-charge gap. Just Dash heat shortens a spare charge; an empty gauge still uses 2.2.
export function dashRechargeCooldown(player) {
  if (player && player.lastDashJust && (player.dashHeat || 0) > 0) return justDashCooldown(player.dashHeat);
  return 2.2;
}

export function dash() {
  if (!rt.state || rt.state.over || rt.state.paused) return;
  var p = rt.state.player;
  var maxCharges = (typeof p.dashChargesMax === 'number' && p.dashChargesMax > 0) ? p.dashChargesMax : 1;
  if (typeof p.dashCharges !== 'number') p.dashCharges = maxCharges;
  if (p.dashCharges < maxCharges && !(p.dashCooldown > 0)) p.dashCharges += 1;
  if (p.dashCharges <= 0) return;
  completeDash();
  var startX = p.x;
  var startY = p.y;

  var isJustDash = false;
  var justRangeBonus = (p.justDashWindowBonus || 0) * 20;
  if (rt.state.enemyBullets && rt.state.enemyBullets.length > 0) {
    for (var bi = 0; bi < rt.state.enemyBullets.length; bi += 1) {
      var eb = rt.state.enemyBullets[bi];
      var ebRadius = eb.r || 4;
      var bDist = p.r + ebRadius + 20 + justRangeBonus;
      if (dist2(startX, startY, eb.x, eb.y) < bDist * bDist) {
        isJustDash = true;
        break;
      }
    }
  }
  if (!isJustDash && rt.state.enemies && rt.state.enemies.length > 0) {
    for (var ei = 0; ei < rt.state.enemies.length; ei += 1) {
      var enemyThreat = rt.state.enemies[ei];
      var enemyRadius = enemyThreat.r || 10;
      var eDist = p.r + enemyRadius + 15 + justRangeBonus;
      if (dist2(startX, startY, enemyThreat.x, enemyThreat.y) < eDist * eDist) {
        isJustDash = true;
        break;
      }
    }
  }

  addDecal(startX, startY, 5, 8, 0.35, '#141210');
  var dx = 0;
  var dy = 0;
  if (rt.input.keys.has('w') || rt.input.keys.has('arrowup')) dy -= 1;
  if (rt.input.keys.has('s') || rt.input.keys.has('arrowdown')) dy += 1;
  if (rt.input.keys.has('a') || rt.input.keys.has('arrowleft')) dx -= 1;
  if (rt.input.keys.has('d') || rt.input.keys.has('arrowright')) dx += 1;
  if (!dx && !dy && (rt.input.gamepadX || rt.input.gamepadY)) { dx = rt.input.gamepadX; dy = rt.input.gamepadY; }
  if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
  var length = Math.hypot(dx, dy) || 1;
  var baseDist = (typeof p.dashDistance === 'number' && p.dashDistance > 0) ? p.dashDistance : 140;
  var dashDist = baseDist * (p.dashDistanceMult || 1);

  triggerHaptic(isJustDash ? [30, 20, 50] : [15]);
  var cooledHeat = isJustDash ? liveJustHeat(p) : 0;
  var cdMult = (typeof p.dashCooldownMult === 'number' && p.dashCooldownMult > 0) ? p.dashCooldownMult : 1;
  p.dashCharges -= 1;
  p.lastDashJust = isJustDash;
  if (p.dashCharges <= 0) {
    p.dashCooldown = (isJustDash ? justDashCooldown(cooledHeat) : 2.2) * cdMult;
  } else if (p.dashIndependent && !(p.dashCooldown > 0)) {
    p.dashCooldown = dashRechargeCooldown(p) * cdMult;
  }
  // Travel time is added so the post-landing invulnerability matches the old blink.
  p.invulnerable = Math.max(p.invulnerable, 0.32 + (p.dashInvulnBonus || 0) + DASH_TRAVEL_TIME);
  p.dashAmbushTimer = isJustDash ? 1.2 : 0.6;
  AudioFX.dash();

  p.dashMove = {
    startX: startX,
    startY: startY,
    dirX: dx / length,
    dirY: dy / length,
    dist: dashDist,
    t: 0,
    done: 0,
    just: isJustDash,
    maxCharges: maxCharges
  };
  p.isDashing = true;
  p.dashActive = DASH_TRAVEL_TIME;
}

// Advances an active dash by dt. Moves are applied as deltas so knockback or
// pulls during travel still count. Returns true while the dash owns movement.
export function stepDash(p, dt, boundW, boundH) {
  var m = p && p.dashMove;
  if (!m) return false;
  if (!(dt > 0)) return true;
  m.t = Math.min(1, m.t + dt / DASH_TRAVEL_TIME);
  var s = dashTravelProgress(m.t);
  var step = (s - m.done) * m.dist;
  m.done = s;
  p.x = clamp(p.x + m.dirX * step, p.r, boundW - p.r);
  p.y = clamp(p.y + m.dirY * step, p.r, boundH - p.r);
  p.vx = m.dirX * step / dt;
  p.vy = m.dirY * step / dt;
  p.dashActive = Math.max(0, (1 - m.t) * DASH_TRAVEL_TIME);
  if (m.t >= 1) {
    p.dashMove = null;
    p.isDashing = false;
    p.dashActive = 0;
    p.vx = 0;
    p.vy = 0;
    landDash(p, m);
  }
  return true;
}

// Finishes an in-flight dash at once (a new dash press, or synchronous checks).
export function completeDash() {
  var p = rt.state && rt.state.player;
  if (!p || !p.dashMove) return;
  var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
  var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
  stepDash(p, DASH_TRAVEL_TIME, boundW, boundH);
}

// Landing effects: pulse, just-dash payoff, intercepts and card hooks fire on arrival.
function landDash(p, m) {
  if (!rt.state) return;
  var startX = m.startX;
  var startY = m.startY;
  var isJustDash = m.just;
  var maxCharges = m.maxCharges;
  var dx = m.dirX;
  var dy = m.dirY;
  var length = 1;
  addDecal(p.x, p.y, 6, 8, 0.35, '#141210');

  if (p.plasmaTrail && rt.state.plasmaZones) {
    rt.state.plasmaZones.push({
      x: (startX + p.x) / 2,
      y: (startY + p.y) / 2,
      r: 32,
      timer: 1.5,
      maxTimer: 1.5,
      damageTickTimer: 0,
      slow: p.plasmaTrail.slow || 0,
      dps: p.plasmaTrail.dps || 40
    });
  }

  if (p.dashDetonateKinetic && (p.kineticCharges || 0) > 0) {
    var kCharges = p.kineticCharges;
    p.kineticCharges = 0;
    var blastRadius = 80 + kCharges * 6;
    if (rt.state.enemyBullets) {
      for (var kbi = rt.state.enemyBullets.length - 1; kbi >= 0; kbi -= 1) {
        var kbEb = rt.state.enemyBullets[kbi];
        if (dist2(p.x, p.y, kbEb.x, kbEb.y) <= blastRadius * blastRadius) {
          rt.state.enemyBullets.splice(kbi, 1);
        }
      }
    }
    if (rt.state.enemies) {
      for (var kei = 0; kei < rt.state.enemies.length; kei += 1) {
        var emy = rt.state.enemies[kei];
        var d2 = dist2(p.x, p.y, emy.x, emy.y);
        if (d2 <= blastRadius * blastRadius) {
          var ang = Math.atan2(emy.y - p.y, emy.x - p.x);
          emy.x += Math.cos(ang) * (40 + kCharges * 5);
          emy.y += Math.sin(ang) * (40 + kCharges * 5);
          if (p.kineticKnockbackDamage) {
            damageEnemy(emy, Math.max(15, Math.round(emy.maxHp * p.kineticKnockbackDamage)), { source: 'kinetic-blast', x: emy.x, y: emy.y });
          }
        }
      }
    }
    pushFxEvent('emp', p.x, p.y, { radius: blastRadius });
  }

  p.dashPulse = DASH_PULSE_DURATION;
  if (isJustDash) {
    rt.state.combo = Math.min(MAX_COMBO, (rt.state.combo || 0) + 2);
    rt.state.comboTimer = 4.0;
    if (rt.state.stats && rt.state.combo > (rt.state.stats.maxCombo || 0)) {
      rt.state.stats.maxCombo = rt.state.combo;
    }
    if (p.justDashCooldownReset) {
      var nowTime = rt.renderTime || 0;
      if (!p._lastJustReset || (nowTime - p._lastJustReset >= 4.0)) {
        p.dashCooldown = 0;
        p.dashCharges = maxCharges;
        p._lastJustReset = nowTime;
        logEvent('PHASE BEARING // DASH COOLDOWN RESET');
      }
    }
    AudioFX.critHit();
    if (!isReducedMotion()) {
      rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.22);
    }
    logEvent('PERFECT DASH // CHRONO DILATION');
    if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'PERFECT DASH // CHRONO DILATION (CD REFUND)';
    if (rt.state.shockRings) {
      rt.state.shockRings.push({ x: startX, y: startY, r: 8, maxR: 70, life: 0.28, maxLife: 0.28, color: '#f7d48a' });
      rt.state.shockRings.push({ x: p.x, y: p.y, r: 8, maxR: 70, life: 0.28, maxLife: 0.28, color: '#f7d48a' });
    }
    spawnParticles(startX, startY, '#f7d48a', 14, 180, 2.8);
    spawnParticles(p.x, p.y, '#f7d48a', 14, 180, 2.8);
  }
  // Blink Phase Intercept Check (65px from dash endpoints or midpoint)
  if (rt.state.enemies && rt.state.enemies.length > 0) {
    for (var bki = 0; bki < rt.state.enemies.length; bki += 1) {
      var bEnemy = rt.state.enemies[bki];
      if (bEnemy && bEnemy.blinkTelegraph && bEnemy.blinkDestLocked && typeof bEnemy.blinkDestX === 'number') {
        var bx = bEnemy.blinkDestX;
        var by = bEnemy.blinkDestY;
        var dEnd2 = dist2(p.x, p.y, bx, by);
        var dStart2 = dist2(startX, startY, bx, by);
        var dMid2 = dist2((startX + p.x) * 0.5, (startY + p.y) * 0.5, bx, by);
        if (Math.min(dEnd2, dStart2, dMid2) <= 65 * 65) {
          bEnemy.phaseIntercepted = true;
          bEnemy.blinkTelegraph = false;
          bEnemy.blinkDestLocked = false;
          var interceptDmg = Math.max(25, Math.round((bEnemy.maxHp || 100) * 0.25));
          damageEnemy(bEnemy, interceptDmg, { source: 'phase-intercept', x: bx, y: by, crit: true, staggerBreak: true, execution: true });
          bEnemy.staggerTimer = 2.5;
          if (bEnemy.hp <= 0) killEnemy(bEnemy, 'phase-intercept');
          if (AudioFX && typeof AudioFX.staggerBreak === 'function') AudioFX.staggerBreak();
          if (!isReducedMotion()) {
            rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.08);
          }
          rt.state.shake = Math.max(rt.state.shake || 0, 14);
          logEvent('PHASE INTERCEPT! // VOID RIFT SHATTERED');
          if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'PHASE INTERCEPT! // VOID RIFT SHATTERED (-25% HP)';
          spawnParticles(bx, by, '#9d4edd', 24, 240, 4);
          spawnParticles(bx, by, '#00f3ff', 16, 180, 3);
          if (rt.state.shockRings) {
            rt.state.shockRings.push({ x: bx, y: by, r: 12, maxR: 90, life: 0.35, maxLife: 0.35, color: '#9d4edd' });
          }
        }
      }
    }
  }

  var hitCount = 0;
  var pulseRadius = p.shockwaveDash ? 125 : DASH_PULSE_RADIUS;
  var kbDistance = (p.shockwaveDash ? 50 : 25) * (isJustDash ? 1.8 : 1);
  var pulseDamage = p.damage * (isJustDash ? 2.2 : 0.8);
  for (var di = rt.state.enemies.length - 1; di >= 0; di -= 1) {
    var enemy = rt.state.enemies[di];
    if (dist2(p.x, p.y, enemy.x, enemy.y) > pulseRadius * pulseRadius) continue;
    hitCount += 1;
    var isStaggered = (enemy.staggerTimer || 0) > 0;
    var dealtDamage = pulseDamage;
    var isExecution = false;
    if (isStaggered) {
      isExecution = true;
      dealtDamage = pulseDamage * 3.5;
      var canExecuteKill = !enemy.isBoss && enemy.kind !== 'titan' && (enemy.hp <= (enemy.maxHp || 100) * 0.40);
      if (canExecuteKill) {
        dealtDamage = Math.max(dealtDamage, enemy.hp + 1);
      }
      p.dashCooldown = 0;
      p.dashCharges = Math.max(p.dashCharges || 0, 1);
      if (!isReducedMotion()) {
        rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.08);
      }
      if (AudioFX && typeof AudioFX.staggerBreak === 'function') AudioFX.staggerBreak();
      logEvent('EXECUTION! // STAGGER PUNISH');
      if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'EXECUTION! // STAGGER PUNISH (DASH RESET)';
      spawnParticles(enemy.x, enemy.y, '#ff2244', 20, 220, 3.8);
      if (rt.state.shockRings) {
        rt.state.shockRings.push({ x: enemy.x, y: enemy.y, r: 8, maxR: 65, life: 0.25, maxLife: 0.25, color: '#ff2244' });
      }
    }
    damageEnemy(enemy, dealtDamage, {
      source: isExecution ? 'execution' : 'dash',
      x: p.x,
      y: p.y,
      crit: isExecution,
      staggerBreak: isExecution,
      execution: isExecution
    });
    onEnemyEmp(enemy);
    if (!enemy.knockbackImmune) {
      var kdx = enemy.x - p.x;
      var kdy = enemy.y - p.y;
      var kd = Math.hypot(kdx, kdy) || 1;
      enemy.x += (kdx / kd) * kbDistance;
      enemy.y += (kdy / kd) * kbDistance;
    }
    spawnParticles(enemy.x, enemy.y, '#75d1b0', 7, 110, 2);
    if (enemy.hp <= 0) killEnemy(enemy, 'dash');
  }
  if (rt.state.barrels) {
    var dirX = dx / length;
    var dirY = dy / length;
    for (var bi = 0; bi < rt.state.barrels.length; bi += 1) {
      var barrel = rt.state.barrels[bi];
      if (barrel.state === 'idle' && dist2(p.x, p.y, barrel.x, barrel.y) <= pulseRadius * pulseRadius) {
        barrel.state = 'flying';
        barrel.vx = dirX * 540;
        barrel.vy = dirY * 540;
        barrel.flyingTimer = 1.2;
        AudioFX.critHit();
        spawnParticles(barrel.x, barrel.y, '#ff8833', 14, 180, 3);
        spawnParticles(barrel.x, barrel.y, '#ffd27d', 8, 140, 2);
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'BARREL LAUNCHED // IMPACT IMMINENT';
        logEvent('BARREL KICK-LAUNCHED');
      }
    }
  }
  if (hitCount >= 2 && !isReducedMotion()) {
    rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.035);
  }
  rt.state.shake = Math.max(rt.state.shake, 5);
  spawnParticles(p.x, p.y, '#75d1b0', 16, 180, 3);

  if (p.staticTempest) {
    var tempestRange = 140;
    var tempestDamage = 45 + p.damage * 0.6;
    if (rt.state.lightningArcs) {
      for (var ai = 0; ai < 6; ai += 1) {
        var aAngle = (ai * Math.PI) / 3;
        rt.state.lightningArcs.push({
          x1: p.x,
          y1: p.y,
          x2: p.x + Math.cos(aAngle) * tempestRange,
          y2: p.y + Math.sin(aAngle) * tempestRange,
          life: 0.22,
          maxLife: 0.22
        });
      }
    }
    if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
    spawnParticles(p.x, p.y, '#5be7ff', 24, 220, 3.2);
    spawnParticles(p.x, p.y, '#a8f5e5', 16, 160, 2.5);
    for (var sti = rt.state.enemies.length - 1; sti >= 0; sti -= 1) {
      var sEnemy = rt.state.enemies[sti];
      if (dist2(p.x, p.y, sEnemy.x, sEnemy.y) <= (tempestRange + (sEnemy.r || 10)) * (tempestRange + (sEnemy.r || 10))) {
        damageEnemy(sEnemy, tempestDamage, { source: 'dash', x: p.x, y: p.y });
        sEnemy.empTimer = Math.max(sEnemy.empTimer || 0, 1.8);
        onEnemyEmp(sEnemy);
        if (sEnemy.kind === 'elite' && (sEnemy.affix === 'mirror' || sEnemy.affix2 === 'mirror')) {
          sEnemy.shieldBrokenTimer = 3.0;
          onShieldBreak(sEnemy, { x: sEnemy.x, y: sEnemy.y, source: 'mirror_break' });
        }
        spawnParticles(sEnemy.x, sEnemy.y, '#5be7ff', 8, 120, 2.2);
        if (sEnemy.hp <= 0) killEnemy(sEnemy, 'dash');
      }
    }
    logEvent('STATIC TEMPEST // 6-WAY CHAIN DISCHARGE');
  }
  if (isJustDash) {
    applyJustDashHeat(p);
    if (rt.state.stats) rt.state.stats.justDashes = (rt.state.stats.justDashes || 0) + 1;
    addScore(40, 'style');
    noteContractEvent('just-dash', { x: p.x, y: p.y });
    noteMetaEvent('just-dash', { x: p.x, y: p.y });
  }
  onDash(p, { just: isJustDash, x: p.x, y: p.y, startX: startX, startY: startY });
  pushFxEvent('dash', p.x, p.y, { sx: startX, sy: startY, just: isJustDash ? 1 : 0, aim: p.aim || 0 });
}

export function triggerEmp() {
  if (!rt.state || rt.state.over || rt.state.paused) return;
  var p = rt.state.player;
  var cost = (typeof p.empCost === 'number') ? p.empCost : 50;
  var drop = rt.input && rt.input.empDrop;
  if (rt.input) rt.input.empDrop = null;
  if ((p.energy || 0) < cost) return;
  p.energy -= cost;

  if (p.surgeUnit) {
    p.surgeUnit.active = true;
    p.surgeUnit.timer = 5.0;
    AudioFX.overdrive();
    logEvent('OVERCLOCK SURGE // MAXIMUM FIRE RATE');
    pushFxEvent('surge', p.x, p.y, { duration: 5.0 });
    return;
  }

  var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
  var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;

  var empX;
  var empY;
  if (drop && typeof drop.x === 'number' && typeof drop.y === 'number') {
    empX = drop.x;
    empY = drop.y;
  } else {
    empX = rt.input.mouse.x;
    empY = rt.input.mouse.y;
    if (!rt.input.mouse || (rt.input.gamepadX || rt.input.gamepadY) || isNaN(empX) || isNaN(empY)) {
      empX = p.x + Math.cos(p.aim) * 85;
      empY = p.y + Math.sin(p.aim) * 85;
    }
  }
  empX = clamp(empX, 20, boundW - 20);
  empY = clamp(empY, 20, boundH - 20);

  var empR = 140 + ((typeof p.empRadiusBonus === 'number') ? p.empRadiusBonus : 0);
  var decoySupernovaTriggered = false;

  AudioFX.emp();
  triggerHaptic([35, 20, 50]);
  rt.state.shake = Math.max(rt.state.shake, 10);

  rt.state.shockRings.push({
    x: empX,
    y: empY,
    r: 12,
    maxR: empR,
    life: 0.35,
    maxLife: 0.35,
    color: '#5be7ff'
  });
  rt.state.shockRings.push({
    x: empX,
    y: empY,
    r: 6,
    maxR: empR * 0.65,
    life: 0.22,
    maxLife: 0.22,
    color: '#ffffff'
  });

  spawnParticles(empX, empY, '#5be7ff', 24, 230, 3.5);
  spawnParticles(empX, empY, '#ffffff', 14, 160, 2);

  for (var bi = rt.state.enemyBullets.length - 1; bi >= 0; bi -= 1) {
    var eb = rt.state.enemyBullets[bi];
    if (dist2(eb.x, eb.y, empX, empY) <= empR * empR) {
      spawnParticles(eb.x, eb.y, '#5be7ff', 5, 95, 2);
      spawnParticles(eb.x, eb.y, '#bdf4ff', 3, 120, 1.5);
      rt.state.enemyBullets.splice(bi, 1);
    }
  }

  var hitCount = 0;
  for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
    var enemy = rt.state.enemies[ei];
    var eDist2 = dist2(enemy.x, enemy.y, empX, empY);
    if (eDist2 <= (empR + enemy.r) * (empR + enemy.r)) {
      hitCount += 1;
      damageEnemy(enemy, 35, { source: 'emp', x: empX, y: empY });
      enemy.empTimer = 2.2;
      onEnemyEmp(enemy);
      if (enemy.kind === 'elite' && (enemy.affix === 'mirror' || enemy.affix2 === 'mirror')) {
        enemy.shieldBrokenTimer = 3.0;
        onShieldBreak(enemy, { x: empX, y: empY, source: 'mirror_break' });
      }
      spawnParticles(enemy.x, enemy.y, '#5be7ff', 8, 130, 2.5);
      if (enemy.hp <= 0) {
        killEnemy(enemy, 'emp');
      }
    }
  }

  if (rt.state.tacticalEntities && rt.state.tacticalEntities.length > 0) {
    for (var ti = rt.state.tacticalEntities.length - 1; ti >= 0; ti -= 1) {
      var tent = rt.state.tacticalEntities[ti];
      if (tent.kind === 'thermal-decoy' && dist2(tent.x, tent.y, empX, empY) <= (empR + (tent.r || 15)) * (empR + (tent.r || 15))) {
        var novaR = 260;
        AudioFX.blast();
        rt.state.shake = Math.max(rt.state.shake || 0, 16);
        if (rt.state.shockRings) {
          rt.state.shockRings.push({
            x: tent.x,
            y: tent.y,
            r: 15,
            maxR: novaR,
            life: 0.4,
            maxLife: 0.4,
            color: '#ff4d2e'
          });
        }
        spawnParticles(tent.x, tent.y, '#ff4d2e', 32, 260, 4.5);
        spawnParticles(tent.x, tent.y, '#ffd27d', 20, 200, 3);
        logEvent('DECOY SUPERNOVA! // PLASMA CASCADE');
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'DECOY SUPERNOVA! // PLASMA CASCADE';

        for (var dnei = rt.state.enemies.length - 1; dnei >= 0; dnei -= 1) {
          var dne = rt.state.enemies[dnei];
          if (dist2(tent.x, tent.y, dne.x, dne.y) <= (novaR + dne.r) * (novaR + dne.r)) {
            damageEnemy(dne, 45, { source: 'decoy-supernova', x: tent.x, y: tent.y });
            dne.empTimer = Math.max(dne.empTimer || 0, 3.2);
            onEnemyEmp(dne);
            spawnParticles(dne.x, dne.y, '#ff4d2e', 8, 140, 2.5);
            if (dne.hp <= 0) killEnemy(dne, 'decoy-supernova');
          }
        }
        tent.life = 0;
        tent.hp = 0;
        decoySupernovaTriggered = true;
      }
    }
  }

  if (hitCount >= 2 && !isReducedMotion()) {
    rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.03);
  }

  logEvent('EMP BLAST // SECTOR DISRUPTED');
  if (rt.ui && rt.ui.statusText && !decoySupernovaTriggered) {
    rt.ui.statusText.textContent = 'EMP BLAST DISCHARGED // SECTOR DISRUPTED';
  }

  if (rt.state.spires && rt.state.spires.length > 0) {
    for (var si = 0; si < rt.state.spires.length; si += 1) {
      var spire = rt.state.spires[si];
      if (dist2(spire.x, spire.y, empX, empY) <= (empR + spire.r) * (empR + spire.r)) {
        triggerSpireResonance(spire);
      }
    }
  }
  onEmp(p, { x: empX, y: empY, r: empR });
  pushFxEvent('emp', empX, empY, { r: empR });
}

export function triggerSpireResonance(spire) {
  if (!rt.state || !spire) return;
  var megaR = 280;
  spire.resonanceTimer = 1.5;

  if (rt.state.enemyBullets) {
    for (var bi = rt.state.enemyBullets.length - 1; bi >= 0; bi -= 1) {
      var eb = rt.state.enemyBullets[bi];
      if (dist2(eb.x, eb.y, spire.x, spire.y) <= megaR * megaR) {
        spawnParticles(eb.x, eb.y, '#5be7ff', 6, 110, 2);
        spawnParticles(eb.x, eb.y, '#ffffff', 4, 130, 2);
        rt.state.enemyBullets.splice(bi, 1);
      }
    }
  }

  var chainHits = 0;
  if (rt.state.enemies) {
    for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
      var enemy = rt.state.enemies[ei];
      var ed2 = dist2(enemy.x, enemy.y, spire.x, spire.y);
      if (ed2 <= (megaR + enemy.r) * (megaR + enemy.r)) {
        chainHits += 1;
        damageEnemy(enemy, 40, { source: 'spire', x: spire.x, y: spire.y });
        enemy.empTimer = Math.max(enemy.empTimer || 0, 3.0);
        onEnemyEmp(enemy);
        if (enemy.kind === 'elite' && (enemy.affix === 'mirror' || enemy.affix2 === 'mirror')) {
          enemy.shieldBrokenTimer = Math.max(enemy.shieldBrokenTimer || 0, 3.0);
        }
        spawnParticles(enemy.x, enemy.y, '#5be7ff', 10, 150, 3);
        if (enemy.hp <= 0) {
          killEnemy(enemy, 'spire');
        }
      }
    }
  }
  noteContractEvent('spire-chain', { hits: chainHits });

  if (rt.state.shockRings) {
    rt.state.shockRings.push({
      x: spire.x,
      y: spire.y,
      r: 16,
      maxR: megaR,
      life: 0.45,
      maxLife: 0.45,
      color: '#5be7ff'
    });
    rt.state.shockRings.push({
      x: spire.x,
      y: spire.y,
      r: 10,
      maxR: megaR * 0.7,
      life: 0.3,
      maxLife: 0.3,
      color: '#ffffff'
    });
  }

  spawnParticles(spire.x, spire.y, '#5be7ff', 32, 280, 4);
  spawnParticles(spire.x, spire.y, '#ffffff', 20, 200, 3);

  rt.state.shake = Math.max(rt.state.shake, 14);
  triggerHaptic([40, 30, 40, 60]);
  if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
  if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();

  logEvent('CONDUCTION SPIRE // MEGA EMP DETONATED 280PX');
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'CONDUCTION SPIRE RESONANCE // MEGA EMP 280PX [STUN 3.0s]';
  pushFxEvent('spire', spire.x, spire.y, { r: megaR });
}

export function triggerSpireAbsorption(spire, b) {
  if (!rt.state || !spire) return;
  spire.resonanceTimer = Math.max(spire.resonanceTimer || 0, 0.6);
  spire.overload = (spire.overload || 0) + 1;
  spawnParticles(spire.x, spire.y, '#5be7ff', 8, 130, 2.5);

  // Refract 3 chain lightning arcs to nearby enemies
  if (rt.state.enemies && rt.state.enemies.length > 0) {
    var candidates = [];
    for (var i = 0; i < rt.state.enemies.length; i += 1) {
      var foe = rt.state.enemies[i];
      if (!foe || foe.hp <= 0 || foe.burrowed) continue;
      var d = dist2(spire.x, spire.y, foe.x, foe.y);
      if (d <= 220 * 220) {
        candidates.push({ foe: foe, dist2: d });
      }
    }
    candidates.sort(function (e1, e2) { return e1.dist2 - e2.dist2; });
    var targetCount = Math.min(3, candidates.length);
    for (var ci = 0; ci < targetCount; ci += 1) {
      var tgt = candidates[ci].foe;
      if (rt.state.lightningArcs) {
        rt.state.lightningArcs.push({
          x1: spire.x,
          y1: spire.y,
          x2: tgt.x,
          y2: tgt.y,
          life: 0.16,
          maxLife: 0.16,
          color: '#5be7ff'
        });
      }
      var arcDmg = Math.max(15, Math.round((b ? b.damage : 25) * 0.8));
      damageEnemy(tgt, arcDmg, { source: 'spire', x: spire.x, y: spire.y });
      tgt.empTimer = Math.max(tgt.empTimer || 0, 0.8);
      onEnemyEmp(tgt);
      spawnParticles(tgt.x, tgt.y, '#5be7ff', 5, 90, 2);
      if (tgt.hp <= 0) killEnemy(tgt, 'spire');
    }
  }

  // Trigger 280px mega EMP on overload (>= 5 bullets absorbed)
  if (spire.overload >= 5) {
    spire.overload = 0;
    triggerSpireResonance(spire);
  }
}

export function triggerSpireMicroResonance(spire, srcX, srcY) {
  if (!rt.state || !spire) return;
  if (rt.state.lightningArcs) {
    rt.state.lightningArcs.push({
      x1: srcX,
      y1: srcY,
      x2: spire.x,
      y2: spire.y,
      life: 0.16,
      maxLife: 0.16,
      color: '#5be7ff'
    });
  }
  spire.resonanceTimer = Math.max(spire.resonanceTimer || 0, 0.6);
  spawnParticles(spire.x, spire.y, '#5be7ff', 10, 140, 2.5);

  if (rt.state.enemyBullets) {
    for (var bi = rt.state.enemyBullets.length - 1; bi >= 0; bi -= 1) {
      var eb = rt.state.enemyBullets[bi];
      if (dist2(eb.x, eb.y, spire.x, spire.y) <= 90 * 90) {
        spawnParticles(eb.x, eb.y, '#5be7ff', 4, 80, 2);
        rt.state.enemyBullets.splice(bi, 1);
      }
    }
  }
  if (rt.state.enemies) {
    for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
      var enemy = rt.state.enemies[ei];
      if (dist2(enemy.x, enemy.y, spire.x, spire.y) <= (90 + enemy.r) * (90 + enemy.r)) {
        damageEnemy(enemy, 15, { source: 'spire', x: spire.x, y: spire.y });
        enemy.empTimer = Math.max(enemy.empTimer || 0, 1.0);
        onEnemyEmp(enemy);
        spawnParticles(enemy.x, enemy.y, '#5be7ff', 6, 100, 2);
        if (enemy.hp <= 0) killEnemy(enemy, 'spire');
      }
    }
  }
}

export function triggerReactiveArmor(threatX, threatY) {
  if (!rt.state) return;
  var p = rt.state.player;
  var pulseR = 75;
  var pulseDmg = p.overchargeRetaliation ? 66 : 30;
  rt.state.shockRings.push({
    x: p.x,
    y: p.y,
    r: 8,
    maxR: p.overchargeRetaliation ? pulseR * 1.3 : pulseR,
    life: 0.22,
    maxLife: 0.22,
    color: p.overchargeRetaliation ? '#ff6030' : '#f0cf88'
  });
  spawnParticles(p.x, p.y, p.overchargeRetaliation ? '#ff6030' : '#f0cf88', 16, 160, 3);
  rt.state.shake = Math.max(rt.state.shake, p.overchargeRetaliation ? 8 : 6);
  for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
    var enemy = rt.state.enemies[ei];
    if (dist2(p.x, p.y, enemy.x, enemy.y) <= (pulseR + enemy.r) * (pulseR + enemy.r)) {
      damageEnemy(enemy, pulseDmg, { source: 'armor', x: p.x, y: p.y });
      var pdx = enemy.x - p.x;
      var pdy = enemy.y - p.y;
      var pd = Math.hypot(pdx, pdy) || 1;
      var kbDist = p.overchargeRetaliation ? 45 : 30;
      enemy.x += (pdx / pd) * kbDist;
      enemy.y += (pdy / pd) * kbDist;
      spawnParticles(enemy.x, enemy.y, p.overchargeRetaliation ? '#ff6030' : '#f0cf88', 6, 110, 2);
      if (enemy.hp <= 0) killEnemy(enemy, 'other');
    }
  }

  if (p.overchargeRetaliation) {
    var spikeAngle;
    if (typeof threatX === 'number' && typeof threatY === 'number') {
      spikeAngle = Math.atan2(p.y - threatY, p.x - threatX);
    } else {
      spikeAngle = (typeof p.aim === 'number') ? p.aim : 0;
    }
    var spikeSpeed = 1100;
    rt.state.bullets.push({
      x: p.x + Math.cos(spikeAngle) * (p.r + 10),
      y: p.y + Math.sin(spikeAngle) * (p.r + 10),
      vx: Math.cos(spikeAngle) * spikeSpeed,
      vy: Math.sin(spikeAngle) * spikeSpeed,
      r: 6.0,
      damage: 95,
      life: 1.5,
      trail: [],
      pierce: 99,
      bounces: 0,
      hits: [],
      knockback: 45,
      isOverchargeSpike: true,
      colorTrail: 'rgba(255, 96, 48, 0.55)',
      colorCore: '#ff5533'
    });
    if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
    rt.state.shake = Math.max(rt.state.shake, 8);
    spawnParticles(p.x, p.y, '#ff4d2e', 14, 180, 3.5);
    logEvent('OVERCHARGE RETALIATION // RETALIATORY SPIKE FIRED');
  }
}

export function triggerTeslaCoil(orb) {
  if (!rt.state || !rt.state.enemies.length) return;
  var maxRange2 = 260 * 260;
  var candidates = rt.state.enemies.filter(function (e) {
    return dist2(orb.x, orb.y, e.x, e.y) <= maxRange2;
  });
  if (!candidates.length) return;
  var sorted = candidates.slice().sort(function (a, b) {
    return dist2(orb.x, orb.y, a.x, a.y) - dist2(orb.x, orb.y, b.x, b.y);
  });
  var targets = sorted.slice(0, 2);
  targets.forEach(function (tgt) {
    damageEnemy(tgt, 22, { source: 'tesla', x: orb.x, y: orb.y });
    rt.state.lightningArcs.push({
      x1: orb.x,
      y1: orb.y,
      x2: tgt.x,
      y2: tgt.y,
      life: 0.1,
      maxLife: 0.1
    });
    spawnParticles(tgt.x, tgt.y, '#a8f5e5', 6, 110, 2);
    if (tgt.hp <= 0) killEnemy(tgt, 'other');
  });
  if (rt.state.spires && rt.state.spires.length > 0) {
    for (var tsi = 0; tsi < rt.state.spires.length; tsi += 1) {
      var tspire = rt.state.spires[tsi];
      if (dist2(orb.x, orb.y, tspire.x, tspire.y) <= 180 * 180) {
        triggerSpireMicroResonance(tspire, orb.x, orb.y);
      }
    }
  }
  AudioFX.hit();
}
