import { BEST_SCORE_KEY, LEGACY_BEST_SCORE_KEY } from '../config.js';

export var META_KEY = 'dust-reign:meta:v1';
export var BEST_SCORE_V2_KEY = 'dust-reign:best-score:v2';
export var DAILY_KEY = 'dust-reign:daily:v1';
export var CAMPAIGN_KEY = 'dust-reign:campaign:v1';
export var HARDCORE_KEY = 'dust-reign:hardcore:v1';
export var TIPS_SEEN_KEY = 'dust-reign:tips:v1';
export var TIPS_ENABLED_KEY = 'dust-reign:tips-enabled:v1';

function storage() {
  try {
    var host = null;
    if (typeof window !== 'undefined') host = window;
    else if (typeof globalThis !== 'undefined' && globalThis.window) host = globalThis.window;
    if (!host || !host.localStorage) return null;
    return host.localStorage;
  } catch (e) {
    return null;
  }
}

function readRaw(key) {
  var store = storage();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeRaw(key, value) {
  var store = storage();
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function readJson(key) {
  var raw = readRaw(key);
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function defaultStats() {
  return {
    runs: 0,
    kills: 0,
    justDashes: 0,
    contracts: 0,
    extractions: 0,
    bestWave: 0,
    bossKills: {},
    fusionsSeen: [],
    playTimeSec: 0,
    seenEnemies: []
  };
}

function stringList(list) {
  var out = [];
  var i;
  if (!Array.isArray(list)) return out;
  for (i = 0; i < list.length; i += 1) {
    if (typeof list[i] === 'string' && list[i] && out.indexOf(list[i]) === -1) out.push(list[i]);
  }
  return out;
}

function copyStrings(src) {
  var out = {};
  var key;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  for (key in src) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (typeof src[key] === 'string' && src[key]) out[key] = src[key];
  }
  return out;
}

function copyCounts(src) {
  var out = {};
  var key;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  for (key in src) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (typeof src[key] !== 'number' || src[key] !== src[key] || src[key] < 0) continue;
    out[key] = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(src[key]));
  }
  return out;
}

function defaultMeta() {
  return {
    v: 1,
    selectedRig: 'scrapper',
    selectedWeapon: 'standard',
    selectedHeat: 0,
    selectedMode: 'standard',
    heatUnlocked: 0,
    unlockedRigs: ['scrapper'],
    achievements: {},
    stats: defaultStats()
  };
}

function num(value, min, max, fallback) {
  if (typeof value !== 'number' || value !== value) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

export function readMeta() {
  var base = defaultMeta();
  var parsed = readJson(META_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
  if (parsed.v === 1) base.v = 1;
  if (typeof parsed.selectedRig === 'string' && parsed.selectedRig) base.selectedRig = parsed.selectedRig;
  if (typeof parsed.selectedWeapon === 'string' && parsed.selectedWeapon) base.selectedWeapon = parsed.selectedWeapon;
  if (parsed.selectedMode === 'daily' || parsed.selectedMode === 'campaign' || parsed.selectedMode === 'hardcore') {
    base.selectedMode = parsed.selectedMode;
  }
  base.selectedHeat = Math.floor(num(parsed.selectedHeat, 0, 5, base.selectedHeat));
  base.heatUnlocked = Math.floor(num(parsed.heatUnlocked, 0, 5, base.heatUnlocked));
  if (Array.isArray(parsed.unlockedRigs)) base.unlockedRigs = stringList(parsed.unlockedRigs);
  if (!base.unlockedRigs.length || base.unlockedRigs.indexOf('scrapper') === -1) {
    base.unlockedRigs = ['scrapper'].concat(base.unlockedRigs.filter(function (id) { return id !== 'scrapper'; }));
  }
  if (parsed.achievements && typeof parsed.achievements === 'object' && !Array.isArray(parsed.achievements)) {
    base.achievements = copyStrings(parsed.achievements);
  }
  if (parsed.stats && typeof parsed.stats === 'object' && !Array.isArray(parsed.stats)) {
    var src = parsed.stats;
    var stats = base.stats;
    stats.runs = Math.floor(num(src.runs, 0, Number.MAX_SAFE_INTEGER, stats.runs));
    stats.kills = Math.floor(num(src.kills, 0, Number.MAX_SAFE_INTEGER, stats.kills));
    stats.justDashes = Math.floor(num(src.justDashes, 0, Number.MAX_SAFE_INTEGER, stats.justDashes));
    stats.contracts = Math.floor(num(src.contracts, 0, Number.MAX_SAFE_INTEGER, stats.contracts));
    stats.extractions = Math.floor(num(src.extractions, 0, Number.MAX_SAFE_INTEGER, stats.extractions));
    stats.bestWave = Math.floor(num(src.bestWave, 0, Number.MAX_SAFE_INTEGER, stats.bestWave));
    stats.playTimeSec = Math.floor(num(src.playTimeSec, 0, Number.MAX_SAFE_INTEGER, stats.playTimeSec));
    if (src.bossKills && typeof src.bossKills === 'object' && !Array.isArray(src.bossKills)) stats.bossKills = copyCounts(src.bossKills);
    stats.fusionsSeen = stringList(src.fusionsSeen);
    stats.seenEnemies = stringList(src.seenEnemies);
  }
  return base;
}

export function writeMeta(meta) {
  var next = readMeta();
  if (meta && typeof meta === 'object') {
    if (typeof meta.selectedRig === 'string') next.selectedRig = meta.selectedRig;
    if (typeof meta.selectedWeapon === 'string') next.selectedWeapon = meta.selectedWeapon;
    if (meta.selectedMode === 'daily' || meta.selectedMode === 'standard' || meta.selectedMode === 'campaign' || meta.selectedMode === 'hardcore') {
      next.selectedMode = meta.selectedMode;
    }
    if (typeof meta.selectedHeat === 'number') next.selectedHeat = Math.floor(num(meta.selectedHeat, 0, 5, next.selectedHeat));
    if (typeof meta.heatUnlocked === 'number') next.heatUnlocked = Math.floor(num(meta.heatUnlocked, 0, 5, next.heatUnlocked));
    if (Array.isArray(meta.unlockedRigs)) next.unlockedRigs = stringList(meta.unlockedRigs);
    if (meta.achievements && typeof meta.achievements === 'object') next.achievements = copyStrings(meta.achievements);
    if (meta.stats && typeof meta.stats === 'object') next.stats = meta.stats;
  }
  if (!next.unlockedRigs.length || next.unlockedRigs.indexOf('scrapper') === -1) {
    next.unlockedRigs = ['scrapper'].concat(next.unlockedRigs.filter(function (id) { return id !== 'scrapper'; }));
  }
  next.v = 1;
  return writeRaw(META_KEY, JSON.stringify(next));
}

function finiteScore(raw) {
  var n = Number(raw);
  if (!(n >= 0)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(n));
}

export function readLegacyBestScore() {
  return Math.max(finiteScore(readRaw(BEST_SCORE_KEY)), finiteScore(readRaw(LEGACY_BEST_SCORE_KEY)));
}

export function readBestScoreV2() {
  var n = Number(readRaw(BEST_SCORE_V2_KEY));
  if (!(n >= 0)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(n));
}

export function writeBestScoreV2(score) {
  var n = Number(score);
  if (!(n >= 0)) n = 0;
  n = Math.min(Number.MAX_SAFE_INTEGER, Math.round(n));
  return writeRaw(BEST_SCORE_V2_KEY, String(n));
}

export function readDaily() {
  var base = { date: '', best: 0, runs: 0 };
  var parsed = readJson(DAILY_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
  if (typeof parsed.date === 'string') base.date = parsed.date;
  base.best = num(parsed.best, 0, Number.MAX_SAFE_INTEGER, 0);
  base.runs = num(parsed.runs, 0, Number.MAX_SAFE_INTEGER, 0) | 0;
  return base;
}

export function writeDaily(daily) {
  var next = readDaily();
  if (daily && typeof daily === 'object') {
    if (typeof daily.date === 'string') next.date = daily.date;
    if (typeof daily.best === 'number') next.best = num(daily.best, 0, Number.MAX_SAFE_INTEGER, next.best);
    if (typeof daily.runs === 'number') next.runs = num(daily.runs, 0, Number.MAX_SAFE_INTEGER, next.runs) | 0;
  }
  return writeRaw(DAILY_KEY, JSON.stringify(next));
}

export function readTipsEnabled() {
  return readRaw(TIPS_ENABLED_KEY) !== 'false';
}

export function writeTipsEnabled(enabled) {
  return writeRaw(TIPS_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function readTipsSeen() {
  var parsed = readJson(TIPS_SEEN_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(function (id) { return typeof id === 'string' && id; });
}

export function writeTipsSeen(list) {
  var clean = Array.isArray(list) ? list.filter(function (id) { return typeof id === 'string' && id; }) : [];
  return writeRaw(TIPS_SEEN_KEY, JSON.stringify(clean));
}

export function resetTipsSeen() {
  return writeTipsSeen([]);
}

// --- Campaign & Sector Progression Store (dust-reign:campaign:v1) ---

var STAGE_CHAIN = [
  'stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4',
  'stage_2_1', 'stage_2_2', 'stage_2_3', 'stage_2_4',
  'stage_3_1', 'stage_3_2', 'stage_3_3', 'stage_3_4',
  'stage_ex_1', 'stage_ex_2', 'stage_ex_3'
];

var SECTOR_REQ_STARS = {
  1: 0,
  2: 8,
  3: 18,
  4: 28
};

function getSectorOfStage(stageId) {
  if (typeof stageId !== 'string') return 0;
  if (stageId.indexOf('stage_1_') === 0) return 1;
  if (stageId.indexOf('stage_2_') === 0) return 2;
  if (stageId.indexOf('stage_3_') === 0) return 3;
  if (stageId.indexOf('stage_ex_') === 0) return 4;
  return 0;
}

function defaultCampaign() {
  return {
    v: 1,
    unlockedStages: ['stage_1_1'],
    selectedStage: 'stage_1_1',
    stages: {},
    stats: { totalStars: 0, stagesCleared: 0, attempts: 0 },
    unlockedBoosters: []
  };
}

function isStageUnlockedInternal(stageId, store) {
  if (stageId === 'stage_1_1') return true;
  var idx = STAGE_CHAIN.indexOf(stageId);
  if (idx === -1) return false;

  var sector = getSectorOfStage(stageId);
  var minStars = SECTOR_REQ_STARS[sector] || 0;
  var totalStars = (store && store.stats && typeof store.stats.totalStars === 'number') ? store.stats.totalStars : 0;
  if (totalStars < minStars) return false;

  if (store && Array.isArray(store.unlockedStages) && store.unlockedStages.indexOf(stageId) !== -1) {
    return true;
  }

  var prevStageId = STAGE_CHAIN[idx - 1];
  var prevRecord = store && store.stages && store.stages[prevStageId];
  return !!(prevRecord && prevRecord.stars >= 1);
}

export function getCampaignStore() {
  var base = defaultCampaign();
  var parsed = readJson(CAMPAIGN_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
  if (parsed.v === 1) base.v = 1;
  if (typeof parsed.selectedStage === 'string' && parsed.selectedStage) base.selectedStage = parsed.selectedStage;
  if (Array.isArray(parsed.unlockedStages)) {
    base.unlockedStages = stringList(parsed.unlockedStages);
  }
  if (base.unlockedStages.indexOf('stage_1_1') === -1) {
    base.unlockedStages.unshift('stage_1_1');
  }
  if (parsed.stages && typeof parsed.stages === 'object' && !Array.isArray(parsed.stages)) {
    var key;
    for (key in parsed.stages) {
      if (!Object.prototype.hasOwnProperty.call(parsed.stages, key)) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      var item = parsed.stages[key];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        base.stages[key] = {
          stars: Math.floor(num(item.stars, 0, 3, 0)),
          highScore: Math.floor(num(item.highScore, 0, Number.MAX_SAFE_INTEGER, 0)),
          bestTime: num(item.bestTime, 0, Number.MAX_SAFE_INTEGER, 0),
          completedAt: typeof item.completedAt === 'string' ? item.completedAt : '',
          starDetails: {
            star1: !!(item.starDetails && item.starDetails.star1),
            star2: !!(item.starDetails && item.starDetails.star2),
            star3: !!(item.starDetails && item.starDetails.star3)
          }
        };
      }
    }
  }
  if (parsed.stats && typeof parsed.stats === 'object' && !Array.isArray(parsed.stats)) {
    base.stats.totalStars = Math.floor(num(parsed.stats.totalStars, 0, Number.MAX_SAFE_INTEGER, 0));
    base.stats.stagesCleared = Math.floor(num(parsed.stats.stagesCleared, 0, Number.MAX_SAFE_INTEGER, 0));
    base.stats.attempts = Math.floor(num(parsed.stats.attempts, 0, Number.MAX_SAFE_INTEGER, 0));
  }
  if (Array.isArray(parsed.unlockedBoosters)) {
    base.unlockedBoosters = stringList(parsed.unlockedBoosters);
  }
  return base;
}

export function saveCampaignStore(data) {
  var next = getCampaignStore();
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (typeof data.selectedStage === 'string' && data.selectedStage) next.selectedStage = data.selectedStage;
    if (Array.isArray(data.unlockedStages)) next.unlockedStages = stringList(data.unlockedStages);
    if (data.stages && typeof data.stages === 'object' && !Array.isArray(data.stages)) {
      var key;
      for (key in data.stages) {
        if (!Object.prototype.hasOwnProperty.call(data.stages, key)) continue;
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        var s = data.stages[key];
        if (s && typeof s === 'object' && !Array.isArray(s)) {
          next.stages[key] = {
            stars: Math.floor(num(s.stars, 0, 3, 0)),
            highScore: Math.floor(num(s.highScore, 0, Number.MAX_SAFE_INTEGER, 0)),
            bestTime: num(s.bestTime, 0, Number.MAX_SAFE_INTEGER, 0),
            completedAt: typeof s.completedAt === 'string' ? s.completedAt : '',
            starDetails: {
              star1: !!(s.starDetails && s.starDetails.star1),
              star2: !!(s.starDetails && s.starDetails.star2),
              star3: !!(s.starDetails && s.starDetails.star3)
            }
          };
        }
      }
    }
    if (data.stats && typeof data.stats === 'object' && !Array.isArray(data.stats)) {
      next.stats.totalStars = Math.floor(num(data.stats.totalStars, 0, Number.MAX_SAFE_INTEGER, next.stats.totalStars));
      next.stats.stagesCleared = Math.floor(num(data.stats.stagesCleared, 0, Number.MAX_SAFE_INTEGER, next.stats.stagesCleared));
      next.stats.attempts = Math.floor(num(data.stats.attempts, 0, Number.MAX_SAFE_INTEGER, next.stats.attempts));
    }
    if (Array.isArray(data.unlockedBoosters)) next.unlockedBoosters = stringList(data.unlockedBoosters);
  }
  if (next.unlockedStages.indexOf('stage_1_1') === -1) {
    next.unlockedStages.unshift('stage_1_1');
  }
  next.v = 1;
  return writeRaw(CAMPAIGN_KEY, JSON.stringify(next));
}

export function isStageUnlocked(stageId) {
  var store = getCampaignStore();
  return isStageUnlockedInternal(stageId, store);
}

export function recordStageClear(stageId, details) {
  var store = getCampaignStore();
  details = details || {};

  var prev = (store.stages && store.stages[stageId]) || {
    stars: 0,
    highScore: 0,
    bestTime: 0,
    completedAt: '',
    starDetails: { star1: false, star2: false, star3: false }
  };

  var dStar1 = !!(details.starDetails && details.starDetails.star1);
  var dStar2 = !!(details.starDetails && details.starDetails.star2);
  var dStar3 = !!(details.starDetails && details.starDetails.star3);
  var starCountInput = Math.floor(num(details.stars, 0, 3, 0));
  if (starCountInput >= 1) dStar1 = true;
  if (starCountInput >= 2) dStar2 = true;
  if (starCountInput >= 3) dStar3 = true;

  var mergedStarDetails = {
    star1: prev.starDetails.star1 || dStar1,
    star2: prev.starDetails.star2 || dStar2,
    star3: prev.starDetails.star3 || dStar3
  };

  var earnedStars = (mergedStarDetails.star1 ? 1 : 0) + (mergedStarDetails.star2 ? 1 : 0) + (mergedStarDetails.star3 ? 1 : 0);
  var finalStars = Math.max(prev.stars, earnedStars, starCountInput);
  var finalScore = Math.max(prev.highScore, Math.floor(num(details.score, 0, Number.MAX_SAFE_INTEGER, 0)));
  var inputTime = num(details.time, 0, Number.MAX_SAFE_INTEGER, 0);
  var finalBestTime = prev.bestTime > 0 ? (inputTime > 0 ? Math.min(prev.bestTime, inputTime) : prev.bestTime) : inputTime;

  store.stages[stageId] = {
    stars: finalStars,
    highScore: finalScore,
    bestTime: finalBestTime,
    completedAt: new Date().toISOString(),
    starDetails: mergedStarDetails
  };

  var totalStars = 0;
  var stagesCleared = 0;
  var k;
  for (k in store.stages) {
    if (!Object.prototype.hasOwnProperty.call(store.stages, k)) continue;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    var stg = store.stages[k];
    if (stg && stg.stars > 0) {
      totalStars += stg.stars;
      stagesCleared += 1;
    }
  }
  store.stats.totalStars = totalStars;
  store.stats.stagesCleared = stagesCleared;
  store.stats.attempts = (store.stats.attempts || 0) + 1;

  if (totalStars >= 5 && store.unlockedBoosters.indexOf('emergency_overdrive') === -1) {
    store.unlockedBoosters.push('emergency_overdrive');
  }
  if (totalStars >= 15 && store.unlockedBoosters.indexOf('resonant_emp') === -1) {
    store.unlockedBoosters.push('resonant_emp');
  }
  if (totalStars >= 25 && store.unlockedBoosters.indexOf('heavy_pierce') === -1) {
    store.unlockedBoosters.push('heavy_pierce');
  }

  var i;
  for (i = 0; i < STAGE_CHAIN.length; i += 1) {
    var checkId = STAGE_CHAIN[i];
    if (isStageUnlockedInternal(checkId, store) && store.unlockedStages.indexOf(checkId) === -1) {
      store.unlockedStages.push(checkId);
    }
  }

  saveCampaignStore(store);
  return store.stages[stageId];
}

// --- Hardcore Operations Store (dust-reign:hardcore:v1) ---

var HARDCORE_CHAIN = ['op_01', 'op_02', 'op_03', 'op_04', 'op_05', 'op_06'];

function defaultHardcore() {
  return {
    v: 1,
    selectedOperation: 'op_01',
    operations: {},
    unlockedBadges: []
  };
}

export function getHardcoreStore() {
  var base = defaultHardcore();
  var parsed = readJson(HARDCORE_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
  if (parsed.v === 1) base.v = 1;
  if (typeof parsed.selectedOperation === 'string' && parsed.selectedOperation) {
    base.selectedOperation = parsed.selectedOperation;
  }
  if (parsed.operations && typeof parsed.operations === 'object' && !Array.isArray(parsed.operations)) {
    var key;
    for (key in parsed.operations) {
      if (!Object.prototype.hasOwnProperty.call(parsed.operations, key)) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      var op = parsed.operations[key];
      if (op && typeof op === 'object' && !Array.isArray(op)) {
        base.operations[key] = {
          cleared: !!op.cleared,
          bestTime: num(op.bestTime, 0, Number.MAX_SAFE_INTEGER, 0),
          attempts: Math.floor(num(op.attempts, 0, Number.MAX_SAFE_INTEGER, 0)),
          completedAt: typeof op.completedAt === 'string' ? op.completedAt : '',
          badge: typeof op.badge === 'string' ? op.badge : ''
        };
      }
    }
  }
  if (Array.isArray(parsed.unlockedBadges)) {
    base.unlockedBadges = stringList(parsed.unlockedBadges);
  }
  return base;
}

export function saveHardcoreStore(data) {
  var next = getHardcoreStore();
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (typeof data.selectedOperation === 'string' && data.selectedOperation) {
      next.selectedOperation = data.selectedOperation;
    }
    if (data.operations && typeof data.operations === 'object' && !Array.isArray(data.operations)) {
      var key;
      for (key in data.operations) {
        if (!Object.prototype.hasOwnProperty.call(data.operations, key)) continue;
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        var op = data.operations[key];
        if (op && typeof op === 'object' && !Array.isArray(op)) {
          next.operations[key] = {
            cleared: !!op.cleared,
            bestTime: num(op.bestTime, 0, Number.MAX_SAFE_INTEGER, 0),
            attempts: Math.floor(num(op.attempts, 0, Number.MAX_SAFE_INTEGER, 0)),
            completedAt: typeof op.completedAt === 'string' ? op.completedAt : '',
            badge: typeof op.badge === 'string' ? op.badge : ''
          };
        }
      }
    }
    if (Array.isArray(data.unlockedBadges)) {
      next.unlockedBadges = stringList(data.unlockedBadges);
    }
  }
  next.v = 1;
  return writeRaw(HARDCORE_KEY, JSON.stringify(next));
}

export function isHardcoreUnlocked(operationId) {
  if (operationId === 'op_01') return true;
  var idx = HARDCORE_CHAIN.indexOf(operationId);
  if (idx === -1) return false;
  var store = getHardcoreStore();
  var prevOpId = HARDCORE_CHAIN[idx - 1];
  return !!(store.operations[prevOpId] && store.operations[prevOpId].cleared);
}

export function recordHardcoreClear(operationId, details) {
  var store = getHardcoreStore();
  details = details || {};
  var prev = store.operations[operationId] || {
    cleared: false,
    bestTime: 0,
    attempts: 0,
    completedAt: '',
    badge: ''
  };
  var inputTime = num(details.time, 0, Number.MAX_SAFE_INTEGER, 0);
  var finalBestTime = prev.bestTime > 0 ? (inputTime > 0 ? Math.min(prev.bestTime, inputTime) : prev.bestTime) : inputTime;
  var badge = typeof details.badge === 'string' && details.badge ? details.badge : (prev.badge || '');

  store.operations[operationId] = {
    cleared: true,
    bestTime: finalBestTime,
    attempts: (prev.attempts || 0) + 1,
    completedAt: new Date().toISOString(),
    badge: badge
  };

  if (badge && store.unlockedBadges.indexOf(badge) === -1) {
    store.unlockedBadges.push(badge);
  }

  saveHardcoreStore(store);
  return store.operations[operationId];
}
