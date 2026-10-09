import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { fxRand, fxRandSigned } from './fx-rand.js';
import { getBudget } from './quality.js';
import { beginGlowBatch, drawGlow, endGlowBatch } from './sprites.js';

var BOLT_MAX = 12;
var bolts = null;
var boltCursor = 0;

var MX = new Float32Array(80);
var MY = new Float32Array(80);
var BX1 = new Float32Array(24);
var BY1 = new Float32Array(24);
var BX2 = new Float32Array(24);
var BY2 = new Float32Array(24);
var mainN = 0;
var branchN = 0;

var budStamp = -1;
var bud = { depth: 1, key: false, reduced: false, contrast: false, tier: 'low' };

function syncBud() {
  var stamp = rt.renderTime || 0;
  if (stamp === budStamp) return bud;
  budStamp = stamp;
  var b = getBudget();
  bud.depth = b && b.arcDepth > 0 ? b.arcDepth : 1;
  bud.key = !!(b && b.keyGlowsOnly);
  bud.tier = (b && b.tier) || 'low';
  bud.reduced = isReducedMotion();
  bud.contrast = isHighContrast();
  return bud;
}

function ensureBolts() {
  if (bolts) return;
  bolts = new Array(BOLT_MAX);
  for (var i = 0; i < BOLT_MAX; i += 1) {
    bolts[i] = { active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 0.2, color: '#5be7ff' };
  }
}

export function spawnVisualBolt(x1, y1, x2, y2, life, color) {
  ensureBolts();
  var bolt = null;
  var n;
  for (n = 0; n < BOLT_MAX; n += 1) {
    var i = (boltCursor + n) % BOLT_MAX;
    if (!bolts[i].active) {
      bolt = bolts[i];
      boltCursor = (i + 1) % BOLT_MAX;
      break;
    }
  }
  if (!bolt) {
    bolt = bolts[boltCursor];
    boltCursor = (boltCursor + 1) % BOLT_MAX;
  }
  bolt.active = true;
  bolt.x1 = x1;
  bolt.y1 = y1;
  bolt.x2 = x2;
  bolt.y2 = y2;
  bolt.life = life > 0 ? life : 0.18;
  bolt.maxLife = bolt.life;
  bolt.color = color || '#5be7ff';
}

export function stepVisualBolts(dt) {
  if (!bolts || !(dt > 0)) return;
  for (var i = 0; i < BOLT_MAX; i += 1) {
    if (!bolts[i].active) continue;
    bolts[i].life -= dt;
    if (bolts[i].life <= 0) bolts[i].active = false;
  }
}

export function clearVisualBolts() {
  if (!bolts) return;
  for (var i = 0; i < BOLT_MAX; i += 1) bolts[i].active = false;
  boltCursor = 0;
}

function splitArc(x1, y1, x2, y2, depth, disp) {
  if (mainN >= MX.length) return;
  if (depth <= 0 || disp < 2.5) {
    MX[mainN] = x2;
    MY[mainN] = y2;
    mainN += 1;
    return;
  }
  var mx = (x1 + x2) * 0.5 + fxRandSigned() * disp;
  var my = (y1 + y2) * 0.5 + fxRandSigned() * disp;
  splitArc(x1, y1, mx, my, depth - 1, disp * 0.55);
  if (depth > 1 && branchN < BX1.length && fxRand() < 0.58) {
    var dirx = x2 - x1;
    var diry = y2 - y1;
    var inv = 1 / (Math.hypot(dirx, diry) || 1);
    var nx = -diry * inv;
    var ny = dirx * inv;
    var side = fxRand() < 0.5 ? -1 : 1;
    var bl = disp * (1.1 + fxRand());
    BX1[branchN] = mx;
    BY1[branchN] = my;
    BX2[branchN] = mx + nx * side * bl + dirx * inv * bl * 0.35;
    BY2[branchN] = my + ny * side * bl + diry * inv * bl * 0.35;
    branchN += 1;
  }
  splitArc(mx, my, x2, y2, depth - 1, disp * 0.55);
}

function buildArc(x1, y1, x2, y2, depth) {
  mainN = 1;
  branchN = 0;
  MX[0] = x1;
  MY[0] = y1;
  var len = Math.hypot(x2 - x1, y2 - y1) || 1;
  splitArc(x1, y1, x2, y2, depth, Math.min(46, len * 0.26));
}

function strokeBuilt(ctx, alpha, color, core, keyOnly) {
  if (mainN < 2 || alpha <= 0.02) return;
  ctx.beginPath();
  ctx.moveTo(MX[0], MY[0]);
  for (var i = 1; i < mainN; i += 1) ctx.lineTo(MX[i], MY[i]);
  ctx.strokeStyle = color || '#5be7ff';
  ctx.globalAlpha = alpha * 0.4;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = core || '#f4fffd';
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.7;
  ctx.stroke();
  if (branchN > 0) {
    ctx.strokeStyle = core || '#f4fffd';
    ctx.globalAlpha = alpha * 0.75;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (var b = 0; b < branchN; b += 1) {
      ctx.moveTo(BX1[b], BY1[b]);
      ctx.lineTo(BX2[b], BY2[b]);
    }
    ctx.stroke();
  }
  if (!keyOnly) {
    drawGlow(ctx, MX[0], MY[0], 12, color || '#5be7ff', alpha * 0.8);
    var mid = mainN >> 1;
    drawGlow(ctx, MX[mid], MY[mid], 16, color || '#5be7ff', alpha * 0.7);
    drawGlow(ctx, MX[mainN - 1], MY[mainN - 1], 12, color || '#5be7ff', alpha);
  }
  ctx.globalAlpha = 1;
}

function drawBolt(ctx, x1, y1, x2, y2, alpha, depth, color, keyOnly) {
  buildArc(x1, y1, x2, y2, depth > 0 ? depth : 1);
  strokeBuilt(ctx, alpha, color, '#f4fffd', keyOnly);
}

function traceBeam(ctx, bullet, width, style, alpha, amp, time, phase) {
  var ang = Math.atan2(bullet.vy || 0, bullet.vx || 1);
  var px = -Math.sin(ang);
  var py = Math.cos(ang);
  var trail = bullet.trail;
  var n = trail ? trail.length : 0;
  ctx.beginPath();
  if (!n) {
    var back = (bullet.r || 4) * 3.2;
    ctx.moveTo(bullet.x - Math.cos(ang) * back, bullet.y - Math.sin(ang) * back);
  } else {
    for (var i = n - 1; i >= 0; i -= 1) {
      var wave = amp ? Math.sin(time * 16 - i * 0.85 + phase) * amp : 0;
      var x = trail[i].x + px * wave;
      var y = trail[i].y + py * wave;
      if (i === n - 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  var head = amp ? Math.sin(time * 16 + phase) * amp : 0;
  ctx.lineTo(bullet.x + px * head, bullet.y + py * head);
  ctx.strokeStyle = style;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawBullet(ctx, bullet, view, time) {
  if (!bullet) return;
  var core = bullet.colorCore || '#fff4bd';
  var trail = bullet.colorTrail || 'rgba(240, 207, 136, 0.28)';
  var headR = (bullet.r || 4) * (bullet.isVanguard ? 4.4 : 2.7);
  if (bullet.isArcWelder) {
    var x1;
    var y1;
    var ang = Math.atan2(bullet.vy || 0, bullet.vx || 1);
    if (bullet.trail && bullet.trail.length) {
      x1 = bullet.trail[0].x;
      y1 = bullet.trail[0].y;
    } else {
      var back = (bullet.r || 4) * 5;
      x1 = bullet.x - Math.cos(ang) * back;
      y1 = bullet.y - Math.sin(ang) * back;
    }
    var depth = view.reduced ? 1 : (view.depth > 2 ? 2 : view.depth);
    drawBolt(ctx, x1, y1, bullet.x, bullet.y, 0.95, depth, core, view.key);
  } else if (bullet.isVanguard) {
    traceBeam(ctx, bullet, (bullet.r || 6) * 2.4, trail, 0.55, 0, time, 0);
    traceBeam(ctx, bullet, (bullet.r || 6) * 0.7, core, 0.95, 0, time, 0);
    if (!view.key) {
      traceBeam(ctx, bullet, 1.4, '#e9fbff', 0.8, 3.4, time, 0);
      traceBeam(ctx, bullet, 1.4, '#e9fbff', 0.55, 3.4, time, Math.PI);
    }
  } else {
    traceBeam(ctx, bullet, (bullet.r || 4) * 2.2, trail, 0.9, 0, time, 0);
    traceBeam(ctx, bullet, (bullet.r || 4) * 1.05, core, 1, 0, time, 0);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, Math.max(1.6, (bullet.r || 4) * 0.55), 0, TAU);
  ctx.fill();
  drawGlow(ctx, bullet.x, bullet.y, headR, core, bullet.isVanguard ? 0.95 : 0.82);
  if (!view.key && bullet.trail && bullet.trail.length) {
    var tail = bullet.trail[0];
    drawGlow(ctx, tail.x, tail.y, (bullet.r || 4) * 1.4, core, 0.28);
  }
}

export function drawPlayerBullets(ctx) {
  if (!ctx || !rt.state || !rt.state.bullets) return;
  var view = syncBud();
  var time = rt.state.waveTime || 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var list = rt.state.bullets;
  for (var i = 0; i < list.length; i += 1) drawBullet(ctx, list[i], view, time);
  ctx.restore();
}

function disc(ctx, x, y, r) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

function strokeBox(ctx, x, y, rot, hw, hh) {
  var c = Math.cos(rot);
  var s = Math.sin(rot);
  var x0 = x + (-hw) * c - (-hh) * s;
  var y0 = y + (-hw) * s + (-hh) * c;
  var x1 = x + hw * c - (-hh) * s;
  var y1 = y + hw * s + (-hh) * c;
  var x2 = x + hw * c - hh * s;
  var y2 = y + hw * s + hh * c;
  var x3 = x + (-hw) * c - hh * s;
  var y3 = y + (-hw) * s + hh * c;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.stroke();
}

export function drawEnemyBullets(ctx) {
  if (!ctx || !rt.state || !rt.state.enemyBullets) return;
  var view = syncBud();
  var time = rt.state.waveTime || 0;
  var list = rt.state.enemyBullets;
  var n = list.length;
  var i;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.8;
  var pass;
  for (pass = 0; pass < 2; pass += 1) {
    var wantGlow = pass === 0;
    ctx.beginPath();
    var trailCount = 0;
    var trailColor = wantGlow ? '#ff5533' : '#75d1b0';
    var trailWidth = 2;
    for (i = 0; i < n; i += 1) {
      var eb = list[i];
      if (!eb || !!eb.glow !== wantGlow) continue;
      var vx = eb.vx || 0;
      var vy = eb.vy || 0;
      var spd = vx * vx + vy * vy;
      if (!(spd > 64)) continue;
      var inv = 11 / Math.sqrt(spd);
      if (!trailCount) {
        trailColor = eb.color || trailColor;
        trailWidth = Math.max(2, (eb.r || 4) * 0.55);
      }
      ctx.moveTo(eb.x, eb.y);
      ctx.lineTo(eb.x - vx * inv, eb.y - vy * inv);
      trailCount += 1;
    }
    if (trailCount) {
      ctx.strokeStyle = trailColor;
      ctx.lineWidth = trailWidth;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#140c09';
  ctx.beginPath();
  for (i = 0; i < n; i += 1) {
    var dark = list[i];
    if (!dark) continue;
    disc(ctx, dark.x, dark.y, (dark.r || 4) + 2.1);
  }
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  beginGlowBatch();
  for (i = 0; i < n; i += 1) {
    var glowB = list[i];
    if (!glowB) continue;
    var gr = glowB.r || 4;
    var hostile = !!glowB.glow;
    var glow = glowB.glowColor || (hostile ? '#ff4d2e' : '#7cf0c8');
    drawGlow(ctx, glowB.x, glowB.y, gr + (hostile ? 16 : 12), glow, hostile ? 0.9 : 0.8);
  }
  endGlowBatch();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  for (i = 0; i < n; i += 1) {
    var body = list[i];
    if (!body) continue;
    var br = body.r || 4;
    var bodyHostile = !!body.glow;
    var color = body.color || (bodyHostile ? '#ff5533' : '#75d1b0');
    var pulse = view.reduced ? 1 : (0.84 + 0.16 * (0.5 + 0.5 * Math.sin(time * 6 + i * 1.3)));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(body.x, body.y, br, 0, TAU);
    ctx.fill();
    ctx.fillStyle = bodyHostile ? '#fff0dd' : '#ffd36b';
    ctx.beginPath();
    ctx.arc(body.x, body.y, Math.max(1.4, br * 0.42 * pulse), 0, TAU);
    ctx.fill();
    if (bodyHostile) {
      var rot = view.reduced ? 0.6 : time * 2.4 + i;
      ctx.strokeStyle = '#ffe1cc';
      ctx.lineWidth = 1.35;
      strokeBox(ctx, body.x, body.y, rot, br + 3, br * 0.42);
    }
    if (view.contrast) {
      ctx.beginPath();
      ctx.arc(body.x, body.y, br + 1.4, 0, TAU);
      ctx.strokeStyle = '#120c09';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  for (i = 0; i < n; i += 1) {
    var ring = list[i];
    if (!ring) continue;
    disc(ctx, ring.x, ring.y, (ring.r || 4) + (view.contrast ? 4.2 : 2.6));
  }
  ctx.strokeStyle = view.contrast ? '#ffffff' : '#120c09';
  ctx.lineWidth = view.contrast ? 3.2 : 2;
  ctx.stroke();
  ctx.restore();
}

function strokeRing(ctx, x, y, radius, width, style, alpha, wobble, time) {
  if (!(radius > 0.5) || alpha <= 0.02) return;
  var seg = wobble ? 28 : 32;
  ctx.beginPath();
  for (var i = 0; i <= seg; i += 1) {
    var a = (i / seg) * TAU;
    var rr = radius;
    if (wobble) rr += Math.sin(a * 6 + time * 8) * wobble;
    var px = x + Math.cos(a) * rr;
    var py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = style;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawShockRings(ctx) {
  if (!ctx || !rt.state || !rt.state.shockRings) return;
  var view = syncBud();
  var time = rt.renderTime || 0;
  var list = rt.state.shockRings;
  ctx.save();
  ctx.lineCap = 'round';
  for (var i = 0; i < list.length; i += 1) {
    var ring = list[i];
    if (!ring) continue;
    var denom = ring.maxLife || 0.001;
    var life = ring.life / denom;
    if (life < 0) life = 0;
    if (life > 1) life = 1;
    var progress = 1 - life;
    var radius = ring.r + ((ring.maxR || ring.r) - ring.r) * progress;
    var color = ring.color || '#75d1b0';
    var wobble = view.reduced ? 0 : 2.4;
    strokeRing(ctx, ring.x, ring.y, radius, 6.5, color, life * 0.28, wobble, time + i);
    strokeRing(ctx, ring.x, ring.y, radius * 0.94, 1.7, '#fffaf0', life * 0.9, 0, time);
    if (!view.key) {
      var pips = 6;
      for (var p = 0; p < pips; p += 1) {
        var a = (p / pips) * TAU + time;
        drawGlow(ctx, ring.x + Math.cos(a) * radius, ring.y + Math.sin(a) * radius, 10, color, life * 0.45);
      }
    }
  }
  ctx.restore();
}

export function drawLightningArcs(ctx) {
  if (!ctx) return;
  var view = syncBud();
  var depth = view.reduced ? 1 : view.depth;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (rt.state && rt.state.lightningArcs) {
    var list = rt.state.lightningArcs;
    for (var i = 0; i < list.length; i += 1) {
      var arc = list[i];
      if (!arc) continue;
      var alpha = arc.maxLife ? arc.life / arc.maxLife : 1;
      if (alpha < 0) alpha = 0;
      if (alpha > 1) alpha = 1;
      drawBolt(ctx, arc.x1, arc.y1, arc.x2, arc.y2, alpha, depth, arc.color || '#5be7ff', view.key);
    }
  }
  if (bolts) {
    for (var j = 0; j < BOLT_MAX; j += 1) {
      var bolt = bolts[j];
      if (!bolt.active) continue;
      var ba = bolt.maxLife ? bolt.life / bolt.maxLife : 1;
      if (ba < 0) ba = 0;
      drawBolt(ctx, bolt.x1, bolt.y1, bolt.x2, bolt.y2, ba, depth, bolt.color, view.key);
    }
  }
  ctx.restore();
}

export function drawArtilleryTelegraphs(ctx) {
  if (!ctx || !rt.state || !rt.state.artilleryTargets) return;
  var view = syncBud();
  var time = rt.state.waveTime || 0;
  var list = rt.state.artilleryTargets;
  for (var i = 0; i < list.length; i += 1) {
    var at = list[i];
    if (!at || at.state !== 'warning') continue;
    var maxT = at.maxTimer || 1;
    var remain = at.timer > 0 ? at.timer / maxT : 0;
    if (remain < 0) remain = 0;
    if (remain > 1) remain = 1;
    var urgent = at.timer <= 0.2;
    var pulse = view.reduced ? 0.9 : (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 9)));
    var ringA = (0.45 + (1 - remain) * 0.5).toFixed(3);
    ctx.save();
    ctx.beginPath();
    ctx.arc(at.x, at.y, at.r, 0, TAU);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = urgent ? 'rgba(255,255,255,0.96)' : ('rgba(237,104,66,' + ringA + ')');
    ctx.lineWidth = (urgent ? 2.6 : 1.8) + (view.contrast ? 1.3 : 0);
    ctx.stroke();
    ctx.setLineDash([]);
    var fillR = Math.max(4, at.r * remain);
    ctx.beginPath();
    ctx.arc(at.x, at.y, fillR, 0, TAU);
    ctx.fillStyle = 'rgba(223,64,40,' + (0.16 + (1 - remain) * 0.42).toFixed(3) + ')';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(at.x - 8, at.y);
    ctx.lineTo(at.x + 8, at.y);
    ctx.moveTo(at.x, at.y - 8);
    ctx.lineTo(at.x, at.y + 8);
    ctx.strokeStyle = urgent ? 'rgba(255,255,255,0.96)' : 'rgba(237,104,66,0.92)';
    ctx.lineWidth = view.contrast ? 2.4 : 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(at.x, at.y, 3.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,214,150,' + pulse.toFixed(3) + ')';
    ctx.fill();
    ctx.restore();
  }
}

export function drawMoltenZones(ctx) {
  if (!ctx || !rt.state || !rt.state.artilleryTargets) return;
  var view = syncBud();
  var time = view.reduced ? 0 : (rt.state.waveTime || 0);
  var list = rt.state.artilleryTargets;
  for (var i = 0; i < list.length; i += 1) {
    var at = list[i];
    if (!at || at.state !== 'molten') continue;
    var fade = at.maxTimer ? at.timer / at.maxTimer : 1;
    if (fade < 0) fade = 0;
    if (fade > 1) fade = 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(at.x, at.y, at.r, 0, TAU);
    ctx.fillStyle = 'rgba(150,42,16,' + (fade * 0.4).toFixed(3) + ')';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(at.x, at.y, at.r * 0.62, 0, TAU);
    ctx.fillStyle = 'rgba(245,120,28,' + (fade * 0.42).toFixed(3) + ')';
    ctx.fill();
    var blobs = view.reduced ? 3 : 5;
    var spin = time * 1.5;
    for (var k = 0; k < blobs; k += 1) {
      var a = spin + k * (TAU / blobs);
      var rad = at.r * (0.22 + 0.4 * (0.5 + 0.5 * Math.sin(time * 2.4 + k)));
      ctx.beginPath();
      ctx.arc(at.x + Math.cos(a) * rad, at.y + Math.sin(a) * rad * 0.82, 2.4 + (k % 3), 0, TAU);
      ctx.fillStyle = 'rgba(255,214,120,' + (fade * 0.7).toFixed(3) + ')';
      ctx.fill();
    }
    if (!view.reduced) {
      ctx.lineWidth = 1.2;
      for (var w = 0; w < 3; w += 1) {
        var wx = at.x + Math.sin(time * 1.8 + w * 2.1) * at.r * 0.38;
        var rise = (time * 28 + w * 14) % (at.r * 0.85);
        ctx.strokeStyle = 'rgba(255,176,90,' + (fade * 0.35).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(wx, at.y + 4);
        ctx.lineTo(wx + Math.sin(time + w) * 3, at.y - rise);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(at.x, at.y, at.r, 0, TAU);
    ctx.strokeStyle = 'rgba(255,150,60,' + (fade * 0.8).toFixed(3) + ')';
    ctx.lineWidth = view.contrast ? 2.6 : 1.6;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawPlasmaZones(ctx) {
  if (!ctx || !rt.state || !rt.state.plasmaZones) return;
  var view = syncBud();
  var time = view.reduced ? 0 : (rt.state.waveTime || 0);
  var list = rt.state.plasmaZones;
  for (var i = 0; i < list.length; i += 1) {
    var pz = list[i];
    if (!pz) continue;
    var fade = pz.maxTimer ? pz.timer / pz.maxTimer : 1;
    if (fade < 0) fade = 0;
    if (fade > 1) fade = 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pz.x, pz.y, pz.r, 0, TAU);
    if (!view.key) drawGlow(ctx, pz.x, pz.y, pz.r, '#ff4d2e', fade * 0.45);
    ctx.fillStyle = 'rgba(255,77,46,' + (fade * 0.34).toFixed(3) + ')';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pz.x, pz.y, pz.r * 0.62, 0, TAU);
    ctx.fillStyle = 'rgba(255,170,50,' + (fade * 0.42).toFixed(3) + ')';
    ctx.fill();
    var motes = view.reduced ? 2 : 3;
    for (var m = 0; m < motes; m += 1) {
      var a = time * 1.8 + m * (TAU / motes);
      var rad = pz.r * 0.45;
      ctx.beginPath();
      ctx.arc(pz.x + Math.cos(a) * rad, pz.y + Math.sin(a) * rad, 3, 0, TAU);
      ctx.fillStyle = 'rgba(255,236,190,' + (fade * 0.75).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawVortices(ctx) {
  if (!ctx || !rt.state || !rt.state.vortices) return;
  var view = syncBud();
  var time = rt.state.waveTime || 0;
  var list = rt.state.vortices;
  for (var i = 0; i < list.length; i += 1) {
    var v = list[i];
    if (!v) continue;
    var fade = v.life / (v.maxLife || 2.5);
    if (fade < 0) fade = 0;
    if (fade > 1) fade = 1;
    var vr = v.r || 160;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(view.reduced ? 0.4 : (time * 1.6) % TAU);
    ctx.save();
    ctx.scale(1, 0.37);
    ctx.beginPath();
    ctx.arc(0, 0, vr * 0.92, 0, TAU);
    ctx.strokeStyle = 'rgba(181,95,230,' + (fade * 0.45).toFixed(3) + ')';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    if (!view.key) drawGlow(ctx, 0, 0, vr * 0.5, '#9d4edd', fade * 0.35);
    ctx.strokeStyle = 'rgba(181,95,230,' + (fade * 0.55).toFixed(3) + ')';
    ctx.lineWidth = 2;
    var arms = 3;
    for (var arm = 0; arm < arms; arm += 1) {
      var baseA = arm * (TAU / 3);
      ctx.beginPath();
      for (var step = 0; step < 16; step += 1) {
        var stepR = (step / 16) * vr;
        var stepA = baseA + (step / 16) * 2.3;
        var sx = Math.cos(stepA) * stepR;
        var sy = Math.sin(stepA) * stepR * 0.72;
        if (step === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    if (!view.reduced) {
      ctx.strokeStyle = 'rgba(230,210,255,' + (fade * 0.35).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      for (var s = 0; s < 4; s += 1) {
        var sa = time * 2.2 + s * 1.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(sa) * vr * 0.9, Math.sin(sa) * vr * 0.9);
        ctx.quadraticCurveTo(Math.cos(sa + 0.5) * vr * 0.45, Math.sin(sa + 0.4) * vr * 0.45, Math.cos(sa + 0.9) * 16, Math.sin(sa + 0.9) * 16);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(0, 0, vr * 0.72, 0, TAU);
    ctx.strokeStyle = 'rgba(6,2,12,' + (fade * 0.72).toFixed(3) + ')';
    ctx.lineWidth = 12;
    ctx.stroke();
    var coreR = 14 + (view.reduced ? 0 : Math.sin(time * 8) * 2);
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, TAU);
    ctx.fillStyle = '#07030d';
    ctx.fill();
    ctx.strokeStyle = '#c77dff';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!view.key) drawGlow(ctx, 0, 0, 22, '#c77dff', fade * 0.7);
    ctx.restore();
  }
}

export function drawOpticalFlashes(ctx) {
  if (!ctx || !rt.state || !rt.state.opticalFlashes) return;
  var view = syncBud();
  var list = rt.state.opticalFlashes;
  for (var i = 0; i < list.length; i += 1) {
    var f = list[i];
    if (!f) continue;
    var alpha = f.maxLife ? f.life / f.maxLife : 1;
    if (alpha < 0) alpha = 0;
    if (alpha > 1) alpha = 1;
    if (!view.key) drawGlow(ctx, f.x, f.y, (f.r || 8) * 1.6, f.color || '#fff4bd', alpha * 0.8);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(Math.atan2(f.ny || 0, f.nx || 1));
    ctx.scale(0.35, 1.4);
    ctx.beginPath();
    ctx.arc(0, 0, f.r || 8, 0, TAU);
    ctx.fillStyle = f.color || '#fff4bd';
    ctx.globalAlpha = alpha * 0.85;
    ctx.fill();
    ctx.restore();
  }
}
