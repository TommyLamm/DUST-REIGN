import { WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { isStormFront } from '../systems/flow.js';
import { isReducedMotion } from '../core/settings.js';
import { stackCount } from '../data/upgrades.js';
import { beginBanish, cancelBanish, evaluateArchetypes, rerollUpgrades, skipUpgrade, upgradeCompletesLabel } from '../systems/progression.js';
import { first, qa } from '../core/utils.js';
import { isChinese, onLanguageChange, tCategory, tFusionTitle, tRarity, tUpgradeText, tUpgradeTitle } from '../core/i18n.js';

var hideTimer = 0;
var dealTimers = [];
var keysBound = false;
var mouseBound = false;
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
  'arc-welder': 'ARC',
  colossus: 'COL'
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
  var zh = isChinese();
  var catNode = button.querySelector('.upgrade-cat');
  if (!catNode) {
    catNode = document.createElement('span');
    catNode.className = 'upgrade-cat';
    button.insertBefore(catNode, button.firstChild);
  }
  catNode.innerHTML = ICONS[cat] + '<span class="upgrade-cat-label">' + (zh ? tCategory(cat) : cat.toUpperCase()) + '</span>';
  var rarityNode = ensureNode(button, 'upgrade-rarity');
  rarityNode.textContent = zh ? tRarity(rarity) : String(rarity).toUpperCase();
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
    completesNode.textContent = (zh ? '可完成融合: ' : 'COMPLETES: ') + tFusionTitle(completes);
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
  var resBadge = ensureNode(button, 'upgrade-resonance');
  if (cat === 'fusion') {
    resBadge.hidden = false;
    resBadge.textContent = zh ? '⚡ 融合共鳴 · 質變晶片' : '⚡ FUSION RESONANCE SYNTHESIS';
  } else if (upgrade.archetype) {
    resBadge.hidden = false;
    var archKey = upgrade.archetype;
    var resonances = (rt.state && rt.state.player && rt.state.player.resonances) || (rt.state ? evaluateArchetypes(rt.state) : null);
    var curStacks = (resonances && resonances[archKey]) || 0;
    var nextStacks = curStacks + 1;
    var targetMilestone = curStacks < 2 ? 2 : (curStacks < 4 ? 4 : (curStacks < 6 ? 6 : 6));
    var willTierUp = (nextStacks === 2 || nextStacks === 4 || nextStacks === 6);

    var archName = archKey.toUpperCase();
    if (zh) {
      if (archKey === 'kinetic') archName = '動能穿甲';
      else if (archKey === 'plasma') archName = '熱能爆破';
      else if (archKey === 'static') archName = '電磁超載';
      else if (archKey === 'tactical') archName = '機動戰術';
    }

    var label = '[' + archName + ' ' + curStacks + '/' + targetMilestone + ']';
    if (willTierUp) {
      label += (zh ? ' ⚡ 共鳴晉階!' : ' ⚡ RESONANCE TIER UP!');
    }
    resBadge.textContent = label;
  } else {
    resBadge.hidden = true;
    resBadge.textContent = '';
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
  strong.textContent = zh ? tUpgradeTitle(upgrade) : upgrade.title;
  small.textContent = zh ? tUpgradeText(upgrade) : upgrade.text;
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
  var zh = isChinese();
  var rerolls = rt.state.rerolls || 0;
  var banishes = rt.state.banishes || 0;
  var picking = !!rt.state.banishPicking;
  row.innerHTML = '';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', zh ? '強化控制：重骰、放逐、跳過' : 'Upgrade controls: reroll, banish, skip');

  var reroll = document.createElement('button');
  reroll.type = 'button';
  reroll.className = 'upgrade-action upgrade-action--reroll';
  reroll.id = 'upgradeRerollBtn';
  reroll.innerHTML = '<kbd class="upgrade-action-key" aria-hidden="true">R</kbd><span class="upgrade-action-label">' +
    (zh ? ('重骰 · 剩餘 ' + rerolls) : ('REROLL · ' + rerolls + ' LEFT')) + '</span>';
  reroll.disabled = rerolls <= 0;
  if (rerolls <= 0) {
    reroll.title = zh ? '本局重骰已用盡' : 'No rerolls left this run';
    reroll.setAttribute('aria-label', zh ? '重骰不可用：本局次數已用盡' : 'Reroll unavailable: none remaining');
  } else {
    reroll.title = zh ? ('重骰三張卡片（快捷鍵 R）· 剩餘 ' + rerolls + ' 次') : ('Reroll three cards (R) · ' + rerolls + ' left');
    reroll.setAttribute('aria-label', (zh ? '重骰三張卡片。剩餘 ' : 'Reroll the three cards. ') + rerolls + (zh ? ' 次。快捷鍵 R。' : ' remaining. Hotkey R.'));
  }
  reroll.addEventListener('click', function () { rerollUpgrades(); });

  var banish = document.createElement('button');
  banish.type = 'button';
  banish.className = 'upgrade-action upgrade-action--banish' + (picking ? ' is-armed' : '');
  banish.id = 'upgradeBanishBtn';
  var banishLabel = picking
    ? (zh ? '取消放逐' : 'CANCEL BANISH')
    : (zh ? ('放逐 · 剩餘 ' + banishes) : ('BANISH · ' + banishes + ' LEFT'));
  banish.innerHTML = '<kbd class="upgrade-action-key" aria-hidden="true">B</kbd><span class="upgrade-action-label">' + banishLabel + '</span>';
  banish.disabled = banishes <= 0 && !picking;
  banish.setAttribute('aria-pressed', picking ? 'true' : 'false');
  if (picking) {
    banish.title = zh ? '取消放逐模式（ESC）' : 'Cancel banish mode (Esc)';
    banish.setAttribute('aria-label', zh ? '取消放逐選擇。快捷鍵 ESC 或再按 B。' : 'Cancel banish selection. Esc or B again.');
  } else if (banishes <= 0) {
    banish.title = zh ? '本局放逐已用盡' : 'No banishes left this run';
    banish.setAttribute('aria-label', zh ? '放逐不可用：本局次數已用盡' : 'Banish unavailable: none remaining');
  } else {
    banish.title = zh ? ('進入放逐模式（快捷鍵 B）· 剩餘 ' + banishes + ' 次') : ('Enter banish mode (B) · ' + banishes + ' left');
    banish.setAttribute('aria-label', (zh ? '放逐一張卡片。剩餘 ' : 'Banish one card. ') + banishes + (zh ? ' 次。快捷鍵 B。' : ' remaining. Hotkey B.'));
  }
  banish.addEventListener('click', function () { beginBanish(); });

  var skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'upgrade-action upgrade-action--skip';
  skip.id = 'upgradeSkipBtn';
  skip.innerHTML = '<kbd class="upgrade-action-key" aria-hidden="true">X</kbd><span class="upgrade-action-label">' +
    (zh ? '跳過 · 修 10 / +100 分' : 'SKIP · HEAL 10 / +100') + '</span>';
  skip.title = zh ? '跳過本輪強化：修復 10 點裝甲並獲得 100 分（快捷鍵 X）' : 'Skip this pick: heal 10 hull and +100 score (X)';
  skip.setAttribute('aria-label', zh ? '跳過強化。修復 10 點裝甲並獲得 100 分。快捷鍵 X。' : 'Skip the card. Heal 10 and gain 100 score. Hotkey X.');
  skip.addEventListener('click', function () { skipUpgrade(); });

  var hint = document.createElement('p');
  hint.className = 'upgrade-control-hint';
  hint.id = 'upgradeControlHint';
  hint.textContent = picking
    ? (zh ? '放逐模式：點選要永久移除的卡片 · ESC 取消' : 'BANISH MODE: click a card to remove it forever · ESC CANCELS')
    : (zh ? '數字鍵 1–3 選擇 · R 重骰 · B 放逐 · X 跳過（修 10 / +100 分）' : '1–3 PICK · R REROLL · B BANISH · X SKIP (HEAL 10 / +100)');
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

function ensureOptionsMouse() {
  if (mouseBound || !rt.ui || !rt.ui.optionsNode || typeof rt.ui.optionsNode.addEventListener !== 'function') return;
  mouseBound = true;
  rt.ui.optionsNode.addEventListener('pointermove', function () {
    if (rt.gamepadState && rt.gamepadState.selectedUpgrade >= 0) {
      rt.gamepadState.selectedUpgrade = -1;
      updateUpgradeSelectionUi();
    }
  });
}

/** Pin live bounty/wave countdown onto the upgrade panel timer strip. */
export function syncUpgradeTimerPin(force) {
  if (!rt.state || typeof document === 'undefined') return;
  var el = document.getElementById('upgradeTimer');
  var panel = rt.ui && rt.ui.overlay;
  if (!el || !panel) return;
  if (panel.hidden && !force) return;
  var zh = isChinese();
  var remain = Math.max(0, WAVE_LENGTH - (rt.state.waveTime || 0));
  var waveLeft = Math.max(0, Math.ceil(remain - 1e-9));
  var storm = isStormFront();
  // Match HUD waveTimer copy (reuse existing 暴風逼近 / STORM FRONT strings).
  var waveBit = zh
    ? ((rt.state.overtime ? (storm ? '加時暴風 ' : '加時推進 ') : (storm ? '暴風逼近 ' : '下一波次 ')) + String(waveLeft).padStart(2, '0') + 's')
    : ((rt.state.overtime ? (storm ? 'OT STORM ' : 'OT FRONT ') : (storm ? 'STORM FRONT ' : 'NEXT FRONT ')) + String(waveLeft).padStart(2, '0') + 's');
  // Bounty surge must not wipe the storm/wave pin — append waveBit after surge text.
  if (rt.state.statusHold > 0 && rt.state.statusHoldKind === 'bountySurge') {
    var holdReward = rt.state.statusHoldBountyReward || 0;
    el.textContent = zh
      ? ('懸賞完成 +' + holdReward + ' 分數 // 湧浪 ' + rt.state.statusHold.toFixed(1) + 's · ' + waveBit)
      : ('BOUNTY CLEAR +' + holdReward + ' SCORE // SURGE ' + rt.state.statusHold.toFixed(1) + 's · ' + waveBit);
    return;
  }
  if (!rt.state.bountyClaimed && rt.state.bountyTarget > 0) {
    var kills = rt.state.bountyKills || 0;
    var target = rt.state.bountyTarget;
    var reward = rt.state.bountyReward || 0;
    el.textContent = zh
      ? ('懸賞 ' + kills + '/' + target + ' · +' + reward + ' · ' + waveBit)
      : ('BOUNTY ' + kills + '/' + target + ' · +' + reward + ' · ' + waveBit);
    return;
  }
  el.textContent = waveBit;
}
export function renderUpgradePanel(options) {
  if (!rt.ui || !rt.ui.overlay || !rt.ui.optionsNode || !rt.state) return;
  var choices = rt.state.upgradeChoices || [];
  var reroll = !!(options && options.reroll);
  var zh = isChinese();
  var title = first(['[data-upgrade-title]', '.upgrade-title', 'h2', 'h3'], rt.ui.overlay);
  if (title) title.innerHTML = zh ? '強化機體，<span>兇悍進化。</span>' : 'MAKE THE RIG <span>MEANER.</span>';
  var hint = first(['.upgrade-hint'], rt.ui.overlay);
  if (hint) hint.textContent = zh ? '戰鬥已暫停 — 1–3 挑選 · R 重骰 · B 放逐 · X 跳過（修 10 / +100 分）' : 'COMBAT PAUSED — 1–3 PICK · R REROLL · B BANISH · X SKIP (HEAL 10 / +100)';
  syncUpgradeTimerPin(true);
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
  rt.gamepadState.selectedUpgrade = -1;
  updateUpgradeSelectionUi();
  ensureOptionsMouse();
  if (typeof document !== 'undefined' && document.activeElement && rt.ui.optionsNode.contains(document.activeElement)) {
    if (typeof document.activeElement.blur === 'function') document.activeElement.blur();
  }
  rt.ui.overlay.hidden = false;
  syncUpgradeTimerPin(true);
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
  var selected = (rt.gamepadState && typeof rt.gamepadState.selectedUpgrade === 'number') ? rt.gamepadState.selectedUpgrade : -1;
  for (var i = 0; i < buttons.length; i += 1) {
    if (selected >= 0 && i === selected) {
      buttons[i].classList.add('is-gamepad-selected');
    } else {
      buttons[i].classList.remove('is-gamepad-selected');
    }
  }
}

onLanguageChange(function () {
  if (rt.ui && rt.ui.overlay && !rt.ui.overlay.hidden && rt.state && rt.state.upgradeChoices && rt.state.upgradeChoices.length) {
    renderUpgradePanel();
  }
});
