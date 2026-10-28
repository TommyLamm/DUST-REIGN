import { makeUi } from './dom-stub.mjs';
import { actBot, getBotCounters, resolveBlockers, setBotContext } from './bots.mjs';

export var DT = 1 / 60;
export var SAFETY_SECONDS = 1200;
var ARENA_W = 960;
var ARENA_H = 640;
// --world: the shipped 3520x2640 map seen through a 1280x720 viewport (makeState() with no size).
var VIEW_W = 1280;
var VIEW_H = 720;
var RESONANCE_KEYS = ['kinetic', 'plasma', 'static', 'tactical'];

var BOSS_KINDS = {
  titan: true,
  dreadnought: true,
  sovereign: true
};

function hash32(text) {
  var h = 2166136261;
  var s = String(text);
  var i;
  for (i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

var originalRandom = Math.random;

export function installSeededRandom(seed) {
  Math.random = mulberry32(hash32('math\0' + String(seed)));
  return function restoreRandom() {
    Math.random = originalRandom;
  };
}

function round(value, digits) {
  if (typeof value !== 'number' || value !== value) return value;
  var m = Math.pow(10, digits == null ? 3 : digits);
  return Math.round(value * m) / m;
}

function isBoss(enemy) {
  if (!enemy) return false;
  if (enemy.isBoss) return true;
  return Boolean(BOSS_KINDS[enemy.kind]);
}

function bump(map, key, amount) {
  var name = key || 'unknown';
  map[name] = (map[name] || 0) + (amount || 1);
}

function copyBreakdown(state) {
  var out = {};
  var src = state && state.scoreBreakdown;
  if (!src || typeof src !== 'object') return out;
  var keys = Object.keys(src);
  for (var i = 0; i < keys.length; i += 1) {
    if (typeof src[keys[i]] === 'number') out[keys[i]] = src[keys[i]];
  }
  return out;
}

function cardList(list) {
  var out = [];
  if (!list) return out;
  for (var i = 0; i < list.length; i += 1) {
    var card = list[i];
    if (!card) continue;
    out.push({
      id: card.id || '',
      title: card.title || '',
      category: card.category || ''
    });
  }
  return out;
}

function emptyDamage() {
  return {};
}

function addDamage(bucket, source, hits, hp) {
  var key = source || 'unknown';
  if (!bucket[key]) bucket[key] = { hits: 0, hp: 0 };
  bucket[key].hits += hits || 0;
  bucket[key].hp = round(bucket[key].hp + (hp || 0), 2);
}

function classifyHits(events, hurtFlash) {
  var hits = [];
  for (var i = 0; i < events.length; i += 1) {
    var ev = events[i];
    if (ev.kind !== 'playerHit') continue;
    if (ev.source) {
      hits.push(ev.source);
      continue;
    }
    if (ev.light) {
      hits.push('molten');
      continue;
    }
    var near = '';
    var from = Math.max(0, i - 3);
    var to = Math.min(events.length - 1, i + 3);
    for (var j = from; j <= to; j += 1) {
      var kind = events[j].kind;
      if (kind === 'mortar' || kind === 'core' || kind === 'barrel') near = kind;
    }
    if (near) hits.push(near);
    else if (hurtFlash >= 0.5) hits.push('contact');
    else if (hurtFlash >= 0.32 && hurtFlash < 0.4) hits.push('barrel');
    else hits.push('bullet');
  }
  return hits;
}

function syncEnemies(tracker, state, simTime, countKills) {
  var list = state.enemies || [];
  var now = new Set();
  for (var i = 0; i < list.length; i += 1) {
    var enemy = list[i];
    now.add(enemy);
    if (!tracker.known.has(enemy)) {
      tracker.known.add(enemy);
      bump(tracker.spawns, enemy.kind || 'unknown');
      if (isBoss(enemy)) {
        tracker.bosses.push({
          ref: enemy,
          kind: enemy.kind || 'boss',
          wave: state.wave || 1,
          spawnSimTime: simTime,
          killSimTime: null,
          duration: null
        });
      }
    }
  }
  if (countKills) {
    tracker.alive.forEach(function (enemy) {
      if (now.has(enemy)) return;
      bump(tracker.kills, enemy.kind || 'unknown');
      for (var b = 0; b < tracker.bosses.length; b += 1) {
        if (tracker.bosses[b].ref === enemy && tracker.bosses[b].killSimTime == null) {
          tracker.bosses[b].killSimTime = simTime;
          tracker.bosses[b].duration = round(simTime - tracker.bosses[b].spawnSimTime, 3);
          tracker.bosses[b].wave = state.wave || tracker.bosses[b].wave;
        }
      }
    });
  }
  tracker.alive = now;
}

function noteLevel(tracker, state, simTime) {
  if (tracker.level === state.level && tracker.xpNext === state.xpNext) return;
  tracker.level = state.level;
  tracker.xpNext = state.xpNext;
  tracker.xpCurve.push({
    t: round(simTime, 3),
    wave: state.wave || 1,
    level: state.level || 1,
    xp: state.xp || 0,
    xpNext: state.xpNext || 0
  });
}

function noteWave(tracker, state, simTime) {
  if ((state.wave || 1) === tracker.wave) return;
  tracker.waveTimes.push({
    wave: tracker.wave,
    seconds: round(simTime - tracker.waveStart, 3),
    completed: true,
    score: Math.round(state.score || 0)
  });
  tracker.wave = state.wave || tracker.wave;
  tracker.waveStart = simTime;
}

function rankOf(game, state) {
  if (state.evalRank && state.evalRank.letter) {
    return { letter: state.evalRank.letter, title: state.evalRank.title || '' };
  }
  if (typeof game.calculateCombatRank !== 'function') return { letter: '', title: '' };
  try {
    var rank = game.calculateCombatRank(state.wave, state.score, state.stats || {});
    return { letter: rank.letter || '', title: rank.title || '' };
  } catch (error) {
    return { letter: '', title: '' };
  }
}

function heatInfo(game, heat) {
  var modifiers = null;
  if (typeof game.getHeatModifiers === 'function') {
    try { modifiers = game.getHeatModifiers(heat); } catch (error) { modifiers = null; }
  }
  return {
    requested: heat,
    storedOnState: true,
    appliedByGame: typeof game.onWaveStart === 'function',
    modifiers: modifiers
  };
}

export function expectedLevelForWave(wave) {
  var w = wave | 0;
  if (w < 1) w = 1;
  // P2 skilled died around wave 6 at level 5: about +0.8 levels per wave.
  return 1 + Math.round((w - 1) * 0.8);
}

function applyChassis(game, state, opts) {
  if (!state || !state.player) return;
  if (opts.rig && typeof game.applyRig === 'function') {
    game.applyRig(state.player, opts.rig);
    state.rigId = opts.rig;
    state.player.hp = state.player.maxHp;
  }
  if (opts.weapon && typeof game.cycleWeaponMode === 'function') {
    game.cycleWeaponMode(opts.weapon);
  }
  if (opts.tactical && opts.tactical !== 'none' && typeof game.setTactical === 'function') {
    game.setTactical(state.player, opts.tactical);
    state.tacticalId = opts.tactical;
  }
}

function resonanceTier(count) {
  return count >= 6 ? 3 : (count >= 4 ? 2 : (count >= 2 ? 1 : 0));
}

function resonanceSnapshot(game, state) {
  var p = state && state.player;
  if (!p) return null;
  if (typeof game.evaluateArchetypes === 'function') {
    try { game.evaluateArchetypes(state, true); } catch (error) { /* keep stored counts */ }
  }
  var res = p.resonances;
  if (!res) return null;
  var counts = {};
  var tiers = {};
  var best = 0;
  for (var i = 0; i < RESONANCE_KEYS.length; i += 1) {
    var k = RESONANCE_KEYS[i];
    counts[k] = res[k] || 0;
    tiers[k] = resonanceTier(counts[k]);
    if (tiers[k] > best) best = tiers[k];
  }
  return { counts: counts, tiers: tiers, bestTier: best };
}

// Rank the run would file if the bot extracted at the wave-15 gate (extract bonus paid, extracted flag set).
function rankIfExtracted(game, state, score) {
  if (typeof game.calculateCombatRank !== 'function') return { letter: '', title: '' };
  try {
    var stats = {};
    var src = state.stats || {};
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i += 1) stats[keys[i]] = src[keys[i]];
    stats.extracted = true;
    stats.heat = state.heat | 0;
    var rank = game.calculateCombatRank(state.wave, score, stats);
    return { letter: rank.letter || '', title: rank.title || '' };
  } catch (error) {
    return { letter: '', title: '' };
  }
}

function noteGate(game, tracker, state, simTime) {
  var il = state.interlude;
  if (tracker.gate || !il || il.step !== 'extract') return;
  var bonus = typeof il.extractBonus === 'number' ? il.extractBonus : 0;
  var p = state.player || {};
  tracker.gate = {
    wave: state.wave || 0,
    simSeconds: round(simTime, 3),
    score: Math.round(state.score || 0),
    extractBonus: bonus,
    scoreIfExtracted: Math.round(state.score || 0) + bonus,
    rankIfExtracted: rankIfExtracted(game, state, Math.round(state.score || 0) + bonus),
    hpRatio: p.maxHp > 0 ? round(p.hp / p.maxHp, 3) : null,
    level: state.level || 1,
    breakdown: copyBreakdown(state),
    resonance: resonanceSnapshot(game, state)
  };
}

// Contracts are state.contract objects replaced each offered wave. Watch identity changes.
function noteContract(tracker, state) {
  var c = state.contract;
  var cur = tracker.contractCur;
  if (cur && cur.ref !== c) closeContract(tracker, cur);
  if (c && (!cur || cur.ref !== c)) {
    tracker.contractCur = { ref: c, id: c.id || '', wave: state.wave || 0, doubled: false };
    tracker.contracts.offered += 1;
    cur = tracker.contractCur;
  } else if (!c) {
    tracker.contractCur = null;
  }
  if (cur && c && c.doubled && !cur.doubled) {
    cur.doubled = true;
    tracker.contracts.doubled += 1;
  }
}

function closeContract(tracker, cur) {
  var done = Boolean(cur.ref.done);
  if (done) tracker.contracts.completed += 1;
  if (cur.doubled) {
    if (done) tracker.contracts.doubledCompleted += 1;
    else tracker.contracts.doubledFailed += 1;
  }
  var byId = tracker.contracts.byId;
  if (!byId[cur.id]) byId[cur.id] = { offered: 0, completed: 0, doubled: 0, doubledCompleted: 0 };
  byId[cur.id].offered += 1;
  if (done) byId[cur.id].completed += 1;
  if (cur.doubled) byId[cur.id].doubled += 1;
  if (cur.doubled && done) byId[cur.id].doubledCompleted += 1;
}

function injectStartWave(game, state, opts, notes) {
  var wave = opts.startWave | 0;
  if (!(wave > 1)) return;
  state.enemies = [];
  state.enemyBullets = [];
  state.bullets = [];
  state.orbs = [];
  state.artilleryTargets = [];
  state.acidPools = [];
  state.lightningStrikes = [];
  state.wave = wave;
  state.waveTime = 0;
  state.boss = null;
  state.bossSpawned = false;
  state.kills = 0;
  if (wave > 5 && game.interlude && typeof game.interlude.assignRoute === 'function') {
    var routeId = opts.route || 'ironfield';
    game.interlude.assignRoute(state, routeId, false);
    notes.push('injected route ' + (state.route && state.route.id ? state.route.id : routeId));
  } else if (opts.route && game.interlude && typeof game.interlude.assignRoute === 'function') {
    game.interlude.assignRoute(state, opts.route, false);
    notes.push('injected route ' + opts.route);
  }
  if (typeof game.onWaveStart === 'function') game.onWaveStart(state);
  var target = expectedLevelForWave(wave);
  var safety = 0;
  while ((state.level || 1) < target && safety < 48) {
    var before = state.level || 1;
    if (typeof game.addXp === 'function') game.addXp(Math.max(1, state.xpNext || 80));
    var blocked = resolveBlockers(game);
    if (blocked.notes && blocked.notes.length) notes.push.apply(notes, blocked.notes);
    if (blocked.stuck) {
      notes.push('upgrade inject stuck at level ' + (state.level || 1));
      break;
    }
    if ((state.level || 1) === before && !(state.upgradeChoices && state.upgradeChoices.length)) {
      notes.push('addXp did not raise level');
      break;
    }
    safety += 1;
  }
  if (state.player) {
    state.player.hp = state.player.maxHp;
    state.player.energy = state.player.batteryMax || state.player.maxEnergy || 100;
    state.player.invulnerable = 0;
  }
  state.paused = false;
  state.waveTime = 0;
  state.score = 0;
  if (state.scoreBreakdown && typeof state.scoreBreakdown === 'object') {
    var keys = Object.keys(state.scoreBreakdown);
    var k;
    for (k = 0; k < keys.length; k += 1) state.scoreBreakdown[keys[k]] = 0;
  }
  notes.push('start-wave ' + wave + ' level ' + (state.level || 1) + ' cards ' + ((state.acquiredUpgrades && state.acquiredUpgrades.length) || 0));
}

function startRun(game, opts) {
  var heat = opts.heat || 0;
  var rt = game.rt;
  if (!rt.input) rt.input = { keys: new Set(), mouse: { x: 0, y: 0, down: false }, touchMode: false, gamepadX: 0, gamepadY: 0 };
  if (!rt.input.keys || typeof rt.input.keys.clear !== 'function') rt.input.keys = new Set();
  rt.input.keys.clear();
  rt.input.mouse.x = (opts.world ? 1760 : ARENA_W / 2) + 100;
  rt.input.mouse.y = opts.world ? 1320 : ARENA_H / 2;
  rt.input.mouse.down = false;
  rt.input.touchMode = false;
  rt.input.gamepadX = 0;
  rt.input.gamepadY = 0;
  if (rt.firePointers && typeof rt.firePointers.clear === 'function') rt.firePointers.clear();
  rt.fxEvents = null;
  if (opts.world) {
    rt.ui = makeUi(VIEW_W, VIEW_H);
    rt.state = game.makeState();
  } else {
    rt.ui = makeUi(ARENA_W, ARENA_H);
    rt.state = game.makeState(ARENA_W, ARENA_H);
  }
  var state = rt.state;
  if (heat || heat === 0) state.heat = heat;
  if (typeof game.applyLoadout === 'function') game.applyLoadout(state);
  if (typeof game.directorStartRun === 'function') game.directorStartRun(state);
  for (var i = 0; i < 3; i += 1) game.spawnEnemy();
  if (typeof game.beginRun === 'function') game.beginRun();
  else {
    state.paused = false;
    if (typeof game.spawnBarrels === 'function') game.spawnBarrels();
    if (typeof game.spawnSpires === 'function') game.spawnSpires();
  }
  state.paused = false;
  if (opts.seed && typeof game.seedRun === 'function') game.seedRun(opts.seed);
  if (heat || heat === 0) state.heat = heat;
  applyChassis(game, state, opts);
  if ((state.heat | 0) >= 5 && typeof game.getHeatModifiers === 'function') {
    var heatMods = game.getHeatModifiers(state.heat);
    if (heatMods && typeof heatMods.startingRerolls === 'number') state.rerolls = heatMods.startingRerolls;
  }
  // beginRun applies the meta loadout, which clears the sim seed and plans
  // wave 1 before --heat is restored. Replan, then spawn.
  state.enemies = [];
  state.enemyBullets = [];
  var notes = [];
  if ((opts.startWave | 0) > 1) {
    injectStartWave(game, state, opts, notes);
  } else {
    if (opts.route && game.interlude && typeof game.interlude.assignRoute === 'function') {
      game.interlude.assignRoute(state, opts.route, false);
      notes.push('route ' + opts.route);
    }
    if (typeof game.onWaveStart === 'function') game.onWaveStart(state);
    var n;
    for (n = 0; n < 3; n += 1) game.spawnEnemy();
  }
  state.paused = false;
  opts._notes = notes;
  return state;
}

function finishBossRecords(tracker, simTime) {
  var out = [];
  for (var i = 0; i < tracker.bosses.length; i += 1) {
    var boss = tracker.bosses[i];
    var killed = boss.killSimTime != null;
    var end = killed ? boss.killSimTime : simTime;
    out.push({
      kind: boss.kind,
      wave: boss.wave,
      spawnSimTime: round(boss.spawnSimTime, 3),
      killSimTime: killed ? round(boss.killSimTime, 3) : null,
      duration: killed ? boss.duration : null,
      killed: killed,
      foughtSeconds: round(end - boss.spawnSimTime, 3)
    });
  }
  return out;
}

export function runOne(game, opts) {
  var seed = String(opts.seed);
  if (typeof game.seedRun === 'function') game.seedRun(seed);
  var restoreRandom = installSeededRandom(seed);
  try {
    return simulate(game, opts);
  } finally {
    restoreRandom();
    if (typeof game.clearSeed === 'function') game.clearSeed();
  }
}

function simulate(game, opts) {
  var started = process.hrtime.bigint();
  setBotContext(opts.bot, {
    cards: opts.cards,
    chargePolicy: opts.chargePolicy,
    tactical: opts.tactical === 'none' ? 'none' : 'auto',
    doubleDown: opts.doubleDown,
    gate: opts.gate
  });
  var state = startRun(game, opts);
  var notes = (opts._notes || []).slice();
  var maxSeconds = opts.seconds > 0 ? opts.seconds : SAFETY_SECONDS;
  var maxFrames = Math.ceil(maxSeconds / DT);
  var simTime = 0;
  var frames = 0;
  var outcome = 'death';
  var error = '';
  var tracker = {
    known: new Set(),
    alive: new Set(),
    spawns: {},
    kills: {},
    bosses: [],
    damage: emptyDamage(),
    lethal: '',
    wave: state.wave || 1,
    waveStart: 0,
    waveTimes: [],
    level: state.level || 1,
    xpNext: state.xpNext || 0,
    xpCurve: [],
    gate: null,
    contractCur: null,
    contracts: { offered: 0, completed: 0, doubled: 0, doubledCompleted: 0, doubledFailed: 0, byId: {} }
  };
  noteLevel(tracker, state, 0);
  syncEnemies(tracker, state, 0, false);
  var frameEvents = [];

  while (frames < maxFrames && !state.over) {
    noteGate(game, tracker, state, simTime);
    var blocked = resolveBlockers(game);
    if (blocked.notes.length) notes = notes.concat(blocked.notes);
    if (blocked.stuck) {
      outcome = 'stuck';
      break;
    }
    if (state.over) break;
    if (opts.waves > 0 && state.wave > opts.waves) {
      outcome = 'wave-cap';
      break;
    }
    if (simTime >= maxSeconds - 1e-9) {
      outcome = opts.seconds > 0 ? 'time-cap' : 'safety-cap';
      break;
    }
    actBot(game, opts.bot);
    var hpBefore = state.player ? state.player.hp : 0;
    frameEvents.length = 0;
    try {
      game.update(DT);
    } catch (err) {
      error = err && err.stack ? err.stack : String(err);
      outcome = 'error';
      break;
    }
    frames += 1;
    simTime += DT;
    if (typeof game.drainFxEvents === 'function') {
      game.drainFxEvents(function (ev) {
        frameEvents.push({
          kind: ev.kind || '',
          source: ev.opts && ev.opts.source ? String(ev.opts.source) : '',
          light: ev.opts && ev.opts.light ? 1 : 0
        });
      });
    }
    // Prefer the live rt.state — update() may have written lastDamageSource on it.
    state = game.rt.state || state;
    var hits = classifyHits(frameEvents, state.hurtFlash || 0);
    var hpAfter = state.player ? state.player.hp : hpBefore;
    var lost = hpBefore > hpAfter ? hpBefore - hpAfter : 0;
    var tagged = state.lastDamageSource || '';
    var blamed = tagged || (hits.length ? hits[hits.length - 1] : (lost > 0 ? 'unknown' : ''));
    if (lost > 0 && tagged) {
      addDamage(tracker.damage, tagged, Math.max(1, hits.length), lost);
    } else {
      for (var h = 0; h < hits.length; h += 1) {
        addDamage(tracker.damage, hits[h], 1, h === hits.length - 1 ? lost : 0);
      }
      if (!hits.length && lost > 0) addDamage(tracker.damage, 'unknown', 0, lost);
    }
    if ((state.over || hpAfter <= 0) && !tracker.lethal) {
      // Prefer game-authored deathCause. Only fall back to lastDamageSource if HP
      // dropped THIS frame — otherwise early-wave bullet:elite stays sticky after deny.
      var lethal = state.deathCause || '';
      if (!lethal && lost > 0) lethal = tagged || blamed || 'unknown';
      if (!lethal) lethal = 'unknown';
      if (((state.wave | 0) >= 14) && (lethal === 'bullet:elite' || lethal === 'contact:elite')) {
        lethal = (lost > 0 && tagged && tagged !== 'bullet:elite' && tagged !== 'contact:elite') ? tagged
          : (blamed && blamed !== 'bullet:elite' && blamed !== 'contact:elite' ? blamed : (state.lastNonEliteDamageSource || 'unknown'));
      }
      tracker.lethal = lethal;
    }
    syncEnemies(tracker, state, simTime, true);
    noteContract(tracker, state);
    noteWave(tracker, state, simTime);
    noteLevel(tracker, state, simTime);
  }

  if (outcome === 'death' && state.extracted) outcome = 'extract';
  if (tracker.waveTimes.length === 0 || tracker.waveTimes[tracker.waveTimes.length - 1].wave !== tracker.wave) {
    tracker.waveTimes.push({
      wave: tracker.wave,
      seconds: round(simTime - tracker.waveStart, 3),
      completed: false
    });
  }
  noteLevel(tracker, state, simTime);
  var waveReached = state.wave || 1;
  if (outcome === 'wave-cap' && opts.waves > 0) waveReached = opts.waves;
  // Do NOT re-apply sticky lastDamageSource here — it undoes the death-frame
  // elite scrub (early-wave bullet:elite survives as lastDamageSource).
  if (outcome === 'death' && (!tracker.lethal || tracker.lethal === 'unknown')) {
    if (state.deathCause && state.deathCause !== 'bullet:elite') tracker.lethal = state.deathCause;
    else if ((state.deathCause === 'bullet:elite' || state.deathCause === 'contact:elite') && ((state.wave | 0) >= 14)) tracker.lethal = state.lastNonEliteDamageSource || 'unknown';
    else if (state.deathCause) tracker.lethal = state.deathCause;
    else if (state.lastDamageSource && state.lastDamageSource !== 'bullet:elite') tracker.lethal = state.lastDamageSource;
  }
  var deathCause = outcome === 'death' ? (tracker.lethal || 'unknown') : outcome;
  if (outcome === 'extract') deathCause = 'extract';
  if (tracker.contractCur) {
    closeContract(tracker, tracker.contractCur);
    tracker.contractCur = null;
  }
  var stats = state.stats || {};
  var endlessWaves = state.overtime ? Math.max(0, waveReached - 15) : 0;
  var wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    seed: String(opts.seed),
    bot: opts.bot,
    heat: opts.heat || 0,
    startWave: opts.startWave || 1,
    rig: state.rigId || opts.rig || '',
    outcome: outcome,
    error: error,
    deathWave: waveReached,
    wavesCleared: tracker.waveTimes.filter(function (row) { return row.completed; }).length,
    censored: outcome !== 'death' && outcome !== 'extract',
    deathCause: deathCause,
    damageBySource: tracker.damage,
    waveTimes: tracker.waveTimes,
    score: Math.round(state.score || 0),
    scoreBreakdown: copyBreakdown(state),
    rank: rankOf(game, state),
    level: state.level || 1,
    xp: state.xp || 0,
    xpNext: state.xpNext || 0,
    xpCurve: tracker.xpCurve,
    spawns: tracker.spawns,
    kills: tracker.kills,
    bossKills: finishBossRecords(tracker, simTime),
    scoreBreakdownPresent: Boolean(state.scoreBreakdown && typeof state.scoreBreakdown === 'object'),
    upgrades: cardList(state.acquiredUpgrades),
    weaponMode: state.player && state.player.weaponMode ? state.player.weaponMode : '',
    tactical: state.player && state.player.tacticalSlot ? state.player.tacticalSlot.id : '',
    botOptions: {
      cards: opts.cards || 'default',
      chargePolicy: opts.chargePolicy || 'auto',
      doubleDown: opts.doubleDown || 'off',
      gate: opts.gate || 'push',
      world: Boolean(opts.world)
    },
    botCounters: getBotCounters(),
    overtime: Boolean(state.overtime),
    endlessWaves: endlessWaves,
    gate: tracker.gate,
    resonance: resonanceSnapshot(game, state),
    contracts: tracker.contracts,
    stats: {
      maxCombo: stats.maxCombo || 0,
      flawlessWaves: stats.flawlessWaves || 0,
      contractsCompleted: stats.contractsCompleted || 0,
      justDashes: stats.justDashes || 0,
      shotsFired: stats.shotsFired || 0,
      shotsHit: stats.shotsHit || 0
    },
    flawlessStreak: state.flawlessStreak || 0,
    recipe: state.recipe ? {
      wave: state.recipe.wave,
      boss: state.recipe.boss || null,
      hpScale: state.recipe.hpScale,
      dmgScale: state.recipe.dmgScale
    } : null,
    simSeconds: round(simTime, 3),
    frames: frames,
    wallMs: round(wallMs, 1),
    notes: notes,
    heatInfo: heatInfo(game, opts.heat || 0)
  };
}
