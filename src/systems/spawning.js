import { AudioFX } from '../audio/audio-fx.js';
import { TAU } from '../config.js';
import { spawnParticles } from '../core/pools.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { triggerHaptic } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { enemyProfile } from '../data/enemies.js';
import { planWave } from './director.js';
import { createDreadnought, createSovereign } from './sim/bosses.js';
import { primeEnemy } from './sim/new-enemies.js';
import { logEvent } from '../ui/hud.js';

function currentRecipe() {
  var wave = (rt.state && rt.state.wave) || 1;
  if (!rt.state.recipe || rt.state.recipe.wave !== wave) {
    rt.state.recipe = planWave(wave);
    rt.state.act = rt.state.recipe.act;
    rt.state.sector = rt.state.recipe.sector;
  }
  return rt.state.recipe;
}

export function rebuildTerrain() {
  rt.terrain = [];
  var count = Math.max(38, Math.round((rt.ui.width * rt.ui.height) / 10500));
  var seed = 7919;
  function next() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  for (var i = 0; i < count; i += 1) {
    var x = next() * rt.ui.width;
    var y = next() * rt.ui.height;
    var size = 3 + next() * 13;
    rt.terrain.push({ x: x, y: y, size: size, rot: next() * TAU, kind: next() > 0.72 ? 'scrap' : 'rock' });
  }
}

var WEIGHT_KINDS = ['crawler', 'rusher', 'brute', 'artillery', 'spitter', 'scurrier', 'warden', 'burrower'];

function affixPool(wave, recipe) {
  var minWave = recipe && typeof recipe.affixMinWave === 'number' ? recipe.affixMinWave : 4;
  var volMin = recipe && typeof recipe.volatileMinWave === 'number' ? recipe.volatileMinWave : 8;
  var splitMin = recipe && typeof recipe.splitterMinWave === 'number' ? recipe.splitterMinWave : 13;
  var pool = [];
  if (wave >= minWave) pool.push('mirror', 'vortex', 'command', 'blink');
  if (wave >= volMin) pool.push('volatile');
  if (wave >= splitMin) pool.push('splitter');
  return pool;
}

function recipeCap(recipe) {
  if (recipe && typeof recipe.cap === 'number' && recipe.cap > 0) return recipe.cap;
  return 95;
}

function pickAffix(pool) {
  if (!pool.length) return null;
  return pool[Math.floor(rng('spawn') * pool.length)];
}

function pickWeightedKind(weights) {
  var total = 0;
  var values = [];
  var i;
  for (i = 0; i < WEIGHT_KINDS.length; i += 1) {
    var raw = weights && typeof weights[WEIGHT_KINDS[i]] === 'number' ? weights[WEIGHT_KINDS[i]] : 0;
    if (!(raw > 0)) raw = 0;
    values.push(raw);
    total += raw;
  }
  if (!(total > 0)) return null;
  var roll = rng('spawn') * total;
  var acc = 0;
  for (i = 0; i < WEIGHT_KINDS.length; i += 1) {
    acc += values[i];
    if (roll < acc) return WEIGHT_KINDS[i];
  }
  return WEIGHT_KINDS[0];
}

function placeEnemy(kind, x, y, recipe, affix, affix2) {
  var stats = enemyProfile(kind, rt.state.wave, recipe);
  var e = {
    kind: kind,
    x: x,
    y: y,
    r: stats.r,
    hp: stats.hp,
    maxHp: stats.maxHp,
    speed: stats.speed,
    damage: stats.damage,
    color: stats.color,
    score: stats.score,
    xp: stats.xp,
    repairChance: stats.repairChance,
    touchCooldown: 0,
    phase: rng('spawn') * TAU
  };
  if (kind === 'elite') {
    e.shootCd = 3.5;
    e.ringTriggered = false;
    e.affix = affix || null;
    e.affix2 = affix2 || null;
    e.shieldAngle = 0;
    e.shieldBrokenTimer = 0;
    e.commandTimer = 2.5;
    e.blinkTimer = 3.2;
    e.blinkTelegraph = false;
  } else if (kind === 'rusher') {
    e.burstCd = 1.5 + rng('spawn') * 1.0;
    e.burstTime = 0;
    e.burstAngle = 0;
    e.trail = [];
  } else if (kind === 'artillery') {
    e.timeAlive = 0;
    e.deployed = false;
    e.siegeTimer = 0;
    e.cooldown = 0;
    e.barrelAngle = 0;
  }
  primeEnemy(kind, e);
  rt.state.enemies.push(e);
  return e;
}

export function spawnEnemy() {
  if (!rt.state) return;
  var recipe = currentRecipe();
  var side = Math.floor(rng('spawn') * 4);
  var margin = 42;
  var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var x = side === 0 ? -margin : side === 1 ? boundW + margin : rng('spawn') * boundW;
  var y = side === 2 ? -margin : side === 3 ? boundH + margin : rng('spawn') * boundH;
  var eliteChance = typeof recipe.eliteChance === 'number' ? recipe.eliteChance : 0;
  var weights = recipe.weights || null;
  var useWeights = !!(weights && (
    (weights.spitter > 0) || (weights.scurrier > 0) || (weights.warden > 0) || (weights.burrower > 0)
  ));
  var kind;
  var affix = null;
  var affix2 = null;
  // P0 recipes have no new-enemy weight. Keep the old roll/artillery rng
  // count so unseeded Math.random sequences used by the existing self-check stay put.
  var legacyRoll = useWeights ? 0 : rng('spawn');
  if (rng('spawn') < eliteChance) {
    kind = 'elite';
    var pool = affixPool(rt.state.wave, recipe);
    affix = pickAffix(pool);
    if ((rt.state.wave | 0) >= 16 && pool.length > 1) {
      var guard = 0;
      affix2 = pickAffix(pool);
      while (affix2 === affix && guard < 6) {
        affix2 = pickAffix(pool);
        guard += 1;
      }
      if (affix2 === affix) {
        var ai;
        for (ai = 0; ai < pool.length; ai += 1) {
          if (pool[ai] !== affix) {
            affix2 = pool[ai];
            break;
          }
        }
      }
    }
  } else if (useWeights) {
    kind = pickWeightedKind(weights) || 'crawler';
  } else if (recipe.artilleryChance > 0 && rng('spawn') < recipe.artilleryChance) {
    kind = 'artillery';
  } else {
    kind = legacyRoll < recipe.rusherCut ? 'rusher' : legacyRoll > recipe.bruteCut ? 'brute' : 'crawler';
  }
  var spawned = placeEnemy(kind, x, y, recipe, affix, affix2);
  if (kind === 'scurrier') {
    var cap = recipeCap(recipe);
    var tangent = side === 0 || side === 1 ? 0 : Math.PI / 2;
    if (rt.state.enemies.length < cap) {
      placeEnemy(kind, x + Math.cos(tangent + Math.PI / 2) * 22, y + Math.sin(tangent + Math.PI / 2) * 22, recipe, null, null);
    }
    if (rt.state.enemies.length < cap) {
      placeEnemy(kind, x - Math.cos(tangent + Math.PI / 2) * 22, y - Math.sin(tangent + Math.PI / 2) * 22, recipe, null, null);
    }
  }
  return spawned;
}

function announceBoss(text) {
  AudioFX.stormSiren();
  rt.state.banner = 3.5;
  rt.state.bannerText = text;
  rt.state.shake = Math.max(rt.state.shake, 14);
  triggerHaptic([40, 40, 60, 40, 80]);
  logEvent(text);
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = text;
}

export function spawnBoss(kind) {
  if (!rt.state) return null;
  var boundW = (rt.ui && rt.ui.width) || rt.state.width || 960;
  var boundH = (rt.ui && rt.ui.height) || rt.state.height || 640;
  var boss = null;
  if (kind === 'dreadnought') {
    announceBoss('WARNING // DREADNOUGHT INBOUND');
    boss = createDreadnought(rt.state.wave || 1, boundW, boundH);
  } else if (kind === 'sovereign') {
    announceBoss('WARNING // STORM SOVEREIGN');
    boss = createSovereign(rt.state.wave || 1, boundW, boundH);
  } else {
    announceBoss('WARNING // TITAN DETECTED');
    boss = createTitan(boundW);
  }
  if (!boss) return null;
  boss.isBoss = true;
  boss.knockbackImmune = true;
  rt.state.enemies.push(boss);
  rt.state.boss = boss;
  return boss;
}

export function ensureScriptedBoss() {
  if (!rt.state || rt.state.bossSpawned) return;
  var recipe = rt.state.recipe;
  var kind = recipe && recipe.boss;
  if (kind !== 'dreadnought' && kind !== 'sovereign') return;
  if ((rt.state.waveTime || 0) < 8) return;
  if (rt.state.boss && rt.state.boss.hp > 0) return;
  rt.state.bossSpawned = true;
  spawnBoss(kind);
}

function createTitan(boundW) {
  var stats = enemyProfile('titan', rt.state.wave, currentRecipe());
  var titanHp = stats.hp;
  return {
    kind: 'titan',
    isBoss: true,
    x: boundW / 2,
    y: -40,
    r: stats.r,
    hp: titanHp,
    maxHp: titanHp,
    speed: stats.speed,
    damage: stats.damage,
    color: stats.color,
    touchCooldown: 0,
    phase: 0,
    shootCd: 2.8,
    shootAlt: false,
    phase2Triggered: false,
    spiralCd: 3.2,
    spiralAngle: 0,
    summonCd: 6.0,
    empTimer: 0,
    leftCannonHp: Math.round(titanHp * 0.22),
    leftCannonMaxHp: Math.round(titanHp * 0.22),
    leftCannonDestroyed: false,
    rightPodHp: Math.round(titanHp * 0.22),
    rightPodMaxHp: Math.round(titanHp * 0.22),
    rightPodDestroyed: false,
    bossName: 'TITAN',
    bossSubtitle: 'APEX THREAT',
    score: stats.score,
    xp: stats.xp
  };
}

export function spawnTitan() {
  return spawnBoss('titan');
}

export function spawnBarrels() {
  if (!rt.state) return;
  if (!rt.state.barrels) rt.state.barrels = [];
  var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var p = rt.state.player || { x: boundW / 2, y: boundH / 2 };
  var margin = 70;
  var count = 2 + Math.floor(rng('spawn') * 2);
  for (var bi = 0; bi < count; bi += 1) {
    var bx = margin + rng('spawn') * (boundW - margin * 2);
    var by = margin + rng('spawn') * (boundH - margin * 2);
    for (var bTry = 0; bTry < 12; bTry += 1) {
      if (Math.hypot(bx - p.x, by - p.y) >= 120) break;
      bx = margin + rng('spawn') * (boundW - margin * 2);
      by = margin + rng('spawn') * (boundH - margin * 2);
    }
    if (Math.hypot(bx - p.x, by - p.y) < 120) {
      var bAngle = Math.atan2(by - p.y, bx - p.x);
      bx = clamp(p.x + Math.cos(bAngle) * 120, margin, boundW - margin);
      by = clamp(p.y + Math.sin(bAngle) * 120, margin, boundH - margin);
    }
    rt.state.barrels.push({
      x: bx,
      y: by,
      vx: 0,
      vy: 0,
      r: 14,
      hp: 20,
      maxHp: 20,
      state: 'idle',
      flyingTimer: 0,
      rot: 0
    });
  }
}

export function spawnSpires() {
  if (!rt.state) return;
  if (!rt.state.spires) rt.state.spires = [];
  if (rt.state.wave < 3) return;
  var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var p = rt.state.player || { x: boundW / 2, y: boundH / 2 };
  var margin = 90;
  var sx = margin + rng('spawn') * (boundW - margin * 2);
  var sy = margin + rng('spawn') * (boundH - margin * 2);
  for (var sTry = 0; sTry < 40; sTry += 1) {
    if (Math.hypot(sx - p.x, sy - p.y) >= 160) break;
    sx = margin + rng('spawn') * (boundW - margin * 2);
    sy = margin + rng('spawn') * (boundH - margin * 2);
  }
  if (Math.hypot(sx - p.x, sy - p.y) < 150) {
    sx = p.x < boundW / 2 ? (boundW - margin) : margin;
    sy = p.y < boundH / 2 ? (boundH - margin) : margin;
  }
  rt.state.spires.push({
    x: sx,
    y: sy,
    r: 18,
    resonanceTimer: 0,
    pulseTimer: 0
  });
}

export function fireArtillery(e) {
  if (!rt.state) return;
  var p = rt.state.player;
  var boundW = rt.ui ? rt.ui.width : rt.state.width;
  var boundH = rt.ui ? rt.ui.height : rt.state.height;
  // 預測落點公式：P_target = P_player + v_player * (1.2 * 0.85) + 微隨機偏移(±15px)
  var pvx = p.vx || 0;
  var pvy = p.vy || 0;
  var offsetX = (rng('spawn') - 0.5) * 30;
  var offsetY = (rng('spawn') - 0.5) * 30;
  var targetX = clamp(p.x + pvx * (1.2 * 0.85) + offsetX, 46, boundW - 46);
  var targetY = clamp(p.y + pvy * (1.2 * 0.85) + offsetY, 46, boundH - 46);

  rt.state.artilleryTargets.push({
    x: targetX,
    y: targetY,
    r: 46,
    timer: 1.2,
    maxTimer: 1.2,
    wave: rt.state.wave,
    state: 'warning',
    damageTickTimer: 0
  });

  AudioFX.mortarLaunch();
  var bAngle = Math.atan2(targetY - e.y, targetX - e.x);
  e.barrelAngle = bAngle;
  var mx = e.x + Math.cos(bAngle) * (e.r + 10);
  var my = e.y + Math.sin(bAngle) * (e.r + 10);
  spawnParticles(mx, my, '#f5a623', 8, 120, 3);
  spawnParticles(mx, my, '#d69e2e', 5, 80, 2);
}
