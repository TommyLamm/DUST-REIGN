import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { stackCount } from '../data/upgrades.js';
import { beginBanish, cancelBanish, rerollUpgrades, skipUpgrade, upgradeCompletesLabel } from '../systems/progression.js';
import { first, qa } from '../core/utils.js';

var hideTimer = 0;
var dealTimers = [];
var keysBound = false;
var shortcutReadyAt = 0;

var ICONS = {
  offense: '<svg class="upgrade-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M18 2 L8 18 h7 l-2 12 12-18 h-7 z"/></svg>',
  defense: '<svg class="upgrade-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 2 l12 5 v9 c0 8-5.2 12.6-12 14 C9.2 28.6 4 24 4 16 V7 z"/></svg>',
  tactical: '<svg class="upgrade-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="8" cy="16" r="3" fill="currentColor"/><circle cx="24" cy="8" r="3" fill="currentColor"/><circle cx="24" cy="24" r="3" fill="currentColor"/><path d="M11 15 L21 9 M11 17 L21 23" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  fusion: '<svg class="upgrade-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z"/></svg>',
  mobility: '<svg class="upgrade-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M6 18 h8 l2-6 4 10 2-4 h6 v3 H22 l-3 6-4-10-2 4 H6 z"/></svg>',
  weapon: '<svg class="upgrade-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M4 14 h16 l4-3 v3 h4 v4 h-4 v3 l-4-3 H4 z"/></svg>'
};

var WEAPON_MARK = {
  standard: 'STD',
  breacher: 'BRC',
  vanguard: 'VAN',
  'arc-welder': 'ARC'
};

function categoryKey(category) {
  var cat = String(category || 'TACTICAL').toLowerCase();
  if (cat === 'offense' || cat === 'defense' || cat === 'tactical' || cat === 'fusion' || cat === 'mobility' || cat === 'weapon') return cat;
  return 'tactical';
}

function clearDealTimers() {
  for (var i = 0; i < dealTimers.length; i += 1) clearTimeout(dealTimers[i]);
  dealTimers = [];
}

function cancelUpgradeHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = 0;
  }
  if (rt.ui && rt.ui.overlay && rt.ui.overlay.style) rt.ui.overlay.style.pointerEvents = '';
}

function motionOffSafe() {
  try { return isReducedMotion(); } catch (e) { return false; }
}

function ensureNode(parent, className, tag) {
  var node = parent.querySelector('.' + className);
  if (!node) {
    node = document.createElement(tag || 'span');
    node.className = className;
    parent.appendChild(node);
  }
  return node;
}

function paintUpgradeButton(button, upgrade, index, reroll) {
  var cat = categoryKey(upgrade.category);
  var cats = ['offense', 'defense', 'tactical', 'fusion', 'mobility', 'weapon'];
  var rarities = ['common', 'rare', 'prototype'];
  var i;
  for (i = 0; i < cats.length; i += 1) button.classList.remove('upgrade-choice--' + cats[i]);
  for (i = 0; i < rarities.length; i += 1) button.classList.remove('is-' + rarities[i]);
  button.classList.add('upgrade-choice--' + cat);
  var rarity = upgrade.rarity || (cat === 'fusion' ? 'prototype' : 'common');
  button.classList.add('is-' + rarity);
  button.classList.toggle('is-fusion-chip', cat === 'fusion');
  button.classList.toggle('is-banish-target', !!(rt.state && rt.state.banishPicking));
  button.classList.remove('is-picked', 'is-discarded', 'is-dealing', 'is-reroll');
  button.hidden = false;
  button.dataset.upgradeIndex = String(index);
  var catNode = button.querySelector('.upgrade-cat');
  if (!catNode) {
    catNode = document.createElement('span');
    catNode.className = 'upgrade-cat';
    button.insertBefore(catNode, button.firstChild);
  }
  catNode.innerHTML = ICONS[cat] + '<span class="upgrade-cat-label">' + cat.toUpperCase() + '</span>';
  var rarityNode = ensureNode(button, 'upgrade-rarity');
  rarityNode.textContent = String(rarity).toUpperCase();
  var stackNode = ensureNode(button, 'upgrade-stack');
  if (upgrade.maxStacks && upgrade.category !== 'FUSION') {
    var owned = stackCount(rt.state, upgrade.id);
    stackNode.hidden = false;
    stackNode.textContent = owned + '/' + upgrade.maxStacks;
  } else {
    stackNode.hidden = true;
    stackNode.textContent = '';
  }
  var completes = upgradeCompletesLabel(upgrade);
  var completesNode = ensureNode(button, 'upgrade-completes');
  if (completes) {
    completesNode.hidden = false;
    completesNode.textContent = 'COMPLETES: ' + completes;
  } else {
    completesNode.hidden = true;
    completesNode.textContent = '';
  }
  var weaponNode = ensureNode(button, 'upgrade-weapon');
  if (upgrade.weapon) {
    weaponNode.hidden = false;
    weaponNode.textContent = WEAPON_MARK[upgrade.weapon] || upgrade.weapon.toUpperCase();
  } else {
    weaponNode.hidden = true;
    weaponNode.textContent = '';
  }
  var strong = first(['.upgrade-copy strong', '[data-upgrade-name]', 'strong'], button);
  var small = first(['.upgrade-copy small', '[data-upgrade-text]', 'small'], button);
  if (!strong) {
    strong = document.createElement('strong');
    button.appendChild(strong);
  }
  if (!small) {
    small = document.createElement('small');
    button.appendChild(small);
  }
  strong.textContent = upgrade.title;
  small.textContent = upgrade.text;
  if (reroll && !motionOffSafe()) button.classList.add('is-reroll');
  if (!motionOffSafe()) {
    button.style.setProperty('--deal-delay', (index * 60) + 'ms');
    button.classList.add('is-dealing');
    dealTimers.push(setTimeout(function () {
      if (button.classList) button.classList.remove('is-dealing', 'is-reroll');
    }, 480 + index * 60));
  }
}

function renderControlRow() {
  if (typeof document === 'undefined' || !rt.state) return;
  var row = document.getElementById('upgradeControlRow');
  if (!row) return;
  var rerolls = rt.state.rerolls || 0;
  var banishes = rt.state.banishes || 0;
  var picking = !!rt.state.banishPicking;
  row.innerHTML = '';
  var reroll = document.createElement('button');
  reroll.type = 'button';
  reroll.className = 'upgrade-action';
  reroll.id = 'upgradeRerollBtn';
  reroll.textContent = 'REROLL (' + rerolls + ')';
  reroll.disabled = rerolls <= 0;
  reroll.setAttribute('aria-label', 'Reroll the three cards. ' + rerolls + ' remaining.');
  reroll.addEventListener('click', function () { rerollUpgrades(); });
  var banish = document.createElement('button');
  banish.type = 'button';
  banish.className = 'upgrade-action' + (picking ? ' is-armed' : '');
  banish.id = 'upgradeBanishBtn';
  banish.textContent = picking ? 'CANCEL BANISH' : ('BANISH (' + banishes + ')');
  banish.disabled = banishes <= 0 && !picking;
  banish.setAttribute('aria-pressed', picking ? 'true' : 'false');
  banish.setAttribute('aria-label', picking ? 'Cancel banish selection' : 'Banish one card. ' + banishes + ' remaining.');
  banish.addEventListener('click', function () { beginBanish(); });
  var skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'upgrade-action upgrade-action--skip';
  skip.id = 'upgradeSkipBtn';
  skip.textContent = 'SKIP';
  skip.setAttribute('aria-label', 'Skip the card. Heal 10 and gain 100 score.');
  skip.addEventListener('click', function () { skipUpgrade(); });
  var hint = document.createElement('p');
  hint.className = 'upgrade-control-hint';
  hint.textContent = picking ? 'SELECT A CARD TO BANISH · ESC CANCELS' : '1–3 PICK · R REROLL · B BANISH · X SKIP';
  row.appendChild(reroll);
  row.appendChild(banish);
  row.appendChild(skip);
  row.appendChild(hint);
}

function onUpgradeKey(event) {
  if (!rt.state || !rt.state.upgradeChoices || !rt.state.upgradeChoices.length) return;
  if (event.repeat) return;
  var key = String(event.key || '').toLowerCase();
  if ((key === 'r' || key === 'b' || key === 'x') && Date.now() < shortcutReadyAt) return;
  if (key === 'r') {
    event.preventDefault();
    rerollUpgrades();
  } else if (key === 'b') {
    event.preventDefault();
    beginBanish();
  } else if (key === 'x') {
    event.preventDefault();
    skipUpgrade();
  } else if (key === 'escape' && rt.state.banishPicking) {
    event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    cancelBanish();
  }
}

function ensureUpgradeKeys() {
  if (keysBound || typeof window === 'undefined') return;
  keysBound = true;
  window.addEventListener('keydown', onUpgradeKey);
}

export function renderUpgradePanel(options) {
  if (!rt.ui || !rt.ui.overlay || !rt.ui.optionsNode || !rt.state) return;
  var choices = rt.state.upgradeChoices || [];
  var reroll = !!(options && options.reroll);
  var title = first(['[data-upgrade-title]', '.upgrade-title', 'h2', 'h3'], rt.ui.overlay);
  if (title) title.textContent = 'CHOOSE YOUR EDGE';
  var hint = first(['.upgrade-hint'], rt.ui.overlay);
  if (hint) hint.textContent = 'COMBAT PAUSED — 1–3 PICK · R REROLL · B BANISH · X SKIP';
  if (rt.ui.overlay.classList) rt.ui.overlay.classList.toggle('is-banish-mode', !!rt.state.banishPicking);
  cancelUpgradeHide();
  clearDealTimers();
  shortcutReadyAt = Date.now() + 400;
  ensureUpgradeKeys();
  var existing = qa('button', rt.ui.optionsNode);
  if (!rt.ui.createdOverlay && existing.length >= choices.length) {
    choices.forEach(function (upgrade, index) {
      paintUpgradeButton(existing[index], upgrade, index, reroll);
    });
    existing.slice(choices.length).forEach(function (button) { button.hidden = true; });
  } else {
    rt.ui.optionsNode.innerHTML = '';
    choices.forEach(function (upgrade, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'upgrade-choice upgrade-card';
      var em = document.createElement('em');
      em.textContent = String(index + 1);
      button.appendChild(em);
      rt.ui.optionsNode.appendChild(button);
      paintUpgradeButton(button, upgrade, index, reroll);
    });
  }
  renderControlRow();
  if (!rt.gamepadState) rt.gamepadState = {};
  rt.gamepadState.selectedUpgrade = 0;
  updateUpgradeSelectionUi();
  rt.ui.overlay.hidden = false;
}

export function presentUpgradePick(index) {
  if (!rt.ui || !rt.ui.overlay) return;
  cancelUpgradeHide();
  var buttons = rt.ui.optionsNode ? qa('button', rt.ui.optionsNode) : [];
  if (motionOffSafe() || typeof document === 'undefined') {
    rt.ui.overlay.hidden = true;
    return;
  }
  for (var i = 0; i < buttons.length; i += 1) {
    if (buttons[i].hidden) continue;
    buttons[i].classList.remove('is-dealing', 'is-reroll');
    if (i === index) buttons[i].classList.add('is-picked');
    else buttons[i].classList.add('is-discarded');
  }
  var picked = buttons;
  if (rt.ui.overlay.style) rt.ui.overlay.style.pointerEvents = 'none';
  hideTimer = setTimeout(function () {
    hideTimer = 0;
    if (!rt.ui || !rt.ui.overlay) return;
    if (rt.ui.overlay.style) rt.ui.overlay.style.pointerEvents = '';
    if (rt.state && rt.state.upgradeChoices && rt.state.upgradeChoices.length) return;
    rt.ui.overlay.hidden = true;
    for (var j = 0; j < picked.length; j += 1) {
      if (picked[j].classList) picked[j].classList.remove('is-picked', 'is-discarded');
    }
  }, 220);
}

export function updateUpgradeSelectionUi() {
  if (!rt.ui || !rt.ui.optionsNode) return;
  var buttons = qa('button', rt.ui.optionsNode);
  for (var i = 0; i < buttons.length; i += 1) {
    if (i === rt.gamepadState.selectedUpgrade) {
      buttons[i].classList.add('is-gamepad-selected');
      if (buttons[i].focus) buttons[i].focus();
    } else {
      buttons[i].classList.remove('is-gamepad-selected');
    }
  }
}
