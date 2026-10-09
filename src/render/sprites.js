var GLOW_SIZES = [16, 32, 64, 128, 256];
var GLOW_CAP = 160;

var byColor = Object.create(null);
var spriteCount = 0;
var batchDepth = 0;
var noiseTile = null;

function sizeIndex(size) {
  var s = Number(size) || 0;
  if (!(s > 0)) return 0;
  for (var i = 0; i < GLOW_SIZES.length; i += 1) {
    if (s <= GLOW_SIZES[i]) return i;
  }
  return GLOW_SIZES.length - 1;
}

function colorToRgb(color) {
  var c = String(color || '#ffffff').trim();
  var hex = c.charAt(0) === '#' ? c.slice(1) : '';
  if (hex.length === 3) {
    return {
      r: parseInt(hex.charAt(0) + hex.charAt(0), 16),
      g: parseInt(hex.charAt(1) + hex.charAt(1), 16),
      b: parseInt(hex.charAt(2) + hex.charAt(2), 16)
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  var m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return { r: 255, g: 255, b: 255 };
}

function rgba(rgb, a) {
  return 'rgba(' + (rgb.r | 0) + ',' + (rgb.g | 0) + ',' + (rgb.b | 0) + ',' + a + ')';
}

export function beginGlowBatch() {
  batchDepth += 1;
}

export function endGlowBatch() {
  if (batchDepth > 0) batchDepth -= 1;
}

export function getGlowSprite(color, size) {
  if (typeof document === 'undefined') return null;
  var idx = sizeIndex(size);
  var key = color || '#ffffff';
  var bucket = byColor[key];
  if (bucket && bucket[idx]) return bucket[idx];
  if (spriteCount >= GLOW_CAP) {
    var fallback = byColor['#ffffff'];
    if (fallback && fallback[idx]) return fallback[idx];
    if (bucket) {
      var f;
      for (f = idx; f < GLOW_SIZES.length; f += 1) {
        if (bucket[f]) return bucket[f];
      }
    }
    return null;
  }
  if (!bucket) {
    bucket = [null, null, null, null, null];
    byColor[key] = bucket;
  }
  var q = GLOW_SIZES[idx];
  var canvas = document.createElement('canvas');
  canvas.width = q;
  canvas.height = q;
  var g = canvas.getContext('2d');
  if (!g) return null;
  var rgb = colorToRgb(key);
  var half = q / 2;
  var grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, rgba(rgb, 0.95));
  grad.addColorStop(0.4, rgba(rgb, 0.4));
  grad.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, q, q);
  bucket[idx] = canvas;
  spriteCount += 1;
  return canvas;
}

export function drawGlow(ctx, x, y, radius, color, alpha) {
  if (!ctx || !(radius > 0)) return;
  var a = alpha == null ? 1 : alpha;
  if (!(a > 0)) return;
  var sprite = getGlowSprite(color, radius * 2);
  if (!sprite) return;
  var prev = ctx.globalAlpha;
  var dest = prev * a;
  if (dest !== prev) ctx.globalAlpha = dest;
  if (batchDepth > 0) {
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    var op = ctx.globalCompositeOperation;
    if (op !== 'lighter') ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    if (op !== 'lighter') ctx.globalCompositeOperation = op;
  }
  if (dest !== prev) ctx.globalAlpha = prev;
}

export function getNoiseTile() {
  if (typeof document === 'undefined') return null;
  if (noiseTile) return noiseTile;
  var canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  var g = canvas.getContext('2d');
  if (!g) return null;
  var image = g.createImageData(128, 128);
  var data = image.data;
  for (var i = 0; i < data.length; i += 4) {
    var n = (Math.random() * 256) | 0;
    data[i] = n;
    data[i + 1] = n;
    data[i + 2] = n;
    data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  noiseTile = canvas;
  return noiseTile;
}

export function clearSpriteCache() {
  byColor = Object.create(null);
  spriteCount = 0;
  noiseTile = null;
}
