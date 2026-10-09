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
  if (e.kind !== 'elite' || e.affix !== 'blink') return;
  if (!(fx.moved > 36)) return;
  fx.g0x = e.x - fx.dx;
  fx.g0y = e.y - fx.dy;
  fx.g0t = 0.48;
  fx.g1x = e.x;
  fx.g1y = e.y;
  fx.g1t = 0.48;
}

function senseMirror(e, fx) {
  if (e.kind !== 'elite' || e.affix !== 'mirror') return;
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

function drawRusherShape(ctx, r, flashing, hot) {
  ctx.fillStyle = hot ? '#fff4e4' : '#2a1c14';
  ctx.fillRect(-r * 0.95, -r * 0.62, r * 0.42, r * 0.24);
  ctx.fillRect(-r * 0.95, r * 0.38, r * 0.42, r * 0.24);
  ctx.beginPath();
  ctx.moveTo(r * 1.35, 0);
  ctx.lineTo(-r * 0.55, r * 0.95);
  ctx.lineTo(-r * 0.15, 0);
  ctx.lineTo(-r * 0.55, -r * 0.95);
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : '#5a3018';
  ctx.fill();
  if (!flashing) {
    ctx.fillStyle = '#e0a05a';
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(r * 0.15, r * 0.32);
    ctx.lineTo(r * 0.15, -r * 0.32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(r * 1.35, 0);
  ctx.lineTo(-r * 0.55, r * 0.95);
  ctx.lineTo(-r * 0.15, 0);
  ctx.lineTo(-r * 0.55, -r * 0.95);
  ctx.closePath();
  outline(ctx, 1.6);
}

function drawCrawlerLeg(ctx, r, i, step, flashing, reduced) {
  var side = i < 3 ? -1 : 1;
  var slot = i % 3;
  var along = (slot - 1) * r * 0.58;
  var phase = reduced ? 0 : Math.sin(step * 0.28 + slot + (side > 0 ? 1.4 : 0));
  var hipX = along * 0.85;
  var hipY = side * r * 0.72;
  var kneeX = along + phase * r * 0.32;
  var kneeY = side * r * 1.05;
  var footX = along + phase * r * 0.12;
  var footY = side * r * 1.36;
  ctx.strokeStyle = flashing ? '#ffffff' : '#2c241c';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  ctx.fillStyle = flashing ? '#ffffff' : '#1a1612';
  ctx.beginPath();
  ctx.arc(footX, footY, 2, 0, TAU);
  ctx.fill();
}

function drawCrawlerBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var step = (e.fx && e.fx.step) || 0;
  var i;
  for (i = 0; i < 6; i += 1) drawCrawlerLeg(ctx, r, i, step, flashing, reduced);
  ctx.fillStyle = flashing ? '#ffffff' : '#3a3028';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  outline(ctx, 1.6);
  if (!flashing) {
    ctx.fillStyle = '#6a5644';
    ctx.beginPath();
    ctx.ellipse(r * 0.12, -r * 0.08, r * 0.72, r * 0.48, -0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4e3c30';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, r * 0.08, r * 0.42, r * 0.62, 0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#241c16';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.72);
    ctx.lineTo(-r * 0.05, r * 0.72);
    ctx.moveTo(r * 0.28, -r * 0.6);
    ctx.lineTo(r * 0.36, r * 0.55);
    ctx.stroke();
  }
  ctx.fillStyle = flashing ? '#ffffff' : '#e8b94e';
  ctx.beginPath();
  ctx.arc(r * 0.62, 0, Math.max(2.2, r * 0.2), 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#24180a';
  ctx.beginPath();
  ctx.arc(r * 0.7, 0, Math.max(1, r * 0.08), 0, TAU);
  ctx.fill();
  if (!keyGlowsOnly() && !flashing) drawGlow(ctx, r * 0.62, 0, r * 0.7, PALETTE.hud.amber, 0.45);
}

function drawRusherBody(ctx, e, flashing, reduced) {
  var charging = e.burstCd !== undefined && e.burstCd <= 0.35 && e.burstCd > 0;
  var bursting = e.burstTime !== undefined && e.burstTime > 0;
  var hot = charging || bursting;
  var chargeRatio = charging ? 1 - e.burstCd / 0.35 : (bursting ? 1 : 0);
  if (hot && !reduced) ctx.translate(Math.sin((rt.state.waveTime || 0) * 46) * 1.5, 0);
  drawRusherShape(ctx, e.r, flashing, hot && chargeRatio > 0.45);
  var eyeHot = hot && (reduced || bursting || Math.sin((rt.state.waveTime || 0) * 12) > 0);
  ctx.fillStyle = eyeHot ? '#fff6e8' : (hot ? '#ffb080' : '#4a3022');
  ctx.beginPath();
  ctx.arc(e.r * 0.72, 0, Math.max(1.6, e.r * 0.16), 0, TAU);
  ctx.fill();
  if (hot && !keyGlowsOnly()) {
    drawGlow(ctx, -e.r * 0.78, -e.r * 0.5, e.r * 0.9, eyeHot ? '#fff4e0' : PALETTE.emissive.hostile, 0.55);
    drawGlow(ctx, -e.r * 0.78, e.r * 0.5, e.r * 0.9, eyeHot ? '#fff4e0' : PALETTE.emissive.hostile, 0.55);
  }
  if (hot) {
    ctx.fillStyle = eyeHot ? '#fff6e8' : '#ff8a4a';
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.05, -e.r * 0.5);
    ctx.lineTo(-e.r * (1.45 + chargeRatio * 0.4), -e.r * 0.22);
    ctx.lineTo(-e.r * 1.05, -e.r * 0.38);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.05, e.r * 0.5);
    ctx.lineTo(-e.r * (1.45 + chargeRatio * 0.4), e.r * 0.22);
    ctx.lineTo(-e.r * 1.05, e.r * 0.38);
    ctx.fill();
  }
}

function drawBruteBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var step = (e.fx && e.fx.step) || 0;
  var piston = reduced ? 0 : Math.sin(step * 0.22) * r * 0.12;
  var puff = reduced ? 0.4 : ((rt.renderTime || 0) * 1.4) % 1;
  ctx.fillStyle = flashing ? '#ffffff' : '#4a2a24';
  ctx.beginPath();
  ctx.moveTo(r * 0.15, -r * 0.9);
  ctx.lineTo(r * 0.72, -r * 0.48);
  ctx.lineTo(r, 0);
  ctx.lineTo(r * 0.72, r * 0.48);
  ctx.lineTo(r * 0.15, r * 0.9);
  ctx.lineTo(-r * 0.82, r * 0.78);
  ctx.lineTo(-r, 0);
  ctx.lineTo(-r * 0.82, -r * 0.78);
  ctx.closePath();
  ctx.fill();
  if (!flashing) {
    ctx.fillStyle = '#8a4638';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(r * 0.72, -r * 0.48);
    ctx.lineTo(r * 0.2, -r * 0.2);
    ctx.lineTo(r * 0.2, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(r * 0.15, -r * 0.9);
  ctx.lineTo(r * 0.72, -r * 0.48);
  ctx.lineTo(r, 0);
  ctx.lineTo(r * 0.72, r * 0.48);
  ctx.lineTo(r * 0.15, r * 0.9);
  ctx.lineTo(-r * 0.82, r * 0.78);
  ctx.lineTo(-r, 0);
  ctx.lineTo(-r * 0.82, -r * 0.78);
  ctx.closePath();
  outline(ctx, 1.7);
  if (!flashing) {
    ctx.strokeStyle = '#e7d3a8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(r * 0.72, -r * 0.48);
    ctx.lineTo(r, 0);
    ctx.lineTo(r * 0.72, r * 0.48);
    ctx.stroke();
  }
  ctx.fillStyle = flashing ? '#ffffff' : '#c4a574';
  ctx.fillRect(-r * 0.15, -r * 0.55, r * 0.22, r * 0.28 + piston);
  ctx.fillRect(-r * 0.15, r * 0.22 - piston, r * 0.22, r * 0.28);
  ctx.fillStyle = flashing ? '#ffffff' : '#1a100e';
  ctx.fillRect(-r * 0.72, -r * 0.7, r * 0.28, r * 0.22);
  ctx.fillRect(-r * 0.72, r * 0.48, r * 0.28, r * 0.22);
  ctx.save();
  ctx.globalAlpha = 0.28 * (1 - puff * 0.4);
  ctx.fillStyle = '#1a1410';
  ctx.beginPath();
  ctx.arc(-r * 0.85 - puff * r * 0.35, -r * 0.58, 3 + puff * 4, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.8 - puff * r * 0.28, r * 0.6, 2.5 + puff * 3.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (flashing) {
    ctx.strokeStyle = '#fff4d2';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -r * 0.18);
    ctx.lineTo(r * 0.95, -r * 0.34);
    ctx.moveTo(r * 0.6, r * 0.12);
    ctx.lineTo(r * 1.02, r * 0.22);
    ctx.stroke();
  }
}

function drawArtilleryBody(ctx, e, flashing) {
  var r = e.r;
  var deploy = 1;
  if (e.deployed) deploy = e.siegeTimer > 0 ? clamp(1 - e.siegeTimer / 0.9, 0, 1) : 1;
  else deploy = 0.15;
  var legI;
  ctx.strokeStyle = flashing ? '#ffffff' : '#6a5428';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (legI = 0; legI < 4; legI += 1) {
    var legA = (legI / 4) * TAU + Math.PI / 4;
    var ext = 2 + deploy * (r * 0.55);
    var x0 = Math.cos(legA) * (r * 0.62);
    var y0 = Math.sin(legA) * (r * 0.62);
    var x1 = Math.cos(legA) * (r * 0.7 + ext);
    var y1 = Math.sin(legA) * (r * 0.7 + ext);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.fillStyle = flashing ? '#ffffff' : '#3a3018';
    ctx.beginPath();
    ctx.arc(x1, y1, 2.4, 0, TAU);
    ctx.fill();
  }
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
  if (!flashing) {
    ctx.fillStyle = '#a8843a';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(r * 0.5, -r * 0.86);
    ctx.lineTo(0, -r * 0.2);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  for (hi = 0; hi < 6; hi += 1) {
    var hb = (hi / 6) * TAU;
    if (hi === 0) ctx.moveTo(Math.cos(hb) * r, Math.sin(hb) * r);
    else ctx.lineTo(Math.cos(hb) * r, Math.sin(hb) * r);
  }
  ctx.closePath();
  outline(ctx, 1.6);
  ctx.fillStyle = flashing ? '#ffffff' : '#2a2014';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.48, 0, TAU);
  ctx.fill();
  var kick = 0;
  if ((e.cooldown || 0) > 3.45) kick = ((e.cooldown - 3.45) / 0.35) * 6;
  var heat = 0;
  if (e.deployed && e.siegeTimer > 0 && e.siegeTimer < 0.4) heat = 1 - e.siegeTimer / 0.4;
  else if (e.deployed && !(e.siegeTimer > 0) && e.cooldown > 0 && e.cooldown < 0.9) heat = 1 - e.cooldown / 0.9;
  ctx.fillStyle = flashing ? '#ffffff' : '#1c1610';
  ctx.fillRect(r * 0.15 - kick, -3.4, r * 1.15, 6.8);
  ctx.fillStyle = flashing ? '#ffffff' : heatPaint(heat);
  ctx.fillRect(r * 1.15 - kick, -4, 5, 8);
  if (heat > 0.2 && !keyGlowsOnly() && !flashing) {
    drawGlow(ctx, r * 1.3 - kick, 0, 8 + heat * 8, PALETTE.emissive.hostile, 0.35 + heat * 0.4);
  }
  var fx = e.fx;
  if (fx && fx.muzzle > 0) {
    var mk = 1 - fx.muzzle / 0.32;
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - mk);
    ctx.fillStyle = '#6a6258';
    ctx.beginPath();
    ctx.arc(r * 1.4 - kick + mk * 10, -2, 3 + mk * 4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 1.25 - kick + mk * 8, 3, 2.4 + mk * 3, 0, TAU);
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
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 10, -1.13, 1.13);
    ctx.stroke();
  } else {
    ctx.strokeStyle = PALETTE.emissive.tech;
    ctx.lineWidth = 1.3;
    for (i = -2; i <= 2; i += 1) {
      var a = i * 0.42;
      hexAt(ctx, Math.cos(a) * (e.r + 10), Math.sin(a) * (e.r + 10), 4.2);
      ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 10, -1.13, 1.13);
    ctx.stroke();
    if (!keyGlowsOnly()) drawGlow(ctx, e.r + 8, 0, 14, PALETTE.emissive.tech, 0.4);
  }
  ctx.restore();
  if (fx && fx.rippleT > 0) {
    var k = 1 - fx.rippleT / 0.28;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 8 + k * 16, (fx.rippleAng || 0) - faceOf(e) - 0.55, (fx.rippleAng || 0) - faceOf(e) + 0.55);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEliteBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var spin = reduced ? 0.4 : (rt.state.waveTime || 0) * 0.9;
  var i;
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = PALETTE.emissive.gold;
  ctx.globalAlpha = reduced ? 0.8 : 0.55;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, r + 9, 0, TAU);
  ctx.stroke();
  for (i = 0; i < 6; i += 1) {
    var ta = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ta) * (r + 6), Math.sin(ta) * (r + 6));
    ctx.lineTo(Math.cos(ta) * (r + 12), Math.sin(ta) * (r + 12));
    ctx.stroke();
  }
  ctx.restore();
  if (e.affix === 'blink') {
    var jig = reduced ? 1.5 : (e.blinkTelegraph ? 3.4 : 1.6);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ff4040';
    ctx.lineWidth = 1.4;
    strokeStar(ctx, r, jig, 0);
    ctx.strokeStyle = '#40e0ff';
    strokeStar(ctx, r, -jig, 1);
    ctx.restore();
  }
  ctx.beginPath();
  for (i = 0; i < 8; i += 1) {
    var sa = (i / 8) * TAU;
    var sr = i % 2 ? r * 0.72 : r;
    if (i === 0) ctx.moveTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
    else ctx.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
  }
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : '#1e3834';
  ctx.fill();
  if (!flashing) {
    ctx.fillStyle = '#3f756c';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(0, -r * 0.42);
    ctx.lineTo(-r * 0.2, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  for (i = 0; i < 8; i += 1) {
    var sb = (i / 8) * TAU;
    var srb = i % 2 ? r * 0.72 : r;
    if (i === 0) ctx.moveTo(Math.cos(sb) * srb, Math.sin(sb) * srb);
    else ctx.lineTo(Math.cos(sb) * srb, Math.sin(sb) * srb);
  }
  ctx.closePath();
  outline(ctx, 1.7);
  ctx.save();
  ctx.strokeStyle = flashing ? '#ffffff' : PALETTE.emissive.gold;
  ctx.lineWidth = 1.1;
  ctx.globalAlpha *= 0.85;
  for (i = 0; i < 4; i += 1) {
    var va = (i / 4) * TAU + spin * 0.25;
    ctx.beginPath();
    ctx.moveTo(Math.cos(va) * r * 0.35, Math.sin(va) * r * 0.35);
    ctx.lineTo(Math.cos(va) * r * 0.92, Math.sin(va) * r * 0.92);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = flashing ? '#ffffff' : '#142826';
  ctx.beginPath();
  ctx.arc(2, 0, r * 0.36, 0, TAU);
  ctx.fill();
  ctx.fillStyle = flashing ? '#ffffff' : '#f5d17b';
  ctx.fillRect(r * 0.22, -2.2, 6, 4.4);
  if (e.affix === 'mirror') drawMirrorShield(ctx, e, e.fx);
  if (e.affix === 'vortex') {
    ctx.save();
    ctx.rotate(reduced ? 0.6 : (rt.state.waveTime || 0) * 1.5);
    ctx.strokeStyle = PALETTE.emissive.void;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(2, 0, r + 13, r + 6, 0, 0, TAU);
    ctx.stroke();
    ctx.rotate(1.1);
    ctx.beginPath();
    ctx.ellipse(-2, 1, r + 16, r + 5, 0.35, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  if (e.affix === 'blink' && (e.blinkTelegraph || (e.blinkTimer !== undefined && e.blinkTimer <= 0.3 && e.blinkTimer > 0))) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 12, 0, TAU);
    ctx.stroke();
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

function drawTitanGun(ctx, y, alive, enraged, flashing, hp, maxHp, wreckSpark) {
  if (alive) {
    ctx.fillStyle = flashing ? '#ffffff' : '#241c14';
    ctx.fillRect(-6, y - 4, 46, 8);
    ctx.fillStyle = flashing ? '#ffffff' : '#4a3d31';
    ctx.fillRect(-2, y - 3, 40, 3);
    ctx.fillStyle = flashing ? '#ffffff' : (enraged ? PALETTE.emissive.hostile : PALETTE.emissive.tech);
    ctx.fillRect(18, y - 3, 5, 6);
    ctx.fillRect(30, y - 3, 5, 6);
    if (maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(-4, y < 0 ? y - 8 : y + 6, 30, 2.5);
      ctx.fillStyle = enraged ? '#ff6644' : (y < 0 ? PALETTE.emissive.tech : PALETTE.emissive.gold);
      ctx.fillRect(-4, y < 0 ? y - 8 : y + 6, 30 * clamp((hp || 0) / maxHp, 0, 1), 2.5);
    }
    return;
  }
  ctx.fillStyle = '#14110e';
  ctx.fillRect(-8, y - 3, 22, 6);
  ctx.strokeStyle = '#4a3a2e';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(12, y - 4);
  ctx.lineTo(20, y);
  ctx.lineTo(14, y + 4);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#1a1410';
  ctx.beginPath();
  ctx.arc(6, y, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (Math.sin(wreckSpark) > 0.2) {
    ctx.strokeStyle = Math.sin(wreckSpark * 2) > 0 ? '#ffd36b' : '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(18, y - 5);
    ctx.lineTo(16, y + 2);
    ctx.stroke();
  }
}

function drawTitanBody(ctx, e, flashing, reduced) {
  var r = e.r;
  var enraged = Boolean(e.phase2Triggered);
  var spin = reduced ? 0.3 : (rt.state.waveTime || 0) * 1.6;
  var i;
  drawTitanGun(ctx, -16, !e.leftCannonDestroyed, enraged, flashing, e.leftCannonHp, e.leftCannonMaxHp, (rt.renderTime || 0) * 9);
  drawTitanGun(ctx, 16, !e.rightPodDestroyed, enraged, flashing, e.rightPodHp, e.rightPodMaxHp, (rt.renderTime || 0) * 9 + 2);
  ctx.beginPath();
  for (i = 0; i < 8; i += 1) {
    var oa = (i / 8) * TAU;
    if (i === 0) ctx.moveTo(Math.cos(oa) * r, Math.sin(oa) * r);
    else ctx.lineTo(Math.cos(oa) * r, Math.sin(oa) * r);
  }
  ctx.closePath();
  ctx.fillStyle = flashing ? '#ffffff' : (enraged ? '#4a241c' : '#3a3124');
  ctx.fill();
  outline(ctx, 2);
  if (!flashing) {
    for (i = 0; i < 8; i += 1) {
      var a0 = (i / 8) * TAU;
      var a1 = ((i + 1) / 8) * TAU;
      var mid = (a0 + a1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r * 0.9, Math.sin(a0) * r * 0.9);
      ctx.lineTo(Math.cos(a1) * r * 0.9, Math.sin(a1) * r * 0.9);
      ctx.lineTo(Math.cos(mid) * r * 0.52, Math.sin(mid) * r * 0.52);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#6a5438' : '#2a2218';
      ctx.fill();
      if (enraged) {
        ctx.strokeStyle = 'rgba(255, 70, 40, 0.9)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }
  }
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = flashing ? '#ffffff' : (enraged ? PALETTE.emissive.hostile : PALETTE.emissive.gold);
  ctx.lineWidth = 2;
  for (i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, (i / 3) * TAU, (i / 3) * TAU + 0.7);
    ctx.stroke();
  }
  ctx.restore();
  var coreR = Math.max(5, r * 0.22);
  if (!keyGlowsOnly() && !flashing) {
    drawGlow(ctx, 0, 0, coreR + (enraged ? 18 : 12), enraged ? PALETTE.emissive.hostile : PALETTE.emissive.gold, 0.75);
  }
  ctx.fillStyle = flashing ? '#ffffff' : (enraged ? '#ff4d2e' : '#f5a623');
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = flashing ? '#ffffff' : '#fff4bd';
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.45, 0, TAU);
  ctx.fill();
  if (enraged && !flashing) {
    var puff = reduced ? 0.3 : ((rt.renderTime || 0) * 1.2) % 1;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#1a100e';
    ctx.beginPath();
    ctx.arc(-r * 0.2 - puff * 8, -r * 0.15, 5 + puff * 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawCommandAntenna(ctx, e, reduced) {
  var pulse = reduced ? 1 : (0.7 + 0.3 * Math.sin((rt.state.waveTime || 0) * 6));
  var tipY = e.y - e.r - 11;
  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - e.r * 0.35);
  ctx.lineTo(e.x, tipY);
  ctx.stroke();
  if (!keyGlowsOnly()) drawGlow(ctx, e.x, tipY, 8, PALETTE.emissive.gold, 0.35);
  ctx.fillStyle = '#ffd36b';
  ctx.beginPath();
  ctx.arc(e.x, tipY, 2.2 + pulse * 1.2, 0, TAU);
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
  if (e.kind === 'elite' && e.affix === 'blink') {
    drawPixelGhost(ctx, fx.g0x, fx.g0y, fx.g0t);
    drawPixelGhost(ctx, fx.g1x, fx.g1y, fx.g1t);
  }
  var pose = spawnPose(e, e.kind === 'titan' ? 1 : 0.35);
  var lean = 0;
  if (!reduced) {
    var spd = Math.hypot(e.vx || 0, e.vy || 0);
    lean = Math.min(2.2, spd / 90);
  }
  ctx.save();
  ctx.translate(e.x, e.y);
  if (pose.dust > 0) drawDustRing(ctx, e.r * (e.kind === 'titan' || e.kind === 'brute' ? 1.5 : 1), pose.dust);
  ctx.rotate(faceOf(e));
  ctx.translate(lean, 0);
  ctx.globalAlpha *= pose.alpha;
  ctx.scale(pose.scale, pose.scale);
  if (e.kind === 'elite') drawEliteBody(ctx, e, flashing, reduced);
  else if (e.kind === 'brute') drawBruteBody(ctx, e, flashing, reduced);
  else if (e.kind === 'rusher') drawRusherBody(ctx, e, flashing, reduced);
  else if (e.kind === 'artillery') drawArtilleryBody(ctx, e, flashing);
  else if (e.kind === 'titan') drawTitanBody(ctx, e, flashing, reduced);
  else drawCrawlerBody(ctx, e, flashing, reduced);
  ctx.restore();
  if (e.kind === 'elite' && e.affix === 'command') drawCommandAntenna(ctx, e, reduced);
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
  g.fillStyle = 'rgba(12, 10, 8, 0.86)';
  g.fillRect(0, 1, w, 13);
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.strokeRect(0.5, 1.5, w - 1, 12);
  g.fillStyle = color;
  g.fillText(text, w * 0.5, 8);
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
    ctx.fillStyle = 'rgba(12, 10, 8, 0.86)';
    ctx.fillRect(x - known * 0.5, y - 7, known, 13);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - known * 0.5 + 0.5, y - 6.5, known - 1, 12);
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
      var col = e.affix === 'mirror' ? PALETTE.emissive.tech :
        e.affix === 'vortex' ? PALETTE.emissive.void :
        e.affix === 'command' ? '#f59e0b' :
        e.affix === 'blink' ? '#75d1b0' : '#ffffff';
      if (tag) drawTag(ctx, e.x, y, tag, col);
    }
    if (e.kind === 'titan' && (e.leftCannonDestroyed || e.rightPodDestroyed)) {
      var titanTag = (e.leftCannonDestroyed ? '[L: OFF]' : '') +
        (e.leftCannonDestroyed && e.rightPodDestroyed ? ' ' : '') +
        (e.rightPodDestroyed ? '[R: OFF]' : '');
      drawTag(ctx, e.x, y, titanTag, PALETTE.emissive.hostile);
    }
  }
  ctx.restore();
}

export function drawRusherTelegraphs(ctx) {
  if (!ctx || !rt.state || !rt.state.enemies) return;
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
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = 'rgba(255, 106, 61, 0.28)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.setLineDash(DASH_6);
    ctx.strokeStyle = 'rgba(237, 104, 66, ' + (0.55 + chargeRatio * 0.4) + ')';
    ctx.lineWidth = 2.25;
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.fillStyle = 'rgba(255, 210, 170, ' + (0.45 + chargeRatio * 0.45) + ')';
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
    e.kind === 'titan' ? '☠' : '●';
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
