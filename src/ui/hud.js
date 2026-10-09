import { COMBO_WINDOW, WAVE_LENGTH } from '../config.js';
import { AudioFX } from '../audio/audio-fx.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { clamp, setText } from '../core/utils.js';
import { sectorForWave } from '../render/palette.js';
import { getQuality } from '../render/quality.js';
import { calculateCombatRank, isStormFront } from '../systems/flow.js';
import { updateCodexPanel } from './codex-panel.js';
import { updateContractsHud } from './contracts-hud.js';
import { updateInterludePanel } from './interlude-panel.js';
import { updateLoadoutPanel } from './loadout-panel.js';
import { updateAudioBtn } from './pause-menu.js';
import { updateTips } from './tips.js';
import { fitGameOverOverlay } from './dom.js';
import { isChinese, onLanguageChange, tLog, tRankTitle } from '../core/i18n.js';

var shownScore = null;
var scoreState = null;
var scoreClock = 0;
var lastScoreTarget = null;
var popEl = null;
var popValue = 0;
var popAt = 0;
var popTimer = 0;
var hpLagShown = null;
var dashMax = 2.2;
var prevDash = 0;
var shootMax = 0.18;
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
    void el.offsetWidth;
    el.classList.add('is-pulse');
    if (key === 'wave') el.classList.add('is-flip');
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
  if (rt.ui.healthFill && rt.ui.healthFill.style) rt.ui.healthFill.style.width = pct + '%';
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
      void bar.offsetWidth;
      bar.classList.add('is-hurt');
    }
    bar._hp = pct;
  }
}

function setCd(el, value) {
  if (!el || !el.style || !el.style.setProperty) return;
  var v = clamp(value, 0, 1).toFixed(3);
  if (el.dataset && el.dataset.cd === v) return;
  if (el.dataset) el.dataset.cd = v;
  el.style.setProperty('--cd', v);
}

function syncCooldowns() {
  var p = rt.state.player;
  if (!p) return;
  if ((p.dashCooldown || 0) > prevDash + 0.01) dashMax = p.dashCooldown;
  prevDash = p.dashCooldown || 0;
  if ((p.cooldown || 0) <= 0) shootMax = Math.max(0.05, p.fireRate || 0.18);
  else if (p.cooldown > shootMax) shootMax = p.cooldown;
  var shoot = rt.ui.touchShoot || byId('touchShoot');
  var dash = rt.ui.touchDash || byId('touchDash');
  if (rt.ui) {
    if (shoot) rt.ui.touchShoot = shoot;
    if (dash) rt.ui.touchDash = dash;
  }
  setCd(shoot, shootMax > 0 ? (p.cooldown || 0) / shootMax : 0);
  setCd(dash, dashMax > 0 ? (p.dashCooldown || 0) / dashMax : 0);
  var energy = p.energy || 0;
  setCd(rt.ui.touchSpecial, energy >= 50 ? 0 : 1 - (energy / 50));
  var ready = energy >= 50;
  if (rt.ui.meterEnergy && rt.ui.meterEnergy.classList) rt.ui.meterEnergy.classList.toggle('is-ready', ready);
  var badge = rt.ui.empReady || byId('empReady');
  if (badge) badge.hidden = !ready;
  if (rt.ui && badge) rt.ui.empReady = badge;
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
      el.textContent = (isChinese() ? '連擊 x' : 'CHAIN x') + rt.state.combo + (rt.state.grazeCombo > 0 ? (isChinese() ? ' [擦彈 ' : ' [GRAZE ') + rt.state.grazeCombo + ']' : '');
    } else {
      el.textContent = (isChinese() ? '擦彈 x' : 'GRAZE x') + rt.state.grazeCombo;
    }
    var heat = Math.min(8, Math.max(rt.state.combo || 0, rt.state.grazeCombo || 0));
    if (el.setAttribute) el.setAttribute('data-heat', String(heat));
    if (el.style && el.style.setProperty) {
      el.style.setProperty('--chain', clamp((rt.state.comboTimer || 0) / COMBO_WINDOW, 0, 1).toFixed(3));
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
  var quality = 'auto';
  try { quality = getQuality(); } catch (e) { quality = 'auto'; }
  if (quality !== lastQuality) {
    lastQuality = quality;
    stage.setAttribute('data-quality', quality);
  }
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
  var labels = isChinese()
    ? ['擊殺', '波次', '首領', '戰法', '合約', '撤離']
    : ['KILLS', 'WAVES', 'BOSSES', 'STYLE', 'CONTRACTS', 'EXTRACTION'];
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
  void stage.offsetWidth;
  stage.classList.add('is-rank-slam');
}

export function tickHudPresentation() {
  if (!rt.state || !rt.ui || typeof document === 'undefined') return;
  stepTypewriters(rt.renderDt || 0);
  var stage = rt.ui.canvasStage || byId('canvasStage');
  if (!stage || !stage.setAttribute) return;
  var quality = 'auto';
  try { quality = getQuality(); } catch (e) { quality = 'auto'; }
  if (quality !== lastQuality) {
    lastQuality = quality;
    stage.setAttribute('data-quality', quality);
  }
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

export function updateDomUi() {
  if (!rt.state || !rt.ui) return;
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
  setText(rt.ui.xp, rt.state.xp);
  setText(rt.ui.xpMax, rt.state.xpNext);
  setText(rt.ui.level, String(rt.state.level).padStart(2, '0'));
  pulse(rt.ui.level, 'level', rt.state.level);
  setText(rt.ui.wave, zh ? ('第 ' + actRoman(rt.state.act || 1) + ' 幕 · 第 ' + String(rt.state.wave).padStart(2, '0') + ' 波') : ('ACT ' + actRoman(rt.state.act || 1) + ' · WAVE ' + String(rt.state.wave).padStart(2, '0')));
  pulse(rt.ui.wave, 'wave', rt.state.wave);
  syncScore();
  setText(rt.ui.best, String(rt.state.bestScore).padStart(6, '0'));
  setText(rt.ui.kills, rt.state.kills + (zh ? ' 敵機' : ' HOSTILES'));
  if (rt.ui.objectiveText) {
    rt.ui.objectiveText.textContent = rt.state.bountyClaimed
      ? (zh ? '懸賞已完成 — 堅守乾線邊境。' : 'BOUNTY SECURED — HOLD THE DRYLINE.')
      : (zh ? ('擊殺 ' + rt.state.bountyTarget + ' 個目標獲取 +' + rt.state.bountyReward + ' 分數。') : ('DROP ' + rt.state.bountyTarget + ' HOSTILES FOR +' + rt.state.bountyReward + ' SCORE.'));
  }
  if (rt.ui.objectiveProgress) rt.ui.objectiveProgress.style.width = (rt.state.bountyClaimed ? 100 : clamp(rt.state.bountyKills / rt.state.bountyTarget, 0, 1) * 100) + '%';
  if (rt.ui.threatIndex) {
    rt.ui.threatIndex.textContent = zh
      ? (rt.state.wave >= 5 ? '危急' : rt.state.wave >= 3 ? '高度' : '低度')
      : (rt.state.wave >= 5 ? 'CRITICAL' : rt.state.wave >= 3 ? 'HIGH' : 'LOW');
  }
  if (rt.ui.waveTimer) {
    var seconds = Math.max(0, Math.ceil(WAVE_LENGTH - rt.state.waveTime));
    var storm = isStormFront();
    var prefix = zh ? (storm ? '暴風逼近 ' : '下一波次 ') : (storm ? 'STORM FRONT ' : 'NEXT FRONT ');
    rt.ui.waveTimer.textContent = prefix + String(seconds).padStart(2, '0') + 's';
  }
  syncHealth();
  if (rt.ui.healthFill && rt.ui.healthFill.parentElement) rt.ui.healthFill.parentElement.setAttribute('aria-valuenow', String(Math.ceil(rt.state.player.hp)));
  if (rt.ui.xpFill) rt.ui.xpFill.style.width = (clamp(rt.state.xp / rt.state.xpNext, 0, 1) * 100) + '%';
  if (rt.ui.xpFill && rt.ui.xpFill.parentElement) {
    rt.ui.xpFill.parentElement.setAttribute('aria-valuenow', String(rt.state.xp));
    rt.ui.xpFill.parentElement.setAttribute('aria-valuemax', String(rt.state.xpNext));
  }
  var empCost = (typeof rt.state.player.empCost === 'number') ? rt.state.player.empCost : 50;
  var batteryCap = (typeof rt.state.player.batteryMax === 'number') ? rt.state.player.batteryMax : (rt.state.player.maxEnergy || 100);
  if (rt.ui.hudEnergy) rt.ui.hudEnergy.textContent = Math.floor(rt.state.player.energy || 0);
  if (rt.ui.meterEnergy && rt.ui.meterEnergy.setAttribute) rt.ui.meterEnergy.setAttribute('aria-valuenow', String(Math.floor(rt.state.player.energy || 0)));
  if (rt.ui.energyFill && rt.ui.energyFill.style) rt.ui.energyFill.style.width = (clamp((rt.state.player.energy || 0) / (batteryCap || 100), 0, 1) * 100) + '%';
  syncCooldowns();
  if (rt.ui.touchSpecial && rt.ui.touchSpecial.classList) {
    if ((rt.state.player.energy || 0) >= empCost) {
      rt.ui.touchSpecial.classList.add('is-ready');
      rt.ui.touchSpecial.classList.remove('touch-button--cooldown');
    } else {
      rt.ui.touchSpecial.classList.remove('is-ready');
      rt.ui.touchSpecial.classList.add('touch-button--cooldown');
    }
  }
  syncChain();
  syncSector();
  syncComms();
  syncPauseBlur();
  updateContractsHud();
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
        rt.ui.combatRankLetter.classList.remove('rank-letter--splus', 'rank-letter--s', 'rank-letter--a', 'rank-letter--b', 'rank-letter--c');
        rt.ui.combatRankLetter.classList.add(rank.classMod);
      }
    }
    if (rt.ui.combatRankStamp && rt.ui.combatRankStamp.classList) {
      rt.ui.combatRankStamp.classList.toggle('is-s-rank', rank.letter === 'S' || rank.letter === 'S+');
    }
    if (rt.ui.combatRankTitle) {
      rt.ui.combatRankTitle.textContent = zh ? tRankTitle(rank.title) : rank.title;
    }

    syncScoreBreakdown();
    if (!rt.ui.telAccuracy && rt.ui.gameOver) {
      var tel = typeof document !== 'undefined' ? document.getElementById('runTelemetry') : null;
      if (!tel && typeof document !== 'undefined') {
        var resGrid = rt.ui.gameOver.querySelector && rt.ui.gameOver.querySelector('.result-grid');
        if (resGrid) {
          tel = document.createElement('div');
          tel.id = 'runTelemetry';
          tel.className = 'telemetry-grid';
          resGrid.insertAdjacentElement('afterend', tel);
        }
      }
      if (tel) {
        var accPct = Math.round(acc * 100);
        tel.innerHTML =
          '<div><span>' + (zh ? '命中率' : 'ACCURACY') + '</span><strong>' + accPct + '% <small>(' + stats.shotsHit + '/' + stats.shotsFired + ')</small></strong></div>' +
          '<div><span>' + (zh ? '暴擊次數' : 'CRITS') + '</span><strong>' + stats.crits + '</strong></div>' +
          '<div><span>' + (zh ? '擦彈次數' : 'GRAZES') + '</span><strong>' + stats.grazes + '</strong></div>' +
          '<div><span>' + (zh ? '引爆核心' : 'CORES DETONATED') + '</span><strong>' + stats.coresDetonated + '</strong></div>' +
          '<div><span>' + (zh ? '最高連擊' : 'MAX COMBO') + '</span><strong>x' + stats.maxCombo + '</strong></div>' +
          '<div><span>' + (zh ? '總傷害量' : 'DAMAGE DEALT') + '</span><strong>' + stats.damageDealt + '</strong></div>';
      }
    }
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
