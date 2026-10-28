import { COMBO_WINDOW, WAVE_LENGTH } from '../config.js';
import { AudioFX } from '../audio/audio-fx.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { clamp, setText } from '../core/utils.js';
import { sectorForWave } from '../render/palette.js';
import { getQuality } from '../render/quality.js';
import { calculateCombatRank, computeThreatTier, isStormFront } from '../systems/flow.js';
import { getComboWindow } from '../systems/combat.js';
import { updateCodexPanel } from './codex-panel.js';
import { updateContractsHud } from './contracts-hud.js';
import { updateInterludePanel } from './interlude-panel.js';
import { updateLoadoutPanel } from './loadout-panel.js';
import { updateAudioBtn } from './pause-menu.js';
import { updateTips } from './tips.js';
import { fitGameOverOverlay, resize, syncCombatLayout } from './dom.js';
import { isChinese, onLanguageChange, tLog, tRankTitle, tStatus } from '../core/i18n.js';

var shownScore = null;
var scoreState = null;
var scoreClock = 0;
var lastScoreTarget = null;
var popEl = null;
var popValue = 0;
var popAt = 0;
var popTimer = 0;
var hpLagShown = null;
var chainWasHot = false;
var chainBreakUntil = 0;
var typeJobs = [];
var telRoll = { key: '', busy: false, raf: 0 };
var slamKey = '';
var lastSector = '';
var lastStorm = '';
var lastQuality = '';

function motionOff() {
  try { return isReducedMotion(); } catch (e) { return false; }
}

function byId(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

function pulse(el, key, value) {
  if (!el || !el.classList || motionOff()) return;
  var next = String(value);
  if (el._pulseKey != null && el._pulseKey !== next) {
    el.classList.remove('is-pulse');
    if (key === 'wave') el.classList.remove('is-flip');
    if (el._pulseRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(el._pulseRaf);
    }
    el._pulseRaf = requestAnimationFrame(function () {
      el._pulseRaf = 0;
      if (!el || !el.classList) return;
      el.classList.add('is-pulse');
      if (key === 'wave') el.classList.add('is-flip');
    });
  }
  el._pulseKey = next;
}

function popScore(delta) {
  if (!delta || typeof document === 'undefined' || motionOff()) return;
  var host = rt.ui && rt.ui.score && rt.ui.score.parentElement;
  if (!host || !host.appendChild) return;
  var now = Date.now();
  if (!popEl || !popEl.parentNode || now - popAt > 280) {
    popEl = document.createElement('span');
    popEl.className = 'score-pop';
    host.appendChild(popEl);
    popValue = 0;
    popAt = now;
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(function () {
      popTimer = 0;
      if (popEl && popEl.parentNode) popEl.parentNode.removeChild(popEl);
      popEl = null;
    }, 720);
  }
  popValue += delta;
  popEl.textContent = '+' + popValue;
}

function syncScore() {
  var target = Math.max(0, Math.round(rt.state.score || 0));
  if (scoreState !== rt.state) {
    scoreState = rt.state;
    shownScore = target;
    lastScoreTarget = target;
  }
  var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  if (shownScore == null || typeof document === 'undefined' || motionOff() || target < shownScore) {
    if (lastScoreTarget != null && target > lastScoreTarget) popScore(target - lastScoreTarget);
    shownScore = target;
  } else if (shownScore < target) {
    if (lastScoreTarget != null && target > lastScoreTarget) popScore(target - lastScoreTarget);
    var dt = scoreClock ? Math.min(0.05, (now - scoreClock) / 1000) : 0.016;
    shownScore = Math.min(target, shownScore + Math.max(1, (target - shownScore) * Math.min(1, dt * 9)));
  }
  scoreClock = now;
  lastScoreTarget = target;
  setText(rt.ui.score, String(Math.round(shownScore)).padStart(6, '0'));
  pulse(rt.ui.score, 'score', target);
}

function syncHealth() {
  var p = rt.state.player;
  if (!p) return;
  var ratio = clamp(p.hp / (p.maxHp || 1), 0, 1);
  var pct = ratio * 100;
  if (rt.ui.healthFill && rt.ui.healthFill.style) {
    var widthStr = pct + '%';
    if (rt.ui.healthFill._lastWidth !== widthStr) {
      rt.ui.healthFill._lastWidth = widthStr;
      rt.ui.healthFill.style.width = widthStr;
    }
  }
  var lag = rt.ui.healthLag || byId('healthLag');
  if (lag && lag.style) {
    var snap = hpLagShown == null || pct >= hpLagShown - 0.2 || motionOff();
    if (Math.abs((lag._target == null ? -1 : lag._target) - pct) > 0.05 || snap !== lag._snap) {
      lag.style.transition = snap ? 'none' : 'width 480ms linear 80ms';
      lag.style.width = pct + '%';
      lag._target = pct;
      lag._snap = snap;
    }
    hpLagShown = pct;
  }
  var bar = (rt.ui.healthFill && rt.ui.healthFill.parentElement) || byId('healthBar');
  if (bar && bar.classList) {
    var hurt = bar._hp != null && pct < bar._hp - 0.4;
    bar.classList.toggle('is-critical', ratio > 0 && ratio <= 0.3);
    if (hurt && !motionOff()) {
      bar.classList.remove('is-hurt');
      if (bar._hurtRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(bar._hurtRaf);
      }
      bar._hurtRaf = requestAnimationFrame(function () {
        bar._hurtRaf = 0;
        if (bar && bar.classList) bar.classList.add('is-hurt');
      });
    }
    bar._hp = pct;
  }
}

function syncCooldowns() {
  var p = rt.state.player;
  if (!p) return;
  var energy = p.energy || 0;
  var ready = energy >= 50;
  if (rt.ui.meterEnergy && rt.ui.meterEnergy.classList) rt.ui.meterEnergy.classList.toggle('is-ready', ready);
  var badge = rt.ui.empReady || byId('empReady');
  if (badge) badge.hidden = !ready;
  if (rt.ui && badge) rt.ui.empReady = badge;

  var tac = p.tacticalSlot;
  if (tac) {
    var tacRatio = tac.maxCooldown > 0 ? clamp(tac.cooldown / tac.maxCooldown, 0, 1) : 0;
    var mask = byId('hudTacticalCdMask');
    if (mask && mask.style) {
      mask.style.strokeDashoffset = (tacRatio * 100).toFixed(1);
    }
    var cdText = byId('hudTacticalCdText');
    if (cdText) {
      cdText.textContent = tac.cooldown > 0 ? (tac.cooldown > 9.9 ? Math.ceil(tac.cooldown) + 's' : tac.cooldown.toFixed(1) + 's') : 'RDY';
      cdText.style.color = tac.cooldown > 0 ? '#ff7733' : '#5be7ff';
    }
    var iconEl = byId('hudTacticalIcon');
    if (iconEl && tac.icon && iconEl.textContent !== tac.icon) {
      iconEl.textContent = tac.icon;
    }
    var nameEl = byId('hudTacticalName');
    if (nameEl && tac.id) {
      var displayName = isChinese() ? (tac.name || tac.id) : (tac.enName || tac.id.toUpperCase());
      if (nameEl.textContent !== displayName) nameEl.textContent = displayName;
    }
  }
}

function getComboTier(combo) {
  var c = combo || 0;
  if (c >= 31) return 'SSS';
  if (c >= 23) return 'S';
  if (c >= 15) return 'A';
  if (c >= 9) return 'B';
  if (c >= 5) return 'C';
  return 'D';
}

var lastResSig = '';

/** Mirrors player resonance counts into the HUD pills; ascension audio/log is owned by evaluateArchetypes. */
export function syncResonances() {
  if (typeof document === 'undefined') return;
  var root = document.getElementById('hudResonances');
  if (!root || !rt.state || !rt.state.player) return;
  var p = rt.state.player;
  var res = p.resonances || { kinetic: 0, plasma: 0, static: 0, tactical: 0 };
  var k = res.kinetic || 0;
  var pl = res.plasma || 0;
  var s = res.static || 0;
  var t = res.tactical || 0;
  var sig = k + '|' + pl + '|' + s + '|' + t;
  if (sig === lastResSig) return;
  lastResSig = sig;

  var archetypes = ['kinetic', 'plasma', 'static', 'tactical'];
  for (var i = 0; i < archetypes.length; i += 1) {
    var arch = archetypes[i];
    var count = res[arch] || 0;
    var tier = count >= 6 ? 3 : (count >= 4 ? 2 : (count >= 2 ? 1 : 0));
    var pill = root.querySelector('.resonance-pill[data-archetype="' + arch + '"]');
    if (pill) {
      if (pill.dataset.tier !== String(tier)) pill.dataset.tier = String(tier);
      if (pill.dataset.count !== String(count)) pill.dataset.count = String(count);
      var countEl = pill.querySelector('.res-count');
      if (countEl && countEl.textContent !== String(count)) {
        countEl.textContent = String(count);
      }
    }
  }
}

function syncChain() {
  var el = rt.ui.hudChain;
  if (!el) return;
  if (rt.state.over) {
    el.hidden = true;
    if (el.classList) el.classList.remove('is-break');
    chainWasHot = false;
    chainBreakUntil = 0;
    return;
  }
  var hot = rt.state.combo > 1 || rt.state.grazeCombo > 0;
  var now = rt.renderTime || 0;
  if (hot) {
    el.hidden = false;
    if (el.classList) el.classList.remove('is-break');
    if (rt.state.combo > 1) {
      var tier = getComboTier(rt.state.combo);
      el.textContent = (isChinese() ? '連擊 x' : 'CHAIN x') + rt.state.combo + ' [' + tier + ']' + (rt.state.grazeCombo > 0 ? (isChinese() ? ' [擦彈 ' : ' [GRAZE ') + rt.state.grazeCombo + ']' : '');
    } else {
      el.textContent = (isChinese() ? '擦彈 x' : 'GRAZE x') + rt.state.grazeCombo;
    }
    var heat = Math.min(8, Math.max(rt.state.combo || 0, rt.state.grazeCombo || 0));
    if (el.setAttribute) el.setAttribute('data-heat', String(heat));
    if (el.style && el.style.setProperty) {
      var winSec = getComboWindow(rt.state.combo);
      el.style.setProperty('--chain', clamp((rt.state.comboTimer || 0) / winSec, 0, 1).toFixed(3));
    }
    if (el.classList) {
      el.classList.toggle('is-momentum', (rt.state.combo || 0) >= 15);
    }
    if ((rt.state.combo || 0) >= 15 && !rt.state._momentumNotified) {
      rt.state._momentumNotified = true;
      logEvent('MOMENTUM SURGE // A-TIER COMBO ONLINE');
    } else if ((rt.state.combo || 0) < 15) {
      rt.state._momentumNotified = false;
    }
    chainWasHot = true;
    chainBreakUntil = 0;
    return;
  }
  if (chainWasHot && el.classList && !motionOff()) {
    el.classList.add('is-break');
    el.hidden = false;
    chainWasHot = false;
    chainBreakUntil = now + 0.32;
    return;
  }
  if (chainBreakUntil && now < chainBreakUntil) return;
  el.hidden = true;
  if (el.classList) el.classList.remove('is-break');
  chainWasHot = false;
  chainBreakUntil = 0;
}

function setTypeText(el, text) {
  if (!el) return;
  text = String(text);
  if (el.getAttribute && el.getAttribute('data-full') === text) return;
  if (el.setAttribute) el.setAttribute('data-full', text);
  if (typeof document === 'undefined' || motionOff() || !el.classList) {
    el.textContent = text;
    if (el.classList) el.classList.remove('is-typing');
    return;
  }
  el.textContent = '';
  el._typeText = text;
  el._typeIndex = 0;
  el.classList.add('is-typing');
  if (typeJobs.indexOf(el) === -1) typeJobs.push(el);
}

function stepTypewriters(dt) {
  if (!typeJobs.length) return;
  var step = Math.max(1, Math.round((dt > 0 ? dt : 0.016) * 22));
  for (var i = typeJobs.length - 1; i >= 0; i -= 1) {
    var el = typeJobs[i];
    if (!el || !el._typeText) {
      typeJobs.splice(i, 1);
      continue;
    }
    el._typeIndex += step;
    if (el._typeIndex >= el._typeText.length) {
      el.textContent = el._typeText;
      if (el.classList) el.classList.remove('is-typing');
      typeJobs.splice(i, 1);
    } else {
      el.textContent = el._typeText.slice(0, el._typeIndex);
    }
  }
}

function syncComms() {
  var comms = (rt.ui && rt.ui.commsStatus) || byId('commsStatus');
  var wind = (rt.ui && rt.ui.windStatus) || byId('windStatus');
  if (rt.ui) {
    if (comms) rt.ui.commsStatus = comms;
    if (wind) rt.ui.windStatus = wind;
  }
  var zh = isChinese();
  var commsText = zh ? '即時' : 'LIVE';
  if (rt.ui.startScreen && !rt.ui.startScreen.hidden) commsText = zh ? '開放' : 'OPEN';
  else if (rt.state.over) commsText = zh ? '中斷' : 'LOST';
  else if (rt.state.paused) commsText = zh ? '保留' : 'HOLD';
  else if (isStormFront()) commsText = zh ? '雜訊' : 'STATIC';
  var sector = 'dusk';
  try { sector = sectorForWave(rt.state.wave); } catch (e) { sector = 'dusk'; }
  var windText = sector === 'night' ? 'N 11' : sector === 'rust' ? 'SW 27' : 'NW 18';
  if (isStormFront()) windText = zh ? '陣風 44' : 'GUST 44';
  setTypeText(comms, commsText);
  setTypeText(wind, windText);
}

function syncSector() {
  if (typeof document === 'undefined') return;
  var stage = (rt.ui && rt.ui.canvasStage) || byId('canvasStage');
  if (!stage || !stage.setAttribute) return;
  if (rt.ui) rt.ui.canvasStage = stage;
  var sector = 'dusk';
  try { sector = sectorForWave(rt.state.wave); } catch (e) { sector = 'dusk'; }
  var storm = isStormFront() ? '1' : '0';
  if (sector !== lastSector) {
    lastSector = sector;
    stage.setAttribute('data-sector', sector);
  }
  if (storm !== lastStorm) {
    lastStorm = storm;
    stage.setAttribute('data-storm', storm);
  }
  var hud = byId('hud');
  if (hud && hud.classList) hud.classList.toggle('is-storm', storm === '1');
  var waveMetric = rt.ui.wave && rt.ui.wave.closest ? rt.ui.wave.closest('.metric') : null;
  if (waveMetric && waveMetric.classList) waveMetric.classList.toggle('is-storm', storm === '1');
  syncQualityTier(stage);
}

// The canvas DPR cap depends on the tier, so a tier change re-runs resize().
function syncQualityTier(stage) {
  var quality = 'auto';
  try { quality = getQuality(); } catch (e) { quality = 'auto'; }
  if (quality === lastQuality) return;
  var hadTier = lastQuality !== '';
  lastQuality = quality;
  stage.setAttribute('data-quality', quality);
  if (hadTier) resize();
}

function syncPauseBlur() {
  var canvas = rt.ui && rt.ui.canvas;
  if (!canvas || !canvas.classList) return;
  var modal = rt.ui.pauseModal;
  var upgrading = rt.state.upgradeChoices && rt.state.upgradeChoices.length;
  var onStart = rt.ui.startScreen && !rt.ui.startScreen.hidden;
  var show = Boolean(rt.state.paused && modal && !modal.hidden && !upgrading && !onStart);
  canvas.classList.toggle('is-pause-blur', show);
}

function writeTelemetry(accPct, combo, grazes, dmg) {
  if (rt.ui.telAccuracy) rt.ui.telAccuracy.textContent = accPct + '%';
  if (rt.ui.telMaxCombo) rt.ui.telMaxCombo.textContent = 'x' + combo;
  if (rt.ui.telGrazes) rt.ui.telGrazes.textContent = String(grazes);
  if (rt.ui.telDamage) rt.ui.telDamage.textContent = String(dmg);
}

function canRollNumbers() {
  return typeof requestAnimationFrame === 'function' && !motionOff() && rt.ui.telAccuracy && rt.ui.telAccuracy.classList;
}

function animateTelemetry(accPct, combo, grazes, dmg) {
  var targets = [accPct, combo, grazes, dmg];
  var each = 260;
  var start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  function frame(now) {
    if (!telRoll.busy || !rt.ui) return;
    var t = now - start;
    var shown = [];
    for (var i = 0; i < 4; i += 1) {
      var local = (t - i * each) / each;
      if (local <= 0) shown[i] = 0;
      else if (local >= 1) shown[i] = targets[i];
      else shown[i] = Math.round(targets[i] * (1 - Math.pow(1 - local, 3)));
    }
    writeTelemetry(shown[0], shown[1], shown[2], shown[3]);
    if (t < each * 4) telRoll.raf = requestAnimationFrame(frame);
    else {
      telRoll.busy = false;
      telRoll.raf = 0;
      writeTelemetry(accPct, combo, grazes, dmg);
    }
  }
  telRoll.busy = true;
  telRoll.raf = requestAnimationFrame(function (now) {
    writeTelemetry(0, 0, 0, 0);
    frame(now);
  });
}

var breakdownRoll = { key: '', busy: false, raf: 0 };

export function scoreBreakdownLabels(zh) {
  return zh
    ? ['擊殺得分', '波次得分', '首領得分', '戰法得分', '合約得分', '撤離得分']
    : ['KILL SCORE', 'WAVE SCORE', 'BOSS SCORE', 'STYLE SCORE', 'CONTRACT SCORE', 'EXTRACT SCORE'];
}

function breakdownBuckets(breakdown) {
  var b = breakdown || {};
  function n(key) { return typeof b[key] === 'number' ? b[key] : 0; }
  return [
    n('kill') + n('bounty'),
    n('wave') + n('flawless'),
    n('boss'),
    n('style') + n('graze') + n('storm') + n('repair') + n('overtime'),
    n('contract'),
    n('extract')
  ];
}

function writeBreakdown(values) {
  var host = typeof document !== 'undefined' ? document.getElementById('scoreBreakdown') : null;
  if (!host) return;
  var nodes = host.querySelectorAll('strong');
  var i;
  for (i = 0; i < nodes.length && i < values.length; i += 1) nodes[i].textContent = String(values[i]);
}

function ensureBreakdown() {
  if (typeof document === 'undefined' || !rt.ui || !rt.ui.gameOver) return null;
  var host = document.getElementById('scoreBreakdown');
  var labels = scoreBreakdownLabels(isChinese());
  if (host) {
    var spans = host.querySelectorAll('span');
    for (var j = 0; j < spans.length && j < labels.length; j += 1) spans[j].textContent = labels[j];
    return host;
  }
  var grid = rt.ui.gameOver.querySelector && rt.ui.gameOver.querySelector('.result-grid');
  if (!grid || !grid.parentNode) return null;
  host = document.createElement('div');
  host.id = 'scoreBreakdown';
  host.className = 'result-grid score-breakdown';
  var i;
  for (i = 0; i < labels.length; i += 1) {
    var cell = document.createElement('div');
    var span = document.createElement('span');
    var strong = document.createElement('strong');
    span.textContent = labels[i];
    strong.textContent = '0';
    cell.appendChild(span);
    cell.appendChild(strong);
    host.appendChild(cell);
  }
  grid.insertAdjacentElement('afterend', host);
  return host;
}

function animateBreakdown(targets) {
  if (typeof requestAnimationFrame !== 'function') {
    writeBreakdown(targets);
    return;
  }
  var start = 0;
  function frame(now) {
    if (!breakdownRoll.busy) return;
    if (!start) start = now;
    var t = (now - start) / 700;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var eased = 1 - Math.pow(1 - t, 3);
    var shown = [];
    var i;
    for (i = 0; i < targets.length; i += 1) shown[i] = Math.round(targets[i] * eased);
    writeBreakdown(shown);
    if (t < 1) breakdownRoll.raf = requestAnimationFrame(frame);
    else {
      breakdownRoll.busy = false;
      breakdownRoll.raf = 0;
      writeBreakdown(targets);
    }
  }
  breakdownRoll.busy = true;
  breakdownRoll.raf = requestAnimationFrame(frame);
}

function syncScoreBreakdown() {
  if (!rt.state || !rt.state.over || !rt.ui || !rt.ui.gameOver) return;
  if (rt.ui.gameOver.hidden) return;
  var values = breakdownBuckets(rt.state.scoreBreakdown);
  var key = values.join('|') + '|' + (isChinese() ? 'zh' : 'en');
  if (!ensureBreakdown()) return;
  if (breakdownRoll.key === key) return;
  breakdownRoll.key = key;
  if (motionOff() || typeof requestAnimationFrame !== 'function') {
    writeBreakdown(values);
    return;
  }
  writeBreakdown(values.map(function () { return 0; }));
  animateBreakdown(values);
}

function syncTelemetry(acc, stats) {
  var accPct = Math.round(acc * 100);
  var combo = stats.maxCombo || 0;
  var grazes = stats.grazes || 0;
  var dmg = Math.round(stats.damageDealt || 0);
  var key = accPct + '|' + combo + '|' + grazes + '|' + dmg + '|' + (rt.state.score || 0);
  if (!rt.state.over) return;
  if (telRoll.busy && telRoll.key === key) return;
  if (!telRoll.busy) writeTelemetry(accPct, combo, grazes, dmg);
  var visible = !rt.ui.gameOver || rt.ui.gameOver.hidden === false;
  if (!visible) return;
  if (telRoll.key === key) return;
  telRoll.key = key;
  if (!canRollNumbers()) return;
  animateTelemetry(accPct, combo, grazes, dmg);
}

function resetTelemetry() {
  if (telRoll.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(telRoll.raf);
  telRoll.busy = false;
  telRoll.raf = 0;
  telRoll.key = '';
  if (breakdownRoll.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(breakdownRoll.raf);
  breakdownRoll.busy = false;
  breakdownRoll.raf = 0;
  breakdownRoll.key = '';
  slamKey = '';
}

function syncSlam() {
  var stage = (rt.ui && rt.ui.canvasStage) || byId('canvasStage');
  if (!stage || !stage.classList) return;
  var show = Boolean(rt.state.over && !(rt.state.deathSequenceTimer > 0));
  var key = show ? String(rt.state.score) + ':' + rt.state.wave : '';
  if (!show) {
    slamKey = '';
    stage.classList.remove('is-rank-slam');
    return;
  }
  if (key === slamKey || motionOff()) return;
  slamKey = key;
  stage.classList.remove('is-rank-slam');
  if (stage._slamRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(stage._slamRaf);
  }
  stage._slamRaf = requestAnimationFrame(function () {
    stage._slamRaf = 0;
    if (stage && stage.classList) stage.classList.add('is-rank-slam');
  });
}

export function tickHudPresentation() {
  if (!rt.state || !rt.ui || typeof document === 'undefined') return;
  stepTypewriters(rt.renderDt || 0);
  var stage = rt.ui.canvasStage || byId('canvasStage');
  if (!stage || !stage.setAttribute) return;
  syncQualityTier(stage);
}

export function setStatusText(message) {
  if (!rt.ui || !rt.ui.statusText) return;
  rt.ui.statusText.textContent = tStatus(message);
}

export function logEvent(message) {
  if (!rt.state || !rt.ui || !rt.ui.runLog || typeof document === 'undefined') return;
  var elapsed = Math.max(0, Math.floor((rt.state.wave - 1) * WAVE_LENGTH + rt.state.waveTime));
  var item = document.createElement('li');
  item.className = 'run-log-entry';
  var time = document.createElement('time');
  var copy = document.createElement('span');
  time.textContent = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  copy.textContent = tLog(message);
  item.appendChild(time);
  item.appendChild(copy);
  rt.ui.runLog.insertBefore(item, rt.ui.runLog.firstChild);
  while (rt.ui.runLog.children.length > 5) rt.ui.runLog.removeChild(rt.ui.runLog.lastElementChild);
}

function actRoman(act) {
  var names = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  var n = act | 0;
  if (n > 0 && n < names.length) return names[n];
  return String(n || 1);
}

// Thin bar under the wave pill; quantized to 0.5% so the style is not rewritten every frame.
function syncWaveProgress() {
  var bar = rt.ui.waveProgress;
  if (bar === undefined) {
    bar = typeof document !== 'undefined' ? document.getElementById('hudWaveProgress') : null;
    rt.ui.waveProgress = bar;
  }
  if (!bar || !bar.style) return;
  var pct = (Math.round(clamp(rt.state.waveTime / WAVE_LENGTH, 0, 1) * 200) / 2) + '%';
  if (bar._lastWidth !== pct) {
    bar._lastWidth = pct;
    bar.style.width = pct;
  }
}

export function updateDomUi() {
  if (!rt.state || !rt.ui) return;
  syncCombatLayout();
  updateAudioBtn();
  var zh = isChinese();
  var pauseButton = typeof document !== 'undefined' ? document.getElementById('pauseBtn') : null;
  if (pauseButton) {
    pauseButton.disabled = rt.state.over || rt.state.upgradeChoices.length > 0 || Boolean(rt.ui.startScreen && !rt.ui.startScreen.hidden);
    pauseButton.textContent = rt.state.paused && !pauseButton.disabled ? (zh ? '繼續' : 'RESUME') : (zh ? '暫停' : 'PAUSE');
    pauseButton.setAttribute('aria-label', rt.state.paused && !pauseButton.disabled ? (zh ? '繼續遊戲' : 'Resume game') : (zh ? '暫停遊戲' : 'Pause game'));
  }
  setText(rt.ui.health, Math.ceil(rt.state.player.hp));
  pulse(rt.ui.health, 'hp', Math.ceil(rt.state.player.hp));
  // Combined SCRAP MEMORY label when #hudXp is the only XP node ("current / next").
  if (rt.ui.xpMax) {
    setText(rt.ui.xp, rt.state.xp);
    setText(rt.ui.xpMax, rt.state.xpNext);
  } else {
    setText(rt.ui.xp, String(rt.state.xp) + ' / ' + String(rt.state.xpNext));
  }
  setText(rt.ui.level, String(rt.state.level).padStart(2, '0'));
  pulse(rt.ui.level, 'level', rt.state.level);
  setText(rt.ui.wave, zh ? ('第 ' + actRoman(rt.state.act || 1) + ' 幕 · 第 ' + String(rt.state.wave).padStart(2, '0') + ' 波') : ('ACT ' + actRoman(rt.state.act || 1) + ' · WAVE ' + String(rt.state.wave).padStart(2, '0')));
  pulse(rt.ui.wave, 'wave', rt.state.wave);
  syncScore();
  setText(rt.ui.best, String(rt.state.bestScore).padStart(6, '0'));
  setText(rt.ui.kills, rt.state.kills + (zh ? ' 敵機' : ' HOSTILES'));
  if (rt.ui.objectiveText) {
    var objKey = rt.state.bountyClaimed ? 'claimed' : (rt.state.bountyTarget + ':' + rt.state.bountyReward + ':' + (zh ? 'zh' : 'en'));
    if (rt.ui.objectiveText._lastObjKey !== objKey) {
      rt.ui.objectiveText._lastObjKey = objKey;
      rt.ui.objectiveText.textContent = rt.state.bountyClaimed
        ? (zh ? '懸賞已完成 — 堅守乾線邊境。' : 'BOUNTY SECURED — HOLD THE DRYLINE.')
        : (zh ? ('擊殺 ' + rt.state.bountyTarget + ' 個目標獲取 +' + rt.state.bountyReward + ' 分數。') : ('DROP ' + rt.state.bountyTarget + ' HOSTILES FOR +' + rt.state.bountyReward + ' SCORE.'));
    }
  }
  if (rt.ui.objectiveProgress && rt.ui.objectiveProgress.style) {
    var objPct = (rt.state.bountyClaimed ? 100 : clamp(rt.state.bountyKills / rt.state.bountyTarget, 0, 1) * 100) + '%';
    if (rt.ui.objectiveProgress._lastWidth !== objPct) {
      rt.ui.objectiveProgress._lastWidth = objPct;
      rt.ui.objectiveProgress.style.width = objPct;
    }
  }
  if (rt.ui.threatIndex) {
    var threatTier = computeThreatTier(rt.state);
    var threatKey = threatTier + ':' + (zh ? 'zh' : 'en');
    if (rt.ui.threatIndex._lastThreatKey !== threatKey) {
      rt.ui.threatIndex._lastThreatKey = threatKey;
      rt.ui.threatIndex.textContent = zh
        ? (threatTier === 2 ? '危急' : threatTier === 1 ? '高度' : '低度')
        : (threatTier === 2 ? 'CRITICAL' : threatTier === 1 ? 'HIGH' : 'LOW');
    }
  }
  if (rt.ui.waveTimer) {
    var seconds = Math.max(0, Math.ceil(WAVE_LENGTH - rt.state.waveTime));
    var storm = isStormFront();
    var prefix = zh ? (storm ? '暴風逼近 ' : '下一波次 ') : (storm ? 'STORM FRONT ' : 'NEXT FRONT ');
    setText(rt.ui.waveTimer, prefix + String(seconds).padStart(2, '0') + 's');
  }
  syncWaveProgress();
  syncHealth();
  if (rt.ui.healthFill && rt.ui.healthFill.parentElement) {
    var hpStr = String(Math.ceil(rt.state.player.hp));
    var hpParent = rt.ui.healthFill.parentElement;
    if (hpParent._lastAriaVal !== hpStr) {
      hpParent._lastAriaVal = hpStr;
      hpParent.setAttribute('aria-valuenow', hpStr);
    }
  }
  if (rt.ui.xpFill && rt.ui.xpFill.style) {
    var xpPct = (clamp(rt.state.xp / rt.state.xpNext, 0, 1) * 100) + '%';
    if (rt.ui.xpFill._lastWidth !== xpPct) {
      rt.ui.xpFill._lastWidth = xpPct;
      rt.ui.xpFill.style.width = xpPct;
    }
  }
  if (rt.ui.xpFill && rt.ui.xpFill.parentElement) {
    var xpStr = String(rt.state.xp);
    var xpNextStr = String(rt.state.xpNext);
    var xpParent = rt.ui.xpFill.parentElement;
    if (xpParent._lastAriaVal !== xpStr) {
      xpParent._lastAriaVal = xpStr;
      xpParent.setAttribute('aria-valuenow', xpStr);
    }
    if (xpParent._lastAriaMax !== xpNextStr) {
      xpParent._lastAriaMax = xpNextStr;
      xpParent.setAttribute('aria-valuemax', xpNextStr);
    }
  }
  var empCost = (typeof rt.state.player.empCost === 'number') ? rt.state.player.empCost : 50;
  var batteryCap = (typeof rt.state.player.batteryMax === 'number') ? rt.state.player.batteryMax : (rt.state.player.maxEnergy || 100);
  var energyVal = Math.floor(rt.state.player.energy || 0);
  var energyStr = String(energyVal);
  if (rt.ui.hudEnergy) setText(rt.ui.hudEnergy, energyStr);
  if (rt.ui.meterEnergy && rt.ui.meterEnergy.setAttribute) {
    if (rt.ui.meterEnergy._lastAriaVal !== energyStr) {
      rt.ui.meterEnergy._lastAriaVal = energyStr;
      rt.ui.meterEnergy.setAttribute('aria-valuenow', energyStr);
    }
  }
  if (rt.ui.energyFill && rt.ui.energyFill.style) {
    var energyPct = (clamp(energyVal / (batteryCap || 100), 0, 1) * 100) + '%';
    if (rt.ui.energyFill._lastWidth !== energyPct) {
      rt.ui.energyFill._lastWidth = energyPct;
      rt.ui.energyFill.style.width = energyPct;
    }
  }
  syncCooldowns();
  var hbPlayer = rt.state && rt.state.player;
  if (!rt.state.over && !rt.state.paused && !rt.state.interlude && hbPlayer && hbPlayer.hp > 0 && hbPlayer.maxHp > 0 && (hbPlayer.hp / hbPlayer.maxHp <= 0.25)) {
    var nowHb = (rt.renderTime || 0);
    if (!rt.state._lastHeartbeat || (nowHb - rt.state._lastHeartbeat >= 0.85) || nowHb < rt.state._lastHeartbeat) {
      rt.state._lastHeartbeat = nowHb;
      AudioFX.playHeartbeat();
    }
  }
  syncChain();
  syncSector();
  syncComms();
  syncPauseBlur();
  updateContractsHud();
  syncResonances();

  // Boss Phase Transition Roar Check
  if (rt.state.boss && rt.state.boss.hp > 0) {
    var curBPhase = rt.state.boss.phase || 1;
    if (typeof rt.state.boss._lastSoundPhase !== 'number') rt.state.boss._lastSoundPhase = curBPhase;
    else if (curBPhase > rt.state.boss._lastSoundPhase) {
      rt.state.boss._lastSoundPhase = curBPhase;
      if (AudioFX && typeof AudioFX.bossPhaseRoar === 'function') AudioFX.bossPhaseRoar();
      logEvent('BOSS PHASE TRANSITION // OVERDRIVE ENGAGED');
    }
  }

  // Contract double-down style sync; the localized prompt for the 12s window is owned by contracts-hud.js.
  if (typeof document !== 'undefined' && rt.state && rt.state.contract) {
    var cCard = document.querySelector('#contractTracker .contract-card');
    if (cCard) cCard.classList.toggle('is-doubled', Boolean(rt.state.contract.doubled));
  }
  updateTips();
  updateLoadoutPanel();
  updateInterludePanel();
  updateCodexPanel();
  if (!rt.state.over) resetTelemetry();
  if (rt.ui.gameOver) rt.ui.gameOver.hidden = !rt.state.over || (rt.state.deathSequenceTimer > 0);
  if (rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = !rt.state.over || (rt.state.deathSequenceTimer > 0) || !rt.state.isNewRecord;
  if (rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = !rt.state.over || (rt.state.deathSequenceTimer > 0);
  if (rt.ui.finalWave) rt.ui.finalWave.textContent = String(rt.state.wave).padStart(2, '0');
  if (rt.ui.finalScore) rt.ui.finalScore.textContent = String(rt.state.score).padStart(6, '0');
  if (rt.ui.finalBest) rt.ui.finalBest.textContent = String(rt.state.bestScore).padStart(6, '0');
  if (rt.state.over && rt.state.stats) {
    var stats = rt.state.stats;
    var rank = rt.state.evalRank || calculateCombatRank(rt.state.wave, rt.state.score, stats);
    rt.state.evalRank = rank;
    var acc = (stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) : 0);
    syncTelemetry(acc, stats);
    syncSlam();

    if (rt.ui.combatRankLetter) {
      rt.ui.combatRankLetter.textContent = rank.letter;
      if (rt.ui.combatRankLetter.classList) {
        rt.ui.combatRankLetter.classList.remove('rank-letter--sss', 'rank-letter--splus', 'rank-letter--s', 'rank-letter--a', 'rank-letter--b', 'rank-letter--c');
        rt.ui.combatRankLetter.classList.add(rank.classMod);
      }
    }
    if (rt.ui.combatRankStamp && rt.ui.combatRankStamp.classList) {
      rt.ui.combatRankStamp.classList.toggle('is-s-rank', rank.letter === 'SSS' || rank.letter === 'S' || rank.letter === 'S+');
    }
    if (rt.ui.combatRankTitle) {
      rt.ui.combatRankTitle.textContent = zh ? tRankTitle(rank.title) : rank.title;
    }

    syncScoreBreakdown();
  }
  if (rt.ui.accountSaveBadge) rt.ui.accountSaveBadge.hidden = !rt.state.over || !rt.accountRunSaved;
  fitGameOverOverlay();
  if (rt.ui.runState && rt.state.over) rt.ui.runState.textContent = zh ? '中斷' : 'SIGNAL LOST';
  else if (rt.ui.runState && !rt.ui.startScreen) rt.ui.runState.textContent = zh ? '即時' : 'LIVE';
  if (rt.ui.statusText && rt.state.over) rt.ui.statusText.textContent = zh ? '訊號中斷 — 按 R 重新部署' : 'SIGNAL LOST — PRESS R TO REDEPLOY';
}

if (typeof onLanguageChange === 'function') {
  onLanguageChange(function () {
    breakdownRoll.key = '';
    ensureBreakdown();
    updateDomUi();
  });
}

