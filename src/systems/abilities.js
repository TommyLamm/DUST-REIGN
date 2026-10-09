import { AudioFX } from '../audio/audio-fx.js';
import { DASH_PULSE_DURATION, DASH_PULSE_RADIUS } from '../config.js';
import { addDecal, spawnParticles } from '../core/pools.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../core/settings.js';
import { clamp, dist2 } from '../core/utils.js';
import { onDash, onEmp } from './card-effects.js';
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
  var startX = p.x;
  var startY = p.y;

  var isJustDash = false;
  if (rt.state.enemyBullets && rt.state.enemyBullets.length > 0) {
    for (var bi = 0; bi < rt.state.enemyBullets.length; bi += 1) {
      var eb = rt.state.enemyBullets[bi];
      var ebRadius = eb.r || 4;
      var bDist = p.r + ebRadius + 20;
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
      var eDist = p.r + enemyRadius + 15;
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
  var boundW = rt.ui ? rt.ui.width : rt.state.width;
  var boundH = rt.ui ? rt.ui.height : rt.state.height;
  var dashDist = (typeof p.dashDistance === 'number' && p.dashDistance > 0) ? p.dashDistance : 140;
  p.x = clamp(p.x + (dx / length) * dashDist, p.r, boundW - p.r);
  p.y = clamp(p.y + (dy / length) * dashDist, p.r, boundH - p.r);
  addDecal(p.x, p.y, 6, 8, 0.35, '#141210');
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
  p.invulnerable = Math.max(p.invulnerable, 0.32);
  p.dashPulse = DASH_PULSE_DURATION;
  p.dashAmbushTimer = isJustDash ? 1.2 : 0.6;
  AudioFX.dash();
  if (isJustDash) {
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
  var hitCount = 0;
  var pulseRadius = p.shockwaveDash ? 125 : DASH_PULSE_RADIUS;
  var kbDistance = (p.shockwaveDash ? 50 : 25) * (isJustDash ? 1.8 : 1);
  var pulseDamage = p.damage * (isJustDash ? 2.2 : 0.8);
  for (var di = rt.state.enemies.length - 1; di >= 0; di -= 1) {
    var enemy = rt.state.enemies[di];
    if (dist2(p.x, p.y, enemy.x, enemy.y) > pulseRadius * pulseRadius) continue;
    hitCount += 1;
    damageEnemy(enemy, pulseDamage, { source: 'dash', x: p.x, y: p.y });
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
        barrel.vx = dirX * 480;
        barrel.vy = dirY * 480;
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

  var boundW = rt.ui ? rt.ui.width : rt.state.width;
  var boundH = rt.ui ? rt.ui.height : rt.state.height;

  var empX;
  var empY;
  if (drop && typeof drop.x === 'number' && typeof drop.y === 'number') {
    empX = drop.x;
    empY = drop.y;
  } else {
    empX = rt.input.mouse.x;
    empY = rt.input.mouse.y;
    if (rt.input.touchMode || !rt.input.mouse || (rt.input.gamepadX || rt.input.gamepadY) || isNaN(empX) || isNaN(empY)) {
      empX = p.x + Math.cos(p.aim) * 85;
      empY = p.y + Math.sin(p.aim) * 85;
    }
  }
  empX = clamp(empX, 20, boundW - 20);
  empY = clamp(empY, 20, boundH - 20);

  var empR = 140 + ((typeof p.empRadiusBonus === 'number') ? p.empRadiusBonus : 0);

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
      }
      spawnParticles(enemy.x, enemy.y, '#5be7ff', 8, 130, 2.5);
      if (enemy.hp <= 0) {
        killEnemy(enemy, 'emp');
      }
    }
  }

  if (hitCount >= 2 && !isReducedMotion()) {
    rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.03);
  }

  logEvent('EMP BLAST // SECTOR DISRUPTED');
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'EMP BLAST DISCHARGED // SECTOR DISRUPTED';

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

function triggerSpireResonance(spire) {
  if (!rt.state || !spire) return;
  var megaR = 260;
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

  logEvent('CONDUCTION SPIRE // MEGA EMP DETONATED 260PX');
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'CONDUCTION SPIRE RESONANCE // MEGA EMP 260PX [STUN 3.0s]';
  pushFxEvent('spire', spire.x, spire.y, { r: megaR });
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
