import { BEST_SCORE_KEY, LEGACY_BEST_SCORE_KEY } from '../config.js';

export var META_KEY = 'dust-reign:meta:v1';
export var BEST_SCORE_V2_KEY = 'dust-reign:best-score:v2';
export var DAILY_KEY = 'dust-reign:daily:v1';
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
  if (parsed.selectedMode === 'daily') base.selectedMode = 'daily';
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
    if (meta.selectedMode === 'daily' || meta.selectedMode === 'standard') next.selectedMode = meta.selectedMode;
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
