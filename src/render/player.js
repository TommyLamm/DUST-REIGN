import { DASH_PULSE_DURATION, DASH_PULSE_RADIUS, TAU } from '../config.js';
import { addVisualDecal } from './terrain.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { ensureFx, keyGlowsOnly, outline, tickFlash, trackStep } from './entity-style.js';
import { PALETTE } from './palette.js';
import { drawGlow } from './sprites.js';

function updateFacing(fx, fallback) {
  if (fx.moved > 0.75) {
    var ang = Math.atan2(fx.dy, fx.dx);
    if (fx.moveAng == null) fx.moveAng = ang;
    else {
      var diff = Math.atan2(Math.sin(ang - fx.moveAng), Math.cos(ang - fx.moveAng));
      fx.moveAng += diff * 0.4;
    }
  } else if (fx.moveAng == null) {
    fx.moveAng = fallback || 0;
  }
}

function ensureTrail(fx) {
  if (fx.dashTrail) return;
  fx.dashTrail = [
    { x: 0, y: 0, aim: 0, move: 0, life: 0 },
    { x: 0, y: 0, aim: 0, move: 0, life: 0 },
    { x: 0, y: 0, aim: 0, move: 0, life: 0 }
  ];
}

function noteDash(p, fx) {
  ensureTrail(fx);
  var i;
  for (i = 0; i < fx.dashTrail.length; i += 1) {
    if (fx.dashTrail[i].life > 0) {
      fx.dashTrail[i].life -= rt.renderDt || 0;
      if (fx.dashTrail[i].life < 0) fx.dashTrail[i].life = 0;
    }
  }
  if (!(fx.moved > 48)) return;
  var ox = p.x - fx.dx;
  var oy = p.y - fx.dy;
  var move = fx.moveAng == null ? p.aim : fx.moveAng;
  for (i = 0; i < fx.dashTrail.length; i += 1) {
    var t = (i + 1) / 4;
    var slot = fx.dashTrail[i];
    slot.x = ox + fx.dx * t;
    slot.y = oy + fx.dy * t;
    slot.aim = p.aim;
    slot.move = move;
    slot.life = 0.16 + i * 0.05;
  }
}

function noteChrono(p, fx) {
  if (fx.moved > 70 && (p.dashAmbushTimer || 0) > 0.85) {
    fx.chronoUntil = (rt.renderTime || 0) + 0.28;
  }
}

function noteFoot(p, fx) {
  fx.foot = (fx.foot || 0) + (fx.moved || 0);
  if (fx.foot < 26) return;
  fx.foot = 0;
  addVisualDecal(p.x, p.y, 4.5, 5.5, 0.22, '#15120e');
}

function drawLimb(ctx, r, side, phase, flashing) {
  var hipY = side * r * 0.46;
  var kneeX = Math.sin(phase) * r * 0.5;
  var kneeY = side * r * 0.86;
  var footX = Math.sin(phase) * r * 0.22;
  var footY = side * r * 1.18;
  ctx.strokeStyle = flashing ? '#ffffff' : '#14302c';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  ctx.strokeStyle = flashing ? '#ffffff' : '#9fd9cc';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  ctx.fillStyle = flashing ? '#ffffff' : '#e7d7b0';
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(footX - 7, footY - 3.4, 15, 7);
  ctx.fill();
  ctx.stroke();
}

function drawLegs(ctx, p, fx, flashing, reduced, ghost) {
  var r = p.r;
  var phase = reduced ? 0 : Math.sin((fx.step || 0) * 0.2);
  drawLimb(ctx, r, -1, phase, flashing);
  drawLimb(ctx, r, 1, -phase, flashing);
  ctx.fillStyle = flashing ? '#ffffff' : '#142826';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.36, r * 0.5, 0, 0, TAU);
  ctx.fill();
  outline(ctx, 1.4);
  ctx.fillStyle = flashing ? '#ffffff' : '#24564e';
  ctx.fillRect(-r * 1.08, -r * 0.34, r * 0.5, r * 0.68);
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-r * 1.08, -r * 0.34, r * 0.5, r * 0.68);
  ctx.fillStyle = flashing ? '#ffffff' : '#d7c094';
  ctx.fillRect(-r * 1.02, -r * 0.12, r * 0.16, r * 0.24);
  if (!ghost && p.dashPulse > 0) drawThrusters(ctx, p, reduced);
}

function drawThrusters(ctx, p, reduced) {
  var r = p.r;
  var a = clamp(p.dashPulse / DASH_PULSE_DURATION, 0, 1);
  var len = r * (0.55 + a * 0.85);
  var flare = reduced ? 0 : Math.sin((rt.renderTime || 0) * 28) * 1.5;
  if (!keyGlowsOnly()) {
    drawGlow(ctx, -r * 1.15 - len * 0.4, -r * 0.16, 12, PALETTE.emissive.gold, 0.45 * a + 0.2);
    drawGlow(ctx, -r * 1.15 - len * 0.4, r * 0.16, 12, PALETTE.emissive.hostile, 0.4 * a + 0.15);
  }
  ctx.fillStyle = '#fff4d0';
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, -r * 0.22);
  ctx.lineTo(-r * 0.62 - len, -r * 0.05 + flare);
  ctx.lineTo(-r * 0.62, -r * 0.08);
  ctx.fill();
  ctx.fillStyle = '#ffb15a';
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, r * 0.08);
  ctx.lineTo(-r * 0.62 - len, r * 0.05 - flare);
  ctx.lineTo(-r * 0.62, r * 0.22);
  ctx.fill();
}

function hullPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r * 0.62, 0);
  ctx.lineTo(r * 0.22, r * 0.5);
  ctx.lineTo(-r * 0.5, r * 0.4);
  ctx.lineTo(-r * 0.62, 0);
  ctx.lineTo(-r * 0.5, -r * 0.4);
  ctx.lineTo(r * 0.22, -r * 0.5);
  ctx.closePath();
}

function drawWeapon(ctx, p, kick, flashing, ghost) {
  var r = p.r;
  var mode = p.weaponMode || 'standard';
  var metal = flashing ? '#ffffff' : '#d7c094';
  var trim = flashing ? '#ffffff' : '#f4e2b4';
  var chargeNeed = (typeof p.chargeNeed === 'number' && p.chargeNeed > 0) ? p.chargeNeed : 0.6;
  var charge = clamp((p.chargeTime || 0) / chargeNeed, 0, 1);
  if (mode === 'breacher') {
    var bx = r * 0.12 - kick;
    ctx.fillStyle = metal;
    ctx.fillRect(bx, -6.2, r * 0.62, 12.4);
    ctx.fillStyle = trim;
    ctx.fillRect(bx + r * 0.62 - 2, -7.2, 7, 14.4);
    ctx.fillStyle = flashing ? '#ffffff' : '#2c2822';
    ctx.fillRect(-r * 0.15, -r * 0.95, 11, 13);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-r * 0.15, -r * 0.95, 11, 13);
    ctx.strokeStyle = flashing ? '#ffffff' : '#e7d3a8';
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, -r * 0.88);
    ctx.lineTo(-r * 0.02, -r * 0.22);
    ctx.moveTo(-r * 0.12, -r * 0.55);
    ctx.lineTo(r * 0.1, -r * 0.55);
    ctx.stroke();
    if (!ghost && (p.recoil || 0) > 0.05) drawMuzzle(ctx, mode, bx + r * 0.62 + 6, p.recoil);
    return;
  }
  if (mode === 'vanguard') {
    var vx = r * 0.12 - kick;
    var vlen = r + 22;
    ctx.fillStyle = flashing ? '#ffffff' : '#8fd0d8';
    ctx.fillRect(vx, -1.6, vlen, 3.2);
    ctx.fillStyle = flashing ? '#ffffff' : '#16343a';
    ctx.fillRect(vx - 2, -3.2, 6, 6.4);
    var seg;
    for (seg = 0; seg < 5; seg += 1) {
      var on = p.isCharging && charge >= (seg + 1) / 5;
      ctx.fillStyle = on ? '#e8fbff' : '#1a3c44';
      ctx.fillRect(vx + 8 + seg * ((vlen - 16) / 5), -2.4, 4.2, 4.8);
    }
    if (!ghost && p.isCharging && charge > 0.05 && !keyGlowsOnly()) {
      drawGlow(ctx, vx + vlen, 0, 8 + charge * 10, PALETTE.emissive.tech, 0.35 + charge * 0.4);
    }
    if (!ghost && (p.recoil || 0) > 0.05) drawMuzzle(ctx, mode, vx + vlen, p.recoil);
    return;
  }
  if (mode === 'arc-welder') {
    var ax = r * 0.28 - kick;
    var tip = ax + r * 0.95;
    ctx.strokeStyle = flashing ? '#ffffff' : '#b7fff0';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, -3.5);
    ctx.lineTo(tip, -8);
    ctx.moveTo(ax, 3.5);
    ctx.lineTo(tip, 8);
    ctx.stroke();
    ctx.fillStyle = flashing ? '#ffffff' : '#e8fff8';
    ctx.beginPath();
    ctx.arc(tip, -8, 2.1, 0, TAU);
    ctx.arc(tip, 8, 2.1, 0, TAU);
    ctx.fill();
    if (!ghost && (p.recoil || 0) > 0.05) drawMuzzle(ctx, mode, tip + 4, p.recoil);
    else if (!ghost) drawIdleArc(ctx, tip);
    return;
  }
  var x0 = r * 0.16 - kick;
  var len = r + 16;
  ctx.fillStyle = metal;
  ctx.fillRect(x0, -5.1, len, 3.3);
  ctx.fillRect(x0, 1.8, len, 3.3);
  ctx.fillStyle = trim;
  ctx.fillRect(x0 + len - 4, -5.6, 5.5, 4.3);
  ctx.fillRect(x0 + len - 4, 1.3, 5.5, 4.3);
  if (!ghost && (p.recoil || 0) > 0.05) drawMuzzle(ctx, 'standard', x0 + len + 2, p.recoil);
}

function drawIdleArc(ctx, tip) {
  var reduced = isReducedMotion();
  var mid = reduced ? 0 : Math.sin((rt.renderTime || 0) * 22) * 3.2;
  ctx.strokeStyle = 'rgba(168, 245, 229, 0.9)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(tip, -8);
  ctx.lineTo(tip + 5, mid);
  ctx.lineTo(tip, 8);
  ctx.stroke();
  if (!keyGlowsOnly()) drawGlow(ctx, tip + 2, 0, 8, PALETTE.emissive.tech, 0.22);
}

function drawMuzzle(ctx, mode, tip, recoil) {
  var s = 2.4 + recoil * 3.2;
  ctx.fillStyle = '#fff6d8';
  if (mode === 'breacher') {
    ctx.beginPath();
    ctx.moveTo(tip - 2, 0);
    ctx.lineTo(tip + s * 0.9, s * 1.15);
    ctx.lineTo(tip + s * 1.35, 0);
    ctx.lineTo(tip + s * 0.9, -s * 1.15);
    ctx.closePath();
    ctx.fill();
    drawGlow(ctx, tip + 2, 0, s + 6, '#ffb15a', 0.55);
    return;
  }
  if (mode === 'vanguard') {
    ctx.fillRect(tip, -1.4, s * 3.2, 2.8);
    drawGlow(ctx, tip + s * 1.4, 0, s + 12, PALETTE.emissive.tech, 0.75);
    return;
  }
  if (mode === 'arc-welder') {
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(tip - 6, -8);
    ctx.lineTo(tip + s, -2);
    ctx.lineTo(tip + s * 0.4, 1);
    ctx.lineTo(tip + s * 1.2, 7);
    ctx.lineTo(tip - 6, 8);
    ctx.stroke();
    drawGlow(ctx, tip, 0, s + 8, PALETTE.emissive.tech, 0.65);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(tip + s * 1.5, 0);
  ctx.lineTo(tip, s);
  ctx.lineTo(tip - s * 0.7, 0);
  ctx.lineTo(tip, -s);
  ctx.closePath();
  ctx.fill();
  drawGlow(ctx, tip, 0, s + 8, '#ffe27a', 0.75);
}

function drawTurret(ctx, p, flashing, ghost) {
  var r = p.r;
  var kick = ghost ? 0 : (p.recoil || 0) * 3.5;
  hullPath(ctx, r);
  ctx.fillStyle = flashing ? '#ffffff' : '#16302c';
  ctx.fill();
  if (!flashing) {
    ctx.fillStyle = '#2f6e64';
    ctx.beginPath();
    ctx.moveTo(r * 0.62, 0);
    ctx.lineTo(r * 0.05, -r * 0.22);
    ctx.lineTo(-r * 0.15, 0);
    ctx.closePath();
    ctx.fill();
  }
  hullPath(ctx, r);
  outline(ctx, 1.6);
  if (!flashing) {
    ctx.fillStyle = PALETTE.emissive.player;
    ctx.beginPath();
    ctx.arc(-1, 0, r * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e7fff6';
    ctx.beginPath();
    ctx.arc(-2.2, -1, r * 0.07, 0, TAU);
    ctx.fill();
  }
  if (!ghost && p.overdrive > 0) {
    ctx.fillStyle = PALETTE.emissive.hostile;
    ctx.fillRect(-r * 0.58, -r * 0.38, 4, 6);
    ctx.fillRect(-r * 0.58, r * 0.16, 4, 6);
  }
  if (!ghost) drawGlow(ctx, -1, 0, r * 0.55, PALETTE.emissive.player, keyGlowsOnly() ? 0.22 : 0.3);
  drawWeapon(ctx, p, kick, flashing, ghost);
}

function drawMech(ctx, p, fx, flashing, ghost, reduced) {
  var move = fx.moveAng == null ? p.aim : fx.moveAng;
  ctx.save();
  ctx.rotate(move);
  drawLegs(ctx, p, fx, flashing, reduced, ghost);
  ctx.restore();
  ctx.save();
  ctx.rotate(fx.aim != null ? fx.aim : (p.aim || 0));
  drawTurret(ctx, p, flashing, ghost);
  ctx.restore();
}

function drawDashRing(ctx, p) {
  var pulseProgress = 1 - p.dashPulse / DASH_PULSE_DURATION;
  var pulseR = p.r + 12 + pulseProgress * (p.shockwaveDash ? 125 : DASH_PULSE_RADIUS);
  var pulseAlpha = clamp(p.dashPulse / DASH_PULSE_DURATION, 0, 1);
  ctx.save();
  ctx.globalAlpha = pulseAlpha * 0.9;
  ctx.strokeStyle = PALETTE.emissive.player;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, pulseR, 0, TAU);
  ctx.stroke();
  ctx.restore();
  if (!keyGlowsOnly()) drawGlow(ctx, p.x, p.y, Math.min(48, pulseR * 0.35), PALETTE.emissive.player, pulseAlpha * 0.35);
}

function drawStatus(ctx, p, reduced) {
  var low = p.maxHp > 0 && p.hp < p.maxHp * 0.35;
  if (p.overdrive > 0) {
    ctx.save();
    ctx.strokeStyle = PALETTE.emissive.gold;
    ctx.globalAlpha = reduced ? 0.85 : (0.62 + 0.18 * Math.sin((rt.renderTime || 0) * 4));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 13, 0, TAU);
    ctx.stroke();
    ctx.restore();
    if (!keyGlowsOnly()) drawGlow(ctx, 0, 0, p.r + 16, PALETTE.emissive.gold, reduced ? 0.28 : 0.34);
  }
  if (p.invulnerable > 0) {
    var shell = reduced ? 0.62 : (0.48 + 0.16 * Math.sin((rt.renderTime || 0) * 5));
    ctx.save();
    ctx.globalAlpha = shell;
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 9, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(91, 231, 255, 0.14)';
    ctx.fill();
    ctx.restore();
  }
  if (!low) return;
  var t = reduced ? 0 : (rt.renderTime || 0);
  var i;
  for (i = 0; i < 3; i += 1) {
    var ox = reduced ? i * 2 : Math.sin(t * 1.6 + i) * 4;
    var oy = -p.r * 0.2 - i * 5;
    ctx.save();
    ctx.globalAlpha = 0.34 - i * 0.08;
    ctx.fillStyle = '#16120e';
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5 + i * 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (reduced) return;
  if (Math.sin(t * 16) > 0.15) {
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(2, -1);
    ctx.lineTo(7, -6);
    ctx.lineTo(4, -2);
    ctx.stroke();
  }
}

export function drawPlayer(ctx) {
  if (!ctx || !rt.state || !rt.state.player) return;
  var p = rt.state.player;
  var fx = ensureFx(p);
  var flashing = tickFlash(p);
  var reduced = isReducedMotion();
  trackStep(p);
  updateFacing(fx, p.aim);
  noteDash(p, fx);
  noteChrono(p, fx);
  noteFoot(p, fx);
  if (p.dashPulse > 0) drawDashRing(ctx, p);
  var i;
  for (i = 0; i < fx.dashTrail.length; i += 1) {
    var ghost = fx.dashTrail[i];
    if (!(ghost.life > 0)) continue;
    ctx.save();
    ctx.translate(ghost.x, ghost.y);
    ctx.globalAlpha = Math.min(0.42, ghost.life * 1.8);
    drawMech(ctx, p, { step: fx.step, moveAng: ghost.move, aim: ghost.aim }, false, true, reduced);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.maxHp > 0 && p.hp < p.maxHp * 0.35) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#14110e';
    ctx.beginPath();
    ctx.arc(-2, 4, p.r * 0.55, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  drawMech(ctx, p, fx, flashing, false, reduced);
  drawStatus(ctx, p, reduced);
  ctx.restore();
}
