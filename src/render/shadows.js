import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { PALETTE } from './palette.js';
import { markBorn } from './entity-style.js';

var SHADOW_CORE = 'rgba(2, 3, 5, 0.94)';
var SHADOW_PENUMBRA = 'rgba(4, 6, 9, 0.45)';
var SHADOW_DEEP = 'rgba(2, 3, 5, 0.96)';

var ROT = 0.46;
var ROT_COS = Math.cos(ROT);
var ROT_SIN = Math.sin(ROT);

// 0-GC Preallocated typed arrays for contact shadow batching
var MAX_SHADOWS = 512;
var SHADOW_X = new Float32Array(MAX_SHADOWS);
var SHADOW_Y = new Float32Array(MAX_SHADOWS);
var SHADOW_R = new Float32Array(MAX_SHADOWS);
var SHADOW_STRETCH = new Float32Array(MAX_SHADOWS);
var SHADOW_LEAD = new Float32Array(MAX_SHADOWS);
var SHADOW_ALT = new Float32Array(MAX_SHADOWS);
var shadowCount = 0;

function pushShadow(x, y, r, stretch, lead, alt) {
  if (shadowCount >= MAX_SHADOWS || !(r > 0.5)) return;
  SHADOW_X[shadowCount] = x;
  SHADOW_Y[shadowCount] = y;
  SHADOW_R[shadowCount] = r;
  SHADOW_STRETCH[shadowCount] = stretch || 1;
  SHADOW_LEAD[shadowCount] = lead || 0;
  SHADOW_ALT[shadowCount] = alt > 0 ? alt : 0;
  shadowCount += 1;
}

export function contact(ctx, x, y, radius, deep, stretch, lead, altitude) {
  if (!(radius > 0.5)) return;
  var alt = altitude || 0;
  if (alt < 0) alt = 0;
  var s = stretch || 1;

  // Tier 2 (Penumbra): ~135% radius with elevation spread
  var penScale = 1 + alt * 0.45;
  var rxPen = radius * 1.35 * (0.78 + 0.22 * s) * penScale;
  var ryPen = radius * 1.35 * (0.34 + 0.05 * s) * penScale;
  var oxPen = radius * 0.26 * s;
  var oyPen = radius * 0.34 * s + (lead || 0) + alt * 14;

  ctx.fillStyle = SHADOW_PENUMBRA;
  ctx.beginPath();
  ctx.ellipse(x + oxPen, y + oyPen, Math.max(1, rxPen), Math.max(0.6, ryPen), ROT, 0, TAU);
  ctx.fill();

  // Tier 1 (Core AO): ~70% radius hard contact line
  if (alt < 0.85) {
    var shrink = 1 - alt * 0.4;
    var rxCore = radius * 0.70 * (0.78 + 0.22 * s) * shrink;
    var ryCore = radius * 0.70 * (0.34 + 0.05 * s) * shrink;
    var oxCore = radius * 0.18 * s;
    var oyCore = radius * 0.24 * s + (lead ? lead * 0.7 : 0);

    ctx.fillStyle = deep ? SHADOW_DEEP : (PALETTE.shadow || SHADOW_CORE);
    ctx.beginPath();
    ctx.ellipse(x + oxCore, y + oyCore, Math.max(0.8, rxCore), Math.max(0.5, ryCore), ROT, 0, TAU);
    ctx.fill();
  }
}

export function drawContactShadows(ctx) {
  if (!ctx || !rt.state) return;
  var state = rt.state;
  var i;

  shadowCount = 0;

  var p = state.player;
  if (p) {
    var dash = (p.dashPulse || 0) > 0;
    pushShadow(p.x, p.y, p.r * 1.05, dash ? 1.5 : 1.2, 3, p.altitude || 0);
  }

  var sand = state.sandMarks;
  if (sand) {
    for (i = 0; i < sand.length; i += 1) {
      var mark = sand[i];
      if (mark) pushShadow(mark.x, mark.y, mark.r || 8, 1.4, 0, 0);
    }
  }

  var enemies = state.enemies;
  var titanAge = -1;
  var titanE = null;
  if (enemies) {
    var reduced = isReducedMotion();
    var rTime = rt.renderTime || 0;
    for (i = 0; i < enemies.length; i += 1) {
      var e = enemies[i];
      if (!e) continue;
      var alt = e.altitude || e.z || 0;
      if (e.kind === 'burrower' && e.burrowed) {
        pushShadow(e.x, e.y, e.r * 0.55, 1.6, 0, 0);
      } else if (e.kind === 'titan' || e.kind === 'dreadnought') {
        var fx = markBorn(e);
        var age = rTime - fx.born;
        var lead = reduced ? 0 : Math.max(0, 1 - age) * 110;
        pushShadow(e.x, e.y, e.r * 1.22, 1.55, lead, 0);
        if (!reduced && age >= 0.9 && age <= 1.38) {
          titanAge = age;
          titanE = e;
        }
      } else if (e.kind === 'sovereign') {
        pushShadow(e.x, e.y, e.r * 0.85, 1.2, 4, 0.45);
      } else if (e.kind === 'stormTower') {
        pushShadow(e.x, e.y, e.r * 0.9, 2.1, 0, 0);
      } else if (e.kind === 'brute' || e.kind === 'warden') {
        pushShadow(e.x, e.y, e.r * 1.08, e.kind === 'brute' ? 1.32 : 1.15, 0, alt);
      } else if (e.kind === 'elite') {
        pushShadow(e.x, e.y, e.r * 1.05, 1.12, 0, alt);
      } else {
        pushShadow(e.x, e.y, e.r, 1, 0, alt);
      }
    }
  }

  var cores = state.volatileCores;
  if (cores) {
    for (i = 0; i < cores.length; i += 1) {
      var c = cores[i];
      if (c) pushShadow(c.x, c.y, c.r * 1.15, 1.05, 0, 0);
    }
  }

  var barrels = state.barrels;
  if (barrels) {
    for (i = 0; i < barrels.length; i += 1) {
      var b = barrels[i];
      if (!b) continue;
      var flying = b.state === 'flying';
      var bAlt = flying ? Math.min(1, Math.max(0.35, (b.flyingTimer != null ? b.flyingTimer / 1.2 : 0.6))) : 0;
      pushShadow(b.x, b.y, b.r, flying ? 1.4 : 1.05, 0, bAlt);
    }
  }

  var spires = state.spires;
  if (spires) {
    for (i = 0; i < spires.length; i += 1) {
      var s = spires[i];
      if (s) pushShadow(s.x, s.y, s.r * 0.95, 2.35, 0, 0);
    }
  }

  var tacticals = state.tacticalEntities;
  if (tacticals) {
    for (i = 0; i < tacticals.length; i += 1) {
      var te = tacticals[i];
      if (te) pushShadow(te.x, te.y, (te.r || 14) * 0.9, 1.1, 0, te.altitude || 0);
    }
  }

  if (shadowCount === 0) return;

  // Pass 1: Penumbra Soft Shadow - merged single global Path with 1 ctx.fill()
  ctx.fillStyle = SHADOW_PENUMBRA;
  ctx.beginPath();
  for (i = 0; i < shadowCount; i += 1) {
    var pAlt = SHADOW_ALT[i];
    var pS = SHADOW_STRETCH[i];
    var pR = SHADOW_R[i];
    var penScale = 1 + pAlt * 0.45;
    var rxPen = Math.max(1, pR * 1.35 * (0.78 + 0.22 * pS) * penScale);
    var ryPen = Math.max(0.6, pR * 1.35 * (0.34 + 0.05 * pS) * penScale);
    var cxPen = SHADOW_X[i] + pR * 0.26 * pS;
    var cyPen = SHADOW_Y[i] + pR * 0.34 * pS + SHADOW_LEAD[i] + pAlt * 14;

    ctx.moveTo(cxPen + rxPen * ROT_COS, cyPen + rxPen * ROT_SIN);
    ctx.ellipse(cxPen, cyPen, rxPen, ryPen, ROT, 0, TAU);
  }
  ctx.fill();

  // Pass 2: Core AO Hard Contact - merged single global Path with 1 ctx.fill()
  ctx.fillStyle = PALETTE.shadow || SHADOW_CORE;
  ctx.beginPath();
  for (i = 0; i < shadowCount; i += 1) {
    var cAlt = SHADOW_ALT[i];
    if (cAlt >= 0.85) continue;
    var cS = SHADOW_STRETCH[i];
    var cR = SHADOW_R[i];
    var shrink = 1 - cAlt * 0.4;
    var rxCore = Math.max(0.8, cR * 0.70 * (0.78 + 0.22 * cS) * shrink);
    var ryCore = Math.max(0.5, cR * 0.70 * (0.34 + 0.05 * cS) * shrink);
    var cxCore = SHADOW_X[i] + cR * 0.18 * cS;
    var cyCore = SHADOW_Y[i] + cR * 0.24 * cS + (SHADOW_LEAD[i] ? SHADOW_LEAD[i] * 0.7 : 0);

    ctx.moveTo(cxCore + rxCore * ROT_COS, cyCore + rxCore * ROT_SIN);
    ctx.ellipse(cxCore, cyCore, rxCore, ryCore, ROT, 0, TAU);
  }
  ctx.fill();

  // Titan intro spawn visual shockwave (rare, 0.48s window)
  if (titanE && titanAge >= 0) {
    var k = (titanAge - 0.9) / 0.48;
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.strokeStyle = '#d9c7a4';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(titanE.x + titanE.r * 0.4, titanE.y + titanE.r * 0.52 + Math.max(0, (1 - titanAge) * 20), titanE.r * (0.9 + k * 2.1), titanE.r * (0.4 + k * 0.85), ROT, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
