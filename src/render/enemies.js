import { TAU } from '../config.js';
import { addVisualDecal } from './terrain.js';
import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import {
  decay,
  drawDustRing,
  drawHpBar,
  ensureFx,
  keyGlowsOnly,
  outline,
  spawnPose,
  tickFlash,
  trackStep
} from './entity-style.js';
import { PALETTE } from './palette.js';
import { drawGlow } from './sprites.js';

var DASH_6 = [6, 6];
var DASH_3 = [3, 3];
var DASH_4 = [4, 5];
var NO_DASH = [];

function faceOf(e) {
  var p = rt.state.player;
  if (!p) return 0;
  return Math.atan2(p.y - e.y, p.x - e.x);
}

function heatPaint(t) {
  if (t > 0.66) return '#fff1c4';
  if (t > 0.33) return '#ff6a3d';
  return '#6a2018';
}

function stampBlink(e, fx) {
  if (e.kind !== 'elite' || (e.affix !== 'blink' && e.affix2 !== 'blink')) return;
  if (!(fx.moved > 36)) return;
  fx.g0x = e.x - fx.dx;
  fx.g0y = e.y - fx.dy;
  fx.g0t = 0.48;
  fx.g1x = e.x;
  fx.g1y = e.y;
  fx.g1t = 0.48;
}

function senseMirror(e, fx) {
  if (e.kind !== 'elite' || (e.affix !== 'mirror' && e.affix2 !== 'mirror')) return;
  if (e.shieldBrokenTimer > 0) return;
  var now = rt.renderTime || 0;
  if (fx.rippleLock != null && now - fx.rippleLock < 0.08) return;
  var bullets = rt.state.bullets;
  if (!bullets) return;
  var i;
  for (i = 0; i < bullets.length; i += 1) {
    var b = bullets[i];
    if (b.vx == null || b.vy == null) continue;
    var dx = b.x - e.x;
    var dy = b.y - e.y;
    var d = Math.hypot(dx, dy);
    if (d > e.r + 16 || d < e.r * 0.45) continue;
    if (dx * b.vx + dy * b.vy <= 0) continue;
    var ang = Math.atan2(dy, dx);
    var diff = Math.atan2(Math.sin(ang - (e.shieldAngle || 0)), Math.cos(ang - (e.shieldAngle || 0)));
    if (Math.abs(diff) > 1.2) continue;
    fx.rippleAng = ang;
    fx.rippleT = 0.28;
    fx.rippleLock = now;
    return;
  }
}

function noteArtillery(e, fx) {
  if (e.kind !== 'artillery') return;
  var cd = e.cooldown || 0;
  if (cd > (fx.prevCd || 0) + 1) fx.muzzle = 0.32;
  fx.prevCd = cd;
  decay(fx, 'muzzle');
  if (!e.deployed || e.siegeTimer > 0 || fx.claws) return;
  fx.claws = true;
  var face = faceOf(e);
  var ext = e.r + 10;
  var i;
  for (i = 0; i < 4; i += 1) {
    var a = face + (i / 4) * TAU + Math.PI / 4;
    addVisualDecal(e.x + Math.cos(a) * ext, e.y + Math.sin(a) * ext, 3.5, 14, 0.5, '#1a140f');
  }
}

function drawPixelGhost(ctx, x, y, t) {
  if (!(t > 0) || x == null || y == null) return;
  var s = 3;
  var i;
  var j;
  ctx.save();
  ctx.globalAlpha = Math.min(0.85, t * 2);
  ctx.fillStyle = '#9be7c8';
  for (i = -1; i <= 1; i += 1) {
    for (j = -1; j <= 1; j += 1) {
      if ((i + j) & 1) continue;
      ctx.fillRect(x + i * 6 - 1, y + j * 6 - 1, s, s);
    }
  }
  ctx.restore();
}

function drawCrawlerLeg(ctx, r, i, step, flashing, reduced) {
  var side = i < 3 ? -1 : 1;
  var slot = i % 3;
  var along = (slot - 1) * r * 0.58;
  var phase = reduced ? 0 : Math.sin(step * 0.28 + slot * 1.2 + (side > 0 ? 1.5 : 0));
  var hipX = along * 0.85;
  var hipY = side * r * 0.65;
  var kneeX = along + phase * r * 0.25;
  var kneeY = side * r * 1.05;
  var footX = along + phase * r * 0.45;
  var footY = side * r * 1.38;

  // Upper leg (femur) with chitin spine
  ctx.strokeStyle = flashing ? '#ffffff' : '#0e0804';
  ctx.lineWidth = 4.0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.stroke();

  ctx.strokeStyle = flashing ? '#ffffff' : '#5c3e28';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.stroke();

  // Knee joint articulation pin
  ctx.fillStyle = flashing ? '#ffffff' : '#ffd36b';
  ctx.beginPath();
  ctx.arc(kneeX, kneeY, 2.2, 0, TAU);
  ctx.fill();

  // Lower leg (tibia & sharp claw)
  ctx.strokeStyle = flashing ? '#ffffff' : '#0e0804';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  ctx.strokeStyle = flashing ? '#ffffff' : '#b0885c';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  // Sharp clawed foot tip
  ctx.fillStyle = flashing ? '#ffffff' : '#ffe8c2';
  ctx.beginPath();
  ctx.arc(footX, footY, 2.0, 0, TAU);
  ctx.fill();
}

function drawCrawlerBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var step = (e.fx && e.fx.step) || 0;
  var i;
  for (i = 0; i < 6; i += 1) drawCrawlerLeg(ctx, r, i, step, flashing, reduced);

  // Main abdominal segmented carapace: Outer base
  ctx.fillStyle = flashing ? '#ffffff' : '#1a120c';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  outline(ctx, 2.0);

  if (!flashing) {
    // Posterior dorsal plate
    ctx.fillStyle = '#423022';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, 0, r * 0.58, r * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#120c08';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Mid dorsal plate
    ctx.fillStyle = '#644832';
    ctx.beginPath();
    ctx.ellipse(r * 0.05, 0, r * 0.62, r * 0.58, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#120c08';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Anterior thoracic crest / carapace ridge
    ctx.fillStyle = '#8f6a4a';
    ctx.beginPath();
    ctx.ellipse(r * 0.25, 0, r * 0.44, r * 0.42, 0, 0, TAU);
    ctx.fill();

    // Chitin spinal ridges
    ctx.strokeStyle = '#f8dfba';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(r * 0.48, 0);
    ctx.stroke();

    // Lateral segmental suture lines
    ctx.strokeStyle = '#120a06';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.68);
    ctx.lineTo(-r * 0.05, r * 0.68);
    ctx.moveTo(r * 0.22, -r * 0.52);
    ctx.lineTo(r * 0.28, r * 0.52);
    ctx.stroke();
  }

  // Cephalothorax head & curved mandibles
  var twitch = reduced ? 0 : Math.sin(step * 0.3) * 0.15;
  ctx.fillStyle = flashing ? '#ffffff' : '#140e0a';
  ctx.beginPath();
  ctx.moveTo(r * 0.45, -r * 0.35);
  ctx.lineTo(r * 0.95, -r * 0.18 + twitch * 2);
  ctx.lineTo(r * 0.8, 0);
  ctx.lineTo(r * 0.95, r * 0.18 - twitch * 2);
  ctx.lineTo(r * 0.45, r * 0.35);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 1.4);

  // Mandible ivory/amber tips
  ctx.fillStyle = flashing ? '#ffffff' : '#fff2d6';
  ctx.beginPath();
  ctx.moveTo(r * 0.8, -r * 0.2 + twitch * 2);
  ctx.lineTo(r * 1.08, -r * 0.12 + twitch * 2);
  ctx.lineTo(r * 0.88, 0);
  ctx.lineTo(r * 1.08, r * 0.12 - twitch * 2);
  ctx.lineTo(r * 0.8, r * 0.2 - twitch * 2);
  ctx.closePath();
  ctx.fill();

  // Arachnid Multi-Eye Cluster: 2 primary forward eyes, 2 lateral with white optical pinpoints
  ctx.fillStyle = flashing ? '#ffffff' : '#ff3b10';
  ctx.beginPath();
  ctx.arc(r * 0.58, -r * 0.15, Math.max(1.8, r * 0.16), 0, TAU);
  ctx.arc(r * 0.58, r * 0.15, Math.max(1.8, r * 0.16), 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r * 0.64, -r * 0.15, Math.max(1, r * 0.08), 0, TAU);
  ctx.arc(r * 0.64, r * 0.15, Math.max(1, r * 0.08), 0, TAU);
  ctx.fill();

  ctx.fillStyle = flashing ? '#ffffff' : '#f59e0b';
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.3, Math.max(1.2, r * 0.1), 0, TAU);
  ctx.arc(r * 0.42, r * 0.3, Math.max(1.2, r * 0.1), 0, TAU);
  ctx.fill();

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, r * 0.6, 0, r * 0.8, '#ff552e', 0.5);
  }
}

function drawRusherShape(ctx, r, flashing, hot) {
  // Dual raked turbine housings
  ctx.fillStyle = hot ? '#ffe8d0' : '#140c06';
  ctx.fillRect(-r * 1.05, -r * 0.65, r * 0.52, r * 0.28);
  ctx.fillRect(-r * 1.05, r * 0.37, r * 0.52, r * 0.28);
  ctx.strokeStyle = '#060402';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-r * 1.05, -r * 0.65, r * 0.52, r * 0.28);
  ctx.strokeRect(-r * 1.05, r * 0.37, r * 0.52, r * 0.28);

  // Main delta hull base
  ctx.beginPath();
  ctx.moveTo(r * 1.45, 0);
  ctx.lineTo(-r * 0.6, r * 0.98);
  ctx.lineTo(-r * 0.22, 0);
  ctx.lineTo(-r * 0.6, -r * 0.98);
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : (hot ? '#9a3412' : '#22120a');
  ctx.fill();
  outline(ctx, 2.2);

  if (!flashing) {
    // Twin forward-swept scythe blades
    ctx.fillStyle = hot ? '#ffb080' : '#ea580c';
    ctx.beginPath();
    ctx.moveTo(r * 1.45, 0);
    ctx.lineTo(r * 0.2, r * 0.38);
    ctx.lineTo(-r * 0.1, r * 0.16);
    ctx.lineTo(r * 0.3, 0);
    ctx.lineTo(-r * 0.1, -r * 0.16);
    ctx.lineTo(r * 0.2, -r * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff7ed';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Dorsal armor plate & spine
    ctx.fillStyle = hot ? '#ff7e42' : '#c2410c';
    ctx.beginPath();
    ctx.moveTo(r * 0.8, 0);
    ctx.lineTo(-r * 0.35, r * 0.45);
    ctx.lineTo(-r * 0.15, 0);
    ctx.lineTo(-r * 0.35, -r * 0.45);
    ctx.closePath();
    ctx.fill();

    // Racing/hazard thermal stripes
    ctx.strokeStyle = hot ? '#ffffff' : '#ffedd5';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.6);
    ctx.lineTo(r * 0.1, -r * 0.22);
    ctx.moveTo(-r * 0.3, r * 0.6);
    ctx.lineTo(r * 0.1, r * 0.22);
    ctx.stroke();
  }

  // Forward predatory visor slit with white-hot optical center
  ctx.fillStyle = flashing ? '#ffffff' : '#ff2200';
  ctx.beginPath();
  ctx.ellipse(r * 0.72, 0, Math.max(2.2, r * 0.22), Math.max(1.2, r * 0.1), 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(r * 0.74, 0, Math.max(1.2, r * 0.12), Math.max(0.6, r * 0.05), 0, 0, TAU);
  ctx.fill();
}

function drawRusherBody(ctx, e, flashing, reduced) {
  var charging = e.burstCd !== undefined && e.burstCd <= 0.35 && e.burstCd > 0;
  var bursting = e.burstTime !== undefined && e.burstTime > 0;
  var hot = charging || bursting;
  var chargeRatio = charging ? 1 - e.burstCd / 0.35 : (bursting ? 1 : 0);
  if (hot && !reduced) ctx.translate(Math.sin((rt.state.waveTime || 0) * 46) * 1.8, 0);
  drawRusherShape(ctx, e.r, flashing, hot && chargeRatio > 0.45);

  var eyeHot = hot && (reduced || bursting || Math.sin((rt.state.waveTime || 0) * 12) > 0);
  if (hot && !keyGlowsOnly()) {
    drawGlow(ctx, -e.r * 0.85, -e.r * 0.5, e.r * 1.1, eyeHot ? '#fff4e0' : PALETTE.emissive.hostile, 0.65);
    drawGlow(ctx, -e.r * 0.85, e.r * 0.5, e.r * 1.1, eyeHot ? '#fff4e0' : PALETTE.emissive.hostile, 0.65);
    drawGlow(ctx, e.r * 0.75, 0, e.r * 0.8, '#ff6a3d', 0.5);
  }

  // Multi-tier jet thruster afterburner flames
  if (hot) {
    var flameLen = e.r * (0.6 + chargeRatio * 0.8);
    // Upper flame
    ctx.fillStyle = eyeHot ? '#fff6e8' : '#ff8a4a';
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.05, -e.r * 0.62);
    ctx.lineTo(-e.r * 1.05 - flameLen, -e.r * 0.51);
    ctx.lineTo(-e.r * 1.05, -e.r * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.05, -e.r * 0.58);
    ctx.lineTo(-e.r * 1.05 - flameLen * 0.5, -e.r * 0.51);
    ctx.lineTo(-e.r * 1.05, -e.r * 0.44);
    ctx.closePath();
    ctx.fill();

    // Lower flame
    ctx.fillStyle = eyeHot ? '#fff6e8' : '#ff8a4a';
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.05, e.r * 0.4);
    ctx.lineTo(-e.r * 1.05 - flameLen, e.r * 0.51);
    ctx.lineTo(-e.r * 1.05, e.r * 0.62);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.05, e.r * 0.44);
    ctx.lineTo(-e.r * 1.05 - flameLen * 0.5, e.r * 0.51);
    ctx.lineTo(-e.r * 1.05, e.r * 0.58);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBruteBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var step = (e.fx && e.fx.step) || 0;
  var piston = reduced ? 0 : Math.sin(step * 0.24) * r * 0.16;
  var puff = reduced ? 0.4 : ((rt.renderTime || 0) * 1.6) % 1;

  // Main heavy armored hull base
  ctx.fillStyle = flashing ? '#ffffff' : '#1c1614';
  ctx.beginPath();
  ctx.moveTo(r * 0.18, -r * 0.95);
  ctx.lineTo(r * 0.76, -r * 0.5);
  ctx.lineTo(r * 1.05, 0);
  ctx.lineTo(r * 0.76, r * 0.5);
  ctx.lineTo(r * 0.18, r * 0.95);
  ctx.lineTo(-r * 0.88, r * 0.82);
  ctx.lineTo(-r * 1.05, 0);
  ctx.lineTo(-r * 0.88, -r * 0.82);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 2.4);

  if (!flashing) {
    // Frontal ballistic battering ram shield (forged industrial alloy)
    ctx.fillStyle = '#261e1a';
    ctx.beginPath();
    ctx.moveTo(r * 1.05, 0);
    ctx.lineTo(r * 0.74, -r * 0.5);
    ctx.lineTo(r * 0.22, -r * 0.35);
    ctx.lineTo(r * 0.3, 0);
    ctx.lineTo(r * 0.22, r * 0.35);
    ctx.lineTo(r * 0.74, r * 0.5);
    ctx.closePath();
    ctx.fill();

    // Shield reinforced bevel rim & industrial hazard chevrons
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(r * 0.74, -r * 0.5);
    ctx.lineTo(r * 1.05, 0);
    ctx.lineTo(r * 0.74, r * 0.5);
    ctx.stroke();

    ctx.strokeStyle = '#ffe28a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(r * 0.68, -r * 0.42);
    ctx.lineTo(r * 0.96, 0);
    ctx.lineTo(r * 0.68, r * 0.42);
    ctx.stroke();

    // Side armor skirt plates with amber hazard trim
    ctx.fillStyle = '#2c201a';
    ctx.beginPath();
    ctx.moveTo(r * 0.18, -r * 0.92);
    ctx.lineTo(-r * 0.82, -r * 0.78);
    ctx.lineTo(-r * 0.6, -r * 0.4);
    ctx.lineTo(r * 0.1, -r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(r * 0.18, r * 0.92);
    ctx.lineTo(-r * 0.82, r * 0.78);
    ctx.lineTo(-r * 0.6, r * 0.4);
    ctx.lineTo(r * 0.1, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Active hydraulic cylinders on flanks
  ctx.fillStyle = flashing ? '#ffffff' : '#18120e';
  ctx.fillRect(-r * 0.22, -r * 0.58, r * 0.3, r * 0.32);
  ctx.fillRect(-r * 0.22, r * 0.26, r * 0.3, r * 0.32);

  // Chrome sliding piston rods
  ctx.fillStyle = flashing ? '#ffffff' : '#f0f4f8';
  ctx.fillRect(-r * 0.15, -r * 0.54, r * 0.16, r * 0.24 + piston);
  ctx.fillRect(-r * 0.15, r * 0.3 - piston, r * 0.16, r * 0.24);

  // Brass cylinder gland nuts
  ctx.fillStyle = flashing ? '#ffffff' : '#e5a840';
  ctx.fillRect(-r * 0.2, -r * 0.56, r * 0.26, 3);
  ctx.fillRect(-r * 0.2, r * 0.53, r * 0.26, 3);

  // Piloting slit visor with white-hot laser core
  ctx.fillStyle = flashing ? '#ffffff' : '#ff3b1e';
  ctx.fillRect(r * 0.18, -r * 0.16, 5, r * 0.32);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(r * 0.20, -r * 0.08, 2, r * 0.16);
  if (!flashing) {
    ctx.fillStyle = '#0e0806';
    ctx.fillRect(r * 0.18, -r * 0.05, 5, 2.2);
  }

  // Dual angled industrial diesel smokestacks
  ctx.fillStyle = flashing ? '#ffffff' : '#1a100e';
  ctx.fillRect(-r * 0.82, -r * 0.76, r * 0.32, r * 0.24);
  ctx.fillRect(-r * 0.82, r * 0.52, r * 0.32, r * 0.24);
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(-r * 0.82, -r * 0.76, r * 0.32, r * 0.24);
  ctx.strokeRect(-r * 0.82, r * 0.52, r * 0.32, r * 0.24);

  // Diesel exhaust smoke & embers (deterministic, no Math.random)
  ctx.save();
  ctx.globalAlpha = 0.35 * (1 - puff * 0.4);
  ctx.fillStyle = '#1a1410';
  ctx.beginPath();
  ctx.arc(-r * 0.95 - puff * r * 0.4, -r * 0.65, 3.5 + puff * 5, 0, TAU);
  ctx.arc(-r * 0.9 - puff * r * 0.35, r * 0.65, 3 + puff * 4.5, 0, TAU);
  ctx.fill();

  // Hot ember sparks using deterministic wave
  if (!reduced && Math.sin((rt.renderTime || 0) * 14) > 0.1) {
    var emberY = Math.sin((rt.renderTime || 0) * 22) * 3;
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.arc(-r * 0.9 - puff * r * 0.6, -r * 0.6 + emberY, 1.4, 0, TAU);
    ctx.arc(-r * 0.85 - puff * r * 0.5, r * 0.6 - emberY, 1.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, r * 0.2, 0, r * 0.65, PALETTE.emissive.hostile, 0.4);
  }
}

function drawArtilleryBody(ctx, e, flashing) {
  var r = e.r;
  var deploy = 1;
  if (e.deployed) deploy = e.siegeTimer > 0 ? clamp(1 - e.siegeTimer / 0.9, 0, 1) : 1;
  else deploy = 0.15;

  var legI;
  // 4 Outrigger stabilizer legs
  ctx.strokeStyle = flashing ? '#ffffff' : '#6a5428';
  ctx.lineWidth = 3.8;
  ctx.lineCap = 'round';
  for (legI = 0; legI < 4; legI += 1) {
    var legA = (legI / 4) * TAU + Math.PI / 4;
    var ext = 3 + deploy * (r * 0.62);
    var x0 = Math.cos(legA) * (r * 0.58);
    var y0 = Math.sin(legA) * (r * 0.58);
    var x1 = Math.cos(legA) * (r * 0.72 + ext);
    var y1 = Math.sin(legA) * (r * 0.72 + ext);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Heavy ground anchor spade pad
    ctx.fillStyle = flashing ? '#ffffff' : '#2a2010';
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x1, y1, 3.2, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Hexagonal traversal chassis
  ctx.beginPath();
  var hi;
  for (hi = 0; hi < 6; hi += 1) {
    var ha = (hi / 6) * TAU;
    var hx = Math.cos(ha) * r;
    var hy = Math.sin(ha) * r;
    if (hi === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : '#4a3818';
  ctx.fill();
  outline(ctx, 1.8);

  if (!flashing) {
    // Upper turret ring with sloped plates
    ctx.fillStyle = '#8a6828';
    ctx.beginPath();
    for (hi = 0; hi < 6; hi += 1) {
      var hba = (hi / 6) * TAU;
      var hbx = Math.cos(hba) * (r * 0.78);
      var hby = Math.sin(hba) * (r * 0.78);
      if (hi === 0) ctx.moveTo(hbx, hby);
      else ctx.lineTo(hbx, hby);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#dfb868';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Traversal ball-bearing teeth
    ctx.fillStyle = '#22180c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0, TAU);
    ctx.fill();
  }

  // Heavy caliber siege cannon with dynamic recoil & thermal heat
  var kick = 0;
  if ((e.cooldown || 0) > 3.45) kick = ((e.cooldown - 3.45) / 0.35) * 7;
  var heat = 0;
  if (e.deployed && e.siegeTimer > 0 && e.siegeTimer < 0.4) heat = 1 - e.siegeTimer / 0.4;
  else if (e.deployed && !(e.siegeTimer > 0) && e.cooldown > 0 && e.cooldown < 0.9) heat = 1 - e.cooldown / 0.9;

  // Cannon barrel body & recoil jacket
  ctx.fillStyle = flashing ? '#ffffff' : '#221810';
  ctx.fillRect(r * 0.12 - kick, -4.5, r * 1.25, 9);
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(r * 0.12 - kick, -4.5, r * 1.25, 9);

  // Barrel cooling jacket slots
  if (!flashing) {
    ctx.fillStyle = '#44321c';
    ctx.fillRect(r * 0.2 - kick, -3.2, r * 0.5, 6.4);
    ctx.fillStyle = '#181008';
    ctx.fillRect(r * 0.25 - kick, -2, 3, 4);
    ctx.fillRect(r * 0.4 - kick, -2, 3, 4);
    ctx.fillRect(r * 0.55 - kick, -2, 3, 4);
  }

  // Slotted muzzle brake with thermal heat paint
  ctx.fillStyle = flashing ? '#ffffff' : heatPaint(heat);
  ctx.fillRect(r * 1.25 - kick, -5.2, 6.5, 10.4);
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(r * 1.25 - kick, -5.2, 6.5, 10.4);

  // Target acquisition optical sensor dome
  ctx.fillStyle = flashing ? '#ffffff' : '#ff4d2e';
  ctx.beginPath();
  ctx.arc(-r * 0.1, -r * 0.32, 2.4, 0, TAU);
  ctx.fill();

  if (heat > 0.15 && !keyGlowsOnly() && !flashing) {
    drawGlow(ctx, r * 1.35 - kick, 0, 10 + heat * 10, PALETTE.emissive.hostile, 0.4 + heat * 0.45);
  }

  var fx = e.fx;
  if (fx && fx.muzzle > 0) {
    var mk = 1 - fx.muzzle / 0.32;
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - mk);
    ctx.fillStyle = '#5c544a';
    ctx.beginPath();
    ctx.arc(r * 1.45 - kick + mk * 12, -2, 3.5 + mk * 5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 1.3 - kick + mk * 10, 3, 2.8 + mk * 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function hexAt(ctx, x, y, rad) {
  var i;
  ctx.beginPath();
  for (i = 0; i < 6; i += 1) {
    var a = (i / 6) * TAU + TAU / 12;
    var px = x + Math.cos(a) * rad;
    var py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawMirrorShield(ctx, e, fx) {
  var broken = e.shieldBrokenTimer > 0;
  var i;
  ctx.save();
  if (broken) {
    ctx.setLineDash(DASH_4);
    ctx.strokeStyle = 'rgba(91, 231, 255, 0.55)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 10, -1.15, 1.15);
    ctx.stroke();
  } else {
    // Hexagonal crystalline barrier facets
    ctx.strokeStyle = PALETTE.emissive.tech;
    ctx.lineWidth = 1.4;
    for (i = -2; i <= 2; i += 1) {
      var a = i * 0.42;
      hexAt(ctx, Math.cos(a) * (e.r + 11), Math.sin(a) * (e.r + 11), 4.8);
      ctx.stroke();
    }
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 11, -1.15, 1.15);
    ctx.stroke();
    if (!keyGlowsOnly()) drawGlow(ctx, e.r + 9, 0, 16, PALETTE.emissive.tech, 0.45);
  }
  ctx.restore();

  if (fx && fx.rippleT > 0) {
    var k = 1 - fx.rippleT / 0.28;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 9 + k * 18, (fx.rippleAng || 0) - faceOf(e) - 0.55, (fx.rippleAng || 0) - faceOf(e) + 0.55);
    ctx.stroke();
    ctx.restore();
  }
}

function strokeStar(ctx, r, ox, oy) {
  var i;
  ctx.beginPath();
  for (i = 0; i < 8; i += 1) {
    var sa = (i / 8) * TAU;
    var sr = i % 2 ? r * 0.72 : r;
    var px = ox + Math.cos(sa) * sr;
    var py = oy + Math.sin(sa) * sr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawEliteBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var spin = reduced ? 0.4 : (rt.state.waveTime || 0) * 0.9;
  var i;

  // Floating Runic Halo Array
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = PALETTE.emissive.gold;
  ctx.globalAlpha = reduced ? 0.85 : 0.65;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, r + 10, 0, TAU);
  ctx.stroke();

  // Orbital focus nodes on halo
  for (i = 0; i < 6; i += 1) {
    var ta = (i / 6) * TAU;
    var nx = Math.cos(ta) * (r + 10);
    var ny = Math.sin(ta) * (r + 10);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(nx, ny, 1.8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // Blink Affix Chromatic Aberration Telegraph
  if (e.affix === 'blink' || e.affix2 === 'blink') {
    var jig = reduced ? 1.5 : (e.blinkTelegraph ? 3.8 : 1.8);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ff4040';
    ctx.lineWidth = 1.5;
    strokeStar(ctx, r, jig, 0);
    ctx.strokeStyle = '#40e0ff';
    strokeStar(ctx, r, -jig, 1);
    ctx.restore();
  }

  // 8-Point Star Faceted Armor Chassis
  ctx.beginPath();
  for (i = 0; i < 8; i += 1) {
    var sa = (i / 8) * TAU;
    var sr = i % 2 ? r * 0.72 : r;
    if (i === 0) ctx.moveTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
    else ctx.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
  }
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : '#142c28';
  ctx.fill();
  outline(ctx, 2);

  if (!flashing) {
    // Imperial jade/obsidian composite plates
    ctx.fillStyle = '#26584e';
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.lineTo(0, -r * 0.45);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(0, r * 0.45);
    ctx.closePath();
    ctx.fill();

    // Gilded gold filigree edge accents
    ctx.strokeStyle = PALETTE.emissive.gold;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Filigree ray traces
    ctx.save();
    ctx.strokeStyle = PALETTE.emissive.gold;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.85;
    for (i = 0; i < 4; i += 1) {
      var va = (i / 4) * TAU + spin * 0.25;
      ctx.beginPath();
      ctx.moveTo(Math.cos(va) * r * 0.35, Math.sin(va) * r * 0.35);
      ctx.lineTo(Math.cos(va) * r * 0.92, Math.sin(va) * r * 0.92);
      ctx.stroke();
    }
    ctx.restore();

    // Volatile affix: pulsating thermal magma veins
    if (e.affix === 'volatile' || e.affix2 === 'volatile') {
      var vPulse = reduced ? 0.7 : (0.5 + 0.5 * Math.sin((rt.state.waveTime || 0) * 8));
      ctx.strokeStyle = 'rgba(255, 140, 50, ' + vPulse.toFixed(2) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.3);
      ctx.lineTo(0, -r * 0.1);
      ctx.lineTo(r * 0.4, -r * 0.2);
      ctx.moveTo(-r * 0.3, r * 0.3);
      ctx.lineTo(0, r * 0.15);
      ctx.lineTo(r * 0.35, r * 0.25);
      ctx.stroke();
    }

    // Splitter affix: bio-luminescent cell division suture lines
    if (e.affix === 'splitter' || e.affix2 === 'splitter') {
      ctx.strokeStyle = 'rgba(240, 210, 164, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.7);
      ctx.lineTo(0, r * 0.7);
      ctx.stroke();
    }
  }

  // Central Crystalline Hyper-Core
  ctx.fillStyle = flashing ? '#ffffff' : '#0e1c1a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = PALETTE.emissive.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = flashing ? '#ffffff' : PALETTE.emissive.player;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.1, 0, TAU);
  ctx.fill();

  // Forward commander optic
  ctx.fillStyle = flashing ? '#ffffff' : '#ffd36b';
  ctx.fillRect(r * 0.24, -2.5, 6, 5);

  if (e.affix === 'mirror' || e.affix2 === 'mirror') drawMirrorShield(ctx, e, e.fx);
  if (e.affix === 'vortex' || e.affix2 === 'vortex') {
    ctx.save();
    ctx.rotate(reduced ? 0.6 : (rt.state.waveTime || 0) * 1.6);
    ctx.strokeStyle = PALETTE.emissive.void;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(2, 0, r + 14, r + 6, 0, 0, TAU);
    ctx.stroke();
    ctx.rotate(1.1);
    ctx.beginPath();
    ctx.ellipse(-2, 1, r + 17, r + 6, 0.35, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  if ((e.affix === 'blink' || e.affix2 === 'blink') && (e.blinkTelegraph || (e.blinkTimer !== undefined && e.blinkTimer <= 0.3 && e.blinkTimer > 0))) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, r + 13, 0, TAU);
    ctx.stroke();
  }

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, 0, 0, r * 0.9, PALETTE.emissive.gold, 0.45);
  }
}

function drawTitanGun(ctx, y, alive, enraged, flashing, hp, maxHp, wreckSpark) {
  if (alive) {
    // Heavy armored sponson housing (fixed outline path)
    ctx.fillStyle = flashing ? '#ffffff' : '#1e1812';
    ctx.beginPath();
    ctx.rect(-6, y - 5, 48, 10);
    ctx.fill();
    outline(ctx, 1.4);

    // Rotary barrels / missile cells
    ctx.fillStyle = flashing ? '#ffffff' : '#4a3d31';
    ctx.fillRect(-2, y - 3.5, 42, 3.5);
    ctx.fillRect(-2, y + 0.5, 42, 3.5);

    // Energy conduits
    ctx.fillStyle = flashing ? '#ffffff' : (enraged ? PALETTE.emissive.hostile : PALETTE.emissive.tech);
    ctx.fillRect(18, y - 4, 5, 8);
    ctx.fillRect(32, y - 4, 5, 8);

    if (maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(-4, y < 0 ? y - 9 : y + 7, 32, 3);
      ctx.fillStyle = enraged ? '#ff6644' : (y < 0 ? PALETTE.emissive.tech : PALETTE.emissive.gold);
      ctx.fillRect(-4, y < 0 ? y - 9 : y + 7, 32 * clamp((hp || 0) / maxHp, 0, 1), 3);
    }
    return;
  }

  // Wrecked Sponson: Scorched and sparking destruction
  ctx.fillStyle = '#14110e';
  ctx.fillRect(-8, y - 4, 24, 8);
  ctx.strokeStyle = '#4a3a2e';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(12, y - 5);
  ctx.lineTo(22, y);
  ctx.lineTo(14, y + 5);
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#1a1410';
  ctx.beginPath();
  ctx.arc(6, y, 6, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (Math.sin(wreckSpark) > 0.15) {
    ctx.strokeStyle = Math.sin(wreckSpark * 2) > 0 ? '#ffd36b' : '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(19, y - 6);
    ctx.lineTo(16, y + 3);
    ctx.stroke();
  }
}

function drawTitanTreads(ctx, r, intact, flashing) {
  var trackY = [-r * 0.72, r * 0.72];
  for (var ti = 0; ti < 2; ti += 1) {
    var ty = trackY[ti];
    ctx.save();
    if (!intact) {
      ctx.fillStyle = '#1c1815';
      ctx.fillRect(-r * 0.6, ty - 4, r * 0.8, 8);
      ctx.strokeStyle = '#6a5238';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-r * 0.6, ty - 4, r * 0.8, 8);
      var sparkTime = (rt.renderTime || 0) * 12 + ti;
      if (Math.sin(sparkTime) > 0.3) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.2, ty);
        ctx.lineTo(-r * 0.1, ty + (ti === 0 ? -6 : 6));
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = flashing ? '#ffffff' : '#2a221a';
      ctx.fillRect(-r * 0.75, ty - 5, r * 1.5, 10);
      ctx.strokeStyle = flashing ? '#ffffff' : '#4a3826';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-r * 0.75, ty - 5, r * 1.5, 10);
      ctx.fillStyle = '#14110e';
      for (var seg = -r * 0.7; seg <= r * 0.65; seg += 8) {
        ctx.fillRect(seg, ty - 4, 5, 8);
      }
    }
    ctx.restore();
  }
}

function drawTitanRadiator(ctx, r, intact, exposed, flashing, hp, maxHp) {
  ctx.save();
  var rx = -r * 0.88;
  if (!intact) {
    ctx.fillStyle = '#140f0c';
    ctx.fillRect(rx, -10, 8, 20);
    ctx.strokeStyle = '#ff4d2e';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, -10, 8, 20);
  } else if (exposed) {
    ctx.fillStyle = flashing ? '#ffffff' : '#ffd27d';
    ctx.beginPath();
    ctx.moveTo(rx + 6, -16);
    ctx.lineTo(rx - 14, -22);
    ctx.lineTo(rx - 16, -18);
    ctx.lineTo(rx, -10);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(rx + 6, 16);
    ctx.lineTo(rx - 14, 22);
    ctx.lineTo(rx - 16, 18);
    ctx.lineTo(rx, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ff4d2e';
    ctx.fillRect(rx - 4, -8, 8, 16);
    ctx.fillStyle = '#fff4bd';
    ctx.fillRect(rx - 2, -4, 4, 8);

    var pR = 14 + Math.sin((rt.renderTime || 0) * 16) * 3;
    ctx.strokeStyle = 'rgba(255, 77, 46, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, 0, pR, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = flashing ? '#ffffff' : '#3d3024';
    ctx.fillRect(rx, -12, 10, 24);
    ctx.strokeStyle = '#5a4634';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, -12, 10, 24);
    ctx.fillStyle = '#1e2832';
    ctx.fillRect(rx + 2, -9, 4, 18);
  }
  ctx.restore();
}

function drawTitanBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var enraged = Boolean(e.phase2Triggered);
  var spin = reduced ? 0.3 : (rt.state.waveTime || 0) * 1.8;
  var i;

  // Flanking Tread Skirts
  drawTitanTreads(ctx, r, !e.treadDestroyed, flashing);

  // Rear Heat-Sink Radiator Fins (Dynamic Weakpoint)
  drawTitanRadiator(ctx, r, !e.radiatorDestroyed, e.radiatorExposed, flashing, e.radiatorHp, e.radiatorMaxHp);

  // Twin Heavy Sponsons
  drawTitanGun(ctx, -17, !e.leftCannonDestroyed, enraged, flashing, e.leftCannonHp, e.leftCannonMaxHp, (rt.renderTime || 0) * 9);
  drawTitanGun(ctx, 17, !e.rightPodDestroyed, enraged, flashing, e.rightPodHp, e.rightPodMaxHp, (rt.renderTime || 0) * 9 + 2);

  // Octagonal Dreadnought Hull
  ctx.beginPath();
  for (i = 0; i < 8; i += 1) {
    var oa = (i / 8) * TAU;
    if (i === 0) ctx.moveTo(Math.cos(oa) * r, Math.sin(oa) * r);
    else ctx.lineTo(Math.cos(oa) * r, Math.sin(oa) * r);
  }
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : (enraged ? '#4a2016' : '#342a1e');
  ctx.fill();
  outline(ctx, 2.4);

  if (!flashing) {
    // Multi-tiered battleship sloped armor plates
    for (i = 0; i < 8; i += 1) {
      var a0 = (i / 8) * TAU;
      var a1 = ((i + 1) / 8) * TAU;
      var mid = (a0 + a1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r * 0.92, Math.sin(a0) * r * 0.92);
      ctx.lineTo(Math.cos(a1) * r * 0.92, Math.sin(a1) * r * 0.92);
      ctx.lineTo(Math.cos(mid) * r * 0.52, Math.sin(mid) * r * 0.52);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#6a5238' : '#282016';
      ctx.fill();
      if (enraged) {
        ctx.strokeStyle = 'rgba(255, 70, 40, 0.95)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Industrial hazard warning chevrons on upper & lower hull
    ctx.fillStyle = '#d49b38';
    ctx.fillRect(-r * 0.5, -r * 0.72, 4, 8);
    ctx.fillRect(-r * 0.35, -r * 0.72, 4, 8);
    ctx.fillRect(-r * 0.5, r * 0.72 - 8, 4, 8);
    ctx.fillRect(-r * 0.35, r * 0.72 - 8, 4, 8);
  }

  // Rotating Fusion Reactor Containment Rings
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = flashing ? '#ffffff' : (enraged ? PALETTE.emissive.hostile : PALETTE.emissive.gold);
  ctx.lineWidth = 2.4;
  for (i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, (i / 3) * TAU, (i / 3) * TAU + 0.8);
    ctx.stroke();
  }
  ctx.restore();

  // Core Plasma Star
  var coreR = Math.max(6, r * 0.24);
  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, 0, 0, coreR + (enraged ? 22 : 14), enraged ? PALETTE.emissive.hostile : PALETTE.emissive.gold, 0.85);
  }
  ctx.fillStyle = flashing ? '#ffffff' : (enraged ? '#ff4020' : '#f5a623');
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, TAU);
  ctx.fill();

  ctx.fillStyle = flashing ? '#ffffff' : '#fff4bd';
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.5, 0, TAU);
  ctx.fill();

  // Enraged smoke & flame vents
  if (enraged && !flashing) {
    var puff = reduced ? 0.3 : ((rt.renderTime || 0) * 1.4) % 1;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#1a100e';
    ctx.beginPath();
    ctx.arc(-r * 0.25 - puff * 10, -r * 0.2, 6 + puff * 5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawCommandAntenna(ctx, e, reduced) {
  var pulse = reduced ? 1 : (0.7 + 0.3 * Math.sin((rt.state.waveTime || 0) * 6));
  var tipY = e.y - e.r - 12;
  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.r * 0.35);
  ctx.lineTo(e.x, tipY);
  ctx.stroke();

  // Dual radar dish crossbars
  ctx.beginPath();
  ctx.moveTo(e.x - 5, tipY + 4);
  ctx.lineTo(e.x + 5, tipY + 4);
  ctx.stroke();

  if (!keyGlowsOnly()) drawGlow(ctx, e.x, tipY, 10, PALETTE.emissive.gold, 0.45);
  ctx.fillStyle = '#ffd36b';
  ctx.beginPath();
  ctx.arc(e.x, tipY, 2.5 + pulse * 1.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSpitterBody(ctx, e, flashing) {
  var r = e.r;
  var step = (e.fx && e.fx.step) || 0;
  var reduced = isReducedMotion();

  // Skittering arachnid legs
  ctx.strokeStyle = flashing ? '#ffffff' : '#1c280e';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  var li;
  for (li = 0; li < 4; li += 1) {
    var side = li < 2 ? -1 : 1;
    var slot = li % 2;
    var legPhase = reduced ? 0 : Math.sin(step * 0.25 + slot * 1.5 + (side > 0 ? 1.5 : 0));
    var lx0 = (slot - 0.5) * r * 0.7;
    var ly0 = side * r * 0.55;
    var lx1 = lx0 + legPhase * 3;
    var ly1 = side * r * 1.25;
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();
  }

  // Main thorax & venom sac base
  ctx.fillStyle = flashing ? '#ffffff' : '#263414';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.08, r * 0.85, 0, 0, TAU);
  ctx.fill();
  outline(ctx, 1.8);

  if (!flashing) {
    // Swollen translucent acid reservoir abdomen
    ctx.fillStyle = '#4c6c1e';
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, 0, r * 0.72, r * 0.62, 0, 0, TAU);
    ctx.fill();

    // Glowing acidic bile
    ctx.fillStyle = '#8ec432';
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, 0, r * 0.5, r * 0.42, 0, 0, TAU);
    ctx.fill();

    // Floating bile droplets
    ctx.fillStyle = '#d6ff6a';
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.12, 1.8, 0, TAU);
    ctx.arc(-r * 0.15, r * 0.15, 2.2, 0, TAU);
    ctx.fill();

    // Thoracic armor ridge
    ctx.fillStyle = '#3a4e1a';
    ctx.beginPath();
    ctx.ellipse(r * 0.28, 0, r * 0.45, r * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#1a240c';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Spitting maw with acid drool
  ctx.fillStyle = flashing ? '#ffffff' : '#d6ff6a';
  ctx.beginPath();
  ctx.ellipse(r * 0.98, 0, r * 0.4, r * 0.24, 0, 0, TAU);
  ctx.fill();
  outline(ctx, 1.3);

  // Triple predatory eye cluster
  ctx.fillStyle = flashing ? '#ffffff' : '#141c0a';
  ctx.beginPath();
  ctx.arc(r * 0.4, -r * 0.14, Math.max(1.6, r * 0.16), 0, TAU);
  ctx.arc(r * 0.4, r * 0.14, Math.max(1.6, r * 0.16), 0, TAU);
  ctx.arc(r * 0.52, 0, Math.max(1.4, r * 0.14), 0, TAU);
  ctx.fill();

  ctx.fillStyle = flashing ? '#ffffff' : '#f0ff9a';
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.14, 1, 0, TAU);
  ctx.arc(r * 0.42, r * 0.14, 1, 0, TAU);
  ctx.arc(r * 0.54, 0, 1, 0, TAU);
  ctx.fill();

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, r * 0.95, 0, r * 0.9, '#c6e35a', 0.6);
  }
}

function drawScurrierBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var hot = !!e.arming;
  var wobble = hot && !reduced ? Math.sin((rt.renderTime || 0) * 44) * 1.6 : 0;
  ctx.translate(wobble, 0);

  // 6 Articulated insectoid legs with natural scuttle
  var step = (e.fx && e.fx.step) || 0;
  var i;
  ctx.strokeStyle = flashing ? '#ffffff' : '#3a2014';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (i = 0; i < 6; i += 1) {
    var side = i < 3 ? -1 : 1;
    var slot = i % 3;
    var along = (slot - 1) * r * 0.48;
    var legPhase = reduced ? 0 : Math.sin(step * 0.4 + slot * 1.3 + (side > 0 ? 1.5 : 0));
    var kneeX = along + legPhase * 2.5;
    var kneeY = side * r * 0.8;
    var footX = along + legPhase * 4;
    var footY = side * r * 1.3;
    ctx.beginPath();
    ctx.moveTo(along, side * r * 0.35);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
  }

  // Translucent chemical bomb sac abdomen
  ctx.fillStyle = flashing ? '#ffffff' : (hot ? '#ff9a4a' : '#723a1e');
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, 0, r * 0.85, r * 0.72, 0, 0, TAU);
  ctx.fill();
  outline(ctx, 1.6);

  if (!flashing) {
    ctx.fillStyle = hot ? '#ffb878' : '#a85226';
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, 0, r * 0.55, r * 0.45, 0, 0, TAU);
    ctx.fill();
  }

  // Head with needle mandibles
  ctx.fillStyle = flashing ? '#ffffff' : '#22120a';
  ctx.beginPath();
  ctx.moveTo(r * 0.35, -r * 0.3);
  ctx.lineTo(r * 0.95, 0);
  ctx.lineTo(r * 0.35, r * 0.3);
  ctx.closePath();
  ctx.fill();

  // Glowing compound eyes / detonator core
  ctx.fillStyle = hot ? '#ffffff' : (flashing ? '#ffffff' : '#ff4d2e');
  ctx.beginPath();
  ctx.arc(r * 0.5, -r * 0.12, Math.max(1.4, r * 0.16), 0, TAU);
  ctx.arc(r * 0.5, r * 0.12, Math.max(1.4, r * 0.16), 0, TAU);
  ctx.fill();

  if (hot && !keyGlowsOnly()) {
    drawGlow(ctx, 0, 0, r * 1.6, '#ff8a3d', reduced ? 0.75 : 0.9);
  }
}

function drawWardenBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var pulse = reduced ? 0.5 : (0.5 + 0.5 * Math.sin((rt.renderTime || 0) * 3 + (e.phase || 0)));

  // Sleek geometric diamond ceramic armor chassis
  ctx.fillStyle = flashing ? '#ffffff' : '#0e1a24';
  ctx.beginPath();
  ctx.moveTo(r * 1.05, 0);
  ctx.lineTo(0, r * 0.76);
  ctx.lineTo(-r * 0.9, 0);
  ctx.lineTo(0, -r * 0.76);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 2.2);

  if (!flashing) {
    // Inner ceramic facet plates (high-luminance cold ice ceramic)
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(r * 0.6, 0);
    ctx.lineTo(0, r * 0.42);
    ctx.lineTo(-r * 0.25, 0);
    ctx.lineTo(0, -r * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#bfdbfe';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Floating hard-light emitter pylons symmetrically on BOTH flanks
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(-r * 0.15, -r * 0.95, r * 0.3, 3.5);
    ctx.fillRect(-r * 0.15, r * 0.95 - 3.5, r * 0.3, 3.5);
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-r * 0.15, -r * 0.95, r * 0.3, 3.5);
    ctx.strokeRect(-r * 0.15, r * 0.95 - 3.5, r * 0.3, 3.5);
  }

  // Symmetrical central harmonic shield resonator crest
  ctx.strokeStyle = flashing ? '#ffffff' : '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, 0);
  ctx.lineTo(r * 0.8, 0);
  ctx.stroke();

  ctx.fillStyle = flashing ? '#ffffff' : '#38bdf8';
  ctx.beginPath();
  ctx.arc(0, 0, 2.8 + pulse * 1.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 1.4, 0, TAU);
  ctx.fill();

  // Central ocular sensor with radiant white-cyan eye
  ctx.fillStyle = flashing ? '#ffffff' : '#e0f2fe';
  ctx.beginPath();
  ctx.arc(r * 0.4, 0, Math.max(1.8, r * 0.16), 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r * 0.4, 0, Math.max(1, r * 0.08), 0, TAU);
  ctx.fill();

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, 0, 0, r * 1.1, '#38bdf8', 0.55);
  }
}

function drawBurrowerBody(ctx, e, flashing) {
  var r = e.r;
  // Segmented armored shingle carapace
  ctx.fillStyle = flashing ? '#ffffff' : '#22160c';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.08, r * 0.82, 0, 0, TAU);
  ctx.fill();
  outline(ctx, 2.2);

  if (!flashing) {
    ctx.fillStyle = '#6e4c2e';
    ctx.beginPath();
    ctx.ellipse(r * 0.12, 0, r * 0.6, r * 0.42, 0, 0, TAU);
    ctx.fill();

    // Chitin shingle ridges with crisp highlight
    ctx.strokeStyle = '#120a06';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r * 0.6);
    ctx.lineTo(-r * 0.1, r * 0.6);
    ctx.moveTo(-r * 0.4, -r * 0.45);
    ctx.lineTo(-r * 0.4, r * 0.45);
    ctx.stroke();

    ctx.strokeStyle = '#d4aa78';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, -r * 0.55);
    ctx.lineTo(-r * 0.08, r * 0.55);
    ctx.moveTo(-r * 0.38, -r * 0.4);
    ctx.lineTo(-r * 0.38, r * 0.4);
    ctx.stroke();
  }

  // Massive serrated fossorial digging claws / mandibles
  ctx.fillStyle = flashing ? '#ffffff' : '#f5e4c0';
  ctx.beginPath();
  ctx.moveTo(r * 0.35, -r * 0.2);
  ctx.lineTo(r * 1.35, -r * 0.52);
  ctx.lineTo(r * 0.8, 0);
  ctx.lineTo(r * 1.35, r * 0.52);
  ctx.lineTo(r * 0.35, r * 0.2);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 1.8);

  // Sand vibration sonar sensory pits
  ctx.fillStyle = flashing ? '#ffffff' : '#ffd36b';
  ctx.beginPath();
  ctx.arc(r * 0.35, -r * 0.12, 1.8, 0, TAU);
  ctx.arc(r * 0.35, r * 0.12, 1.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r * 0.35, -r * 0.12, 0.9, 0, TAU);
  ctx.arc(r * 0.35, r * 0.12, 0.9, 0, TAU);
  ctx.fill();

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, r * 0.25, 0, r * 0.6, '#ffd36b', 0.4);
  }
}

function drawBurrowGhost(ctx, e, flashing, reduced) {
  var r = e.r;
  var pulse = reduced ? 0.65 : (0.45 + 0.25 * Math.sin((rt.renderTime || 0) * 6));
  var rot = Math.atan2(e.vy || 0, e.vx || 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(rot);

  // Subterranean sand vortex mound aligned with movement direction
  ctx.fillStyle = 'rgba(74, 54, 36, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.25, r * 0.55, 0, 0, TAU);
  ctx.fill();

  // Seismic pressure rings
  ctx.strokeStyle = flashing ? '#ffffff' : 'rgba(230, 210, 168, ' + pulse.toFixed(3) + ')';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 0.42, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash(NO_DASH);

  ctx.fillStyle = 'rgba(230, 210, 168, 0.9)';
  ctx.beginPath();
  ctx.arc(r * 0.25, 0, 2.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawDreadnoughtBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var enraged = (e.bossPhase || 1) >= 3;

  // Symmetrical Heavy Ironclad Battleship Prow
  ctx.fillStyle = flashing ? '#ffffff' : '#3a221a';
  ctx.beginPath();
  ctx.moveTo(r * 1.22, 0);
  ctx.lineTo(r * 0.22, r * 0.78);
  ctx.lineTo(-r * 1.05, r * 0.62);
  ctx.lineTo(-r * 1.05, -r * 0.62);
  ctx.lineTo(r * 0.22, -r * 0.78);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 2.2);

  if (!flashing) {
    // Superstructure deck plating
    ctx.fillStyle = enraged ? '#8a3628' : '#5e3428';
    ctx.beginPath();
    ctx.moveTo(r * 0.75, 0);
    ctx.lineTo(r * 0.08, r * 0.46);
    ctx.lineTo(-r * 0.48, 0);
    ctx.lineTo(r * 0.08, -r * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e8b088';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Symmetrical side armor skirt plating on both flanks
    ctx.fillStyle = '#22140e';
    ctx.fillRect(-r * 0.65, -r * 0.75, r * 0.8, r * 0.16);
    ctx.fillRect(-r * 0.65, r * 0.59, r * 0.8, r * 0.16);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-r * 0.65, -r * 0.75, r * 0.8, r * 0.16);
    ctx.strokeRect(-r * 0.65, r * 0.59, r * 0.8, r * 0.16);
  }

  // Armored Ramming Beak
  ctx.fillStyle = flashing ? '#ffffff' : '#f0d2a4';
  ctx.beginPath();
  ctx.moveTo(r * 1.22, 0);
  ctx.lineTo(r * 0.75, r * 0.3);
  ctx.lineTo(r * 0.75, -r * 0.3);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 1.4);

  // Rear Engine Compartment & Exposed Weakpoint Turbine
  var turbineCol = e.empTimer > 0 ? '#fff6e8' : (enraged ? '#ff4020' : '#ff8a38');
  ctx.fillStyle = flashing ? '#ffffff' : turbineCol;
  ctx.beginPath();
  ctx.arc(-r * 0.76, 0, r * 0.3, 0, TAU);
  ctx.fill();
  outline(ctx, 1.5);

  // Rotating turbine cooling blades
  var turbineSpin = reduced ? 0.3 : (rt.renderTime || 0) * 8;
  ctx.save();
  ctx.translate(-r * 0.76, 0);
  ctx.rotate(turbineSpin);
  ctx.strokeStyle = '#180c08';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.24, 0);
  ctx.lineTo(r * 0.24, 0);
  ctx.moveTo(0, -r * 0.24);
  ctx.lineTo(0, r * 0.24);
  ctx.stroke();
  ctx.restore();

  // Dynamic EMP Stunned crackling lightning arcs
  if (e.empTimer > 0 && !flashing) {
    var empWave = Math.sin((rt.renderTime || 0) * 24) * 3;
    ctx.strokeStyle = '#9be7ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.3 + empWave);
    ctx.lineTo(0, -r * 0.45 - empWave);
    ctx.lineTo(r * 0.4, empWave);
    ctx.lineTo(-r * 0.2, r * 0.35 - empWave);
    ctx.stroke();
  }

  if (!keyGlowsOnly()) {
    drawGlow(ctx, -r * 0.76, 0, r * 0.85, e.empTimer > 0 ? '#fff1c4' : (enraged ? '#ff4020' : '#ff6a3d'), reduced ? 0.6 : 0.9);
  }
}

function drawSovereignBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var spin = reduced ? 0.4 : (rt.renderTime || 0) * 0.9;

  // Complete outer orbital gyroscopic ring with storm conductor spikes
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = flashing ? '#ffffff' : '#d5e8ff';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, TAU);
  ctx.stroke();

  // Conducting spikes on outer ring
  ctx.fillStyle = '#ffffff';
  var oi;
  for (oi = 0; oi < 4; oi += 1) {
    var oa = (oi / 4) * TAU;
    ctx.fillRect(Math.cos(oa) * r * 0.95 - 2.5, Math.sin(oa) * r * 0.95 - 2.5, 5, 5);
  }
  ctx.restore();

  // Complete counter-rotating inner orbital ring
  ctx.save();
  ctx.rotate(-spin * 1.3);
  ctx.strokeStyle = flashing ? '#ffffff' : '#8ab8ea';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.74, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Floating Central Storm Core
  ctx.fillStyle = flashing ? '#ffffff' : '#14283c';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.52, 0, TAU);
  ctx.fill();
  outline(ctx, 1.6);

  // Blinding Plasma Tempest Singularity
  ctx.fillStyle = flashing ? '#ffffff' : '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(4, r * 0.22), 0, TAU);
  ctx.fill();

  // Miniature internal lightning discharge
  if (!reduced && Math.sin((rt.renderTime || 0) * 20) > 0.2) {
    var lJig = Math.sin((rt.renderTime || 0) * 32) * 3;
    ctx.strokeStyle = '#d5e8ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, lJig);
    ctx.lineTo(0, r * 0.35 - lJig);
    ctx.lineTo(r * 0.35, -r * 0.1 + lJig);
    ctx.stroke();
  }

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, 0, 0, r * 1.1, '#9ec0ea', e.shielded ? 0.95 : 0.55);
  }
}

function drawStormTowerBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var pulse = reduced ? 1 : (0.7 + 0.3 * Math.sin((rt.renderTime || 0) * 5));

  // 3 Anchor buttresses rooted into desert ground
  ctx.fillStyle = flashing ? '#ffffff' : '#182432';
  ctx.fillRect(-r * 0.65, r * 0.6, r * 1.3, 5);

  // Metallic Obelisk Spire Pylon
  ctx.fillStyle = flashing ? '#ffffff' : '#26384e';
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.05);
  ctx.lineTo(r * 0.58, r * 0.78);
  ctx.lineTo(-r * 0.58, r * 0.78);
  ctx.closePath();
  ctx.fill();
  outline(ctx, 1.8);

  if (!flashing) {
    // Stacked electromagnetic induction capacitor rings
    ctx.fillStyle = '#6896c4';
    ctx.fillRect(-r * 0.35, -r * 0.2, r * 0.7, 4.5);
    ctx.fillRect(-r * 0.45, r * 0.15, r * 0.9, 4.5);
    ctx.fillRect(-r * 0.52, r * 0.48, r * 1.04, 4.5);
  }

  // Summit Tesla Sphere & Corona
  ctx.fillStyle = flashing ? '#ffffff' : '#d5e8ff';
  ctx.beginPath();
  ctx.arc(0, -r * 1.05, 4.5 * pulse, 0, TAU);
  ctx.fill();

  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, 0, -r * 1.05, 14, '#d5e8ff', 0.65);
  }
}

function drawMineBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var hot = !!e.arming;
  var blink = hot && !reduced ? (Math.sin((rt.renderTime || 0) * 28) > 0) : hot;

  // Proximity trigger field (high-contrast dashed warning ring)
  if (!hot) {
    ctx.save();
    // Dark contrast backing rim
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, TAU);
    ctx.strokeStyle = 'rgba(6, 6, 8, 0.72)';
    ctx.lineWidth = isHighContrast() ? 3.8 : 2.8;
    ctx.stroke();

    // High-visibility hazard boundary
    ctx.strokeStyle = isHighContrast() ? '#ffffff' : 'rgba(255, 175, 45, 0.82)';
    ctx.lineWidth = isHighContrast() ? 2.2 : 1.6;
    ctx.setLineDash(reduced ? [4, 6] : [5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, TAU);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.restore();
  }

  // 8 Magnetic sensor horns / contact detonators
  ctx.fillStyle = flashing ? '#ffffff' : '#140c06';
  var mi;
  for (mi = 0; mi < 8; mi += 1) {
    var ma = (mi / 8) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(ma) * (r + 1.5), Math.sin(ma) * (r + 1.5), 1.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.arc(Math.cos(ma) * (r + 2), Math.sin(ma) * (r + 2), 0.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flashing ? '#ffffff' : '#140c06';
  }

  // Heavy spherical casing (obsidian finish)
  ctx.fillStyle = flashing ? '#ffffff' : '#161412';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  outline(ctx, 2.0);

  // Hazard warning chevron stripe ring
  if (!flashing) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.65, 0, TAU);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  // Central pulsating proximity sensor eye
  ctx.fillStyle = blink ? '#ffffff' : (hot ? '#ff2600' : '#f59e0b');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, TAU);
  ctx.fill();
  if (blink || hot) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, TAU);
    ctx.fill();
  }

  if (hot && !keyGlowsOnly()) {
    drawGlow(ctx, 0, 0, r * 1.8, '#ff3b1e', reduced ? 0.75 : 0.98);
  }
}

function warnRing(ctx, x, y, radius, remain, color, reduced) {
  if (!(radius > 1)) return;
  var pulse = reduced ? 0.9 : (0.55 + 0.45 * Math.sin((rt.renderTime || 0) * (reduced ? 0 : 16)));
  var alpha = reduced ? 0.9 : (0.45 + (1 - remain) * 0.5);
  ctx.save();
  // Contrast backing dark rim
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.strokeStyle = 'rgba(6, 6, 8, 0.85)';
  ctx.lineWidth = isHighContrast() ? 4.8 : 3.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.setLineDash(reduced ? NO_DASH : [5, 4]);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = isHighContrast() ? 2.8 : 2;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.globalAlpha = (reduced ? 0.28 : 0.16) + (1 - remain) * 0.2;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawFieldTelegraphs(ctx) {
  if (!rt.state) return;
  var reduced = isReducedMotion();
  var list = rt.state.enemies;
  var i;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var e = list[i];
      if (!e) continue;
      if (e.kind === 'scurrier' && e.arming) {
        var armMax = 0.45;
        var armLeft = e.armTimer > 0 ? e.armTimer / armMax : 0;
        warnRing(ctx, e.x, e.y, 70, armLeft, '#ff8a3d', reduced);
        if (!reduced) {
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin((rt.renderTime || 0) * 22));
          ctx.strokeStyle = '#fff6e8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 70, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (e.kind === 'mine' && e.arming) {
        var mineArmMax = 0.4;
        var mineLeft = e.armTimer > 0 ? e.armTimer / mineArmMax : 0;
        warnRing(ctx, e.x, e.y, 80, mineLeft, '#ff3814', reduced);
        if (!reduced) {
          ctx.save();
          ctx.globalAlpha = 0.4 + 0.45 * Math.abs(Math.sin((rt.renderTime || 0) * 28));
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 80, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (e.kind === 'burrower' && e.state === 'warn') {
        var warnLeft = e.warnT > 0 ? e.warnT / 0.8 : 0;
        warnRing(ctx, e.warnX || e.x, e.warnY || e.y, 50, warnLeft, '#e6d2a8', reduced);
      }
      if (e.kind === 'dreadnought' && e.mode === 'telegraph') {
        var len = 900;
        var left = e.telegraphMax ? e.telegraphT / e.telegraphMax : 0;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.aim || 0);
        ctx.globalAlpha = reduced ? 0.55 : (0.35 + (1 - left) * 0.45);
        ctx.fillStyle = 'rgba(255, 106, 61, 0.35)';
        ctx.fillRect(0, -30, len, 60);
        ctx.strokeStyle = '#fff1c4';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -30, len, 60);
        ctx.restore();
      }
      if (e.kind === 'sovereign') {
        if (e.windNext != null && e.windCd <= 1) {
          var ang = e.windNext;
          ctx.save();
          ctx.translate(e.x, e.y - e.r - 28);
          ctx.rotate(ang);
          ctx.globalAlpha = reduced ? 0.9 : (0.55 + 0.35 * Math.sin((rt.renderTime || 0) * 8));
          ctx.strokeStyle = '#d5e8ff';
          ctx.fillStyle = '#d5e8ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-16, 0);
          ctx.lineTo(18, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(18, 0);
          ctx.lineTo(8, -7);
          ctx.lineTo(8, 7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        if (e.eyeRadius > 0) {
          ctx.save();
          var eyeCx = e.eyeX || e.x;
          var eyeCy = e.eyeY || e.y;
          var eyeR = e.eyeRadius;
          var eyeHc = isHighContrast();

          // 1. Heavy dark contrast backing
          ctx.beginPath();
          ctx.arc(eyeCx, eyeCy, eyeR, 0, TAU);
          ctx.strokeStyle = 'rgba(6, 6, 8, 0.92)';
          ctx.lineWidth = eyeHc ? 7.0 : 5.5;
          ctx.stroke();

          // 2. High-contrast main boundary ring
          ctx.beginPath();
          ctx.arc(eyeCx, eyeCy, eyeR, 0, TAU);
          ctx.strokeStyle = e.eyeWarn > 0
            ? (eyeHc ? '#ffffff' : 'rgba(255, 215, 150, 0.98)')
            : (eyeHc ? '#ffffff' : 'rgba(185, 220, 255, 0.98)');
          ctx.lineWidth = e.eyeWarn > 0 ? (eyeHc ? 3.5 : 2.8) : (eyeHc ? 4.0 : 3.2);
          ctx.setLineDash(e.eyeWarn > 0 || reduced ? NO_DASH : [8, 6]);
          ctx.stroke();
          ctx.setLineDash(NO_DASH);

          // 3. Hazard hash ticks / storm boundary teeth
          if (!reduced) {
            var teeth = 16;
            var tAngleOffset = (rt.renderTime || 0) * 0.4;
            ctx.save();
            ctx.strokeStyle = e.eyeWarn > 0 ? 'rgba(255, 180, 100, 0.85)' : 'rgba(140, 200, 255, 0.8)';
            ctx.lineWidth = 1.6;
            for (var ti = 0; ti < teeth; ti += 1) {
              var ta = tAngleOffset + (ti / teeth) * TAU;
              var cosT = Math.cos(ta);
              var sinT = Math.sin(ta);
              ctx.beginPath();
              ctx.moveTo(eyeCx + cosT * (eyeR - 4), eyeCy + sinT * (eyeR - 4));
              ctx.lineTo(eyeCx + cosT * (eyeR + 8), eyeCy + sinT * (eyeR + 8));
              ctx.stroke();
            }
            ctx.restore();
          }

          ctx.restore();
        }
        if (e.shielded) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r + 16, 0, TAU);
          ctx.strokeStyle = 'rgba(213, 232, 255, 0.9)';
          ctx.lineWidth = 2.4;
          ctx.stroke();
          if (!keyGlowsOnly()) drawGlow(ctx, e.x, e.y, e.r + 18, '#d5e8ff', reduced ? 0.35 : 0.55);
          ctx.restore();
        }
      }
      if (e.shieldHp > 0 && e.shieldOwner) {
        ctx.save();
        ctx.strokeStyle = 'rgba(159, 208, 234, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(e.shieldOwner.x, e.shieldOwner.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  var blasts = rt.state.pendingBlasts;
  if (blasts) {
    for (i = 0; i < blasts.length; i += 1) {
      var b = blasts[i];
      var remain = b.maxTimer ? b.timer / b.maxTimer : 0;
      warnRing(ctx, b.x, b.y, b.r || 110, remain, b.tint || '#e8b94e', reduced);
    }
  }
  var strikes = rt.state.lightningStrikes;
  if (strikes) {
    for (i = 0; i < strikes.length; i += 1) {
      var bolt = strikes[i];
      ctx.save();
      ctx.lineCap = 'round';
      var w = bolt.width || 26;
      var hc = isHighContrast();
      if (bolt.warning) {
        // Warning corridor telegraph
        // 1. Dark contrast envelope backing
        ctx.strokeStyle = 'rgba(6, 8, 14, 0.85)';
        ctx.lineWidth = w + 4;
        ctx.beginPath();
        ctx.moveTo(bolt.x1, bolt.y1);
        ctx.lineTo(bolt.x2, bolt.y2);
        ctx.stroke();

        // 2. Translucent electric danger fill
        ctx.strokeStyle = hc ? 'rgba(255, 255, 255, 0.45)' : 'rgba(140, 215, 255, 0.35)';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(bolt.x1, bolt.y1);
        ctx.lineTo(bolt.x2, bolt.y2);
        ctx.stroke();

        // 3. Bright hazard rail edges / centerline
        ctx.strokeStyle = hc ? '#ffffff' : 'rgba(220, 245, 255, 0.9)';
        ctx.lineWidth = 2.0;
        ctx.setLineDash(reduced ? NO_DASH : [6, 4]);
        ctx.beginPath();
        ctx.moveTo(bolt.x1, bolt.y1);
        ctx.lineTo(bolt.x2, bolt.y2);
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
      } else {
        // Active lightning strike
        // 1. Dark shock envelope backing
        ctx.strokeStyle = 'rgba(6, 8, 14, 0.9)';
        ctx.lineWidth = w + 6;
        ctx.beginPath();
        ctx.moveTo(bolt.x1, bolt.y1);
        ctx.lineTo(bolt.x2, bolt.y2);
        ctx.stroke();

        // 2. Electric blue core
        ctx.strokeStyle = hc ? '#ffffff' : '#badbff';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(bolt.x1, bolt.y1);
        ctx.lineTo(bolt.x2, bolt.y2);
        ctx.stroke();

        // 3. Blinding white-hot spine
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(3, w * 0.4);
        ctx.beginPath();
        ctx.moveTo(bolt.x1, bolt.y1);
        ctx.lineTo(bolt.x2, bolt.y2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

function drawEnemyContrastBase(ctx, e) {
  var r = e.r || 12;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 6, 8, 0.72)';
  ctx.beginPath();
  if (e.kind === 'rusher') {
    ctx.moveTo(r * 1.55, 0);
    ctx.lineTo(-r * 0.7, r * 1.1);
    ctx.lineTo(-r * 0.28, 0);
    ctx.lineTo(-r * 0.7, -r * 1.1);
    ctx.closePath();
  } else if (e.kind === 'burrower') {
    ctx.ellipse(0, 0, r * 1.2, r * 0.95, 0, 0, TAU);
  } else if (e.kind === 'crawler') {
    ctx.ellipse(0, 0, r * 1.18, r * 1.12, 0, 0, TAU);
  } else if (e.kind === 'brute') {
    ctx.ellipse(0, 0, r * 1.18, r * 1.08, 0, 0, TAU);
  } else if (e.kind === 'warden') {
    ctx.moveTo(r * 1.18, 0);
    ctx.lineTo(0, r * 0.88);
    ctx.lineTo(-r * 1.02, 0);
    ctx.lineTo(0, -r * 0.88);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, r * 1.12 + 1.2, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}

export function drawEnemy(ctx, e) {
  if (!ctx || !e || !rt.state) return;
  var fx = ensureFx(e);
  var flashing = tickFlash(e);
  var reduced = isReducedMotion();
  trackStep(e);
  stampBlink(e, fx);
  senseMirror(e, fx);
  noteArtillery(e, fx);
  decay(fx, 'g0t');
  decay(fx, 'g1t');
  decay(fx, 'rippleT');
  if (e.kind === 'elite' && (e.affix === 'blink' || e.affix2 === 'blink')) {
    drawPixelGhost(ctx, fx.g0x, fx.g0y, fx.g0t);
    drawPixelGhost(ctx, fx.g1x, fx.g1y, fx.g1t);
  }
  if (e.kind === 'burrower' && e.burrowed) {
    drawBurrowGhost(ctx, e, flashing, reduced);
    return;
  }
  var pose = spawnPose(e, e.kind === 'titan' || e.isBoss ? 1 : 0.35);
  var lean = 0;
  if (!reduced) {
    var spd = Math.hypot(e.vx || 0, e.vy || 0);
    lean = Math.min(2.2, spd / 90);
  }
  var jx = 0;
  var jy = 0;
  if (!reduced && e.jitterTimer > 0) {
    var jDist = Math.sin((e.jitterTimer / 0.033) * Math.PI * 4) * (e.jitterAmount || 3.5);
    var jAng = e.jitterAngle || 0;
    jx = Math.cos(jAng) * jDist;
    jy = Math.sin(jAng) * jDist;
  }
  ctx.save();
  ctx.translate(e.x + jx, e.y + jy);
  if (pose.dust > 0) drawDustRing(ctx, e.r * (e.kind === 'titan' || e.kind === 'brute' ? 1.5 : 1), pose.dust);

  // Static building structures & mines do not rotate with player facing
  var facing = (e.kind === 'stormTower' || e.kind === 'mine') ? 0 :
    ((e.kind === 'dreadnought' || e.kind === 'sovereign') && e.aim != null ? e.aim : faceOf(e));
  ctx.rotate(facing);
  ctx.translate(lean, 0);
  ctx.globalAlpha *= pose.alpha;
  ctx.scale(pose.scale, pose.scale);

  // High contrast under-chassis grounding silhouette
  drawEnemyContrastBase(ctx, e);

  if (e.kind === 'elite') drawEliteBody(ctx, e, flashing, reduced);
  else if (e.kind === 'brute') drawBruteBody(ctx, e, flashing, reduced);
  else if (e.kind === 'rusher') drawRusherBody(ctx, e, flashing, reduced);
  else if (e.kind === 'artillery') drawArtilleryBody(ctx, e, flashing);
  else if (e.kind === 'titan') drawTitanBody(ctx, e, flashing, reduced);
  else if (e.kind === 'spitter') drawSpitterBody(ctx, e, flashing);
  else if (e.kind === 'scurrier') drawScurrierBody(ctx, e, flashing, reduced);
  else if (e.kind === 'warden') drawWardenBody(ctx, e, flashing, reduced);
  else if (e.kind === 'burrower') drawBurrowerBody(ctx, e, flashing);
  else if (e.kind === 'dreadnought') drawDreadnoughtBody(ctx, e, flashing, reduced);
  else if (e.kind === 'sovereign') drawSovereignBody(ctx, e, flashing, reduced);
  else if (e.kind === 'stormTower') drawStormTowerBody(ctx, e, flashing, reduced);
  else if (e.kind === 'mine') drawMineBody(ctx, e, flashing, reduced);
  else drawCrawlerBody(ctx, e, flashing, reduced);

  ctx.restore();
  if (e.kind === 'elite' && (e.affix === 'command' || e.affix2 === 'command')) drawCommandAntenna(ctx, e, reduced);
}

var tagWidths = Object.create(null);
var tagSprites = Object.create(null);

function tagSprite(text, color) {
  var key = text + '|' + color;
  var hit = tagSprites[key];
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  var canvas = document.createElement('canvas');
  var g = canvas.getContext('2d');
  if (!g) return null;
  g.font = '700 9px monospace';
  var w = Math.ceil(g.measureText(text).width + 10);
  if (w < 12) w = 12;
  canvas.width = w;
  canvas.height = 16;
  g.font = '700 9px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(6, 6, 8, 0.94)';
  g.fillRect(0, 0, w, 16);
  g.strokeStyle = '#000000';
  g.lineWidth = 2;
  g.strokeRect(0, 0, w, 16);
  g.strokeStyle = color;
  g.lineWidth = 1.2;
  g.strokeRect(1, 1, w - 2, 14);
  g.fillStyle = color;
  g.fillText(text, w * 0.5, 8.5);
  tagSprites[key] = canvas;
  return canvas;
}

function drawTag(ctx, x, y, text, color) {
  var sprite = tagSprite(text, color);
  if (!sprite) {
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var known = tagWidths[text];
    if (!known) {
      known = ctx.measureText(text).width + 8;
      tagWidths[text] = known;
    }
    ctx.fillStyle = 'rgba(6, 6, 8, 0.94)';
    ctx.fillRect(x - known * 0.5, y - 8, known, 16);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - known * 0.5, y - 8, known, 16);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - known * 0.5 + 1, y - 7, known - 2, 14);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    return;
  }
  ctx.drawImage(sprite, x - sprite.width * 0.5, y - sprite.height * 0.5);
}

function drawCommandLinks(ctx) {
  var list = rt.state.enemies;
  if (!list) return;
  var i;
  var j;
  ctx.save();
  ctx.setLineDash(DASH_3);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#f59e0b';
  ctx.lineCap = 'butt';
  for (i = 0; i < list.length; i += 1) {
    var ally = list[i];
    if (!(ally.commandBuffTimer > 0)) continue;
    ctx.setLineDash(DASH_3);
    ctx.beginPath();
    ctx.arc(ally.x, ally.y, ally.r + 4, 0, TAU);
    ctx.stroke();
    for (j = 0; j < list.length; j += 1) {
      var boss = list[j];
      if (boss.kind !== 'elite' || boss.affix !== 'command') continue;
      var dx = ally.x - boss.x;
      var dy = ally.y - boss.y;
      if (dx * dx + dy * dy > 170 * 170) continue;
      ctx.beginPath();
      ctx.moveTo(boss.x, boss.y - boss.r - 11);
      ctx.lineTo(ally.x, ally.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLayerBars(ctx) {
  var list = rt.state.enemies;
  var i;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var e = list[i];
      if (!(e.maxHp > 0) || !(e.hp < e.maxHp)) continue;
      drawHpBar(ctx, e.x, e.y - e.r - 12, Math.max(18, e.r * 2), e.hp / e.maxHp);
    }
  }
  var cores = rt.state.volatileCores;
  if (cores) {
    for (i = 0; i < cores.length; i += 1) {
      var c = cores[i];
      if (!(c.maxHp > 0) || !(c.hp < c.maxHp)) continue;
      drawHpBar(ctx, c.x, c.y - c.r * 1.3 - 10, c.r * 2.4, c.hp / c.maxHp);
    }
  }
  var barrels = rt.state.barrels;
  if (barrels) {
    for (i = 0; i < barrels.length; i += 1) {
      var b = barrels[i];
      if (!(b.maxHp > 0) || !(b.hp < b.maxHp)) continue;
      drawHpBar(ctx, b.x, b.y - b.r - 10, b.r * 2, b.hp / b.maxHp);
    }
  }
}

function drawLabels(ctx) {
  var list = rt.state.enemies;
  if (!list) return;
  var hc = isHighContrast();
  var i;
  ctx.save();
  for (i = 0; i < list.length; i += 1) {
    var e = list[i];
    var lift = (e.maxHp > 0 && e.hp < e.maxHp) ? 8 : 0;
    var y = e.y - e.r - (hc ? 30 : 18) - lift;
    if (e.kind === 'elite' && e.affix) {
      var tag = e.affix === 'mirror' ? '[MRR]' :
        e.affix === 'vortex' ? '[VTX]' :
        e.affix === 'command' ? '[CMD]' :
        e.affix === 'blink' ? '[BLK]' : '';
      var col = e.affix === 'mirror' ? '#38bdf8' :
        e.affix === 'vortex' ? '#c084fc' :
        e.affix === 'command' ? '#fbbf24' :
        e.affix === 'blink' ? '#34d399' : '#ffffff';
      if (!tag && e.affix === 'volatile') {
        tag = '[VOL]';
        col = '#ffbe2e';
      }
      if (!tag && e.affix === 'splitter') {
        tag = '[SPL]';
        col = '#ff7844';
      }
      if (tag) drawTag(ctx, e.x, y, tag, col);
      if (e.affix2 && e.affix2 !== e.affix) {
        var tag2 = e.affix2 === 'mirror' ? '[MRR]' :
          e.affix2 === 'vortex' ? '[VTX]' :
          e.affix2 === 'command' ? '[CMD]' :
          e.affix2 === 'blink' ? '[BLK]' :
          e.affix2 === 'volatile' ? '[VOL]' :
          e.affix2 === 'splitter' ? '[SPL]' : '';
        var col2 = e.affix2 === 'mirror' ? '#38bdf8' :
          e.affix2 === 'vortex' ? '#c084fc' :
          e.affix2 === 'command' ? '#fbbf24' :
          e.affix2 === 'blink' ? '#34d399' :
          e.affix2 === 'volatile' ? '#ffbe2e' : '#ff7844';
        if (tag2) drawTag(ctx, e.x, y - 14, tag2, col2);
      }
    }
    if (e.kind === 'titan' && (e.leftCannonDestroyed || e.rightPodDestroyed || e.radiatorDestroyed || e.treadDestroyed)) {
      var titanParts = [];
      if (e.leftCannonDestroyed) titanParts.push('[L: OFF]');
      if (e.rightPodDestroyed) titanParts.push('[R: OFF]');
      if (e.radiatorDestroyed) titanParts.push('[FINS: OFF]');
      if (e.treadDestroyed) titanParts.push('[TRK: OFF]');
      drawTag(ctx, e.x, y, titanParts.join(' '), PALETTE.emissive.hostile);
    }
  }
  ctx.restore();
}

export function drawRusherTelegraphs(ctx) {
  if (!ctx || !rt.state || !rt.state.enemies) return;
  drawFieldTelegraphs(ctx);
  var list = rt.state.enemies;
  var i;
  for (i = 0; i < list.length; i += 1) {
    if (list[i].kind === 'rusher') drawRusherTelegraph(ctx, list[i]);
  }
  drawCommandLinks(ctx);
  drawLayerBars(ctx);
  drawLabels(ctx);
}

function drawRusherTelegraph(ctx, e) {
  if (e.burstCd !== undefined && e.burstCd <= 0.35 && e.burstCd > 0) {
    var tAngle = e.burstAngle !== undefined ? e.burstAngle : faceOf(e);
    var chargeRatio = 1 - (e.burstCd / 0.35);
    var x1 = e.x + Math.cos(tAngle) * 160;
    var y1 = e.y + Math.sin(tAngle) * 160;
    ctx.save();
    ctx.lineCap = 'round';
    // Dark contrast backing beam
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = 'rgba(6, 6, 8, 0.85)';
    ctx.lineWidth = 6.5;
    ctx.stroke();
    // Colored outer laser guide
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = 'rgba(255, 60, 20, 0.45)';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    // Inner dashed guide with bright white-hot center
    ctx.setLineDash(DASH_6);
    ctx.strokeStyle = 'rgba(255, 120, 50, ' + (0.7 + chargeRatio * 0.3) + ')';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.8 + chargeRatio * 0.2) + ')';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    // Arrowhead reticle with dark border
    ctx.fillStyle = 'rgba(6, 6, 8, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(tAngle - 0.4) * 12, y1 - Math.sin(tAngle - 0.4) * 12);
    ctx.lineTo(x1 - Math.cos(tAngle + 0.4) * 12, y1 - Math.sin(tAngle + 0.4) * 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 180, ' + (0.6 + chargeRatio * 0.4) + ')';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(tAngle - 0.4) * 10, y1 - Math.sin(tAngle - 0.4) * 10);
    ctx.lineTo(x1 - Math.cos(tAngle + 0.4) * 10, y1 - Math.sin(tAngle + 0.4) * 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (e.burstTime !== undefined && e.burstTime > 0) {
    var bAngle = e.burstAngle !== undefined ? e.burstAngle : Math.atan2(e.vy || 0, e.vx || 1);
    var si;
    for (si = 1; si <= 3; si += 1) {
      var segDist = si * 16;
      ctx.save();
      ctx.translate(e.x - Math.cos(bAngle) * segDist, e.y - Math.sin(bAngle) * segDist);
      ctx.rotate(bAngle);
      ctx.globalAlpha = 0.5 - si * 0.12;
      drawRusherShape(ctx, e.r, false, true);
      ctx.restore();
    }
  }
}

export function drawHighContrastMarkers(ctx) {
  if (!isHighContrast() || !rt.state || !rt.state.enemies) return;
  var i;
  for (i = 0; i < rt.state.enemies.length; i += 1) {
    drawHighContrastMarker(ctx, rt.state.enemies[i]);
  }
}

function drawHighContrastMarker(ctx, e) {
  // Do not reveal subterranean burrowers
  if (e.kind === 'burrower' && e.burrowed) return;

  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r + 2, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r + 2, 0, TAU);
  ctx.stroke();
  var glyph = e.kind === 'crawler' ? '▲' :
    e.kind === 'rusher' ? '⚡' :
    e.kind === 'brute' ? '■' :
    e.kind === 'artillery' ? '⬡' :
    e.kind === 'elite' ? (
      e.affix === 'mirror' ? '▲' :
      e.affix === 'vortex' ? '●' :
      e.affix === 'command' ? '★' :
      e.affix === 'blink' ? '⚡' : '★'
    ) :
    e.kind === 'titan' ? '☠' :
    e.kind === 'spitter' ? '◉' :
    e.kind === 'scurrier' ? '✶' :
    e.kind === 'warden' ? '✚' :
    e.kind === 'burrower' ? '▽' :
    e.kind === 'dreadnought' ? '▶' :
    e.kind === 'sovereign' ? '◎' :
    e.kind === 'stormTower' ? '⌃' :
    e.kind === 'mine' ? '●' : '●';
  ctx.font = '900 13px "Segoe UI Symbol", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(glyph, e.x, e.y - e.r - 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(glyph, e.x, e.y - e.r - 8);
  ctx.restore();
}
