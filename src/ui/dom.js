import { rt } from '../core/runtime.js';
import { clamp, first, on } from '../core/utils.js';
import { clearSpriteCache } from '../render/sprites.js';
import { chooseUpgrade } from '../systems/progression.js';
import { rebuildTerrain } from '../systems/spawning.js';
import { initCodexPanel } from './codex-panel.js';
import { initInterludePanel } from './interlude-panel.js';
import { initLoadoutPanel } from './loadout-panel.js';

var gameOverFitKey = '';

export function setupDom(options) {
  options = options || {};
  var root = options.root || first(['[data-luna-game]', '#game-root', '.game-root', '.game-container', '.game-shell']);
  var canvas = options.canvas || first(['#gameCanvas', '#game-canvas', '[data-game-canvas]', '.game-canvas', 'canvas'], root || document);
  var createdCanvas = false;

  if (!canvas) {
    root = root || document.body;
    canvas = document.createElement('canvas');
    canvas.id = 'gameCanvas';
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-label', 'Wasteland Run game arena');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    root.appendChild(canvas);
    createdCanvas = true;
  }
  root = root || canvas.closest('[data-luna-game], #game-root, .game-root, .game-container, .game-shell') || canvas.parentElement || document.body;
  canvas.style.touchAction = 'none';

  var ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('LunaGame needs a 2D canvas');

  var overlay = first(['#upgradeOverlay', '#upgrade-overlay', '#upgradePanel', '[data-upgrade-overlay]', '.upgrade-overlay', '.upgrade-panel', '.upgrade-modal']);
  var createdOverlay = false;
  if (!overlay) {
    overlay = document.createElement('section');
    overlay.className = 'upgrade-overlay';
    overlay.setAttribute('aria-live', 'polite');
    overlay.hidden = true;
    overlay.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(8,8,8,.78);z-index:5;padding:24px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#f4e8ce;';
    root.style.position = root.style.position || 'relative';
    root.appendChild(overlay);
    createdOverlay = true;
  }

  var optionsNode = first(['[data-upgrade-options]', '.upgrade-options', '#upgradeOptions', '#upgradeChoices', '.upgrade-choices'], overlay);
  if (!optionsNode) {
    optionsNode = document.createElement('div');
    optionsNode.className = 'upgrade-options';
    overlay.appendChild(optionsNode);
  }
  on(optionsNode, 'click', function (event) {
    var button = event.target.closest && event.target.closest('[data-upgrade-index]');
    if (button && optionsNode.contains(button)) chooseUpgrade(Number(button.dataset.upgradeIndex));
  });

  var restart = first(['#restartButton', '#restartBtn', '#restart', '[data-restart]', '.restart-button', '.restart']);
  var gameOver = first(['#gameOver', '#gameOverScreen', '#game-over', '[data-game-over]', '.game-over']);
  var startScreen = first(['#startScreen', '[data-start-screen]', '.start-screen']);
  var startButton = first(['#startBtn', '#startButton', '[data-start]', '.start-button']);
  var health = first(['#health', '#hudHealth', '[data-health]', '.health-value']);
  var xp = first(['#xp', '#hudXp', '[data-xp]', '.xp-value']);
  var xpMax = first(['#xpMax', '#hudXpMax', '[data-xp-max]', '.xp-max']);
  var level = first(['#level', '#hudLevel', '[data-level]', '.level-value']);
  var wave = first(['#wave', '#hudWave', '[data-wave]', '.wave-value']);
  var score = first(['#score', '#hudScore', '[data-score]', '.score-value']);
  var kills = first(['#kills', '#hudKills', '[data-kills]', '.kills-value']);
  var healthFill = first(['#healthFill', '#health-fill', '[data-health-fill]', '.health-fill']);
  var healthLag = first(['#healthLag', '.meter-lag']);
  var xpFill = first(['#xpFill', '#xp-fill', '[data-xp-fill]', '.xp-fill']);
  var runState = first(['#runState', '[data-run-state]', '.run-state']);
  var statusText = first(['#hudStatusText', '[data-status-text]', '.status-text']);
  var best = first(['#hudBest', '[data-best-score]', '.best-score']);
  var finalWave = first(['#finalWave', '[data-final-wave]']);
  var finalScore = first(['#finalScore', '[data-final-score]']);
  var finalBest = first(['#finalBest', '[data-final-best]']);
  var objectiveText = first(['#objectiveText', '[data-objective-text]', '.objective-text']);
  var objectiveProgress = first(['#objectiveProgress', '[data-objective-progress]', '.objective-progress']);
  var threatIndex = first(['#threatIndex', '[data-threat-index]', '.threat-index']);
  var waveTimer = first(['#waveTimer', '[data-wave-timer]', '.wave-timer']);
  var runLog = first(['#runLog', '[data-run-log]', '.run-log']);
  var accountSaveBadge = first(['#accountSaveBadge', '[data-account-save-badge]'], gameOver);
  var audioBtn = first(['#audioBtn', '[data-audio-btn]', '.audio-button']);
  var langBtn = first(['#langBtn', '[data-lang-btn]', '.lang-button']);
  var hudChain = first(['#hudChain', '[data-hud-chain]', '.hud-chain-badge']);
  var hudEnergy = first(['#hudEnergy', '[data-energy]']);
  var meterEnergy = first(['#meterEnergy']);
  var energyFill = first(['#energyFill', '[data-energy-fill]']);
  var touchSpecial = first(['#touchSpecial']);
  var touchShoot = first(['#touchShoot']);
  var touchDash = first(['#touchDash']);
  var empReady = first(['#empReady']);
  var commsStatus = first(['#commsStatus']);
  var windStatus = first(['#windStatus']);
  var canvasStage = first(['#canvasStage', '.canvas-stage']);
  var newRecordStamp = first(['#newRecordStamp']);
  var telAccuracy = first(['#telAccuracy'], gameOver || root);
  var telMaxCombo = first(['#telMaxCombo'], gameOver || root);
  var telGrazes = first(['#telGrazes'], gameOver || root);
  var telDamage = first(['#telDamage'], gameOver || root);
  var combatRankStamp = first(['#combatRankStamp'], gameOver || root);
  var combatRankLetter = first(['#combatRankLetter'], combatRankStamp || gameOver || root);
  var combatRankTitle = first(['#combatRankTitle'], combatRankStamp || gameOver || root);

  var pauseModal = first(['#pauseModal', '[data-pause-modal]'], root || document);
  var tabBtnSystem = first(['#tabBtnSystem'], pauseModal || document);
  var tabBtnBuild = first(['#tabBtnBuild'], pauseModal || document);
  var tabBtnControls = first(['#tabBtnControls'], pauseModal || document);
  var panelSystem = first(['#panelSystem'], pauseModal || document);
  var panelBuild = first(['#panelBuild'], pauseModal || document);
  var panelControls = first(['#panelControls'], pauseModal || document);
  var settingMasterVolume = first(['#settingMasterVolume'], pauseModal || document);
  var volumeValue = first(['#volumeValue'], pauseModal || document);
  var toggleAudioMute = first(['#toggleAudioMute'], pauseModal || document);
  var toggleHaptics = first(['#toggleHaptics'], pauseModal || document);
  var toggleMotionReduction = first(['#toggleMotionReduction'], pauseModal || document);
  var toggleHighContrast = first(['#toggleHighContrast'], pauseModal || document);
  var settingVisualQuality = first(['#settingVisualQuality'], pauseModal || document);
  var toggleTips = first(['#toggleTips'], pauseModal || document);
  var resetTips = first(['#resetTips'], pauseModal || document);
  var toggleLanguage = first(['#toggleLanguage'], pauseModal || document);
  var pauseResumeBtn = first(['#pauseResumeBtn'], pauseModal || document);
  var pauseAbandonBtn = first(['#pauseAbandonBtn'], pauseModal || document);
  var pauseTabIndicator = first(['#pauseTabIndicator', '.pause-tab-indicator'], pauseModal || document);
  var statFireRate = first(['#statFireRate'], pauseModal || document);
  var statDamage = first(['#statDamage'], pauseModal || document);
  var statCrit = first(['#statCrit'], pauseModal || document);
  var statBallistics = first(['#statBallistics'], pauseModal || document);
  var statSpeed = first(['#statSpeed'], pauseModal || document);
  var statMagnet = first(['#statMagnet'], pauseModal || document);
  var buildPassiveTags = first(['#buildPassiveTags'], pauseModal || document);
  var installedChipsCount = first(['#installedChipsCount'], pauseModal || document);
  var installedChipsList = first(['#installedChipsList'], pauseModal || document);
  var chassisSelector = first(['#chassisSelector'], pauseModal || document);
  var chassisDesc = first(['#chassisDesc'], pauseModal || document);
  var activeFusionsCount = first(['#activeFusionsCount'], pauseModal || document);
  var fusionMatrixList = first(['#fusionMatrixList'], pauseModal || document);
  var touchJoystickZone = first(['#touchJoystickZone'], root || document);
  var joystickBase = first(['#joystickBase'], touchJoystickZone || document);
  var joystickThumb = first(['#joystickThumb'], touchJoystickZone || document);

  initLoadoutPanel();
  initInterludePanel();
  initCodexPanel();

  return {
    root: root,
    canvas: canvas,
    ctx: ctx,
    overlay: overlay,
    optionsNode: optionsNode,
    restart: restart,
    startScreen: startScreen,
    startButton: startButton,
    gameOver: gameOver,
    health: health,
    xp: xp,
    xpMax: xpMax,
    level: level,
    wave: wave,
    score: score,
    kills: kills,
    healthFill: healthFill,
    healthLag: healthLag,
    xpFill: xpFill,
    hudEnergy: hudEnergy,
    meterEnergy: meterEnergy,
    energyFill: energyFill,
    touchSpecial: touchSpecial,
    touchShoot: touchShoot,
    touchDash: touchDash,
    empReady: empReady,
    commsStatus: commsStatus,
    windStatus: windStatus,
    canvasStage: canvasStage,
    newRecordStamp: newRecordStamp,
    telAccuracy: telAccuracy,
    telMaxCombo: telMaxCombo,
    telGrazes: telGrazes,
    telDamage: telDamage,
    combatRankStamp: combatRankStamp,
    combatRankLetter: combatRankLetter,
    combatRankTitle: combatRankTitle,
    runState: runState,
    statusText: statusText,
    best: best,
    finalWave: finalWave,
    finalScore: finalScore,
    finalBest: finalBest,
    objectiveText: objectiveText,
    objectiveProgress: objectiveProgress,
    threatIndex: threatIndex,
    waveTimer: waveTimer,
    runLog: runLog,
    accountSaveBadge: accountSaveBadge,
    audioBtn: audioBtn,
    langBtn: langBtn,
    hudChain: hudChain,
    pauseModal: pauseModal,
    tabBtnSystem: tabBtnSystem,
    tabBtnBuild: tabBtnBuild,
    tabBtnControls: tabBtnControls,
    panelSystem: panelSystem,
    panelBuild: panelBuild,
    panelControls: panelControls,
    settingMasterVolume: settingMasterVolume,
    volumeValue: volumeValue,
    toggleAudioMute: toggleAudioMute,
    toggleHaptics: toggleHaptics,
    toggleMotionReduction: toggleMotionReduction,
    toggleHighContrast: toggleHighContrast,
    settingVisualQuality: settingVisualQuality,
    toggleTips: toggleTips,
    resetTips: resetTips,
    toggleLanguage: toggleLanguage,
    pauseResumeBtn: pauseResumeBtn,
    pauseAbandonBtn: pauseAbandonBtn,
    pauseTabIndicator: pauseTabIndicator,
    statFireRate: statFireRate,
    statDamage: statDamage,
    statCrit: statCrit,
    statBallistics: statBallistics,
    statSpeed: statSpeed,
    statMagnet: statMagnet,
    buildPassiveTags: buildPassiveTags,
    installedChipsCount: installedChipsCount,
    installedChipsList: installedChipsList,
    chassisSelector: chassisSelector,
    chassisDesc: chassisDesc,
    activeFusionsCount: activeFusionsCount,
    fusionMatrixList: fusionMatrixList,
    touchJoystickZone: touchJoystickZone,
    joystickBase: joystickBase,
    joystickThumb: joystickThumb,
    createdCanvas: createdCanvas,
    createdOverlay: createdOverlay,
    width: 960,
    height: 640,
    dpr: 1
  };
}

export function resize() {
  var rect = rt.ui.canvas.getBoundingClientRect();
  var width = Math.max(1, Math.round(rect.width || rt.ui.canvas.clientWidth || rt.ui.canvas.width || window.innerWidth || 960));
  var height = Math.max(1, Math.round(rect.height || rt.ui.canvas.clientHeight || rt.ui.canvas.height || window.innerHeight || 640));
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var changed = width !== rt.ui.width || height !== rt.ui.height;
  if (!changed && dpr === rt.ui.dpr && rt.terrain.length) return;
  rt.ui.width = width;
  rt.ui.height = height;
  rt.ui.dpr = dpr;
  clearSpriteCache();
  rt.ui.canvas.width = Math.round(width * dpr);
  rt.ui.canvas.height = Math.round(height * dpr);
  rt.ui.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (changed || !rt.terrain.length) rebuildTerrain();
  if (!rt.state) return;
  rt.state.width = width;
  rt.state.height = height;
  rt.state.player.x = clamp(rt.state.player.x, rt.state.player.r, width - rt.state.player.r);
  rt.state.player.y = clamp(rt.state.player.y, rt.state.player.r, height - rt.state.player.r);
  fitGameOverOverlay();
}

export function fitGameOverOverlay() {
  var overlay = rt.ui && rt.ui.gameOver;
  var inner;
  var style;
  var availW;
  var availH;
  var scale;
  var key;
  var hiddenCount;
  var i;
  if (!overlay || typeof overlay.querySelector !== 'function' || typeof getComputedStyle !== 'function') return;
  inner = overlay.querySelector('.overlay-inner');
  if (overlay.hidden) {
    gameOverFitKey = '';
    if (overlay.style) overlay.style.placeItems = '';
    if (inner && inner.style && inner.style.transform) inner.style.transform = '';
    return;
  }
  if (!inner || !inner.style) return;
  style = getComputedStyle(overlay);
  availW = overlay.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  availH = overlay.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
  if (!(availW > 8) || !(availH > 8)) return;
  hiddenCount = 0;
  for (i = 0; i < inner.children.length; i += 1) {
    if (inner.children[i].hidden) hiddenCount += 1;
  }
  key = Math.round(availW) + 'x' + Math.round(availH) + ':' + hiddenCount + ':' + inner.childElementCount + ':' + inner.offsetHeight + ':' + (inner.textContent || '').length;
  if (key === gameOverFitKey) return;
  scale = 1;
  if (inner.offsetHeight > availH - 4) scale = Math.min(scale, (availH - 4) / inner.offsetHeight);
  if (inner.offsetWidth > availW - 4) scale = Math.min(scale, (availW - 4) / inner.offsetWidth);
  gameOverFitKey = key;
  if (scale < 0.995) {
    overlay.style.placeItems = 'start center';
    inner.style.transformOrigin = 'top center';
    inner.style.transform = 'scale(' + String(Math.round(scale * 1000) / 1000) + ')';
  } else {
    overlay.style.placeItems = '';
    inner.style.transform = '';
  }
}
