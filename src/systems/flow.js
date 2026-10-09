import { AudioFX } from '../audio/audio-fx.js';
import { STORM_FRONT_SECONDS, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { writeBestScore } from '../core/settings.js';
import { makeState } from '../core/state.js';
import { qa } from '../core/utils.js';
import { finishAccountRun, startAccountRun } from '../platform/playroom.js';
import { spawnBarrels, spawnEnemy, spawnSpires } from './spawning.js';
import { updateDomUi } from '../ui/hud.js';
import { getCurrentPauseTab, renderBuildInspector, resetAbandonConfirm, updateSettingsUi } from '../ui/pause-menu.js';

export function isStormFront() {
  return !!rt.state && rt.state.waveTime >= WAVE_LENGTH - STORM_FRONT_SECONDS;
}

export function beginRun() {
  if (!rt.state || rt.state.over || (rt.state.upgradeChoices && rt.state.upgradeChoices.length)) return;
  AudioFX.unlock();
  AudioFX.setLowpass(0);
  rt.state.paused = false;
  rt.accountRun = startAccountRun();
  rt.accountRunSaved = false;
  if (rt.ui.startScreen) rt.ui.startScreen.hidden = true;
  if (rt.ui.runState) rt.ui.runState.textContent = 'LIVE';
  if (rt.ui.statusText) rt.ui.statusText.textContent = 'SIGNAL LIVE — KEEP MOVING';
  if (rt.ui.canvas && rt.ui.canvas.focus) rt.ui.canvas.focus();
  spawnBarrels();
  spawnSpires();
}

export function togglePause() {
  if (!rt.state || rt.state.over || (rt.state.upgradeChoices && rt.state.upgradeChoices.length) || (rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden)) return;
  rt.state.paused = !rt.state.paused;
  if (rt.ui) {
    if (rt.ui.runState) rt.ui.runState.textContent = rt.state.paused ? 'PAUSED' : 'LIVE';
    if (rt.ui.statusText) rt.ui.statusText.textContent = rt.state.paused ? 'SIGNAL PAUSED — PRESS P OR ESC TO RESUME' : 'SIGNAL LIVE — KEEP MOVING';
    if (rt.ui.pauseModal) {
      rt.ui.pauseModal.hidden = !rt.state.paused;
      if (rt.state.paused) {
        updateSettingsUi();
        if (getCurrentPauseTab() === 'build') renderBuildInspector();
        resetAbandonConfirm();
      } else {
        resetAbandonConfirm();
      }
    }
  }
  updateDomUi();
}

export function restart() {
  if (!rt.ui) return;
  AudioFX.unlock();
  AudioFX.setLowpass(0);
  rt.state = makeState(rt.ui.width, rt.ui.height);
  rt.state.grazeCombo = 0;
  rt.state.grazeTimer = 0;
  rt.state.player.chargeTime = 0;
  rt.state.player.isCharging = false;
  rt.state.player.weaponMode = 'standard';
  rt.state.player.x = rt.ui.width / 2;
  rt.state.player.y = rt.ui.height / 2;
  rt.input.mouse.x = rt.ui.width / 2 + 100;
  rt.input.mouse.y = rt.ui.height / 2;
  rt.input.mouse.down = false;
  rt.firePointers.clear();
  rt.input.keys.clear();
  rt.input.touchMode = false;
  rt.input.gamepadX = 0;
  rt.input.gamepadY = 0;
  rt.accountRun = startAccountRun();
  rt.accountRunSaved = false;
  if (rt.ui.runLog) qa('.run-log-entry', rt.ui.runLog).forEach(function (item) { item.parentNode.removeChild(item); });
  rt.ui.overlay.hidden = true;
  if (rt.ui.pauseModal) rt.ui.pauseModal.hidden = true;
  resetAbandonConfirm();
  if (rt.ui.startScreen) rt.ui.startScreen.hidden = true;
  if (rt.ui.gameOver) rt.ui.gameOver.hidden = true;
  if (rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = true;
  if (rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = true;
  var tel = document.getElementById('runTelemetry');
  if (tel && tel.parentNode) tel.parentNode.removeChild(tel);
  if (rt.ui.runState) rt.ui.runState.textContent = 'LIVE';
  if (rt.ui.statusText) rt.ui.statusText.textContent = 'SIGNAL LIVE — KEEP MOVING';
  rt.state.barrels = [];
  rt.state.vortices = [];
  rt.state.spires = [];
  spawnBarrels();
  spawnSpires();
  for (var i = 0; i < 3; i += 1) spawnEnemy();
  updateDomUi();
}

function recordBestScore() {
  if (!rt.state || rt.state.score <= rt.state.bestScore) return;
  rt.state.bestScore = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(rt.state.score || 0)));
  writeBestScore(rt.state.bestScore);
}

export function calculateCombatRank(wave, score, stats) {
  stats = stats || {};
  var shotsFired = stats.shotsFired || 0;
  var shotsHit = stats.shotsHit || 0;
  var acc = (shotsFired > 0 ? (shotsHit / shotsFired) : 0);
  var w = Number(wave) || 1;
  var s = Number(score) || 0;
  var letter = 'C';
  var title = 'RECRUIT RECLUSE';
  var classMod = 'rank-letter--c';

  if (w >= 10 || (w >= 6 && s >= 7500 && acc >= 0.45)) {
    letter = 'S';
    title = 'APEX SCAVENGER';
    classMod = 'rank-letter--s';
  } else if (w >= 5 || (w >= 4 && s >= 4000)) {
    letter = 'A';
    title = 'VETERAN BREACHER';
    classMod = 'rank-letter--a';
  } else if (w >= 3 && s >= 1800) {
    letter = 'B';
    title = 'IRON SCRAPPER';
    classMod = 'rank-letter--b';
  }
  return {
    letter: letter,
    title: title,
    classMod: classMod,
    acc: acc
  };
}

export function triggerGameOver() {
  if (!rt.state || rt.state.over) return;
  rt.state.player.hp = 0;
  rt.state.over = true;
  AudioFX.setLowpass(0);
  var previousBest = rt.state.bestScore;
  recordBestScore();
  finishAccountRun();
  rt.input.mouse.down = false;
  rt.state.isNewRecord = (rt.state.score > previousBest && rt.state.score > 0);
  rt.state.evalRank = calculateCombatRank(rt.state.wave, rt.state.score, rt.state.stats);
  rt.state.deathSequenceTimer = 0.55;
  if (rt.ui && rt.ui.gameOver) rt.ui.gameOver.hidden = true;
}
