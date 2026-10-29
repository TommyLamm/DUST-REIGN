import { AudioFX } from '../audio/audio-fx.js';
import { STORM_FRONT_SECONDS, WAVE_LENGTH } from '../config.js';
import { initCamera } from '../core/camera.js';
import { SPAWN_CENTER_X, SPAWN_CENTER_Y } from '../core/constants.js';
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
import { clearScorePops, setStatusText, updateDomUi } from '../ui/hud.js';
import { resize, syncCombatLayout } from '../ui/dom.js';
import { draw } from '../render/draw.js';
import { invalidateTerrainPatterns } from '../render/terrain.js';
import { clearCombatVisuals } from '../render/fx.js';
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

/**
 * Live wave-pill subtitle. Reuses existing chrome/log fragments only
 * (拾荒時刻 / 狼群湧浪 / 暴風逼近 / 危急 / 高度 — already in i18n/HUD).
 */
export function wavePressureSubtitle(state, zh) {
  if (!state) state = rt.state;
  var chinese = !!zh;
  if (!state) return chinese ? '拾荒時刻' : 'SCAVENGER HOUR';
  if (state.wolfPackSurge) return chinese ? '狼群湧浪' : 'WOLF PACK SURGE';
  var stormSec = (typeof state.stormSeconds === 'number' && state.stormSeconds >= 0)
    ? state.stormSeconds
    : STORM_FRONT_SECONDS;
  var sov = !!(state.boss && state.boss.kind === 'sovereign' && state.boss.hp > 0);
  if (!sov && state.enemies) {
    for (var si = 0; si < state.enemies.length; si += 1) {
      var se = state.enemies[si];
      if (se && se.kind === 'sovereign' && se.hp > 0) { sov = true; break; }
    }
  }
  if (sov || (state.waveTime >= WAVE_LENGTH - stormSec)) {
    return chinese ? '暴風逼近' : 'STORM FRONT';
  }
  var tier = computeThreatTier(state);
  if (tier >= 2) return chinese ? '危急' : 'CRITICAL';
  if (tier >= 1) return chinese ? '高度' : 'HIGH';
  return chinese ? '拾荒時刻' : 'SCAVENGER HOUR';
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

function resetRunCombatStats(state) {
  if (!state) return;
  state.score = 0;
  state.kills = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.grazeCombo = 0;
  state.grazeTimer = 0;
  state.wave = 1;
  state.waveTime = 0;
  state.level = 1;
  state.xp = 0;
  state.xpNext = 55;
  state.deathCause = null;
  state.lastDamageSource = '';
  state.lastNonEliteDamageSource = '';
  state.recentDamageSources = [];
  state.evalRank = null;
  state.isNewRecord = false;
  state.scoreBreakdown = { kill: 0, bounty: 0, storm: 0, graze: 0, repair: 0, wave: 0, flawless: 0, boss: 0, style: 0, contract: 0, overtime: 0, extract: 0 };
  state.scrapCollectedInStage = 0;
  state.damageTakenInStage = 0;
  state.waveDamageTaken = 0;
  state.flawlessStreak = 0;
  state.stats = {
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    crits: 0,
    coresDetonated: 0,
    grazes: 0,
    maxCombo: 0,
    contractsCompleted: 0,
    justDashes: 0,
    partsDestroyed: 0,
    flawlessWaves: 0,
    barrelChainMax: 0,
    fusionsUnlocked: 0
  };
}


function recoverCombatView() {
  // Same self-heal as tab-return (#368): layout flip after death/R can blank the canvas until a visibility bounce.
  try { syncCombatLayout(); } catch (e0) {}
  try { resize(); } catch (e1) {}
  try { invalidateTerrainPatterns(); } catch (e2) {}
  rt.lastTime = 0;
  try { draw(); } catch (e3) {}
}

/** Multi-tab / unclean reopen: restore LIVE chrome so sim + pause work without a hard reload. */
export function healStaleLive() {
  if (!rt.state || !rt.ui) return false;
  var onStart = !!(rt.ui.startScreen && !rt.ui.startScreen.hidden);
  if (onStart) {
    recoverCombatView();
    if (typeof rt.kickFrame === "function") try { rt.kickFrame(); } catch (eK0) {}
    return false;
  }
  if (rt.state.over) {
    // Storm / draw-throw death freeze: always surface the result card.
    rt.state.paused = false;
    rt.state.deathSequenceTimer = 0;
    if (rt.ui.overlay) rt.ui.overlay.hidden = true;
    if (rt.ui.pauseModal) rt.ui.pauseModal.hidden = true;
    if (rt.ui.gameOver) rt.ui.gameOver.hidden = false;
    if (rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = !rt.state.isNewRecord;
    if (rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = false;
    recoverCombatView();
    if (typeof rt.kickFrame === "function") try { rt.kickFrame(); } catch (eK0b) {}
    try { updateDomUi(); } catch (eUi0) {}
    return true;
  }
  // Desynced start flag / leftover upgrade gate can freeze score+energy and kill pause.
  if (rt.ui.startScreen) rt.ui.startScreen.hidden = true;
  if (rt.ui.gameOver) rt.ui.gameOver.hidden = true;
  if (rt.ui.overlay && rt.state.upgradeChoices && rt.state.upgradeChoices.length && rt.ui.overlay.hidden) {
    rt.state.upgradeChoices = [];
  }
  if (rt.state.hitstop > 0.5) rt.state.hitstop = 0;
  if (rt.ui.runState) rt.ui.runState.textContent = rt.state.paused ? "PAUSED" : "LIVE";
  recoverCombatView();
  if (typeof rt.kickFrame === "function") try { rt.kickFrame(); } catch (eK1) {}
  try { updateDomUi(); } catch (eUi) {}
  return true;
}
export function beginRun() {
  if (!rt.state) return;
  // Start-screen deploy must win over leftover over/upgrade residue (hard reload / half-reset).
  var fromStart = !!(rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden);
  if (!fromStart) {
    if (rt.state.over || (rt.state.upgradeChoices && rt.state.upgradeChoices.length)) return;
    // Already deployed — ignore duplicate CTA / delegated / pointerup+click pairs.
    if (rt.ui && rt.ui.startScreen && rt.ui.startScreen.hidden) return;
  }
  if (fromStart) {
    rt.state.over = false;
    rt.state.deathSequenceTimer = 0;
    rt.state.upgradeChoices = [];
    rt.state.banishPicking = false;
    if (rt.ui.overlay) rt.ui.overlay.hidden = true;
    if (rt.ui.gameOver) rt.ui.gameOver.hidden = true;
    if (rt.ui.pauseModal) rt.ui.pauseModal.hidden = true;
  }

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

  // Drop leftover score/combat floaters so obstacle trees do not keep last-run numbers.
  try { clearCombatVisuals(); } catch (eFx) {}
  try { clearScorePops(); } catch (ePop) {}
  // Every deploy must start a clean telemetry run (redeploy already makeState; fromStart alone used to keep prior damageDealt/hit rate).
  resetRunCombatStats(state);
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
  // Force canvas measure after is-in-combat CSS reflow (sync may have sampled a stale rect).
  if (typeof window !== "undefined") resize();
  clearResidualCombatInput();
  // World spawn (not viewport half) — ui.width/2 left the hull on the map rim after redeploy.
  function snapDeploySpawn() {
    if (!rt.state || !rt.state.player) return;
    var spawnX = (typeof SPAWN_CENTER_X === "number") ? SPAWN_CENTER_X : (rt.state.width / 2);
    var spawnY = (typeof SPAWN_CENTER_Y === "number") ? SPAWN_CENTER_Y : (rt.state.height / 2);
    rt.state.player.x = spawnX;
    rt.state.player.y = spawnY;
    if (rt.input && rt.input.mouse) {
      rt.input.mouse.x = spawnX + 100;
      rt.input.mouse.y = spawnY;
    }
    if (rt.camera && rt.state) {
      initCamera(rt.camera, rt.state.width, rt.state.height, (rt.ui && rt.ui.width) || 960, (rt.ui && rt.ui.height) || 640);
    }
  }
  snapDeploySpawn();
  // Fair open: drop menu leftovers and grant brief spawn i-frames (no DPS retune).
  if (rt.state) {
    if (rt.state.enemies) rt.state.enemies.length = 0;
    if (rt.state.enemyBullets) rt.state.enemyBullets.length = 0;
    if (rt.state.artilleryTargets) rt.state.artilleryTargets.length = 0;
    if (rt.state.player) {
      rt.state.player.invulnerable = Math.max(rt.state.player.invulnerable || 0, 1.35);
      rt.state.player._capNextInvuln = undefined;
    }
  }
  spawnBarrels();
  spawnSpires();
  recoverCombatView();
  // Second pass after LIVE CSS settles — aim/camera + canvas self-heal (death→R blank grid).
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function () {
      recoverCombatView();
      snapDeploySpawn();
      if (typeof rt.kickFrame === "function") try { rt.kickFrame(); } catch (eKick) {}
    });
  } else if (typeof rt.kickFrame === "function") {
    try { rt.kickFrame(); } catch (eKick2) {}
  }
}

export function togglePause() {
  if (!rt.state || rt.state.over || (rt.state.upgradeChoices && rt.state.upgradeChoices.length) || (rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden)) return;
  var wasPaused = !!rt.state.paused;
  rt.state.paused = !rt.state.paused;
  if (wasPaused && !rt.state.paused && rt.state.player) {
    var p = rt.state.player;
    p.invulnerable = Math.max(p.invulnerable || 0, 0.85);
    p.contactLock = Math.max(p.contactLock || 0, 0.95);
    p.postUnpauseGrace = 0.95;
  }
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
        clearResidualCombatInput();
        if (rt.ui.canvas && typeof rt.ui.canvas.focus === 'function') rt.ui.canvas.focus();
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
  try { clearCombatVisuals(); } catch (eFx2) {}
  try { clearScorePops(); } catch (ePop2) {}
  // Wipe result telemetry DOM so a prior run cannot linger on the card before the next death.
  if (rt.ui) {
    if (rt.ui.telAccuracy) rt.ui.telAccuracy.textContent = '0%';
    if (rt.ui.telMaxCombo) rt.ui.telMaxCombo.textContent = 'x0';
    if (rt.ui.telGrazes) rt.ui.telGrazes.textContent = '0';
    if (rt.ui.telDamage) rt.ui.telDamage.textContent = '0';
  }
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
  if (rt.camera && rt.state) {
    initCamera(rt.camera, rt.state.width, rt.state.height, (rt.ui && rt.ui.width) || 960, (rt.ui && rt.ui.height) || 640);
  }
  updateDomUi();
}

// True same-loadout redeploy: results R / 再次出擊 skip the loadout screen.
function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/** Block R / 再次出擊 until death card has been readable (clears residual combat click). */
export function armRedeployGate(extraSec) {
  if (!rt.state) return;
  clearResidualCombatInput();
  var seq = (rt.state.deathSequenceTimer > 0) ? rt.state.deathSequenceTimer : 0;
  var hold = seq + (typeof extraSec === 'number' ? extraSec : 0.55);
  rt.state.redeployGateUntilMs = nowMs() + Math.max(0.35, hold) * 1000;
  if (rt.ui && rt.ui.restart) {
    try { rt.ui.restart.disabled = true; } catch (e) {}
  }
}

export function canAcceptRedeploy() {
  if (!rt.state || !rt.state.over) return false;
  var until = rt.state.redeployGateUntilMs || 0;
  if (!(until > 0)) return true;
  return nowMs() >= until;
}

export function redeploy() {
  if (rt.state && rt.state.over && !canAcceptRedeploy()) return;
  if (rt.state) rt.state.redeployGateUntilMs = 0;
  if (rt.ui && rt.ui.restart) {
    try { rt.ui.restart.disabled = false; } catch (e0) {}
  }
  restart();
  beginRun();
  // beginRun already recovers; second pass after LIVE CSS settles (death→R blank grid).
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function () { recoverCombatView(); });
  } else {
    recoverCombatView();
  }
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
  // Arm reveal timer before side effects so a throw cannot leave over without a timer.
  rt.state.deathSequenceTimer = 0.55;
  rt.state.deathRevealAtMs = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) + 1200;
  // Level-up / pause must not freeze the death sequence: upgrade pick sets paused=true
  // mid-frame, which would otherwise stall deathSequenceTimer and ignore R forever.
  rt.state.paused = false;
  rt.state.banishPicking = false;
  rt.state.upgradeChoices = [];
  if (rt.ui && rt.ui.overlay) rt.ui.overlay.hidden = true;
  if (rt.ui && rt.ui.pauseModal) rt.ui.pauseModal.hidden = true;
  if (rt.ui && rt.ui.gameOver) rt.ui.gameOver.hidden = true;
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
  // Keep timer armed even if later code paths touched it.
  if (!(rt.state.deathSequenceTimer > 0)) rt.state.deathSequenceTimer = 0.55;
  clearResidualCombatInput();
  armRedeployGate(0.55);
  saveAccountCheckpoint();
}

export function stepStageFlow(dt) {
  if (!rt.state || rt.state.paused || rt.state.over) return;
  if (rt.state.mode === 'campaign' || rt.state.mode === 'hardcore') {
    checkStageVictory(rt.state, dt);
  }
}
