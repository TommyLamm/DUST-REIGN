import { AudioFX } from '../audio/audio-fx.js';
import { spawnParticles } from '../core/pools.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import {
  FUSION_CHIPS,
  UPGRADES,
  cardIsBanned,
  completesFusionName,
  currentWeaponId,
  legacyFlagBlocks,
  rarityWeights,
  stackCount,
  toPropName
} from '../data/upgrades.js';
import { resyncMastery } from './weapons.js';
import { addScore } from './scoring.js';
import { updateDomUi } from '../ui/hud.js';
import { presentUpgradePick, renderUpgradePanel } from '../ui/upgrade-panel.js';

export var XP_START = 80;

export function nextXpThreshold(current) {
  return Math.round(current * 1.22 + 24);
}

export function syncXpCurve(state) {
  if (!state) return;
  if ((state.level || 1) <= 1 && (state.xp || 0) === 0 && state.xpNext === 100) state.xpNext = XP_START;
}

function hasCard(state, id) {
  return stackCount(state, id) > 0;
}

function cardBlocked(state, card) {
  if (!card) return true;
  if (cardIsBanned(state, card.id)) return true;
  var p = state && state.player;
  if (legacyFlagBlocks(card, p)) return true;
  var cap = card.maxStacks || 1;
  if (stackCount(state, card.id) >= cap) return true;
  if (card.weapon && card.weapon !== currentWeaponId(state)) return true;
  return false;
}

function availablePool(state) {
  return UPGRADES.filter(function (card) { return !cardBlocked(state, card); });
}

function eligibleFusions(state) {
  var p = state && state.player;
  return FUSION_CHIPS.filter(function (fc) {
    if (cardIsBanned(state, fc.id)) return false;
    if (p && p[toPropName(fc.id)]) return false;
    return fc.required.every(function (id) { return hasCard(state, id); });
  });
}

function pickUniform(list) {
  if (!list || !list.length) return null;
  return list[Math.floor(rng('cards') * list.length)];
}

function pickWeighted(list, act) {
  if (!list || !list.length) return null;
  var weights = rarityWeights(act);
  var total = 0;
  var ws = [];
  var i;
  for (i = 0; i < list.length; i += 1) {
    var rarity = list[i].rarity || 'common';
    var w = weights[rarity] || weights.common;
    ws.push(w);
    total += w;
  }
  if (total <= 0) return list[0];
  var roll = rng('cards') * total;
  var acc = 0;
  for (i = 0; i < list.length; i += 1) {
    acc += ws[i];
    if (roll < acc) return list[i];
  }
  return list[list.length - 1];
}

function withoutIds(list, used) {
  return list.filter(function (card) { return !used[card.id]; });
}

function offensivePool(pool) {
  var offense = pool.filter(function (card) { return card.category === 'OFFENSE'; });
  if (offense.length) return offense;
  var weapons = pool.filter(function (card) { return card.category === 'WEAPON'; });
  if (weapons.length) return weapons;
  return pool;
}

function shufflePicks(picks) {
  var i;
  for (i = picks.length - 1; i > 0; i -= 1) {
    var j = Math.floor(rng('cards') * (i + 1));
    var temp = picks[i];
    picks[i] = picks[j];
    picks[j] = temp;
  }
  return picks;
}

export function randomUpgradeChoices() {
  var state = rt.state;
  var pool = availablePool(state);
  var fusions = eligibleFusions(state);
  var act = (state && state.act) || 1;
  var picks = [];
  var used = {};

  if (fusions.length) {
    var fusion = pickUniform(fusions);
    if (fusion) {
      picks.push(fusion);
      used[fusion.id] = true;
    }
  }

  var offenseSource = offensivePool(withoutIds(pool, used));
  if (!offenseSource.length) offenseSource = withoutIds(pool, used);
  var guaranteed = pickUniform(offenseSource);
  if (guaranteed && !used[guaranteed.id]) {
    picks.push(guaranteed);
    used[guaranteed.id] = true;
  }

  var rest = withoutIds(pool, used);
  while (picks.length < 3 && rest.length) {
    var next = pickWeighted(rest, act);
    if (!next || used[next.id]) break;
    picks.push(next);
    used[next.id] = true;
    rest = withoutIds(pool, used);
  }

  if (picks.length < 3) {
    var fallback = UPGRADES.filter(function (card) { return !used[card.id] && !cardIsBanned(state, card.id); });
    while (picks.length < 3 && fallback.length) {
      var idx = Math.floor(rng('cards') * fallback.length);
      var relaxed = fallback.splice(idx, 1)[0];
      if (!relaxed || used[relaxed.id]) continue;
      used[relaxed.id] = true;
      picks.push(relaxed);
    }
  }

  return shufflePicks(picks);
}

function drawReplacement(hand) {
  var state = rt.state;
  var used = {};
  var i;
  for (i = 0; i < hand.length; i += 1) {
    if (hand[i]) used[hand[i].id] = true;
  }
  var pool = withoutIds(availablePool(state), used);
  var fusions = eligibleFusions(state).filter(function (fc) { return !used[fc.id]; });
  var handHasOffense = hand.some(function (card) {
    return card && (card.category === 'OFFENSE' || card.category === 'WEAPON');
  });
  var handHasFusion = hand.some(function (card) { return card && card.category === 'FUSION'; });
  if (!handHasFusion && fusions.length) return pickUniform(fusions);
  if (!handHasOffense) {
    var offense = offensivePool(pool);
    if (offense.length) return pickUniform(offense);
  }
  if (pool.length) return pickWeighted(pool, (state && state.act) || 1);
  return null;
}

function openUpgradePick() {
  rt.state.banishPicking = false;
  rt.state.upgradeChoices = randomUpgradeChoices();
  renderUpgradePanel();
  rt.state.paused = true;
}

export function addXp(amount) {
  var p = rt.state.player;
  syncXpCurve(rt.state);
  rt.state.xp += Math.max(1, Math.round(amount * p.xpMult));
  if (rt.state.xp >= rt.state.xpNext) {
    if (rt.state.upgradeChoices && rt.state.upgradeChoices.length > 0) return;
    rt.state.xp -= rt.state.xpNext;
    rt.state.level += 1;
    rt.state.xpNext = nextXpThreshold(rt.state.xpNext);
    AudioFX.levelUp();
    rt.state.paused = true;
    openUpgradePick();
    spawnParticles(p.x, p.y, '#75d1b0', 18, 210, 3);
  }
}

function finishPick(index) {
  updateDomUi();
  if (rt.state.xp >= rt.state.xpNext) {
    rt.state.level += 1;
    rt.state.xp -= rt.state.xpNext;
    rt.state.xpNext = nextXpThreshold(rt.state.xpNext);
    AudioFX.levelUp();
    openUpgradePick();
    return;
  }
  rt.state.paused = false;
  rt.state.banishPicking = false;
  if (rt.ui && rt.ui.overlay) presentUpgradePick(index);
}

export function chooseUpgrade(index) {
  if (!rt.state || !rt.state.paused || !rt.state.upgradeChoices[index]) return;
  if (rt.state.banishPicking) {
    confirmBanish(index);
    return;
  }
  var choice = rt.state.upgradeChoices[index];
  choice.apply(rt.state);
  if (!rt.state.acquiredUpgrades) rt.state.acquiredUpgrades = [];
  rt.state.acquiredUpgrades.push(choice);
  if (choice.category === 'FUSION' && rt.state.stats) {
    rt.state.stats.fusionsUnlocked = (rt.state.stats.fusionsUnlocked || 0) + 1;
  }
  if (choice.weapon || choice.grantsMastery) resyncMastery(rt.state.player, rt.state);
  rt.state.upgradeChoices = [];
  rt.state.banishPicking = false;
  spawnParticles(rt.state.player.x, rt.state.player.y, '#f5c76e', 14, 170, 3);
  finishPick(index);
}

export function rerollUpgrades() {
  if (!rt.state || !rt.state.paused || !rt.state.upgradeChoices || !rt.state.upgradeChoices.length) return false;
  if (!(rt.state.rerolls > 0)) return false;
  rt.state.rerolls -= 1;
  rt.state.banishPicking = false;
  rt.state.upgradeChoices = randomUpgradeChoices();
  renderUpgradePanel({ reroll: true });
  return true;
}

export function beginBanish() {
  if (!rt.state || !rt.state.paused || !rt.state.upgradeChoices || !rt.state.upgradeChoices.length) return false;
  if (!(rt.state.banishes > 0)) return false;
  rt.state.banishPicking = !rt.state.banishPicking;
  renderUpgradePanel();
  return true;
}

export function cancelBanish() {
  if (!rt.state || !rt.state.banishPicking) return;
  rt.state.banishPicking = false;
  renderUpgradePanel();
}

export function confirmBanish(index) {
  if (!rt.state || !rt.state.banishPicking) return false;
  var hand = rt.state.upgradeChoices || [];
  var choice = hand[index];
  if (!choice || !(rt.state.banishes > 0)) return false;
  rt.state.banishes -= 1;
  if (!rt.state.banished) rt.state.banished = [];
  if (rt.state.banished.indexOf(choice.id) === -1) rt.state.banished.push(choice.id);
  rt.state.banishPicking = false;
  var replacement = drawReplacement(hand.filter(function (card, i) { return i !== index; }));
  if (replacement) hand[index] = replacement;
  else hand.splice(index, 1);
  renderUpgradePanel({ reroll: true });
  return true;
}

export function skipUpgrade() {
  if (!rt.state || !rt.state.paused || !rt.state.upgradeChoices || !rt.state.upgradeChoices.length) return false;
  var p = rt.state.player;
  if (p) p.hp = Math.min(p.maxHp, (p.hp || 0) + 10);
  addScore(100, 'style');
  rt.state.upgradeChoices = [];
  rt.state.banishPicking = false;
  finishPick(-1);
  return true;
}

export function upgradeCompletesLabel(card) {
  if (!card || !rt.state || card.category === 'FUSION') return '';
  return completesFusionName(rt.state, card.id);
}
