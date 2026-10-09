import { rt } from '../core/runtime.js';
import { isHighContrast } from '../core/settings.js';
import { PALETTE, ambientShade, sectorTint, stormBlend } from './palette.js';
import { getBudget } from './quality.js';
import { drawGlow, beginGlowBatch, endGlowBatch } from './sprites.js';

var LIGHT_CAP = 48;
var LIGHT_POOL = 160;
var lights = new Array(LIGHT_POOL);
var lightCount = 0;
var mapCanvas = null;
var mapCtx = null;
var mapW = 0;
var mapH = 0;
var shadeR = -1;
var shadeG = -1;
var shadeB = -1;
var shadeCss = '#000';
var CONE_SPREAD = 15 * Math.PI / 180;
var LIGHTMAP_EDGE = 512;
var coneCanvas = null;

var li;
for (li = 0; li < LIGHT_POOL; li += 1) {
  lights[li] = { x: 0, y: 0, radius: 0, color: '#fff', a: 1, d2: 0 };
}

function shadeStyle(shade) {
  if (shade.r !== shadeR || shade.g !== shadeG || shade.b !== shadeB) {
    shadeR = shade.r;
    shadeG = shade.g;
    shadeB = shade.b;
    shadeCss = 'rgb(' + shadeR + ',' + shadeG + ',' + shadeB + ')';
  }
  return shadeCss;
}

function addLight(x, y, radius, color, alpha, px, py, w, h) {
  if (!(radius > 8) || !(alpha > 0.02) || lightCount >= LIGHT_POOL) return;
  if (x < -radius || y < -radius || x > w + radius || y > h + radius) return;
  var dx = x - px;
  var dy = y - py;
  var L = lights[lightCount];
  lightCount += 1;
  L.x = x;
  L.y = y;
  L.radius = radius > 280 ? 280 : radius;
  L.color = color || '#ffffff';
  L.a = alpha > 1 ? 1 : alpha;
  L.d2 = dx * dx + dy * dy;
}

function trimLights() {
  if (lightCount <= LIGHT_CAP) return;
  var i;
  for (i = 0; i < LIGHT_CAP; i += 1) {
    var best = i;
    var bestD = lights[i].d2;
    var j;
    for (j = i + 1; j < lightCount; j += 1) {
      if (lights[j].d2 < bestD) {
        best = j;
        bestD = lights[j].d2;
      }
    }
    if (best !== i) {
      var tmp = lights[i];
      lights[i] = lights[best];
      lights[best] = tmp;
    }
  }
  lightCount = LIGHT_CAP;
}

function collect(w, h) {
  lightCount = 0;
  var state = rt.state;
  var p = state.player;
  if (!p) return;
  var px = p.x;
  var py = p.y;
  var playerSlot = lightCount;
  addLight(px, py, 220, PALETTE.emissive.player, 0.82, px, py, w, h);
  if (lightCount > playerSlot) lights[playerSlot].d2 = -1;
  if (p.overdrive > 0) addLight(px, py, 150, PALETTE.emissive.gold, 0.55, px, py, w, h);
  if (p.recoil > 0.02) {
    var mx = px + Math.cos(p.aim || 0) * ((p.r || 15) + 12);
    var my = py + Math.sin(p.aim || 0) * ((p.r || 15) + 12);
    addLight(mx, my, 40 + p.recoil * 48, '#fff1c4', 0.35 + p.recoil * 0.55, px, py, w, h);
  }

  var list;
  var i;
  list = state.bullets;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var b = list[i];
      if (!b) continue;
      addLight(b.x, b.y, 16 + (b.r || 4) * 4, b.colorCore || PALETTE.emissive.player, 0.5, px, py, w, h);
    }
  }
  list = state.enemyBullets;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var eb = list[i];
      if (!eb) continue;
      addLight(eb.x, eb.y, 14 + (eb.r || 3.5) * 3, eb.glowColor || eb.color || PALETTE.emissive.hostile, 0.4, px, py, w, h);
    }
  }
  list = state.orbs;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var orb = list[i];
      if (!orb) continue;
      if (orb.kind === 'overdrive') addLight(orb.x, orb.y, 78, PALETTE.emissive.gold, 0.7, px, py, w, h);
      else if (orb.kind === 'repair') addLight(orb.x, orb.y, 56, PALETTE.emissive.player, 0.48, px, py, w, h);
      else addLight(orb.x, orb.y, 40, PALETTE.hud.amber, 0.32, px, py, w, h);
    }
  }
  list = state.volatileCores;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var core = list[i];
      if (!core) continue;
      addLight(core.x, core.y, 110, PALETTE.emissive.gold, 0.62, px, py, w, h);
    }
  }
  list = state.barrels;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var barrel = list[i];
      if (!barrel) continue;
      if (barrel.state === 'flying') addLight(barrel.x, barrel.y, 96, PALETTE.emissive.hostile, 0.7, px, py, w, h);
      else addLight(barrel.x, barrel.y, 52, PALETTE.hud.amber, 0.34, px, py, w, h);
    }
  }
  list = state.artilleryTargets;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var at = list[i];
      if (!at || at.state !== 'molten') continue;
      addLight(at.x, at.y, (at.r || 40) * 1.7, PALETTE.emissive.hostile, 0.55, px, py, w, h);
    }
  }
  list = state.plasmaZones;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var pz = list[i];
      if (!pz) continue;
      addLight(pz.x, pz.y, (pz.r || 40) * 2.1, PALETTE.emissive.hostile, 0.5, px, py, w, h);
    }
  }
  list = state.vortices;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var vortex = list[i];
      if (!vortex) continue;
      addLight(vortex.x, vortex.y, 96, PALETTE.emissive.void, 0.4, px, py, w, h);
    }
  }
  list = state.spires;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var sp = list[i];
      if (!sp) continue;
      if (sp.resonanceTimer > 0) addLight(sp.x, sp.y, 150, PALETTE.emissive.tech, 0.75, px, py, w, h);
      else addLight(sp.x, sp.y, 44, PALETTE.emissive.tech, 0.22, px, py, w, h);
    }
  }
  list = state.enemies;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var enemy = list[i];
      if (!enemy || enemy.kind !== 'titan') continue;
      addLight(enemy.x, enemy.y, 200, enemy.phase2Triggered ? PALETTE.emissive.hostile : PALETTE.emissive.gold, 0.8, px, py, w, h);
    }
  }
  list = state.shockRings;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var ring = list[i];
      if (!ring) continue;
      var life = ring.maxLife > 0 ? ring.life / ring.maxLife : 0;
      if (!(life > 0)) continue;
      addLight(ring.x, ring.y, (ring.maxR || 70) * (0.45 + 0.4 * life), ring.color || PALETTE.emissive.hostile, 0.35 + 0.4 * life, px, py, w, h);
    }
  }
  list = state.opticalFlashes;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var flash = list[i];
      if (!flash) continue;
      var fa = flash.maxLife > 0 ? flash.life / flash.maxLife : 0.5;
      addLight(flash.x, flash.y, (flash.r || 8) * 5, flash.color || '#fff4bd', 0.45 * fa, px, py, w, h);
    }
  }
  trimLights();
}

function ensureCone() {
  if (coneCanvas || typeof document === 'undefined') return coneCanvas;
  var canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 72;
  var g = canvas.getContext('2d');
  if (!g) return null;
  g.beginPath();
  g.moveTo(0, 36);
  g.lineTo(128, 2);
  g.lineTo(128, 70);
  g.closePath();
  var grad = g.createLinearGradient(0, 36, 128, 36);
  grad.addColorStop(0, 'rgba(255,236,200,0.08)');
  grad.addColorStop(0.12, 'rgba(255,228,176,0.72)');
  grad.addColorStop(1, 'rgba(255,210,150,0)');
  g.fillStyle = grad;
  g.fill();
  coneCanvas = canvas;
  return coneCanvas;
}

function drawCone(lctx, p, s) {
  var sprite = ensureCone();
  if (!sprite) return;
  var len = 280 * s;
  var half = len * Math.tan(CONE_SPREAD);
  if (!(len > 1) || !(half > 0.5)) return;
  lctx.save();
  lctx.translate(p.x * s, p.y * s);
  lctx.rotate(p.aim || 0);
  lctx.drawImage(sprite, 0, -half, len, half * 2);
  lctx.restore();
}

export function drawLightmap(ctx) {
  if (!ctx || !rt.ui || !rt.state || !rt.state.player) return;
  if (!getBudget().lightmap || isHighContrast()) return;
  if (typeof document === 'undefined') return;
  var w = rt.ui.width;
  var h = rt.ui.height;
  if (!(w > 0) || !(h > 0)) return;
  var dpr = rt.ui.dpr || 1;
  if (dpr < 1) dpr = 1;
  if (dpr > 2) dpr = 2;
  var pw = Math.max(1, Math.round(w * dpr * 0.5));
  var ph = Math.max(1, Math.round(h * dpr * 0.5));
  var edge = pw > ph ? pw : ph;
  if (edge > LIGHTMAP_EDGE) {
    var fit = LIGHTMAP_EDGE / edge;
    pw = Math.max(1, Math.round(pw * fit));
    ph = Math.max(1, Math.round(ph * fit));
  }
  if (!mapCanvas) {
    mapCanvas = document.createElement('canvas');
    mapCtx = mapCanvas.getContext('2d', { alpha: false });
  }
  if (!mapCtx) return;
  if (mapW !== pw || mapH !== ph) {
    mapCanvas.width = pw;
    mapCanvas.height = ph;
    mapW = pw;
    mapH = ph;
  }
  var storm = stormBlend(rt.state.waveTime || 0);
  var tint = sectorTint(rt.state.wave || 1, rt.state.waveTime || 0, storm);
  var shade = ambientShade(tint, storm);
  mapCtx.setTransform(1, 0, 0, 1, 0, 0);
  mapCtx.globalCompositeOperation = 'source-over';
  mapCtx.globalAlpha = 1;
  mapCtx.fillStyle = shadeStyle(shade);
  mapCtx.fillRect(0, 0, pw, ph);
  collect(w, h);
  var s = pw / w;
  mapCtx.globalCompositeOperation = 'lighter';
  beginGlowBatch();
  var n;
  for (n = 0; n < lightCount; n += 1) {
    var L = lights[n];
    drawGlow(mapCtx, L.x * s, L.y * s, L.radius * s, L.color, L.a);
  }
  endGlowBatch();
  drawCone(mapCtx, rt.state.player, s);
  mapCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(mapCanvas, 0, 0, w, h);
}
