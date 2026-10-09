import { readMeta } from '../core/meta-store.js';
import { on } from '../core/utils.js';
import { enemyProfile } from '../data/enemies.js';
import { FUSION_CHIPS } from '../data/upgrades.js';
import { listAchievements } from '../systems/meta.js';
import { isChinese, onLanguageChange, tAchievementDetail, tAchievementReward, tAchievementTitle, tEnemyName, tFusionTitle, tUpgradeTitle } from '../core/i18n.js';

var TABS = ['achievements', 'enemies', 'fusions', 'stats'];
var PROFILED = { crawler: 1, rusher: 1, brute: 1, artillery: 1, elite: 1, titan: 1 };
var ENEMIES = [
  { id: 'crawler', name: 'CRAWLER', boss: false },
  { id: 'rusher', name: 'RUSHER', boss: false },
  { id: 'brute', name: 'BRUTE', boss: false },
  { id: 'artillery', name: 'ARTILLERY', boss: false },
  { id: 'elite', name: 'ELITE', boss: false },
  { id: 'spitter', name: 'SPITTER', boss: false },
  { id: 'scurrier', name: 'SCURRIER', boss: false },
  { id: 'warden', name: 'WARDEN', boss: false },
  { id: 'burrower', name: 'BURROWER', boss: false },
  { id: 'titan', name: 'TITAN', boss: true },
  { id: 'dreadnought', name: 'DREADNOUGHT', boss: true },
  { id: 'sovereign', name: 'STORM SOVEREIGN', boss: true }
];

var built = false;
var open = false;
var tab = 'achievements';
var painted = '';

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function shortTime(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 16);
}

function formatDuration(sec) {
  var total = Math.floor(sec || 0);
  var hours = Math.floor(total / 3600);
  var minutes = Math.floor((total % 3600) / 60);
  var seconds = total % 60;
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  return minutes + 'm ' + seconds + 's';
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function card(title, detail, extra) {
  var node = el('article', 'codex-card');
  node.appendChild(el('strong', 'codex-card-title', title));
  if (detail) node.appendChild(el('p', 'codex-card-detail', detail));
  if (extra) node.appendChild(el('p', 'codex-card-extra', extra));
  return node;
}

function unknownCard() {
  var node = el('article', 'codex-card is-unknown');
  node.appendChild(el('span', 'codex-silhouette', ''));
  node.appendChild(el('strong', 'codex-card-title', isChinese() ? '未知' : 'UNKNOWN'));
  return node;
}

function paintAchievements(body, meta) {
  var rows = listAchievements(meta);
  var zh = isChinese();
  var i;
  var row;
  var extra;
  for (i = 0; i < rows.length; i += 1) {
    row = rows[i];
    extra = row.unlocked ? shortTime(row.unlockedAt) : (row.progress + ' / ' + row.goal);
    var rew = zh ? tAchievementReward(row.id) : row.reward;
    if (rew && !row.unlocked) extra += ' · ' + rew;
    var t = zh ? tAchievementTitle(row.id) : row.title;
    var d = zh ? tAchievementDetail(row.id) : row.detail;
    body.appendChild(card(t, d, extra));
  }
}

function paintEnemies(body, meta) {
  var seen = meta.stats.seenEnemies || [];
  var zh = isChinese();
  var known = {};
  var i;
  var entry;
  var profile;
  var detail;
  for (i = 0; i < ENEMIES.length; i += 1) {
    entry = ENEMIES[i];
    known[entry.id] = true;
    if (seen.indexOf(entry.id) === -1) {
      body.appendChild(unknownCard());
      continue;
    }
    detail = entry.boss ? (zh ? '首領' : 'BOSS') : (zh ? '敵機' : 'HOSTILE');
    if (PROFILED[entry.id]) {
      profile = enemyProfile(entry.id, 1);
      detail += ' · HP ' + Math.round(profile.hp) + ' · R ' + profile.r;
    }
    body.appendChild(card(zh ? tEnemyName(entry.id) : entry.name, detail, ''));
  }
  for (i = 0; i < seen.length; i += 1) {
    if (!known[seen[i]]) body.appendChild(card(zh ? tEnemyName(seen[i]) : String(seen[i]).toUpperCase(), zh ? '敵機' : 'HOSTILE', ''));
  }
}

function paintFusions(body, meta) {
  var seen = meta.stats.fusionsSeen || [];
  var zh = isChinese();
  var i;
  var chip;
  var slots = Math.max(10, FUSION_CHIPS.length);
  for (i = 0; i < FUSION_CHIPS.length; i += 1) {
    chip = FUSION_CHIPS[i];
    if (seen.indexOf(chip.id) === -1) {
      body.appendChild(unknownCard());
      continue;
    }
    var reqs = (chip.required || []).map(function (rid) { return tUpgradeTitle(rid); }).join(' + ');
    body.appendChild(card(tFusionTitle(chip), reqs, zh ? '已記錄' : 'SEEN'));
  }
  for (i = FUSION_CHIPS.length; i < slots; i += 1) body.appendChild(unknownCard());
}

function paintStats(body, meta) {
  var stats = meta.stats;
  var bosses = stats.bossKills || {};
  var zh = isChinese();
  var kind;
  var bossText = [];
  body.appendChild(card(zh ? '出擊次數' : 'RUNS', String(stats.runs), ''));
  body.appendChild(card(zh ? '擊殺總數' : 'KILLS', String(stats.kills), ''));
  body.appendChild(card(zh ? '精準衝刺' : 'JUST DASHES', String(stats.justDashes), ''));
  body.appendChild(card(zh ? '達成合約' : 'CONTRACTS', String(stats.contracts), ''));
  body.appendChild(card(zh ? '成功撤離' : 'EXTRACTIONS', String(stats.extractions), ''));
  body.appendChild(card(zh ? '最高波次' : 'BEST WAVE', String(stats.bestWave), ''));
  body.appendChild(card(zh ? '遊玩時間' : 'PLAY TIME', formatDuration(stats.playTimeSec), ''));
  body.appendChild(card(zh ? '已發現融合' : 'FUSIONS SEEN', String((stats.fusionsSeen || []).length), ''));
  body.appendChild(card(zh ? '已遭遇敵機' : 'ENEMIES SEEN', String((stats.seenEnemies || []).length), ''));
  for (kind in bosses) {
    if (Object.prototype.hasOwnProperty.call(bosses, kind)) {
      bossText.push((zh ? tEnemyName(kind) : kind) + ' ' + bosses[kind]);
    }
  }
  body.appendChild(card(zh ? '擊敗首領' : 'BOSSES', bossText.length ? bossText.join(' · ') : (zh ? '無' : 'NONE'), ''));
}

function paint() {
  var body;
  var meta;
  var sig;
  var tabs;
  var i;
  if (!built) return;
  meta = readMeta();
  var zh = isChinese();
  sig = tab + '|' + (zh ? 'zh' : 'en') + '|' + JSON.stringify(meta.achievements) + '|' + JSON.stringify(meta.stats);
  tabs = document.querySelectorAll('#codexPanel [data-codex-tab]');
  var TAB_NAMES = {
    achievements: { zh: '成就', en: 'ACHIEVEMENTS' },
    enemies: { zh: '敵機', en: 'ENEMIES' },
    fusions: { zh: '融合', en: 'FUSIONS' },
    stats: { zh: '數據', en: 'STATS' }
  };
  for (i = 0; i < tabs.length; i += 1) {
    var tid = tabs[i].getAttribute('data-codex-tab');
    var selected = tid === tab;
    tabs[i].setAttribute('aria-selected', selected ? 'true' : 'false');
    tabs[i].tabIndex = selected ? 0 : -1;
    tabs[i].classList.toggle('is-selected', selected);
    if (TAB_NAMES[tid]) tabs[i].textContent = zh ? TAB_NAMES[tid].zh : TAB_NAMES[tid].en;
  }
  var kicker = document.querySelector('#codexPanel .codex-kicker');
  if (kicker) kicker.textContent = zh ? '資料庫' : 'ARCHIVE';
  var codexTitle = document.getElementById('codexTitle');
  if (codexTitle) codexTitle.textContent = zh ? '檔案庫' : 'CODEX';
  var closeBtn = document.getElementById('codexCloseBtn');
  if (closeBtn) closeBtn.textContent = zh ? '關閉' : 'CLOSE';
  if (sig === painted) return;
  painted = sig;
  body = document.getElementById('codexBody');
  if (!body) return;
  clear(body);
  if (tab === 'enemies') paintEnemies(body, meta);
  else if (tab === 'fusions') paintFusions(body, meta);
  else if (tab === 'stats') paintStats(body, meta);
  else paintAchievements(body, meta);
}

function focusables(root) {
  var nodes = root.querySelectorAll('button, [href], [tabindex]');
  var out = [];
  var i;
  for (i = 0; i < nodes.length; i += 1) {
    if (nodes[i].hidden || nodes[i].disabled) continue;
    if (nodes[i].tabIndex < 0) continue;
    out.push(nodes[i]);
  }
  return out;
}

export function isCodexOpen() {
  return open;
}

export function cycleCodexTab(delta) {
  var index = TABS.indexOf(tab);
  var button;
  if (index < 0) index = 0;
  tab = TABS[(index + delta + TABS.length) % TABS.length];
  painted = '';
  paint();
  button = document.querySelector('#codexPanel [data-codex-tab="' + tab + '"]');
  if (button && button.focus) button.focus();
}

export function closeCodex() {
  var panel = document.getElementById('codexPanel');
  var back = document.getElementById('codexOpenBtn');
  var screen = document.getElementById('startScreen');
  open = false;
  if (panel) panel.hidden = true;
  if (back && back.focus && screen && !screen.hidden) back.focus();
}

export function openCodex() {
  var panel = document.getElementById('codexPanel');
  var button;
  if (!built) initCodexPanel();
  if (!panel) return;
  open = true;
  panel.hidden = false;
  painted = '';
  paint();
  button = document.querySelector('#codexPanel [data-codex-tab="' + tab + '"]');
  if (button && button.focus) button.focus();
}

export function initCodexPanel() {
  var panel;
  var inner;
  var head;
  var tabs;
  var body;
  var closeBtn;
  var i;
  var screen;
  if (built || typeof document === 'undefined') return;
  panel = document.getElementById('codexPanel');
  if (!panel) return;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'codexTitle');
  panel.classList.add('codex-panel');
  inner = el('div', 'codex-inner');
  head = el('div', 'codex-head');
  head.appendChild(el('p', 'codex-kicker', 'ARCHIVE'));
  head.appendChild(el('h2', 'codex-title', 'CODEX'));
  var title = head.querySelector('.codex-title');
  title.id = 'codexTitle';
  closeBtn = el('button', 'codex-close', 'CLOSE');
  closeBtn.type = 'button';
  closeBtn.id = 'codexCloseBtn';
  closeBtn.setAttribute('aria-label', 'Close codex');
  on(closeBtn, 'click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    closeCodex();
  });
  head.appendChild(closeBtn);
  tabs = el('div', 'codex-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Codex sections');
  for (i = 0; i < TABS.length; i += 1) {
    (function (id, index) {
      var name = id.toUpperCase();
      var button = el('button', 'codex-tab', name);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('data-codex-tab', id);
      button.setAttribute('aria-controls', 'codexBody');
      on(button, 'click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        tab = id;
        painted = '';
        paint();
      });
      tabs.appendChild(button);
    })(TABS[i], i);
  }
  body = el('div', 'codex-body');
  body.id = 'codexBody';
  body.setAttribute('role', 'tabpanel');
  body.tabIndex = 0;
  inner.appendChild(head);
  inner.appendChild(tabs);
  inner.appendChild(body);
  panel.appendChild(inner);
  on(panel, 'keydown', function (event) {
    var nodes;
    var first;
    var last;
    if (event.key !== 'Tab') return;
    nodes = focusables(panel);
    if (!nodes.length) return;
    first = nodes[0];
    last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  screen = document.getElementById('startScreen');
  if (screen && typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function () {
      if (screen.hidden && open) closeCodex();
    });
    observer.observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  }
  built = true;
  panel.hidden = true;
}

export function updateCodexPanel() {
  var screen;
  if (typeof document === 'undefined' || !open) return;
  screen = document.getElementById('startScreen');
  if (screen && screen.hidden) {
    closeCodex();
    return;
  }
  paint();
}

onLanguageChange(function () {
  if (open) paint();
});
