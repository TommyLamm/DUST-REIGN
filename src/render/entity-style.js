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

var POSE_SCRATCH = { scale: 1, alpha: 1, dust: 0, age: 0 };

export function spawnPose(ent, duration) {
  var fx = markBorn(ent);
  if (isReducedMotion()) {
    POSE_SCRATCH.scale = 1;
    POSE_SCRATCH.alpha = 1;
    POSE_SCRATCH.dust = 0;
    POSE_SCRATCH.age = 999;
    return POSE_SCRATCH;
  }
  var dur = duration || 0.35;
  var age = (rt.renderTime || 0) - fx.born;
  var t = clamp(age / dur, 0, 1);
  var s = t * t * (3 - 2 * t);
  POSE_SCRATCH.scale = 0.4 + 0.6 * s;
  POSE_SCRATCH.alpha = 0.42 + 0.58 * s;
  POSE_SCRATCH.dust = t < 1 ? (1 - t) : 0;
  POSE_SCRATCH.age = age;
  return POSE_SCRATCH;
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

// Specular Rimlight Color Constants (0-GC static strings)
var RIM_DEFAULT = '#d8c8b4';
var RIM_CRAWLER = 'rgba(216, 200, 180, 0.75)';
var RIM_RUSHER = '#ff8c42';
var RIM_BRUTE = '#93c5fd';
var RIM_ELITE_MIRROR = '#38bdf8';
var RIM_ELITE_VORTEX = '#c084fc';
var RIM_ELITE_COMMAND = '#f59e0b';
var RIM_ELITE_BLINK = '#34d399';
var RIM_BOSS_CRIMSON = '#ff3322';
var RIM_BOSS_GOLD = '#ffe880';
var RIM_ACID = '#ccff00';
var RIM_ARTILLERY = '#ff5500';
var HALO_BLACK = '#030204';

export function getSpecularRimColor(kind, options) {
  if (!kind) return RIM_DEFAULT;
  if (kind === 'rusher' || kind === 'arming') return RIM_RUSHER;
  if (kind === 'brute' || kind === 'warden') return RIM_BRUTE;
  if (kind === 'titan' || kind === 'sovereign' || kind === 'dreadnought') return RIM_BOSS_CRIMSON;
  if (kind === 'elite') {
    var affix = options && (typeof options === 'string' ? options : (options.affix || options.affix2));
    if (affix === 'mirror') return RIM_ELITE_MIRROR;
    if (affix === 'vortex') return RIM_ELITE_VORTEX;
    if (affix === 'command') return RIM_ELITE_COMMAND;
    if (affix === 'blink') return RIM_ELITE_BLINK;
    return RIM_ELITE_COMMAND;
  }
  if (kind === 'spitter') return RIM_ACID;
  if (kind === 'artillery') return RIM_ARTILLERY;
  if (kind === 'crawler' || kind === 'scurrier' || kind === 'burrower') return RIM_CRAWLER;
  return RIM_DEFAULT;
}

export function drawDualOutline(ctx, r, kind, options) {
  var outerW = 3.8;
  var rimW = 1.6;
  var rimColor = RIM_DEFAULT;
  var isBoss = false;

  if (typeof kind === 'string' && (kind.charCodeAt(0) === 35 /* # */ || kind.charCodeAt(0) === 114 /* r */)) {
    // Signature: drawDualOutline(ctx, outerW, rimColor, rimW)
    outerW = typeof r === 'number' ? r : 3.8;
    rimColor = kind;
    rimW = typeof options === 'number' ? options : 1.6;
  } else {
    // Signature: drawDualOutline(ctx, r, kind, options)
    if (typeof kind === 'string') {
      rimColor = getSpecularRimColor(kind, options);
      if (kind === 'titan' || kind === 'sovereign' || kind === 'dreadnought') {
        outerW = 4.8;
        rimW = 2.0;
        isBoss = true;
      } else if (typeof r === 'number' && r > 20) {
        outerW = 4.2;
        rimW = 1.8;
      }
    } else if (kind && typeof kind === 'object') {
      var actualKind = kind.kind;
      rimColor = getSpecularRimColor(actualKind, kind);
      if (actualKind === 'titan' || actualKind === 'sovereign' || actualKind === 'dreadnought' || kind.isBoss) {
        outerW = 4.8;
        rimW = 2.0;
        isBoss = true;
      }
    }
    if (options && typeof options === 'object') {
      if (options.outerW != null) outerW = options.outerW;
      if (options.rimW != null) rimW = options.rimW;
      if (options.rimColor != null) rimColor = options.rimColor;
      if (options.isBoss) isBoss = true;
    }
  }

  var hc = isHighContrast();
  var finalOuterW = hc ? Math.max(4.6, outerW + 1.2) : outerW;
  var finalRimW = hc ? Math.max(2.2, rimW + 0.6) : rimW;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 1. Outer Inky Dark Halo (3.6~4.2px, #030204, alpha 1.0)
  ctx.strokeStyle = HALO_BLACK;
  ctx.lineWidth = finalOuterW;
  ctx.stroke();

  // 2. Inner Specular Rimlight (1.4~1.8px)
  if (rimColor) {
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = finalRimW;
    ctx.stroke();
  }

  // 3. Boss specular core accent (Titan / Sovereign / Dreadnought: crimson + core yellow #ffe880)
  if (isBoss) {
    ctx.strokeStyle = RIM_BOSS_GOLD;
    ctx.lineWidth = hc ? 1.4 : 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

export function outline(ctx, width) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = HALO_BLACK;
  ctx.lineWidth = isHighContrast() ? Math.max(2.8, (width || 1.6) + 1.2) : (width || 1.6);
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
