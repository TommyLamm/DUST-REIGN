import { isChinese, onLanguageChange, tDailySummary, tDailyTitle, tRigBlurb, tRigName, tRigReq, tWeaponLine, tWeaponName, tWeaponPattern } from '../core/i18n.js';
import { readBestScoreV2, readDaily, readLegacyBestScore, writeMeta } from '../core/meta-store.js';
import { on } from '../core/utils.js';
import { getHeatModifiers } from '../data/heat.js';
import { RIGS, getRig } from '../data/rigs.js';
import { resolveSelection } from '../systems/meta.js';
import { closeCodex, cycleCodexTab, isCodexOpen, openCodex } from './codex-panel.js';

var WEAPONS = [
  { id: 'standard', name: 'STANDARD', rate: '0.18s', pattern: 'DIRECT', line: 'Steady rifle. Stay mobile.' },
  { id: 'breacher', name: 'BREACHER', rate: 'BURST', pattern: '5-PELLET', line: 'Close spread. Commit to the pocket.' },
  { id: 'vanguard', name: 'VANGUARD', rate: 'CHARGE', pattern: 'PIERCE', line: 'Hold to fire a heavy slug.' },
  { id: 'arc-welder', name: 'ARC WELDER', rate: 'FAST', pattern: 'CHAIN', line: 'Lightning that jumps targets.' }
];
var ROWS = ['rig', 'weapon', 'heat', 'mode'];

var built = false;
var activeRow = 0;
var rigButtons = [];
var weaponButtons = [];
var heatDown;
var heatUp;
var heatValue;
var modeStandard;
var modeDaily;
var ruleNode;
var scoreNode;
var statusNode;
var unlockSig = '';

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function padScore(value) {
  var text = String(Math.max(0, Math.round(Number(value) || 0)));
  while (text.length < 6) text = '0' + text;
  return text;
}

function formatMult(heat) {
  var mult = getHeatModifiers(heat).scoreMultiplier;
  return 'x' + mult.toFixed(2);
}

function rerollCount(pick) {
  var rig = getRig(pick.rigId);
  var count = rig ? rig.rerolls : 1;
  if ((pick.heat | 0) >= 5) count = getHeatModifiers(pick.heat).startingRerolls;
  return count;
}

function routeText(rule) {
  var parts = [];
  var i;
  var step;
  if (!rule || !rule.routePlan) return '';
  for (i = 0; i < rule.routePlan.length; i += 1) {
    step = rule.routePlan[i];
    if (step.routeId) parts.push('ACT ' + step.act + ' ' + String(step.routeId).toUpperCase());
    else if (step.sector) parts.push('ACT ' + step.act + ' ' + String(step.sector).toUpperCase());
  }
  return parts.join(' · ');
}

function setPressed(button, selected, disabled) {
  if (!button) return;
  button.classList.toggle('is-selected', !!selected);
  button.setAttribute('aria-checked', selected ? 'true' : 'false');
  button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  button.tabIndex = selected ? 0 : -1;
}

function refresh() {
  var pick;
  var meta;
  var lockedDaily;
  var i;
  var rig;
  var weapon;
  var saved;
  var best;
  var runs;
  var status;
  var ruleText;
  if (!built) return;
  pick = resolveSelection();
  meta = pick.meta;
  lockedDaily = !!(pick.rule && pick.mode === 'daily');
  var zh = isChinese();
  for (i = 0; i < rigButtons.length; i += 1) {
    rig = RIGS[i];
    var locked = meta.unlockedRigs.indexOf(rig.id) === -1;
    var selected = rig.id === pick.rigId;
    setPressed(rigButtons[i], selected, locked || lockedDaily);
    rigButtons[i].classList.toggle('is-locked', locked && !selected);
    var rigTitle = rigButtons[i].querySelector('strong');
    if (rigTitle) rigTitle.textContent = zh ? tRigName(rig.id) : rig.name;
    var detail = rigButtons[i].querySelector('small');
    if (detail) {
      detail.textContent = locked && !lockedDaily
        ? (zh ? tRigReq(rig) : rig.req)
        : (lockedDaily && selected ? (zh ? '每日鎖定' : 'DAILY LOCK') : (zh ? tRigBlurb(rig.id) : rig.blurb));
    }
  }
  for (i = 0; i < weaponButtons.length; i += 1) {
    weapon = WEAPONS[i];
    setPressed(weaponButtons[i], weapon.id === pick.weaponId, lockedDaily);
    var wTitle = weaponButtons[i].querySelector('strong');
    if (wTitle) wTitle.textContent = zh ? tWeaponName(weapon.id) : weapon.name;
    var wRatePattern = weaponButtons[i].querySelector('small:not(.loadout-line)');
    if (wRatePattern) {
      var rText = weapon.rate;
      if (zh) rText = rText.replace('BURST', '連發').replace('CHARGE', '充能').replace('FAST', '極速');
      wRatePattern.textContent = rText + ' · ' + (zh ? tWeaponPattern(weapon.id) : weapon.pattern);
    }
    var wLine = weaponButtons[i].querySelector('.loadout-line');
    if (wLine) wLine.textContent = zh ? tWeaponLine(weapon.id) : weapon.line;
  }
  setPressed(heatDown, false, lockedDaily);
  setPressed(heatUp, false, lockedDaily);
  heatDown.tabIndex = 0;
  heatUp.tabIndex = 0;
  heatValue.tabIndex = 0;
  heatValue.textContent = (zh ? '熱度 ' : 'HEAT ') + pick.heat + ' ' + formatMult(pick.heat);
  heatValue.setAttribute('aria-disabled', lockedDaily ? 'true' : 'false');
  setPressed(modeStandard, pick.mode !== 'daily', false);
  setPressed(modeDaily, pick.mode === 'daily', false);
  modeStandard.tabIndex = pick.mode !== 'daily' ? 0 : -1;
  modeDaily.tabIndex = pick.mode === 'daily' ? 0 : -1;
  modeStandard.textContent = zh ? '標準模式' : 'STANDARD';
  modeDaily.textContent = zh ? '每日挑戰' : 'DAILY';
  if (pick.rule) {
    saved = readDaily();
    best = saved.date === pick.dateKey ? saved.best : 0;
    runs = saved.date === pick.dateKey ? saved.runs : 0;
    if (zh) {
      ruleText = tDailyTitle(pick.rule.id) + ' — ' + tDailySummary(pick.rule.id) + ' 鎖定 ' + tRigName(pick.rigId) + ' / ' + tWeaponName(pick.weaponId) + ' / 熱度 ' + pick.heat + '。' + routeText(pick.rule) + '。今日最佳 ' + padScore(best) + ' · 出擊 ' + runs;
    } else {
      ruleText = pick.rule.title + ' — ' + pick.rule.summary + ' Lock ' + pick.rigId.toUpperCase() + ' / ' + pick.weaponId.toUpperCase() + ' / HEAT ' + pick.heat + '. ' + routeText(pick.rule) + '. TODAY BEST ' + padScore(best) + ' · RUNS ' + runs;
    }
  } else {
    ruleText = zh ? '標準出擊' : 'STANDARD RUN';
  }
  if (ruleNode.textContent !== ruleText) ruleNode.textContent = ruleText;
  var scores = (zh ? '最佳分數 ' : 'BEST ') + padScore(readBestScoreV2()) + '   ' + (zh ? '歷史最佳 ' : 'LEGACY BEST ') + padScore(readLegacyBestScore());
  if (scoreNode.textContent !== scores) scoreNode.textContent = scores;
  status = (zh ? tRigName(pick.rigId) : pick.rigId.toUpperCase()) + ' · ' + (zh ? tWeaponName(pick.weaponId) : pick.weaponId.toUpperCase()) + ' · ' + (zh ? '熱度 ' : 'HEAT ') + pick.heat + ' · ' + formatMult(pick.heat) + ' · ' + (zh ? '重骰 ' : 'REROLLS ') + rerollCount(pick);
  if (statusNode.textContent !== status) statusNode.textContent = status;

  var kicker = document.querySelector('#loadoutPanel .loadout-kicker');
  if (kicker) kicker.textContent = zh ? '出擊配置' : 'LOADOUT';
  var rigLabel = document.querySelector('#loadoutPanel [data-loadout-row="rig"] .loadout-label');
  if (rigLabel) rigLabel.textContent = zh ? '機體' : 'RIG';
  var weaponLabel = document.querySelector('#loadoutPanel [data-loadout-row="weapon"] .loadout-label');
  if (weaponLabel) weaponLabel.textContent = zh ? '武器' : 'WEAPON';
  var heatLabel = document.querySelector('#loadoutPanel [data-loadout-row="heat"] .loadout-label');
  if (heatLabel) heatLabel.textContent = zh ? '熱度' : 'HEAT';
  var modeLabel = document.querySelector('#loadoutPanel [data-loadout-row="mode"] .loadout-label');
  if (modeLabel) modeLabel.textContent = zh ? '模式' : 'MODE';
  var hintNode = document.querySelector('#loadoutPanel .loadout-hint');
  if (hintNode) hintNode.textContent = zh ? '方向鍵 選擇 · TAB 切換 · ENTER 開始' : 'ARROWS SELECT · TAB MOVES · ENTER STARTS';
  var codexOpenBtn = document.getElementById('codexOpenBtn');
  if (codexOpenBtn) codexOpenBtn.textContent = zh ? '檔案庫' : 'CODEX';
}

function chooseRig(id) {
  var pick = resolveSelection();
  if (pick.rule) return;
  if (pick.meta.unlockedRigs.indexOf(id) === -1) return;
  writeMeta({ selectedRig: id });
  refresh();
}

function chooseWeapon(id) {
  if (resolveSelection().rule) return;
  writeMeta({ selectedWeapon: id });
  refresh();
}

function stepHeat(delta) {
  var pick = resolveSelection();
  var next;
  if (pick.rule) return;
  next = (pick.heat | 0) + delta;
  if (next < 0) next = 0;
  if (next > (pick.meta.heatUnlocked | 0)) next = pick.meta.heatUnlocked | 0;
  writeMeta({ selectedHeat: next });
  refresh();
}

function chooseMode(mode) {
  writeMeta({ selectedMode: mode === 'daily' ? 'daily' : 'standard' });
  refresh();
}

function unlockedRigIds() {
  var meta = resolveSelection().meta;
  var ids = [];
  var i;
  for (i = 0; i < RIGS.length; i += 1) {
    if (meta.unlockedRigs.indexOf(RIGS[i].id) !== -1) ids.push(RIGS[i].id);
  }
  if (!ids.length) ids.push('scrapper');
  return ids;
}

function cycleRig(delta) {
  var pick = resolveSelection();
  var ids;
  var index;
  if (pick.rule) return;
  ids = unlockedRigIds();
  index = ids.indexOf(pick.rigId);
  if (index < 0) index = 0;
  chooseRig(ids[(index + delta + ids.length) % ids.length]);
}

function cycleWeapon(delta) {
  var pick = resolveSelection();
  var index;
  if (pick.rule) return;
  index = 0;
  var i;
  for (i = 0; i < WEAPONS.length; i += 1) if (WEAPONS[i].id === pick.weaponId) index = i;
  chooseWeapon(WEAPONS[(index + delta + WEAPONS.length) % WEAPONS.length].id);
}

function cycleMode() {
  chooseMode(resolveSelection().mode === 'daily' ? 'standard' : 'daily');
}

function rowFromTarget(target) {
  var row;
  var rows;
  var i;
  if (!target || !target.closest) return activeRow;
  row = target.closest('[data-loadout-row]');
  if (!row) return activeRow;
  rows = document.querySelectorAll('#loadoutPanel [data-loadout-row]');
  for (i = 0; i < rows.length; i += 1) if (rows[i] === row) return i;
  return activeRow;
}

function focusRow(index) {
  var rows = document.querySelectorAll('#loadoutPanel [data-loadout-row]');
  var row = rows[index];
  var target;
  if (!row) return;
  target = row.querySelector('.is-selected') || row.querySelector('button');
  if (target && target.focus) target.focus();
}

function nudge(key) {
  var delta;
  if (typeof document !== 'undefined' && document.activeElement) activeRow = rowFromTarget(document.activeElement);
  if (key === 'arrowup' || key === 'arrowdown') {
    delta = key === 'arrowdown' ? 1 : -1;
    activeRow = (activeRow + delta + ROWS.length) % ROWS.length;
    focusRow(activeRow);
    return;
  }
  delta = key === 'arrowright' ? 1 : -1;
  if (activeRow === 0) cycleRig(delta);
  else if (activeRow === 1) cycleWeapon(delta);
  else if (activeRow === 2) stepHeat(delta);
  else cycleMode();
  focusRow(activeRow);
}

function startOpen() {
  var screen = document.getElementById('startScreen');
  return !!(screen && !screen.hidden);
}

function activateFocused(root) {
  var active = document.activeElement;
  if (active && root && root.contains(active) && typeof active.click === 'function' && !active.disabled) active.click();
}

function confirmLoadout() {
  var active = document.activeElement;
  var start;
  if (isCodexOpen()) {
    activateFocused(document.getElementById('codexPanel'));
    return;
  }
  if (active && active.id === 'codexOpenBtn') {
    openCodex();
    return;
  }
  start = document.getElementById('startBtn');
  if (start && start.click) start.click();
}

export function loadoutCommand(command) {
  if (typeof document === 'undefined') return false;
  if (!startOpen() && command !== 'cancel' && !isCodexOpen()) return false;
  if (command === 'cancel') {
    if (!isCodexOpen()) return false;
    closeCodex();
    return true;
  }
  if (isCodexOpen()) {
    if (command === 'left') cycleCodexTab(-1);
    else if (command === 'right') cycleCodexTab(1);
    else if (command === 'confirm') confirmLoadout();
    return true;
  }
  if (!startOpen()) return false;
  if (command === 'left') nudge('arrowleft');
  else if (command === 'right') nudge('arrowright');
  else if (command === 'up') nudge('arrowup');
  else if (command === 'down') nudge('arrowdown');
  else if (command === 'confirm') confirmLoadout();
  else return false;
  return true;
}

function onKey(event) {
  var key;
  var target;
  if (typeof document === 'undefined') return;
  if (!startOpen() && !isCodexOpen()) return;
  key = String(event.key || '').toLowerCase();
  if (isCodexOpen()) {
    if (key === 'escape') {
      event.preventDefault();
      event.stopPropagation();
      closeCodex();
      return;
    }
    if (key === 'arrowleft' || key === 'arrowright') {
      event.preventDefault();
      event.stopPropagation();
      cycleCodexTab(key === 'arrowright' ? 1 : -1);
      return;
    }
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      activateFocused(document.getElementById('codexPanel'));
    }
    return;
  }
  if (!startOpen()) return;
  if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
    event.preventDefault();
    event.stopPropagation();
    nudge(key);
    return;
  }
  if (key === 'enter') {
    target = event.target;
    if (target && target.closest && target.closest('#loadoutPanel')) {
      event.preventDefault();
      if (target.closest('#codexOpenBtn')) {
        event.stopPropagation();
        openCodex();
      }
    }
  }
}

function choiceButton(className, title, detail) {
  var button = el('button', className);
  button.type = 'button';
  button.appendChild(el('strong', '', title));
  button.appendChild(el('small', '', detail));
  return button;
}

function syncUnlockBanner() {
  var screen = document.getElementById('gameOverScreen');
  var host;
  var list;
  var sig;
  var restart;
  var i;
  if (!screen) return;
  list = peekRunUnlocks();
  sig = list.map(function (item) { return item.kind + ':' + item.id; }).join('|');
  host = document.getElementById('runUnlocks');
  if (!host) {
    host = el('div', 'run-unlocks');
    host.id = 'runUnlocks';
    host.setAttribute('aria-live', 'polite');
    restart = document.getElementById('restartBtn');
    if (restart && restart.parentNode) restart.parentNode.insertBefore(host, restart);
    else screen.appendChild(host);
  }
  if (!list.length) {
    host.hidden = true;
    if (unlockSig !== '') {
      unlockSig = '';
      while (host.firstChild) host.removeChild(host.firstChild);
    }
    return;
  }
  if (sig === unlockSig) return;
  unlockSig = sig;
  host.hidden = false;
  while (host.firstChild) host.removeChild(host.firstChild);
  host.appendChild(el('p', 'run-unlocks-kicker', isChinese() ? '已解鎖' : 'UNLOCKED'));
  for (i = 0; i < list.length; i += 1) host.appendChild(el('p', 'run-unlocks-line', list[i].label));
}

export function initLoadoutPanel() {
  var panel;
  var rigRow;
  var weaponRow;
  var heatRow;
  var modeRow;
  var codexBtn;
  var i;
  if (built || typeof document === 'undefined') return;
  panel = document.getElementById('loadoutPanel');
  if (!panel) return;
  panel.classList.add('loadout-panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Run loadout');
  panel.appendChild(el('p', 'loadout-kicker', 'LOADOUT'));
  statusNode = el('p', 'loadout-status', '');
  statusNode.setAttribute('aria-live', 'polite');
  panel.appendChild(statusNode);

  rigRow = el('div', 'loadout-row');
  rigRow.setAttribute('data-loadout-row', 'rig');
  rigRow.setAttribute('role', 'radiogroup');
  rigRow.setAttribute('aria-label', 'Rig');
  rigRow.appendChild(el('span', 'loadout-label', 'RIG'));
  var rigChoices = el('div', 'loadout-choices');
  for (i = 0; i < RIGS.length; i += 1) {
    (function (rig) {
      var button = choiceButton('loadout-card', rig.name, rig.blurb);
      button.setAttribute('role', 'radio');
      button.setAttribute('data-rig', rig.id);
      on(button, 'click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        activeRow = 0;
        chooseRig(rig.id);
      });
      rigButtons.push(button);
      rigChoices.appendChild(button);
    })(RIGS[i]);
  }
  rigRow.appendChild(rigChoices);
  panel.appendChild(rigRow);

  weaponRow = el('div', 'loadout-row');
  weaponRow.setAttribute('data-loadout-row', 'weapon');
  weaponRow.setAttribute('role', 'radiogroup');
  weaponRow.setAttribute('aria-label', 'Primary weapon');
  weaponRow.appendChild(el('span', 'loadout-label', 'WEAPON'));
  var weaponChoices = el('div', 'loadout-choices');
  for (i = 0; i < WEAPONS.length; i += 1) {
    (function (weapon) {
      var button = choiceButton('loadout-card', weapon.name, weapon.rate + ' · ' + weapon.pattern);
      var line = el('small', 'loadout-line', weapon.line);
      button.appendChild(line);
      button.setAttribute('role', 'radio');
      button.setAttribute('data-weapon', weapon.id);
      on(button, 'click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        activeRow = 1;
        chooseWeapon(weapon.id);
      });
      weaponButtons.push(button);
      weaponChoices.appendChild(button);
    })(WEAPONS[i]);
  }
  weaponRow.appendChild(weaponChoices);
  panel.appendChild(weaponRow);

  heatRow = el('div', 'loadout-row');
  heatRow.setAttribute('data-loadout-row', 'heat');
  heatRow.setAttribute('aria-label', 'Dust Heat');
  heatRow.appendChild(el('span', 'loadout-label', 'HEAT'));
  var heatChoices = el('div', 'loadout-heat');
  heatDown = el('button', 'loadout-step', '−');
  heatDown.type = 'button';
  heatDown.setAttribute('aria-label', 'Lower Heat');
  heatUp = el('button', 'loadout-step', '+');
  heatUp.type = 'button';
  heatUp.setAttribute('aria-label', 'Raise Heat');
  heatValue = el('button', 'loadout-heat-value', 'HEAT 0');
  heatValue.type = 'button';
  on(heatDown, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 2;
    stepHeat(-1);
  });
  on(heatUp, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 2;
    stepHeat(1);
  });
  on(heatValue, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 2;
  });
  heatChoices.appendChild(heatDown);
  heatChoices.appendChild(heatValue);
  heatChoices.appendChild(heatUp);
  heatRow.appendChild(heatChoices);
  panel.appendChild(heatRow);

  modeRow = el('div', 'loadout-row');
  modeRow.setAttribute('data-loadout-row', 'mode');
  modeRow.setAttribute('role', 'radiogroup');
  modeRow.setAttribute('aria-label', 'Run mode');
  modeRow.appendChild(el('span', 'loadout-label', 'MODE'));
  var modeChoices = el('div', 'loadout-choices loadout-choices--mode');
  modeStandard = el('button', 'loadout-card loadout-mode', 'STANDARD');
  modeStandard.type = 'button';
  modeStandard.setAttribute('role', 'radio');
  modeDaily = el('button', 'loadout-card loadout-mode', 'DAILY');
  modeDaily.type = 'button';
  modeDaily.setAttribute('role', 'radio');
  on(modeStandard, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 3;
    chooseMode('standard');
  });
  on(modeDaily, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 3;
    chooseMode('daily');
  });
  modeChoices.appendChild(modeStandard);
  modeChoices.appendChild(modeDaily);
  modeRow.appendChild(modeChoices);
  panel.appendChild(modeRow);

  ruleNode = el('p', 'loadout-rule', '');
  scoreNode = el('p', 'loadout-legacy', '');
  panel.appendChild(ruleNode);
  panel.appendChild(scoreNode);
  panel.appendChild(el('p', 'loadout-hint', 'ARROWS SELECT · TAB MOVES · ENTER STARTS'));

  codexBtn = el('button', 'loadout-codex', 'CODEX');
  codexBtn.type = 'button';
  codexBtn.id = 'codexOpenBtn';
  codexBtn.setAttribute('aria-label', 'Open codex');
  on(codexBtn, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    openCodex();
  });
  panel.appendChild(codexBtn);

  on(window, 'keydown', onKey, true);
  panel.hidden = false;
  built = true;
  refresh();
}

export function updateLoadoutPanel() {
  var screen;
  if (typeof document === 'undefined') return;
  if (!built) initLoadoutPanel();
  if (!built) return;
  screen = document.getElementById('startScreen');
  if (!screen || !screen.hidden) refresh();
  syncUnlockBanner();
}

onLanguageChange(function () {
  if (built) refresh();
});
