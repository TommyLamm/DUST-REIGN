import { AudioFX } from '../audio/audio-fx.js';
import { STORM_FRONT_SECONDS, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { getCampaignStore, getHardcoreStore, readModdedBestScore, recordHardcoreClear, recordStageClear, writeBestScoreV2, writeModdedBestScore } from '../core/meta-store.js';
import { makeState } from '../core/state.js';
import { qa } from '../core/utils.js';
import { applyRig } from '../data/rigs.js';
import { finishAccountRun, saveAccountCheckpoint, startAccountRun } from '../platform/playroom.js';
import { checkStageVictory, directorStartRun } from './director.js';
import { finalizeGhostOnClear, initGhostForRun } from './ghost.js';
import { grantDeferredExtract } from './interlude.js';
import { applyLoadout, onRunEnd } from './meta.js';
import { calculateCombatRank } from './scoring.js';
import { spawnBarrels, spawnSpires } from './spawning.js';
import { updateDomUi } from '../ui/hud.js';
import { syncCombatLayout } from '../ui/dom.js';
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
  if (rt.state.mode === 'campaign' || rt.state.mode === 'hardcore') {
    if (!rt.state.over && !rt.state.paused && rt.renderDt > 0) {
      if (rt.state._lastVictoryCheckTime !== rt.renderTime) {
        rt.state._lastVictoryCheckTime = rt.renderTime;
        checkStageVictory(rt.state, rt.renderDt);
      }
    }
  }
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

  var state = rt.state;
  var stageConfig = state.stageConfig;
  if (state.mode === 'campaign' || state.mode === 'hardcore') {
    if (stageConfig) {
      var lockedRig = stageConfig.lockedRig || stageConfig.fixedRig;
      if (lockedRig) {
        applyRig(state.player, lockedRig);
        state.rigId = lockedRig;
        state.player.rig = lockedRig;
      }
      var lockedWeapon = stageConfig.lockedWeapon || stageConfig.fixedWeapon;
      if (lockedWeapon) {
        state.weaponId = lockedWeapon;
        state.player.weapon = lockedWeapon;
        state.player.weaponMode = lockedWeapon;
      }
      if (stageConfig.maxHpCap) {
        state.player.maxHp = Math.min(state.player.maxHp, stageConfig.maxHpCap);
        state.player.hp = state.player.maxHp;
      }
      state.stageElapsed = 0;
      state.stageCleared = false;
      state.stageStars = { star1: false, star2: false, star3: false };
      state.scrapCollectedInStage = 0;
      state.damageTakenInStage = 0;
      if (stageConfig.type === 'beacon_defense' || stageConfig.goalType === 'beacon_defense') {
        state.beaconMaxHp = stageConfig.beaconMaxHp || 1000;
        state.beaconHp = state.beaconMaxHp;
        var bw = (rt.ui && rt.ui.width) || state.width || 960;
        var bh = (rt.ui && rt.ui.height) || state.height || 640;
        state.beacon = {
          x: bw / 2,
          y: bh / 2,
          r: stageConfig.beaconRadius || 40,
          hp: state.beaconHp,
          maxHp: state.beaconMaxHp,
          captureRadius: stageConfig.captureRadius || 120
        };
      }
      if (stageConfig.type === 'vip_hunt' || stageConfig.goalType === 'vip_hunt') {
        state.vipList = [];
        var vipCount = stageConfig.targetQuota || 2;
        var vw = (rt.ui && rt.ui.width) || state.width || 960;
        var vh = (rt.ui && rt.ui.height) || state.height || 640;
        var kind = stageConfig.id === 'stage_1_3' ? 'brute' :
                   stageConfig.id === 'stage_2_2' ? 'elite' :
                   stageConfig.id === 'stage_3_3' ? 'burrower' : (stageConfig.vipKind || 'brute');
        for (var vi = 0; vi < vipCount; vi += 1) {
          var angle = (vi / vipCount) * Math.PI * 2 + Math.PI / 4;
          var dist = 220;
          var vipEnemy = {
            kind: kind,
            x: vw / 2 + Math.cos(angle) * dist,
            y: vh / 2 + Math.sin(angle) * dist,
            r: kind === 'burrower' ? 20 : 22,
            hp: kind === 'burrower' ? 280 : 380,
            maxHp: kind === 'burrower' ? 280 : 380,
            speed: 120,
            damage: 24,
            score: 300,
            isVip: true,
            color: '#f43f5e',
            touchCooldown: 0,
            shootCooldown: 1.0 + vi * 0.5
          };
          if (kind === 'elite') {
            vipEnemy.affix = 'command';
          }
          state.enemies.push(vipEnemy);
          state.vipList.push(vipEnemy);
        }
      }
    }
  }

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
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'SIGNAL LIVE — KEEP MOVING';
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
  if (rt.ui.startScreen) rt.ui.startScreen.hidden = false;
  if (rt.ui.gameOver) rt.ui.gameOver.hidden = true;
  if (rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = true;
  if (rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = true;
  syncCombatLayout();
  rt.state = makeState();
  rt.state.paused = true;
  rt.state.player.x = rt.state.width / 2;
  rt.state.player.y = rt.state.height / 2;
  rt.input.mouse.x = rt.state.player.x + 100;
  rt.input.mouse.y = rt.state.player.y;
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
  var tel = typeof document !== 'undefined' ? document.getElementById('runTelemetry') : null;
  if (tel && tel.parentNode) tel.parentNode.removeChild(tel);
  var breakdown = typeof document !== 'undefined' ? document.getElementById('scoreBreakdown') : null;
  if (breakdown && breakdown.parentNode) breakdown.parentNode.removeChild(breakdown);
  if (rt.ui.runState) rt.ui.runState.textContent = 'STANDBY';
  if (rt.ui.statusText) rt.ui.statusText.textContent = 'SELECT A RIG — PRESS START';
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
  } else {
    rt.state.stageCleared = true;
    rt.state.stageVictory = true;
    if (options && options.stars) rt.state.stageStars = options.stars;
    if (options && options.stageId) rt.state.stageId = options.stageId;
    rt.state.banner = 3.5;
    rt.state.bannerText = 'SECTOR SECURED // MISSION COMPLETE';
    if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'SECTOR SECURED // MISSION COMPLETE';
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
