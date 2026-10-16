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
    slot.life = 0.2 + i * 0.05;
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
  var hipY = side * r * 0.42;
  var kneeX = Math.sin(phase) * r * 0.26;
  var kneeY = side * r * 0.74;
  var footX = Math.sin(phase) * r * 0.45;
  var footY = side * r * 0.98;

  // Thigh hydraulic cylinder
  ctx.strokeStyle = flashing ? '#ffffff' : '#0e1c1a';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.06, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.stroke();

  // Thigh sliding chrome piston rod
  ctx.strokeStyle = flashing ? '#ffffff' : '#b8c8c6';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-r * 0.06, hipY);
  ctx.lineTo(kneeX * 0.75, hipY + (kneeY - hipY) * 0.75);
  ctx.stroke();

  // Thigh armored casing
  ctx.strokeStyle = flashing ? '#ffffff' : '#245249';
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.moveTo(-r * 0.06, hipY);
  ctx.lineTo(-r * 0.03 + kneeX * 0.5, hipY + (kneeY - hipY) * 0.5);
  ctx.stroke();

  // Knee joint circular armored cap
  ctx.fillStyle = flashing ? '#ffffff' : '#142c27';
  ctx.beginPath();
  ctx.arc(kneeX, kneeY, 4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = flashing ? '#ffffff' : '#0e1c1a';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = flashing ? '#ffffff' : '#9fd9cc';
  ctx.beginPath();
  ctx.arc(kneeX, kneeY, 1.5, 0, TAU);
  ctx.fill();

  // Shin lower leg chassis
  ctx.strokeStyle = flashing ? '#ffffff' : '#0e1c1a';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  // Shin armor greave plate with highlight trim
  ctx.strokeStyle = flashing ? '#ffffff' : '#327265';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  ctx.strokeStyle = flashing ? '#ffffff' : '#9fd9cc';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(kneeX + (footX - kneeX) * 0.25, kneeY + (footY - kneeY) * 0.25);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  // Articulated mechanical foot / combat talon
  ctx.save();
  ctx.translate(footX, footY);

  // Heel stabilizer spur
  ctx.fillStyle = flashing ? '#ffffff' : '#1a2220';
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-2, -2.8);
  ctx.lineTo(-7.5, 0);
  ctx.lineTo(-2, 2.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Main foot sole & dual forward grip talons
  ctx.fillStyle = flashing ? '#ffffff' : '#e7d7b0';
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(7.5, -3.8);
  ctx.lineTo(9.5, -1);
  ctx.lineTo(5.5, 0);
  ctx.lineTo(9.5, 1);
  ctx.lineTo(7.5, 3.8);
  ctx.lineTo(-3, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Foot ankle hinge bolt
  ctx.fillStyle = flashing ? '#ffffff' : '#28544c';
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawLegs(ctx, p, fx, flashing, reduced) {
  var r = p.r;
  // Smoothly blend walking phase to 0 when standing still
  var isMoving = (fx.moved || 0) > 0.4;
  var stepVal = fx.step || 0;
  if (!isMoving) {
    fx.idleBlend = Math.max(0, (fx.idleBlend == null ? 1 : fx.idleBlend) - (rt.renderDt || 0.016) * 6);
  } else {
    fx.idleBlend = 1;
  }
  var blend = reduced ? 0 : (fx.idleBlend != null ? fx.idleBlend : 1);
  var phase = blend * Math.sin(stepVal * 0.2);

  drawLimb(ctx, r, -1, phase, flashing);
  drawLimb(ctx, r, 1, -phase, flashing);

  // Mechanical pelvis turntable base
  ctx.fillStyle = flashing ? '#ffffff' : '#10221e';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.42, r * 0.54, 0, 0, TAU);
  ctx.fill();
  outline(ctx, 1.5);

  // Pelvis drive gear ring & center plate
  if (!flashing) {
    ctx.fillStyle = '#245249';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.3, r * 0.38, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3d8274';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Drive gear teeth notches
    ctx.strokeStyle = '#0e1c1a';
    ctx.lineWidth = 1.4;
    var gi;
    for (gi = 0; gi < 4; gi += 1) {
      var ga = (gi / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ga) * r * 0.18, Math.sin(ga) * r * 0.24);
      ctx.lineTo(Math.cos(ga) * r * 0.35, Math.sin(ga) * r * 0.44);
      ctx.stroke();
    }
  }
}

function drawThrusters(ctx, p, reduced) {
  var r = p.r;
  var a = clamp(p.dashPulse / DASH_PULSE_DURATION, 0, 1);
  var len = r * (0.75 + a * 1.3);
  var flare = reduced ? 0 : Math.sin((rt.renderTime || 0) * 32) * 2;
  var pulseScale = 0.6 + a * 0.5;

  if (!keyGlowsOnly()) {
    drawGlow(ctx, -r * 1.05 - len * 0.45, -r * 0.18, 14 * pulseScale, PALETTE.emissive.gold, 0.6 * a + 0.25);
    drawGlow(ctx, -r * 1.05 - len * 0.45, r * 0.18, 14 * pulseScale, PALETTE.emissive.hostile, 0.55 * a + 0.2);
  }

  // Upper engine rocket plume: Outer shock flame
  ctx.fillStyle = '#ff6a24';
  ctx.beginPath();
  ctx.moveTo(-r * 0.72, -r * 0.24);
  ctx.lineTo(-r * 0.72 - len, -r * 0.17 + flare);
  ctx.lineTo(-r * 0.72 - len * 0.4, -r * 0.08);
  ctx.lineTo(-r * 0.72, -r * 0.1);
  ctx.closePath();
  ctx.fill();

  // Upper engine core diamond
  ctx.fillStyle = '#fff4d0';
  ctx.beginPath();
  ctx.moveTo(-r * 0.72, -r * 0.21);
  ctx.lineTo(-r * 0.72 - len * 0.55, -r * 0.17 + flare * 0.5);
  ctx.lineTo(-r * 0.72, -r * 0.13);
  ctx.closePath();
  ctx.fill();

  // Lower engine rocket plume: Outer shock flame
  ctx.fillStyle = '#ff8a38';
  ctx.beginPath();
  ctx.moveTo(-r * 0.72, r * 0.1);
  ctx.lineTo(-r * 0.72 - len * 0.4, r * 0.08);
  ctx.lineTo(-r * 0.72 - len, r * 0.17 - flare);
  ctx.lineTo(-r * 0.72, r * 0.24);
  ctx.closePath();
  ctx.fill();

  // Lower engine core diamond
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-r * 0.72, r * 0.13);
  ctx.lineTo(-r * 0.72 - len * 0.55, r * 0.17 - flare * 0.5);
  ctx.lineTo(-r * 0.72, r * 0.21);
  ctx.closePath();
  ctx.fill();
}

function hullPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r * 0.68, 0);
  ctx.lineTo(r * 0.28, r * 0.52);
  ctx.lineTo(-r * 0.48, r * 0.46);
  ctx.lineTo(-r * 0.68, r * 0.24);
  ctx.lineTo(-r * 0.68, -r * 0.24);
  ctx.lineTo(-r * 0.48, -r * 0.46);
  ctx.lineTo(r * 0.28, -r * 0.52);
  ctx.closePath();
}

function drawWeapon(ctx, p, kick, flashing) {
  var r = p.r;
  var mode = p.weaponMode || 'standard';
  var metal = flashing ? '#ffffff' : '#d7c094';
  var trim = flashing ? '#ffffff' : '#f4e2b4';
  var steel = flashing ? '#ffffff' : '#222927';
  var gunDark = flashing ? '#ffffff' : '#141c1a';
  var chargeNeed = (typeof p.chargeNeed === 'number' && p.chargeNeed > 0) ? p.chargeNeed : 0.6;
  var charge = clamp((p.chargeTime || 0) / chargeNeed, 0, 1);

  if (mode === 'breacher') {
    var bx = r * 0.12 - kick;
    var blen = r * 0.72;

    // Underbarrel gas cylinder & pump slide
    ctx.fillStyle = gunDark;
    ctx.fillRect(bx + 4, 3.5, blen - 8, 4.5);
    ctx.fillStyle = flashing ? '#ffffff' : '#72644e';
    ctx.fillRect(bx + 8, 4, blen * 0.5, 3.5);

    // Heavy main shotgun barrel
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.rect(bx, -6.5, blen, 13);
    ctx.fill();
    outline(ctx, 1.4);

    // Perforated heat-shield cooling holes
    if (!flashing) {
      ctx.fillStyle = '#18140f';
      var hi;
      for (hi = 0; hi < 3; hi += 1) {
        ctx.beginPath();
        ctx.arc(bx + 8 + hi * 9, -2.5, 1.6, 0, TAU);
        ctx.arc(bx + 8 + hi * 9, 2.5, 1.6, 0, TAU);
        ctx.fill();
      }
    }

    // Heavy flared muzzle brake
    ctx.fillStyle = trim;
    ctx.fillRect(bx + blen - 2, -8, 8, 16);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(bx + blen - 2, -8, 8, 16);

    // Armored breech & side ammo drum
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.rect(-r * 0.18, -r * 0.98, 13, 15);
    ctx.fill();
    outline(ctx, 1.4);

    // Ammo drum hazard diagonal markings
    if (!flashing) {
      ctx.fillStyle = '#d49b38';
      ctx.fillRect(-r * 0.15, -r * 0.95, 3.5, 12);
      ctx.fillRect(-r * 0.05, -r * 0.95, 3.5, 12);
    }

    // Heavy feed chute
    ctx.strokeStyle = flashing ? '#ffffff' : '#e7d3a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, -r * 0.88);
    ctx.lineTo(-r * 0.02, -r * 0.2);
    ctx.moveTo(-r * 0.12, -r * 0.52);
    ctx.lineTo(r * 0.12, -r * 0.52);
    ctx.stroke();

    if ((p.recoil || 0) > 0.05) drawMuzzle(ctx, mode, bx + blen + 6, 0, p.recoil);
    return;
  }

  if (mode === 'vanguard') {
    var vx = r * 0.12 - kick;
    var vlen = r + 24;

    // Receiver mount block
    ctx.fillStyle = gunDark;
    ctx.beginPath();
    ctx.rect(vx - 4, -4.5, 8, 9);
    ctx.fill();
    outline(ctx, 1.2);

    // Upper and lower accelerator rails
    ctx.fillStyle = flashing ? '#ffffff' : '#142c33';
    ctx.fillRect(vx, -3.5, vlen, 2.8);
    ctx.fillRect(vx, 0.7, vlen, 2.8);

    ctx.fillStyle = flashing ? '#ffffff' : '#8fd0d8';
    ctx.fillRect(vx + 2, -2.8, vlen - 4, 1.4);
    ctx.fillRect(vx + 2, 1.4, vlen - 4, 1.4);

    // Segmented magnetic capacitor rings
    var seg;
    for (seg = 0; seg < 5; seg += 1) {
      var on = p.isCharging && charge >= (seg + 1) / 5;
      ctx.fillStyle = on ? '#e8fbff' : (flashing ? '#ffffff' : '#1e4852');
      ctx.fillRect(vx + 6 + seg * ((vlen - 14) / 5), -4.6, 5, 9.2);
      ctx.strokeStyle = on ? '#5be7ff' : '#0c1a1e';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx + 6 + seg * ((vlen - 14) / 5), -4.6, 5, 9.2);
    }

    if (p.isCharging && charge > 0.05 && !keyGlowsOnly()) {
      drawGlow(ctx, vx + vlen, 0, 10 + charge * 12, PALETTE.emissive.tech, 0.45 + charge * 0.45);
      // Spark arcs across rails when charging
      if (Math.sin((rt.renderTime || 0) * 30) > 0.2) {
        ctx.strokeStyle = '#e8fbff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(vx + vlen * 0.5, -2);
        ctx.lineTo(vx + vlen * 0.65, 0);
        ctx.lineTo(vx + vlen * 0.5, 2);
        ctx.stroke();
      }
    }
    if ((p.recoil || 0) > 0.05) drawMuzzle(ctx, mode, vx + vlen, 0, p.recoil);
    return;
  }

  if (mode === 'arc-welder') {
    var ax = r * 0.26 - kick;
    var tip = ax + r * 0.98;

    // Heavy ceramic insulator blocks
    ctx.fillStyle = flashing ? '#ffffff' : '#2b3834';
    ctx.beginPath();
    ctx.rect(ax - 6, -6.5, 9, 13);
    ctx.fill();
    outline(ctx, 1.2);

    // Copper induction coils
    if (!flashing) {
      ctx.fillStyle = '#c87842';
      ctx.fillRect(ax - 4, -5.5, 5, 11);
      ctx.strokeStyle = '#e29e68';
      ctx.lineWidth = 1;
      ctx.strokeRect(ax - 4, -5.5, 5, 11);
    }

    // Dual tungsten conducting prongs
    ctx.strokeStyle = flashing ? '#ffffff' : '#9fffe8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, -4);
    ctx.lineTo(tip, -8.5);
    ctx.moveTo(ax, 4);
    ctx.lineTo(tip, 8.5);
    ctx.stroke();

    // High-voltage emitter nodes
    ctx.fillStyle = flashing ? '#ffffff' : '#e8fff8';
    ctx.beginPath();
    ctx.arc(tip, -8.5, 2.6, 0, TAU);
    ctx.arc(tip, 8.5, 2.6, 0, TAU);
    ctx.fill();

    if ((p.recoil || 0) > 0.05) drawMuzzle(ctx, mode, tip + 4, 0, p.recoil);
    else drawIdleArc(ctx, tip);
    return;
  }

  // Standard Mode: Twin Heavy Autocannons
  var x0 = r * 0.16 - kick;
  var len = r + 18;

  // Armored receiver block
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.rect(x0 - 4, -6.5, 8, 13);
  ctx.fill();
  outline(ctx, 1.2);

  // Twin rifled barrels
  ctx.fillStyle = metal;
  ctx.fillRect(x0, -5.4, len, 3.6);
  ctx.fillRect(x0, 1.8, len, 3.6);
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x0, -5.4, len, 3.6);
  ctx.strokeRect(x0, 1.8, len, 3.6);

  // Barrel cooling flutes
  if (!flashing) {
    ctx.fillStyle = '#1c1812';
    ctx.fillRect(x0 + 4, -4.2, len - 10, 1.2);
    ctx.fillRect(x0 + 4, 3, len - 10, 1.2);
  }

  // Slotted muzzle brakes
  ctx.fillStyle = trim;
  ctx.fillRect(x0 + len - 4, -6.2, 6, 5.2);
  ctx.fillRect(x0 + len - 4, 1, 6, 5.2);
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x0 + len - 4, -6.2, 6, 5.2);
  ctx.strokeRect(x0 + len - 4, 1, 6, 5.2);

  // Twin muzzle flashes aligned with each barrel!
  if ((p.recoil || 0) > 0.05) {
    drawMuzzle(ctx, 'standard', x0 + len + 2, -3.6, p.recoil);
    drawMuzzle(ctx, 'standard', x0 + len + 2, 3.6, p.recoil);
  }
}

function drawIdleArc(ctx, tip) {
  var reduced = isReducedMotion();
  var mid = reduced ? 0 : Math.sin((rt.renderTime || 0) * 26) * 4;
  ctx.strokeStyle = 'rgba(168, 245, 229, 0.95)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(tip, -8.5);
  ctx.lineTo(tip + 4, mid * 0.7);
  ctx.lineTo(tip - 1, mid);
  ctx.lineTo(tip + 5, mid * 1.2);
  ctx.lineTo(tip, 8.5);
  ctx.stroke();

  if (!keyGlowsOnly()) drawGlow(ctx, tip + 2, 0, 10, PALETTE.emissive.tech, 0.3);
}

function drawMuzzle(ctx, mode, tip, yOff, recoil) {
  var s = 3 + recoil * 4;
  ctx.fillStyle = '#fff6d8';

  if (mode === 'breacher') {
    // Explosive wide flak cone
    ctx.beginPath();
    ctx.moveTo(tip - 2, yOff);
    ctx.lineTo(tip + s * 1.2, yOff + s * 1.5);
    ctx.lineTo(tip + s * 1.8, yOff + s * 0.4);
    ctx.lineTo(tip + s * 2.2, yOff);
    ctx.lineTo(tip + s * 1.8, yOff - s * 0.4);
    ctx.lineTo(tip + s * 1.2, yOff - s * 1.5);
    ctx.closePath();
    ctx.fill();

    // Flak sparks
    ctx.fillStyle = '#ff8a38';
    ctx.beginPath();
    ctx.arc(tip + s * 2.4, yOff + s * 0.8, 1.8, 0, TAU);
    ctx.arc(tip + s * 2.2, yOff - s * 0.9, 1.6, 0, TAU);
    ctx.fill();

    drawGlow(ctx, tip + 4, yOff, s + 10, '#ffb15a', 0.65);
    return;
  }

  if (mode === 'vanguard') {
    // High-tech linear energy beam flash
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tip, yOff - 1.8, s * 4.2, 3.6);
    ctx.fillStyle = '#e8fbff';
    ctx.fillRect(tip - 2, yOff - 3.2, s * 1.5, 6.4);
    drawGlow(ctx, tip + s * 1.8, yOff, s + 16, PALETTE.emissive.tech, 0.85);
    return;
  }

  if (mode === 'arc-welder') {
    // Violent branched lightning burst
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tip - 4, -8.5);
    ctx.lineTo(tip + s * 1.2, -3);
    ctx.lineTo(tip + s * 0.6, 1);
    ctx.lineTo(tip + s * 1.6, 8.5);
    ctx.lineTo(tip - 4, 8.5);
    ctx.stroke();
    drawGlow(ctx, tip + 2, 0, s + 10, PALETTE.emissive.tech, 0.75);
    return;
  }

  // Standard dual autocannon flash
  ctx.beginPath();
  ctx.moveTo(tip + s * 1.6, yOff);
  ctx.lineTo(tip, yOff + s * 0.9);
  ctx.lineTo(tip - s * 0.5, yOff);
  ctx.lineTo(tip, yOff - s * 0.9);
  ctx.closePath();
  ctx.fill();
  drawGlow(ctx, tip + 2, yOff, s + 8, '#ffe27a', 0.75);
}

function drawTurret(ctx, p, flashing, reduced) {
  var r = p.r;
  var kick = (p.recoil || 0) * 3.5;
  var rigId = (rt.state && rt.state.rigId) || 'scrapper';

  // Base armored chassis
  hullPath(ctx, r);
  ctx.fillStyle = flashing ? '#ffffff' : '#122824';
  ctx.fill();
  outline(ctx, 1.8);

  if (!flashing) {
    // Main raised deck armor plates
    ctx.fillStyle = '#1e4840';
    ctx.beginPath();
    ctx.moveTo(r * 0.6, 0);
    ctx.lineTo(r * 0.24, r * 0.46);
    ctx.lineTo(-r * 0.42, r * 0.4);
    ctx.lineTo(-r * 0.6, r * 0.2);
    ctx.lineTo(-r * 0.6, -r * 0.2);
    ctx.lineTo(-r * 0.42, -r * 0.4);
    ctx.lineTo(r * 0.24, -r * 0.46);
    ctx.closePath();
    ctx.fill();

    // Sloped edge bevel highlights
    ctx.strokeStyle = '#327265';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Shoulder pauldron armor plates with rig-specific styling
    ctx.fillStyle = '#26584e';
    ctx.beginPath();
    ctx.moveTo(r * 0.18, r * 0.46);
    ctx.lineTo(-r * 0.38, r * 0.4);
    ctx.lineTo(-r * 0.28, r * 0.18);
    ctx.lineTo(r * 0.08, r * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0e1c1a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(r * 0.18, -r * 0.46);
    ctx.lineTo(-r * 0.38, -r * 0.4);
    ctx.lineTo(-r * 0.28, -r * 0.18);
    ctx.lineTo(r * 0.08, -r * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rig-specific visual accents on shoulders
    if (rigId === 'strider') {
      // Swept aerodynamic fins with cyan racing trim
      ctx.fillStyle = '#5be7ff';
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, r * 0.42);
      ctx.lineTo(-r * 0.52, r * 0.56);
      ctx.lineTo(-r * 0.15, r * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, -r * 0.42);
      ctx.lineTo(-r * 0.52, -r * 0.56);
      ctx.lineTo(-r * 0.15, -r * 0.38);
      ctx.closePath();
      ctx.fill();
    } else if (rigId === 'bulwark') {
      // Reinforced heavy pauldron slab & amber hazard stripes
      ctx.fillStyle = '#d49b38';
      ctx.fillRect(-r * 0.22, r * 0.26, 4, 8);
      ctx.fillRect(-r * 0.08, r * 0.28, 4, 8);
      ctx.fillRect(-r * 0.22, -r * 0.34 - 8, 4, 8);
      ctx.fillRect(-r * 0.08, -r * 0.36 - 8, 4, 8);
    } else if (rigId === 'salvager') {
      // Scavenger induction coils with copper windings
      ctx.fillStyle = '#c87842';
      ctx.fillRect(-r * 0.2, r * 0.28, 6, 5);
      ctx.fillRect(-r * 0.2, -r * 0.33, 6, 5);
      ctx.strokeStyle = '#e29e68';
      ctx.lineWidth = 1;
      ctx.strokeRect(-r * 0.2, r * 0.28, 6, 5);
      ctx.strokeRect(-r * 0.2, -r * 0.33, 6, 5);
    } else {
      // Scrapper: Industrial hazard markings
      ctx.fillStyle = '#d49b38';
      ctx.fillRect(-r * 0.18, r * 0.28, 3, 6);
      ctx.fillRect(-r * 0.06, r * 0.3, 3, 6);
      ctx.fillRect(-r * 0.18, -r * 0.34 - 6, 3, 6);
      ctx.fillRect(-r * 0.06, -r * 0.36 - 6, 3, 6);
    }

    // Frontal glacis chest plate
    ctx.fillStyle = '#3a8072';
    ctx.beginPath();
    ctx.moveTo(r * 0.58, 0);
    ctx.lineTo(r * 0.18, r * 0.28);
    ctx.lineTo(-r * 0.1, 0);
    ctx.lineTo(r * 0.18, -r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#54ad9b';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Hex rivets on glacis plate
    ctx.fillStyle = '#0e1c19';
    ctx.beginPath();
    ctx.arc(r * 0.2, r * 0.22, 1.2, 0, TAU);
    ctx.arc(r * 0.2, -r * 0.22, 1.2, 0, TAU);
    ctx.arc(r * 0.46, 0, 1.2, 0, TAU);
    ctx.fill();

    // Armored Cockpit Canopy Visor
    ctx.fillStyle = '#10302b';
    ctx.beginPath();
    ctx.moveTo(r * 0.34, 0);
    ctx.lineTo(r * 0.06, r * 0.2);
    ctx.lineTo(-r * 0.14, r * 0.15);
    ctx.lineTo(-r * 0.14, -r * 0.15);
    ctx.lineTo(r * 0.06, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0e1c19';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Crystalline visor glow
    ctx.fillStyle = PALETTE.emissive.player;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, 0);
    ctx.lineTo(r * 0.06, r * 0.15);
    ctx.lineTo(-r * 0.1, r * 0.1);
    ctx.lineTo(-r * 0.1, -r * 0.1);
    ctx.lineTo(r * 0.06, -r * 0.15);
    ctx.closePath();
    ctx.fill();

    // Canopy specular gloss glint
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.26, -r * 0.05);
    ctx.lineTo(r * 0.08, -r * 0.15);
    ctx.stroke();

    // Internal HUD targeting ocular diode
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.12, 0, 1.8, 0, TAU);
    ctx.fill();

    // Central Reactor Hub (mounted on torso)
    ctx.fillStyle = '#0e1c19';
    ctx.beginPath();
    ctx.arc(-r * 0.24, 0, r * 0.18, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2d685c';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = p.overdrive > 0 ? PALETTE.emissive.gold : PALETTE.emissive.player;
    ctx.beginPath();
    ctx.arc(-r * 0.24, 0, r * 0.11, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-r * 0.24, 0, r * 0.04, 0, TAU);
    ctx.fill();

    // Rear engine block & dual exhaust bells (mounted on torso)
    ctx.fillStyle = '#1b3b35';
    ctx.fillRect(-r * 0.82, -r * 0.3, r * 0.24, r * 0.6);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(-r * 0.82, -r * 0.3, r * 0.24, r * 0.6);

    ctx.fillStyle = '#1e2422';
    ctx.fillRect(-r * 0.76, -r * 0.24, r * 0.15, r * 0.16);
    ctx.fillRect(-r * 0.76, r * 0.08, r * 0.15, r * 0.16);
    ctx.strokeRect(-r * 0.76, -r * 0.24, r * 0.15, r * 0.16);
    ctx.strokeRect(-r * 0.76, r * 0.08, r * 0.15, r * 0.16);

    // Rear louvered radiator / heatsink vents
    var heatCol = p.overdrive > 0 ? '#ffb054' : 'rgba(255, 120, 50, 0.4)';
    ctx.fillStyle = '#0c1815';
    ctx.fillRect(-r * 0.58, -r * 0.32, 5, 8);
    ctx.fillRect(-r * 0.58, r * 0.16, 5, 8);
    ctx.fillStyle = heatCol;
    ctx.fillRect(-r * 0.56, -r * 0.3, 2.5, 2);
    ctx.fillRect(-r * 0.56, -r * 0.22, 2.5, 2);
    ctx.fillRect(-r * 0.56, r * 0.18, 2.5, 2);
    ctx.fillRect(-r * 0.56, r * 0.26, 2.5, 2);
  }

  // Dash rocket thrust plumes fire backwards from the torso engine bells
  if (p.dashPulse > 0) drawThrusters(ctx, p, reduced);

  drawGlow(ctx, r * 0.12, 0, r * 0.6, PALETTE.emissive.player, keyGlowsOnly() ? 0.25 : 0.38);

  drawWeapon(ctx, p, kick, flashing);
}

function drawMech(ctx, p, fx, flashing, reduced) {
  var move = fx.moveAng == null ? p.aim : fx.moveAng;
  ctx.save();
  ctx.rotate(move);
  drawLegs(ctx, p, fx, flashing, reduced);
  ctx.restore();
  ctx.save();
  ctx.rotate(fx.aim != null ? fx.aim : (p.aim || 0));
  drawTurret(ctx, p, flashing, reduced);
  ctx.restore();
}

function drawGhost(ctx, p, ghost) {
  var aim = ghost.aim != null ? ghost.aim : (p.aim || 0);
  var alpha = Math.min(0.55, ghost.life * 2.2);
  ctx.save();
  ctx.translate(ghost.x, ghost.y);
  ctx.rotate(aim);
  ctx.globalAlpha = alpha;

  // High-tech holographic speed silhouette
  hullPath(ctx, p.r);
  ctx.fillStyle = 'rgba(91, 231, 255, 0.22)';
  ctx.fill();
  ctx.strokeStyle = PALETTE.emissive.player;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Weapon energy trace
  ctx.strokeStyle = '#e8fbff';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(p.r * 0.4, 0);
  ctx.lineTo(p.r + 14, 0);
  ctx.stroke();

  ctx.restore();
}

function drawDashRing(ctx, p) {
  var pulseProgress = clamp(1 - p.dashPulse / DASH_PULSE_DURATION, 0, 1);
  var pulseR = Math.max(0, DASH_PULSE_RADIUS * Math.sin(pulseProgress * Math.PI * 0.5));
  if (pulseR <= 0.1) return;
  var pulseAlpha = clamp(p.dashPulse / DASH_PULSE_DURATION, 0, 1);
  ctx.save();
  ctx.globalAlpha = pulseAlpha * 0.9;
  ctx.strokeStyle = PALETTE.emissive.player;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, pulseR, 0, TAU);
  ctx.stroke();

  // Secondary shock ripple ring
  ctx.globalAlpha = pulseAlpha * 0.45;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0, pulseR - 6), 0, TAU);
  ctx.stroke();
  ctx.restore();

  if (!keyGlowsOnly()) drawGlow(ctx, p.x, p.y, Math.min(48, Math.max(1, pulseR * 0.35)), PALETTE.emissive.player, pulseAlpha * 0.35);
}

function drawStatus(ctx, p, reduced) {
  var low = p.maxHp > 0 && p.hp < p.maxHp * 0.35;
  if (p.overdrive > 0) {
    ctx.save();
    var tWave = (rt.renderTime || 0) * 4;
    var spin = reduced ? 0 : tWave * 1.5;
    ctx.strokeStyle = PALETTE.emissive.gold;
    ctx.globalAlpha = reduced ? 0.85 : (0.65 + 0.2 * Math.sin(tWave));
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 13, 0, TAU);
    ctx.stroke();

    // Rotating orbital overdrive spark nodes
    ctx.rotate(spin);
    ctx.fillStyle = '#ffffff';
    var oi;
    for (oi = 0; oi < 4; oi += 1) {
      var oa = (oi / 4) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(oa) * (p.r + 13), Math.sin(oa) * (p.r + 13), 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (!keyGlowsOnly()) drawGlow(ctx, 0, 0, p.r + 18, PALETTE.emissive.gold, reduced ? 0.32 : 0.42);
  }

  if (p.invulnerable > 0) {
    var shell = reduced ? 0.65 : (0.5 + 0.18 * Math.sin((rt.renderTime || 0) * 6));
    ctx.save();
    ctx.globalAlpha = shell;
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 10, 0, TAU);
    ctx.stroke();

    // Hexagonal faceted shield matrix (closed polygon filled cleanly)
    ctx.beginPath();
    var hi;
    for (hi = 0; hi < 6; hi += 1) {
      var ha = (hi / 6) * TAU;
      var hx = Math.cos(ha) * (p.r + 10);
      var hy = Math.sin(ha) * (p.r + 10);
      if (hi === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(91, 231, 255, 0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 240, 255, 0.75)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }

  if (!low) return;

  // Low HP damage: Real rising smoke puffs and electrical short-circuits
  var t = reduced ? 0 : (rt.renderTime || 0);
  var i;
  for (i = 0; i < 3; i += 1) {
    var phaseSmoke = (t * 1.5 + i * 0.33) % 1;
    var ox = Math.sin(t * 1.6 + i * 2) * 6;
    var oy = -p.r * 0.3 - phaseSmoke * 18;
    var sz = 3.5 + phaseSmoke * 5;
    ctx.save();
    ctx.globalAlpha = (1 - phaseSmoke) * 0.45;
    ctx.fillStyle = '#16120e';
    ctx.beginPath();
    ctx.arc(ox, oy, sz, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  if (reduced) return;

  // Intermittent short-circuit spark arcs
  if (Math.sin(t * 18) > 0.1) {
    var sparkSeed = Math.sin(t * 30);
    ctx.strokeStyle = sparkSeed > 0 ? '#ffd36b' : '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.lineTo(7, -6);
    ctx.lineTo(4, -3);
    ctx.lineTo(9, -5);
    ctx.stroke();

    ctx.strokeStyle = '#5be7ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(-7, 7);
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
    drawGhost(ctx, p, ghost);
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
  drawMech(ctx, p, fx, flashing, reduced);
  drawStatus(ctx, p, reduced);
  ctx.restore();
}
