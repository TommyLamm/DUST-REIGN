// Render-only helpers. Scratch state lives on entity.fx; sim must not read it.
import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { PALETTE } from './palette.js';
import { getQuality } from './quality.js';

export function ensureFx(ent) {
  if (!ent.fx) ent.fx = {};
  return ent.fx;
}

export function tickFlash(ent) {
  var fx = ensureFx(ent);
  var hp = ent.hp;
  if (hp == null) return false;
  if (fx.lastHp == null) fx.lastHp = hp;
  if (hp < fx.lastHp) {
    fx.flash = isReducedMotion() ? 0.06 : 0.08;
    fx.hitAmount = fx.lastHp - hp;
  } else {
    fx.hitAmount = 0;
  }
  fx.lastHp = hp;
  if (fx.flash > 0) {
    fx.flash -= rt.renderDt || 0;
    if (fx.flash < 0) fx.flash = 0;
  }
  return fx.flash > 0;
}

export function trackStep(ent) {
  var fx = ensureFx(ent);
  if (fx.px == null || fx.py == null) {
    fx.px = ent.x;
    fx.py = ent.y;
    fx.dx = 0;
    fx.dy = 0;
    fx.moved = 0;
    if (fx.step == null) fx.step = 0;
    return 0;
  }
  var dx = ent.x - fx.px;
  var dy = ent.y - fx.py;
  var moved = Math.hypot(dx, dy);
  fx.px = ent.x;
  fx.py = ent.y;
  fx.dx = dx;
  fx.dy = dy;
  fx.moved = moved;
  fx.step = (fx.step || 0) + moved;
  return moved;
}

export function markBorn(ent) {
  var fx = ensureFx(ent);
  if (fx.born == null) fx.born = rt.renderTime || 0;
  return fx;
}

export function spawnPose(ent, duration) {
  var fx = markBorn(ent);
  if (isReducedMotion()) return { scale: 1, alpha: 1, dust: 0, age: 999 };
  var dur = duration || 0.35;
  var age = (rt.renderTime || 0) - fx.born;
  var t = clamp(age / dur, 0, 1);
  var s = t * t * (3 - 2 * t);
  return {
    scale: 0.4 + 0.6 * s,
    alpha: 0.42 + 0.58 * s,
    dust: t < 1 ? (1 - t) : 0,
    age: age
  };
}

export function drawDustRing(ctx, r, dust) {
  if (!(dust > 0) || !(r > 0)) return;
  var grow = 1 - dust;
  ctx.save();
  ctx.globalAlpha = 0.45 * dust;
  ctx.strokeStyle = '#cbb89a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(r * 0.28, r * 0.42, r * (0.85 + grow * 0.9), r * (0.32 + grow * 0.22), 0.45, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawHpBar(ctx, x, y, w, ratio) {
  if (!(w > 0)) return;
  var left = x - w * 0.5;
  var ticks = w > 48 ? 6 : 4;
  var i;
  ctx.fillStyle = 'rgba(8, 6, 4, 0.9)';
  ctx.fillRect(left - 1, y - 1, w + 2, 6);
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(left, y, w, 4);
  ctx.fillStyle = PALETTE.hud.rust;
  ctx.fillRect(left, y, Math.max(0, w * clamp(ratio, 0, 1)), 4);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  for (i = 1; i < ticks; i += 1) {
    ctx.fillRect(left + (w * i) / ticks, y, 1, 4);
  }
}

export function outline(ctx, width) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0e0c09';
  ctx.lineWidth = isHighContrast() ? Math.max(2.4, (width || 1.5) + 0.9) : (width || 1.5);
  ctx.stroke();
}

var glowStamp = -1;
var glowOnly = false;

export function keyGlowsOnly() {
  var stamp = rt.renderTime || 0;
  if (stamp !== glowStamp) {
    glowStamp = stamp;
    glowOnly = getQuality() === 'low';
  }
  return glowOnly;
}

export function arcDepth() {
  var q = getQuality();
  if (q === 'low') return 1;
  if (q === 'medium') return 2;
  return 3;
}

export function decay(fx, key) {
  if (fx[key] > 0) {
    fx[key] -= rt.renderDt || 0;
    if (fx[key] < 0) fx[key] = 0;
  }
}
