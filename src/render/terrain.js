import { TAU, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { PALETTE, SECTOR_BLEND_SEC, groundPalette, sectorForWave } from './palette.js';
import { getBudget } from './quality.js';
import { getNoiseTile } from './sprites.js';

var WIND = 35 * Math.PI / 180;
var COS_W = Math.cos(WIND);
var SIN_W = Math.sin(WIND);
var TILE_SIZE = 1024;

var slotA = { canvas: null, ctx: null, pattern: null, key: '', sector: '', scale: 1 };
var slotB = { canvas: null, ctx: null, pattern: null, key: '', sector: '', scale: 1 };

// Tiles are baked at device resolution (capped at 2x) so cracks and grid lines stay sharp on high-DPI screens.
function tileScale() {
  var dpr = (rt.ui && rt.ui.dpr) || 1;
  if (dpr < 1) dpr = 1;
  if (dpr > 2) dpr = 2;
  return dpr;
}

function cacheKey(sector, detail) {
  return sector + '|' + TILE_SIZE + 'x' + TILE_SIZE + '@' + tileScale() + '|' + (detail ? '1' : '0');
}

function rng(seed) {
  var s = seed >>> 0 || 1;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sectorSeed(sector, w, h) {
  var extra = sector === 'rust' ? 101 : sector === 'night' ? 307 : sector === 'crystal' ? 521 : 17;
  return (7919 + (w | 0) * 13 + (h | 0) * 17 + extra) >>> 0;
}

export function paintNoise(ctx, tile, w, h, tileSize, alpha, op, ox, oy) {
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

export function paintDunes(ctx, w, h, colors, detail) {
  var bands = detail ? 6 : 3;
  var steps = detail ? 32 : 16;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'soft-light';
  var i;
  for (i = 0; i < bands; i += 1) {
    var yBase = (i / bands) * h;
    ctx.beginPath();
    var s;
    for (s = 0; s <= steps; s += 1) {
      var x = (s / steps) * w;
      // Periodic wave wrapping seamlessly across 1024px tile width
      var wave = Math.sin((x / w) * TAU * 2 + i * 1.5) * (detail ? 14 : 7);
      var y = ((yBase + wave) % h + h) % h;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i % 2 === 0 ? colors.light : colors.dark;
    ctx.globalAlpha = i % 2 === 0 ? 0.20 : 0.13;
    ctx.lineWidth = (detail ? 12 : 8) + (i % 2) * 4;
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
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x + nx * 1.5, p.y + ny * 1.5);
  ctx.lineTo(q.x + nx * 1.5, q.y + ny * 1.5);
  ctx.stroke();
}

export function paintCracks(ctx, w, h, colors, detail, sector) {
  var count = detail ? 48 : 16;
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
      // Toroidal distance for seamless edge matching
      var rawDx = Math.abs(pts[a].x - pts[b].x);
      var dx = Math.min(rawDx, w - rawDx);
      var rawDy = Math.abs(pts[a].y - pts[b].y);
      var dy = Math.min(rawDy, h - rawDy);
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
    if (best > a && bestD < 36000) strokeCrack(ctx, pts[a], pts[best], colors);
    if (detail && second > a && secondD < bestD * 2.15 && secondD < 36000) strokeCrack(ctx, pts[a], pts[second], colors);
  }
  ctx.restore();
}

function paintShadow(ctx, size) {
  ctx.save();
  ctx.translate(size * 0.32, size * 0.38);
  ctx.scale(1, 0.4);
  ctx.fillStyle = 'rgba(2,3,5,0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.95, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function paintRock(ctx, size, seed, colors) {
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
}

function paintScrap(ctx, size, variant, colors, detail) {
  var kind = detail ? variant % 4 : variant % 2;
  if (kind === 1) {
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = Math.max(2, size * 0.34);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.15);
    ctx.lineTo(size * 0.15, -size * 0.05);
    ctx.lineTo(size, -size * 0.4);
    ctx.stroke();
    ctx.strokeStyle = colors.crack;
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
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32, 0, TAU);
    ctx.stroke();
    return;
  }
  if (kind === 3) {
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.1);
    ctx.lineTo(size * 0.2, -size * 0.15);
    ctx.lineTo(size, size * 0.05);
    ctx.moveTo(-size * 0.1, -size * 0.55);
    ctx.lineTo(size * 0.15, size * 0.45);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size, -size * 0.32, size * 2, size * 0.64);
  if (!detail) return;
  ctx.fillStyle = colors.crack;
  ctx.fillRect(-size * 0.72, -size * 0.08, 1.6, 1.6);
  ctx.fillRect(size * 0.35, size * 0.02, 1.6, 1.6);
  ctx.fillRect(-size * 0.1, size * 0.08, 1.4, 1.4);
}

export function paintProps(ctx, colors, detail) {
  // Spatial hash props distributed in 128x128 virtual cells across 1024x1024 tile
  ctx.save();
  ctx.globalAlpha = 0.28;
  var cells = 8;
  var cellSize = 128;
  for (var gy = 0; gy < cells; gy += 1) {
    for (var gx = 0; gx < cells; gx += 1) {
      var seed = Math.abs((Math.imul(gx + 1, 374761393) ^ Math.imul(gy + 1, 668265263)) | 0);
      if ((seed % 5) >= 2) continue;
      var size = 6 + (seed % 6);
      var ox = 28 + (seed % 72);
      var oy = 28 + ((seed >> 4) % 72);
      var px = gx * cellSize + ox;
      var py = gy * cellSize + oy;
      var rot = ((seed % 314) / 100);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      paintShadow(ctx, size);
      if (seed % 2 === 0) paintScrap(ctx, size, seed, colors, detail);
      else paintRock(ctx, size, seed, colors);
      ctx.restore();
    }
  }
  ctx.restore();
}

// Centred radial shade: opposite tile edges get identical values, so the repeat has no seam.
function paintTileShade(ctx, w, h, centerCss, edgeCss) {
  var r = Math.hypot(w, h) * 0.5;
  var shade = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, r);
  shade.addColorStop(0, centerCss);
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, edgeCss);
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
}

export function paintGrid(ctx, w, h) {
  // 64px tactical coordinates grid (16 cells horizontally and vertically across 1024)
  var grid = 64;
  var cx = w * 0.5;
  var cy = h * 0.5;
  var halfW = w * 0.5 || 1;
  var halfH = h * 0.5 || 1;
  ctx.save();
  ctx.lineWidth = 1;
  var x;
  for (x = grid; x < w; x += grid) {
    var dx = Math.abs(x - cx) / halfW;
    var ax = (1 - dx) * (1 - dx) * 0.035;
    if (ax < 0.008) continue;
    ctx.strokeStyle = 'rgba(180,160,130,' + ax.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  var y;
  for (y = grid; y < h; y += grid) {
    var dy = Math.abs(y - cy) / halfH;
    var ay = (1 - dy) * (1 - dy) * 0.035;
    if (ay < 0.008) continue;
    ctx.strokeStyle = 'rgba(180,160,130,' + ay.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintPlates(ctx, w, h, colors, detail) {
  // Industrial steel / reinforced plating panels across the tile
  var panelSize = detail ? 256 : 512;
  var cols = Math.ceil(w / panelSize);
  var rows = Math.ceil(h / panelSize);
  ctx.save();
  for (var r = 0; r < rows; r += 1) {
    for (var c = 0; c < cols; c += 1) {
      var seed = (r * 17 + c * 31) >>> 0;
      var px = c * panelSize;
      var py = r * panelSize;
      // Plate perimeter seam
      ctx.strokeStyle = colors.crack;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.45;
      ctx.strokeRect(px + 4, py + 4, panelSize - 8, panelSize - 8);

      // Plate highlight edge
      ctx.strokeStyle = colors.hi || colors.light;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(px + 5, py + panelSize - 5);
      ctx.lineTo(px + 5, py + 5);
      ctx.lineTo(px + panelSize - 5, py + 5);
      ctx.stroke();

      if (detail && (seed % 3 === 0)) {
        // Corner rivets
        ctx.fillStyle = colors.dark;
        ctx.globalAlpha = 0.5;
        var ro = 12;
        ctx.fillRect(px + ro, py + ro, 3, 3);
        ctx.fillRect(px + panelSize - ro - 3, py + ro, 3, 3);
        ctx.fillRect(px + ro, py + panelSize - ro - 3, 3, 3);
        ctx.fillRect(px + panelSize - ro - 3, py + panelSize - ro - 3, 3, 3);
      }
    }
  }
  ctx.restore();
}

export function paintCrystalLattice(ctx, w, h, colors, detail) {
  var step = 64;
  var count = Math.ceil((w + h) / step);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.light;
  ctx.globalAlpha = 0.22;

  // Diagonal positive slope: /
  ctx.beginPath();
  for (var i = -count; i <= count; i += 1) {
    var offset = i * step;
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + h, h);
  }
  ctx.stroke();

  // Diagonal negative slope: \
  ctx.beginPath();
  for (var j = 0; j <= count * 2; j += 1) {
    var offset2 = j * step;
    ctx.moveTo(offset2, 0);
    ctx.lineTo(offset2 - h, h);
  }
  ctx.stroke();

  // Subtle prism highlight lines on alternate major axes
  if (detail) {
    ctx.strokeStyle = colors.hi;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    for (var k = -count; k <= count; k += 4) {
      var o1 = k * step;
      ctx.moveTo(o1, 0);
      ctx.lineTo(o1 + h, h);
    }
    for (var m = 0; m <= count * 2; m += 4) {
      var o2 = m * step;
      ctx.moveTo(o2, 0);
      ctx.lineTo(o2 - h, h);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function paintCrystalCracks(ctx, w, h, colors, detail, sector) {
  var count = detail ? 36 : 18;
  var rand = rng(sectorSeed(sector || 'crystal', w, h));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  var CLEAVAGE_ANGLES = [
    0,
    Math.PI / 3,       // 60 deg
    2 * Math.PI / 3,   // 120 deg
    Math.PI,           // 180 deg
    4 * Math.PI / 3,   // 240 deg
    5 * Math.PI / 3    // 300 deg
  ];

  for (var i = 0; i < count; i += 1) {
    var cx = rand() * w;
    var cy = rand() * h;
    var arms = 2 + (rand() * 3 | 0);
    var baseAngIdx = (rand() * 6) | 0;

    for (var a = 0; a < arms; a += 1) {
      var angIdx = (baseAngIdx + a * ((rand() > 0.5) ? 1 : 2)) % 6;
      var ang = CLEAVAGE_ANGLES[angIdx];
      var len = 30 + rand() * 65;
      var ex = cx + Math.cos(ang) * len;
      var ey = cy + Math.sin(ang) * len;

      // Dark cleavage seam
      ctx.strokeStyle = colors.crack;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      if (detail && rand() > 0.4) {
        var turn = rand() > 0.5 ? 1 : 5;
        var ang2 = CLEAVAGE_ANGLES[(angIdx + turn) % 6];
        var len2 = 20 + rand() * 35;
        ctx.lineTo(ex + Math.cos(ang2) * len2, ey + Math.sin(ang2) * len2);
      }
      ctx.stroke();

      // Neon refraction highlight line along cleavage edge
      ctx.strokeStyle = (a % 2 === 0) ? colors.hi : (colors.prism || colors.hi);
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      var nx = -Math.sin(ang) * 1.5;
      var ny = Math.cos(ang) * 1.5;
      ctx.moveTo(cx + nx, cy + ny);
      ctx.lineTo(ex + nx, ey + ny);
      ctx.stroke();
    }

    // Microcrystalline node at cleavage vertex
    var nodeR = 2.5 + rand() * 3.5;
    ctx.fillStyle = (i % 2 === 0) ? colors.hi : (colors.prism || colors.hi);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (var k = 0; k < 4; k += 1) {
      var nAng = (k / 4) * TAU + Math.PI / 4;
      var nx2 = cx + Math.cos(nAng) * nodeR;
      var ny2 = cy + Math.sin(nAng) * (nodeR * 0.7);
      if (k === 0) ctx.moveTo(nx2, ny2);
      else ctx.lineTo(nx2, ny2);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function paintCrystalGlints(ctx, w, h, colors, detail) {
  var cells = detail ? 16 : 8;
  var cellSize = w / cells;
  ctx.save();

  for (var gy = 0; gy < cells; gy += 1) {
    for (var gx = 0; gx < cells; gx += 1) {
      var seed = Math.abs((Math.imul(gx + 1, 48271) ^ Math.imul(gy + 1, 16807)) | 0);
      if ((seed % 5) >= 2) continue;

      var ox = 16 + (seed % (cellSize - 32));
      var oy = 16 + ((seed >> 4) % (cellSize - 32));
      var px = gx * cellSize + ox;
      var py = gy * cellSize + oy;
      var armLen = 5 + (seed % 9);
      var isPrism = (seed % 3 === 0);

      ctx.strokeStyle = isPrism ? (colors.prism || colors.hi) : colors.hi;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.45 + (seed % 40) / 100;

      // 4-point cross star (horizontal and vertical arms)
      ctx.beginPath();
      ctx.moveTo(px - armLen, py);
      ctx.lineTo(px + armLen, py);
      ctx.moveTo(px, py - armLen);
      ctx.lineTo(px, py + armLen);
      ctx.stroke();

      if (detail && armLen > 8) {
        var diagLen = armLen * 0.45;
        ctx.beginPath();
        ctx.moveTo(px - diagLen, py - diagLen);
        ctx.lineTo(px + diagLen, py + diagLen);
        ctx.moveTo(px - diagLen, py + diagLen);
        ctx.lineTo(px + diagLen, py - diagLen);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

export var BIOME_RENDERERS = {
  dusk: {
    name: 'dusk',
    render: function (ctx, w, h, colors, detail, sector) {
      var tile = getNoiseTile();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = colors.base;
      ctx.fillRect(0, 0, w, h);
      paintNoise(ctx, tile, w, h, detail ? 420 : 512, 0.12, 'soft-light', 12, 20);
      if (detail) {
        paintNoise(ctx, tile, w, h, 168, 0.06, 'soft-light', 40, 16);
      }
      paintDunes(ctx, w, h, colors, detail);
      paintTileShade(ctx, w, h, 'rgba(255,220,170,0.03)', 'rgba(0,0,0,0.088)');
      paintCracks(ctx, w, h, colors, detail, sector);
      paintProps(ctx, colors, detail);
      paintGrid(ctx, w, h);
    }
  },
  rust: {
    name: 'rust',
    render: function (ctx, w, h, colors, detail, sector) {
      var tile = getNoiseTile();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = colors.base;
      ctx.fillRect(0, 0, w, h);
      paintNoise(ctx, tile, w, h, detail ? 380 : 512, 0.16, 'soft-light', 24, 12);
      if (detail) {
        paintNoise(ctx, tile, w, h, 128, 0.08, 'soft-light', 18, 32);
      }
      paintPlates(ctx, w, h, colors, detail);
      paintDunes(ctx, w, h, colors, detail);
      paintTileShade(ctx, w, h, 'rgba(235,120,60,0.04)', 'rgba(0,0,0,0.104)');
      paintCracks(ctx, w, h, colors, detail, sector);
      paintProps(ctx, colors, detail);
      paintGrid(ctx, w, h);
    }
  },
  night: {
    name: 'night',
    render: function (ctx, w, h, colors, detail, sector) {
      var tile = getNoiseTile();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = colors.base;
      ctx.fillRect(0, 0, w, h);
      paintNoise(ctx, tile, w, h, detail ? 460 : 512, 0.10, 'soft-light', 8, 8);
      if (detail) {
        paintNoise(ctx, tile, w, h, 200, 0.05, 'soft-light', 50, 25);
      }
      paintPlates(ctx, w, h, colors, detail);
      paintDunes(ctx, w, h, colors, detail);
      paintTileShade(ctx, w, h, 'rgba(100,160,255,0.03)', 'rgba(0,0,0,0.12)');
      paintCracks(ctx, w, h, colors, detail, sector);
      paintProps(ctx, colors, detail);
      paintGrid(ctx, w, h);
    }
  },
  crystal: {
    name: 'crystal',
    render: function (ctx, w, h, colors, detail, sector) {
      var tile = getNoiseTile();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = colors.base;
      ctx.fillRect(0, 0, w, h);
      paintNoise(ctx, tile, w, h, detail ? 420 : 512, 0.08, 'soft-light', 16, 16);
      if (detail) {
        paintNoise(ctx, tile, w, h, 180, 0.04, 'soft-light', 32, 48);
      }
      paintCrystalLattice(ctx, w, h, colors, detail);
      paintCrystalCracks(ctx, w, h, colors, detail, sector);
      paintCrystalGlints(ctx, w, h, colors, detail);
      paintProps(ctx, colors, detail);

      paintTileShade(ctx, w, h, 'rgba(56,189,248,0.04)', 'rgba(192,132,252,0.06)');
      paintGrid(ctx, w, h);
    }
  }
};
BIOME_RENDERERS.default = BIOME_RENDERERS.dusk;

export function registerBiomeRenderer(name, strategy) {
  BIOME_RENDERERS[name] = strategy;
}

function paintGround(ctx, w, h, sector, detail) {
  var colors = groundPalette(sector);
  var renderer = BIOME_RENDERERS[sector] || BIOME_RENDERERS.default;
  if (renderer && typeof renderer.render === 'function') {
    renderer.render(ctx, w, h, colors, detail, sector);
  }
}

function bakeSlot(slot, sector, detail, key) {
  if (typeof document === 'undefined') return;
  if (!slot.canvas) {
    slot.canvas = document.createElement('canvas');
    slot.ctx = slot.canvas.getContext('2d', { alpha: false });
  }
  if (!slot.ctx) return;
  var scale = tileScale();
  var px = Math.round(TILE_SIZE * scale);
  if (slot.canvas.width !== px || slot.canvas.height !== px) {
    slot.canvas.width = px;
    slot.canvas.height = px;
  }
  var t0 = bakeClock();
  slot.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  paintGround(slot.ctx, TILE_SIZE, TILE_SIZE, sector, detail);
  lastBakeMs = bakeClock() - t0;
  slot.key = key;
  slot.sector = sector;
  slot.scale = scale;
  slot.pattern = null;
}

var lastBakeMs = 0;

function bakeClock() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/** Last terrain tile bake time in ms (dev diagnostics only). */
export function lastTerrainBakeMs() {
  return lastBakeMs;
}

/** Drop cached fill patterns so a tab-return / GPU recycle still paints ground. */
export function invalidateTerrainPatterns() {
  slotA.pattern = null;
  slotB.pattern = null;
}

function ensure(sector, detail, protect) {
  var key = cacheKey(sector, detail);
  if (slotA.key === key && slotA.canvas) return slotA;
  if (detail && slotB.key === key && slotB.canvas) return slotB;
  var slot = slotA;
  if (detail) {
    if (protect === slotA) slot = slotB;
    else if (protect === slotB) slot = slotA;
    else if (slotA.key && !slotB.key) slot = slotB;
  }
  bakeSlot(slot, sector, detail, key);
  return slot;
}

function drawSlotPattern(ctx, slot, alpha, x0, y0, viewW, viewH) {
  if (!slot || !slot.canvas || !(alpha > 0)) return;
  if (!slot.pattern) {
    slot.pattern = ctx.createPattern(slot.canvas, 'repeat');
  }
  var terrainPattern = slot.pattern;
  if (!terrainPattern) return;

  var prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;

  var inv = 1 / (slot.scale || 1);
  var mat;
  // Fill is already in world space under the camera CTM. Translating the
  // pattern by -x0/-y0 double-scrolled the ground under the hull (float look).
  // Scale alone maps HiDPI-baked tiles back to world units.
  if (typeof DOMMatrix !== 'undefined') {
    mat = new DOMMatrix();
    if (inv !== 1) mat.scaleSelf(inv, inv);
  } else {
    mat = { a: inv, b: 0, c: 0, d: inv, e: 0, f: 0 };
  }
  terrainPattern.setTransform(mat);
  ctx.fillStyle = terrainPattern;
  ctx.fillRect(x0 - 48, y0 - 48, viewW + 96, viewH + 96);

  ctx.globalAlpha = prev;
}

function flatFill(ctx, x0, y0, w, h) {
  ctx.fillStyle = PALETTE.ground.base;
  ctx.fillRect(x0 - 48, y0 - 48, w + 96, h + 96);
}

export function drawGround(ctx, camX, camY, viewW, viewH) {
  if (!ctx || !rt.ui) return;
  var w = (typeof viewW === 'number' && viewW > 0) ? viewW : rt.ui.width;
  var h = (typeof viewH === 'number' && viewH > 0) ? viewH : rt.ui.height;
  if (!(w > 0) || !(h > 0)) return;

  var cx = (typeof camX === 'number') ? camX : (rt.camera && typeof rt.camera.x === 'number') ? rt.camera.x : (rt.state && rt.state.player ? rt.state.player.x : ((rt.state && rt.state.width) || 3520) * 0.5);
  var cy = (typeof camY === 'number') ? camY : (rt.camera && typeof rt.camera.y === 'number') ? rt.camera.y : (rt.state && rt.state.player ? rt.state.player.y : ((rt.state && rt.state.height) || 2640) * 0.5);

  // Soft-clamped camera keeps most of the view on-map; a thin void strip can
  // still appear and is painted over by render/boundary.js.
  var x0 = cx - w * 0.5;
  var y0 = cy - h * 0.5;

  if (typeof document === 'undefined') {
    flatFill(ctx, x0, y0, w, h);
    return;
  }

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
    var low = ensure(sector, false, null);
    drawSlotPattern(ctx, low, 1, x0, y0, w, h);
    return;
  }

  var fromSlot = ensure(from, true, null);
  var toSlot = ensure(sector, true, fromSlot);
  if (t >= 1) {
    drawSlotPattern(ctx, toSlot, 1, x0, y0, w, h);
  } else {
    drawSlotPattern(ctx, fromSlot, 1, x0, y0, w, h);
    drawSlotPattern(ctx, toSlot, t, x0, y0, w, h);
  }
  if (waveTime >= WAVE_LENGTH - 2) {
    var next = sectorForWave(wave + 1);
    if (next !== sector) ensure(next, true, toSlot);
  }
}

function decalKind(d) {
  var c = d.color || '#1b1715';
  if (c === '#141210' || d.r <= 8) return 'foot';
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
  if (!s || s.paused || s.over || (s.hitstop || 0) > 0) return;
  var dt = rt.renderDt || 0;
  for (var i = 0; i < visualDecals.length; i += 1) {
    var d = visualDecals[i];
    if (!d || !d.active) continue;
    d.life -= dt;
    if (d.life <= 0) d.active = false;
  }
}

export function drawDecals(ctx, x0, y0, viewW, viewH) {
  if (!ctx || !rt.state || !rt.ui) return;
  var w = (typeof viewW === 'number' && viewW > 0) ? viewW : rt.ui.width;
  var h = (typeof viewH === 'number' && viewH > 0) ? viewH : rt.ui.height;
  var ox = (typeof x0 === 'number') ? x0 : 0;
  var oy = (typeof y0 === 'number') ? y0 : 0;

  if (rt.state.decals) drawDecalList(ctx, rt.state.decals, ox, oy, w, h);
  syncVisualDecalOwner();
  ageVisualDecals();
  drawDecalList(ctx, visualDecals, ox, oy, w, h);
}

function drawDecalList(ctx, list, x0, y0, w, h) {
  var i;
  var minX = x0 - 48;
  var maxX = x0 + w + 48;
  var minY = y0 - 48;
  var maxY = y0 + h + 48;

  for (i = 0; i < list.length; i += 1) {
    var d = list[i];
    if (!d || !d.active) continue;
    var fade = d.maxLife > 0 ? d.life / d.maxLife : 0;
    if (fade < 0) fade = 0;
    if (fade > 1) fade = 1;
    var alpha = d.alpha * fade;
    if (alpha <= 0.01) continue;
    if (d.x < minX || d.y < minY || d.x > maxX || d.y > maxY) continue;
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
