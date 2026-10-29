import { rt } from '../core/runtime.js';
import { getHeatModifiers } from '../data/heat.js';
import { spawnScoreFloater } from '../render/fx.js';

// Engagement accuracy: only shots fired while a living foe is within range count toward
// shotsFired. Empty-sand suppression fire does not tank the displayed hit rate.
var ACCURACY_ENGAGE_R2 = 1100 * 1100;

/** A landed shot always counts in the engagement denominator (avoids 0% with kills/damage). */
export function noteAccuracyHit() {
  if (!rt.state || !rt.state.stats) return;
  var stats = rt.state.stats;
  stats.shotsHit = (Number(stats.shotsHit) || 0) + 1;
  var fired = Number(stats.shotsFired) || 0;
  var hits = Number(stats.shotsHit) || 0;
  if (fired < hits) stats.shotsFired = hits;
}

/** Shotgun/volley: count at most one hit per trigger pull (avoids pellet-flooded %). */
export function noteAccuracyVolleyHit(volleyId) {
  if (!rt.state || !rt.state.stats) return;
  if (volleyId == null) {
    noteAccuracyHit();
    return;
  }
  if (!rt.state._accVolleyHit) rt.state._accVolleyHit = Object.create(null);
  if (rt.state._accVolleyHit[volleyId]) return;
  rt.state._accVolleyHit[volleyId] = 1;
  noteAccuracyHit();
}

export function recordAccuracyShots(count) {
  if (!rt.state || !rt.state.stats) return;
  var n = Number(count) || 0;
  if (!(n > 0)) return;
  var p = rt.state.player;
  var enemies = rt.state.enemies;
  if (!p || !enemies || !enemies.length) return;
  var engaged = false;
  for (var i = 0; i < enemies.length; i += 1) {
    var e = enemies[i];
    if (!e || !(e.hp > 0) || e.burrowed) continue;
    var dx = e.x - p.x;
    var dy = e.y - p.y;
    if (dx * dx + dy * dy <= ACCURACY_ENGAGE_R2) {
      engaged = true;
      break;
    }
  }
  if (!engaged) return;
  rt.state.stats.shotsFired = (Number(rt.state.stats.shotsFired) || 0) + n;
}

function emptyBreakdown() {
  return {
    kill: 0,
    bounty: 0,
    storm: 0,
    graze: 0,
    repair: 0,
    wave: 0,
    flawless: 0,
    boss: 0,
    style: 0,
    contract: 0,
    overtime: 0,
    extract: 0
  };
}

// WP-C sets state.route. This build reads route.scoreMult only (missing or non-numeric → 1).
function readRouteMultiplier(state) {
  var route = state && state.route;
  if (!route || typeof route.scoreMult !== 'number' || route.scoreMult !== route.scoreMult) return 1;
  if (route.scoreMult < 0) return 0;
  return route.scoreMult;
}

function readHeatMultiplier(state) {
  var mods = getHeatModifiers(state && state.heat);
  var mult = mods && mods.scoreMultiplier;
  if (typeof mult !== 'number' || mult !== mult || mult < 0) return 1;
  return mult;
}

export function calculateFlawlessBonus(wave, flawlessStreak) {
  return 50 * (wave || 1) * Math.min(5, Math.max(1, flawlessStreak || 1));
}

export function addScore(amount, source) {
  if (!rt.state) return 0;
  var n = Number(amount);
  if (!(n > 0)) return 0;
  if (source === 'flawless' && rt.state) {
    var streak = Math.max(1, (rt.state.flawlessStreak || 0) + 1);
    n = n * Math.min(5, Math.max(1, streak));
  }
  var routeMultiplier = readRouteMultiplier(rt.state);
  var heatMultiplier = readHeatMultiplier(rt.state);
  var finalScore = Math.round(n * routeMultiplier * heatMultiplier);
  if (!(finalScore > 0)) return 0;
  var current = rt.state.score || 0;
  var room = Number.MAX_SAFE_INTEGER - current;
  if (!(room > 0)) return 0;
  if (finalScore > room) finalScore = room;
  rt.state.score = current + finalScore;
  if (!rt.state.scoreBreakdown || typeof rt.state.scoreBreakdown !== 'object') {
    rt.state.scoreBreakdown = emptyBreakdown();
  }
  var key = source || 'kill';
  if (typeof rt.state.scoreBreakdown[key] !== 'number') rt.state.scoreBreakdown[key] = 0;
  rt.state.scoreBreakdown[key] += finalScore;
  if (key === 'kill' || key === 'boss' || key === 'bounty' || key === 'style') {
    var px = (typeof rt.state._lastKillX === 'number') ? rt.state._lastKillX : ((rt.state.player && rt.state.player.x) || 0);
    var py = (typeof rt.state._lastKillY === 'number') ? rt.state._lastKillY : ((rt.state.player && rt.state.player.y) || 0);
    spawnScoreFloater(px, py - 18, finalScore, key);
  }
  return finalScore;
}

function rankResult(letter, title, classMod, acc) {
  return { letter: letter, title: title, classMod: classMod, acc: acc };
}

// Signature stays (wave, score, stats). Extract / Heat come from rt.state.
// stats.extracted (boolean) and stats.heat (number) override state when present.
export function calculateCombatRank(wave, score, stats) {
  stats = stats || {};
  var shotsFired = stats.shotsFired || 0;
  var shotsHit = stats.shotsHit || 0;
  var acc = (shotsFired > 0 ? (shotsHit / shotsFired) : 0);
  var s = Number(score) || 0;
  if (s < 0) s = 0;
  var extracted = Boolean(rt.state && rt.state.extracted);
  var heat = (rt.state && typeof rt.state.heat === 'number') ? rt.state.heat : 0;
  if (typeof stats.extracted === 'boolean') extracted = stats.extracted;
  if (typeof stats.heat === 'number') heat = stats.heat;

  if (extracted && heat >= 3 && s >= 700000) {
    return rankResult('SSS', 'DUST EMPEROR', 'rank-letter--sss', acc);
  }
  if (extracted && heat >= 2) {
    return rankResult('S+', 'DUST SOVEREIGN', 'rank-letter--splus', acc);
  }
  if (extracted || s >= 550000) {
    return rankResult('S', 'APEX SCAVENGER', 'rank-letter--s', acc);
  }
  if (s >= 225000) {
    return rankResult('A', 'VETERAN BREACHER', 'rank-letter--a', acc);
  }
  if (s >= 75000) {
    return rankResult('B', 'IRON SCRAPPER', 'rank-letter--b', acc);
  }
  return rankResult('C', 'RECRUIT RECLUSE', 'rank-letter--c', acc);
}
