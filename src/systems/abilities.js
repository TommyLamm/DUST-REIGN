import { AudioFX } from '../audio/audio-fx.js';
import { DASH_PULSE_DURATION, DASH_PULSE_RADIUS } from '../config.js';
import { addDecal, spawnParticles } from '../core/pools.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../core/settings.js';
import { clamp, dist2 } from '../core/utils.js';
import { killEnemy } from './combat.js';
import { logEvent } from '../ui/hud.js';

export function dash() {
  if (!rt.state || rt.state.over || rt.state.paused || rt.state.player.dashCooldown > 0) return;
  var p = rt.state.player;
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
  p.x = clamp(p.x + (dx / length) * 140, p.r, boundW - p.r);
  p.y = clamp(p.y + (dy / length) * 140, p.r, boundH - p.r);
  addDecal(p.x, p.y, 6, 8, 0.35, '#141210');
  triggerHaptic(isJustDash ? [30, 20, 50] : [15]);
  p.dashCooldown = isJustDash ? 0.35 : 2.2;
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
    enemy.hp -= pulseDamage;
    if (rt.state.stats) rt.state.stats.damageDealt += pulseDamage;
    var kdx = enemy.x - p.x;
    var kdy = enemy.y - p.y;
    var kd = Math.hypot(kdx, kdy) || 1;
    enemy.x += (kdx / kd) * kbDistance;
    enemy.y += (kdy / kd) * kbDistance;
    spawnParticles(enemy.x, enemy.y, '#75d1b0', 7, 110, 2);
    if (enemy.hp <= 0) killEnemy(di);
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
        sEnemy.hp -= tempestDamage;
        if (rt.state.stats) rt.state.stats.damageDealt += tempestDamage;
        sEnemy.empTimer = Math.max(sEnemy.empTimer || 0, 1.8);
        if (sEnemy.kind === 'elite' && sEnemy.affix === 'mirror') {
          sEnemy.shieldBrokenTimer = 3.0;
        }
        spawnParticles(sEnemy.x, sEnemy.y, '#5be7ff', 8, 120, 2.2);
        if (sEnemy.hp <= 0) killEnemy(sti);
      }
    }
    logEvent('STATIC TEMPEST // 6-WAY CHAIN DISCHARGE');
  }
  pushFxEvent('dash', p.x, p.y, { sx: startX, sy: startY, just: isJustDash ? 1 : 0, aim: p.aim || 0 });
}

export function triggerEmp() {
  if (!rt.state || rt.state.over || rt.state.paused) return;
  var p = rt.state.player;
  if (p.energy < 50) return;
  p.energy -= 50;

  var boundW = rt.ui ? rt.ui.width : rt.state.width;
  var boundH = rt.ui ? rt.ui.height : rt.state.height;

  var empX = rt.input.mouse.x;
  var empY = rt.input.mouse.y;
  if (rt.input.touchMode || !rt.input.mouse || (rt.input.gamepadX || rt.input.gamepadY) || isNaN(empX) || isNaN(empY)) {
    empX = p.x + Math.cos(p.aim) * 85;
    empY = p.y + Math.sin(p.aim) * 85;
  }
  empX = clamp(empX, 20, boundW - 20);
  empY = clamp(empY, 20, boundH - 20);

  var empR = 140;

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
      enemy.hp -= 35;
      if (rt.state.stats) {
        rt.state.stats.damageDealt += 35;
      }
      enemy.empTimer = 2.2;
      if (enemy.kind === 'elite' && enemy.affix === 'mirror') {
        enemy.shieldBrokenTimer = 3.0;
      }
      spawnParticles(enemy.x, enemy.y, '#5be7ff', 8, 130, 2.5);
      if (enemy.hp <= 0) {
        killEnemy(ei);
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

  if (rt.state.enemies) {
    for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
      var enemy = rt.state.enemies[ei];
      var ed2 = dist2(enemy.x, enemy.y, spire.x, spire.y);
      if (ed2 <= (megaR + enemy.r) * (megaR + enemy.r)) {
        enemy.hp -= 40;
        if (rt.state.stats) {
          rt.state.stats.damageDealt += 40;
        }
        enemy.empTimer = Math.max(enemy.empTimer || 0, 3.0);
        if (enemy.kind === 'elite' && enemy.affix === 'mirror') {
          enemy.shieldBrokenTimer = Math.max(enemy.shieldBrokenTimer || 0, 3.0);
        }
        spawnParticles(enemy.x, enemy.y, '#5be7ff', 10, 150, 3);
        if (enemy.hp <= 0) {
          killEnemy(ei);
        }
      }
    }
  }

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
        enemy.hp -= 15;
        if (rt.state.stats) rt.state.stats.damageDealt += 15;
        enemy.empTimer = Math.max(enemy.empTimer || 0, 1.0);
        spawnParticles(enemy.x, enemy.y, '#5be7ff', 6, 100, 2);
        if (enemy.hp <= 0) killEnemy(ei);
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
      enemy.hp -= pulseDmg;
      if (rt.state.stats) rt.state.stats.damageDealt += pulseDmg;
      var pdx = enemy.x - p.x;
      var pdy = enemy.y - p.y;
      var pd = Math.hypot(pdx, pdy) || 1;
      var kbDist = p.overchargeRetaliation ? 45 : 30;
      enemy.x += (pdx / pd) * kbDist;
      enemy.y += (pdy / pd) * kbDist;
      spawnParticles(enemy.x, enemy.y, p.overchargeRetaliation ? '#ff6030' : '#f0cf88', 6, 110, 2);
      if (enemy.hp <= 0) killEnemy(ei);
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
    tgt.hp -= 22;
    if (rt.state.stats) rt.state.stats.damageDealt += 22;
    rt.state.lightningArcs.push({
      x1: orb.x,
      y1: orb.y,
      x2: tgt.x,
      y2: tgt.y,
      life: 0.1,
      maxLife: 0.1
    });
    spawnParticles(tgt.x, tgt.y, '#a8f5e5', 6, 110, 2);
    if (tgt.hp <= 0) {
      var idx = rt.state.enemies.indexOf(tgt);
      if (idx !== -1) killEnemy(idx);
    }
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
