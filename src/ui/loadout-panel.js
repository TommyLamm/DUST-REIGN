import { isChinese, onLanguageChange, tDailySummary, tDailyTitle, tRigBlurb, tRigName, tRigReq, tWeaponLine, tWeaponName, tWeaponPattern } from '../core/i18n.js';
import { getCampaignStore, readBestScoreV2, readDaily, readLegacyBestScore, readMeta, writeMeta } from '../core/meta-store.js';
import { rt } from '../core/runtime.js';
import { on } from '../core/utils.js';
import { CAMPAIGN_STAGES, getCampaignStage } from '../data/campaign-stages.js';
import { getHeatModifiers } from '../data/heat.js';
import { RIGS, getRig } from '../data/rigs.js';
import { peekRunUnlocks, resolveSelection } from '../systems/meta.js';
import { isCampaignModalOpen, openCampaignModal, campaignModalCommand } from './campaign-modal.js';
import { closeCodex, cycleCodexTab, isCodexOpen, openCodex } from './codex-panel.js';
import { updateGameOverUi } from './game-over.js';
import { cycleHardcoreOperation, getSelectedHardcoreOperation, renderHardcoreBriefing } from './hardcore-briefing.js';
import { createWorkshopPanel, refreshWorkshopPanel } from './workshop-panel.js';
import { createVaultPanel, refreshVaultPanel } from './vault-panel.js';
import { createBountiesPanel, refreshBountiesPanel } from './bounties-panel.js';

var WEAPONS = [
  { id: 'standard', name: 'STANDARD', rate: '0.18s', pattern: 'DIRECT', line: 'Steady rifle. Stay mobile.' },
  { id: 'breacher', name: 'BREACHER', rate: 'BURST', pattern: '5-PELLET', line: 'Close spread. Commit to the pocket.' },
  { id: 'vanguard', name: 'VANGUARD', rate: 'CHARGE', pattern: 'PIERCE', line: 'Hold to fire a heavy slug.' },
  { id: 'arc-welder', name: 'ARC WELDER', rate: 'FAST', pattern: 'CHAIN', line: 'Lightning that jumps targets.' }
];
var MODES = ['standard', 'campaign', 'hardcore', 'daily'];
var TACTICALS = [
  { id: 'sentry-turret', name: 'SENTRY TURRET', zhName: '定點機槍塔', cd: '16s', icon: '⛨', line: '120HP auto-turret with aura' },
  { id: 'thermal-decoy', name: 'THERMAL DECOY', zhName: '熱誘餌干擾彈', cd: '14s', icon: '✦', line: '3 flares distorting enemy fire' },
  { id: 'singularity-grenade', name: 'SINGULARITY', zhName: '微型奇點手雷', cd: '18s', icon: '◎', line: 'Vortex pulls foes then collapses' }
];
var ROWS = ['rig', 'weapon', 'tactical', 'heat', 'mode'];

var built = false;
var activeRow = 0;
var activeNavTab = 'loadout';
var tabBtnLoadout;
var tabBtnWorkshop;
var tabBtnVault;
var tabBtnBounties;
var tabPanelLoadout;
var tabPanelWorkshop;
var tabPanelVault;
var tabPanelBounties;
var rigButtons = [];
var weaponButtons = [];
var tacticalButtons = [];
var tacticalRow;
var heatRow;
var heatDown;
var heatUp;
var heatValue;
var modeStandard;
var modeCampaign;
var modeHardcore;
var modeDaily;
var campaignStageBar;
var campaignStageCode;
var campaignStageName;
var campaignStageStars;
var campaignSelectStageBtn;
var hardcoreBriefingContainer;
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
  return String(Math.max(0, Math.round(Number(value) || 0))).padStart(6, '0');
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
  var currentMode;
  var lockedDaily;
  var lockedHardcore;
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
  meta = readMeta();
  currentMode = meta.selectedMode || 'standard';
  lockedDaily = !!(pick.rule && currentMode === 'daily');
  lockedHardcore = (currentMode === 'hardcore');

  var zh = isChinese();
  var hcOp = lockedHardcore ? getSelectedHardcoreOperation() : null;

  // If in Hardcore, force sync rig & weapon to match locked operation
  if (lockedHardcore && hcOp) {
    if (pick.rigId !== hcOp.lockedRig || pick.weaponId !== hcOp.lockedWeapon) {
      writeMeta({ selectedRig: hcOp.lockedRig, selectedWeapon: hcOp.lockedWeapon });
      pick.rigId = hcOp.lockedRig;
      pick.weaponId = hcOp.lockedWeapon;
    }
  }

  // Rig Buttons Refresh
  for (i = 0; i < rigButtons.length; i += 1) {
    rig = RIGS[i];
    var locked = meta.unlockedRigs.indexOf(rig.id) === -1;
    var selected = rig.id === pick.rigId;
    setPressed(rigButtons[i], selected, locked || lockedDaily || lockedHardcore);
    rigButtons[i].classList.toggle('is-locked', (locked && !selected) || (lockedHardcore && !selected));
    rigButtons[i].classList.toggle('is-locked-by-rule', (lockedDaily && selected) || (lockedHardcore && selected));

    var rigTitle = rigButtons[i].querySelector('strong');
    if (rigTitle) rigTitle.textContent = zh ? tRigName(rig.id) : rig.name;
    var detail = rigButtons[i].querySelector('small');
    if (detail) {
      if (lockedHardcore) {
        detail.textContent = selected ? (zh ? '🔒 極限鎖定機體' : '🔒 HARDCORE LOCKED') : (zh ? '極限模式禁用' : 'RESTRICTED');
      } else if (locked && !lockedDaily) {
        detail.textContent = zh ? tRigReq(rig) : rig.req;
      } else if (lockedDaily && selected) {
        detail.textContent = zh ? '每日鎖定' : 'DAILY LOCK';
      } else {
        detail.textContent = zh ? tRigBlurb(rig.id) : rig.blurb;
      }
    }
  }

  // Weapon Buttons Refresh
  for (i = 0; i < weaponButtons.length; i += 1) {
    weapon = WEAPONS[i];
    var wSelected = (weapon.id === pick.weaponId);
    setPressed(weaponButtons[i], wSelected, lockedDaily || lockedHardcore);
    weaponButtons[i].classList.toggle('is-locked', lockedHardcore && !wSelected);
    weaponButtons[i].classList.toggle('is-locked-by-rule', (lockedDaily && wSelected) || (lockedHardcore && wSelected));

    var wTitle = weaponButtons[i].querySelector('strong');
    if (wTitle) wTitle.textContent = zh ? tWeaponName(weapon.id) : weapon.name;
    var wRatePattern = weaponButtons[i].querySelector('small:not(.loadout-line)');
    if (wRatePattern) {
      var rText = weapon.rate;
      if (zh) rText = rText.replace('BURST', '連發').replace('CHARGE', '充能').replace('FAST', '極速');
      wRatePattern.textContent = rText + ' · ' + (zh ? tWeaponPattern(weapon.id) : weapon.pattern);
    }
    var wLine = weaponButtons[i].querySelector('.loadout-line');
    if (wLine) {
      if (lockedHardcore) {
        wLine.textContent = wSelected ? (zh ? '🔒 極限專屬主武' : '🔒 HARDCORE LOCKED') : (zh ? '作戰禁用' : 'RESTRICTED');
      } else {
        wLine.textContent = zh ? tWeaponLine(weapon.id) : weapon.line;
      }
    }
  }

  // Tactical Buttons Refresh
  var currentTac = meta.selectedTactical || 'sentry-turret';
  for (i = 0; i < tacticalButtons.length; i += 1) {
    var tac = TACTICALS[i];
    var tSelected = (tac.id === currentTac);
    setPressed(tacticalButtons[i], tSelected, lockedHardcore);
    tacticalButtons[i].classList.toggle('is-locked', lockedHardcore && !tSelected);

    var tTitle = tacticalButtons[i].querySelector('strong');
    if (tTitle) tTitle.textContent = zh ? tac.zhName : tac.name;
    var tCd = tacticalButtons[i].querySelector('small:not(.loadout-line)');
    if (tCd) tCd.textContent = tac.icon + ' ' + (zh ? ('冷卻 ' + tac.cd) : ('CD ' + tac.cd));
    var tTacLine = tacticalButtons[i].querySelector('.loadout-line');
    if (tTacLine) tTacLine.textContent = tac.line;
  }

  // Heat Controls Refresh
  if (lockedHardcore) {
    if (heatRow) heatRow.style.display = 'none';
  } else {
    if (heatRow) heatRow.style.display = '';
    setPressed(heatDown, false, lockedDaily);
    setPressed(heatUp, false, lockedDaily);
    heatDown.tabIndex = 0;
    heatUp.tabIndex = 0;
    heatValue.tabIndex = 0;
    heatValue.textContent = (zh ? '熱度 ' : 'HEAT ') + pick.heat + ' ' + formatMult(pick.heat);
    heatValue.setAttribute('aria-disabled', lockedDaily ? 'true' : 'false');
  }

  // Mode Buttons Refresh
  setPressed(modeStandard, currentMode === 'standard', false);
  setPressed(modeCampaign, currentMode === 'campaign', false);
  setPressed(modeHardcore, currentMode === 'hardcore', false);
  setPressed(modeDaily, currentMode === 'daily', false);

  modeStandard.textContent = zh ? '標準出擊' : 'STANDARD';
  modeCampaign.textContent = zh ? '戰役闖關' : 'CAMPAIGN';
  modeHardcore.textContent = zh ? '極限作戰' : 'HARDCORE';
  modeDaily.textContent = zh ? '每日挑戰' : 'DAILY';

  // Campaign Stage Bar Display
  if (currentMode === 'campaign') {
    if (campaignStageBar) {
      campaignStageBar.hidden = false;
      var campStore = getCampaignStore();
      var selStageId = campStore.selectedStage || 'stage_1_1';
      var stgObj = getCampaignStage(selStageId);
      var stgRecord = (campStore.stages && campStore.stages[selStageId]) || { stars: 0 };
      var starsStr = (stgRecord.stars >= 1 ? '★' : '☆') + (stgRecord.stars >= 2 ? '★' : '☆') + (stgRecord.stars >= 3 ? '★' : '☆');

      if (campaignStageCode) campaignStageCode.textContent = stgObj ? stgObj.code : 'STAGE 1-1';
      if (campaignStageName) campaignStageName.textContent = stgObj ? (zh ? stgObj.name : stgObj.name) : '荒漠清道夫';
      if (campaignStageStars) campaignStageStars.textContent = '[' + starsStr + ']';
      if (campaignSelectStageBtn) campaignSelectStageBtn.textContent = zh ? '選擇關卡 ⊞' : 'SELECT STAGE ⊞';
    }
  } else {
    if (campaignStageBar) campaignStageBar.hidden = true;
  }

  // Hardcore Briefing Display
  if (currentMode === 'hardcore') {
    if (hardcoreBriefingContainer) {
      hardcoreBriefingContainer.hidden = false;
      renderHardcoreBriefing(hardcoreBriefingContainer, function (op) {
        writeMeta({ selectedRig: op.lockedRig, selectedWeapon: op.lockedWeapon });
        refresh();
      });
    }
  } else {
    if (hardcoreBriefingContainer) hardcoreBriefingContainer.hidden = true;
  }

  // Summary Rule Line
  if (currentMode === 'daily' && pick.rule) {
    saved = readDaily();
    best = saved.date === pick.dateKey ? saved.best : 0;
    runs = saved.date === pick.dateKey ? saved.runs : 0;
    if (zh) {
      ruleText = tDailyTitle(pick.rule.id) + ' — ' + tDailySummary(pick.rule.id) + ' 鎖定 ' + tRigName(pick.rigId) + ' / ' + tWeaponName(pick.weaponId) + ' / 熱度 ' + pick.heat + '。' + routeText(pick.rule) + '。今日最佳 ' + padScore(best) + ' · 出擊 ' + runs;
    } else {
      ruleText = pick.rule.title + ' — ' + pick.rule.summary + ' Lock ' + pick.rigId.toUpperCase() + ' / ' + pick.weaponId.toUpperCase() + ' / HEAT ' + pick.heat + '. ' + routeText(pick.rule) + '. TODAY BEST ' + padScore(best) + ' · RUNS ' + runs;
    }
  } else if (currentMode === 'campaign') {
    ruleText = zh ? '戰役區域闖關 — 目標突破與三星精通評級' : 'SECTOR CAMPAIGN — STAGE OBJECTIVES & 3-STAR MASTERY';
  } else if (currentMode === 'hardcore') {
    ruleText = zh ? '極限作戰模式 — 固定配置、天敵怪潮與苛刻負面懲罰' : 'HARDCORE OPERATIONS — FIXED LOADOUTS & TACTICAL COUNTER SWARMS';
  } else {
    ruleText = zh ? '標準出擊 — 自由選配機體與主武器，深入荒原長程生存' : 'STANDARD RUN — FREE LOADOUT, ADAPTIVE ROGUELIKE WASTELAND DRIFT';
  }
  if (ruleNode.textContent !== ruleText) ruleNode.textContent = ruleText;

  var scores = (zh ? '最佳分數 ' : 'BEST ') + padScore(readBestScoreV2()) + '   ' + (zh ? '歷史最佳 ' : 'LEGACY BEST ') + padScore(readLegacyBestScore());
  if (scoreNode.textContent !== scores) scoreNode.textContent = scores;

  status = (zh ? tRigName(pick.rigId) : pick.rigId.toUpperCase()) + ' · ' + (zh ? tWeaponName(pick.weaponId) : pick.weaponId.toUpperCase()) + (currentMode !== 'hardcore' ? (' · ' + (zh ? '熱度 ' : 'HEAT ') + pick.heat + ' · ' + formatMult(pick.heat)) : '') + ' · ' + (zh ? '重骰 ' : 'REROLLS ') + rerollCount(pick);
  if (statusNode.textContent !== status) statusNode.textContent = status;

  var kicker = document.querySelector('#loadoutPanel .loadout-kicker');
  if (kicker) kicker.textContent = zh ? '出擊配置' : 'LOADOUT';
  var rigLabel = document.querySelector('#loadoutPanel [data-loadout-row="rig"] .loadout-label');
  if (rigLabel) rigLabel.textContent = zh ? '機體' : 'RIG';
  var weaponLabel = document.querySelector('#loadoutPanel [data-loadout-row="weapon"] .loadout-label');
  if (weaponLabel) weaponLabel.textContent = zh ? '武器' : 'WEAPON';
  var tacticalLabel = document.querySelector('#loadoutPanel [data-loadout-row="tactical"] .loadout-label');
  if (tacticalLabel) tacticalLabel.textContent = zh ? '戰術' : 'TACTICAL';
  var heatLabel = document.querySelector('#loadoutPanel [data-loadout-row="heat"] .loadout-label');
  if (heatLabel) heatLabel.textContent = zh ? '熱度' : 'HEAT';
  var modeLabel = document.querySelector('#loadoutPanel [data-loadout-row="mode"] .loadout-label');
  if (modeLabel) modeLabel.textContent = zh ? '模式' : 'MODE';
  var hintNode = document.querySelector('#loadoutPanel .loadout-hint');
  if (hintNode) hintNode.textContent = zh ? '方向鍵 選擇 · TAB 切換 · ENTER 開始' : 'ARROWS SELECT · TAB MOVES · ENTER STARTS';
  var codexOpenBtn = document.getElementById('codexOpenBtn');
  if (codexOpenBtn) codexOpenBtn.textContent = zh ? '檔案庫' : 'CODEX';

  if (tabBtnLoadout) tabBtnLoadout.textContent = zh ? '[1] 出擊配置' : '[1] LOADOUT';
  if (tabBtnWorkshop) tabBtnWorkshop.textContent = zh ? '[2] 改裝工坊 ⚡' : '[2] WORKSHOP ⚡';
  if (tabBtnVault) tabBtnVault.textContent = zh ? '[3] 星級寶庫 ★' : '[3] STAR VAULT ★';
  if (tabBtnBounties) tabBtnBounties.textContent = zh ? '[4] 每日賞金 ⚙' : '[4] BOUNTIES ⚙';

  if (activeNavTab === 'workshop') refreshWorkshopPanel(tabPanelWorkshop);
  else if (activeNavTab === 'vault') refreshVaultPanel(tabPanelVault);
  else if (activeNavTab === 'bounties') refreshBountiesPanel(tabPanelBounties);
}

function chooseRig(id) {
  var meta = readMeta();
  if (meta.selectedMode === 'daily' || meta.selectedMode === 'hardcore') return;
  if (meta.unlockedRigs.indexOf(id) === -1) return;
  writeMeta({ selectedRig: id });
  refresh();
}

function chooseWeapon(id) {
  var meta = readMeta();
  if (meta.selectedMode === 'daily' || meta.selectedMode === 'hardcore') return;
  writeMeta({ selectedWeapon: id });
  refresh();
}

function chooseTactical(id) {
  var meta = readMeta();
  if (meta.selectedMode === 'hardcore') return;
  writeMeta({ selectedTactical: id });
  refresh();
}

function cycleTactical(delta) {
  var meta = readMeta();
  if (meta.selectedMode === 'hardcore') return;
  var current = meta.selectedTactical || 'sentry-turret';
  var index = 0;
  for (var i = 0; i < TACTICALS.length; i += 1) {
    if (TACTICALS[i].id === current) index = i;
  }
  chooseTactical(TACTICALS[(index + delta + TACTICALS.length) % TACTICALS.length].id);
}

function stepHeat(delta) {
  var meta = readMeta();
  if (meta.selectedMode === 'daily' || meta.selectedMode === 'hardcore') return;
  var next = (meta.selectedHeat | 0) + delta;
  if (next < 0) next = 0;
  if (next > (meta.heatUnlocked | 0)) next = meta.heatUnlocked | 0;
  writeMeta({ selectedHeat: next });
  refresh();
}

function chooseMode(mode) {
  writeMeta({ selectedMode: mode });
  if (mode === 'hardcore') {
    var op = getSelectedHardcoreOperation();
    if (op) {
      writeMeta({ selectedRig: op.lockedRig, selectedWeapon: op.lockedWeapon });
    }
  }
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
  var meta = readMeta();
  if (meta.selectedMode === 'daily' || meta.selectedMode === 'hardcore') return;
  var ids = unlockedRigIds();
  var index = ids.indexOf(meta.selectedRig);
  if (index < 0) index = 0;
  chooseRig(ids[(index + delta + ids.length) % ids.length]);
}

function cycleWeapon(delta) {
  var meta = readMeta();
  if (meta.selectedMode === 'daily' || meta.selectedMode === 'hardcore') return;
  var index = 0;
  var i;
  for (i = 0; i < WEAPONS.length; i += 1) if (WEAPONS[i].id === meta.selectedWeapon) index = i;
  chooseWeapon(WEAPONS[(index + delta + WEAPONS.length) % WEAPONS.length].id);
}

function cycleMode(delta) {
  delta = delta || 1;
  var meta = readMeta();
  var current = meta.selectedMode || 'standard';
  var idx = MODES.indexOf(current);
  if (idx === -1) idx = 0;
  var nextMode = MODES[(idx + delta + MODES.length) % MODES.length];
  chooseMode(nextMode);
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
  var meta = readMeta();
  var currentMode = meta.selectedMode || 'standard';

  if (typeof document !== 'undefined' && document.activeElement) activeRow = rowFromTarget(document.activeElement);
  if (key === 'arrowup' || key === 'arrowdown') {
    delta = key === 'arrowdown' ? 1 : -1;
    activeRow = (activeRow + delta + ROWS.length) % ROWS.length;
    focusRow(activeRow);
    return;
  }
  delta = key === 'arrowright' ? 1 : -1;
  if (activeRow === 0) {
    if (currentMode !== 'hardcore') cycleRig(delta);
  } else if (activeRow === 1) {
    if (currentMode !== 'hardcore') cycleWeapon(delta);
  } else if (activeRow === 2) {
    if (currentMode !== 'hardcore') cycleTactical(delta);
  } else if (activeRow === 3) {
    if (currentMode === 'hardcore') {
      cycleHardcoreOperation(delta);
    } else {
      stepHeat(delta);
    }
  } else {
    cycleMode(delta);
  }
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
  if (isCampaignModalOpen()) {
    campaignModalCommand('confirm');
    return;
  }
  if (isCodexOpen()) {
    activateFocused(document.getElementById('codexPanel'));
    return;
  }
  if (active && active.id === 'codexOpenBtn') {
    openCodex();
    return;
  }
  if (active && active.id === 'campaignSelectStageBtn') {
    openCampaignModal(function () { refresh(); });
    return;
  }
  start = document.getElementById('startBtn');
  if (start && start.click) start.click();
}

export function loadoutCommand(command) {
  if (typeof document === 'undefined') return false;
  if (isCampaignModalOpen()) {
    return campaignModalCommand(command);
  }
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
  if (isCampaignModalOpen()) return;
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
        return;
      }
      if (target.closest('#campaignSelectStageBtn')) {
        event.stopPropagation();
        openCampaignModal(function () { refresh(); });
        return;
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
  var restartBtnNode;
  var i;
  if (!screen) return;
  list = peekRunUnlocks();
  sig = list.map(function (item) { return item.kind + ':' + item.id; }).join('|');
  host = document.getElementById('runUnlocks');
  if (!host) {
    host = el('div', 'run-unlocks');
    host.id = 'runUnlocks';
    host.setAttribute('aria-live', 'polite');
    restartBtnNode = document.getElementById('restartBtn');
    if (restartBtnNode && restartBtnNode.parentNode) restartBtnNode.parentNode.insertBefore(host, restartBtnNode);
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

function switchNavTab(tabId) {
  activeNavTab = tabId;
  if (tabBtnLoadout) tabBtnLoadout.classList.toggle('is-active', tabId === 'loadout');
  if (tabBtnWorkshop) tabBtnWorkshop.classList.toggle('is-active', tabId === 'workshop');
  if (tabBtnVault) tabBtnVault.classList.toggle('is-active', tabId === 'vault');
  if (tabBtnBounties) tabBtnBounties.classList.toggle('is-active', tabId === 'bounties');

  if (tabPanelLoadout) tabPanelLoadout.hidden = (tabId !== 'loadout');
  if (tabPanelWorkshop) tabPanelWorkshop.hidden = (tabId !== 'workshop');
  if (tabPanelVault) tabPanelVault.hidden = (tabId !== 'vault');
  if (tabPanelBounties) tabPanelBounties.hidden = (tabId !== 'bounties');

  if (tabId === 'workshop') refreshWorkshopPanel(tabPanelWorkshop);
  else if (tabId === 'vault') refreshVaultPanel(tabPanelVault);
  else if (tabId === 'bounties') refreshBountiesPanel(tabPanelBounties);
  else refresh();
}

export function initLoadoutPanel() {
  var panel;
  var rigRow;
  var weaponRow;
  var modeRow;
  var codexBtn;
  var i;
  if (built || typeof document === 'undefined') return;
  panel = document.getElementById('loadoutPanel');
  if (!panel) return;
  panel.classList.add('loadout-panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Run loadout');

  // Top Nav Tabs
  var navTabs = el('div', 'loadout-nav-tabs');
  tabBtnLoadout = el('button', 'loadout-nav-tab is-active', '[1] LOADOUT');
  tabBtnLoadout.type = 'button';
  tabBtnWorkshop = el('button', 'loadout-nav-tab', '[2] WORKSHOP ⚡');
  tabBtnWorkshop.type = 'button';
  tabBtnVault = el('button', 'loadout-nav-tab', '[3] STAR VAULT ★');
  tabBtnVault.type = 'button';
  tabBtnBounties = el('button', 'loadout-nav-tab', '[4] BOUNTIES ⚙');
  tabBtnBounties.type = 'button';

  on(tabBtnLoadout, 'click', function (e) { e.preventDefault(); e.stopPropagation(); switchNavTab('loadout'); });
  on(tabBtnWorkshop, 'click', function (e) { e.preventDefault(); e.stopPropagation(); switchNavTab('workshop'); });
  on(tabBtnVault, 'click', function (e) { e.preventDefault(); e.stopPropagation(); switchNavTab('vault'); });
  on(tabBtnBounties, 'click', function (e) { e.preventDefault(); e.stopPropagation(); switchNavTab('bounties'); });

  navTabs.appendChild(tabBtnLoadout);
  navTabs.appendChild(tabBtnWorkshop);
  navTabs.appendChild(tabBtnVault);
  navTabs.appendChild(tabBtnBounties);
  panel.appendChild(navTabs);

  // Tab Panels
  tabPanelLoadout = el('div', 'loadout-tab-panel');
  tabPanelWorkshop = createWorkshopPanel();
  tabPanelVault = createVaultPanel();
  tabPanelBounties = createBountiesPanel();

  tabPanelLoadout.appendChild(el('p', 'loadout-kicker', 'LOADOUT'));
  statusNode = el('p', 'loadout-status', '');
  statusNode.setAttribute('aria-live', 'polite');
  tabPanelLoadout.appendChild(statusNode);

  // 1. Rig Row
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
  tabPanelLoadout.appendChild(rigRow);

  // 2. Weapon Row
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
  tabPanelLoadout.appendChild(weaponRow);

  // 3. Tactical Row
  tacticalRow = el('div', 'loadout-row');
  tacticalRow.setAttribute('data-loadout-row', 'tactical');
  tacticalRow.setAttribute('role', 'radiogroup');
  tacticalRow.setAttribute('aria-label', 'Tactical gear');
  tacticalRow.appendChild(el('span', 'loadout-label', 'TACTICAL'));
  var tacticalChoices = el('div', 'loadout-choices loadout-choices--tactical');
  for (i = 0; i < TACTICALS.length; i += 1) {
    (function (tac) {
      var button = choiceButton('loadout-card', tac.name, tac.icon + ' CD ' + tac.cd);
      var line = el('small', 'loadout-line', tac.line);
      button.appendChild(line);
      button.setAttribute('role', 'radio');
      button.setAttribute('data-tactical', tac.id);
      on(button, 'click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        activeRow = 2;
        chooseTactical(tac.id);
      });
      tacticalButtons.push(button);
      tacticalChoices.appendChild(button);
    })(TACTICALS[i]);
  }
  tacticalRow.appendChild(tacticalChoices);
  tabPanelLoadout.appendChild(tacticalRow);

  // 4. Heat Row
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
    activeRow = 3;
    stepHeat(-1);
  });
  on(heatUp, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 3;
    stepHeat(1);
  });
  on(heatValue, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 3;
  });
  heatChoices.appendChild(heatDown);
  heatChoices.appendChild(heatValue);
  heatChoices.appendChild(heatUp);
  heatRow.appendChild(heatChoices);
  tabPanelLoadout.appendChild(heatRow);

  // 5. Four-Mode Selection Row
  modeRow = el('div', 'loadout-row');
  modeRow.setAttribute('data-loadout-row', 'mode');
  modeRow.setAttribute('role', 'radiogroup');
  modeRow.setAttribute('aria-label', 'Run mode');
  modeRow.appendChild(el('span', 'loadout-label', 'MODE'));
  var modeChoices = el('div', 'loadout-choices loadout-choices--mode');

  modeStandard = el('button', 'loadout-card loadout-mode mode-tab', 'STANDARD');
  modeStandard.type = 'button';
  modeStandard.setAttribute('role', 'radio');
  modeStandard.setAttribute('data-mode', 'standard');

  modeCampaign = el('button', 'loadout-card loadout-mode mode-tab', 'CAMPAIGN');
  modeCampaign.type = 'button';
  modeCampaign.setAttribute('role', 'radio');
  modeCampaign.setAttribute('data-mode', 'campaign');

  modeHardcore = el('button', 'loadout-card loadout-mode mode-tab', 'HARDCORE');
  modeHardcore.type = 'button';
  modeHardcore.setAttribute('role', 'radio');
  modeHardcore.setAttribute('data-mode', 'hardcore');

  modeDaily = el('button', 'loadout-card loadout-mode mode-tab', 'DAILY');
  modeDaily.type = 'button';
  modeDaily.setAttribute('role', 'radio');
  modeDaily.setAttribute('data-mode', 'daily');

  on(modeStandard, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 4;
    chooseMode('standard');
  });
  on(modeCampaign, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 4;
    chooseMode('campaign');
  });
  on(modeHardcore, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 4;
    chooseMode('hardcore');
  });
  on(modeDaily, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    activeRow = 4;
    chooseMode('daily');
  });

  modeChoices.appendChild(modeStandard);
  modeChoices.appendChild(modeCampaign);
  modeChoices.appendChild(modeHardcore);
  modeChoices.appendChild(modeDaily);
  modeRow.appendChild(modeChoices);
  tabPanelLoadout.appendChild(modeRow);

  // 5. Campaign Stage Summary Bar
  campaignStageBar = el('div', 'campaign-stage-bar');
  campaignStageBar.id = 'campaignStageBar';
  campaignStageBar.hidden = true;

  var stageInfo = el('div', 'campaign-stage-info');
  var metaDiv = el('div', 'campaign-stage-meta');
  campaignStageCode = el('span', 'campaign-stage-code', 'STAGE 1-1');
  campaignStageStars = el('span', 'campaign-stage-stars', '[☆☆☆]');
  metaDiv.appendChild(campaignStageCode);
  metaDiv.appendChild(campaignStageStars);

  campaignStageName = el('span', 'campaign-stage-name', '荒漠清道夫');
  stageInfo.appendChild(metaDiv);
  stageInfo.appendChild(campaignStageName);

  campaignSelectStageBtn = el('button', 'campaign-stage-btn', 'SELECT STAGE ⊞');
  campaignSelectStageBtn.type = 'button';
  campaignSelectStageBtn.id = 'campaignSelectStageBtn';
  on(campaignSelectStageBtn, 'click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    openCampaignModal(function () {
      refresh();
    });
  });

  campaignStageBar.appendChild(stageInfo);
  campaignStageBar.appendChild(campaignSelectStageBtn);
  tabPanelLoadout.appendChild(campaignStageBar);

  // 6. Hardcore Briefing Container
  hardcoreBriefingContainer = el('div', 'hardcore-briefing-wrapper');
  hardcoreBriefingContainer.id = 'hardcoreBriefingContainer';
  hardcoreBriefingContainer.hidden = true;
  tabPanelLoadout.appendChild(hardcoreBriefingContainer);

  // 7. General Rules & Scores
  ruleNode = el('p', 'loadout-rule', '');
  scoreNode = el('p', 'loadout-legacy', '');
  tabPanelLoadout.appendChild(ruleNode);
  tabPanelLoadout.appendChild(scoreNode);
  tabPanelLoadout.appendChild(el('p', 'loadout-hint', 'ARROWS SELECT · TAB MOVES · ENTER STARTS'));

  codexBtn = el('button', 'loadout-codex', 'CODEX');
  codexBtn.type = 'button';
  codexBtn.id = 'codexOpenBtn';
  codexBtn.setAttribute('aria-label', 'Open codex');
  on(codexBtn, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    openCodex();
  });
  tabPanelLoadout.appendChild(codexBtn);

  panel.appendChild(tabPanelLoadout);
  panel.appendChild(tabPanelWorkshop);
  panel.appendChild(tabPanelVault);
  panel.appendChild(tabPanelBounties);

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
  if (rt.state) updateGameOverUi(rt.state);
}

onLanguageChange(function () {
  if (built) refresh();
});
