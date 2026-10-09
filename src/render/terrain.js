import { TAU, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { PALETTE, SECTOR_BLEND_SEC, groundPalette, sectorForWave } from './palette.js';
import { getBudget } from './quality.js';
import { getNoiseTile } from './sprites.js';

var WIND = 35 * Math.PI / 180;
var COS_W = Math.cos(WIND);
var SIN_W = Math.sin(WIND);

var slotA = { canvas: null, ctx: null, key: '', sector: '' };
var slotB = { canvas: null, ctx: null, key: '', sector: '' };

function viewSize() {
  var w = rt.ui.width || 1;
  var h = rt.ui.height || 1;
  var dpr = rt.ui.dpr || 1;
  if (dpr < 1) dpr = 1;
  if (dpr > 2) dpr = 2;
  return {
    w: w,
    h: h,
    dpr: dpr,
    pw: Math.max(1, Math.round(w * dpr)),
    ph: Math.max(1, Math.round(h * dpr))
  };
}

function cacheKey(sector, size, detail) {
  return sector + '|' + size.pw + 'x' + size.ph + '|' + (detail ? '1' : '0');
}

function rng(seed) {
  var s = seed >>> 0 || 1;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sectorSeed(sector, w, h) {
  var extra = sector === 'rust' ? 101 : sector === 'night' ? 307 : 17;
  return (7919 + (w | 0) * 13 + (h | 0) * 17 + extra) >>> 0;
}

function paintNoise(ctx, tile, w, h, tileSize, alpha, op, ox, oy) {
  if (!tile || !(tileSize > 0)) return;
  var ts = tileSize;
  var startX = -(((ox % ts) + ts) % ts);
  var startY = -(((oy % ts) + ts) % ts);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = op;
  var y;
  var x;
  for (y = startY; y < h; y += ts) {
    for (x = startX; x < w; x += ts) ctx.drawImage(tile, x, y, ts, ts);
  }
  ctx.restore();
}

function paintDunes(ctx, w, h, colors, detail) {
  var bands = detail ? 8 : 4;
  var reach = Math.hypot(w, h) + 48;
  var steps = detail ? 22 : 10;
  var px = -SIN_W;
  var py = COS_W;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'soft-light';
  var i;
  for (i = 0; i < bands; i += 1) {
    var off = ((i + 0.5) / bands - 0.5) * (w + h);
    var cx = w * 0.5 + px * off;
    var cy = h * 0.5 + py * off;
    ctx.beginPath();
    var s;
    for (s = 0; s <= steps; s += 1) {
      var u = (s / steps - 0.5) * reach;
      var wobble = Math.sin(s * 0.62 + i * 1.7) * (detail ? 16 : 8);
      var x = cx + COS_W * u + px * wobble;
      var y = cy + SIN_W * u + py * wobble;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i % 2 === 0 ? colors.light : colors.dark;
    ctx.globalAlpha = i % 2 === 0 ? 0.62 : 0.4;
    ctx.lineWidth = (detail ? 28 : 16) + (i % 3) * 8;
    ctx.stroke();
  }
  ctx.restore();
}

function strokeCrack(ctx, p, q, colors) {
  var dx = q.x - p.x;
  var dy = q.y - p.y;
  var len = Math.hypot(dx, dy) || 1;
  if (len < 18 || len > 240) return;
  var nx = -dy / len;
  var ny = dx / len;
  ctx.strokeStyle = colors.crack;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
  ctx.strokeStyle = colors.hi;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x + nx * 1.5, p.y + ny * 1.5);
  ctx.lineTo(q.x + nx * 1.5, q.y + ny * 1.5);
  ctx.stroke();
}

function paintCracks(ctx, w, h, colors, detail, sector) {
  var count = detail ? 52 : 18;
  var pts = new Array(count);
  var rand = rng(sectorSeed(sector, w, h));
  var i;
  for (i = 0; i < count; i += 1) pts[i] = { x: rand() * w, y: rand() * h };
  ctx.save();
  ctx.lineCap = 'round';
  var a;
  for (a = 0; a < count; a += 1) {
    var best = -1;
    var bestD = 1e15;
    var second = -1;
    var secondD = 1e15;
    var b;
    for (b = 0; b < count; b += 1) {
      if (a === b) continue;
      var dx = pts[a].x - pts[b].x;
      var dy = pts[a].y - pts[b].y;
      var d = dx * dx + dy * dy;
      if (d < bestD) {
        second = best;
        secondD = bestD;
        best = b;
        bestD = d;
      } else if (d < secondD) {
        second = b;
        secondD = d;
      }
    }
    if (best > a) strokeCrack(ctx, pts[a], pts[best], colors);
    if (detail && second > a && secondD < bestD * 2.15) strokeCrack(ctx, pts[a], pts[second], colors);
  }
  ctx.restore();
}

function paintShadow(ctx, size) {
  ctx.save();
  ctx.translate(size * 0.32, size * 0.38);
  ctx.scale(1, 0.4);
  ctx.fillStyle = 'rgba(6,10,14,0.4)';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.95, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function paintRock(ctx, size, seed, colors, detail) {
  var n = 5 + (seed % 2);
  var i;
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  for (i = 0; i < n; i += 1) {
    var ang = (i / n) * TAU - 0.5;
    var rad = size * (0.62 + ((seed >> (i * 3)) & 7) / 14);
    var x = Math.cos(ang) * rad;
    var y = Math.sin(ang) * rad * 0.78;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  if (!detail) return;
  ctx.fillStyle = colors.light;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.55);
  ctx.lineTo(size * 0.22, -size * 0.12);
  ctx.lineTo(-size * 0.05, size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintScrap(ctx, size, variant, colors, detail) {
  var kind = detail ? variant % 4 : variant % 2;
  if (kind === 1) {
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = Math.max(2, size * 0.34);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.15);
    ctx.lineTo(size * 0.15, -size * 0.05);
    ctx.lineTo(size, -size * 0.4);
    ctx.stroke();
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.stroke();
    return;
  }
  if (kind === 2) {
    ctx.strokeStyle = colors.crack;
    ctx.lineWidth = Math.max(2, size * 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.72, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32, 0, TAU);
    ctx.stroke();
    return;
  }
  if (kind === 3) {
    ctx.strokeStyle = colors.hi;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.1);
    ctx.lineTo(size * 0.2, -size * 0.15);
    ctx.lineTo(size, size * 0.05);
    ctx.moveTo(-size * 0.1, -size * 0.55);
    ctx.lineTo(size * 0.15, size * 0.45);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size, -size * 0.32, size * 2, size * 0.64);
  ctx.fillStyle = colors.light;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(-size * 0.55, -size * 0.5, size * 0.85, size * 0.2);
  ctx.globalAlpha = 1;
  if (!detail) return;
  ctx.fillStyle = colors.crack;
  ctx.fillRect(-size * 0.72, -size * 0.08, 1.6, 1.6);
  ctx.fillRect(size * 0.35, size * 0.02, 1.6, 1.6);
  ctx.fillRect(-size * 0.1, size * 0.08, 1.4, 1.4);
}

function paintProps(ctx, colors, detail) {
  var pieces = rt.terrain || [];
  var i;
  for (i = 0; i < pieces.length; i += 1) {
    var piece = pieces[i];
    if (!piece) continue;
    var size = piece.size || 8;
    var seed = Math.abs((Math.imul((piece.x * 10) | 0, 374761393) ^ Math.imul((piece.y * 10) | 0, 668265263) ^ (i * 127)) | 0);
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rot || 0);
    paintShadow(ctx, size);
    if (piece.kind === 'scrap') paintScrap(ctx, size, seed, colors, detail);
    else paintRock(ctx, size, seed, colors, detail);
    ctx.restore();
  }
}

function paintGrid(ctx, w, h) {
  var grid = 56;
  var cx = w * 0.5;
  var cy = h * 0.5;
  var halfW = w * 0.5 || 1;
  var halfH = h * 0.5 || 1;
  ctx.save();
  ctx.lineWidth = 1;
  var x;
  for (x = grid; x < w; x += grid) {
    var dx = Math.abs(x - cx) / halfW;
    var ax = (1 - dx) * (1 - dx) * 0.16;
    if (ax < 0.02) continue;
    ctx.strokeStyle = 'rgba(210,186,140,' + ax.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  var y;
  for (y = grid; y < h; y += grid) {
    var dy = Math.abs(y - cy) / halfH;
    var ay = (1 - dy) * (1 - dy) * 0.16;
    if (ay < 0.02) continue;
    ctx.strokeStyle = 'rgba(210,186,140,' + ay.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function paintGround(ctx, w, h, sector, detail) {
  var colors = groundPalette(sector);
  var tile = getNoiseTile();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = colors.base;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = sector === 'night' ? 0.72 : sector === 'rust' ? 0.62 : 0.58;
  ctx.fillStyle = colors.light;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  paintNoise(ctx, tile, w, h, detail ? 420 : 520, 0.42, 'overlay', 12, 20);
  paintNoise(ctx, tile, w, h, detail ? 168 : 240, 0.28, 'soft-light', 40, 16);
  if (detail) paintNoise(ctx, tile, w, h, 84, 0.16, 'overlay', 8, 36);
  paintDunes(ctx, w, h, colors, detail);
  var shade = ctx.createLinearGradient(0, 0, w, h);
  shade.addColorStop(0, 'rgba(255,214,160,0.08)');
  shade.addColorStop(0.46, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.24)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  paintCracks(ctx, w, h, colors, detail, sector);
  paintProps(ctx, colors, detail);
  paintGrid(ctx, w, h);
}

function bakeSlot(slot, sector, size, detail, key) {
  if (typeof document === 'undefined') return;
  if (!slot.canvas) {
    slot.canvas = document.createElement('canvas');
    slot.ctx = slot.canvas.getContext('2d', { alpha: false });
  }
  if (!slot.ctx) return;
  if (slot.canvas.width !== size.pw || slot.canvas.height !== size.ph) {
    slot.canvas.width = size.pw;
    slot.canvas.height = size.ph;
  }
  var sx = size.pw / size.w;
  var sy = size.ph / size.h;
  slot.ctx.setTransform(sx, 0, 0, sy, 0, 0);
  paintGround(slot.ctx, size.w, size.h, sector, detail);
  slot.key = key;
  slot.sector = sector;
}

function ensure(sector, size, detail, protect) {
  var key = cacheKey(sector, size, detail);
  if (slotA.key === key && slotA.canvas) return slotA;
  if (detail && slotB.key === key && slotB.canvas) return slotB;
  var slot = slotA;
  if (detail) {
    if (protect === slotA) slot = slotB;
    else if (protect === slotB) slot = slotA;
    else if (slotA.key && !slotB.key) slot = slotB;
  }
  bakeSlot(slot, sector, size, detail, key);
  return slot;
}

function blit(ctx, slot, alpha, w, h) {
  if (!slot || !slot.canvas || !(alpha > 0)) return false;
  if (alpha >= 0.999) {
    ctx.drawImage(slot.canvas, 0, 0, w, h);
    return true;
  }
  var prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(slot.canvas, 0, 0, w, h);
  ctx.globalAlpha = prev;
  return true;
}

function flatFill(ctx, w, h) {
  ctx.fillStyle = PALETTE.ground.base;
  ctx.fillRect(0, 0, w, h);
}

export function drawGround(ctx) {
  if (!ctx || !rt.ui) return;
  var w = rt.ui.width;
  var h = rt.ui.height;
  if (!(w > 0) || !(h > 0)) return;
  if (typeof document === 'undefined') {
    flatFill(ctx, w, h);
    return;
  }
  var size = viewSize();
  var detail = !!getBudget().terrainDetail;
  var wave = (rt.state && rt.state.wave) || 1;
  var waveTime = (rt.state && rt.state.waveTime) || 0;
  var sector = sectorForWave(wave);
  var from = wave > 1 ? sectorForWave(wave - 1) : sector;
  var t = waveTime / SECTOR_BLEND_SEC;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  if (!detail || from === sector) t = 1;

  if (!detail) {
    var low = ensure(sector, size, false, null);
    if (!blit(ctx, low, 1, w, h)) flatFill(ctx, w, h);
    return;
  }

  var fromSlot = ensure(from, size, true, null);
  var toSlot = ensure(sector, size, true, fromSlot);
  if (t >= 1) {
    if (!blit(ctx, toSlot, 1, w, h)) flatFill(ctx, w, h);
  } else {
    if (!blit(ctx, fromSlot, 1, w, h)) flatFill(ctx, w, h);
    blit(ctx, toSlot, t, w, h);
  }
  if (waveTime >= WAVE_LENGTH - 2) {
    var next = sectorForWave(wave + 1);
    if (next !== sector) ensure(next, size, true, toSlot);
  }
}

function decalKind(d) {
  var c = d.color || '#1b1715';
  if (c === '#141210' || d.r <= 8) return 'foot';
  if (c === '#1b1715') return 'scorch';
  if (c.length === 7 && c.charAt(0) === '#') {
    var r = parseInt(c.substr(1, 2), 16);
    var g = parseInt(c.substr(3, 2), 16);
    var b = parseInt(c.substr(5, 2), 16);
    if (b > r + 12 && g + 15 > r) return 'coolant';
  }
  return 'scorch';
}

var VISUAL_DECAL_CAP = 48;
var visualDecals = [];
var visualDecalIndex = 0;
var visualDecalOwner = null;

function syncVisualDecalOwner() {
  if (visualDecalOwner === rt.state) return;
  visualDecalOwner = rt.state;
  visualDecals.length = 0;
  visualDecalIndex = 0;
}

// Render-only marks (footprints, claw scrapes); never written into rt.state.decals.
export function addVisualDecal(x, y, r, maxLife, alpha, color) {
  if (!rt.state) return;
  syncVisualDecalOwner();
  var d = visualDecals[visualDecalIndex];
  if (!d) {
    d = {};
    visualDecals[visualDecalIndex] = d;
  }
  visualDecalIndex = (visualDecalIndex + 1) % VISUAL_DECAL_CAP;
  d.active = true;
  d.x = x;
  d.y = y;
  d.r = r;
  d.maxLife = maxLife;
  d.life = maxLife;
  d.alpha = alpha;
  d.color = color;
  d.rot = ((x * 12.9898 + y * 78.233) % TAU + TAU) % TAU;
}

function ageVisualDecals() {
  var s = rt.state;
  if (s.paused || s.over || (s.hitstop || 0) > 0) return;
  var dt = rt.renderDt || 0;
  for (var i = 0; i < visualDecals.length; i += 1) {
    var d = visualDecals[i];
    if (!d.active) continue;
    d.life -= dt;
    if (d.life <= 0) d.active = false;
  }
}

export function drawDecals(ctx) {
  if (!ctx || !rt.state || !rt.ui) return;
  var w = rt.ui.width;
  var h = rt.ui.height;
  if (rt.state.decals) drawDecalList(ctx, rt.state.decals, w, h);
  syncVisualDecalOwner();
  ageVisualDecals();
  drawDecalList(ctx, visualDecals, w, h);
}

function drawDecalList(ctx, list, w, h) {
  var i;
  for (i = 0; i < list.length; i += 1) {
    var d = list[i];
    if (!d || !d.active) continue;
    var fade = d.maxLife > 0 ? d.life / d.maxLife : 0;
    if (fade < 0) fade = 0;
    if (fade > 1) fade = 1;
    var alpha = d.alpha * fade;
    if (alpha <= 0.01) continue;
    if (d.x < -48 || d.y < -48 || d.x > w + 48 || d.y > h + 48) continue;
    var kind = decalKind(d);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot || 0);
    ctx.globalAlpha = alpha;
    if (kind === 'foot') {
      ctx.fillStyle = 'rgba(16,12,9,0.8)';
      ctx.save();
      ctx.translate(-2.1, 0);
      ctx.rotate(-0.4);
      ctx.scale(1, 0.48);
      ctx.beginPath();
      ctx.arc(0, 0, d.r * 0.55, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(2.3, 1.1);
      ctx.rotate(0.25);
      ctx.scale(1, 0.42);
      ctx.beginPath();
      ctx.arc(0, 0, d.r * 0.48, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (kind === 'coolant') {
      ctx.fillStyle = d.color;
      ctx.save();
      ctx.scale(1, 0.7);
      ctx.beginPath();
      ctx.arc(0, 0, d.r, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = alpha * 0.65;
      ctx.beginPath();
      ctx.arc(d.r * 0.22, -d.r * 0.08, d.r * 0.32, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = d.color || '#1b1715';
      ctx.globalAlpha = alpha * 0.5;
      ctx.save();
      ctx.scale(1, 0.76);
      ctx.beginPath();
      ctx.arc(0, 0, d.r, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.arc(-d.r * 0.12, d.r * 0.04, d.r * 0.46, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
