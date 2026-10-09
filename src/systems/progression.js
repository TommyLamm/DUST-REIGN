import { AudioFX } from '../audio/audio-fx.js';
import { spawnParticles } from '../core/pools.js';
import { rt } from '../core/runtime.js';
import { FUSION_CHIPS, UPGRADES, toPropName } from '../data/upgrades.js';
import { updateDomUi } from '../ui/hud.js';
import { presentUpgradePick, renderUpgradePanel } from '../ui/upgrade-panel.js';

export function randomUpgradeChoices() {
  var p = rt.state && rt.state.player;
  function hasCard(id) {
    return ((rt.state && rt.state.acquiredUpgrades) || []).some(function (u) {
      return u.id === id || (u.aliases && u.aliases.indexOf(id) !== -1);
    });
  }

  var available = UPGRADES.filter(function (u) {
    if (!p) return true;
    if (u.id === 'shockwave-dash' && p.shockwaveDash) return false;
    if (u.id === 'tesla-coil' && p.teslaCoil) return false;
    if (u.id === 'reactive-armor' && p.reactiveArmor) return false;
    if (u.id === 'high-caliber' && p.highCaliber) return false;
    return true;
  });
  if (available.length < 3) available = UPGRADES.slice();

  var eligibleFusions = p
    ? FUSION_CHIPS.filter(function (fc) {
        return !p[toPropName(fc.id)] && fc.required.every(hasCard);
      })
    : [];

  var picks;
  if (eligibleFusions.length > 0) {
    var eligibleFusion = eligibleFusions[Math.floor(Math.random() * eligibleFusions.length)];
    picks = [eligibleFusion];
    var offenses = available.filter(function (u) { return u.category === 'OFFENSE'; });
    var guaranteedOffense = offenses.length > 0
      ? offenses[Math.floor(Math.random() * offenses.length)]
      : available[Math.floor(Math.random() * available.length)];
    picks.push(guaranteedOffense);
    var remaining = available.filter(function (u) { return u.id !== guaranteedOffense.id; });
    if (remaining.length > 0) {
      var secondNormal = remaining[Math.floor(Math.random() * remaining.length)];
      picks.push(secondNormal);
    }
  } else {
    var offenses = available.filter(function (u) { return u.category === 'OFFENSE'; });
    var guaranteedOffense = offenses.length > 0
      ? offenses[Math.floor(Math.random() * offenses.length)]
      : available[Math.floor(Math.random() * available.length)];
    picks = [guaranteedOffense];
    var remaining = available.filter(function (u) { return u.id !== guaranteedOffense.id; });
    while (picks.length < 3 && remaining.length > 0) {
      var idx = Math.floor(Math.random() * remaining.length);
      picks.push(remaining.splice(idx, 1)[0]);
    }
  }

  for (var i = picks.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = picks[i];
    picks[i] = picks[j];
    picks[j] = temp;
  }
  return picks;
}

export function addXp(amount) {
  var p = rt.state.player;
  rt.state.xp += Math.max(1, Math.round(amount * p.xpMult));
  if (rt.state.xp >= rt.state.xpNext) {
    if (rt.state.upgradeChoices && rt.state.upgradeChoices.length > 0) return;
    rt.state.xp -= rt.state.xpNext;
    rt.state.level += 1;
    rt.state.xpNext = Math.round(rt.state.xpNext * 1.24 + 28);
    AudioFX.levelUp();
    rt.state.paused = true;
    rt.state.upgradeChoices = randomUpgradeChoices();
    renderUpgradePanel();
    spawnParticles(p.x, p.y, '#75d1b0', 18, 210, 3);
  }
}

export function chooseUpgrade(index) {
  if (!rt.state || !rt.state.paused || !rt.state.upgradeChoices[index]) return;
  var choice = rt.state.upgradeChoices[index];
  choice.apply(rt.state);
  if (!rt.state.acquiredUpgrades) rt.state.acquiredUpgrades = [];
  rt.state.acquiredUpgrades.push(choice);
  rt.state.upgradeChoices = [];
  spawnParticles(rt.state.player.x, rt.state.player.y, '#f5c76e', 14, 170, 3);
  updateDomUi();
  if (rt.state.xp >= rt.state.xpNext) {
    rt.state.level += 1;
    rt.state.xp -= rt.state.xpNext;
    rt.state.xpNext = Math.round(rt.state.xpNext * 1.24 + 28);
    AudioFX.levelUp();
    rt.state.upgradeChoices = randomUpgradeChoices();
    renderUpgradePanel();
    rt.state.paused = true;
    return;
  }
  rt.state.paused = false;
  if (rt.ui && rt.ui.overlay) presentUpgradePick(index);
}
