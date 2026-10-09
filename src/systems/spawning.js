import { AudioFX } from '../audio/audio-fx.js';
import { TAU } from '../config.js';
import { spawnParticles } from '../core/pools.js';
import { rt } from '../core/runtime.js';
import { triggerHaptic } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { logEvent } from '../ui/hud.js';

export function rebuildTerrain() {
  rt.terrain = [];
  var count = Math.max(38, Math.round((rt.ui.width * rt.ui.height) / 10500));
  var seed = 7919;
  function next() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  for (var i = 0; i < count; i += 1) {
    var x = next() * rt.ui.width;
    var y = next() * rt.ui.height;
    var size = 3 + next() * 13;
    rt.terrain.push({ x: x, y: y, size: size, rot: next() * TAU, kind: next() > 0.72 ? 'scrap' : 'rock' });
  }
}

export function spawnEnemy() {
  if (!rt.state) return;
  var side = Math.floor(Math.random() * 4);
  var margin = 42;
  var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var x = side === 0 ? -margin : side === 1 ? boundW + margin : Math.random() * boundW;
  var y = side === 2 ? -margin : side === 3 ? boundH + margin : Math.random() * boundH;
  var roll = Math.random();
  var eliteChance = rt.state.wave >= 3 ? Math.min(0.045 + (rt.state.wave - 3) * 0.012, 0.14) : 0;
  var kind;
  if (Math.random() < eliteChance) {
    kind = 'elite';
  } else if (rt.state.wave >= 2 && Math.random() < 0.15) {
    kind = 'artillery';
  } else {
    kind = roll < 0.16 + Math.min(0.1, rt.state.wave * 0.012) ? 'rusher' : roll > 0.87 ? 'brute' : 'crawler';
  }
  var e;
  if (kind === 'elite') {
    var affixes = ['mirror', 'vortex', 'command', 'blink'];
    var chosenAffix = rt.state.wave >= 4 ? affixes[Math.floor(Math.random() * affixes.length)] : null;
    e = {
      kind: kind,
      x: x,
      y: y,
      r: 19,
      hp: 190 + rt.state.wave * 24,
      maxHp: 190 + rt.state.wave * 24,
      speed: 43 + rt.state.wave * 1.8,
      damage: 20 + rt.state.wave * 1.3,
      color: '#75d1b0',
      touchCooldown: 0,
      phase: Math.random() * TAU,
      shootCd: 3.5,
      ringTriggered: false,
      affix: chosenAffix,
      shieldAngle: 0,
      shieldBrokenTimer: 0,
      commandTimer: 2.5,
      blinkTimer: 3.2,
      blinkTelegraph: false
    };
  } else if (kind === 'brute') {
    e = { kind: kind, x: x, y: y, r: 23, hp: 125 + rt.state.wave * 16, maxHp: 125 + rt.state.wave * 16, speed: 32 + rt.state.wave * 1.4, damage: 25 + rt.state.wave * 1.6, color: '#bd573f', touchCooldown: 0, phase: Math.random() * TAU };
  } else if (kind === 'rusher') {
    e = { kind: kind, x: x, y: y, r: 10, hp: 26 + rt.state.wave * 5, maxHp: 26 + rt.state.wave * 5, speed: 91 + rt.state.wave * 3.2, damage: 9 + rt.state.wave * 0.8, color: '#e1a644', touchCooldown: 0, phase: Math.random() * TAU, burstCd: 1.5 + Math.random() * 1.0, burstTime: 0, burstAngle: 0, trail: [] };
  } else if (kind === 'artillery') {
    e = {
      kind: kind,
      x: x,
      y: y,
      r: 16,
      hp: 85 + rt.state.wave * 12,
      maxHp: 85 + rt.state.wave * 12,
      speed: 28 + rt.state.wave * 1.2,
      damage: 18 + rt.state.wave,
      color: '#d69e2e',
      touchCooldown: 0,
      phase: Math.random() * TAU,
      timeAlive: 0,
      deployed: false,
      siegeTimer: 0,
      cooldown: 0,
      barrelAngle: 0
    };
  } else {
    e = { kind: kind, x: x, y: y, r: 14, hp: 43 + rt.state.wave * 7, maxHp: 43 + rt.state.wave * 7, speed: 51 + rt.state.wave * 2.1, damage: 13 + rt.state.wave, color: '#8d7861', touchCooldown: 0, phase: Math.random() * TAU };
  }
  rt.state.enemies.push(e);
}

export function spawnTitan() {
  if (!rt.state) return;
  AudioFX.stormSiren();
  rt.state.banner = 3.5;
  rt.state.bannerText = 'WARNING // TITAN DETECTED';
  rt.state.shake = Math.max(rt.state.shake, 14);
  triggerHaptic([40, 40, 60, 40, 80]);
  logEvent('WARNING // TITAN DETECTED');
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'WARNING // TITAN DETECTED';

  var boundW = rt.ui ? rt.ui.width : rt.state.width;
  var titanHp = 650 + (rt.state.wave - 5) * 120;
  var titan = {
    kind: 'titan',
    x: boundW / 2,
    y: -40,
    r: 32,
    hp: titanHp,
    maxHp: titanHp,
    speed: 36,
    damage: 28 + rt.state.wave * 1.5,
    color: '#e69535',
    touchCooldown: 0,
    phase: 0,
    shootCd: 2.8,
    shootAlt: false,
    phase2Triggered: false,
    spiralCd: 3.2,
    spiralAngle: 0,
    summonCd: 6.0,
    empTimer: 0,
    leftCannonHp: Math.round(titanHp * 0.22),
    leftCannonMaxHp: Math.round(titanHp * 0.22),
    leftCannonDestroyed: false,
    rightPodHp: Math.round(titanHp * 0.22),
    rightPodMaxHp: Math.round(titanHp * 0.22),
    rightPodDestroyed: false
  };
  rt.state.enemies.push(titan);
}

export function spawnBarrels() {
  if (!rt.state) return;
  if (!rt.state.barrels) rt.state.barrels = [];
  var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var p = rt.state.player || { x: boundW / 2, y: boundH / 2 };
  var margin = 70;
  var count = 2 + Math.floor(Math.random() * 2);
  for (var bi = 0; bi < count; bi += 1) {
    var bx = margin + Math.random() * (boundW - margin * 2);
    var by = margin + Math.random() * (boundH - margin * 2);
    for (var bTry = 0; bTry < 12; bTry += 1) {
      if (Math.hypot(bx - p.x, by - p.y) >= 120) break;
      bx = margin + Math.random() * (boundW - margin * 2);
      by = margin + Math.random() * (boundH - margin * 2);
    }
    if (Math.hypot(bx - p.x, by - p.y) < 120) {
      var bAngle = Math.atan2(by - p.y, bx - p.x);
      bx = clamp(p.x + Math.cos(bAngle) * 120, margin, boundW - margin);
      by = clamp(p.y + Math.sin(bAngle) * 120, margin, boundH - margin);
    }
    rt.state.barrels.push({
      x: bx,
      y: by,
      vx: 0,
      vy: 0,
      r: 14,
      hp: 20,
      maxHp: 20,
      state: 'idle',
      flyingTimer: 0,
      rot: 0
    });
  }
}

export function spawnSpires() {
  if (!rt.state) return;
  if (!rt.state.spires) rt.state.spires = [];
  if (rt.state.wave < 3) return;
  var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var p = rt.state.player || { x: boundW / 2, y: boundH / 2 };
  var margin = 90;
  var sx = margin + Math.random() * (boundW - margin * 2);
  var sy = margin + Math.random() * (boundH - margin * 2);
  for (var sTry = 0; sTry < 40; sTry += 1) {
    if (Math.hypot(sx - p.x, sy - p.y) >= 160) break;
    sx = margin + Math.random() * (boundW - margin * 2);
    sy = margin + Math.random() * (boundH - margin * 2);
  }
  if (Math.hypot(sx - p.x, sy - p.y) < 150) {
    sx = p.x < boundW / 2 ? (boundW - margin) : margin;
    sy = p.y < boundH / 2 ? (boundH - margin) : margin;
  }
  rt.state.spires.push({
    x: sx,
    y: sy,
    r: 18,
    resonanceTimer: 0,
    pulseTimer: 0
  });
}

export function fireArtillery(e) {
  if (!rt.state) return;
  var p = rt.state.player;
  var boundW = rt.ui ? rt.ui.width : rt.state.width;
  var boundH = rt.ui ? rt.ui.height : rt.state.height;
  // 預測落點公式：P_target = P_player + v_player * (1.2 * 0.85) + 微隨機偏移(±15px)
  var pvx = p.vx || 0;
  var pvy = p.vy || 0;
  var offsetX = (Math.random() - 0.5) * 30;
  var offsetY = (Math.random() - 0.5) * 30;
  var targetX = clamp(p.x + pvx * (1.2 * 0.85) + offsetX, 46, boundW - 46);
  var targetY = clamp(p.y + pvy * (1.2 * 0.85) + offsetY, 46, boundH - 46);

  rt.state.artilleryTargets.push({
    x: targetX,
    y: targetY,
    r: 46,
    timer: 1.2,
    maxTimer: 1.2,
    wave: rt.state.wave,
    state: 'warning',
    damageTickTimer: 0
  });

  AudioFX.mortarLaunch();
  var bAngle = Math.atan2(targetY - e.y, targetX - e.x);
  e.barrelAngle = bAngle;
  var mx = e.x + Math.cos(bAngle) * (e.r + 10);
  var my = e.y + Math.sin(bAngle) * (e.r + 10);
  spawnParticles(mx, my, '#f5a623', 8, 120, 3);
  spawnParticles(mx, my, '#d69e2e', 5, 80, 2);
}
