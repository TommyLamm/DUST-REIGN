import { rt } from '../core/runtime.js';
import { backInterlude, chooseInterlude, confirmExtract, confirmPushDeeper, nudgeInterlude, tickInterlude } from '../systems/interlude.js';
import { isChinese, onLanguageChange, tRouteName, tRouteReward, tRouteRule, tUpgradeText, tUpgradeTitle, tWeaponLine, tWeaponName } from '../core/i18n.js';

var bound = false;
var lastSig = '';
var defaultTitle = null;

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function panelSig() {
  var state = rt.state;
  if (!state || !state.interlude) return '';
  var il = state.interlude;
  var ids = '';
  var i;
  var options = il.options || [];
  for (i = 0; i < options.length; i += 1) ids += (options[i].id || '') + ',';
  return il.step + '|' + (il.selected || 0) + '|' + ids + '|' + (il.title || '') + '|' + (il.extractBonus || 0) + '|' + Math.floor(state.score || 0) + '|' + (isChinese() ? 'zh' : 'en');
}

function syncOutcomeTitle() {
  if (typeof document === 'undefined') return;
  var title = document.getElementById('gameOverTitle');
  if (!title) return;
  if (defaultTitle == null) defaultTitle = title.innerHTML;
  var zh = isChinese();
  if (rt.state && rt.state.over && rt.state.extracted) title.innerHTML = zh ? '已撤離<br /><span>出擊順利完成。</span>' : 'EXTRACTED<br /><span>RUN SECURED.</span>';
  else title.innerHTML = defaultTitle;
}

function fillCards(parent, options, selected, onPick) {
  var grid = el('div', 'interlude-grid');
  var zh = isChinese();
  var i;
  for (i = 0; i < options.length; i += 1) {
    (function (index, option) {
      var name = option.name;
      var rule = option.rule;
      var detail = option.detail;
      var reward = option.reward;
      if (zh && option.id) {
        name = tRouteName(option.id) || tUpgradeTitle(option) || tWeaponName(option.id) || name;
        rule = tRouteRule(option.id) || tUpgradeText(option) || rule;
        detail = tUpgradeText(option) || tWeaponLine(option.id) || detail;
        reward = tRouteReward(option.id) || reward;
      }
      var card = el('button', 'interlude-card' + (index === selected ? ' is-selected' : '') + (option.sector ? ' is-' + option.sector : ''));
      card.type = 'button';
      card.setAttribute('aria-label', name + '. ' + (rule || detail || ''));
      card.appendChild(el('span', 'interlude-index', String(index + 1)));
      card.appendChild(el('strong', 'interlude-name', name));
      if (rule) card.appendChild(el('p', 'interlude-rule', rule));
      if (detail && !rule) card.appendChild(el('p', 'interlude-rule', detail));
      if (reward) card.appendChild(el('em', 'interlude-reward', reward));
      if (option.sector) card.appendChild(el('i', 'interlude-sector interlude-sector--' + option.sector, option.sector.toUpperCase()));
      card.addEventListener('click', function () { onPick(index); });
      grid.appendChild(card);
    })(i, options[i]);
  }
  parent.appendChild(grid);
}

function renderInterlude(panel, il) {
  panel.replaceChildren();
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  var zh = isChinese();
  var shell = el('div', 'interlude-shell');
  var kicker = zh ? '幕間整備' : 'INTERLUDE';
  var heading = zh ? '選擇前進道路' : 'CHOOSE A ROAD';
  var hint = zh ? '1–4 或點擊 · 方向鍵移動 · ENTER 確認' : '1–3 OR CLICK · ARROWS TO MOVE · ENTER TO CONFIRM';
  if (il.step === 'armory') {
    kicker = zh ? '軍械庫' : 'ARMORY';
    heading = zh ? '檢修機體' : 'SERVICE THE RIG';
  } else if (il.step === 'weapon') {
    kicker = zh ? '軍械庫' : 'ARMORY';
    heading = zh ? '主武器選擇' : 'MAIN WEAPON';
    hint = zh ? '卡片將保留在機體上' : 'CARDS STAY ON THE RIG';
  } else if (il.step === 'title') {
    kicker = zh ? '下一區段' : 'NEXT SECTOR';
    heading = il.title || (zh ? '下一幕' : 'NEXT ACT');
    hint = '';
  }
  shell.appendChild(el('p', 'interlude-kicker', kicker));
  var title = el('h2', 'interlude-title', heading);
  title.id = 'interludeTitle';
  shell.appendChild(title);
  panel.setAttribute('aria-labelledby', 'interludeTitle');
  if (il.step === 'title') {
    shell.appendChild(el('p', 'interlude-hint', zh ? '保持警戒' : 'HOLD POSITION'));
  } else {
    fillCards(shell, il.options || [], il.selected || 0, function (index) { chooseInterlude(index); });
    if (il.step === 'weapon') {
      var back = el('button', 'interlude-back', zh ? '返回' : 'BACK');
      back.type = 'button';
      back.addEventListener('click', function () { backInterlude(); });
      shell.appendChild(back);
    }
    if (hint) shell.appendChild(el('p', 'interlude-hint', hint));
  }
  panel.appendChild(shell);
  var selected = shell.querySelector('.is-selected');
  if (selected && selected.focus) selected.focus();
}

function renderExtract(panel, il) {
  panel.replaceChildren();
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  var zh = isChinese();
  var shell = el('div', 'extract-shell');
  shell.appendChild(el('p', 'interlude-kicker', zh ? '黑玻璃區段肅清' : 'BLACK GLASS CLEARED'));
  var title = el('h2', 'interlude-title', zh ? '撤離通道已開啟' : 'THE GATE IS OPEN');
  title.id = 'extractTitle';
  shell.appendChild(title);
  panel.setAttribute('aria-labelledby', 'extractTitle');
  var score = el('p', 'extract-score');
  score.appendChild(el('span', null, zh ? '出擊分數' : 'RUN SCORE'));
  score.appendChild(el('strong', null, String(Math.round((rt.state && rt.state.score) || 0))));
  shell.appendChild(score);
  var bonus = el('p', 'extract-bonus');
  bonus.appendChild(el('span', null, zh ? '撤離獎勵' : 'EXTRACT BONUS'));
  bonus.appendChild(el('strong', null, '+' + String(il.extractBonus || 0)));
  shell.appendChild(bonus);
  var row = el('div', 'extract-actions');
  var extractBtn = el('button', 'extract-action extract-action--go' + ((il.selected || 0) === 0 ? ' is-selected' : ''), zh ? '立即撤離' : 'EXTRACT');
  extractBtn.type = 'button';
  extractBtn.setAttribute('aria-label', zh ? '撤離並結算本次出擊' : 'Extract and file this run');
  extractBtn.addEventListener('click', function () { confirmExtract(); });
  var pushBtn = el('button', 'extract-action' + ((il.selected || 0) === 1 ? ' is-selected' : ''), zh ? '深入戰區' : 'PUSH DEEPER');
  pushBtn.type = 'button';
  pushBtn.setAttribute('aria-label', zh ? '深入延長戰區。若陣亡僅發放一半撤離獎勵。' : 'Push deeper into overtime. Death pays half the extract bonus.');
  pushBtn.addEventListener('click', function () { confirmPushDeeper(); });
  row.appendChild(extractBtn);
  row.appendChild(pushBtn);
  shell.appendChild(row);
  shell.appendChild(el('p', 'extract-note', zh ? '深入戰區: 若在此戰死，撤離獎勵僅發放 50%。' : 'PUSH DEEPER: if you die, the extract bonus pays 50%.'));
  panel.appendChild(shell);
  var selected = shell.querySelector('.is-selected');
  if (selected && selected.focus) selected.focus();
}

function pickInterludeKey(index) {
  var il = rt.state && rt.state.interlude;
  if (!il) return;
  if (il.step === 'extract') {
    if (index === 1) confirmPushDeeper();
    else confirmExtract();
    return;
  }
  chooseInterlude(index);
}

function onKey(event) {
  if (!rt.state || !rt.state.interlude || event.repeat) return;
  var key = String(event.key || '').toLowerCase();
  if (key === 'arrowleft' || key === 'arrowup') {
    nudgeInterlude(-1);
    event.preventDefault();
  } else if (key === 'arrowright' || key === 'arrowdown') {
    nudgeInterlude(1);
    event.preventDefault();
  } else if (key === '1' || key === '2' || key === '3' || key === '4') {
    pickInterludeKey(Number(key) - 1);
    event.preventDefault();
  } else if (key === 'enter') {
    pickInterludeKey(rt.state.interlude.selected || 0);
    event.preventDefault();
  } else if (key === 'backspace' && rt.state.interlude.step === 'weapon') {
    backInterlude();
    event.preventDefault();
  }
}

function pollPad() {
  if (!rt.state || !rt.state.interlude || typeof navigator === 'undefined' || !navigator.getGamepads) return;
  var pads = navigator.getGamepads();
  if (!pads) return;
  var gp = null;
  var i;
  for (i = 0; i < pads.length; i += 1) {
    if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
  }
  if (!gp) return;
  var buttons = gp.buttons || [];
  var prev = rt.state._interludePad || [];
  function down(idx) {
    var btn = buttons[idx];
    var pressed = !!(btn && (btn.pressed || (typeof btn.value === 'number' && btn.value > 0.15)));
    var was = !!prev[idx];
    prev[idx] = pressed;
    return pressed && !was;
  }
  if (down(14) || down(12)) nudgeInterlude(-1);
  else if (down(15) || down(13)) nudgeInterlude(1);
  else if (down(0)) pickInterludeKey(rt.state.interlude.selected || 0);
  rt.state._interludePad = prev;
}

export function initInterludePanel() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  window.addEventListener('keydown', onKey);
}

export function updateInterludePanel() {
  if (typeof document === 'undefined') return;
  tickInterlude(rt.renderTime || 0);
  syncOutcomeTitle();
  var interlude = document.getElementById('interludePanel');
  var extract = document.getElementById('extractPanel');
  if (!interlude && !extract) return;
  var il = rt.state && rt.state.interlude;
  if (!il) {
    lastSig = '';
    if (interlude) interlude.hidden = true;
    if (extract) extract.hidden = true;
    return;
  }
  pollPad();
  var sig = panelSig();
  var showExtract = il.step === 'extract';
  if (interlude) interlude.hidden = showExtract;
  if (extract) extract.hidden = !showExtract;
  if (sig === lastSig) return;
  lastSig = sig;
  if (showExtract && extract) renderExtract(extract, il);
  else if (interlude) renderInterlude(interlude, il);
}

onLanguageChange(function () {
  if (rt.state && rt.state.interlude) {
    lastSig = '';
    updateInterludePanel();
  }
});
