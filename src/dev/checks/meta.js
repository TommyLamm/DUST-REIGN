import { BEST_SCORE_KEY, LEGACY_BEST_SCORE_KEY } from '../../config.js';
import {
  BEST_SCORE_V2_KEY,
  DAILY_KEY,
  META_KEY,
  TIPS_ENABLED_KEY,
  TIPS_SEEN_KEY,
  readBestScoreV2,
  readDaily,
  readLegacyBestScore,
  readMeta,
  readTipsEnabled,
  readTipsSeen,
  writeBestScoreV2,
  writeMeta
} from '../../core/meta-store.js';
import { clearSeed, rng, seedRun } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { makeState } from '../../core/state.js';
import { getDailyRule, localDateKey } from '../../data/daily.js';
import { getHeatModifiers } from '../../data/heat.js';
import { applyRig, getRig } from '../../data/rigs.js';
import { FUSION_CHIPS } from '../../data/upgrades.js';
import { applyLoadout, listAchievements, noteMetaEvent, onRunEnd, peekRunUnlocks, resolveSelection, takeRunUnlocks } from '../../systems/meta.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function blankStats() {
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

function resetMeta(extra) {
  var next = {
    selectedMode: 'standard',
    selectedRig: 'scrapper',
    selectedWeapon: 'standard',
    selectedHeat: 0,
    heatUnlocked: 0,
    unlockedRigs: ['scrapper'],
    achievements: {},
    stats: blankStats()
  };
  var key;
  extra = extra || {};
  for (key in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) next[key] = extra[key];
  }
  assert(writeMeta(next) !== false, 'meta write failed');
}

function installStorage() {
  var keys = [META_KEY, BEST_SCORE_V2_KEY, DAILY_KEY, TIPS_SEEN_KEY, TIPS_ENABLED_KEY, BEST_SCORE_KEY, LEGACY_BEST_SCORE_KEY];
  var previousWindow;
  var mem;
  var fake;
  var saved;
  var originals;
  var i;
  function restoreSnapshot() {
    for (i = 0; i < keys.length; i += 1) {
      try {
        if (saved[keys[i]] == null) window.localStorage.removeItem(keys[i]);
        else window.localStorage.setItem(keys[i], saved[keys[i]]);
      } catch (e) {}
    }
    if (originals) {
      window.localStorage.getItem = originals.getItem;
      window.localStorage.setItem = originals.setItem;
    }
  }
  if (typeof window === 'undefined') {
    mem = Object.create(null);
    fake = {
      failRead: false,
      failWrite: false,
      getItem: function (key) {
        if (fake.failRead) throw new Error('denied');
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
      },
      setItem: function (key, value) {
        if (fake.failWrite) throw new Error('denied');
        mem[key] = String(value);
      },
      removeItem: function (key) { delete mem[key]; }
    };
    previousWindow = globalThis.window;
    globalThis.window = { localStorage: fake };
    return {
      store: fake,
      restore: function () {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
      }
    };
  }
  saved = {};
  for (i = 0; i < keys.length; i += 1) {
    try { saved[keys[i]] = window.localStorage.getItem(keys[i]); }
    catch (e) { saved[keys[i]] = null; }
  }
  for (i = 0; i < keys.length; i += 1) {
    try { window.localStorage.removeItem(keys[i]); } catch (e2) {}
  }
  originals = {
    getItem: window.localStorage.getItem,
    setItem: window.localStorage.setItem
  };
  return { store: window.localStorage, restore: restoreSnapshot, originals: originals };
}

function activeStore(installed) {
  if (installed.store && installed.store.getItem) return installed.store;
  return window.localStorage;
}

export function run() {
  var installed = installStorage();
  var store = activeStore(installed);
  var prevState = rt.state;
  var prevRandom = Math.random;
  var i;
  var meta;
  var player;
  var snap;
  var state;
  var rule;
  var again;
  var glassKey;
  var famineKey;
  var month;
  var day;
  var key;
  var seenRules;
  var routes;
  var drawA;
  var drawB;
  var calls;
  var rolled;
  var rig;
  var fresh;
  var unlocks;
  var rows;
  var dancer;
  try {
    if (typeof readTipsEnabled() !== 'boolean' || !Array.isArray(readTipsSeen())) {
      throw new Error('meta-store tips fallback failed');
    }
    store.setItem(BEST_SCORE_KEY, '42');
    store.setItem(LEGACY_BEST_SCORE_KEY, '7');
    store.setItem(META_KEY, '{');
    meta = readMeta();
    assert(meta.selectedRig === 'scrapper' && meta.stats.runs === 0 && meta.selectedMode === 'standard', 'bad meta JSON did not fall back');
    assert(store.getItem(BEST_SCORE_KEY) === '42' && store.getItem(LEGACY_BEST_SCORE_KEY) === '7', 'bad JSON touched legacy scores');
    assert(readLegacyBestScore() === 42, 'legacy best should be the higher old key');

    store.setItem(META_KEY, JSON.stringify({
      v: 1,
      selectedRig: 'strider',
      selectedWeapon: 'breacher',
      selectedHeat: 99,
      heatUnlocked: 'x',
      unlockedRigs: ['strider'],
      achievements: { dancer: '2020-01-01T00:00:00.000Z', bad: 5 },
      stats: {
        kills: 4,
        runs: 'nope',
        justDashes: 3,
        bossKills: { titan: 2, bad: 'x' },
        fusionsSeen: ['static-tempest', 3],
        seenEnemies: ['crawler']
      }
    }));
    meta = readMeta();
    assert(meta.selectedRig === 'strider' && meta.selectedWeapon === 'breacher', 'valid loadout fields were dropped');
    assert(meta.selectedHeat === 0 && meta.heatUnlocked === 0 && meta.selectedMode === 'standard', 'invalid heat fields did not fall back');
    assert(meta.unlockedRigs.indexOf('scrapper') !== -1 && meta.unlockedRigs.indexOf('strider') !== -1, 'scrapper rig was not preserved');
    assert(meta.stats.kills === 4 && meta.stats.runs === 0 && meta.stats.justDashes === 3, 'stat fields did not fall back one by one');
    assert(meta.achievements.dancer && !meta.achievements.bad, 'achievement values were not filtered');
    assert(meta.stats.bossKills.titan === 2 && !meta.stats.bossKills.bad, 'boss kill counts were not filtered');
    assert(meta.stats.fusionsSeen.length === 1 && meta.stats.seenEnemies[0] === 'crawler', 'id lists kept non-strings');

    if (store.failRead != null) {
      store.failRead = true;
      assert(readMeta().selectedRig === 'scrapper' && readBestScoreV2() === 0, 'storage read failure should fall back');
      store.failRead = false;
      store.failWrite = true;
      assert(writeMeta({ selectedRig: 'bulwark' }) === false, 'storage write failure should return false');
      store.failWrite = false;
      assert(readMeta().selectedRig === 'strider', 'failed write changed the save');
    } else {
      window.localStorage.getItem = function () { throw new Error('denied'); };
      assert(readMeta().selectedRig === 'scrapper', 'storage read failure should fall back');
      window.localStorage.getItem = installed.originals.getItem;
      window.localStorage.setItem = function () { throw new Error('denied'); };
      assert(writeBestScoreV2(5) === false, 'score write failure should return false');
      window.localStorage.setItem = installed.originals.setItem;
    }

    player = makeState(320, 240).player;
    snap = {
      hp: player.hp,
      maxHp: player.maxHp,
      speed: player.speed,
      damageTakenMult: player.damageTakenMult,
      magnetRadius: player.magnetRadius,
      xpMult: player.xpMult,
      repairBonus: player.repairBonus
    };
    applyRig(player, 'scrapper');
    assert(player.hp === snap.hp && player.maxHp === snap.maxHp && player.speed === snap.speed, 'scrapper changed stock hull');
    assert(player.damageTakenMult === snap.damageTakenMult && player.magnetRadius === snap.magnetRadius, 'scrapper changed stock mitigation');
    assert(player.xpMult === snap.xpMult && player.repairBonus === snap.repairBonus, 'scrapper changed stock salvage');
    assert(player.dashDistance === 140 && player.dashCooldownMult === 1 && player.dashHeatReset === 3 && player.crateDropMult === 1, 'scrapper dash defaults drifted');
    applyRig(player, 'strider');
    assert(player.maxHp === 80 && player.hp === 80 && player.speed === 265, 'strider hull mismatch');
    assert(player.dashCooldownMult === 0.85 && player.dashHeatReset === 2 && player.dashDistance === 140, 'strider dash mismatch');
    applyRig(player, 'bulwark');
    assert(player.maxHp === 120 && player.speed === 210 && player.damageTakenMult === 0.94 && player.repairBonus === 6 && player.dashDistance === 110, 'bulwark mismatch');
    applyRig(player, 'salvager');
    assert(player.maxHp === 100 && player.speed === 230 && player.magnetRadius === 245 && player.xpMult === 1.1 && player.crateDropMult === 1.5, 'salvager mismatch');
    applyRig(player, 'nope');
    assert(player.maxHp === 100 && player.speed === 235 && player.dashHeatReset === 3, 'unknown rig did not fall back to scrapper');

    resetMeta({ selectedRig: 'bulwark', unlockedRigs: ['scrapper'], selectedHeat: 4, heatUnlocked: 1, selectedWeapon: 'nope' });
    assert(resolveSelection().rigId === 'scrapper' && resolveSelection().heat === 1 && resolveSelection().weaponId === 'standard', 'locked loadout was not clamped');
    state = makeState(320, 240);
    applyLoadout(state);
    assert(state.rigId === 'scrapper' && state.heat === 1 && state.weaponId === 'standard' && state.player.weaponMode === 'standard', 'applyLoadout ignored the clamp');
    assert(state.rerolls === 1 && state.daily === null && state.player.damage === 26, 'standard loadout drifted');
    meta = readMeta();
    assert(meta.selectedRig === 'scrapper' && meta.selectedHeat === 1 && meta.selectedWeapon === 'standard', 'clamped loadout was not saved');

    resetMeta({
      selectedRig: 'salvager',
      selectedWeapon: 'arc-welder',
      unlockedRigs: ['scrapper', 'salvager'],
      selectedHeat: 0,
      heatUnlocked: 5
    });
    state = makeState(320, 240);
    applyLoadout(state);
    assert(state.player.weaponMode === 'arc-welder' && state.rerolls === 2 && state.player.crateDropMult === 1.5, 'salvager loadout mismatch');
    resetMeta({
      selectedRig: 'salvager',
      unlockedRigs: ['scrapper', 'salvager'],
      selectedHeat: 5,
      heatUnlocked: 5
    });
    state = makeState(320, 240);
    applyLoadout(state);
    assert(state.heat === 5 && state.rerolls === getHeatModifiers(5).startingRerolls, 'Heat 5 did not take starting rerolls');

    assert(localDateKey(new Date(2026, 9, 9)) === '2026-10-09', 'local date key mismatch');
    assert(getDailyRule(null) === null && getDailyRule('nope') === null && getDailyRule('2026-02-31') === null, 'invalid daily keys should be null');
    calls = 0;
    Math.random = function () { calls += 1; return 0.2; };
    rule = getDailyRule('2024-02-29');
    Math.random = prevRandom;
    assert(calls === 0 && rule && rule.seed === 20240229, 'daily rule consumed Math.random');
    rule = getDailyRule('2026-10-09');
    again = getDailyRule('2026-10-09');
    assert(JSON.stringify(rule) === JSON.stringify(again), 'daily rule was not deterministic');
    assert(rule.date === '2026-10-09' && rule.seed === 20261009 && rule.heat === 1, 'daily rule contract mismatch');
    assert(rule.routePlan.length === 3 && rule.routePlan[0].sector === 'dusk' && rule.routePlan[0].routeId === null, 'act 1 route mismatch');
    assert(rule.routePlan[1].routeId && rule.routePlan[1].routeId !== rule.routePlan[2].routeId, 'act routes were not fixed and distinct');
    routes = { scorched: 1, ironfield: 1, static: 1, blackout: 1, convoy: 1, stormwall: 1 };
    assert(routes[rule.routePlan[1].routeId] && routes[rule.routePlan[2].routeId], 'daily route id is unknown');
    seedRun(rule.seed);
    drawA = [rng('cards'), rng('director'), rng('spawn'), rng('loot')];
    seedRun(rule.seed);
    drawB = [rng('cards'), rng('director'), rng('spawn'), rng('loot')];
    clearSeed();
    assert(drawA.join(',') === drawB.join(','), 'daily seed streams were not deterministic');
    seenRules = {};
    glassKey = '';
    famineKey = '';
    for (month = 1; month <= 12; month += 1) {
      for (day = 1; day <= 28; day += 1) {
        key = '2026-' + pad2(month) + '-' + pad2(day);
        rule = getDailyRule(key);
        assert(rule && rule.heat === 1, 'dated rule missing');
        seenRules[rule.id] = true;
        if (!glassKey && rule.id === 'glass-rig') glassKey = key;
        if (!famineKey && rule.id === 'scrap-famine') famineKey = key;
      }
    }
    assert(seenRules['all-elites-early'] && seenRules['double-storm'] && seenRules['scrap-famine'] && seenRules['glass-rig'] && seenRules['chain-reaction'], 'a daily rule never appeared');

    resetMeta({ selectedMode: 'daily' });
    state = makeState(320, 240);
    applyLoadout(state, glassKey);
    rig = getRig(state.rigId);
    assert(state.daily && state.daily.id === 'glass-rig' && state.heat === 1, 'glass daily was not applied');
    assert(state.player.maxHp === Math.round(rig.maxHp * 0.6) && state.player.hp === state.player.maxHp, 'glass hull mismatch');
    assert(state.player.damage === Math.round(26 * 1.3), 'glass damage mismatch');
    fresh = state.player.maxHp;
    applyLoadout(state, glassKey);
    assert(state.player.maxHp === fresh && state.player.damage === Math.round(26 * 1.3), 'glass modifiers stacked on a second apply');
    drawA = rng('cards');
    seedRun(getDailyRule(glassKey).seed);
    drawB = rng('cards');
    clearSeed();
    assert(drawA === drawB, 'applyLoadout did not seed the daily run');
    state = makeState(320, 240);
    applyLoadout(state, famineKey);
    rig = getRig(state.rigId);
    assert(state.player.scrapXpMult === 0.75 && state.player.crateDropMult === rig.crateDropMult * 2, 'scrap famine multipliers mismatch');
    fresh = makeState(320, 240);
    resetMeta({ selectedMode: 'standard', selectedRig: 'scrapper', unlockedRigs: ['scrapper'], selectedHeat: 0, heatUnlocked: 0 });
    calls = 0;
    Math.random = function () { calls += 1; return 0.42; };
    applyLoadout(fresh);
    rolled = rng('spawn');
    Math.random = prevRandom;
    assert(fresh.daily === null && rolled === 0.42 && calls === 1, 'standard loadout did not clear the daily seed');

    resetMeta();
    state = makeState(320, 240);
    rt.state = state;
    applyLoadout(state);
    noteMetaEvent('player-damaged', { amount: 1 });
    noteMetaEvent('wave', { wave: 1 });
    noteMetaEvent('wave', { wave: 2 });
    noteMetaEvent('wave', { wave: 3 });
    onRunEnd(state);
    assert(!readMeta().achievements.untouchable, 'a broken flawless streak unlocked untouchable');
    onRunEnd(state);
    assert(readMeta().stats.runs === 1, 'onRunEnd counted the same run twice');
    takeRunUnlocks();

    resetMeta();
    assert(FUSION_CHIPS.length >= 2, 'fusion catalog is too small to test synthesis');
    state = makeState(320, 240);
    rt.state = state;
    applyLoadout(state);
    for (i = 0; i < 25; i += 1) noteMetaEvent('just-dash', { x: 1, y: 2 });
    for (i = 0; i < 15; i += 1) noteMetaEvent('contract', {});
    noteMetaEvent('kill', { cause: 'bullet', kind: 'crawler', elite: false, isBoss: false });
    noteMetaEvent('boss', { kind: 'titan', wave: 5 });
    noteMetaEvent('boss', { kind: 'dreadnought', wave: 10 });
    noteMetaEvent('boss', { kind: 'sovereign', wave: 15 });
    noteMetaEvent('wave', { wave: 1 });
    noteMetaEvent('wave', { wave: 2 });
    noteMetaEvent('wave', { wave: 3 });
    noteMetaEvent('barrel-chain', { count: 3 });
    noteMetaEvent('parts', { count: 2 });
    state.wave = 20;
    state.overtime = true;
    state.score = 80;
    state.acquiredUpgrades = [{ id: FUSION_CHIPS[0].id }, { id: FUSION_CHIPS[1].id }];
    onRunEnd(state);
    meta = readMeta();
    assert(meta.achievements['first-blood'] && meta.achievements['titan-fall'] && meta.achievements['dread-end'] && meta.achievements['sovereign-down'], 'boss or first-run achievements missing');
    assert(meta.achievements['wave-10'] && meta.achievements.dancer && meta.achievements.contractor, 'progression achievements missing');
    assert(meta.achievements.synthesis && meta.achievements['barrel-artist'] && meta.achievements['parts-collector'] && meta.achievements.untouchable && meta.achievements['overtime-20'], 'run achievements missing');
    assert(!meta.achievements['all-fusions'], 'all-fusions unlocked before 10 fusions were seen');
    assert(meta.unlockedRigs.indexOf('strider') !== -1 && meta.unlockedRigs.indexOf('bulwark') !== -1 && meta.unlockedRigs.indexOf('salvager') !== -1, 'rigs did not unlock');
    assert(meta.stats.justDashes >= 25 && meta.stats.contracts >= 15 && meta.stats.kills >= 1 && meta.stats.bestWave >= 20, 'cumulative stats mismatch');
    assert(meta.stats.seenEnemies.indexOf('crawler') !== -1 && meta.stats.seenEnemies.indexOf('titan') !== -1, 'seen enemies were not recorded');
    assert(meta.stats.bossKills.titan >= 1 && meta.stats.fusionsSeen.length >= 2, 'boss or fusion archive mismatch');
    assert(meta.heatUnlocked === 0 && !meta.achievements.extracted, 'heat unlocked without an extraction');
    assert(meta.stats.playTimeSec >= 0, 'play time was not recorded');
    rows = listAchievements(meta);
    dancer = null;
    for (i = 0; i < rows.length; i += 1) if (rows[i].id === 'dancer') dancer = rows[i];
    assert(dancer && dancer.unlocked && dancer.progress === 25 && dancer.goal === 25, 'dancer progress mismatch');
    unlocks = peekRunUnlocks();
    assert(unlocks.length > 0 && takeRunUnlocks().length === unlocks.length && takeRunUnlocks().length === 0, 'unlock toast queue mismatch');
    assert(peekRunUnlocks().length === unlocks.length, 'result unlock list was cleared with the toast queue');

    state = makeState(320, 240);
    rt.state = state;
    applyLoadout(state);
    state.extracted = true;
    state.heat = 0;
    state.score = 100;
    onRunEnd(state);
    meta = readMeta();
    assert(meta.achievements.extracted && meta.heatUnlocked === 1 && readBestScoreV2() === 100, 'Heat 0 extract did not unlock Heat 1 or save v2 best');

    state = makeState(320, 240);
    resetMeta({ selectedMode: 'daily', selectedHeat: 0, heatUnlocked: meta.heatUnlocked, unlockedRigs: meta.unlockedRigs, achievements: meta.achievements, stats: meta.stats });
    applyLoadout(state, glassKey);
    rt.state = state;
    state.extracted = true;
    state.score = 50;
    onRunEnd(state);
    meta = readMeta();
    assert(meta.heatUnlocked === 1 && !meta.achievements['heat-1'], 'daily extract advanced the Heat ladder');
    assert(meta.achievements.daily && meta.stats.extractions >= 1, 'daily run did not record the finish');
    assert(readDaily().date === glassKey && readDaily().best === 50 && readDaily().runs >= 1, 'daily best was not stored');
    assert(readBestScoreV2() === 100, 'a lower daily score replaced the v2 best');
    assert(store.getItem(BEST_SCORE_KEY) === '42' && store.getItem(LEGACY_BEST_SCORE_KEY) === '7', 'legacy score keys were modified');
  } finally {
    Math.random = prevRandom;
    clearSeed();
    rt.state = prevState;
    installed.restore();
  }
}

