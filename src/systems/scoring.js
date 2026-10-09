import { rt } from '../core/runtime.js';
import { getHeatModifiers } from '../data/heat.js';

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

export function addScore(amount, source) {
  if (!rt.state) return 0;
  var n = Number(amount);
  if (!(n > 0)) return 0;
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

  if (extracted && heat >= 2) {
    return rankResult('S+', 'DUST SOVEREIGN', 'rank-letter--splus', acc);
  }
  if (extracted || s >= 220000) {
    return rankResult('S', 'APEX SCAVENGER', 'rank-letter--s', acc);
  }
  if (s >= 90000) {
    return rankResult('A', 'VETERAN BREACHER', 'rank-letter--a', acc);
  }
  if (s >= 30000) {
    return rankResult('B', 'IRON SCRAPPER', 'rank-letter--b', acc);
  }
  return rankResult('C', 'RECRUIT RECLUSE', 'rank-letter--c', acc);
}
