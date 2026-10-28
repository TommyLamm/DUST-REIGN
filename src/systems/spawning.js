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
import { edgeAwareSpawnMargin } from './sim/world-edge.js';
import { logEvent, setStatusText } from '../ui/hud.js';

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
    e.flankSide = pickTacticalFlankSide(rt.state && rt.state.player);
    e.trail = [];
  } else if (kind === 'artillery') {
    e.timeAlive = 0;
    e.deployed = false;
    e.siegeTimer = 0;
    e.cooldown = 0;
    e.barrelAngle = 0;
  }
  e.baseSpeed = e.speed;
  primeEnemy(kind, e);
  rt.state.enemies.push(e);
  return e;
}

var SPAWN_VEC_SCRATCH = { x: 0, y: 0 };

export function pickTacticalFlankSide(player) {
  return rng('spawn') < 0.5 ? 1 : -1;
}

/**
 * Perimeter Spawn Ring Architecture (PSRA)
 * - Zone 0 (Inner Safe Zone): Viewport + 40px strictly forbidden from spawning.
 * - Zone 1 (Active Spawn Band): 1.15 ~ 1.42 x Viewport (radial 620 ~ 780px ellipse).
 * - Velocity-biased predictive interception sector allocation:
 *   - Frontal intercept arc (heading +- 45 deg): 55% ~ 65% spawn weight
 *   - Flanking pincer arcs (heading +- 45 to +- 110 deg): 25% ~ 30% spawn weight
 *   - Rear pursuit arc (remaining): 10% ~ 15% spawn weight
 *   - Low-speed / idle fallback: 360 deg uniform ring
 * - Tangent sliding along borders when clipping outside map boundaries.
 */
export function sampleRingSpawnPoint(player, camera, worldW, worldH) {
  var p = player || (rt.state && rt.state.player) || { x: 480, y: 320, vx: 0, vy: 0 };
  var cam = camera || (rt.state && rt.state.camera);
  var cx = cam ? cam.x : p.x;
  var cy = cam ? cam.y : p.y;
  var vpW = cam ? (cam.viewW || cam.w || 960) : ((rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960);
  var vpH = cam ? (cam.viewH || cam.h || 640) : ((rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640);
  var bW = worldW || (rt.state && (rt.state.worldWidth || rt.state.worldW)) || (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 960;
  var bH = worldH || (rt.state && (rt.state.worldHeight || rt.state.worldH)) || (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 640;

  var pvx = p.vx || 0;
  var pvy = p.vy || 0;
  var pSpeed = Math.hypot(pvx, pvy);
  var angle;
  if (pSpeed < 30) {
    angle = rng('spawn') * TAU;
  } else {
    var heading = Math.atan2(pvy, pvx);
    var roll = rng('spawn');
    if (roll < 0.60) {
      // 55% ~ 65% Frontal intercept sector [heading - 45 deg, heading + 45 deg]
      angle = heading + (rng('spawn') - 0.5) * (Math.PI / 2);
    } else if (roll < 0.88) {
      // 25% ~ 30% Flanking pincer sectors [heading +- 45 deg to heading +- 110 deg]
      var flankSide = rng('spawn') < 0.5 ? 1 : -1;
      var flankSpan = (110 - 45) * Math.PI / 180;
      angle = heading + flankSide * (Math.PI / 4 + rng('spawn') * flankSpan);
    } else {
      // 10% ~ 15% Rear pursuit sector
      angle = heading + Math.PI + (rng('spawn') - 0.5) * (140 * Math.PI / 180);
    }
  }

  // Zone 1: Active spawn band (1.15 ~ 1.42 x Viewport)
  var halfW = vpW * 0.5;
  var halfH = vpH * 0.5;
  var ringScale = 1.15 + rng('spawn') * 0.27;
  var radX = halfW * ringScale;
  var radY = halfH * ringScale;
  var rawX = cx + Math.cos(angle) * radX;
  var rawY = cy + Math.sin(angle) * radY;

  // Tangent sliding & border clamping (widen when player is hatch-pinned)
  var margin = edgeAwareSpawnMargin(p, bW, bH, 32);
  var clampedX = clamp(rawX, margin, bW - margin);
  var clampedY = clamp(rawY, margin, bH - margin);

  // Check Zone 0 (camera viewport + 40px safe zone)
  var safeHalfW = halfW + 40;
  var safeHalfH = halfH + 40;
  var dxZone0 = (clampedX - cx) / safeHalfW;
  var dyZone0 = (clampedY - cy) / safeHalfH;
  if ((dxZone0 * dxZone0 + dyZone0 * dyZone0) < 1.0) {
    // Falls into Zone 0: slide along border outside view + 60px
    var outSafeHalfW = halfW + 60;
    var outSafeHalfH = halfH + 60;
    if (clampedY <= margin + 1 || clampedY >= bH - margin - 1) {
      var signX = (clampedX >= cx) ? 1 : -1;
      clampedX = clamp(cx + signX * outSafeHalfW, margin, bW - margin);
    } else if (clampedX <= margin + 1 || clampedX >= bW - margin - 1) {
      var signY = (clampedY >= cy) ? 1 : -1;
      clampedY = clamp(cy + signY * outSafeHalfH, margin, bH - margin);
    } else {
      var a = Math.atan2(clampedY - cy, clampedX - cx);
      clampedX = clamp(cx + Math.cos(a) * outSafeHalfW, margin, bW - margin);
      clampedY = clamp(cy + Math.sin(a) * outSafeHalfH, margin, bH - margin);
    }
  }

  SPAWN_VEC_SCRATCH.x = clampedX;
  SPAWN_VEC_SCRATCH.y = clampedY;
  return SPAWN_VEC_SCRATCH;
}

export function spawnEnemy() {
  if (!rt.state) return null;
  var recipe = currentRecipe();
  var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var p = (rt.state && rt.state.player) || { x: boundW * 0.5, y: boundH * 0.5, vx: 0, vy: 0 };
  var pt = sampleRingSpawnPoint(p, rt.state.camera, boundW, boundH);
  var x = pt.x;
  var y = pt.y;

  var eliteChance = typeof recipe.eliteChance === 'number' ? recipe.eliteChance : 0;
  var pacingPhase = rt.state.pacingPhase || 0;
  // Phase 3 Elite Peak: denser elites without changing the wave recipe permanently.
  if (pacingPhase === 3) eliteChance = Math.min(0.6, eliteChance * 1.35);
  // Sovereign wave: no elites before OR during the fight (recipe also cuts to 0).
  var liveBoss = rt.state.boss;
  if ((recipe && recipe.boss === 'sovereign') || (liveBoss && liveBoss.kind === 'sovereign' && liveBoss.hp > 0)) {
    eliteChance = 0;
  }
  var weights = recipe.weights || null;
  var useWeights = !!(weights && (
    (weights.spitter > 0) || (weights.scurrier > 0) || (weights.warden > 0) || (weights.burrower > 0)
  ));
  var kind;
  var affix = null;
  var affix2 = null;
  var legacyRoll = useWeights ? 0 : rng('spawn');
  if (rng('spawn') < eliteChance) {
    kind = 'elite';
    var pool = affixPool(rt.state.wave, recipe);
    affix = pickAffix(pool);
    if ((rt.state.wave | 0) >= 16 && pool.length > 1) {
      var pool2 = pool.filter(function (a) { return a !== affix; });
      affix2 = pickAffix(pool2);
    }
  } else if (useWeights) {
    kind = pickWeightedKind(weights) || 'crawler';
  } else if (recipe.artilleryChance > 0 && rng('spawn') < recipe.artilleryChance) {
    kind = 'artillery';
  } else {
    kind = legacyRoll < recipe.rusherCut ? 'rusher' : legacyRoll > recipe.bruteCut ? 'brute' : 'crawler';
  }
  // Phase 1 Infiltration: keep early spawns light (Rusher/Crawler scouts).
  if (pacingPhase === 1 && kind !== 'elite' && kind !== 'scurrier') {
    if (kind === 'brute' || kind === 'artillery' || kind === 'warden' || kind === 'burrower' || kind === 'spitter') {
      kind = rng('spawn') < 0.6 ? 'rusher' : 'crawler';
      affix = null;
      affix2 = null;
    }
  }
  var spawned = placeEnemy(kind, x, y, recipe, affix, affix2);
  var bodies = spawned ? 1 : 0;
  // Scurrier packs used to drop 3 bodies per weight roll (~3x field share).
  // Pair pack + spawn-slot billing keeps the swarm fantasy without flooding the cap.
  if (kind === 'scurrier' && spawned) {
    var cap = recipeCap(recipe);
    var scurAngle = Math.atan2(y - p.y, x - p.x);
    var tangent = scurAngle + Math.PI / 2;
    var side = rng('spawn') < 0.5 ? 1 : -1;
    var margin = 32;
    if (rt.state.enemies.length < cap) {
      placeEnemy(
        kind,
        clamp(x + Math.cos(tangent) * 22 * side, margin, boundW - margin),
        clamp(y + Math.sin(tangent) * 22 * side, margin, boundH - margin),
        recipe,
        null,
        null
      );
      bodies += 1;
    }
  }
  if (rt.state) rt.state.lastSpawnSlots = Math.max(1, bodies);
  return spawned;
}

function announceBoss(text) {
  AudioFX.stormSiren();
  rt.state.banner = 3.5;
  rt.state.bannerText = text;
  rt.state.shake = Math.max(rt.state.shake, 14);
  triggerHaptic([40, 40, 60, 40, 80]);
  logEvent(text);
  setStatusText(text);
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
    // Drop residual elites + their in-flight rounds (hp=0 left them shooting one frame).
    if (rt.state.enemies && rt.state.enemies.length) {
      for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
        var foe = rt.state.enemies[ei];
        if (foe && foe.kind === 'elite') {
          rt.state.enemies.splice(ei, 1);
        }
      }
    }
    if (rt.state.enemyBullets && rt.state.enemyBullets.length) {
      for (var bi = rt.state.enemyBullets.length - 1; bi >= 0; bi -= 1) {
        var eb = rt.state.enemyBullets[bi];
        if (eb && (eb.ownerKind === 'elite' || eb.source === 'elite' || eb.kind === 'elite')) {
          rt.state.enemyBullets.splice(bi, 1);
        }
      }
    }
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
  var due = (typeof rt.state.bossDueAt === 'number') ? rt.state.bossDueAt : 8;
  if ((rt.state.waveTime || 0) < due && !((rt.state.waveTime || 0) >= 5.5 && (rt.state.enemies || []).length <= 4)) return;
  if (rt.state.boss && rt.state.boss.hp > 0) return;
  rt.state.bossSpawned = true;
  spawnBoss(kind);
}

function createTitan(boundW) {
  var stats = enemyProfile('titan', rt.state.wave, currentRecipe());
  var titanHp = stats.hp;
  var leftPartHp = Math.round(titanHp * 0.22);
  var rightPartHp = Math.round(titanHp * 0.22);
  var radiatorPartHp = Math.round(titanHp * 0.18);
  var treadPartHp = Math.round(titanHp * 0.20);

  return {
    kind: 'titan',
    isBoss: true,
    isMultiPart: true,
    x: boundW / 2,
    y: -40,
    r: stats.r,
    hp: titanHp,
    maxHp: titanHp,
    speed: stats.speed,
    baseSpeed: stats.speed,
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
    leftCannonHp: leftPartHp,
    leftCannonMaxHp: leftPartHp,
    leftCannonDestroyed: false,
    rightPodHp: rightPartHp,
    rightPodMaxHp: rightPartHp,
    rightPodDestroyed: false,
    radiatorHp: radiatorPartHp,
    radiatorMaxHp: radiatorPartHp,
    radiatorDestroyed: false,
    radiatorExposed: false,
    radiatorExposeTimer: 0,
    treadHp: treadPartHp,
    treadMaxHp: treadPartHp,
    treadDestroyed: false,
    bossName: 'TITAN',
    bossSubtitle: 'APEX THREAT',
    score: stats.score,
    xp: stats.xp,
    parts: [
      {
        id: 'left_cannon',
        name: '左肩迫擊砲塔',
        nameZh: '左迫砲',
        nameEn: 'L-CANNON',
        relX: 0,
        relY: -22,
        r: 16,
        hp: leftPartHp,
        maxHp: leftPartHp,
        destroyed: false,
        coreAbsorption: 0.6,
        rewardKind: 'repair'
      },
      {
        id: 'right_pod',
        name: '右肩飛彈巢',
        nameZh: '右蜂巢',
        nameEn: 'R-POD',
        relX: 0,
        relY: 22,
        r: 16,
        hp: rightPartHp,
        maxHp: rightPartHp,
        destroyed: false,
        coreAbsorption: 0.6,
        rewardKind: 'overdrive'
      },
      {
        id: 'radiator',
        name: '背部散熱鰭片',
        nameZh: '鰭片',
        nameEn: 'FINS',
        relX: -32,
        relY: 0,
        r: 15,
        hp: radiatorPartHp,
        maxHp: radiatorPartHp,
        destroyed: false,
        isWeakpoint: true,
        vulnMultiplier: 2.5,
        coreAbsorption: 1.0,
        rewardKind: 'surge'
      },
      {
        id: 'treads',
        name: '履帶裝甲裙板',
        nameZh: '履帶',
        nameEn: 'TREADS',
        relX: -18,
        relY: 0,
        r: 24,
        hp: treadPartHp,
        maxHp: treadPartHp,
        destroyed: false,
        coreAbsorption: 0.4,
        rewardKind: 'scrap'
      }
    ]
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
    timer: 1.55,
    maxTimer: 1.55,
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
