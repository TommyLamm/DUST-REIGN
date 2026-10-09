import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { getDailyRule } from '../data/daily.js';
import { enemyProfile } from '../data/enemies.js';
import { getHeatModifiers } from '../data/heat.js';
import { MUTATOR_IDS, mutatorById } from '../data/mutators.js';
import { contractById } from '../data/contracts.js';
import { routeById, routeIds } from '../data/routes.js';
import { noteMetaEvent } from './meta.js';
import { addScore } from './scoring.js';
import { assignRoute, onBossCleared } from './interlude.js';

var WEIGHT_KEYS = ['crawler', 'rusher', 'brute', 'artillery', 'spitter', 'scurrier', 'warden', 'burrower'];
var UNLOCK_WAVE = { crawler: 1, rusher: 1, brute: 1, artillery: 2, spitter: 6, scurrier: 7, warden: 11, burrower: 12 };
var BOSS_SCORE = { titan: 800, dreadnought: 1500, sovereign: 3000 };

// Act tables. Act I wave 1 is its own row so the opener matches v0.3 ratios.
var WEIGHT_ROWS = {
  open: { crawler: 0.71, rusher: 0.16, brute: 0.13, artillery: 0, spitter: 0, scurrier: 0, warden: 0, burrower: 0 },
  act1: { crawler: 0.58, rusher: 0.17, brute: 0.11, artillery: 0.14, spitter: 0, scurrier: 0, warden: 0, burrower: 0 },
  act2: { crawler: 0.42, rusher: 0.18, brute: 0.12, artillery: 0.12, spitter: 0.10, scurrier: 0.06, warden: 0, burrower: 0 },
  act3: { crawler: 0.32, rusher: 0.16, brute: 0.12, artillery: 0.10, spitter: 0.10, scurrier: 0.08, warden: 0.06, burrower: 0.06 },
  overtime: { crawler: 0.28, rusher: 0.16, brute: 0.13, artillery: 0.10, spitter: 0.11, scurrier: 0.08, warden: 0.07, burrower: 0.07 }
};

var rebasedKnown = false;
var rebasedFlag = false;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function waveParts(wave) {
  var w = wave | 0;
  if (w < 1) w = 1;
  var act = w <= 5 ? 1 : w <= 10 ? 2 : w <= 15 ? 3 : (Math.floor((w - 1) / 5) + 1);
  var formulaAct = w <= 15 ? act : 3;
  var wIn = ((w - 1) % 5) + 1;
  var overheat = w > 15 ? w - 15 : 0;
  return { wave: w, act: act, formulaAct: formulaAct, wIn: wIn, overheat: overheat };
}

// enemyProfile still bakes the v0.3 per-wave term. Multiplying that by the new
// curve would double-scale and move Titan's wave-5 hull off 650. Once crawler
// wave 5 (scale 1) drops to the wave-1 base, the curve is safe to publish on hpScale.
function profilesRebased() {
  if (rebasedKnown) return rebasedFlag;
  rebasedKnown = true;
  rebasedFlag = false;
  try {
    var prof = enemyProfile('crawler', 5, { hpScale: 1 });
    rebasedFlag = !!(prof && prof.hp <= 55);
  } catch (err) {
    rebasedFlag = false;
  }
  return rebasedFlag;
}

export function designScales(wave) {
  var p = waveParts(wave);
  var a = p.formulaAct;
  var w = p.wIn;
  var hp = 1 + (a - 1) * 0.55 + (w - 1) * 0.12;
  var dmg = 1 + (a - 1) * 0.30 + (w - 1) * 0.05;
  var bullet = 1 + (a - 1) * 0.25 + (w - 1) * 0.04;
  var interval = Math.max(0.32, 1.08 - (a - 1) * 0.18 - (w - 1) * 0.05);
  var cap = Math.min(95, 9 + (a - 1) * 22 + (w - 1) * 5);
  var elite = 0;
  if (p.wave >= 3) elite = Math.min(0.16, 0.04 + (a - 1) * 0.04 + (w - 1) * 0.01);
  if (p.overheat > 0) {
    hp *= Math.pow(1.12, p.overheat);
    dmg *= Math.pow(1.06, p.overheat);
    bullet *= Math.pow(1.05, p.overheat);
    interval = Math.max(0.24, interval);
    cap = 95;
  }
  return {
    hp: round2(hp),
    dmg: round2(dmg),
    bullet: round2(bullet),
    interval: round2(interval),
    cap: cap,
    elite: round2(elite),
    overheat: p.overheat,
    act: p.act,
    formulaAct: a,
    wIn: w
  };
}

function bossKindFor(wave) {
  if (wave === 5) return 'titan';
  if (wave === 10) return 'dreadnought';
  if (wave === 15) return 'sovereign';
  if (wave >= 20 && wave % 5 === 0) {
    var idx = Math.floor((wave - 20) / 5) % 3;
    if (idx === 1) return 'dreadnought';
    if (idx === 2) return 'sovereign';
    return 'titan';
  }
  return null;
}

function overtimeCycle(wave) {
  if (wave >= 20 && wave % 5 === 0) return Math.floor((wave - 20) / 5);
  return 0;
}

function copyWeights(src) {
  var out = {};
  var i;
  for (i = 0; i < WEIGHT_KEYS.length; i += 1) {
    var key = WEIGHT_KEYS[i];
    out[key] = src && src[key] ? src[key] : 0;
  }
  return out;
}

function renormalize(weights) {
  var sum = 0;
  var i;
  for (i = 0; i < WEIGHT_KEYS.length; i += 1) sum += weights[WEIGHT_KEYS[i]] || 0;
  if (sum <= 0) return;
  for (i = 0; i < WEIGHT_KEYS.length; i += 1) {
    var key = WEIGHT_KEYS[i];
    weights[key] = (weights[key] || 0) / sum;
  }
}

function applyUnlock(weights, wave) {
  var i;
  for (i = 0; i < WEIGHT_KEYS.length; i += 1) {
    var key = WEIGHT_KEYS[i];
    if (wave < UNLOCK_WAVE[key]) weights[key] = 0;
  }
  renormalize(weights);
}

function legacyCuts(weights) {
  var crawler = weights.crawler || 0;
  var rusher = weights.rusher || 0;
  var brute = weights.brute || 0;
  var trio = crawler + rusher + brute;
  return {
    artilleryChance: weights.artillery || 0,
    rusherCut: trio > 0 ? rusher / trio : 0,
    bruteCut: trio > 0 ? (crawler + rusher) / trio : 1
  };
}

function weightRow(act, wIn, wave) {
  if (wave > 15) return WEIGHT_ROWS.overtime;
  if (act <= 1) return wIn <= 1 ? WEIGHT_ROWS.open : WEIGHT_ROWS.act1;
  if (act === 2) return WEIGHT_ROWS.act2;
  return WEIGHT_ROWS.act3;
}

function defaultSector(act) {
  if (act <= 1) return 'dusk';
  if (act === 2) return 'rust';
  return 'night';
}

function pickId(ids, avoid) {
  var pool = [];
  var i;
  for (i = 0; i < ids.length; i += 1) {
    if (ids[i] !== avoid) pool.push(ids[i]);
  }
  if (!pool.length) {
    for (i = 0; i < ids.length; i += 1) pool.push(ids[i]);
  }
  var idx = Math.floor(rng('director') * pool.length);
  if (idx < 0) idx = 0;
  if (idx >= pool.length) idx = pool.length - 1;
  return pool[idx];
}

function eligibleContracts(wave, eliteChance) {
  var list = [];
  if (wave >= 3) {
    list.push('barrel-kills');
    list.push('no-damage');
  }
  if (wave >= 4) {
    list.push('graze');
    list.push('just-dash');
  }
  if (wave >= 6) {
    list.push('combo');
    list.push('spire-chain');
    if (eliteChance >= 0.06) list.push('elite-hunt');
  }
  return list;
}

function rollReward(act) {
  var n = Math.floor(rng('director') * 3);
  if (n <= 0) return { type: 'reroll', amount: 1, label: '+1 REROLL' };
  if (n === 1) return { type: 'repair', amount: 25, label: 'REPAIR 25' };
  var score = 300 * (act || 1);
  return { type: 'score', amount: score, label: '+' + score + ' SCORE' };
}

function rollMutator(wave, act, boss, lastId) {
  if (boss || wave < 4) return null;
  if (wave === 4) return mutatorById(pickId(MUTATOR_IDS, lastId));
  var chance = 0;
  if (wave > 15) chance = 1;
  else if (act === 2) chance = 0.6;
  else if (act >= 3) chance = 0.8;
  if (chance <= 0) return null;
  if (rng('director') >= chance) return null;
  return mutatorById(pickId(MUTATOR_IDS, lastId));
}

function rollContract(wave, act, boss, eliteChance) {
  if (boss || wave < 3) return null;
  var list = eligibleContracts(wave, eliteChance);
  if (!list.length) return null;
  var id = pickId(list, null);
  var def = contractById(id);
  if (!def) return null;
  return {
    id: def.id,
    name: def.name,
    label: def.label,
    detail: def.detail,
    progress: 0,
    goal: def.goal,
    reward: rollReward(act),
    done: false,
    failed: false,
    resets: 0
  };
}

function actAfter(wave) {
  var next = (wave | 0) + 1;
  if (next < 1) next = 1;
  if (next <= 5) return 1;
  if (next <= 10) return 2;
  if (next <= 15) return 3;
  return Math.floor((next - 1) / 5) + 1;
}

function dailyRule(state) {
  if (!state || !state.daily) return null;
  var rule = state.daily;
  if (rule.routePlan || rule.id || typeof rule.eliteAffixMinWave === 'number' || typeof rule.stormSeconds === 'number') {
    return rule;
  }
  try {
    return getDailyRule(rule.date || rule.dateKey || '') || null;
  } catch (err) {
    return null;
  }
}

function dailyRouteIds(state) {
  var rule = dailyRule(state);
  if (!rule) return null;
  if (rule.routePlan && rule.routePlan.length) {
    var act = actAfter(state.wave || 1);
    var step;
    var s;
    for (s = 0; s < rule.routePlan.length; s += 1) {
      step = rule.routePlan[s];
      if (step && step.act === act && step.routeId && routeById(step.routeId)) return [step.routeId];
    }
    return null;
  }
  var raw = null;
  if (typeof rule === 'string') raw = [rule];
  else if (typeof rule.routeId === 'string') raw = [rule.routeId];
  else if (typeof rule.route === 'string') raw = [rule.route];
  else if (rule.routes && rule.routes.length) raw = rule.routes;
  else if (rule.routeIds && rule.routeIds.length) raw = rule.routeIds;
  if (!raw) return null;
  var out = [];
  var i;
  for (i = 0; i < raw.length && out.length < 3; i += 1) {
    if (routeById(raw[i]) && out.indexOf(raw[i]) === -1) out.push(raw[i]);
  }
  return out.length ? out : null;
}

export function rollRouteIds(state) {
  var fixed = dailyRouteIds(state);
  if (fixed) return fixed;
  var avoid = state && state.route ? state.route.id : null;
  var ids = routeIds();
  var pool = [];
  var i;
  for (i = 0; i < ids.length; i += 1) {
    if (ids[i] !== avoid) pool.push(ids[i]);
  }
  for (i = pool.length - 1; i > 0; i -= 1) {
    var j = Math.floor(rng('director') * (i + 1));
    var tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, 3);
}

function refreshCuts(recipe) {
  var cuts = legacyCuts(recipe.weights);
  recipe.artilleryChance = cuts.artilleryChance;
  recipe.rusherCut = cuts.rusherCut;
  recipe.bruteCut = cuts.bruteCut;
}

function applyRouteMods(recipe, route) {
  if (!route) return;
  if (route.bruteWeightBonus) {
    renormalize(recipe.weights);
    var bruteShare = Math.min(0.95, (recipe.weights.brute || 0) + route.bruteWeightBonus);
    var rest = 1 - (recipe.weights.brute || 0);
    var scale = rest > 0 ? (1 - bruteShare) / rest : 0;
    var bk;
    for (bk = 0; bk < WEIGHT_KEYS.length; bk += 1) {
      var bkey = WEIGHT_KEYS[bk];
      if (bkey === 'brute') recipe.weights.brute = bruteShare;
      else recipe.weights[bkey] = (recipe.weights[bkey] || 0) * scale;
    }
  }
  if (route.eliteChanceBonus) recipe.eliteChance += route.eliteChanceBonus;
  if (route.bulletSpeedScale && route.bulletSpeedScale !== 1) {
    recipe.bulletSpeedScale = round2((recipe.bulletSpeedScale || 1) * route.bulletSpeedScale);
  }
  if (route.moltenBonus) recipe.moltenBonus = (recipe.moltenBonus || 0) + route.moltenBonus;
  renormalize(recipe.weights);
}

function applyMutatorMods(recipe, mut) {
  if (!mut) return;
  if (mut.id === 'swarm') {
    recipe.weights.crawler *= 2;
    recipe.weights.scurrier *= 2;
    recipe.hpScale = round2(recipe.hpScale * 0.7);
    recipe.spawnInterval = round2(Math.max(0.2, recipe.spawnInterval * 0.6));
    recipe.killScoreMult = 1.1;
    renormalize(recipe.weights);
  } else if (mut.id === 'elite-convoy') {
    recipe.eliteChance = round2(recipe.eliteChance * 2.5);
    recipe.cap = Math.max(4, Math.round(recipe.cap * 0.7));
    recipe.crateChance = 0.4;
  } else if (mut.id === 'overcharged') {
    recipe.speedScale = 1.2;
  }
}

export function planWave(wave) {
  var parts = waveParts(wave);
  var scales = designScales(parts.wave);
  var weights = copyWeights(weightRow(parts.act, parts.wIn, parts.wave));
  applyUnlock(weights, parts.wave);
  var cuts = legacyCuts(weights);
  var rebased = profilesRebased();
  var hpScale = rebased ? scales.hp : 1;
  var dmgScale = rebased ? scales.dmg : 1;
  if (!rebased && scales.overheat > 0) {
    hpScale = round2(Math.pow(1.12, scales.overheat));
    dmgScale = round2(Math.pow(1.06, scales.overheat));
  }
  var cycle = overtimeCycle(parts.wave);
  return {
    wave: parts.wave,
    act: parts.act,
    sector: defaultSector(parts.act),
    boss: bossKindFor(parts.wave),
    mutator: null,
    contract: null,
    spawnInterval: scales.interval,
    cap: scales.cap,
    weights: weights,
    eliteChance: scales.elite,
    artilleryChance: cuts.artilleryChance,
    rusherCut: cuts.rusherCut,
    bruteCut: cuts.bruteCut,
    affixMinWave: 4,
    volatileMinWave: 8,
    splitterMinWave: 13,
    hpScale: hpScale,
    dmgScale: dmgScale,
    bulletScale: scales.bullet,
    bulletSpeedScale: 1,
    speedScale: 1,
    curveHpScale: scales.hp,
    curveDmgScale: scales.dmg,
    curveBulletScale: scales.bullet,
    bossHpScale: round2(1 + 0.35 * cycle),
    bossPhaseEarly: 0,
    bossCycle: cycle,
    moltenBonus: 0,
    killScoreMult: 1,
    crateChance: 0.15,
    overheat: scales.overheat
  };
}

function sectorFor(state, recipe) {
  if (!recipe || recipe.act <= 1) return 'dusk';
  if (state && state.route && state.route.sector) return state.route.sector;
  return defaultSector(recipe.act);
}

function rotateOvertimeRoute(state) {
  var wave = state.wave || 1;
  if (wave < 16 || ((wave - 16) % 5) !== 0) return;
  var avoid = state.route ? state.route.id : null;
  var ids = routeIds();
  var pool = [];
  var i;
  for (i = 0; i < ids.length; i += 1) {
    if (ids[i] !== avoid) pool.push(ids[i]);
  }
  if (!pool.length) pool = ids;
  var idx = Math.floor(rng('director') * pool.length);
  if (idx >= pool.length) idx = pool.length - 1;
  assignRoute(state, pool[idx], true);
}

export function onWaveStart(state) {
  if (!state) return;
  var wave = state.wave || 1;
  if (wave > 15) state.overtime = true;
  rotateOvertimeRoute(state);
  var recipe = planWave(wave);
  var heat = getHeatModifiers(state.heat || 0);
  var route = state.route || null;
  if (!profilesRebased()) {
    recipe.hpScale = recipe.overheat > 0 ? round2(Math.pow(1.12, recipe.overheat)) : 1;
    recipe.dmgScale = recipe.overheat > 0 ? round2(Math.pow(1.06, recipe.overheat)) : 1;
  }
  recipe.hpScale = round2(recipe.hpScale * (heat.enemyHpScale || 1));
  recipe.dmgScale = round2(recipe.dmgScale * (heat.enemyDmgScale || 1));
  recipe.bossHpScale = round2((recipe.bossHpScale || 1) * (heat.enemyHpScale || 1));
  recipe.bossPhaseEarly = heat.bossPhaseEarly || 0;
  recipe.eliteChance = round2((recipe.eliteChance || 0) + (heat.eliteChanceBonus || 0));
  recipe.affixMinWave = heat.eliteAffixMinWave;
  var daily = dailyRule(state);
  if (daily && typeof daily.eliteAffixMinWave === 'number') {
    recipe.affixMinWave = Math.min(recipe.affixMinWave, daily.eliteAffixMinWave);
  }
  recipe.bulletSpeedScale = heat.bulletSpeedScale || 1;
  recipe.convoyHpScale = round2((recipe.curveHpScale || 1) * (heat.enemyHpScale || 1));
  applyRouteMods(recipe, route);
  var mut = rollMutator(wave, recipe.act, recipe.boss, state.lastMutatorId || null);
  applyMutatorMods(recipe, mut);
  if (recipe.boss) recipe.spawnInterval = round2(recipe.spawnInterval * 1.6);
  if (recipe.eliteChance < 0) recipe.eliteChance = 0;
  if (recipe.eliteChance > 0.6) recipe.eliteChance = 0.6;
  refreshCuts(recipe);
  recipe.mutator = mut ? mut.id : null;
  var contract = rollContract(wave, recipe.act, recipe.boss, recipe.eliteChance);
  recipe.contract = contract ? contract.id : null;
  recipe.sector = sectorFor(state, recipe);
  state.recipe = recipe;
  state.act = recipe.act;
  state.sector = recipe.sector;
  state.overheat = recipe.overheat || 0;
  state.blackout = !!(route && route.blackout);
  var storm = heat.stormSeconds || 5;
  if (route && route.stormSeconds > storm) storm = route.stormSeconds;
  if (daily && typeof daily.stormSeconds === 'number' && daily.stormSeconds > storm) storm = daily.stormSeconds;
  state.stormSeconds = storm;
  state.moltenBonus = recipe.moltenBonus || 0;
  state.waveSettled = false;
  if (wave === 1 || (wave > 15 && ((wave - 16) % 5) === 0)) state.banishes = 1;
  if (mut) {
    state.mutator = {
      id: mut.id,
      name: mut.name,
      blurb: mut.blurb,
      detail: mut.detail,
      killScoreMult: mut.id === 'swarm' ? 1.1 : 1,
      crateChance: mut.id === 'elite-convoy' ? 0.4 : 0.15
    };
    state.lastMutatorId = mut.id;
  } else {
    state.mutator = null;
    state.lastMutatorId = null;
  }
  state.contract = contract;
  state.meteorTimer = mut && mut.id === 'scrap-rain' ? 3 : 0;
  state.barrageTimer = mut && mut.id === 'barrage' ? 5 : 0;
  state.meteors = [];
  if (mut && mut.id === 'dust-devils') {
    state.devils = [makeDevil(state, -1), makeDevil(state, 1)];
  } else {
    state.devils = [];
  }
  state.convoy = null;
  state.convoySpawned = false;
  if (route && route.convoy) state.convoyDue = 8 + rng('director') * 6;
  else state.convoyDue = 0;
}

function makeDevil(state, dir) {
  var w = (state && state.width) || 960;
  var h = (state && state.height) || 640;
  var ang = rng('director') * Math.PI * 2;
  return {
    id: dir,
    x: 80 + rng('director') * Math.max(40, w - 160),
    y: 80 + rng('director') * Math.max(40, h - 160),
    vx: Math.cos(ang) * 48 * (dir < 0 ? -1 : 1),
    vy: Math.sin(ang) * 48,
    r: 60
  };
}

function bossScoreAmount(kind, wave) {
  var base = BOSS_SCORE[kind] || BOSS_SCORE.titan;
  var cycle = overtimeCycle(wave);
  if (wave >= 20) return Math.round(base * (1 + 0.5 * cycle));
  return base;
}

export function onWaveEnd(state) {
  if (!state) return;
  if (state.waveSettled) return;
  state.waveSettled = true;
  var wave = state.wave || 1;
  addScore(100 * wave, 'wave');
  if ((state.waveDamageTaken || 0) <= 0) {
    addScore(50 * wave, 'flawless');
    state.flawlessStreak = (state.flawlessStreak || 0) + 1;
    if (state.stats) state.stats.flawlessWaves = (state.stats.flawlessWaves || 0) + 1;
  } else {
    state.flawlessStreak = 0;
  }
  if ((state.overheat || 0) > 0) addScore(500 * state.overheat, 'overtime');
  var mutId = state.mutator && state.mutator.id;
  if (!mutId && state.recipe && state.recipe.mutator) mutId = state.recipe.mutator;
  if (mutId === 'barrage') addScore(200, 'wave');
  noteMetaEvent('wave', { wave: wave });
}

export function startRun(state) {
  if (!state) return;
  state.boss = null;
  state.bossesDefeated = [];
  state.extracted = false;
  state.overtime = false;
  state.overheat = 0;
  state.interlude = null;
  state.mutator = null;
  state.lastMutatorId = null;
  state.route = null;
  state.routeHistory = [];
  state.contract = null;
  state.waveDamageTaken = 0;
  state.flawlessStreak = 0;
  state.waveSettled = false;
  state.forceWaveAdvance = false;
  state.extractDeferred = false;
  state.extractDeferredAmount = 0;
  state.extractPaid = false;
  state.banishes = 1;
  state.blackout = false;
  state.stormSeconds = 5;
  state.moltenBonus = 0;
  state.convoy = null;
  state.convoySpawned = false;
  state.convoyDue = 0;
  state.meteors = [];
  state.devils = [];
  state.routeAnnounce = null;
  state.meteorTimer = 0;
  state.barrageTimer = 0;
  onWaveStart(state);
}

export function directorStartRun(state) {
  startRun(state);
}

export function onBossDefeated(enemy) {
  if (!rt.state || !enemy || enemy._bossNoted) return;
  enemy._bossNoted = true;
  if (!rt.state.bossesDefeated) rt.state.bossesDefeated = [];
  var kind = enemy.kind || '';
  if (rt.state.recipe && rt.state.recipe.boss && (!kind || kind === 'titan' || kind === 'boss')) {
    kind = rt.state.recipe.boss;
  }
  if (!kind) kind = 'titan';
  rt.state.bossesDefeated.push(kind);
  if (rt.state.boss === enemy) rt.state.boss = null;
  addScore(bossScoreAmount(kind, rt.state.wave || 1), 'boss');
  noteMetaEvent('boss', { kind: kind, wave: rt.state.wave || 1 });
  onWaveEnd(rt.state);
  onBossCleared(rt.state);
}
