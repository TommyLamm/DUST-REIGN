import { WEAPON_MODES } from '../config.js';
import { rt } from '../core/runtime.js';
import { getHeatModifiers } from '../data/heat.js';
import { routeById } from '../data/routes.js';
import { rollRouteIds } from './director.js';
import { extractRun } from './flow.js';
import { addScore } from './scoring.js';
import { commitWaveAdvance } from './sim/timers-wave.js';
import { cycleWeaponMode, grantArmoryMastery } from './weapons.js';

var ACT_TITLES = {
  1: 'ACT I — THE DRYLINE',
  2: 'ACT II — RUST BASIN',
  3: 'ACT III — BLACK GLASS'
};

var WEAPON_COPY = {
  standard: { name: 'STANDARD', detail: 'Steady rifle. The dryline default.' },
  breacher: { name: 'BREACHER', detail: 'Five-round burst. Close and loud.' },
  vanguard: { name: 'VANGUARD', detail: 'Charge a lance. Slow while you hold it.' },
  'arc-welder': { name: 'ARC-WELDER', detail: 'Chain lightning between hulls.' }
};

function cloneRoute(route) {
  if (!route) return null;
  return {
    id: route.id,
    name: route.name,
    rule: route.rule,
    reward: route.reward,
    sector: route.sector,
    scoreMultiplier: route.scoreMultiplier || route.scoreMult || 1,
    scoreMult: typeof route.scoreMult === 'number' ? route.scoreMult : (route.scoreMultiplier || 1),
    xpMultiplier: route.xpMultiplier || 1,
    batteryRegenMultiplier: route.batteryRegenMultiplier || 1,
    stormScoreMultiplier: route.stormScoreMultiplier || 1,
    eliteChanceBonus: route.eliteChanceBonus || 0,
    bruteWeightBonus: route.bruteWeightBonus || 0,
    bulletSpeedScale: route.bulletSpeedScale || 1,
    extraBarrels: route.extraBarrels || 0,
    extraSpires: route.extraSpires || 0,
    moltenBonus: route.moltenBonus || 0,
    stormSeconds: route.stormSeconds || 0,
    convoy: !!route.convoy,
    blackout: !!route.blackout
  };
}

export function assignRoute(state, id, announce) {
  if (!state) return null;
  var route = cloneRoute(routeById(id));
  if (!route) return null;
  state.route = route;
  if (!state.routeHistory) state.routeHistory = [];
  state.routeHistory.push(route.id);
  state.blackout = !!route.blackout;
  // Iron Field's act-open reward. Separate from the boss-kill reroll in card-effects.
  if (route.id === 'ironfield') state.rerolls = (state.rerolls || 0) + 1;
  if (announce) state.routeAnnounce = route.name + ' // ' + route.rule;
  return route;
}

function nextActTitle(wave) {
  var next = (wave | 0) + 1;
  var act = next <= 5 ? 1 : next <= 10 ? 2 : next <= 15 ? 3 : Math.floor((next - 1) / 5) + 1;
  if (ACT_TITLES[act]) return ACT_TITLES[act];
  return 'ACT ' + act + ' — OVERTIME';
}

function armoryOptions() {
  return [
    { id: 'swap', name: 'SWAP WEAPON', detail: 'Change the main gun. Cards stay.' },
    { id: 'mastery', name: 'WEAPON MASTERY', detail: 'Mastery +1 on the gun you hold.' },
    { id: 'repair', name: 'FIELD REPAIR', detail: 'Restore 50% hull and gain +1 reroll.' }
  ];
}

function weaponOptions() {
  var out = [];
  var i;
  for (i = 0; i < WEAPON_MODES.length; i += 1) {
    var id = WEAPON_MODES[i];
    var copy = WEAPON_COPY[id] || { name: id.toUpperCase(), detail: 'Main weapon.' };
    out.push({ id: id, name: copy.name, detail: copy.detail });
  }
  return out;
}

export function onBossCleared(state) {
  if (!state || state.interlude) return;
  var wave = state.wave | 0;
  if (wave === 15 && !state.overtime) openExtract(state);
  else if (wave === 5 || wave === 10) openRoute(state);
  else state.forceWaveAdvance = true;
}

export function openRoute(state) {
  if (!state) return;
  var ids = rollRouteIds(state);
  var options = [];
  var i;
  for (i = 0; i < ids.length; i += 1) {
    var route = cloneRoute(routeById(ids[i]));
    if (route) options.push(route);
  }
  state.banishes = 1;
  state.interlude = {
    step: 'route',
    options: options,
    selected: 0,
    routeId: null,
    title: '',
    titleUntil: 0
  };
}

export function openExtract(state) {
  if (!state) return;
  var heat = getHeatModifiers(state.heat || 0);
  state.banishes = 1;
  state.interlude = {
    step: 'extract',
    options: [
      { id: 'extract', name: 'EXTRACT', detail: 'Bank the run and file the score.' },
      { id: 'push', name: 'PUSH DEEPER', detail: 'Overtime. Death pays half the extract bonus.' }
    ],
    selected: 0,
    routeId: null,
    title: '',
    titleUntil: 0,
    score: state.score || 0,
    extractBonus: heat.extractBonus,
    extractHalf: Math.round(heat.extractBonus * 0.5)
  };
}

function enterTitle(state) {
  var il = state.interlude;
  if (!il) return;
  il.step = 'title';
  il.title = nextActTitle(state.wave || 1);
  il.titleUntil = (rt.renderTime || 0) + 1.5;
  il.options = [];
  il.selected = 0;
}

function applyMastery(state) {
  grantArmoryMastery(state);
}

function applyRepair(state) {
  var p = state.player;
  if (!p) return;
  var heal = Math.round((p.maxHp || 100) * 0.5);
  p.hp = Math.min(p.maxHp || 100, (p.hp || 0) + heal);
  // Armory field repair. Separate from the boss-kill reroll.
  state.rerolls = (state.rerolls || 0) + 1;
}

function applyWeapon(state, id) {
  if (!state || !id || WEAPON_MODES.indexOf(id) === -1) return;
  cycleWeaponMode(id);
}

export function chooseInterlude(index) {
  var state = rt.state;
  if (!state || !state.interlude) return;
  var il = state.interlude;
  var choice = il.options && il.options[index];
  if (il.step === 'route') {
    if (!choice) return;
    il.routeId = choice.id;
    il.step = 'armory';
    il.options = armoryOptions();
    il.selected = 0;
    return;
  }
  if (il.step === 'armory') {
    if (!choice) return;
    if (choice.id === 'swap') {
      il.step = 'weapon';
      il.options = weaponOptions();
      il.selected = 0;
      return;
    }
    if (choice.id === 'mastery') applyMastery(state);
    else if (choice.id === 'repair') applyRepair(state);
    enterTitle(state);
    return;
  }
  if (il.step === 'weapon') {
    if (!choice) return;
    applyWeapon(state, choice.id);
    enterTitle(state);
  }
}

// Bot fast path: repair 50%, keep the route chosen by chooseInterlude, drop the panel, start the next wave.
// On the extract gate this continues into overtime so a 16-wave sim is not filed early.
export function chooseRepair() {
  var state = rt.state;
  if (!state || !state.interlude) return;
  var step = state.interlude.step;
  if (step === 'extract') {
    confirmPushDeeper();
    return;
  }
  if (step === 'title') {
    finishTitle(state);
    return;
  }
  var routeId = state.interlude.routeId;
  if (!routeId && state.interlude.options && state.interlude.options.length) {
    var first = state.interlude.options[0];
    if (first && first.id && step === 'route') routeId = first.id;
  }
  applyRepair(state);
  state.interlude = null;
  if (routeId) assignRoute(state, routeId, false);
  commitWaveAdvance(true);
}

export function backInterlude() {
  var state = rt.state;
  if (!state || !state.interlude || state.interlude.step !== 'weapon') return;
  state.interlude.step = 'armory';
  state.interlude.options = armoryOptions();
  state.interlude.selected = 0;
}

export function nudgeInterlude(dir) {
  var state = rt.state;
  if (!state || !state.interlude || !state.interlude.options) return;
  var n = state.interlude.options.length;
  if (!n) return;
  var sel = state.interlude.selected || 0;
  sel = (sel + dir) % n;
  if (sel < 0) sel += n;
  state.interlude.selected = sel;
}

function finishTitle(state) {
  if (!state || !state.interlude || state.interlude.step !== 'title') return;
  var routeId = state.interlude.routeId;
  state.interlude = null;
  if (routeId) assignRoute(state, routeId, false);
  commitWaveAdvance(true);
}

export function tickInterlude(now) {
  var state = rt.state;
  if (!state || !state.interlude || state.interlude.step !== 'title') return;
  var until = state.interlude.titleUntil || 0;
  if ((now || 0) >= until) finishTitle(state);
}

export function confirmExtract() {
  var state = rt.state;
  if (!state || state.over || state.extracted) return;
  var bonus = getHeatModifiers(state.heat || 0).extractBonus;
  addScore(bonus, 'extract');
  state.extractPaid = true;
  state.extractDeferred = false;
  state.interlude = null;
  extractRun();
}

export function confirmPushDeeper() {
  var state = rt.state;
  if (!state || state.over) return;
  var bonus = getHeatModifiers(state.heat || 0).extractBonus;
  state.overtime = true;
  state.extractDeferred = true;
  state.extractDeferredAmount = bonus;
  state.extractPaid = false;
  state.interlude = null;
  commitWaveAdvance(true);
}

export function grantDeferredExtract(state) {
  if (!state || state.extractPaid || !state.extractDeferred) return 0;
  state.extractPaid = true;
  var amount = Math.round((Number(state.extractDeferredAmount) || 0) * 0.5);
  if (!(amount > 0)) return 0;
  return addScore(amount, 'extract');
}
