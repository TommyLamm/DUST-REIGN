import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { sectorTint, stormBlend } from './palette.js';
import { getBudget } from './quality.js';
import { getNoiseTile } from './sprites.js';
import { tryScreenFlash } from './fx.js';

var WIND = 35 * Math.PI / 180;
var COS_W = Math.cos(WIND);
var SIN_W = Math.sin(WIND);
var MOTE_CAP = 140;
var motes = new Array(MOTE_CAP);
var moteCount = 0;
var farCount = 0;
var moteW = 0;
var moteH = 0;

var gradeW = 0;
var gradeH = 0;
var gradeCss = '';
var gradeStorm = -1;
var gradeFill = null;
var grainTile = null;
var grainPattern = null;
var boltNext = 0;

var i;
for (i = 0; i < MOTE_CAP; i += 1) {
  motes[i] = { x: 0, y: 0, depth: 0, size: 1, speed: 10, alive: false, seed: i };
}

function hash(n) {
  var x = Math.imul(n | 0, 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

function view() {
  var wave = rt.state ? rt.state.wave || 1 : 1;
  var waveTime = rt.state ? rt.state.waveTime || 0 : 0;
  var storm = stormBlend(waveTime);
  return {
    w: rt.ui.width,
    h: rt.ui.height,
    wave: wave,
    waveTime: waveTime,
    storm: storm,
    tint: sectorTint(wave, waveTime, storm),
    reduced: isReducedMotion(),
    hc: isHighContrast()
  };
}

function styleMote(m, depth) {
  var n = (hash(m.seed * 17 + 3) % 1000) / 1000;
  m.depth = depth;
  if (depth) {
    m.size = 3.1 + n * 3.6;
    m.speed = 16 + n * 24;
  } else {
    m.size = 1.25 + n * 1.35;
    m.speed = 7 + n * 12;
  }
}

function syncMotes(count, w, h) {
  if (count < 0) count = 0;
  if (count > MOTE_CAP) count = MOTE_CAP;
  var nextFar = count ? Math.max(1, Math.round(count * 0.58)) : 0;
  if (nextFar > count) nextFar = count;
  var resize = w !== moteW || h !== moteH;
  var k;
  for (k = 0; k < MOTE_CAP; k += 1) {
    var m = motes[k];
    if (k >= count) {
      m.alive = false;
      continue;
    }
    var depth = k < nextFar ? 0 : 1;
    if (!m.alive || resize) {
      var hx = hash(k * 13 + 5) % 10000;
      var hy = hash(k * 29 + 9) % 10000;
      m.x = (hx / 10000) * w;
      m.y = (hy / 10000) * h;
      m.alive = true;
      styleMote(m, depth);
    } else if (m.depth !== depth) styleMote(m, depth);
  }
  moteCount = count;
  farCount = nextFar;
  moteW = w;
  moteH = h;
}

function stepMotes(w, h, storm, reduced) {
  var dt = rt.renderDt || 0;
  if (dt < 0) dt = 0;
  if (dt > 0.05) dt = 0.05;
  var scale = (reduced ? 0.03 : 1) * (1 + storm * 2.35);
  var k;
  for (k = 0; k < moteCount; k += 1) {
    var m = motes[k];
    if (!m.alive) continue;
    var sp = m.speed * scale * (m.depth ? 1.3 : 0.62);
    m.x += COS_W * sp * dt;
    m.y += SIN_W * sp * dt;
    if (m.x > w + 12) m.x = -12;
    else if (m.x < -12) m.x = w + 12;
    if (m.y > h + 12) m.y = -12;
    else if (m.y < -12) m.y = h + 12;
  }
}

function drawMoteLayer(ctx, depth, storm, hc) {
  ctx.save();
  ctx.fillStyle = storm > 0.35 ? '#e27846' : '#e6d3ad';
  var k;
  for (k = 0; k < moteCount; k += 1) {
    var m = motes[k];
    if (!m.alive || m.depth !== depth) continue;
    var alpha = depth ? 0.28 : 0.55;
    alpha *= 0.72 + storm * 0.28;
    if (hc) alpha *= 0.22;
    if (depth) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * 2.05, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * 0.48, 0, TAU);
      ctx.fill();
    } else {
      var sw = m.size;
      ctx.globalAlpha = alpha;
      ctx.fillRect(m.x - sw * 0.5, m.y - sw * 0.5, sw, sw);
    }
  }
  ctx.restore();
}

function drawFog(ctx, v) {
  if (!(v.storm > 0.01)) return;
  var bands = 4;
  var time = v.reduced ? 0 : (rt.renderTime || 0);
  var diag = Math.hypot(v.w, v.h);
  var i;
  ctx.save();
  for (i = 0; i < bands; i += 1) {
    var shift = v.reduced ? i * 70 : ((time * (36 + i * 16) + i * 90) % (diag + 180)) - 90;
    var alpha = (0.1 + i * 0.022) * v.storm;
    if (v.hc) alpha *= 0.22;
    ctx.save();
    ctx.translate(v.w * 0.5, v.h * 0.5);
    ctx.rotate(WIND);
    ctx.translate(shift * 0.35 - i * 24, (i - 1.5) * v.h * 0.2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = i % 2 ? '#c45a32' : '#7a3824';
    ctx.fillRect(-diag, -26 - i * 8, diag * 2, 54 + i * 16);
    ctx.restore();
  }
  var streaks = v.hc ? 5 : 14;
  var speed = 720;
  var clock = v.reduced ? 0 : v.waveTime;
  var si;
  for (si = 0; si < streaks; si += 1) {
    var lane = (si + 0.5) / streaks;
    var perp = lane * (v.w + v.h) - v.h * 0.35;
    var travel = ((clock * speed + si * 191) % (diag + 240)) - 180;
    var sX = -SIN_W * perp + COS_W * travel + v.w * 0.15;
    var sY = COS_W * perp + SIN_W * travel - v.h * 0.1;
    var sLen = 150 + (si % 4) * 70;
    var eX = sX + COS_W * sLen;
    var eY = sY + SIN_W * sLen;
    var sa = (si % 2 === 0 ? 0.26 : 0.18) * v.storm;
    if (v.hc) sa *= 0.28;
    ctx.globalAlpha = sa;
    ctx.strokeStyle = si % 2 === 0 ? '#ed6842' : '#e0a84e';
    ctx.lineWidth = 2.2 + (si % 3) * 0.85;
    ctx.beginPath();
    ctx.moveTo(sX, sY);
    ctx.lineTo(eX, eY);
    ctx.stroke();
  }
  ctx.restore();
}

function updateBolt(v) {
  if (!(v.storm > 0.72) || v.reduced || v.hc) return;
  var now = rt.renderTime || 0;
  if (now < boltNext) return;
  boltNext = now + 0.48 + (hash((now * 1000) | 0) % 1000) / 1000 * 1.35;
  if ((hash((now * 100) | 0) % 100) < 62) tryScreenFlash('#bad6ff', 0.22, 0.08);
}

function activeName(tint) {
  if (!tint) return 'dusk';
  return tint.t >= 0.5 ? tint.name : tint.from;
}

function ensureGrade(ctx, v) {
  var stormQ = (v.storm * 4) | 0;
  if (gradeFill && gradeW === v.w && gradeH === v.h && gradeCss === v.tint.css && gradeStorm === stormQ) return gradeFill;
  var g = ctx.createLinearGradient(0, 0, 0, v.h);
  var warmR = Math.min(255, v.tint.r + 168);
  var warmG = Math.min(255, v.tint.g + 86);
  var warmB = Math.min(255, v.tint.b + 28);
  var coolR = Math.max(0, v.tint.r - 18);
  var coolG = Math.min(255, v.tint.g + 8);
  var coolB = Math.min(255, v.tint.b + 48);
  g.addColorStop(0, 'rgb(' + warmR + ',' + warmG + ',' + warmB + ')');
  g.addColorStop(1, 'rgb(' + coolR + ',' + coolG + ',' + coolB + ')');
  gradeFill = g;
  gradeW = v.w;
  gradeH = v.h;
  gradeCss = v.tint.css;
  gradeStorm = stormQ;
  return g;
}

function drawGrain(ctx, w, h) {
  var tile = getNoiseTile();
  if (!tile) return;
  if (tile !== grainTile || !grainPattern) {
    grainPattern = ctx.createPattern(tile, 'repeat');
    grainTile = tile;
  }
  if (!grainPattern) return;
  var t = rt.renderTime || 0;
  var ox = Math.floor(t * 173) % 128;
  var oy = Math.floor(t * 97) % 128;
  if (ox < 0) ox += 128;
  if (oy < 0) oy += 128;
  var alpha = 0.04 + ((t * 7) % 1) * 0.02;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  ctx.translate(ox, oy);
  ctx.fillStyle = grainPattern;
  ctx.fillRect(-ox, -oy, w + 128, h + 128);
  ctx.restore();
}

var vignetteKey = '';
var vignetteGrad = null;
var hurtKey = '';
var hurtGrad = null;

function cachedRadial(ctx, slot, w, h, inner, outer, css) {
  var key = (w | 0) + 'x' + (h | 0) + ':' + (inner | 0) + ':' + (outer | 0) + ':' + css;
  if (slot === 0) {
    if (vignetteGrad && vignetteKey === key) return vignetteGrad;
  } else if (hurtGrad && hurtKey === key) return hurtGrad;
  var grd = ctx.createRadialGradient(w * 0.5, h * 0.5, inner, w * 0.5, h * 0.5, outer);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0)');
  grd.addColorStop(1, css);
  if (slot === 0) {
    vignetteKey = key;
    vignetteGrad = grd;
  } else {
    hurtKey = key;
    hurtGrad = grd;
  }
  return grd;
}

function lowBeat(v) {
  var p = rt.state && rt.state.player;
  if (!p || !(p.maxHp > 0) || p.hp / p.maxHp >= 0.35) return 0;
  if (v.reduced) return 0.4;
  var phase = (rt.state.heartbeatTimer || 0) / 0.95;
  if (phase < 0) phase = 0;
  if (phase > 1) phase = 1;
  return phase * phase;
}

function drawVignette(ctx, v, tier) {
  var name = activeName(v.tint);
  var edge = name === 'night' ? 0.5 : name === 'rust' ? 0.38 : 0.26;
  if (tier === 'high') edge *= 0.55;
  else if (tier === 'medium') edge *= 1.28;
  else edge *= 0.9;
  var beat = lowBeat(v);
  edge += beat * 0.3;
  if (edge > 0.74) edge = 0.74;
  var red = beat;
  var er = (8 + red * 196) | 0;
  var eg = (14 * (1 - red) + 8) | 0;
  var eb = (20 * (1 - red)) | 0;
  var inner = Math.min(v.w, v.h) * (tier === 'high' ? 0.46 : 0.3);
  var outer = Math.hypot(v.w, v.h) * 0.64;
  if (!(outer > inner)) outer = inner + 1;
  var qEdge = ((edge * 16) | 0) / 16;
  var css = 'rgba(' + er + ',' + eg + ',' + eb + ',' + qEdge + ')';
  var grd = cachedRadial(ctx, 0, v.w, v.h, inner, outer, css);
  ctx.save();
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, v.w, v.h);
  ctx.restore();
}

function drawHurt(ctx, w, h) {
  var flash = rt.state.hurtFlash || 0;
  if (!(flash > 0)) return;
  var edge = Math.min(0.55, flash * 0.7);
  var inner = Math.min(w, h) * 0.28;
  var outer = Math.hypot(w, h) * 0.55;
  if (!(outer > inner)) outer = inner + 1;
  var qEdge = ((edge * 16) | 0) / 16;
  var grd = cachedRadial(ctx, 1, w, h, inner, outer, 'rgba(223,107,79,' + qEdge + ')');
  ctx.save();
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function drawFarMotes(ctx) {
  if (!ctx || !rt.state || !rt.ui) return;
  var budget = getBudget();
  if (!(budget.motes > 0)) {
    moteCount = 0;
    return;
  }
  var v = view();
  if (!(v.w > 0) || !(v.h > 0)) return;
  syncMotes(budget.motes, v.w, v.h);
  stepMotes(v.w, v.h, v.storm, v.reduced);
  drawMoteLayer(ctx, 0, v.storm, v.hc);
}

export function drawNearAtmosphere(ctx) {
  if (!ctx || !rt.state || !rt.ui) return;
  var v = view();
  if (!(v.w > 0) || !(v.h > 0)) return;
  drawFog(ctx, v);
  if (moteCount > farCount) drawMoteLayer(ctx, 1, v.storm, v.hc);
  updateBolt(v);
}

export function drawScreenPost(ctx) {
  if (!ctx || !rt.state || !rt.ui) return;
  var w = rt.ui.width;
  var h = rt.ui.height;
  if (!(w > 0) || !(h > 0)) return;
  var v = view();
  var budget = getBudget();
  if (!v.hc) {
    var gradeAlpha = 0.34 + v.storm * 0.1;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = gradeAlpha;
    ctx.fillStyle = ensureGrade(ctx, v);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    if (budget.grain && !v.reduced && typeof document !== 'undefined') drawGrain(ctx, w, h);
    drawVignette(ctx, v, budget.tier);
  }
  drawHurt(ctx, w, h);
}
