import { readMeta } from '../core/meta-store.js';
import { on } from '../core/utils.js';
import { enemyProfile } from '../data/enemies.js';
import { FUSION_CHIPS } from '../data/upgrades.js';
import { listAchievements } from '../systems/meta.js';

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
  node.appendChild(el('strong', 'codex-card-title', 'UNKNOWN'));
  return node;
}

function paintAchievements(body, meta) {
  var rows = listAchievements(meta);
  var i;
  var row;
  var extra;
  for (i = 0; i < rows.length; i += 1) {
    row = rows[i];
    extra = row.unlocked ? shortTime(row.unlockedAt) : (row.progress + ' / ' + row.goal);
    if (row.reward && !row.unlocked) extra += ' · ' + row.reward;
    body.appendChild(card(row.title, row.detail, extra));
  }
}

function paintEnemies(body, meta) {
  var seen = meta.stats.seenEnemies || [];
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
    detail = entry.boss ? 'BOSS' : 'HOSTILE';
    if (PROFILED[entry.id]) {
      profile = enemyProfile(entry.id, 1);
      detail += ' · HP ' + Math.round(profile.hp) + ' · R ' + profile.r;
    }
    body.appendChild(card(entry.name, detail, ''));
  }
  for (i = 0; i < seen.length; i += 1) {
    if (!known[seen[i]]) body.appendChild(card(String(seen[i]).toUpperCase(), 'HOSTILE', ''));
  }
}

function paintFusions(body, meta) {
  var seen = meta.stats.fusionsSeen || [];
  var i;
  var chip;
  var slots = Math.max(10, FUSION_CHIPS.length);
  for (i = 0; i < FUSION_CHIPS.length; i += 1) {
    chip = FUSION_CHIPS[i];
    if (seen.indexOf(chip.id) === -1) {
      body.appendChild(unknownCard());
      continue;
    }
    body.appendChild(card(chip.title, (chip.required || []).join(' + '), 'SEEN'));
  }
  for (i = FUSION_CHIPS.length; i < slots; i += 1) body.appendChild(unknownCard());
}

function paintStats(body, meta) {
  var stats = meta.stats;
  var bosses = stats.bossKills || {};
  var kind;
  var bossText = [];
  body.appendChild(card('RUNS', String(stats.runs), ''));
  body.appendChild(card('KILLS', String(stats.kills), ''));
  body.appendChild(card('JUST DASHES', String(stats.justDashes), ''));
  body.appendChild(card('CONTRACTS', String(stats.contracts), ''));
  body.appendChild(card('EXTRACTIONS', String(stats.extractions), ''));
  body.appendChild(card('BEST WAVE', String(stats.bestWave), ''));
  body.appendChild(card('PLAY TIME', formatDuration(stats.playTimeSec), ''));
  body.appendChild(card('FUSIONS SEEN', String((stats.fusionsSeen || []).length), ''));
  body.appendChild(card('ENEMIES SEEN', String((stats.seenEnemies || []).length), ''));
  for (kind in bosses) {
    if (Object.prototype.hasOwnProperty.call(bosses, kind)) bossText.push(kind + ' ' + bosses[kind]);
  }
  body.appendChild(card('BOSSES', bossText.length ? bossText.join(' · ') : 'NONE', ''));
}

function paint() {
  var body;
  var meta;
  var sig;
  var tabs;
  var i;
  if (!built) return;
  meta = readMeta();
  sig = tab + '|' + JSON.stringify(meta.achievements) + '|' + JSON.stringify(meta.stats);
  tabs = document.querySelectorAll('#codexPanel [data-codex-tab]');
  for (i = 0; i < tabs.length; i += 1) {
    var selected = tabs[i].getAttribute('data-codex-tab') === tab;
    tabs[i].setAttribute('aria-selected', selected ? 'true' : 'false');
    tabs[i].tabIndex = selected ? 0 : -1;
    tabs[i].classList.toggle('is-selected', selected);
  }
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
