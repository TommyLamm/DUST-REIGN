import { AudioFX } from '../audio/audio-fx.js';
import { STORM_FRONT_SECONDS, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { writeBestScoreV2 } from '../core/meta-store.js';
import { makeState } from '../core/state.js';
import { qa } from '../core/utils.js';
import { finishAccountRun, startAccountRun } from '../platform/playroom.js';
import { directorStartRun } from './director.js';
import { grantDeferredExtract } from './interlude.js';
import { applyLoadout, onRunEnd } from './meta.js';
import { calculateCombatRank } from './scoring.js';
import { spawnBarrels, spawnSpires } from './spawning.js';
import { updateDomUi } from '../ui/hud.js';
import { getCurrentPauseTab, renderBuildInspector, resetAbandonConfirm, updateSettingsUi } from '../ui/pause-menu.js';

export { calculateCombatRank };

var STORM_ANGLE = 35 * Math.PI / 180;
var STORM_POWER = 38;

function stormSeconds() {
  if (rt.state && typeof rt.state.stormSeconds === 'number' && rt.state.stormSeconds >= 0) return rt.state.stormSeconds;
  return STORM_FRONT_SECONDS;
}

export function livingSovereign() {
  if (!rt.state) return null;
  var boss = rt.state.boss;
  if (boss && boss.kind === 'sovereign' && boss.hp > 0) return boss;
  var list = rt.state.enemies;
  var i;
  if (!list) return null;
  for (i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].kind === 'sovereign' && list[i].hp > 0) return list[i];
  }
  return null;
}

export function isStormFront() {
  if (!rt.state) return false;
  if (livingSovereign()) return true;
  return rt.state.waveTime >= WAVE_LENGTH - stormSeconds();
}

export function stormWind() {
  if (!isStormFront()) return null;
  var sov = livingSovereign();
  if (sov && typeof sov.windAngle === 'number') {
    var power = STORM_POWER;
    if (typeof sov.windPower === 'number' && sov.windPower > 0) power = sov.windPower;
    return { angle: sov.windAngle, power: power };
  }
  return { angle: STORM_ANGLE, power: STORM_POWER };
}

export function beginRun() {
  if (!rt.state || rt.state.over || (rt.state.upgradeChoices && rt.state.upgradeChoices.length)) return;
  applyLoadout(rt.state);
  directorStartRun(rt.state);
  AudioFX.unlock();
  AudioFX.setLowpass(0);
  rt.state.paused = false;
  rt.accountRun = startAccountRun();
  rt.accountRunSaved = false;
  if (rt.ui && rt.ui.startScreen) rt.ui.startScreen.hidden = true;
  if (rt.ui && rt.ui.runState) rt.ui.runState.textContent = 'LIVE';
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'SIGNAL LIVE — KEEP MOVING';
  if (rt.ui && rt.ui.canvas && rt.ui.canvas.focus) rt.ui.canvas.focus();
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
  rt.state.paused = true;
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
  if (rt.input.aimLock) rt.input.aimLock = null;
  rt.accountRun = null;
  rt.accountRunSaved = false;
  if (rt.ui.runLog) qa('.run-log-entry', rt.ui.runLog).forEach(function (item) { item.parentNode.removeChild(item); });
  if (rt.ui.overlay) rt.ui.overlay.hidden = true;
  if (rt.ui.pauseModal) rt.ui.pauseModal.hidden = true;
  resetAbandonConfirm();
  if (rt.ui.startScreen) rt.ui.startScreen.hidden = false;
  if (rt.ui.gameOver) rt.ui.gameOver.hidden = true;
  if (rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = true;
  if (rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = true;
  var tel = typeof document !== 'undefined' ? document.getElementById('runTelemetry') : null;
  if (tel && tel.parentNode) tel.parentNode.removeChild(tel);
  var breakdown = typeof document !== 'undefined' ? document.getElementById('scoreBreakdown') : null;
  if (breakdown && breakdown.parentNode) breakdown.parentNode.removeChild(breakdown);
  if (rt.ui.runState) rt.ui.runState.textContent = 'STANDBY';
  if (rt.ui.statusText) rt.ui.statusText.textContent = 'SELECT A RIG — PRESS START';
  updateDomUi();
}

function recordBestScore() {
  if (!rt.state || rt.state.score <= rt.state.bestScore) return;
  rt.state.bestScore = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(rt.state.score || 0)));
  writeBestScoreV2(rt.state.bestScore);
}

export function extractRun() {
  if (!rt.state || rt.state.over || rt.state.extracted) return;
  rt.state.extracted = true;
  triggerGameOver();
}

export function triggerGameOver() {
  if (!rt.state || rt.state.over) return;
  rt.state.player.hp = 0;
  rt.state.over = true;
  grantDeferredExtract(rt.state);
  onRunEnd(rt.state);
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
