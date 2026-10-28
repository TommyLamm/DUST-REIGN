import { rt } from '../core/runtime.js';
import { readTipsEnabled, readTipsSeen, writeTipsSeen } from '../core/meta-store.js';
import { syncDashHeatClock } from '../systems/abilities.js';
import { takeRunUnlocks } from '../systems/meta.js';
import { isChinese, onLanguageChange, tMutatorBlurb, tMutatorName, tTip } from '../core/i18n.js';

var TIP_MS = 4000;
var GAP_MS = 20000;
var THREAT_PX = 120;

var queue = [];
var active = null;
var nextAt = 0;
var sessionSeen = [];

function nowMs() {
  if (typeof performance !== 'undefined' && performance.now) return performance.now();
  return Date.now();
}

function hasSeen(id) {
  if (sessionSeen.indexOf(id) !== -1) return true;
  return readTipsSeen().indexOf(id) !== -1;
}

function markSeen(id) {
  if (sessionSeen.indexOf(id) === -1) sessionSeen.push(id);
  var list = readTipsSeen();
  if (list.indexOf(id) === -1) {
    list.push(id);
    writeTipsSeen(list);
  }
}

function offer(id) {
  if (!readTipsEnabled()) return;
  if (hasSeen(id)) return;
  if (queue.indexOf(id) !== -1) return;
  if (active && active.id === id) return;
  queue.push(id);
}

export function onTipsReset() {
  sessionSeen = [];
  queue = [];
  active = null;
  nextAt = 0;
  var toast = tipNode();
  if (toast) toast.hidden = true;
}

function tipNode() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('tipToast');
}

function inputKind() {
  if (rt.gamepadState && rt.gamepadState.connected) return 'pad';
  return 'key';
}


function mutatorText() {
  var m = rt.state && rt.state.mutator;
  var zh = isChinese();
  if (!m) return zh ? '本波次變異因子已生效 · 注意戰況橫幅' : 'MUTATOR IS LIVE THIS WAVE · READ THE BANNER';
  var mid = typeof m === 'object' ? m.id : m;
  var name = (zh ? tMutatorName(mid) : null) || m.name || m.title || m.id || (zh ? '變異因子' : 'MUTATOR');
  var blurb = (zh ? tMutatorBlurb(mid) : null) || m.text || m.desc || m.summary || '';
  if (blurb) return name + ' // ' + blurb;
  return (zh ? '變異因子 // ' : 'MUTATOR // ') + name;
}

function tipText(id) {
  if (id === 'mutator') return mutatorText();
  return tTip(id, inputKind());
}

function canScan() {
  if (!rt.state || rt.state.over) return false;
  if (rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden) return false;
  if (rt.state.paused) {
    var upgrading = rt.state.upgradeChoices && rt.state.upgradeChoices.length;
    if (!upgrading && !rt.state.interlude) return false;
  }
  return true;
}

function burrowerWarnNear() {
  var list = rt.state && rt.state.enemies;
  if (!list) return false;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var e = list[i];
    if (e && e.kind === 'burrower' && e.state === 'warn') return true;
  }
  return false;
}

function meteorHazardNear() {
  var list = rt.state && rt.state.meteors;
  return !!(list && list.length);
}

function enemyOfKind(kind) {
  var list = rt.state && rt.state.enemies;
  if (!list) return false;
  var i;
  for (i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].kind === kind && list[i].hp > 0) return true;
  }
  return false;
}

function acidHazardNear() {
  var pools = rt.state && rt.state.acidPools;
  if (pools && pools.length) return true;
  var bullets = rt.state && rt.state.enemyBullets;
  if (!bullets) return false;
  var i;
  for (i = 0; i < bullets.length; i += 1) {
    if (bullets[i] && bullets[i].type === 'acid') return true;
  }
  return false;
}

function enemyWithin(px) {
  var p = rt.state.player;
  var list = rt.state.enemies || [];
  var limit = px * px;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var e = list[i];
    if (!e || !(e.hp > 0)) continue;
    var dx = e.x - p.x;
    var dy = e.y - p.y;
    if (dx * dx + dy * dy <= limit) return true;
  }
  return false;
}

function enemyBulletWithin(px) {
  var p = rt.state.player;
  if (!p) return false;
  var list = rt.state.enemyBullets || [];
  var limit = px * px;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var b = list[i];
    if (!b || b.grazed || b.noGraze) continue;
    var dx = b.x - p.x;
    var dy = b.y - p.y;
    if (dx * dx + dy * dy <= limit) return true;
  }
  return false;
}

function choiceCompletesFusion(choice) {
  if (!choice) return false;
  if (choice.completes || choice.completesFusion || choice.fusionName) return true;
  var fields = [choice.title, choice.text, choice.badge, choice.label, choice.completesLabel];
  var i;
  for (i = 0; i < fields.length; i += 1) {
    if (typeof fields[i] === 'string' && fields[i].indexOf('COMPLETES') !== -1) return true;
  }
  return false;
}

function scanTriggers() {
  if (!canScan() || !rt.state.player) return;
  offer('move-shoot');
  // First-run readability nudge: pause menu has Contrast: High.
  if ((rt.state.wave || 1) === 1 && (rt.state.waveTime || 0) >= 2) offer('contrast');
  if (enemyWithin(THREAT_PX)) offer('dash');
  if (rt.state.stats && (rt.state.stats.justDashes || 0) > 0) offer('just-dash');
  // Teach graze when shots are near — do not wait for a successful graze first.
  if (enemyBulletWithin(140) || ((rt.state.waveTime || 0) >= 6 && (rt.state.enemyBullets || []).length > 0)) offer('graze');
  if (rt.state.barrels && rt.state.barrels.length > 0) offer('barrel');
  if ((rt.state.player.energy || 0) >= 50) offer('emp');
  if (rt.state.boss && rt.state.boss.hp > 0) offer('core-boss');
  if (rt.state.contract) offer('contract');
  if ((rt.state.wave || 1) >= 6 && (enemyOfKind('spitter') || acidHazardNear())) offer('acid');
  if ((rt.state.wave || 1) >= 12 && (enemyOfKind('burrower') || burrowerWarnNear())) offer('burrower');
  if ((rt.state.wave || 1) >= 10 && enemyOfKind('mine')) offer('mine');
  if (meteorHazardNear() || (rt.state.mutator && (rt.state.mutator.id === 'scrap-rain'))) offer('meteor');
  if (rt.state.mutator) offer('mutator');
  var choices = rt.state.upgradeChoices || [];
  var ci;
  for (ci = 0; ci < choices.length; ci += 1) {
    if (choiceCompletesFusion(choices[ci])) {
      offer('fusion');
      break;
    }
  }
  if (rt.state.interlude && rt.state.interlude.step === 'extract') offer('extract');
  else if (rt.state.interlude) offer('route');
  if (rt.state.overtime && !rt.state.extracted) offer('overtime');
}

function showTip(toast, id) {
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('role', 'status');
  if (toast.className.indexOf('tip-toast') === -1) {
    toast.className = (toast.className ? toast.className + ' ' : '') + 'tip-toast';
  }
  toast.textContent = tipText(id);
  toast.hidden = false;
}

function syncDashHeatHud() {
  if (typeof document === 'undefined' || !rt.state || !rt.state.player) return;
  var heat = rt.state.player.dashHeat || 0;
  if (heat < 0) heat = 0;
  if (heat > 3) heat = 3;
  var heatLabel = String(heat | 0);
  var hud = document.getElementById('hud');
  if (!hud) return;
  var read = document.getElementById('dashHeatReadout');
  if (!read) {
    read = document.createElement('div');
    read.id = 'dashHeatReadout';
    read.className = 'dash-heat-readout';
    var name = document.createElement('span');
    name.className = 'dash-heat-label';
    name.textContent = isChinese() ? '衝刺過熱' : 'DASH HEAT';
    var marks = document.createElement('span');
    marks.className = 'dash-heat';
    marks.appendChild(document.createElement('i'));
    marks.appendChild(document.createElement('i'));
    marks.appendChild(document.createElement('i'));
    read.appendChild(name);
    read.appendChild(marks);
    hud.appendChild(read);
  }
  var nameEl = read.querySelector('.dash-heat-label');
  if (nameEl) nameEl.textContent = isChinese() ? '衝刺過熱' : 'DASH HEAT';
  if (read.getAttribute('data-heat') !== heatLabel) read.setAttribute('data-heat', heatLabel);
  read.hidden = !(heat > 0);
}

function showUnlocks(toast, unlocks) {
  var labels = [];
  var i;
  for (i = 0; i < unlocks.length; i += 1) labels.push(unlocks[i].label || unlocks[i].id || (isChinese() ? '解鎖' : 'UNLOCK'));
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('role', 'status');
  toast.textContent = (isChinese() ? '已解鎖 // ' : 'UNLOCKED // ') + labels.join(' · ');
  toast.hidden = false;
}

export function updateTips() {
  syncDashHeatClock();
  syncDashHeatHud();
  if (typeof document === 'undefined') return;
  var toast = tipNode();
  var unlocks = takeRunUnlocks();
  if (unlocks.length && toast) {
    showUnlocks(toast, unlocks);
    active = { id: 'unlock', until: nowMs() + TIP_MS };
  }
  scanTriggers();
  var t = nowMs();
  if (!readTipsEnabled()) {
    if (!(active && active.id === 'unlock' && nowMs() < active.until)) {
      active = null;
      if (toast) toast.hidden = true;
    }
    return;
  }
  if (!canScan()) {
    active = null;
    if (toast) toast.hidden = true;
    return;
  }
  if (active && t >= active.until) {
    active = null;
    if (toast) toast.hidden = true;
    nextAt = t + GAP_MS;
  }
  while (!active && queue.length && t >= nextAt) {
    var id = queue.shift();
    if (hasSeen(id)) continue;
    markSeen(id);
    active = { id: id, until: t + TIP_MS };
    if (toast) showTip(toast, id);
  }
}

export function refreshTipLanguage() {
  if (typeof document === 'undefined') return;
  var toast = tipNode();
  if (toast && !toast.hidden && active && active.id && active.id !== 'unlock') {
    showTip(toast, active.id);
  }
  var read = document.getElementById('dashHeatReadout');
  if (read) {
    var nameEl = read.querySelector('.dash-heat-label');
    if (nameEl) nameEl.textContent = isChinese() ? '衝刺過熱' : 'DASH HEAT';
  }
}

if (typeof onLanguageChange === 'function') {
  onLanguageChange(refreshTipLanguage);
}
