import { TAU } from '../config.js';
import { drainFxEvents } from '../core/fx-events.js';
import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { fxRand, fxRandSigned } from './fx-rand.js';
import { clearVisualBolts, spawnVisualBolt, stepVisualBolts } from './projectiles.js';
import { getBudget } from './quality.js';
import { drawGlow } from './sprites.js';
import { renderDamageNumbers } from './overlay.js';

var POOL_MAX = 600;
var NUM_MAX = 32;
var GHOST_MAX = 8;
var MARK_MAX = 10;
var HIT_MAX = 24;
var CRIT_MAX = 24;

var KIND_SPARK = 0;
var KIND_SMOKE = 1;
var KIND_EMBER = 2;
var KIND_SHARD = 3;
var KIND_FLASH = 4;
var KIND_RING = 5;
var KIND = { spark: 0, smoke: 1, ember: 2, shard: 3, flash: 4, ring: 5 };
var DEFAULT_COLOR = ['#ffd36b', '#5a5148', '#ffb15a', '#c4b39a', '#fff6e4', '#ffd36b'];
var DEFAULT_LIFE = [0.18, 0.45, 0.45, 0.35, 0.08, 0.22];
var FONT_NUM = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
var FONT_CRIT = '700 18px ui-monospace, SFMono-Regular, Consolas, monospace';
var EMPTY = {};

var PRESETS = {
  explosionLarge: [
    { kind: 'flash', count: 1, radius: 90, color: '#fff6e8', life: 0.08 },
    { kind: 'smoke', count: 12, speed: 55, color: '#5c5148', life: 0.45, size: 12 },
    { kind: 'spark', count: 22, speed: 300, color: '#ff6a3d', life: 0.20 },
    { kind: 'ember', count: 7, speed: 40, color: '#ffd36b', life: 0.45 },
    { kind: 'ring', count: 1, maxRadius: 130, color: '#ffd36b', life: 0.28, size: 2 }
  ],
  deathSmall: [
    { kind: 'flash', count: 1, radius: 26, color: '#fff4bd', life: 0.07 },
    { kind: 'spark', count: 7, speed: 210, color: '#ff6a3d', life: 0.18 },
    { kind: 'shard', count: 3, speed: 130, color: '#8d7861', life: 0.35 },
    { kind: 'ring', count: 1, maxRadius: 34, color: '#ff6a3d', life: 0.18, size: 1.4 }
  ],
  deathRusher: [
    { kind: 'flash', count: 1, radius: 22, color: '#ffe7b0', life: 0.06 },
    { kind: 'spark', count: 8, speed: 320, color: '#e1a644', life: 0.18 },
    { kind: 'shard', count: 2, speed: 180, color: '#c4b39a', life: 0.3 }
  ],
  deathArtillery: [
    { kind: 'flash', count: 1, radius: 40, color: '#fff1d2', life: 0.08 },
    { kind: 'smoke', count: 6, speed: 48, color: '#5a483c', life: 0.45, size: 11 },
    { kind: 'spark', count: 10, speed: 220, color: '#ff8a3d', life: 0.20 },
    { kind: 'shard', count: 4, speed: 140, color: '#d69e2e', life: 0.40 },
    { kind: 'ember', count: 4, speed: 36, color: '#ffb15a', life: 0.45 }
  ],
  deathBrute: [
    { kind: 'flash', count: 1, radius: 46, color: '#fff0dc', life: 0.08 },
    { kind: 'smoke', count: 4, speed: 45, color: '#5a463c', life: 0.42, size: 11 },
    { kind: 'spark', count: 10, speed: 220, color: '#ff6a3d', life: 0.18 },
    { kind: 'shard', count: 5, speed: 150, color: '#bd573f', life: 0.40 },
    { kind: 'ring', count: 1, maxRadius: 70, color: '#ed6842', life: 0.24, size: 2 }
  ],
  deathElite: [
    { kind: 'flash', count: 1, radius: 54, color: '#f4fffb', life: 0.08 },
    { kind: 'smoke', count: 5, speed: 52, color: '#4d5854', life: 0.45, size: 12 },
    { kind: 'spark', count: 12, speed: 260, color: '#7cf0c8', life: 0.20 },
    { kind: 'shard', count: 5, speed: 150, color: '#9dbeb0', life: 0.42 },
    { kind: 'ember', count: 4, speed: 40, color: '#c8fff0', life: 0.45 },
    { kind: 'ring', count: 1, maxRadius: 130, color: '#7cf0c8', life: 0.45, wobble: 2.5, size: 2 }
  ],
  deathTitan: [
    { kind: 'flash', count: 1, radius: 96, color: '#fff6e8', life: 0.08 },
    { kind: 'smoke', count: 14, speed: 65, color: '#5c5148', life: 0.48, size: 14 },
    { kind: 'spark', count: 22, speed: 320, color: '#ff6a3d', life: 0.22 },
    { kind: 'ember', count: 8, speed: 45, color: '#ffd36b', life: 0.45 },
    { kind: 'shard', count: 8, speed: 170, color: '#e69535', life: 0.42 },
    { kind: 'ring', count: 1, maxRadius: 200, color: '#ffd36b', life: 0.45, wobble: 3, size: 2.4 }
  ],
  core: [
    { kind: 'flash', count: 1, radius: 78, color: '#fff8ea', life: 0.08 },
    { kind: 'smoke', count: 8, speed: 55, color: '#5c5148', life: 0.45, size: 13 },
    { kind: 'spark', count: 16, speed: 280, color: '#ff9a3c', life: 0.22 },
    { kind: 'ember', count: 6, speed: 40, color: '#ffd36b', life: 0.45 },
    { kind: 'ring', count: 1, maxRadius: 130, color: '#f5a623', life: 0.28, size: 2 }
  ],
  barrel: [
    { kind: 'flash', count: 1, radius: 60, color: '#fff1e4', life: 0.08 },
    { kind: 'smoke', count: 7, speed: 48, color: '#5a4038', life: 0.45, size: 12 },
    { kind: 'spark', count: 11, speed: 230, color: '#ff4422', life: 0.20 },
    { kind: 'ember', count: 7, speed: 36, color: '#ffaa33', life: 0.50 },
    { kind: 'ring', count: 1, maxRadius: 95, color: '#ff6633', life: 0.26, size: 2 }
  ],
  barrelKicked: [
    { kind: 'flash', count: 1, radius: 72, color: '#fff6ea', life: 0.08 },
    { kind: 'smoke', count: 8, speed: 58, color: '#5a4038', life: 0.48, size: 13 },
    { kind: 'spark', count: 15, speed: 280, color: '#ff4422', life: 0.22 },
    { kind: 'ember', count: 8, speed: 40, color: '#ffaa33', life: 0.50 },
    { kind: 'ring', count: 1, maxRadius: 115, color: '#ff6633', life: 0.28, size: 2.2 }
  ],
  mortar: [
    { kind: 'flash', count: 1, radius: 48, color: '#fff0dc', life: 0.07 },
    { kind: 'smoke', count: 6, speed: 48, color: '#5c463c', life: 0.45, size: 11 },
    { kind: 'spark', count: 10, speed: 200, color: '#ed6842', life: 0.18 },
    { kind: 'ember', count: 4, speed: 30, color: '#ffb15a', life: 0.45 },
    { kind: 'ring', count: 1, maxRadius: 72, color: '#ed6842', life: 0.22, size: 1.8 }
  ],
  emp: [
    { kind: 'flash', count: 1, radius: 64, color: '#f3fdff', life: 0.08 },
    { kind: 'spark', count: 12, speed: 240, color: '#5be7ff', life: 0.20 },
    { kind: 'spark', count: 5, speed: 120, color: '#ffffff', life: 0.15 },
    { kind: 'ember', count: 4, speed: 40, color: '#bdf4ff', life: 0.35 }
  ],
  spire: [
    { kind: 'flash', count: 1, radius: 80, color: '#f4feff', life: 0.08 },
    { kind: 'smoke', count: 5, speed: 40, color: '#3d4a50', life: 0.45, size: 11 },
    { kind: 'spark', count: 18, speed: 340, color: '#5be7ff', life: 0.22 },
    { kind: 'ember', count: 6, speed: 50, color: '#d6fbff', life: 0.45 },
    { kind: 'ring', count: 1, maxRadius: 190, color: '#5be7ff', life: 0.35, size: 2 }
  ],
  dashDust: [
    { kind: 'ring', count: 1, maxRadius: 26, color: '#d9c7a4', life: 0.22, size: 1.5 },
    { kind: 'smoke', count: 3, speed: 36, color: '#6a5b48', life: 0.35, size: 6 },
    { kind: 'shard', count: 2, speed: 60, color: '#8d7b62', life: 0.25 }
  ],
  playerHit: [
    { kind: 'flash', count: 1, radius: 18, color: '#ff8a62', life: 0.06 },
    { kind: 'spark', count: 6, speed: 150, color: '#ed6842', life: 0.18 }
  ],
  pillar: [
    { kind: 'flash', count: 1, radius: 28, color: '#fff1c4', life: 0.08 },
    { kind: 'spark', count: 10, speed: 78, color: '#ffd36b', life: 0.45, up: 1 },
    { kind: 'ring', count: 1, maxRadius: 54, color: '#ffd36b', life: 0.28, size: 1.6 },
    { kind: 'ring', count: 1, maxRadius: 28, color: '#fff6d8', life: 0.18, size: 1.2 }
  ],
  pillarMint: [
    { kind: 'flash', count: 1, radius: 28, color: '#e7fff6', life: 0.08 },
    { kind: 'spark', count: 10, speed: 78, color: '#7cf0c8', life: 0.45, up: 1 },
    { kind: 'ring', count: 1, maxRadius: 54, color: '#7cf0c8', life: 0.28, size: 1.6 }
  ]
};

var pool = null;
var numbers = null;
var ghosts = null;
var marks = null;
var cursor = 0;
var activeCount = 0;
var live = [];
var liveN = 0;
var ghostCursor = 0;
var markCursor = 0;

var frameCap = 260;
var frameKey = false;
var frameTier = 'high';
var frameReduced = false;
var frameContrast = false;
var frameLow = false;
var frameScale = 1;
var frameReady = false;
var watchState = null;
var seenLevel = 1;
var lastCrits = 0;

var flashColor = '#5be7ff';
var flashAlpha = 0;
var flashLife = 0;
var flashMax = 0.12;
var lastFlashAt = -1;
var flashWindowStart = -1;
var flashesInWindow = 0;

var hitN = 0;
var critN = 0;
var spawnedN = 0;
var hitXs = new Float32Array(HIT_MAX);
var hitYs = new Float32Array(HIT_MAX);
var hitSlot = new Int16Array(HIT_MAX);
var hitKill = new Uint8Array(HIT_MAX);
var critXs = new Float32Array(CRIT_MAX);
var critYs = new Float32Array(CRIT_MAX);
var spawnedIdx = new Int16Array(40);

function blankParticle() {
  return {
    active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 0.3, size: 2, rot: 0, vrot: 0,
    gravity: 0, drag: 1, bounce: 0, floor: 0,
    radius: 4, maxRadius: 20, grow: 0, wobble: 0,
    color: '#fff6e4', seed: 0
  };
}

function blankNumber() {
  return { active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 0.68, value: 0, crit: false, text: '', owner: null };
}

function ensurePools() {
  var i;
  if (!pool) {
    pool = new Array(POOL_MAX);
    for (i = 0; i < POOL_MAX; i += 1) pool[i] = blankParticle();
  }
  if (!numbers) {
    numbers = new Array(NUM_MAX);
    for (i = 0; i < NUM_MAX; i += 1) numbers[i] = blankNumber();
  }
  if (!ghosts) {
    ghosts = new Array(GHOST_MAX);
    for (i = 0; i < GHOST_MAX; i += 1) ghosts[i] = { active: false, x: 0, y: 0, aim: 0, life: 0, maxLife: 0.3 };
  }
  if (!marks) {
    marks = new Array(MARK_MAX);
    for (i = 0; i < MARK_MAX; i += 1) marks[i] = { active: false, x: 0, y: 0, nx: 1, ny: 0, life: 0, maxLife: 0.16 };
  }
}

function clearVisuals() {
  var i;
  if (pool) {
    for (i = 0; i < POOL_MAX; i += 1) pool[i].active = false;
  }
  activeCount = 0;
  liveN = 0;
  cursor = 0;
  if (numbers) {
    for (i = 0; i < NUM_MAX; i += 1) {
      numbers[i].active = false;
      numbers[i].owner = null;
    }
  }
  if (ghosts) {
    for (i = 0; i < GHOST_MAX; i += 1) ghosts[i].active = false;
  }
  if (marks) {
    for (i = 0; i < MARK_MAX; i += 1) marks[i].active = false;
  }
  flashLife = 0;
  flashAlpha = 0;
  lastFlashAt = -1;
  flashWindowStart = -1;
  flashesInWindow = 0;
  clearVisualBolts();
}

function enforceCap() {
  if (!pool || liveN <= frameCap) return;
  while (liveN > frameCap && liveN > 0) killLiveAt(0);
}

function killLiveAt(at) {
  var idx = live[at];
  var p = pool[idx];
  if (p) p.active = false;
  liveN -= 1;
  if (at !== liveN) live[at] = live[liveN];
  activeCount = liveN;
}

function noteClaim(i) {
  var p = pool[i];
  if (!p.active) {
    live[liveN] = i;
    liveN += 1;
    activeCount = liveN;
  }
  return p;
}

function takeSlot(cap) {
  var capN = cap > POOL_MAX ? POOL_MAX : cap;
  if (capN < 1) capN = 1;
  var n;
  var i;
  if (activeCount >= capN) {
    for (n = 0; n < POOL_MAX; n += 1) {
      i = (cursor + n) % POOL_MAX;
      if (pool[i].active) {
        cursor = (i + 1) % POOL_MAX;
        return pool[i];
      }
    }
  }
  for (n = 0; n < POOL_MAX; n += 1) {
    i = (cursor + n) % POOL_MAX;
      if (!pool[i].active) {
        cursor = (i + 1) % POOL_MAX;
        return noteClaim(i);
      }
  }
  cursor = (cursor + 1) % POOL_MAX;
  return pool[cursor];
}

function scaledCount(n) {
  var count = n || 1;
  if (count <= 1) return count;
  var c = Math.round(count * frameScale);
  if (c < 1) c = 1;
  return c;
}

export function emitFx(kindName, x, y, opts, tint) {
  ensurePools();
  var kind = KIND[kindName];
  if (kind == null) return;
  if (typeof x !== 'number' || typeof y !== 'number' || x !== x || y !== y) return;
  var p = takeSlot(frameCap > 0 ? frameCap : 260);
  if (!p) return;
  var o = opts || EMPTY;
  var speed = o.speed || 120;
  var sp = speed * (0.45 + fxRand() * 0.75);
  var ang = fxRand() * TAU;
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.seed = (fxRand() * 1000) | 0;
  p.rot = fxRand() * TAU;
  p.vrot = fxRandSigned() * (kind === KIND_SHARD ? 9 : 2);
  p.wobble = o.wobble || 0;
  p.grow = 0;
  p.radius = o.radius || 16;
  p.maxRadius = o.maxRadius || 40;
  p.size = o.size || (kind === KIND_SMOKE ? 8 + fxRand() * 8 : kind === KIND_SHARD ? 3.2 + fxRand() * 3 : 2);
  p.color = (tint && kind === KIND_SHARD) ? tint : (o.color || DEFAULT_COLOR[kind]);
  var life = o.life || DEFAULT_LIFE[kind];
  p.life = life;
  p.maxLife = life > 0 ? life : 0.2;
  p.floor = y + 8 + fxRand() * 16;
  p.bounce = 0;
  p.drag = 1.5;
  p.gravity = 0;
  if (o.up) {
    p.vx = fxRandSigned() * sp * 0.28;
    p.vy = -Math.abs(sp);
  } else {
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
  }
  if (kind === KIND_SPARK) {
    p.gravity = 480;
    p.bounce = 0.42;
    p.drag = 2.2;
  } else if (kind === KIND_SMOKE) {
    p.gravity = -18;
    p.drag = 1.1;
    p.grow = 20;
    p.vx *= 0.35;
    p.vy = -Math.abs(sp) * 0.28;
  } else if (kind === KIND_EMBER) {
    p.gravity = -30;
    p.drag = 0.6;
    p.vx *= 0.35;
    p.vy = -Math.abs(sp) * 0.45;
  } else if (kind === KIND_SHARD) {
    p.gravity = 700;
    p.bounce = 0.48;
    p.drag = 1;
  } else {
    p.vx = 0;
    p.vy = 0;
    if (kind === KIND_RING) p.radius = 2;
  }
  if (frameReduced) {
    p.bounce = 0;
    p.gravity *= 0.2;
    p.vrot *= 0.15;
  }
  p.active = true;
}

function emitPreset(name, x, y, tint) {
  var list = PRESETS[name];
  if (!list) return;
  for (var i = 0; i < list.length; i += 1) {
    var item = list[i];
    var count = scaledCount(item.count || 1);
    for (var n = 0; n < count; n += 1) {
      emitFx(item.kind, x, y, item, item.kind === 'shard' ? tint : '');
    }
  }
}

function emitBurst(name, x, y, tint, scale) {
  if (!(scale > 0) || scale === 1) {
    emitPreset(name, x, y, tint);
    return;
  }
  var list = PRESETS[name];
  if (!list) return;
  for (var i = 0; i < list.length; i += 1) {
    var item = list[i];
    var copy = {
      kind: item.kind,
      count: item.count,
      radius: item.radius ? item.radius * scale : item.radius,
      speed: item.speed ? item.speed * scale : item.speed,
      size: item.size ? item.size * scale : item.size,
      maxRadius: item.maxRadius ? item.maxRadius * scale : item.maxRadius,
      color: tint || item.color,
      life: item.life,
      wobble: item.wobble
    };
    var count = scaledCount(copy.count || 1);
    for (var n = 0; n < count; n += 1) {
      emitFx(copy.kind, x, y, copy, copy.kind === 'shard' ? tint : '');
    }
  }
}

function emitHitSparks(x, y, crit) {
  var n = (frameLow || frameReduced) ? 3 : (3 + ((fxRand() * 4) | 0));
  var color = crit ? '#ffd36b' : '#fff1c9';
  emitFx('flash', x, y, { radius: crit ? 26 : 13, color: color, life: 0.07 });
  for (var i = 0; i < n; i += 1) {
    emitFx('spark', x, y, { speed: crit ? 280 : 180, color: color, life: crit ? 0.20 : 0.16 });
  }
}

function noteSpawned(slot) {
  if (slot < 0 || spawnedN >= spawnedIdx.length) return;
  spawnedIdx[spawnedN] = slot;
  spawnedN += 1;
}

function noteHit(x, y, slot, kill) {
  if (slot < 0 || hitN >= HIT_MAX) return;
  hitXs[hitN] = x;
  hitYs[hitN] = y;
  hitSlot[hitN] = slot;
  hitKill[hitN] = kill ? 1 : 0;
  hitN += 1;
}

function noteCrit(x, y) {
  if (critN >= CRIT_MAX) return;
  critXs[critN] = x;
  critYs[critN] = y;
  critN += 1;
}

function allocNumber() {
  var best = 0;
  var bestLife = 1e9;
  for (var i = 0; i < NUM_MAX; i += 1) {
    if (!numbers[i].active) return i;
    if (numbers[i].life < bestLife) {
      bestLife = numbers[i].life;
      best = i;
    }
  }
  return best;
}

function pushNumber(owner, dmg, x, y) {
  if (!(dmg > 0.5)) return -1;
  var fx = owner && owner.fx;
  if (fx && fx.dmgWindow > 0 && fx.dmgSlot >= 0 && fx.dmgSlot < NUM_MAX) {
    var prev = numbers[fx.dmgSlot];
    if (prev && prev.active && prev.owner === owner) {
      prev.value += dmg;
      prev.text = '';
      prev.x = x;
      prev.y = y;
      if (prev.life < 0.48) prev.life = 0.48;
      fx.dmgWindow = 0.12;
      noteSpawned(fx.dmgSlot);
      return fx.dmgSlot;
    }
  }
  var slot = allocNumber();
  var n = numbers[slot];
  n.active = true;
  n.owner = owner || null;
  n.x = x;
  n.y = y;
  n.vy = (frameReduced || frameLow) ? 0 : -36;
  n.life = 0.68;
  n.maxLife = 0.68;
  n.value = dmg;
  n.crit = false;
  n.text = '';
  if (fx) {
    fx.dmgSlot = slot;
    fx.dmgWindow = 0.12;
  }
  noteSpawned(slot);
  return slot;
}

export function spawnCombatText(x, y, text, isCrit) {
  ensurePools();
  var slot = allocNumber();
  var n = numbers[slot];
  n.active = true;
  n.owner = null;
  n.x = x;
  n.y = y;
  n.vy = -36;
  n.life = 0.85;
  n.maxLife = 0.85;
  n.value = 0;
  n.crit = Boolean(isCrit);
  n.text = text;
}

function markCritNumber(n) {
  if (!n || n.crit) return;
  n.crit = true;
  n.text = '';
  if (n.life < 0.62) n.life = 0.62;
}

function assignCrits(delta) {
  var need = delta > critN ? delta : critN;
  var c;
  var i;
  var h;
  var best;
  var bestD;
  var slot;
  var n;
  var hx;
  var hy;
  var dx;
  var dy;
  var dist;
  for (c = 0; c < critN && need > 0; c += 1) {
    best = -1;
    bestD = 96 * 96;
    for (i = 0; i < spawnedN; i += 1) {
      slot = spawnedIdx[i];
      n = numbers[slot];
      if (!n || !n.active || n.crit) continue;
      hx = n.x;
      hy = n.y;
      for (h = 0; h < hitN; h += 1) {
        if (hitSlot[h] === slot) {
          hx = hitXs[h];
          hy = hitYs[h];
          break;
        }
      }
      dx = hx - critXs[c];
      dy = hy - critYs[c];
      dist = dx * dx + dy * dy;
      if (dist < bestD) {
        bestD = dist;
        best = slot;
      }
    }
    if (best >= 0) {
      markCritNumber(numbers[best]);
      need -= 1;
    }
  }
  while (need > 0) {
    best = -1;
    bestD = -1;
    for (i = 0; i < spawnedN; i += 1) {
      n = numbers[spawnedIdx[i]];
      if (!n || !n.active || n.crit) continue;
      if (n.value > bestD) {
        bestD = n.value;
        best = spawnedIdx[i];
      }
    }
    if (best < 0) break;
    markCritNumber(numbers[best]);
    need -= 1;
  }
}

function emitQueuedHits() {
  for (var i = 0; i < hitN; i += 1) {
    var slot = hitSlot[i];
    var crit = slot >= 0 && numbers[slot] && numbers[slot].crit;
    if (hitKill[i]) {
      if (crit) emitFx('flash', hitXs[i], hitYs[i], { radius: 36, color: '#ffd36b', life: 0.09 });
    } else {
      emitHitSparks(hitXs[i], hitYs[i], !!crit);
    }
  }
}

function requestFlash(color, alpha, life) {
  if (frameReduced) return false;
  if (!(alpha > 0)) return false;
  if (alpha > 0.35) alpha = 0.35;
  var now = (rt && rt.renderTime) || 0;
  if (now - flashWindowStart >= 1) {
    flashWindowStart = now;
    flashesInWindow = 0;
  }
  if (now - lastFlashAt < 0.33 || flashesInWindow >= 3) {
    if (flashLife > 0 && alpha > flashAlpha) {
      flashAlpha = alpha;
      flashColor = color;
    }
    return false;
  }
  lastFlashAt = now;
  flashesInWindow += 1;
  flashAlpha = alpha;
  flashColor = color;
  flashLife = life > 0 ? life : 0.12;
  flashMax = flashLife;
  return true;
}

export function tryScreenFlash(color, alpha, life) {
  return requestFlash(color, alpha, life);
}

function spawnGhost(x, y, aim, life) {
  ensurePools();
  var slot = -1;
  var i;
  for (i = 0; i < GHOST_MAX; i += 1) {
    if (!ghosts[i].active) { slot = i; break; }
  }
  if (slot < 0) {
    slot = ghostCursor;
    ghostCursor = (ghostCursor + 1) % GHOST_MAX;
  }
  var g = ghosts[slot];
  g.active = true;
  g.x = x;
  g.y = y;
  g.aim = aim || 0;
  g.life = life;
  g.maxLife = life > 0 ? life : 0.2;
}

function spawnMark(x, y, px, py) {
  ensurePools();
  var dx = x - px;
  var dy = y - py;
  var len = Math.hypot(dx, dy) || 1;
  var slot = -1;
  var i;
  for (i = 0; i < MARK_MAX; i += 1) {
    if (!marks[i].active) { slot = i; break; }
  }
  if (slot < 0) {
    slot = markCursor;
    markCursor = (markCursor + 1) % MARK_MAX;
  }
  var m = marks[slot];
  m.active = true;
  m.x = x;
  m.y = y;
  m.nx = -dy / len;
  m.ny = dx / len;
  m.life = 0.16;
  m.maxLife = 0.16;
}

function onKill(x, y, o) {
  var enemyKind = o && o.kind ? o.kind : 'crawler';
  var tint = o && o.color ? o.color : '';
  var elite = !!(o && (o.elite || enemyKind === 'elite'));
  var preset = 'deathSmall';
  if (enemyKind === 'titan') preset = 'deathTitan';
  else if (elite) preset = 'deathElite';
  else if (enemyKind === 'brute') preset = 'deathBrute';
  else if (enemyKind === 'artillery') preset = 'deathArtillery';
  else if (enemyKind === 'rusher') preset = 'deathRusher';
  emitPreset(preset, x, y, tint);
  if (o && o.affix === 'vortex') {
    emitFx('ring', x, y, { maxRadius: 160, color: '#b55fe6', life: 0.55, wobble: 3, size: 2 });
    emitFx('spark', x, y, { speed: 170, color: '#b55fe6', life: 0.3 });
    emitFx('spark', x, y, { speed: 120, color: '#e6d2ff', life: 0.24 });
  }
  var ref = o && o.ref;
  if (!ref) return;
  if (!ref.fx || typeof ref.fx !== 'object') ref.fx = {};
  var prev = ref.fx.numHp;
  if (typeof prev === 'number' && typeof o.hp === 'number' && o.hp < prev - 0.5) {
    var slot = pushNumber(ref, prev - o.hp, x, y - 16);
    noteHit(x, y, slot, 1);
  }
  ref.fx.numHp = o.hp;
}

function boltFan(x, y, radius, count, life, color, lift) {
  var n = count;
  if (frameTier === 'low' && n > 8) n = 8;
  if (frameReduced && n > 4) n = 4;
  for (var i = 0; i < n; i += 1) {
    var a = (i / n) * TAU + fxRandSigned() * 0.12;
    var dist = radius * (0.55 + fxRand() * 0.45);
    spawnVisualBolt(x, y - lift, x + Math.cos(a) * dist, y + Math.sin(a) * dist, life, color);
  }
}

function onFxEvent(ev) {
  var kind = ev.kind;
  var x = ev.x;
  var y = ev.y;
  var o = ev.opts;
  if (kind === 'kill') onKill(x, y, o);
  else if (kind === 'crit') noteCrit(x, y);
  else if (kind === 'core') emitPreset('core', x, y);
  else if (kind === 'barrel') emitPreset(o && o.kicked ? 'barrelKicked' : 'barrel', x, y);
  else if (kind === 'mortar') emitPreset('mortar', x, y);
  else if (kind === 'emp') {
    emitPreset('emp', x, y);
    requestFlash('#5be7ff', 0.32, 0.1);
    boltFan(x, y, o && o.r ? o.r : 140, frameTier === 'low' ? 4 : 6, 0.16, '#5be7ff', 0);
  } else if (kind === 'spire') {
    emitPreset('spire', x, y);
    requestFlash('#d7fbff', 0.34, 0.12);
    boltFan(x, y, o && o.r ? o.r : 260, 8 + ((fxRand() * 5) | 0), 0.28, '#5be7ff', 18);
  } else if (kind === 'titanPhase') {
    emitPreset('deathBrute', x, y, '#ff6a3d');
    requestFlash('#ff6a3d', 0.34, 0.16);
  } else if (kind === 'dash') {
    var sx = o && typeof o.sx === 'number' ? o.sx : x;
    var sy = o && typeof o.sy === 'number' ? o.sy : y;
    var aim = o && typeof o.aim === 'number' ? o.aim : 0;
    var ghostsN = frameReduced ? 2 : 4;
    for (var i = 0; i < ghostsN; i += 1) {
      var t = (i + 1) / (ghostsN + 1);
      spawnGhost(sx + (x - sx) * t, sy + (y - sy) * t, aim, 0.2 + i * 0.05);
    }
    emitPreset('dashDust', sx, sy);
    emitPreset('dashDust', x, y);
    if (o && o.just && !frameReduced) {
      emitFx('ring', sx, sy, { maxRadius: 72, color: '#ffd36b', life: 0.3, wobble: 4, size: 1.6 });
      emitFx('ring', x, y, { maxRadius: 84, color: '#7cf0c8', life: 0.34, wobble: 5, size: 1.6 });
    }
  } else if (kind === 'graze') {
    var sparks = (frameLow || frameReduced) ? 1 : 3;
    for (var g = 0; g < sparks; g += 1) emitFx('spark', x, y, { speed: 70 + g * 20, color: '#fffaf2', life: 0.14 });
    var px = o && typeof o.px === 'number' ? o.px : x;
    var py = o && typeof o.py === 'number' ? o.py : y;
    emitFx('flash', px, py, { radius: 16, color: '#ffd36b', life: 0.1 });
    spawnMark(x, y, px, py);
  } else if (kind === 'playerHit') {
    if (o && o.light) {
      emitFx('spark', x, y, { speed: 90, color: '#ed6842', life: 0.16 });
      emitFx('spark', x, y, { speed: 70, color: '#ffb089', life: 0.14 });
    } else {
      emitPreset('playerHit', x, y);
    }
  } else if (kind === 'burst') {
    var presetName = (o && o.preset) || 'deathSmall';
    var burstTint = o && o.tint ? o.tint : '';
    var burstScale = o && typeof o.scale === 'number' && o.scale > 0 ? o.scale : 1;
    emitBurst(presetName, x, y, burstTint, burstScale);
  } else if (kind === 'bounty' || kind === 'surge') {
    var cx = x;
    var cy = y;
    var color = kind === 'surge' ? '#7cf0c8' : '#ffd36b';
    if (rt.state && rt.state.player) {
      cx = rt.state.player.x;
      cy = rt.state.player.y;
    }
    emitPreset(kind === 'surge' ? 'pillarMint' : 'pillar', cx, cy);
    requestFlash(color, kind === 'surge' ? 0.24 : 0.26, 0.14);
  }
}

function watchMoments() {
  var s = rt.state;
  if (!s || !s.player) return;
  var level = s.level || 1;
  if (level > seenLevel) {
    emitPreset('pillar', s.player.x, s.player.y);
    requestFlash('#ffd36b', 0.28, 0.16);
  }
  seenLevel = level;
}

function syncEnemies(step) {
  var enemies = rt.state.enemies;
  for (var i = 0; i < enemies.length; i += 1) {
    var e = enemies[i];
    if (!e) continue;
    if (!e.fx || typeof e.fx !== 'object') e.fx = {};
    var fx = e.fx;
    if (typeof fx.numHp === 'number' && e.hp < fx.numHp - 0.5) {
      var slot = pushNumber(e, fx.numHp - e.hp, e.x, e.y - (e.r || 10) - 8);
      noteHit(e.x, e.y, slot, 0);
    }
    fx.numHp = e.hp;
    if (fx.dmgWindow > 0) {
      fx.dmgWindow -= step;
      if (fx.dmgWindow < 0) fx.dmgWindow = 0;
    }
  }
}

function stepParticles(dt) {
  if (!pool || !(dt > 0) || !liveN) return;
  var windT = rt.renderTime || 0;
  var i = 0;
  while (i < liveN) {
    var p = pool[live[i]];
    if (!p || !p.active) {
      killLiveAt(i);
      continue;
    }
    p.life -= dt;
    if (p.life <= 0) {
      killLiveAt(i);
      continue;
    }
    if (p.kind === KIND_FLASH) { i += 1; continue; }
    if (p.kind === KIND_RING) {
      var u = 1 - p.life / p.maxLife;
      if (u < 0) u = 0;
      p.radius = p.maxRadius * u;
      i += 1;
      continue;
    }
    if (p.kind === KIND_SMOKE && !frameReduced) p.vx += Math.sin(windT * 0.7 + p.seed) * 16 * dt;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    var damp = 1 - p.drag * dt;
    if (damp < 0.2) damp = 0.2;
    p.vx *= damp;
    p.vy *= damp;
    if (p.bounce > 0 && p.y > p.floor && p.vy > 0) {
      p.y = p.floor;
      p.vy = -p.vy * p.bounce;
      p.vx *= 0.72;
      if (p.vy > -14 && p.vy < 0) p.bounce = 0;
    }
    p.rot += p.vrot * dt;
    if (p.grow) {
      p.size += p.grow * dt;
      if (p.size > 46) p.size = 46;
    }
    i += 1;
  }
}

function stepNumbers(dt) {
  if (!numbers || !(dt > 0)) return;
  var drift = !(frameReduced || frameLow);
  for (var i = 0; i < NUM_MAX; i += 1) {
    var n = numbers[i];
    if (!n.active) continue;
    n.life -= dt;
    if (n.life <= 0) {
      n.active = false;
      n.owner = null;
      continue;
    }
    if (drift) n.y += n.vy * dt;
  }
}

function stepGhosts(dt) {
  if (!ghosts || !(dt > 0)) return;
  for (var i = 0; i < GHOST_MAX; i += 1) {
    if (!ghosts[i].active) continue;
    ghosts[i].life -= dt;
    if (ghosts[i].life <= 0) ghosts[i].active = false;
  }
}

function stepMarks(dt) {
  if (!marks || !(dt > 0)) return;
  for (var i = 0; i < MARK_MAX; i += 1) {
    if (!marks[i].active) continue;
    marks[i].life -= dt;
    if (marks[i].life <= 0) marks[i].active = false;
  }
}

function stepFlash(dt) {
  if (!(dt > 0) || !(flashLife > 0)) return;
  flashLife -= dt;
  if (flashLife <= 0) {
    flashLife = 0;
    flashAlpha = 0;
  }
}

export function updateFx(dt) {
  if (!rt) return;
  ensurePools();
  var raw = dt || 0;
  if (raw < 0) raw = 0;
  if (raw > 0.05) raw = 0.05;
  var state = rt.state;
  if (state !== watchState) {
    clearVisuals();
    watchState = state;
    seenLevel = state && state.level ? state.level : 1;
    lastCrits = state && state.stats ? (state.stats.crits || 0) : 0;
  }
  var budget = getBudget();
  frameCap = budget && budget.maxParticles > 0 ? budget.maxParticles : 260;
  if (frameCap > POOL_MAX) frameCap = POOL_MAX;
  frameKey = !!(budget && budget.keyGlowsOnly);
  frameTier = (budget && budget.tier) || 'high';
  frameReduced = isReducedMotion();
  frameContrast = isHighContrast();
  frameLow = frameTier === 'low' || frameKey;
  frameScale = frameTier === 'low' ? 0.38 : frameTier === 'medium' ? 0.62 : 1;
  if (frameReduced) frameScale *= 0.5;
  frameReady = true;
  // Hitstop freezes combat VFX on the impact frame. Pause still uses the render clock.
  var step = (state && state.hitstop > 0) ? 0 : raw;
  enforceCap();
  hitN = 0;
  critN = 0;
  spawnedN = 0;
  drainFxEvents(onFxEvent);
  if (state && state.player) watchMoments();
  if (state && state.enemies) syncEnemies(step);
  var critNow = state && state.stats ? (state.stats.crits || 0) : lastCrits;
  var delta = critNow - lastCrits;
  if (delta < 0) delta = 0;
  lastCrits = critNow;
  assignCrits(delta);
  emitQueuedHits();
  stepParticles(step);
  stepNumbers(step);
  stepGhosts(step);
  stepMarks(step);
  stepFlash(step);
  stepVisualBolts(step);
}

export function drawParticles(ctx) {
  if (!ctx || !rt.state || !rt.state.particles) return;
  var parts = rt.state.particles;
  var prev = ctx.globalAlpha;
  ctx.lineCap = 'round';
  for (var i = 0; i < parts.length; i += 1) {
    var part = parts[i];
    if (!part || !(part.life > 0)) continue;
    var alpha = part.maxLife ? part.life / part.maxLife : 1;
    if (alpha < 0) alpha = 0;
    if (alpha > 1) alpha = 1;
    if (alpha <= 0.03) continue;
    var vx = part.vx || 0;
    var vy = part.vy || 0;
    var mag = Math.hypot(vx, vy);
    ctx.globalAlpha = prev * alpha;
    ctx.strokeStyle = part.color || '#fff4bd';
    ctx.fillStyle = part.color || '#fff4bd';
    if (mag < 8) {
      var s = part.size || 2;
      ctx.fillRect(part.x, part.y, s, s);
    } else {
      var len = mag * 0.028;
      var minLen = part.size || 2;
      if (len < minLen) len = minLen;
      if (len > 18) len = 18;
      var scale = len / mag;
      var width = part.size || 2;
      if (width > 3.5) width = 3.5;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(part.x, part.y);
      ctx.lineTo(part.x - vx * scale, part.y - vy * scale);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = prev;
}

function drawShard(ctx, p, alpha) {
  var sides = 3 + (p.seed % 3);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  for (var i = 0; i < sides; i += 1) {
    var a = (i / sides) * TAU;
    var rad = p.size * (i % 2 ? 1 : 0.62);
    var px = Math.cos(a) * rad;
    var py = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1a140f';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawRing(ctx, p, alpha) {
  var radius = p.radius;
  if (!(radius > 0.8)) return;
  var wob = (!frameReduced && p.wobble) ? p.wobble : 0;
  var seg = wob ? 18 : 22;
  var spin = (rt.renderTime || 0) + p.seed * 0.01;
  ctx.beginPath();
  for (var i = 0; i <= seg; i += 1) {
    var a = (i / seg) * TAU;
    var rr = radius + (wob ? Math.sin(a * 5 + spin * 8) * wob : 0);
    var px = p.x + Math.cos(a) * rr;
    var py = p.y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = p.color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = p.size || 2;
  ctx.stroke();
}

function drawPoolPass(ctx, soft) {
  if (!pool || !liveN) return;
  ctx.globalCompositeOperation = soft ? 'source-over' : 'lighter';
  var n;
  var pl = rt.state && rt.state.player;
  var plX = pl ? pl.x : 0;
  var plY = pl ? pl.y : 0;
  var hasPl = Boolean(pl);

  for (n = 0; n < liveN; n += 1) {
    var p = pool[live[n]];
    if (!p.active) continue;
    var softKind = p.kind === KIND_SMOKE || p.kind === KIND_SHARD;
    if (softKind !== soft) continue;
    var alpha = p.maxLife ? p.life / p.maxLife : 1;
    if (alpha <= 0.03) continue;
    if (alpha > 1) alpha = 1;

    // 玩家中心 120px 徑向視線保護圈（Player Proximity Fade / Alpha Culling）
    // Tier 1（Flash、Ring）永不消隱；Tier 2（Spark）保持清晰度；Tier 3（Smoke、Shard、Ember）執行消音
    var pAlpha = alpha;
    if (hasPl && (softKind || p.kind === KIND_EMBER)) {
      var pdx = p.x - plX;
      var pdy = p.y - plY;
      var pDist = Math.hypot(pdx, pdy);
      if (pDist < 60) {
        // 致命貼身半徑：黑煙透明度降為 0.08 或直接剔除，徹底杜絕黑煙貼臉致盲！
        if (p.kind === KIND_SMOKE) pAlpha *= 0.08;
        else if (p.kind === KIND_SHARD) pAlpha *= 0.15;
        else if (p.kind === KIND_EMBER) pAlpha *= 0.20;
      } else if (pDist < 120) {
        // 60px <= d < 120px：透明度漸衰 (d - 60) / 60
        var decayFactor = (pDist - 60) / 60;
        if (p.kind === KIND_SMOKE) pAlpha *= (0.08 + 0.92 * decayFactor);
        else if (p.kind === KIND_SHARD) pAlpha *= (0.15 + 0.85 * decayFactor);
        else if (p.kind === KIND_EMBER) pAlpha *= (0.20 + 0.80 * decayFactor);
      }
    }
    if (pAlpha <= 0.02) continue;

    if (p.kind === KIND_SMOKE) {
      ctx.globalAlpha = pAlpha * 0.14;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.35, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = pAlpha * 0.22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    } else if (p.kind === KIND_SHARD) {
      drawShard(ctx, p, pAlpha);
    } else if (p.kind === KIND_SPARK) {
      // Tier 2 命中火花：拉長為速度向量線，壽命縮減至 0.15~0.22 秒
      var mag = Math.hypot(p.vx, p.vy);
      var len = mag * 0.045;
      if (len < p.size * 1.5) len = p.size * 1.5;
      if (len > 24) len = 24;
      ctx.globalAlpha = pAlpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size > 2.2 ? 2.2 : (p.size < 1.2 ? 1.2 : p.size);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      if (mag > 1) ctx.lineTo(p.x - p.vx * (len / mag), p.y - p.vy * (len / mag));
      else ctx.lineTo(p.x + len, p.y);
      ctx.stroke();
    } else if (p.kind === KIND_EMBER) {
      var flick = frameReduced ? 1 : (0.62 + 0.38 * Math.sin((rt.renderTime || 0) * 18 + p.seed));
      if (frameKey) {
        ctx.globalAlpha = pAlpha * flick;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else {
        drawGlow(ctx, p.x, p.y, p.size * 2.4, p.color, pAlpha * flick);
      }
    } else if (p.kind === KIND_RING) {
      // Tier 1 破盾震波/衝擊光環：最高圖層，永不消隱
      drawRing(ctx, p, pAlpha * 0.9);
    } else if (p.kind === KIND_FLASH) {
      // Tier 1 受擊閃白：純白覆蓋 0.08s，最高圖層，永不消隱
      ctx.globalAlpha = pAlpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, p.radius * 0.26), 0, TAU);
      ctx.fill();
      drawGlow(ctx, p.x, p.y, p.radius, p.color, pAlpha);
    }
  }
}

function drawMarks(ctx) {
  if (!marks) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (var i = 0; i < MARK_MAX; i += 1) {
    var m = marks[i];
    if (!m.active) continue;
    var alpha = m.life / m.maxLife;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#fffaf2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.x - m.nx * 11, m.y - m.ny * 11);
    ctx.quadraticCurveTo(m.x + m.ny * 6, m.y - m.nx * 6, m.x + m.nx * 11, m.y + m.ny * 11);
    ctx.stroke();
  }
}

function drawGhosts(ctx) {
  if (!ghosts) return;
  ctx.globalCompositeOperation = 'source-over';
  for (var i = 0; i < GHOST_MAX; i += 1) {
    var g = ghosts[i];
    if (!g.active) continue;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.aim || 0);
    ctx.globalAlpha = (g.life / g.maxLife) * 0.45;
    ctx.fillStyle = '#7cf0c8';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(4, 8);
    ctx.lineTo(-10, 6);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-10, -6);
    ctx.lineTo(4, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function drawAdditiveFx(ctx) {
  if (!ctx) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  drawParticles(ctx);
  drawPoolPass(ctx, true);
  drawPoolPass(ctx, false);
  drawMarks(ctx);
  drawGhosts(ctx);
  ctx.restore();
}

export function drawDamageNumbers(ctx) {
  renderDamageNumbers(ctx, numbers, NUM_MAX);
}

export function drawScreenFlashes(ctx) {
  if (!ctx || !rt || !rt.ui) return;
  var w = rt.ui.width;
  var h = rt.ui.height;
  if (!(w > 0) || !(h > 0)) return;
  var reduced = frameReady ? frameReduced : isReducedMotion();
  if (reduced) return;
  if (!(flashLife > 0 && flashAlpha > 0.01)) return;
  var alpha = flashAlpha * (flashLife / (flashMax || 0.12));
  if (alpha > 0.35) alpha = 0.35;
  if (alpha < 0) alpha = 0;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = flashColor;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
