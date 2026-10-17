import { BEST_SCORE_KEY, LEGACY_BEST_SCORE_KEY } from '../config.js';
import { getModule, getModuleCost, MAX_WATTAGE, MODULE_BRANCHES } from '../data/modules.js';
import { getBountiesForDate, getBountyTemplate, GRAND_SLAM_BONUS } from '../data/bounties.js';
import { CAMPAIGN_SECTORS, CAMPAIGN_STAGES, getCampaignStage } from '../data/campaign-stages.js';

export var META_KEY = 'dust-reign:meta:v1';
export var BEST_SCORE_V2_KEY = 'dust-reign:best-score:v2';
export var MOD_SCORE_V2_KEY = 'dust-reign:mod-score:v2';
export var GHOSTS_KEY = 'dust-reign:ghosts:v1';
export var DAILY_KEY = 'dust-reign:daily:v1';
export var CAMPAIGN_KEY = 'dust-reign:campaign:v1';
export var HARDCORE_KEY = 'dust-reign:hardcore:v1';
export var TIPS_SEEN_KEY = 'dust-reign:tips:v1';
export var TIPS_ENABLED_KEY = 'dust-reign:tips-enabled:v1';

function storage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    return null;
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
  return Array.from(new Set((Array.isArray(list) ? list : []).filter(function (x) { return typeof x === 'string' && x; })));
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

function defaultUnlockedModules() {
  return {
    m_phase_bearing: 1,
    m_vector_thruster: 1,
    m_kinetic_turbine: 1,
    b_reactive_plasma: 1,
    b_scrap_bulkhead: 1,
    b_aegis_core: 1,
    c_resonance_fc: 1,
    c_flux_condenser: 1,
    c_surge_unit: 1
  };
}

function defaultMeta() {
  return {
    v: 1,
    selectedRig: 'scrapper',
    selectedWeapon: 'standard',
    selectedTactical: 'sentry-turret',
    selectedHeat: 0,
    selectedMode: 'standard',
    heatUnlocked: 0,
    unlockedRigs: ['scrapper'],
    achievements: {},
    stats: defaultStats(),
    scrap: 0,
    workshop: {
      unlockedModules: defaultUnlockedModules(),
      loadout: { propulsion: null, armor: null, tactical: null }
    },
    cosmetics: {
      selectedSkin: 'default',
      selectedTrail: 'default',
      unlockedSkins: ['default'],
      unlockedTrails: ['default']
    },
    dailyContracts: {
      date: '',
      bounties: [],
      grandSlamClaimed: false
    }
  };
}

function num(value, min, max, fallback) {
  if (typeof value !== 'number' || value !== value) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

var cachedMeta = null;
var lastRawMeta = null;

export function readMeta() {
  var raw = readRaw(META_KEY);
  if (raw && raw === lastRawMeta && cachedMeta) {
    return cachedMeta;
  }
  var base = defaultMeta();
  var parsed = readJson(META_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    cachedMeta = base;
    lastRawMeta = null;
    return base;
  }
  if (parsed.v === 1) base.v = 1;
  if (typeof parsed.selectedRig === 'string' && parsed.selectedRig) base.selectedRig = parsed.selectedRig;
  if (typeof parsed.selectedWeapon === 'string' && parsed.selectedWeapon) base.selectedWeapon = parsed.selectedWeapon;
  if (typeof parsed.selectedTactical === 'string' && parsed.selectedTactical) base.selectedTactical = parsed.selectedTactical;
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
  base.scrap = Math.floor(num(parsed.scrap, 0, Number.MAX_SAFE_INTEGER, 0));
  if (parsed.workshop && typeof parsed.workshop === 'object' && !Array.isArray(parsed.workshop)) {
    var ws = parsed.workshop;
    if (ws.unlockedModules && typeof ws.unlockedModules === 'object' && !Array.isArray(ws.unlockedModules)) {
      for (var modId in ws.unlockedModules) {
        if (Object.prototype.hasOwnProperty.call(ws.unlockedModules, modId)) {
          var t = Math.floor(num(ws.unlockedModules[modId], 1, 3, 0));
          if (t >= 1) base.workshop.unlockedModules[modId] = t;
        }
      }
    }
    if (ws.loadout && typeof ws.loadout === 'object' && !Array.isArray(ws.loadout)) {
      if (typeof ws.loadout.propulsion === 'string') base.workshop.loadout.propulsion = ws.loadout.propulsion;
      if (typeof ws.loadout.armor === 'string') base.workshop.loadout.armor = ws.loadout.armor;
      if (typeof ws.loadout.tactical === 'string') base.workshop.loadout.tactical = ws.loadout.tactical;
    }
  }
  if (parsed.cosmetics && typeof parsed.cosmetics === 'object' && !Array.isArray(parsed.cosmetics)) {
    var cos = parsed.cosmetics;
    if (typeof cos.selectedSkin === 'string' && cos.selectedSkin) base.cosmetics.selectedSkin = cos.selectedSkin;
    if (typeof cos.selectedTrail === 'string' && cos.selectedTrail) base.cosmetics.selectedTrail = cos.selectedTrail;
    if (Array.isArray(cos.unlockedSkins)) base.cosmetics.unlockedSkins = stringList(cos.unlockedSkins);
    if (Array.isArray(cos.unlockedTrails)) base.cosmetics.unlockedTrails = stringList(cos.unlockedTrails);
  }
  if (base.cosmetics.unlockedSkins.indexOf('default') === -1) base.cosmetics.unlockedSkins.unshift('default');
  if (base.cosmetics.unlockedTrails.indexOf('default') === -1) base.cosmetics.unlockedTrails.unshift('default');

  if (parsed.dailyContracts && typeof parsed.dailyContracts === 'object' && !Array.isArray(parsed.dailyContracts)) {
    var dc = parsed.dailyContracts;
    if (typeof dc.date === 'string') base.dailyContracts.date = dc.date;
    if (Array.isArray(dc.bounties)) {
      base.dailyContracts.bounties = dc.bounties.map(function (b) {
        var tmpl = getBountyTemplate(b.id);
        return {
          id: typeof b.id === 'string' ? b.id : '',
          progress: Math.floor(num(b.progress, 0, Number.MAX_SAFE_INTEGER, 0)),
          goal: Math.floor(num(b.goal, 1, Number.MAX_SAFE_INTEGER, tmpl ? tmpl.goal : 1)),
          claimed: !!b.claimed,
          reward: tmpl ? tmpl.scrapReward : (typeof b.reward === 'number' ? b.reward : 100)
        };
      });
    }
    base.dailyContracts.grandSlamClaimed = !!dc.grandSlamClaimed;
  }
  cachedMeta = base;
  lastRawMeta = raw;
  return base;
}

export function writeMeta(meta) {
  var next = readMeta();
  if (meta && typeof meta === 'object') {
    if (typeof meta.selectedRig === 'string') next.selectedRig = meta.selectedRig;
    if (typeof meta.selectedWeapon === 'string') next.selectedWeapon = meta.selectedWeapon;
    if (typeof meta.selectedTactical === 'string') next.selectedTactical = meta.selectedTactical;
    if (meta.selectedMode === 'daily' || meta.selectedMode === 'standard' || meta.selectedMode === 'campaign' || meta.selectedMode === 'hardcore') {
      next.selectedMode = meta.selectedMode;
    }
    if (typeof meta.selectedHeat === 'number') next.selectedHeat = Math.floor(num(meta.selectedHeat, 0, 5, next.selectedHeat));
    if (typeof meta.heatUnlocked === 'number') next.heatUnlocked = Math.floor(num(meta.heatUnlocked, 0, 5, next.heatUnlocked));
    if (Array.isArray(meta.unlockedRigs)) next.unlockedRigs = stringList(meta.unlockedRigs);
    if (meta.achievements && typeof meta.achievements === 'object') next.achievements = copyStrings(meta.achievements);
    if (meta.stats && typeof meta.stats === 'object') next.stats = meta.stats;
    if (typeof meta.scrap === 'number') next.scrap = Math.floor(num(meta.scrap, 0, Number.MAX_SAFE_INTEGER, next.scrap));
    if (meta.workshop && typeof meta.workshop === 'object') {
      if (meta.workshop.unlockedModules) next.workshop.unlockedModules = meta.workshop.unlockedModules;
      if (meta.workshop.loadout) next.workshop.loadout = meta.workshop.loadout;
    }
    if (meta.cosmetics && typeof meta.cosmetics === 'object') {
      if (meta.cosmetics.selectedSkin) next.cosmetics.selectedSkin = meta.cosmetics.selectedSkin;
      if (meta.cosmetics.selectedTrail) next.cosmetics.selectedTrail = meta.cosmetics.selectedTrail;
      if (Array.isArray(meta.cosmetics.unlockedSkins)) next.cosmetics.unlockedSkins = stringList(meta.cosmetics.unlockedSkins);
      if (Array.isArray(meta.cosmetics.unlockedTrails)) next.cosmetics.unlockedTrails = stringList(meta.cosmetics.unlockedTrails);
    }
    if (meta.dailyContracts && typeof meta.dailyContracts === 'object') {
      next.dailyContracts = meta.dailyContracts;
    }
  }
  if (!next.unlockedRigs.length || next.unlockedRigs.indexOf('scrapper') === -1) {
    next.unlockedRigs = ['scrapper'].concat(next.unlockedRigs.filter(function (id) { return id !== 'scrapper'; }));
  }
  if (next.cosmetics.unlockedSkins.indexOf('default') === -1) next.cosmetics.unlockedSkins.unshift('default');
  if (next.cosmetics.unlockedTrails.indexOf('default') === -1) next.cosmetics.unlockedTrails.unshift('default');
  next.v = 1;
  var json = JSON.stringify(next);
  cachedMeta = next;
  lastRawMeta = json;
  return writeRaw(META_KEY, json);
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

export function readModdedBestScore() {
  var n = Number(readRaw(MOD_SCORE_V2_KEY));
  if (!(n >= 0)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(n));
}

export function writeModdedBestScore(score) {
  var n = Number(score);
  if (!(n >= 0)) n = 0;
  n = Math.min(Number.MAX_SAFE_INTEGER, Math.round(n));
  return writeRaw(MOD_SCORE_V2_KEY, String(n));
}

// --- Refined Scrap Economy Helpers ---
export function readScrap() {
  var meta = readMeta();
  return typeof meta.scrap === 'number' && meta.scrap >= 0 ? Math.floor(meta.scrap) : 0;
}

export function addScrap(amount) {
  var n = Math.floor(Number(amount) || 0);
  if (n <= 0) return readScrap();
  var meta = readMeta();
  meta.scrap = (meta.scrap || 0) + n;
  writeMeta(meta);
  return meta.scrap;
}

export function spendScrap(amount) {
  var n = Math.floor(Number(amount) || 0);
  if (n <= 0) return true;
  var meta = readMeta();
  var current = meta.scrap || 0;
  if (current < n) return false;
  meta.scrap = current - n;
  writeMeta(meta);
  return true;
}

// --- Scrapyard Workshop (6⚡ Chassis Modules) Helpers ---
export function getEquippedWattage(loadout) {
  var l = loadout || getWorkshopLoadout();
  var total = 0;
  if (!l) return total;
  for (var i = 0; i < MODULE_BRANCHES.length; i += 1) {
    var branch = MODULE_BRANCHES[i];
    var modId = l[branch];
    if (modId) {
      var mod = getModule(modId);
      if (mod) total += (mod.wattage || 0);
    }
  }
  return total;
}

export function getWorkshopState() {
  var meta = readMeta();
  var ws = meta.workshop || { unlockedModules: {}, loadout: {} };
  var loadout = {
    propulsion: ws.loadout && typeof ws.loadout.propulsion === 'string' ? ws.loadout.propulsion : null,
    armor: ws.loadout && typeof ws.loadout.armor === 'string' ? ws.loadout.armor : null,
    tactical: ws.loadout && typeof ws.loadout.tactical === 'string' ? ws.loadout.tactical : null
  };
  var unlocked = ws.unlockedModules || {};
  return {
    scrap: readScrap(),
    unlockedModules: unlocked,
    loadout: loadout,
    currentWattage: getEquippedWattage(loadout),
    maxWattage: MAX_WATTAGE
  };
}

export function getWorkshopLoadout() {
  var meta = readMeta();
  var ws = meta.workshop || { unlockedModules: {}, loadout: {} };
  return {
    propulsion: ws.loadout && typeof ws.loadout.propulsion === 'string' ? ws.loadout.propulsion : null,
    armor: ws.loadout && typeof ws.loadout.armor === 'string' ? ws.loadout.armor : null,
    tactical: ws.loadout && typeof ws.loadout.tactical === 'string' ? ws.loadout.tactical : null
  };
}

export function setWorkshopLoadout(propulsionId, armorId, tacticalId) {
  var meta = readMeta();
  if (!meta.workshop) meta.workshop = { unlockedModules: {}, loadout: {} };
  meta.workshop.loadout = {
    propulsion: propulsionId || null,
    armor: armorId || null,
    tactical: tacticalId || null
  };
  writeMeta(meta);
  return getWorkshopState();
}

export function equipModule(slotOrId, maybeId) {
  var slot;
  var moduleId;
  if (maybeId) {
    slot = slotOrId;
    moduleId = maybeId;
  } else {
    var found = getModule(slotOrId);
    if (!found) return { ok: false, success: false, reason: 'MODULE_NOT_FOUND' };
    slot = found.branch;
    moduleId = found.id;
  }

  if (MODULE_BRANCHES.indexOf(slot) === -1) return { ok: false, success: false, reason: 'INVALID_SLOT' };
  var mod = getModule(moduleId);
  if (!mod || mod.branch !== slot) return { ok: false, success: false, reason: 'BRANCH_MISMATCH' };

  var meta = readMeta();
  var ws = meta.workshop || { unlockedModules: {}, loadout: {} };
  var unlockedTier = (ws.unlockedModules && ws.unlockedModules[moduleId]) || 1;
  if (!unlockedTier) return { ok: false, success: false, reason: 'MODULE_LOCKED' };

  var nextLoadout = {
    propulsion: ws.loadout && ws.loadout.propulsion,
    armor: ws.loadout && ws.loadout.armor,
    tactical: ws.loadout && ws.loadout.tactical
  };
  nextLoadout[slot] = moduleId;
  var nextWattage = getEquippedWattage(nextLoadout);
  if (nextWattage > MAX_WATTAGE) return { ok: false, success: false, reason: 'WATTAGE_LIMIT_EXCEEDED' };

  ws.loadout = nextLoadout;
  meta.workshop = ws;
  writeMeta(meta);
  return { ok: true, success: true, loadout: nextLoadout, wattage: nextWattage };
}

export function unequipModule(slot) {
  if (MODULE_BRANCHES.indexOf(slot) === -1) return { ok: false, success: false, reason: 'INVALID_SLOT' };
  var meta = readMeta();
  if (!meta.workshop || !meta.workshop.loadout) return { ok: true, success: true };
  meta.workshop.loadout[slot] = null;
  writeMeta(meta);
  return { ok: true, success: true };
}

export function upgradeModule(moduleId) {
  var mod = getModule(moduleId);
  if (!mod) return { ok: false, success: false, reason: 'MODULE_NOT_FOUND' };
  var meta = readMeta();
  if (!meta.workshop) meta.workshop = { unlockedModules: {}, loadout: {} };
  if (!meta.workshop.unlockedModules) meta.workshop.unlockedModules = defaultUnlockedModules();
  var currentTier = (meta.workshop.unlockedModules && meta.workshop.unlockedModules[moduleId]) || 1;
  if (currentTier >= 3) return { ok: false, success: false, reason: 'MAX_TIER' };
  var cost = getModuleCost(moduleId, currentTier);
  if ((meta.scrap || 0) < cost) return { ok: false, success: false, reason: 'INSUFFICIENT_SCRAP', cost: cost };

  meta.scrap -= cost;
  meta.workshop.unlockedModules[moduleId] = currentTier + 1;
  writeMeta(meta);
  triggerCheckpointSave();
  return { ok: true, success: true, newTier: currentTier + 1, tier: currentTier + 1, cost: cost };
}

// --- Star Vault & Cosmetics Helpers ---
export var VAULT_MILESTONES = {
  15: {
    skin: 'paint_neon_dusk',
    trail: 'trail_amber_jet',
    nameZh: '荒原老兵 (15★)',
    nameEn: 'Wasteland Veteran (15★)'
  },
  30: {
    skin: 'paint_storm_surge',
    trail: 'trail_plasma_dual',
    nameZh: '戰區統治者 (30★)',
    nameEn: 'Sector Dominator (30★)'
  },
  45: {
    skin: 'paint_apex_gold',
    trail: 'trail_singularity',
    badge: 'badge_apex_reigner',
    nameZh: '荒原霸主 (45★ 滿星大圓滿)',
    nameEn: 'Dust Reigner Apex (45★)'
  }
};

export function checkStarVaultMilestones(totalStars) {
  var meta = readMeta();
  var cos = meta.cosmetics || { selectedSkin: 'default', selectedTrail: 'default', unlockedSkins: ['default'], unlockedTrails: ['default'] };
  var changed = false;

  if (totalStars >= 15) {
    if (cos.unlockedSkins.indexOf('paint_neon_dusk') === -1) { cos.unlockedSkins.push('paint_neon_dusk'); changed = true; }
    if (cos.unlockedTrails.indexOf('trail_amber_jet') === -1) { cos.unlockedTrails.push('trail_amber_jet'); changed = true; }
  }
  if (totalStars >= 30) {
    if (cos.unlockedSkins.indexOf('paint_storm_surge') === -1) { cos.unlockedSkins.push('paint_storm_surge'); changed = true; }
    if (cos.unlockedTrails.indexOf('trail_plasma_dual') === -1) { cos.unlockedTrails.push('trail_plasma_dual'); changed = true; }
  }
  if (totalStars >= 45) {
    if (cos.unlockedSkins.indexOf('paint_apex_gold') === -1) { cos.unlockedSkins.push('paint_apex_gold'); changed = true; }
    if (cos.unlockedTrails.indexOf('trail_singularity') === -1) { cos.unlockedTrails.push('trail_singularity'); changed = true; }
    if (!meta.achievements['badge_apex_reigner']) {
      meta.achievements['badge_apex_reigner'] = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) {
    meta.cosmetics = cos;
    writeMeta(meta);
  }
  return cos.unlockedSkins.concat(cos.unlockedTrails);
}

export function getCosmetics() {
  var meta = readMeta();
  return meta.cosmetics || { selectedSkin: 'default', selectedTrail: 'default', unlockedSkins: ['default'], unlockedTrails: ['default'] };
}

export function setCosmetic(type, id) {
  var meta = readMeta();
  var cos = meta.cosmetics || { selectedSkin: 'default', selectedTrail: 'default', unlockedSkins: ['default'], unlockedTrails: ['default'] };
  if (type === 'skin' && cos.unlockedSkins.indexOf(id) !== -1) {
    cos.selectedSkin = id;
    meta.cosmetics = cos;
    writeMeta(meta);
    return true;
  }
  if (type === 'trail' && cos.unlockedTrails.indexOf(id) !== -1) {
    cos.selectedTrail = id;
    meta.cosmetics = cos;
    writeMeta(meta);
    return true;
  }
  return false;
}

// --- Daily Mercenary Contracts Helpers ---
export function readDailyBounties(dateKey) {
  var meta = readMeta();
  var key = (typeof dateKey === 'string' && dateKey) ? dateKey : (meta.dailyContracts && meta.dailyContracts.date ? meta.dailyContracts.date : new Date().toISOString().slice(0, 10));
  var dc = meta.dailyContracts;
  if (!dc || dc.date !== key || !dc.bounties || !dc.bounties.length) {
    var generated = getBountiesForDate(key);
    meta.dailyContracts = {
      date: key,
      bounties: generated,
      grandSlamClaimed: false
    };
    writeMeta(meta);
    return meta.dailyContracts;
  }
  return dc;
}

export function saveDailyBounties(data) {
  var meta = readMeta();
  if (data && typeof data === 'object') {
    meta.dailyContracts = data;
    writeMeta(meta);
  }
}

export function claimDailyBounty(bountyId) {
  var dc = readDailyBounties();
  var bounty = null;
  for (var i = 0; i < dc.bounties.length; i += 1) {
    if (dc.bounties[i].id === bountyId) {
      bounty = dc.bounties[i];
      break;
    }
  }
  if (!bounty || bounty.claimed || bounty.progress < bounty.goal) return { ok: false, success: false, reason: 'NOT_ELIGIBLE' };
  var tmpl = getBountyTemplate(bountyId);
  var reward = tmpl ? tmpl.scrapReward : (typeof bounty.reward === 'number' ? bounty.reward : 100);
  bounty.claimed = true;
  addScrap(reward);
  saveDailyBounties(dc);
  triggerCheckpointSave();
  return { ok: true, success: true, reward: reward };
}

export function claimGrandSlam() {
  var dc = readDailyBounties();
  if (dc.grandSlamClaimed) return { ok: false, success: false, reason: 'ALREADY_CLAIMED' };
  var allClaimed = dc.bounties && dc.bounties.length === 3 && dc.bounties.every(function (b) { return b.claimed; });
  if (!allClaimed) return { ok: false, success: false, reason: 'NOT_ALL_CLAIMED' };
  dc.grandSlamClaimed = true;
  addScrap(GRAND_SLAM_BONUS);
  saveDailyBounties(dc);
  triggerCheckpointSave();
  return { ok: true, success: true, reward: GRAND_SLAM_BONUS };
}

// --- Ghost Replay Racing Storage (dust-reign:ghosts:v1) ---
export function getGhostsStore() {
  var parsed = readJson(GHOSTS_KEY);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

export function readGhost(stageId) {
  if (typeof stageId !== 'string' || !stageId) return null;
  var store = getGhostsStore();
  return store[stageId] || null;
}

export function writeGhost(stageId, ghostData) {
  if (typeof stageId !== 'string' || !stageId || !ghostData) return false;
  var store = getGhostsStore();
  store[stageId] = ghostData;
  return writeRaw(GHOSTS_KEY, JSON.stringify(store));
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

export function getStageChain() {
  if (Array.isArray(CAMPAIGN_STAGES)) {
    return CAMPAIGN_STAGES.map(function (s) { return s.id; });
  }
  return [];
}

export var STAGE_CHAIN = getStageChain();

export function getSectorReqStars(sectorId) {
  if (Array.isArray(CAMPAIGN_SECTORS)) {
    for (var i = 0; i < CAMPAIGN_SECTORS.length; i += 1) {
      var s = CAMPAIGN_SECTORS[i];
      if (s && s.id === sectorId && typeof s.reqStars === 'number') {
        return s.reqStars;
      }
    }
  }
  return 0;
}

export function getSectorReqStarsMap() {
  var map = {};
  if (Array.isArray(CAMPAIGN_SECTORS)) {
    for (var i = 0; i < CAMPAIGN_SECTORS.length; i += 1) {
      var s = CAMPAIGN_SECTORS[i];
      if (s && s.id != null) {
        map[s.id] = typeof s.reqStars === 'number' ? s.reqStars : 0;
      }
    }
  }
  return map;
}

export var SECTOR_REQ_STARS = getSectorReqStarsMap();

export function getSectorOfStage(stageId) {
  if (typeof stageId !== 'string' || !stageId) return 0;
  var stage = getCampaignStage(stageId);
  if (stage && typeof stage.sector === 'number') {
    return stage.sector;
  }
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
  var chain = getStageChain();
  if (chain.length > 0 && stageId === chain[0]) return true;
  if (stageId === 'stage_1_1') return true;
  var idx = chain.indexOf(stageId);
  if (idx === -1) return false;

  var sector = getSectorOfStage(stageId);
  var minStars = getSectorReqStars(sector);
  var totalStars = (store && store.stats && typeof store.stats.totalStars === 'number') ? store.stats.totalStars : 0;
  if (totalStars < minStars) return false;

  if (store && Array.isArray(store.unlockedStages) && store.unlockedStages.indexOf(stageId) !== -1) {
    return true;
  }

  var prevStageId = chain[idx - 1];
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

  var star1New = !prev.starDetails.star1 && mergedStarDetails.star1;
  var star2New = !prev.starDetails.star2 && mergedStarDetails.star2;
  var star3New = !prev.starDetails.star3 && mergedStarDetails.star3;
  var starScrap = 0;
  if (star1New) starScrap += 50;
  if (star2New) starScrap += 80;
  if (star3New) starScrap += 120;
  if (starScrap > 0) {
    addScrap(starScrap);
  }

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

  checkStarVaultMilestones(totalStars);

  if (totalStars >= 5 && store.unlockedBoosters.indexOf('emergency_overdrive') === -1) {
    store.unlockedBoosters.push('emergency_overdrive');
  }
  if (totalStars >= 15 && store.unlockedBoosters.indexOf('resonant_emp') === -1) {
    store.unlockedBoosters.push('resonant_emp');
  }
  if (totalStars >= 25 && store.unlockedBoosters.indexOf('heavy_pierce') === -1) {
    store.unlockedBoosters.push('heavy_pierce');
  }

  var chain = getStageChain();
  var i;
  for (i = 0; i < chain.length; i += 1) {
    var checkId = chain[i];
    if (isStageUnlockedInternal(checkId, store) && store.unlockedStages.indexOf(checkId) === -1) {
      store.unlockedStages.push(checkId);
    }
  }

  saveCampaignStore(store);
  triggerCheckpointSave();
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

  if (!prev.cleared) {
    addScrap(200);
  }

  if (badge && store.unlockedBadges.indexOf(badge) === -1) {
    store.unlockedBadges.push(badge);
  }

  saveHardcoreStore(store);
  triggerCheckpointSave();
  return store.operations[operationId];
}

// --- Unified Cloud Save Snapshot & Smart Merge (Schema v2) ---

var checkpointHook = null;

export function registerCheckpointHook(fn) {
  checkpointHook = fn;
}

export function triggerCheckpointSave() {
  if (typeof checkpointHook === 'function') {
    try {
      checkpointHook();
    } catch (e) {
      // Non-blocking
    }
  }
}

export function exportUnifiedSaveData() {
  var meta = readMeta();
  var camp = getCampaignStore();
  var hard = getHardcoreStore();
  var ws = getWorkshopState();
  var cos = getCosmetics();
  var bounties = readDailyBounties();
  var bestScore = readBestScoreV2();
  var modScore = readModdedBestScore();

  return {
    version: 1,
    bestScore: bestScore,
    modScore: modScore,
    meta: {
      scrap: readScrap(),
      heatUnlocked: meta.heatUnlocked || 0,
      unlockedRigs: meta.unlockedRigs ? meta.unlockedRigs.slice() : ['scrapper'],
      achievements: meta.achievements ? Object.assign({}, meta.achievements) : {},
      stats: meta.stats ? JSON.parse(JSON.stringify(meta.stats)) : defaultStats()
    },
    campaign: {
      stages: camp.stages ? JSON.parse(JSON.stringify(camp.stages)) : {},
      stats: camp.stats ? Object.assign({}, camp.stats) : { totalStars: 0, stagesCleared: 0, attempts: 0 },
      unlockedStages: camp.unlockedStages ? camp.unlockedStages.slice() : ['stage_1_1'],
      unlockedBoosters: camp.unlockedBoosters ? camp.unlockedBoosters.slice() : []
    },
    hardcore: {
      operations: hard.operations ? JSON.parse(JSON.stringify(hard.operations)) : {},
      unlockedBadges: hard.unlockedBadges ? hard.unlockedBadges.slice() : []
    },
    workshop: {
      unlockedModules: ws.unlockedModules ? Object.assign({}, ws.unlockedModules) : defaultUnlockedModules(),
      loadout: ws.loadout ? Object.assign({}, ws.loadout) : { propulsion: null, armor: null, tactical: null }
    },
    vault: {
      selectedSkin: cos.selectedSkin || 'default',
      selectedTrail: cos.selectedTrail || 'default',
      unlockedSkins: cos.unlockedSkins ? cos.unlockedSkins.slice() : ['default'],
      unlockedTrails: cos.unlockedTrails ? cos.unlockedTrails.slice() : ['default']
    },
    bounties: {
      date: bounties.date || '',
      bounties: bounties.bounties ? JSON.parse(JSON.stringify(bounties.bounties)) : [],
      grandSlamClaimed: !!bounties.grandSlamClaimed
    }
  };
}

export function importUnifiedSaveData(cloudData) {
  if (!cloudData || typeof cloudData !== 'object' || Array.isArray(cloudData)) {
    return false;
  }

  // 1. Best Score
  var localBest = readBestScoreV2();
  var cloudBest = num(cloudData.bestScore, 0, Number.MAX_SAFE_INTEGER, 0);
  if (cloudBest > localBest) {
    writeBestScoreV2(cloudBest);
  }
  if (typeof cloudData.modScore === 'number') {
    var localMod = readModdedBestScore();
    var cloudMod = num(cloudData.modScore, 0, Number.MAX_SAFE_INTEGER, 0);
    if (cloudMod > localMod) writeModdedBestScore(cloudMod);
  }

  // 2. Meta, Scrap, Workshop, Vault, Bounties
  var meta = readMeta();
  var cMeta = cloudData.meta || {};

  // Scrap: max
  var cScrap = num(cMeta.scrap != null ? cMeta.scrap : cloudData.scrap, 0, Number.MAX_SAFE_INTEGER, 0);
  meta.scrap = Math.max(meta.scrap || 0, cScrap);

  // Heat unlocked: max
  var cHeat = num(cMeta.heatUnlocked, 0, 5, 0);
  meta.heatUnlocked = Math.max(meta.heatUnlocked || 0, cHeat);

  // Unlocked rigs: union
  if (Array.isArray(cMeta.unlockedRigs)) {
    meta.unlockedRigs = stringList(meta.unlockedRigs.concat(cMeta.unlockedRigs));
  }
  if (meta.unlockedRigs.indexOf('scrapper') === -1) {
    meta.unlockedRigs.unshift('scrapper');
  }

  // Achievements: union
  if (cMeta.achievements && typeof cMeta.achievements === 'object') {
    if (!meta.achievements) meta.achievements = {};
    for (var achKey in cMeta.achievements) {
      if (Object.prototype.hasOwnProperty.call(cMeta.achievements, achKey)) {
        if (!meta.achievements[achKey]) {
          meta.achievements[achKey] = cMeta.achievements[achKey];
        }
      }
    }
  }

  // Stats: max
  if (cMeta.stats && typeof cMeta.stats === 'object') {
    var cStats = cMeta.stats;
    var lStats = meta.stats || defaultStats();
    lStats.runs = Math.max(lStats.runs || 0, num(cStats.runs, 0, Number.MAX_SAFE_INTEGER, 0));
    lStats.kills = Math.max(lStats.kills || 0, num(cStats.kills, 0, Number.MAX_SAFE_INTEGER, 0));
    lStats.justDashes = Math.max(lStats.justDashes || 0, num(cStats.justDashes, 0, Number.MAX_SAFE_INTEGER, 0));
    lStats.contracts = Math.max(lStats.contracts || 0, num(cStats.contracts, 0, Number.MAX_SAFE_INTEGER, 0));
    lStats.extractions = Math.max(lStats.extractions || 0, num(cStats.extractions, 0, Number.MAX_SAFE_INTEGER, 0));
    lStats.bestWave = Math.max(lStats.bestWave || 0, num(cStats.bestWave, 0, Number.MAX_SAFE_INTEGER, 0));
    lStats.playTimeSec = Math.max(lStats.playTimeSec || 0, num(cStats.playTimeSec, 0, Number.MAX_SAFE_INTEGER, 0));

    if (cStats.bossKills && typeof cStats.bossKills === 'object') {
      if (!lStats.bossKills) lStats.bossKills = {};
      for (var bKind in cStats.bossKills) {
        if (Object.prototype.hasOwnProperty.call(cStats.bossKills, bKind)) {
          lStats.bossKills[bKind] = Math.max(lStats.bossKills[bKind] || 0, num(cStats.bossKills[bKind], 0, Number.MAX_SAFE_INTEGER, 0));
        }
      }
    }
    if (Array.isArray(cStats.fusionsSeen)) {
      lStats.fusionsSeen = stringList((lStats.fusionsSeen || []).concat(cStats.fusionsSeen));
    }
    if (Array.isArray(cStats.seenEnemies)) {
      lStats.seenEnemies = stringList((lStats.seenEnemies || []).concat(cStats.seenEnemies));
    }
    meta.stats = lStats;
  }

  // Workshop (9 modules): max tier
  var cWs = cloudData.workshop || cMeta.workshop;
  if (cWs && typeof cWs === 'object') {
    if (!meta.workshop) meta.workshop = { unlockedModules: defaultUnlockedModules(), loadout: {} };
    if (!meta.workshop.unlockedModules) meta.workshop.unlockedModules = defaultUnlockedModules();
    if (cWs.unlockedModules && typeof cWs.unlockedModules === 'object') {
      for (var modId in cWs.unlockedModules) {
        if (Object.prototype.hasOwnProperty.call(cWs.unlockedModules, modId)) {
          var cTier = Math.floor(num(cWs.unlockedModules[modId], 1, 3, 1));
          var lTier = meta.workshop.unlockedModules[modId] || 1;
          meta.workshop.unlockedModules[modId] = Math.max(lTier, cTier);
        }
      }
    }
    if (cWs.loadout && typeof cWs.loadout === 'object') {
      var lLoadout = meta.workshop.loadout || {};
      var hasLocal = !!(lLoadout.propulsion || lLoadout.armor || lLoadout.tactical);
      if (!hasLocal && (cWs.loadout.propulsion || cWs.loadout.armor || cWs.loadout.tactical)) {
        var testLoadout = {
          propulsion: cWs.loadout.propulsion || null,
          armor: cWs.loadout.armor || null,
          tactical: cWs.loadout.tactical || null
        };
        if (getEquippedWattage(testLoadout) <= MAX_WATTAGE) {
          meta.workshop.loadout = testLoadout;
        }
      }
    }
  }

  // Vault / Cosmetics: union
  var cVault = cloudData.vault || cMeta.cosmetics;
  if (cVault && typeof cVault === 'object') {
    if (!meta.cosmetics) meta.cosmetics = { selectedSkin: 'default', selectedTrail: 'default', unlockedSkins: ['default'], unlockedTrails: ['default'] };
    if (Array.isArray(cVault.unlockedSkins)) {
      meta.cosmetics.unlockedSkins = stringList(meta.cosmetics.unlockedSkins.concat(cVault.unlockedSkins));
    }
    if (Array.isArray(cVault.unlockedTrails)) {
      meta.cosmetics.unlockedTrails = stringList(meta.cosmetics.unlockedTrails.concat(cVault.unlockedTrails));
    }
    if (meta.cosmetics.unlockedSkins.indexOf('default') === -1) meta.cosmetics.unlockedSkins.unshift('default');
    if (meta.cosmetics.unlockedTrails.indexOf('default') === -1) meta.cosmetics.unlockedTrails.unshift('default');
  }

  // Bounties: merge
  var cBounties = cloudData.bounties || cMeta.dailyContracts;
  if (cBounties && typeof cBounties === 'object' && cBounties.date) {
    var lDc = meta.dailyContracts;
    if (!lDc || !lDc.date || cBounties.date > lDc.date) {
      meta.dailyContracts = cBounties;
    } else if (cBounties.date === lDc.date && Array.isArray(cBounties.bounties)) {
      if (Array.isArray(lDc.bounties)) {
        for (var bi = 0; bi < lDc.bounties.length; bi++) {
          var lb = lDc.bounties[bi];
          for (var ci = 0; ci < cBounties.bounties.length; ci++) {
            var cb = cBounties.bounties[ci];
            if (cb && cb.id === lb.id) {
              lb.progress = Math.max(lb.progress || 0, cb.progress || 0);
              lb.claimed = lb.claimed || !!cb.claimed;
              break;
            }
          }
        }
      }
      lDc.grandSlamClaimed = lDc.grandSlamClaimed || !!cBounties.grandSlamClaimed;
    }
  }

  writeMeta(meta);

  // 3. Campaign Store: max stars, max score, min time
  if (cloudData.campaign && typeof cloudData.campaign === 'object') {
    var camp = getCampaignStore();
    var cCamp = cloudData.campaign;
    if (cCamp.stages && typeof cCamp.stages === 'object') {
      for (var stgId in cCamp.stages) {
        if (!Object.prototype.hasOwnProperty.call(cCamp.stages, stgId)) continue;
        var cs = cCamp.stages[stgId];
        if (!cs || typeof cs !== 'object') continue;
        var ls = camp.stages[stgId] || {
          stars: 0,
          highScore: 0,
          bestTime: 0,
          completedAt: '',
          starDetails: { star1: false, star2: false, star3: false }
        };
        var s1 = !!(ls.starDetails && ls.starDetails.star1) || !!(cs.starDetails && cs.starDetails.star1);
        var s2 = !!(ls.starDetails && ls.starDetails.star2) || !!(cs.starDetails && cs.starDetails.star2);
        var s3 = !!(ls.starDetails && ls.starDetails.star3) || !!(cs.starDetails && cs.starDetails.star3);
        var earnedStars = (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0);
        var cStars = Math.floor(num(cs.stars, 0, 3, 0));
        var finalStars = Math.max(ls.stars || 0, cStars, earnedStars);
        var finalScore = Math.max(ls.highScore || 0, Math.floor(num(cs.highScore, 0, Number.MAX_SAFE_INTEGER, 0)));
        var cTime = num(cs.bestTime, 0, Number.MAX_SAFE_INTEGER, 0);
        var lTime = num(ls.bestTime, 0, Number.MAX_SAFE_INTEGER, 0);
        var finalBestTime = (lTime > 0 && cTime > 0) ? Math.min(lTime, cTime) : (lTime || cTime || 0);
        var finalCompletedAt = ls.completedAt || cs.completedAt || '';
        if (ls.completedAt && cs.completedAt && cs.completedAt > ls.completedAt) {
          finalCompletedAt = cs.completedAt;
        }
        camp.stages[stgId] = {
          stars: finalStars,
          highScore: finalScore,
          bestTime: finalBestTime,
          completedAt: finalCompletedAt,
          starDetails: { star1: s1, star2: s2, star3: s3 }
        };
      }
    }
    if (Array.isArray(cCamp.unlockedStages)) {
      camp.unlockedStages = stringList(camp.unlockedStages.concat(cCamp.unlockedStages));
    }
    if (Array.isArray(cCamp.unlockedBoosters)) {
      camp.unlockedBoosters = stringList(camp.unlockedBoosters.concat(cCamp.unlockedBoosters));
    }
    var totalStars = 0;
    var stagesCleared = 0;
    for (var k in camp.stages) {
      if (camp.stages[k] && camp.stages[k].stars > 0) {
        totalStars += camp.stages[k].stars;
        stagesCleared += 1;
      }
    }
    camp.stats.totalStars = totalStars;
    camp.stats.stagesCleared = stagesCleared;
    if (cCamp.stats && typeof cCamp.stats.attempts === 'number') {
      camp.stats.attempts = Math.max(camp.stats.attempts || 0, cCamp.stats.attempts);
    }
    var chain = getStageChain();
    for (var si = 0; si < chain.length; si++) {
      var chkId = chain[si];
      if (isStageUnlockedInternal(chkId, camp) && camp.unlockedStages.indexOf(chkId) === -1) {
        camp.unlockedStages.push(chkId);
      }
    }
    checkStarVaultMilestones(totalStars);
    saveCampaignStore(camp);
  }

  // 4. Hardcore Store: union clears, min time, union badges
  if (cloudData.hardcore && typeof cloudData.hardcore === 'object') {
    var hard = getHardcoreStore();
    var cHard = cloudData.hardcore;
    if (cHard.operations && typeof cHard.operations === 'object') {
      for (var opId in cHard.operations) {
        if (!Object.prototype.hasOwnProperty.call(cHard.operations, opId)) continue;
        var co = cHard.operations[opId];
        if (!co || typeof co !== 'object') continue;
        var lo = hard.operations[opId] || {
          cleared: false,
          bestTime: 0,
          attempts: 0,
          completedAt: '',
          badge: ''
        };
        var hlTime = num(lo.bestTime, 0, Number.MAX_SAFE_INTEGER, 0);
        var hcTime = num(co.bestTime, 0, Number.MAX_SAFE_INTEGER, 0);
        var finalTime = (hlTime > 0 && hcTime > 0) ? Math.min(hlTime, hcTime) : (hlTime || hcTime || 0);
        var finalBadge = lo.badge || co.badge || '';
        var hFinalCompletedAt = lo.completedAt || co.completedAt || '';
        if (lo.completedAt && co.completedAt && co.completedAt > lo.completedAt) {
          hFinalCompletedAt = co.completedAt;
        }
        hard.operations[opId] = {
          cleared: !!(lo.cleared || co.cleared),
          bestTime: finalTime,
          attempts: Math.max(lo.attempts || 0, Math.floor(num(co.attempts, 0, Number.MAX_SAFE_INTEGER, 0))),
          completedAt: hFinalCompletedAt,
          badge: finalBadge
        };
        if (finalBadge && hard.unlockedBadges.indexOf(finalBadge) === -1) {
          hard.unlockedBadges.push(finalBadge);
        }
      }
    }
    if (Array.isArray(cHard.unlockedBadges)) {
      hard.unlockedBadges = stringList(hard.unlockedBadges.concat(cHard.unlockedBadges));
    }
    saveHardcoreStore(hard);
  }

  return true;
}

export {
  createUnifiedSave,
  applyUnifiedSave,
  calculateSaveSize,
  calculateSaveDepth,
  smartMergeSaves,
  CloudSaveManager,
  UNIFIED_SAVE_SCHEMA_VERSION
} from './cloud-save.js';

