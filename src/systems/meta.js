import {
  addScrap,
  getCosmetics,
  getWorkshopState,
  readBestScoreV2,
  readDaily,
  readDailyBounties,
  readMeta,
  readModdedBestScore,
  saveDailyBounties,
  writeBestScoreV2,
  writeDaily,
  writeMeta,
  writeModdedBestScore
} from '../core/meta-store.js';
import { rt } from '../core/runtime.js';
import { clearSeed, seedRun } from '../core/rng.js';
import { getDailyRule, localDateKey } from '../data/daily.js';
import { getHeatModifiers } from '../data/heat.js';
import { applyRig, getRig } from '../data/rigs.js';
import { FUSION_CHIPS, toPropName } from '../data/upgrades.js';
import { initPlayerTactical } from './tactical.js';

var WEAPONS = { standard: 1, breacher: 1, vanguard: 1, 'arc-welder': 1 };
var BASE_DAMAGE = 26;
var session = emptySession();
var lastRunUnlocks = [];
var toastQueue = [];

function emptySession() {
  return {
    kills: 0,
    justDashes: 0,
    contracts: 0,
    seen: [],
    bosses: {},
    maxWave: 1,
    hurtWave: false,
    flawlessStreak: 0,
    bestFlawless: 0,
    barrelChain: 0,
    parts: 0,
    pointBlankBreacherKills: 0,
    vanguardMultiKills: 0,
    arcChainKills: 0,
    repairBoxPicked: false,
    startedAt: 0
  };
}

function clampInt(value) {
  var n = Number(value);
  if (!(n >= 0)) return 0;
  if (n > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return Math.floor(n);
}

function remember(list, id) {
  if (typeof id !== 'string' || !id) return;
  if (list.indexOf(id) !== -1) return;
  if (list.length >= 64) return;
  list.push(id);
}

function weaponIdOf(id) {
  return WEAPONS[id] ? id : 'standard';
}

function bossTotal(kills, names) {
  if (!kills || !names) return 0;
  return names.reduce(function (sum, name) {
    return sum + (kills[name] || 0);
  }, 0);
}

function knownFusionCount(ids) {
  if (!ids) return 0;
  return FUSION_CHIPS.filter(function (c) { return ids.indexOf(c.id) !== -1; }).length;
}

function copyUnlock(item) {
  return { kind: item.kind, id: item.id, label: item.label };
}

export function resolveSelection(dateKey) {
  var meta = readMeta();
  var key = (typeof dateKey === 'string' && dateKey) ? dateKey : localDateKey(new Date());
  var mode = meta.selectedMode === 'daily' ? 'daily' : 'standard';
  var rule = mode === 'daily' ? getDailyRule(key) : null;
  var rigId = meta.selectedRig;
  var heat = clampInt(meta.selectedHeat);
  if (heat > 5) heat = 5;
  if (!getRig(rigId) || meta.unlockedRigs.indexOf(rigId) === -1) rigId = 'scrapper';
  if (heat > (meta.heatUnlocked | 0)) heat = meta.heatUnlocked | 0;
  if (rule) {
    if (getRig(rule.rigId)) rigId = rule.rigId;
    heat = clampInt(rule.heat);
    if (heat > 5) heat = 5;
  }
  return {
    meta: meta,
    mode: rule ? 'daily' : 'standard',
    rule: rule,
    rigId: rigId,
    weaponId: rule ? weaponIdOf(rule.weaponId) : weaponIdOf(meta.selectedWeapon),
    tacticalId: meta.selectedTactical || 'sentry-turret',
    heat: heat,
    dateKey: key
  };
}

var OVERCLOCK_STEP = 0.05;

/** Primary-bonus multiplier for a module's overclock level (1 when untuned). */
function overclockScale(tuning, moduleId) {
  var level = (moduleId && tuning && tuning[moduleId]) || 0;
  return 1 + OVERCLOCK_STEP * level;
}

export function applyLoadout(state, dateKey) {
  var pick;
  var rig;
  var daily;
  var hpMult;
  var dmgMult;
  var rerolls;
  if (!state || !state.player) return;
  pick = resolveSelection(dateKey);
  daily = !!(pick.rule && pick.mode === 'daily');
  state.rigId = pick.rigId;
  state.weaponId = pick.weaponId;
  state.tacticalId = pick.tacticalId;
  state.heat = pick.heat;
  state.daily = daily ? pick.rule : null;
  if (daily) seedRun(pick.rule.seed);
  else clearSeed();
  rig = applyRig(state.player, pick.rigId);
  hpMult = daily ? pick.rule.hpMult : 1;
  dmgMult = daily ? pick.rule.damageMult : 1;
  state.player.maxHp = Math.max(1, Math.round(rig.maxHp * hpMult));
  state.player.hp = state.player.maxHp;
  state.player.damage = Math.max(1, Math.round(BASE_DAMAGE * dmgMult));
  state.player.scrapXpMult = daily ? pick.rule.scrapXpMult : 1;
  state.player.crateDropMult = rig.crateDropMult * (daily ? pick.rule.crateMult : 1);
  state.player.weaponMode = pick.weaponId;
  initPlayerTactical(state.player, pick.tacticalId);
  rerolls = rig.rerolls;
  if ((state.heat | 0) >= 5) rerolls = getHeatModifiers(state.heat).startingRerolls;
  state.rerolls = rerolls;
  if (!daily) {
    if (pick.meta.selectedRig !== pick.rigId || pick.meta.selectedWeapon !== pick.weaponId || pick.meta.selectedTactical !== pick.tacticalId || (pick.meta.selectedHeat | 0) !== pick.heat) {
      writeMeta({ selectedRig: pick.rigId, selectedWeapon: pick.weaponId, selectedTactical: pick.tacticalId, selectedHeat: pick.heat });
    }
  }

  // Workshop modules & mode guardrails
  var wsState = getWorkshopState();
  var isHardcore = state.mode === 'hardcore';
  var hasModules = !!(wsState.loadout.propulsion || wsState.loadout.armor || wsState.loadout.tactical);
  state.isModded = (!isHardcore && state.mode === 'standard' && hasModules);

  if (!isHardcore) {
    var p = state.player;
    var unlocked = wsState.unlockedModules || {};
    var tuning = wsState.tuning || {};

    // 1. Propulsion module
    var propId = wsState.loadout.propulsion;
    var propTier = propId && unlocked[propId];
    var propOc = overclockScale(tuning, propId);
    if (propTier > 0) {
      if (propId === 'm_phase_bearing') {
        p.speed *= 0.95;
        p.justDashWindowBonus = (propTier >= 2 ? 0.40 : 0.25) * propOc;
        p.dashInvulnBonus = (propTier >= 2 ? 0.10 : 0) * propOc;
        if (propTier >= 3) p.justDashCooldownReset = true;
      } else if (propId === 'm_vector_thruster') {
        p.dashDistanceMult = 1.15;
        p.speed *= 1 + (propTier >= 2 ? 0.18 : 0.12) * propOc;
        if (propTier >= 2) {
          p.plasmaTrail = { duration: 1.5, dps: 40 * propOc, slow: propTier >= 3 ? 0.35 * propOc : 0 };
        }
      } else if (propId === 'm_kinetic_turbine') {
        // No numeric primary bonus below T3, so overclock eases the graze-radius trade-off instead.
        p.grazeRadiusMult = 1 - 0.10 / propOc;
        p.grazeKineticCharge = true;
        p.kineticCharges = 0;
        if (propTier >= 2) p.dashDetonateKinetic = true;
        if (propTier >= 3) p.kineticKnockbackDamage = 0.15 * propOc;
      }
    }

    // 2. Armor module
    var armId = wsState.loadout.armor;
    var armTier = armId && unlocked[armId];
    var armOc = overclockScale(tuning, armId);
    if (armTier > 0) {
      if (armId === 'b_reactive_plasma') {
        p.hitboxRadiusMult = 1.06;
        p.r = Math.round(p.r * 1.06);
        p.reactiveMicroEmp = {
          radius: (armTier >= 2 ? 160 : 120) * armOc,
          cd: (armTier >= 2 ? 12 : 18) / armOc,
          timer: 0,
          stun: (armTier >= 3 ? 1.0 : 0) * armOc
        };
      } else if (armId === 'b_scrap_bulkhead') {
        p.repairPickupRadiusMult = 0.85;
        p.tempArmorCap = Math.round((armTier >= 2 ? 30 : 15) * armOc);
        if (armTier >= 3) p.shieldCollisionDamageReduction = 0.20 * armOc;
      } else if (armId === 'b_aegis_core') {
        p.maxHp = Math.max(1, Math.round(p.maxHp * 0.85));
        p.hp = p.maxHp;
        p.aegisProtocol = {
          invuln: (armTier >= 2 ? 2.5 : 1.5) * armOc,
          burstSpeed: armTier >= 2 ? 1 + 0.6 * armOc : 1.0,
          refillEmp: armTier >= 3,
          used: false
        };
      }
    }

    // 3. Tactical module
    var tacId = wsState.loadout.tactical;
    var tacTier = tacId && unlocked[tacId];
    var tacOc = overclockScale(tuning, tacId);
    if (tacTier > 0) {
      if (tacId === 'c_resonance_fc') {
        p.resonanceFireControl = {
          tier: tacTier,
          tune: tacOc,
          streakPenaltyTimer: 0
        };
      } else if (tacId === 'c_flux_condenser') {
        p.recoilMult = 1.20;
        p.chargeTimeMult = 1 - (1 - (tacTier >= 2 ? 0.65 : 0.80)) * tacOc;
        p.bulletSpeedMult = 1 + ((tacTier >= 2 ? 1.25 : 1.0) - 1) * tacOc;
        if (tacTier >= 3) p.shatterArmorPierced = true;
      } else if (tacId === 'c_surge_unit') {
        p.surgeUnit = {
          tier: tacTier,
          tune: tacOc,
          active: false,
          timer: 0
        };
      }
    }
  }

  // Cosmetics
  var cosmetics = getCosmetics();
  state.player.selectedSkin = cosmetics.selectedSkin || 'default';
  state.player.selectedTrail = cosmetics.selectedTrail || 'default';

  session = emptySession();
  session.startedAt = Date.now();
}

function scanEnemies(list) {
  var enemies = list;
  var i;
  if (!enemies && rt.state) enemies = rt.state.enemies;
  if (!enemies) return;
  for (i = 0; i < enemies.length; i += 1) {
    if (enemies[i] && enemies[i].kind) remember(session.seen, enemies[i].kind);
  }
}

export function noteMetaEvent(kind, data) {
  var wave;
  var hurt;
  var chain;
  var parts;
  var add;
  data = data || {};
  if (kind === 'kill') {
    session.kills += 1;
    remember(session.seen, data.kind);
    scanEnemies();
  } else if (kind === 'player-damaged') {
    session.hurtWave = true;
  } else if (kind === 'wave') {
    wave = data.wave | 0;
    if (wave > session.maxWave) session.maxWave = wave;
    hurt = session.hurtWave;
    if (rt.state && rt.state.waveDamageTaken > 0) hurt = true;
    if (hurt) session.flawlessStreak = 0;
    else session.flawlessStreak += 1;
    if (session.flawlessStreak > session.bestFlawless) session.bestFlawless = session.flawlessStreak;
    session.hurtWave = false;
    scanEnemies();
  } else if (kind === 'boss') {
    if (typeof data.kind === 'string' && data.kind) {
      session.bosses[data.kind] = (session.bosses[data.kind] || 0) + 1;
      remember(session.seen, data.kind);
    }
  } else if (kind === 'just-dash') {
    session.justDashes += 1;
  } else if (kind === 'contract') {
    add = (typeof data.count === 'number' && data.count > 0) ? Math.floor(data.count) : 1;
    session.contracts += add;
  } else if (kind === 'barrel-chain') {
    chain = data.count || data.chain || 0;
    if (chain > session.barrelChain) session.barrelChain = chain;
  } else if (kind === 'parts') {
    parts = data.count || 0;
    if (parts > session.parts) session.parts = parts;
  } else if (kind === 'repair-pickup') {
    session.repairBoxPicked = true;
  } else if (kind === 'breacher-pointblank') {
    session.pointBlankBreacherKills = (session.pointBlankBreacherKills || 0) + (data.count || 1);
  } else if (kind === 'vanguard-multikill') {
    session.vanguardMultiKills = (session.vanguardMultiKills || 0) + (data.count || 1);
  } else if (kind === 'arc-kill') {
    session.arcChainKills = (session.arcChainKills || 0) + (data.count || 1);
  }
}

function statNum(state, key) {
  if (!state || !state.stats || typeof state.stats[key] !== 'number') return 0;
  return state.stats[key];
}

function fusionsThisRun(state) {
  var ids = [];
  var got;
  var i;
  var entry;
  var id;
  var prop;
  function add(next) {
    var known = false;
    var fi;
    if (typeof next !== 'string' || !next) return;
    for (fi = 0; fi < FUSION_CHIPS.length; fi += 1) {
      if (FUSION_CHIPS[fi].id === next) known = true;
    }
    if (!known || ids.indexOf(next) !== -1) return;
    ids.push(next);
  }
  got = (state && state.acquiredUpgrades) || [];
  for (i = 0; i < got.length; i += 1) {
    entry = got[i];
    id = typeof entry === 'string' ? entry : (entry && entry.id);
    add(id);
  }
  if (state && state.player) {
    for (i = 0; i < FUSION_CHIPS.length; i += 1) {
      prop = toPropName(FUSION_CHIPS[i].id);
      if (state.player[prop]) add(FUSION_CHIPS[i].id);
    }
  }
  return ids;
}

function tallyBosses(state) {
  var tally = {};
  var kind;
  var list;
  var seen;
  var i;
  for (kind in session.bosses) {
    if (Object.prototype.hasOwnProperty.call(session.bosses, kind)) tally[kind] = session.bosses[kind];
  }
  list = (state && state.bossesDefeated) || [];
  seen = {};
  for (i = 0; i < list.length; i += 1) {
    kind = list[i];
    if (typeof kind !== 'string' || !kind) continue;
    seen[kind] = (seen[kind] || 0) + 1;
  }
  for (kind in seen) {
    if (!Object.prototype.hasOwnProperty.call(seen, kind)) continue;
    if (!tally[kind] || seen[kind] > tally[kind]) tally[kind] = seen[kind];
  }
  return tally;
}

function pushUnlock(bucket, item) {
  bucket.push(copyUnlock(item));
}

export function onRunEnd(state) {
  var meta;
  var dailyRun;
  var bosses;
  var kind;
  var runFusions;
  var fi;
  var seen;
  var i;
  var barrel;
  var parts;
  var flawless;
  var just;
  var contracts;
  var waveReached;
  var elapsed;
  var score;
  var prevBest;
  var dailySaved;
  var heatBefore;
  var rigsBefore;
  var unlockedNow;
  var heatLevel;
  var hn;
  if (!state || state.metaAccounted) return;
  state.metaAccounted = true;
  meta = readMeta();
  dailyRun = !!(state.daily && state.daily.date);
  bosses = tallyBosses(state);
  runFusions = fusionsThisRun(state);
  seen = meta.stats.seenEnemies.slice();
  for (i = 0; i < session.seen.length; i += 1) remember(seen, session.seen[i]);
  if (state.enemies) {
    for (i = 0; i < state.enemies.length; i += 1) {
      if (state.enemies[i] && state.enemies[i].kind) remember(seen, state.enemies[i].kind);
    }
  }
  if (state.bossesDefeated) {
    for (i = 0; i < state.bossesDefeated.length; i += 1) remember(seen, state.bossesDefeated[i]);
  }
  for (fi = 0; fi < runFusions.length; fi += 1) {
    if (meta.stats.fusionsSeen.indexOf(runFusions[fi]) === -1) meta.stats.fusionsSeen.push(runFusions[fi]);
  }
  if (!meta.stats.bossKills || typeof meta.stats.bossKills !== 'object') meta.stats.bossKills = {};
  for (kind in bosses) {
    if (!Object.prototype.hasOwnProperty.call(bosses, kind)) continue;
    meta.stats.bossKills[kind] = clampInt((meta.stats.bossKills[kind] || 0) + bosses[kind]);
  }
  just = Math.max(session.justDashes, statNum(state, 'justDashes'));
  contracts = Math.max(session.contracts, statNum(state, 'contractsCompleted'));
  waveReached = Math.max(session.maxWave, clampInt(state.wave), 1);
  barrel = Math.max(session.barrelChain, statNum(state, 'barrelChainMax'));
  parts = Math.max(session.parts, statNum(state, 'partsDestroyed'));
  flawless = Math.max(session.bestFlawless, clampInt(state.flawlessStreak));
  elapsed = session.startedAt ? Math.max(0, (Date.now() - session.startedAt) / 1000) : 0;
  meta.stats.runs = clampInt(meta.stats.runs + 1);
  meta.stats.kills = clampInt(meta.stats.kills + session.kills);
  meta.stats.justDashes = clampInt(meta.stats.justDashes + just);
  meta.stats.contracts = clampInt(meta.stats.contracts + contracts);
  if (state.extracted) meta.stats.extractions = clampInt(meta.stats.extractions + 1);
  if (waveReached > meta.stats.bestWave) meta.stats.bestWave = waveReached;
  meta.stats.playTimeSec = clampInt(meta.stats.playTimeSec + Math.round(elapsed));
  meta.stats.seenEnemies = seen;

  unlockedNow = [];
  function grant(id, label) {
    if (meta.achievements[id]) return;
    meta.achievements[id] = new Date().toISOString();
    pushUnlock(unlockedNow, { kind: 'achievement', id: id, label: 'UNLOCKED // ' + label });
  }
  if (meta.stats.runs >= 1) grant('first-blood', 'FIRST BLOOD');
  if (bossTotal(meta.stats.bossKills, ['titan']) >= 1) grant('titan-fall', 'TITAN FALL');
  if (bossTotal(meta.stats.bossKills, ['dreadnought']) >= 1) grant('dread-end', 'DREAD END');
  if (bossTotal(meta.stats.bossKills, ['sovereign', 'storm-sovereign', 'stormsovereign']) >= 1) grant('sovereign-down', 'SOVEREIGN DOWN');
  if (meta.stats.bestWave >= 10) grant('wave-10', 'WAVE 10');
  if (meta.stats.justDashes >= 25) grant('dancer', 'DANCER');
  if (meta.stats.contracts >= 15) grant('contractor', 'CONTRACTOR');
  if (runFusions.length >= 2) grant('synthesis', 'SYNTHESIS');
  if (knownFusionCount(meta.stats.fusionsSeen) >= 10) grant('all-fusions', 'ALL FUSIONS');
  if (barrel >= 3) grant('barrel-artist', 'BARREL ARTIST');
  if (flawless >= 3) grant('untouchable', 'UNTOUCHABLE');
  if (parts >= 2) grant('parts-collector', 'PARTS COLLECTOR');
  if (state.overtime && clampInt(state.wave) >= 20) grant('overtime-20', 'OVERTIME 20');
  if (dailyRun) grant('daily', 'DAILY');
  heatLevel = clampInt(state.heat);
  if (heatLevel > 5) heatLevel = 5;
  if (!dailyRun && state.extracted) {
    if (heatLevel <= 0) grant('extracted', 'EXTRACTED');
    else grant('heat-' + heatLevel, 'HEAT ' + heatLevel);
  }

  rigsBefore = meta.unlockedRigs.slice();
  if (meta.achievements['wave-10'] && meta.unlockedRigs.indexOf('bulwark') === -1) meta.unlockedRigs.push('bulwark');
  if (meta.achievements.dancer && meta.unlockedRigs.indexOf('strider') === -1) meta.unlockedRigs.push('strider');
  if (meta.achievements.contractor && meta.unlockedRigs.indexOf('salvager') === -1) meta.unlockedRigs.push('salvager');
  if (rigsBefore.indexOf('bulwark') === -1 && meta.unlockedRigs.indexOf('bulwark') !== -1) {
    pushUnlock(unlockedNow, { kind: 'rig', id: 'bulwark', label: 'BULWARK UNLOCKED' });
  }
  if (rigsBefore.indexOf('strider') === -1 && meta.unlockedRigs.indexOf('strider') !== -1) {
    pushUnlock(unlockedNow, { kind: 'rig', id: 'strider', label: 'STRIDER UNLOCKED' });
  }
  if (rigsBefore.indexOf('salvager') === -1 && meta.unlockedRigs.indexOf('salvager') !== -1) {
    pushUnlock(unlockedNow, { kind: 'rig', id: 'salvager', label: 'SALVAGER UNLOCKED' });
  }

  heatBefore = meta.heatUnlocked | 0;
  if (!dailyRun) {
    if (meta.achievements.extracted && meta.heatUnlocked < 1) meta.heatUnlocked = 1;
    for (hn = 1; hn <= 4; hn += 1) {
      if (meta.achievements['heat-' + hn] && meta.heatUnlocked < hn + 1) meta.heatUnlocked = hn + 1;
    }
    if (meta.heatUnlocked > 5) meta.heatUnlocked = 5;
    for (hn = heatBefore + 1; hn <= meta.heatUnlocked; hn += 1) {
      pushUnlock(unlockedNow, { kind: 'heat', id: 'heat-' + hn, label: 'HEAT ' + hn + ' UNLOCKED' });
    }
  }

  writeMeta({
    selectedRig: meta.selectedRig,
    selectedWeapon: meta.selectedWeapon,
    selectedMode: meta.selectedMode,
    selectedHeat: meta.selectedHeat,
    heatUnlocked: meta.heatUnlocked,
    unlockedRigs: meta.unlockedRigs,
    achievements: meta.achievements,
    stats: meta.stats
  });

  // 1. Refined Scrap Economy: Single-run conversion floor(scrap / 60)
  var singleRunScrap = state.totalScrapCollected || state.scrapCollectedInStage || state.xp || 0;
  var refinedScrap = Math.floor(singleRunScrap / 60);
  if (refinedScrap > 0) {
    addScrap(refinedScrap);
  }
  state.refinedScrapEarned = refinedScrap;

  // 2. Daily Bounties Progress Update
  var dc = readDailyBounties();
  if (dc && Array.isArray(dc.bounties)) {
    var dcChanged = false;
    for (var bi = 0; bi < dc.bounties.length; bi += 1) {
      var b = dc.bounties[bi];
      if (b.claimed) continue;
      var curProg = b.progress || 0;
      if (b.id === 'bounty_clean_streak') {
        var streakSec = Math.max(session.bestFlawless * 4, flawless * 4);
        if (streakSec > curProg) { b.progress = Math.min(b.goal, streakSec); dcChanged = true; }
      } else if (b.id === 'bounty_just_master') {
        var justCount = Math.max(session.justDashes, just);
        if (justCount > curProg) { b.progress = Math.min(b.goal, justCount); dcChanged = true; }
      } else if (b.id === 'bounty_graze_king') {
        var grazes = statNum(state, 'grazes');
        if (grazes > curProg) { b.progress = Math.min(b.goal, grazes); dcChanged = true; }
      } else if (b.id === 'bounty_breacher_pointblank') {
        var pbKills = curProg + (session.pointBlankBreacherKills || 0);
        if (pbKills !== curProg) { b.progress = Math.min(b.goal, pbKills); dcChanged = true; }
      } else if (b.id === 'bounty_vanguard_pierce') {
        var vgKills = curProg + (session.vanguardMultiKills || 0);
        if (vgKills !== curProg) { b.progress = Math.min(b.goal, vgKills); dcChanged = true; }
      } else if (b.id === 'bounty_arc_conductor') {
        var arcK = curProg + (session.arcChainKills || 0);
        if (arcK !== curProg) { b.progress = Math.min(b.goal, arcK); dcChanged = true; }
      } else if (b.id === 'bounty_high_heat_rush') {
        if (state.heat >= 1 && waveReached >= 5 && !session.repairBoxPicked) {
          b.progress = b.goal;
          dcChanged = true;
        }
      } else if (b.id === 'bounty_titan_breaker') {
        if (parts >= 2) {
          b.progress = b.goal;
          dcChanged = true;
        }
      } else if (b.id === 'bounty_speed_sector') {
        if (state.mode === 'campaign' && state.stageCleared && (state.stageElapsed || 0) <= 60) {
          b.progress = b.goal;
          dcChanged = true;
        }
      }
    }
    if (dcChanged) {
      saveDailyBounties(dc);
    }
  }

  // 3. High score handling (Standard vanilla vs modded score separation)
  score = clampInt(Math.round(Number(state.score) || 0));
  if (!state.isModded) {
    prevBest = readBestScoreV2();
    if (score > prevBest) writeBestScoreV2(score);
  } else {
    var curModBest = readModdedBestScore();
    if (score > curModBest) writeModdedBestScore(score);
  }
  if (dailyRun) {
    dailySaved = readDaily();
    if (dailySaved.date !== state.daily.date) dailySaved = { date: state.daily.date, best: 0, runs: 0 };
    dailySaved.runs = clampInt(dailySaved.runs + 1);
    if (score > dailySaved.best) dailySaved.best = score;
    writeDaily(dailySaved);
  }
  lastRunUnlocks = unlockedNow.map(copyUnlock);
  for (i = 0; i < unlockedNow.length; i += 1) toastQueue.push(copyUnlock(unlockedNow[i]));
  if (toastQueue.length > 24) toastQueue = toastQueue.slice(toastQueue.length - 24);
  session = emptySession();
}

export function peekRunUnlocks() {
  return lastRunUnlocks.map(copyUnlock);
}

export function takeRunUnlocks() {
  var out = toastQueue.map(copyUnlock);
  toastQueue = [];
  return out;
}

export function listAchievements(meta) {
  var m = meta || readMeta();
  var stats = m.stats;
  var bosses = stats.bossKills || {};
  var fusions = knownFusionCount(stats.fusionsSeen);
  var defs = [
    { id: 'first-blood', title: 'FIRST BLOOD', detail: 'Finish a run.', reward: '', progress: Math.min(1, stats.runs), goal: 1 },
    { id: 'titan-fall', title: 'TITAN FALL', detail: 'Defeat a Titan.', reward: '', progress: Math.min(1, bossTotal(bosses, ['titan'])), goal: 1 },
    { id: 'dread-end', title: 'DREAD END', detail: 'Defeat a Dreadnought.', reward: '', progress: Math.min(1, bossTotal(bosses, ['dreadnought'])), goal: 1 },
    { id: 'sovereign-down', title: 'SOVEREIGN DOWN', detail: 'Defeat the Storm Sovereign.', reward: '', progress: Math.min(1, bossTotal(bosses, ['sovereign', 'storm-sovereign', 'stormsovereign'])), goal: 1 },
    { id: 'extracted', title: 'EXTRACTED', detail: 'Extract on Heat 0.', reward: 'Unlocks Heat 1', progress: m.achievements.extracted ? 1 : 0, goal: 1 },
    { id: 'heat-1', title: 'HEAT 1', detail: 'Extract on Heat 1.', reward: 'Unlocks Heat 2', progress: m.achievements['heat-1'] ? 1 : 0, goal: 1 },
    { id: 'heat-2', title: 'HEAT 2', detail: 'Extract on Heat 2.', reward: 'Unlocks Heat 3', progress: m.achievements['heat-2'] ? 1 : 0, goal: 1 },
    { id: 'heat-3', title: 'HEAT 3', detail: 'Extract on Heat 3.', reward: 'Unlocks Heat 4', progress: m.achievements['heat-3'] ? 1 : 0, goal: 1 },
    { id: 'heat-4', title: 'HEAT 4', detail: 'Extract on Heat 4.', reward: 'Unlocks Heat 5', progress: m.achievements['heat-4'] ? 1 : 0, goal: 1 },
    { id: 'heat-5', title: 'HEAT 5', detail: 'Extract on Heat 5.', reward: '', progress: m.achievements['heat-5'] ? 1 : 0, goal: 1 },
    { id: 'wave-10', title: 'WAVE 10', detail: 'Reach wave 10.', reward: 'Unlocks Bulwark', progress: Math.min(10, stats.bestWave), goal: 10 },
    { id: 'dancer', title: 'DANCER', detail: 'Land 25 Just Dashes.', reward: 'Unlocks Strider', progress: Math.min(25, stats.justDashes), goal: 25 },
    { id: 'contractor', title: 'CONTRACTOR', detail: 'Complete 15 contracts.', reward: 'Unlocks Salvager', progress: Math.min(15, stats.contracts), goal: 15 },
    { id: 'synthesis', title: 'SYNTHESIS', detail: 'Finish 2 fusions in one run.', reward: '', progress: m.achievements.synthesis ? 1 : 0, goal: 1 },
    { id: 'all-fusions', title: 'ALL FUSIONS', detail: 'See all 10 fusions.', reward: '', progress: Math.min(10, fusions), goal: 10 },
    { id: 'barrel-artist', title: 'BARREL ARTIST', detail: 'Chain 3 barrels in one blast.', reward: '', progress: m.achievements['barrel-artist'] ? 1 : 0, goal: 1 },
    { id: 'untouchable', title: 'UNTOUCHABLE', detail: 'Survive 3 waves in a row untouched.', reward: '', progress: m.achievements.untouchable ? 1 : 0, goal: 1 },
    { id: 'parts-collector', title: 'PARTS COLLECTOR', detail: 'Destroy both Titan parts in one run.', reward: '', progress: m.achievements['parts-collector'] ? 1 : 0, goal: 1 },
    { id: 'overtime-20', title: 'OVERTIME 20', detail: 'Reach wave 20 in overtime.', reward: '', progress: m.achievements['overtime-20'] ? 1 : 0, goal: 1 },
    { id: 'daily', title: 'DAILY', detail: 'Finish a daily challenge.', reward: '', progress: m.achievements.daily ? 1 : 0, goal: 1 }
  ];
  var out = [];
  var i;
  var row;
  for (i = 0; i < defs.length; i += 1) {
    row = defs[i];
    row.unlocked = !!m.achievements[row.id];
    row.unlockedAt = m.achievements[row.id] || '';
    if (row.unlocked && row.progress < row.goal) row.progress = row.goal;
    out.push(row);
  }
  return out;
}
