import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { PALETTE } from './palette.js';
import { drawGlow } from './sprites.js';

/**
 * World-edge presentation. The camera stays locked on the player, so near the
 * map edge the view shows space past the world. That space is painted as a dark
 * void with a hazard strip on the rim and an energy barrier on the edge itself;
 * the barrier flares where the player approaches or presses against it.
 */

var REACH = 200; // how far inside the world any boundary visual can reach
var VOID_PAD = 64;
var STRIP = 14;
var HATCH = 28;
var FALLOFF_BANDS = 6;
var FALLOFF_STEP = 20;
var PROX_RANGE = 240;

var VOID_COLOR = '#050407';
var HATCH_COLOR = 'rgba(237, 104, 66, 0.09)';
var STRIP_DARK = '#0b0906';
var STRIP_STRIPE = '#c9952f';
var EDGE_COLOR = PALETTE.hud.rust;
var EDGE_HOT = '#ffb36b';

// Eased per-edge flare (left, right, top, bottom), render-side only.
var flare = [0, 0, 0, 0];
var flareOwner = null;

function worldSize() {
  return {
    w: (rt.state && rt.state.width) || 3520,
    h: (rt.state && rt.state.height) || 2640
  };
}

function edgeInView(x0, y0, w, h, W, H) {
  return x0 < REACH || y0 < REACH || x0 + w > W - REACH || y0 + h > H - REACH;
}

function voidPath(ctx, x0, y0, w, h, W, H) {
  ctx.beginPath();
  ctx.rect(x0 - VOID_PAD, y0 - VOID_PAD, w + VOID_PAD * 2, h + VOID_PAD * 2);
  ctx.rect(0, 0, W, H);
}

function drawHatch(ctx, x0, y0, w, h) {
  var top = y0 - VOID_PAD;
  var bottom = y0 + h + VOID_PAD;
  var start = Math.floor((x0 - VOID_PAD + top) / HATCH) * HATCH;
  var end = x0 + w + VOID_PAD + bottom;
  ctx.strokeStyle = HATCH_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (var c = start; c <= end; c += HATCH) {
    ctx.moveTo(c - top, top);
    ctx.lineTo(c - bottom, bottom);
  }
  ctx.stroke();
}

// Inside-the-world darkening toward the edge so the rim reads as a drop-off.
function drawFalloff(ctx, x0, y0, w, h, W, H) {
  var depth = FALLOFF_BANDS * FALLOFF_STEP;
  ctx.fillStyle = '#000';
  for (var i = 0; i < FALLOFF_BANDS; i += 1) {
    ctx.globalAlpha = 0.09 * (1 - i / FALLOFF_BANDS);
    var o = i * FALLOFF_STEP;
    if (x0 < depth) ctx.fillRect(0, o, depth - o, H - o * 2);
    if (x0 + w > W - depth) ctx.fillRect(W - depth + o, o, depth - o, H - o * 2);
    if (y0 < depth) ctx.fillRect(o, 0, W - o * 2, depth - o);
    if (y0 + h > H - depth) ctx.fillRect(o, H - depth + o, W - o * 2, depth - o);
  }
  ctx.globalAlpha = 1;
}

function stripes(ctx, bx, by, bw, bh, phase) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();
  ctx.fillStyle = STRIP_DARK;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = STRIP_STRIPE;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  var span = bw + bh;
  var start = Math.floor((bx + by) / 24) * 24 - 24 + phase;
  for (var c = start; c < bx + by + span + 24; c += 24) {
    // Parallelogram along x + y = c, 10px wide.
    ctx.moveTo(c - by, by);
    ctx.lineTo(c + 10 - by, by);
    ctx.lineTo(c + 10 - (by + bh), by + bh);
    ctx.lineTo(c - (by + bh), by + bh);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function drawHazardStrip(ctx, x0, y0, w, h, W, H, phase) {
  // Only the strips that intersect the view are painted.
  if (x0 < 0) stripes(ctx, -STRIP, Math.max(-STRIP, y0 - STRIP), STRIP, Math.min(H + STRIP, y0 + h + STRIP) - Math.max(-STRIP, y0 - STRIP), phase);
  if (x0 + w > W) stripes(ctx, W, Math.max(-STRIP, y0 - STRIP), STRIP, Math.min(H + STRIP, y0 + h + STRIP) - Math.max(-STRIP, y0 - STRIP), phase);
  if (y0 < 0) stripes(ctx, Math.max(0, x0 - STRIP), -STRIP, Math.min(W, x0 + w + STRIP) - Math.max(0, x0 - STRIP), STRIP, phase);
  if (y0 + h > H) stripes(ctx, Math.max(0, x0 - STRIP), H, Math.min(W, x0 + w + STRIP) - Math.max(0, x0 - STRIP), STRIP, phase);
}

export function drawWorldBoundary(ctx, x0, y0, viewW, viewH) {
  if (!ctx || !rt.state) return;
  var size = worldSize();
  var W = size.w;
  var H = size.h;
  if (!edgeInView(x0, y0, viewW, viewH, W, H)) return;
  var reduced = isReducedMotion();
  var time = reduced ? 0 : (rt.renderTime || 0);

  ctx.save();
  drawFalloff(ctx, x0, y0, viewW, viewH, W, H);

  if (x0 < 0 || y0 < 0 || x0 + viewW > W || y0 + viewH > H) {
    voidPath(ctx, x0, y0, viewW, viewH, W, H);
    ctx.fillStyle = VOID_COLOR;
    ctx.fill('evenodd');
    if (!isHighContrast()) {
      ctx.save();
      voidPath(ctx, x0, y0, viewW, viewH, W, H);
      ctx.clip('evenodd');
      drawHatch(ctx, x0, y0, viewW, viewH);
      ctx.restore();
    }
    drawHazardStrip(ctx, x0, y0, viewW, viewH, W, H, (time * 12) % 24);
  }
  ctx.restore();
}

function stepFlare(p, W, H) {
  if (flareOwner !== rt.state) {
    flareOwner = rt.state;
    flare[0] = flare[1] = flare[2] = flare[3] = 0;
  }
  var r = p.r || 15;
  var dist0 = p.x - r;
  var dist1 = W - r - p.x;
  var dist2 = p.y - r;
  var dist3 = H - r - p.y;
  var dt = rt.renderDt || 0.016;
  var k = 1 - Math.exp(-10 * dt);
  for (var i = 0; i < 4; i += 1) {
    var d = i === 0 ? dist0 : i === 1 ? dist1 : i === 2 ? dist2 : dist3;
    var target = clamp(1 - d / PROX_RANGE, 0, 1);
    target *= target;
    // Pressed flush against the wall: full flare.
    if (d <= 1) target = 1;
    flare[i] += (target - flare[i]) * k;
  }
}

function edgeFlare(ctx, ex, ey, horizontal, amount, pulse) {
  if (amount < 0.02) return;
  var len = 120 + amount * 200;
  ctx.globalAlpha = amount * (0.7 + 0.3 * pulse);
  ctx.strokeStyle = EDGE_HOT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(ex - len * 0.5, ey);
    ctx.lineTo(ex + len * 0.5, ey);
  } else {
    ctx.moveTo(ex, ey - len * 0.5);
    ctx.lineTo(ex, ey + len * 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawGlow(ctx, ex, ey, 50 + amount * 80, EDGE_COLOR, amount * (0.45 + 0.25 * pulse));
  var side = len * 0.32;
  if (horizontal) {
    drawGlow(ctx, ex - side, ey, 34 + amount * 30, EDGE_COLOR, amount * 0.3);
    drawGlow(ctx, ex + side, ey, 34 + amount * 30, EDGE_COLOR, amount * 0.3);
  } else {
    drawGlow(ctx, ex, ey - side, 34 + amount * 30, EDGE_COLOR, amount * 0.3);
    drawGlow(ctx, ex, ey + side, 34 + amount * 30, EDGE_COLOR, amount * 0.3);
  }
}

// Additive pass: barrier line on the world edge plus the player-proximity flare.
export function drawWorldBoundaryGlow(ctx, x0, y0, viewW, viewH) {
  if (!ctx || !rt.state) return;
  var size = worldSize();
  var W = size.w;
  var H = size.h;
  var p = rt.state.player;
  if (p) stepFlare(p, W, H);
  if (!edgeInView(x0, y0, viewW, viewH, W, H)) return;
  var reduced = isReducedMotion();
  var contrast = isHighContrast();
  var time = reduced ? 0 : (rt.renderTime || 0);
  var pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 6);

  ctx.save();
  ctx.strokeStyle = EDGE_COLOR;
  ctx.globalAlpha = contrast ? 0.35 : 0.14;
  ctx.lineWidth = 12;
  ctx.strokeRect(0, 0, W, H);
  ctx.globalAlpha = contrast ? 1 : 0.55 + 0.15 * pulse;
  ctx.lineWidth = contrast ? 3 : 2;
  ctx.strokeRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  if (p) {
    var px = clamp(p.x, 0, W);
    var py = clamp(p.y, 0, H);
    edgeFlare(ctx, 0, py, false, flare[0], pulse);
    edgeFlare(ctx, W, py, false, flare[1], pulse);
    edgeFlare(ctx, px, 0, true, flare[2], pulse);
    edgeFlare(ctx, px, H, true, flare[3], pulse);
  }
  ctx.restore();
}
