import { AudioFX } from '../audio/audio-fx.js';
import { STORM_FRONT_SECONDS, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { getCampaignStore, getHardcoreStore, readMeta, readModdedBestScore, recordHardcoreClear, recordStageClear, writeBestScoreV2, writeModdedBestScore } from '../core/meta-store.js';
import { makeState } from '../core/state.js';
import { qa } from '../core/utils.js';
import { applyRig } from '../data/rigs.js';
import { finishAccountRun, saveAccountCheckpoint, startAccountRun } from '../platform/playroom.js';
import { getCampaignStage } from '../data/campaign-stages.js';
import { HARDCORE_OPERATIONS, getHardcoreOperation } from '../data/hardcore-operations.js';
import { checkStageVictory, directorStartRun } from './director.js';
import { finalizeGhostOnClear, initGhostForRun } from './ghost.js';
import { clearResidualCombatInput, grantDeferredExtract } from './interlude.js';
import { applyLoadout, onRunEnd } from './meta.js';
import { initMode } from './modes/mode-adapter.js';
import { calculateCombatRank } from './scoring.js';
import { spawnBarrels, spawnSpires } from './spawning.js';
import { setStatusText, updateDomUi } from '../ui/hud.js';
import { syncCombatLayout } from '../ui/dom.js';
import { evaluateArchetypes } from './progression.js';
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
  if (!list) return null;
  return list.find(function (e) { return e && e.kind === 'sovereign' && e.hp > 0; }) || null;
}

export function isStormFront() {
  if (!rt.state) return false;
  if (livingSovereign()) return true;
  return rt.state.waveTime >= WAVE_LENGTH - stormSeconds();
}

/** Live threat tier 0=LOW, 1=HIGH, 2=CRITICAL from field pressure, not wave alone. */
export function computeThreatTier(state) {
  if (!state) state = rt.state;
  if (!state) return 0;
  var score = 0;
  var wave = state.wave || 1;
  if (wave >= 10) score += 1;
  else if (wave >= 5) score += 0; // wave is only a mild baseline now

  if (state.wolfPackSurge) score += 2;
  var storm = false;
  if (livingSovereign()) storm = true;
  else if (state.waveTime >= WAVE_LENGTH - stormSeconds()) storm = true;
  if (storm) score += 2;

  var boss = state.boss;
  var list = state.enemies || [];
  var i;
  var elites = 0;
  var living = 0;
  var bossAlive = !!(boss && boss.hp > 0);
  for (i = 0; i < list.length; i += 1) {
    var e = list[i];
    if (!e || !(e.hp > 0)) continue;
    living += 1;
    if (e.isBoss || e.kind === 'titan' || e.kind === 'dreadnought' || e.kind === 'sovereign' || e.kind === 'behemoth') bossAlive = true;
    if (e.kind === 'elite' || e.elite || e.affix) elites += 1;
  }
  if (bossAlive) score += 5;

  var cap = (state.recipe && typeof state.recipe.cap === 'number') ? state.recipe.cap : Math.min(95, 5 + wave * 4);
  var density = cap > 0 ? living / cap : 0;
  if (density >= 0.7 || living >= 28) score += 2;
  else if (density >= 0.4 || living >= 14) score += 1;

  if (elites >= 3) score += 2;
  else if (elites >= 1) score += 1;

  if (score >= 5) return 2;
  if (score >= 2) return 1;
  return 0;
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

  var state = rt.state;
  var meta = readMeta();
  var selectedMode = (meta && meta.selectedMode) || state.mode || 'standard';
  state.mode = selectedMode;

  if (state.mode === 'campaign' && !state.stageConfig) {
    var campStore = getCampaignStore();
    var selStageId = (campStore && campStore.selectedStage) || 'stage_1_1';
    state.stageConfig = getCampaignStage(selStageId);
  } else if (state.mode === 'hardcore' && !state.stageConfig) {
    var hardStore = getHardcoreStore();
    var selOpId = (hardStore && hardStore.selectedOperation) || 'op_01';
    state.stageConfig = getHardcoreOperation(selOpId) || HARDCORE_OPERATIONS[0];
  }

  applyLoadout(state);
  initMode(state, state.mode, state.stageConfig);
  evaluateArchetypes(state);

  directorStartRun(rt.state);
  AudioFX.unlock();
  AudioFX.setLowpass(0);
  rt.state.paused = false;
  if ((rt.state.mode === 'standard' || rt.state.mode === 'daily') && !rt.state.isModded) {
    rt.accountRun = startAccountRun();
  } else {
    rt.accountRun = null;
  }
  rt.accountRunSaved = false;
  initGhostForRun(rt.state);
  if (rt.ui && rt.ui.startScreen) rt.ui.startScreen.hidden = true;
  if (rt.ui && rt.ui.runState) rt.ui.runState.textContent = 'LIVE';
  setStatusText('SIGNAL LIVE — KEEP MOVING');
  if (rt.ui && rt.ui.canvas && rt.ui.canvas.focus) rt.ui.canvas.focus();
  syncCombatLayout();
  if (rt.state && rt.state.player && rt.ui && rt.ui.width) {
    rt.state.player.x = rt.ui.width / 2;
    rt.state.player.y = rt.ui.height / 2;
    if (rt.input && rt.input.mouse) {
      rt.input.mouse.x = rt.ui.width / 2 + 100;
      rt.input.mouse.y = rt.ui.height / 2;
    }
  }
  spawnBarrels();
  spawnSpires();
}

export function togglePause() {
  if (!rt.state || rt.state.over || (rt.state.upgradeChoices && rt.state.upgradeChoices.length) || (rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden)) return;
  rt.state.paused = !rt.state.paused;
  if (rt.ui) {
    if (rt.ui.runState) rt.ui.runState.textContent = rt.state.paused ? 'PAUSED' : 'LIVE';
    setStatusText(rt.state.paused ? 'SIGNAL PAUSED — PRESS P OR ESC TO RESUME' : 'SIGNAL LIVE — KEEP MOVING');
    if (rt.ui.pauseModal) {
      rt.ui.pauseModal.hidden = !rt.state.paused;
      if (rt.state.paused) {
        clearResidualCombatInput();
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
  if (rt.ui.startScreen) rt.ui.startScreen.hidden = false;
  if (rt.ui.gameOver) rt.ui.gameOver.hidden = true;
  if (rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = true;
  if (rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = true;
  syncCombatLayout();
  rt.state = makeState();
  evaluateArchetypes(rt.state);
  var meta = readMeta();
  var selectedMode = (meta && meta.selectedMode) || 'standard';
  rt.state.mode = selectedMode;
  if (selectedMode === 'campaign') {
    var campStore = getCampaignStore();
    var selStageId = (campStore && campStore.selectedStage) || 'stage_1_1';
    rt.state.stageConfig = getCampaignStage(selStageId);
  } else if (selectedMode === 'hardcore') {
    var hardStore = getHardcoreStore();
    var selOpId = (hardStore && hardStore.selectedOperation) || 'op_01';
    rt.state.stageConfig = getHardcoreOperation(selOpId) || HARDCORE_OPERATIONS[0];
  } else {
    rt.state.stageConfig = null;
  }
  rt.state.paused = true;
  rt.state.player.x = rt.state.width / 2;
  rt.state.player.y = rt.state.height / 2;
  rt.input.mouse.x = rt.state.player.x + 100;
  rt.input.mouse.y = rt.state.player.y;
  rt.input.mouse.down = false;
  rt.firePointers.clear();
  rt.input.keys.clear();
  rt.input.gamepadX = 0;
  rt.input.gamepadY = 0;
  if (rt.input.aimLock) rt.input.aimLock = null;
  rt.accountRun = null;
  rt.accountRunSaved = false;
  if (rt.ui.runLog) qa('.run-log-entry', rt.ui.runLog).forEach(function (item) { item.parentNode.removeChild(item); });
  if (rt.ui.overlay) rt.ui.overlay.hidden = true;
  if (rt.ui.pauseModal) rt.ui.pauseModal.hidden = true;
  resetAbandonConfirm();
  var tel = typeof document !== 'undefined' ? document.getElementById('runTelemetry') : null;
  if (tel && tel.parentNode) tel.parentNode.removeChild(tel);
  var breakdown = typeof document !== 'undefined' ? document.getElementById('scoreBreakdown') : null;
  if (breakdown && breakdown.parentNode) breakdown.parentNode.removeChild(breakdown);
  if (rt.ui.runState) rt.ui.runState.textContent = 'STANDBY';
  setStatusText('SELECT A RIG — PRESS ENTER TO DEPLOY');
  updateDomUi();
}

function recordBestScore() {
  if (!rt.state) return;
  var finalScore = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(rt.state.score || 0)));
  if (rt.state.isModded) {
    var curModBest = readModdedBestScore();
    if (finalScore > curModBest) {
      writeModdedBestScore(finalScore);
    }
    return;
  }
  if (finalScore <= rt.state.bestScore) return;
  rt.state.bestScore = finalScore;
  writeBestScoreV2(rt.state.bestScore);
}

export function extractRun() {
  if (!rt.state || rt.state.over || rt.state.extracted) return;
  rt.state.extracted = true;
  triggerGameOver();
}

export function triggerGameOver(options) {
  if (!rt.state || rt.state.over) return;
  var isVictory = Boolean(options && options.victory);
  if (!isVictory) {
    rt.state.player.hp = 0;
    // Ensure deathCause is always authored — enemies.js may call us after hp<=0
    // without going through damagePlayer's lethal branch (left sim as unknown).
    if (!rt.state.deathCause) {
      var sticky = rt.state.lastDamageSource || '';
      var nonElite = rt.state.lastNonEliteDamageSource || '';
      var muteElite = ((rt.state.wave | 0) >= 14);
      if (muteElite && (sticky === 'bullet:elite' || sticky === 'contact:elite')) {
        var recent = rt.state.recentDamageSources || [];
        var fromRecent = '';
        for (var ri = recent.length - 1; ri >= 0; ri -= 1) {
          if (recent[ri] && recent[ri] !== 'bullet:elite' && recent[ri] !== 'contact:elite') { fromRecent = recent[ri]; break; }
        }
        rt.state.deathCause = nonElite || fromRecent || 'unknown';
      } else {
        rt.state.deathCause = sticky || nonElite || 'unknown';
      }
    }
  } else {
    rt.state.stageCleared = true;
    rt.state.stageVictory = true;
    if (options && options.stars) rt.state.stageStars = options.stars;
    if (options && options.stageId) rt.state.stageId = options.stageId;
    rt.state.banner = 3.5;
    rt.state.bannerText = 'SECTOR SECURED // MISSION COMPLETE';
    setStatusText('SECTOR SECURED // MISSION COMPLETE');
    if (typeof AudioFX.blast === 'function') AudioFX.blast();

    var stageId = rt.state.stageId || (rt.state.stageConfig && rt.state.stageConfig.id);
    if (stageId && (rt.state.mode === 'campaign' || rt.state.mode === 'hardcore')) {
      var clearTime = rt.state.stageElapsed || 0;
      var isNewPb = false;
      if (rt.state.mode === 'campaign') {
        var campRecord = getCampaignStore().stages[stageId];
        isNewPb = !campRecord || !campRecord.bestTime || clearTime <= campRecord.bestTime;
        recordStageClear(stageId, {
          stars: (options && options.stars && ((options.stars.star1 ? 1 : 0) + (options.stars.star2 ? 1 : 0) + (options.stars.star3 ? 1 : 0))) || 1,
          score: rt.state.score || 0,
          time: clearTime,
          starDetails: options && options.stars
        });
      } else {
        var hcRecord = getHardcoreStore().operations[stageId];
        isNewPb = !hcRecord || !hcRecord.bestTime || clearTime <= hcRecord.bestTime;
        recordHardcoreClear(stageId, {
          time: clearTime,
          badge: (rt.state.stageConfig && rt.state.stageConfig.badge) || ''
        });
      }
      finalizeGhostOnClear(stageId, clearTime, isNewPb);
    }
  }
  rt.state.over = true;
  grantDeferredExtract(rt.state);
  onRunEnd(rt.state);
  AudioFX.setLowpass(0);
  var previousBest = rt.state.bestScore;
  if (rt.state.mode === 'standard' || rt.state.mode === 'daily') {
    recordBestScore();
    if (!rt.state.isModded) {
      finishAccountRun();
    }
  }
  rt.input.mouse.down = false;
  rt.state.isNewRecord = (rt.state.score > previousBest && rt.state.score > 0);
  rt.state.evalRank = calculateCombatRank(rt.state.wave, rt.state.score, rt.state.stats);
  rt.state.deathSequenceTimer = 0.55;
  if (rt.ui && rt.ui.gameOver) rt.ui.gameOver.hidden = true;
  saveAccountCheckpoint();
}

export function stepStageFlow(dt) {
  if (!rt.state || rt.state.paused || rt.state.over) return;
  if (rt.state.mode === 'campaign' || rt.state.mode === 'hardcore') {
    checkStageVictory(rt.state, dt);
  }
}
