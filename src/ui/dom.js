import { isChinese } from '../core/i18n.js';
import { rt } from '../core/runtime.js';
import { clamp, first, on } from '../core/utils.js';
import { clearSpriteCache } from '../render/sprites.js';
import { getQuality } from '../render/quality.js';
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
    canvas.setAttribute('aria-label', isChinese() ? '廢土戰鬥區' : 'Wasteland combat arena');
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
  function byId(id, scope) {
    return (typeof document !== 'undefined' && document.getElementById(id)) || (scope && scope.querySelector ? scope.querySelector('#' + id) : null);
  }
  var tabBtnSystem = byId('tabBtnSystem', pauseModal);
  var tabBtnBuild = byId('tabBtnBuild', pauseModal);
  var tabBtnControls = byId('tabBtnControls', pauseModal);
  var panelSystem = byId('panelSystem', pauseModal);
  var panelBuild = byId('panelBuild', pauseModal);
  var panelControls = byId('panelControls', pauseModal);
  var settingMasterVolume = byId('settingMasterVolume', pauseModal);
  var volumeValue = byId('volumeValue', pauseModal);
  var toggleAudioMute = byId('toggleAudioMute', pauseModal);
  var toggleHaptics = byId('toggleHaptics', pauseModal);
  var toggleMotionReduction = byId('toggleMotionReduction', pauseModal);
  var toggleHighContrast = byId('toggleHighContrast', pauseModal);
  var settingVisualQuality = byId('settingVisualQuality', pauseModal);
  var toggleTips = byId('toggleTips', pauseModal);
  var resetTips = byId('resetTips', pauseModal);
  var toggleLanguage = byId('toggleLanguage', pauseModal);
  var pauseResumeBtn = byId('pauseResumeBtn', pauseModal);
  var pauseAbandonBtn = byId('pauseAbandonBtn', pauseModal);
  var pauseTabIndicator = byId('pauseTabIndicator', pauseModal);
  var statFireRate = byId('statFireRate', pauseModal);
  var statDamage = byId('statDamage', pauseModal);
  var statCrit = byId('statCrit', pauseModal);
  var statBallistics = byId('statBallistics', pauseModal);
  var statSpeed = byId('statSpeed', pauseModal);
  var statMagnet = byId('statMagnet', pauseModal);
  var buildPassiveTags = byId('buildPassiveTags', pauseModal);
  var installedChipsCount = byId('installedChipsCount', pauseModal);
  var installedChipsList = byId('installedChipsList', pauseModal);
  var chassisSelector = byId('chassisSelector', pauseModal);
  var chassisDesc = byId('chassisDesc', pauseModal);
  var activeFusionsCount = byId('activeFusionsCount', pauseModal);
  var fusionMatrixList = byId('fusionMatrixList', pauseModal);
  var gameFrame = first(['.game-frame', '[data-game-frame]'], root || document);
  var gameLayout = first(['.game-layout', 'main.game-layout'], root || document);
  var missionRail = first(['.mission-rail', 'aside.mission-rail'], root || document);

  initLoadoutPanel();
  initInterludePanel();
  initCodexPanel();

  return {
    root: root,
    gameFrame: gameFrame,
    gameLayout: gameLayout,
    layout: gameLayout,
    missionRail: missionRail,
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
    createdCanvas: createdCanvas,
    createdOverlay: createdOverlay,
    width: 960,
    height: 640,
    dpr: 1
  };
}

export function syncCombatLayout() {
  if (typeof document === 'undefined' || !rt.ui) return false;
  var onStart = Boolean(rt.ui.startScreen && !rt.ui.startScreen.hidden);
  var isOver = Boolean(rt.state && rt.state.over && (rt.state.deathSequenceTimer <= 0 || (rt.ui.gameOver && !rt.ui.gameOver.hidden)));
  var inCombat = Boolean(rt.state && !onStart && !isOver);
  var layout = rt.ui.gameLayout || rt.ui.layout || (rt.ui.root ? rt.ui.root.querySelector('.game-layout') : null) || document.querySelector('.game-layout');
  var frame = rt.ui.gameFrame || (rt.ui.root ? rt.ui.root.querySelector('.game-frame') : null) || document.querySelector('.game-frame');
  var changed = false;
  var nextState = inCombat ? 'LIVE' : (onStart ? 'STANDBY' : 'GAMEOVER');

  if (layout && layout.classList) {
    var wasInCombat = layout.classList.contains('is-in-combat');
    if (wasInCombat !== inCombat) {
      layout.classList.toggle('is-in-combat', inCombat);
      changed = true;
    }
    if (layout.getAttribute && layout.getAttribute('data-run-state') !== nextState) {
      layout.setAttribute('data-run-state', nextState);
    }
  }

  if (frame && frame.classList) {
    var frameWasInCombat = frame.classList.contains('is-in-combat');
    if (frameWasInCombat !== inCombat) {
      frame.classList.toggle('is-in-combat', inCombat);
      changed = true;
    }
    if (frame.getAttribute && frame.getAttribute('data-run-state') !== nextState) {
      frame.setAttribute('data-run-state', nextState);
    }
  }

  // The outer shell (page padding, title bar, footers) collapses while LIVE; see css/base.css.
  var root = rt.ui.root;
  if (root && root.getAttribute && root.getAttribute('data-run-state') !== nextState) {
    root.setAttribute('data-run-state', nextState);
    changed = true;
  }

  if (changed && rt.ui.canvas) {
    resize();
  }
  return inCombat;
}

export function resize() {
  if (!rt.ui || !rt.ui.canvas) return;
  var rect = rt.ui.canvas.getBoundingClientRect ? rt.ui.canvas.getBoundingClientRect() : {};
  var winW = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : 960;
  var winH = (typeof window !== "undefined" && window.innerHeight) ? window.innerHeight : 640;
  var width = Math.max(1, Math.round(rect.width || rt.ui.canvas.clientWidth || rt.ui.canvas.width || winW || 960));
  var height = Math.max(1, Math.round(rect.height || rt.ui.canvas.clientHeight || rt.ui.canvas.height || winH || 640));
  // Tab-hide / collapsed layout can report a tiny rect; rewriting the backing store to that
  // blanks the combat view (HUD DOM still lives). Keep the last good size until we are visible.
  var hidden = (typeof document !== 'undefined' && document.hidden);
  var prevW = rt.ui.width || 0;
  var prevH = rt.ui.height || 0;
  if ((hidden || width < 64 || height < 64) && prevW >= 64 && prevH >= 64 && (width < 64 || height < 64 || width * height < prevW * prevH * 0.25)) {
    width = prevW;
    height = prevH;
  }

  var q = 'high';
  try { q = getQuality(); } catch (e) {}
  var maxDpr = q === 'low' ? 1.0 : (q === 'medium' ? 1.5 : 2.0);

  var rawDpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  var dpr = Math.min(maxDpr, Math.max(1, rawDpr));
  dpr = Math.round(dpr * 100) / 100;

  var changed = width !== rt.ui.width || height !== rt.ui.height;
  if (!changed && dpr === rt.ui.dpr && rt.terrain.length) return;
  rt.ui.width = width;
  rt.ui.height = height;
  rt.ui.dpr = dpr;
  if (rt.camera) {
    rt.camera.viewW = width;
    rt.camera.viewH = height;
    rt.camera.dpr = dpr;
  }
  clearSpriteCache();
  rt.ui.canvas.width = Math.round(width * dpr);
  rt.ui.canvas.height = Math.round(height * dpr);
  if (rt.ui.ctx && rt.ui.ctx.setTransform) rt.ui.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Resizing the backing store resets context state; scaled sprites and the lightmap need high-quality filtering.
  if (rt.ui.ctx) rt.ui.ctx.imageSmoothingQuality = 'high';
  if (changed || !rt.terrain.length) rebuildTerrain();
  if (!rt.state) return;
  if (!rt.camera) {
    rt.state.width = width;
    rt.state.height = height;
    if (rt.state.player) {
      rt.state.player.x = clamp(rt.state.player.x, rt.state.player.r || 14, width - (rt.state.player.r || 14));
      rt.state.player.y = clamp(rt.state.player.y, rt.state.player.r || 14, height - (rt.state.player.r || 14));
    }
  } else if (rt.state.player) {
    var bw = rt.state.width || 3520;
    var bh = rt.state.height || 2640;
    rt.state.player.x = clamp(rt.state.player.x, rt.state.player.r || 14, bw - (rt.state.player.r || 14));
    rt.state.player.y = clamp(rt.state.player.y, rt.state.player.r || 14, bh - (rt.state.player.r || 14));
  }
  fitGameOverOverlay();
}

export function fitGameOverOverlay() {
  var overlay = rt.ui && rt.ui.gameOver;
  if (!overlay || overlay.hidden) {
    if (gameOverFitKey !== '') {
      gameOverFitKey = '';
      if (overlay && overlay.style) overlay.style.placeItems = '';
      var prevInner = overlay && overlay.querySelector ? overlay.querySelector('.overlay-inner') : null;
      if (prevInner && prevInner.style && prevInner.style.transform) prevInner.style.transform = '';
    }
    return;
  }
  if (typeof overlay.querySelector !== 'function' || typeof getComputedStyle !== 'function') return;
  var inner = overlay.querySelector('.overlay-inner');
  if (!inner || !inner.style) return;
  var style = getComputedStyle(overlay);
  var availW = overlay.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  var availH = overlay.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
  if (!(availW > 8) || !(availH > 8)) return;
  var hiddenCount = 0;
  for (var i = 0; i < inner.children.length; i += 1) {
    if (inner.children[i].hidden) hiddenCount += 1;
  }
  var key = Math.round(availW) + 'x' + Math.round(availH) + ':' + hiddenCount + ':' + inner.childElementCount + ':' + inner.offsetHeight + ':' + (inner.textContent || '').length;
  if (key === gameOverFitKey) return;
  var scale = 1;
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
