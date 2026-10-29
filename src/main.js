/*
 * DUST//REIGN (Luna: Wasteland Run) entry module.
 * DOM contract: a <canvas id="gameCanvas"> (or .game-canvas / [data-game-canvas])
 * is enough. Optional HUD nodes use #health, #xp, #level, #wave, #score,
 * #healthFill, #xpFill, #gameOver, #restart and #upgradeOverlay.
 * Entry point: window.LunaGame.init(); the module also boots on DOM ready.
 */
import { AudioFX } from './audio/audio-fx.js';
import { rt } from './core/runtime.js';
import { isHighContrast, isReducedMotion } from './core/settings.js';
import { getLanguage, setLanguage, toggleLanguage, syncStaticHtml } from './core/i18n.js';
import { makeState } from './core/state.js';
import { camera, initCamera, updateCamera } from './core/camera.js';
import { FUSION_CHIPS } from './data/upgrades.js';
import { selfCheck } from './dev/self-check.js';
import { pollGamepad } from './input/gamepad.js';
import { bindInput } from './input/keyboard-pointer.js';
import { getPlayroom, loadAccountProgress, saveAccountCheckpoint, saveAccountProgress, startAccountRun } from './platform/playroom.js';
import { exportUnifiedSaveData, importUnifiedSaveData } from './core/meta-store.js';
import { draw } from './render/draw.js';
import { invalidateTerrainPatterns } from './render/terrain.js';
import { sampleFrame } from './render/quality.js';
import { directorStartRun } from './systems/director.js';
import { calculateCombatRank, healStaleLive, restart, triggerGameOver } from './systems/flow.js';
import { applyLoadout } from './systems/meta.js';
import { spawnEnemy } from './systems/spawning.js';
import { update } from './systems/update.js';
import { cycleWeaponMode } from './systems/weapons.js';
import { resize, setupDom, syncCombatLayout } from './ui/dom.js';
import { updateDomUi } from './ui/hud.js';
import { renderBuildInspector, updateSettingsUi } from './ui/pause-menu.js';

var liveStall = { waveTime: -1, sinceMs: 0, ticks: 0 };

function kickFrame() {
  if (!rt.started || typeof window === "undefined" || !window.requestAnimationFrame) return;
  if (rt.raf) {
    try { window.cancelAnimationFrame(rt.raf); } catch (e0) {}
    rt.raf = 0;
  }
  rt.lastTime = 0;
  rt.raf = window.requestAnimationFrame(frame);
}
rt.kickFrame = kickFrame;

function frame(timestamp) {
  if (!rt.started) return;
  // Always re-arm RAF first so a thrown update/draw cannot permanently freeze the tab.
  rt.raf = window.requestAnimationFrame(frame);
  try {
    var rawDt = rt.lastTime ? (timestamp - rt.lastTime) / 1000 : 0;
    var dt = rawDt > 0 ? Math.min(0.05, rawDt) : 0;
    rt.lastTime = timestamp;
    rt.renderDt = dt;
    rt.renderTime += dt;
    sampleFrame(dt);
    pollGamepad(dt);
    update(dt);
    draw();
    // Multi-tab / unclean reopen: LIVE chrome can stall (score/energy stuck, pause dead).
    if (rt.state && rt.ui && !(rt.ui.startScreen && !rt.ui.startScreen.hidden) && !rt.state.over && !rt.state.paused) {
      var wt = rt.state.waveTime || 0;
      var now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (Math.abs(wt - liveStall.waveTime) > 0.0001) {
        liveStall.waveTime = wt;
        liveStall.sinceMs = now;
        liveStall.ticks = 0;
      } else {
        liveStall.ticks += 1;
        if (!liveStall.sinceMs) liveStall.sinceMs = now;
        if ((now - liveStall.sinceMs) > 2500 && liveStall.ticks > 30) {
          liveStall.sinceMs = now;
          liveStall.ticks = 0;
          try {
            if (typeof rt.healStaleLive === "function") rt.healStaleLive();
          } catch (eHeal) {}
        }
      }
    } else {
      liveStall.waveTime = -1;
      liveStall.sinceMs = 0;
      liveStall.ticks = 0;
    }
  } catch (err) {
    try { if (typeof console !== "undefined" && console.warn) console.warn("[DUST-REIGN] frame error", err); } catch (e1) {}
    // Keep lastTime advancing so deathSequenceTimer can finish even if draw throws every frame.
    if (timestamp) rt.lastTime = timestamp;
    else rt.lastTime = 0;
  }
}

function init(options) {
  if (rt.started) return api;
  if (typeof document === 'undefined') return api;
  rt.ui = setupDom(options);
  if (document.documentElement) {
    document.documentElement.classList.toggle('reduced-motion', isReducedMotion());
  }
  if (rt.ui && rt.ui.root) {
    rt.ui.root.classList.toggle('is-high-contrast', isHighContrast());
  }
  syncStaticHtml(getLanguage());
  updateSettingsUi();
  syncCombatLayout();
  rt.camera = camera;
  resize();
  rt.state = makeState();
  initCamera(camera, rt.state.width, rt.state.height, rt.ui.width, rt.ui.height);
  applyLoadout(rt.state);
  directorStartRun(rt.state);
  rt.state.paused = Boolean(rt.ui.startScreen && !rt.ui.startScreen.hidden);
  if (!rt.state.paused) rt.accountRun = startAccountRun();
  rt.input.mouse.x = rt.state.player.x + 100;
  rt.input.mouse.y = rt.state.player.y;
  bindInput();
  rt.started = true;
  rt.healStaleLive = healStaleLive;
  rt.kickFrame = kickFrame;
  for (var i = 0; i < 3; i += 1) spawnEnemy();
  updateDomUi();
  draw();
  rt.raf = window.requestAnimationFrame(frame);

  var visibilityAutoPaused = false;
  var onVisibilityChange = function () {
    var onStart = !!(rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden);
    if (document.hidden) {
      // Silent auto-pause only when LIVE (not already paused / dead / on loadout).
      if (rt.state && !rt.state.over && !rt.state.paused && !onStart) {
        visibilityAutoPaused = true;
        pause();
      } else {
        visibilityAutoPaused = false;
      }
      return;
    }
    // Browser may drop/zero the canvas while backgrounded; rebuild size + ground and redraw.
    try { resize(); } catch (e0) {}
    try { invalidateTerrainPatterns(); } catch (e1) {}
    rt.lastTime = 0;
    try { draw(); } catch (e2) {}
    // Loadout / start screen: never resume a phantom run or force GO over the menu.
    if (onStart) {
      visibilityAutoPaused = false;
      if (rt.state) {
        rt.state.paused = true;
        // Zero-effort phantom settle behind menu — fold GO chrome back under standby.
        if (rt.state.over && !(rt.state.wave > 1 || (rt.state.score | 0) > 0 || (rt.state.kills | 0) > 0)) {
          rt.state.over = false;
          rt.state.deathCause = null;
          rt.state.deathSequenceTimer = 0;
          if (rt.state.player && rt.state.player.maxHp) rt.state.player.hp = rt.state.player.maxHp;
          if (rt.ui && rt.ui.gameOver) rt.ui.gameOver.hidden = true;
        }
      }
      try { updateDomUi(); } catch (eStart) {}
    } else if (rt.state && rt.state.over) {
      // Death hard-freeze: force result card without needing R / full reload.
      rt.state.paused = false;
      rt.state.deathSequenceTimer = 0;
      if (rt.ui && rt.ui.gameOver) rt.ui.gameOver.hidden = false;
      if (rt.ui && rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = !rt.state.isNewRecord;
      if (rt.ui && rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = false;
      try { updateDomUi(); } catch (eOver) {}
    } else if (visibilityAutoPaused) {
      visibilityAutoPaused = false;
      try { resume(); } catch (eRes) {}
    } else if (rt.state && rt.state.paused) {
      // Second-tab silent pause left paused=true with no pause modal — return to LIVE.
      var modal = rt.ui && rt.ui.pauseModal;
      var upgrading = rt.state.upgradeChoices && rt.state.upgradeChoices.length;
      var modalOpen = modal && !modal.hidden;
      if (!upgrading && !modalOpen) {
        try { resume(); } catch (eRes2) {}
      }
    }
    // Multi-tab unclean return: RAF or LIVE chrome can be wedged until hard reload.
    try { if (typeof healStaleLive === "function") healStaleLive(); } catch (e3) {}
    try { kickFrame(); } catch (e4) {}
  };
document.addEventListener('visibilitychange', onVisibilityChange);
  rt.listeners.push(function () {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  // Asynchronously sync cloud save progress
  loadAccountProgress().then(function (res) {
    if (res && res.data) {
      importUnifiedSaveData(res.data);
      if (rt.state) applyLoadout(rt.state);
      updateDomUi();
      updateSettingsUi();
    }
  }).catch(function () {
    // Non-blocking offline fallback
  });

  return api;
}

function pause() {
  if (rt.state && !rt.state.over) { rt.state.paused = true; updateDomUi(); }
}

function resume() {
  // Standby / loadout is not an active run — never unpause behind the start screen.
  if (rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden) return;
  if (rt.state && !rt.state.over && !(rt.state.upgradeChoices && rt.state.upgradeChoices.length)) { rt.state.paused = false; updateDomUi(); }
}

function destroy() {
  rt.started = false;
  rt.accountRun = null;
  rt.accountRunSaved = false;
  if (rt.raf) window.cancelAnimationFrame(rt.raf);
  rt.raf = 0;
  rt.listeners.splice(0).forEach(function (remove) { remove(); });
  if (rt.resizeObserver) rt.resizeObserver.disconnect();
  rt.resizeObserver = null;
  rt.firePointers.clear();
  rt.input.keys.clear();
  rt.input.mouse.down = false;
  if (rt.ui && rt.ui.createdOverlay && rt.ui.overlay.parentNode) rt.ui.overlay.parentNode.removeChild(rt.ui.overlay);
  if (rt.ui && rt.ui.createdCanvas && rt.ui.canvas.parentNode) rt.ui.canvas.parentNode.removeChild(rt.ui.canvas);
  if (rt.ui && rt.ui.gameLayout && rt.ui.gameLayout.classList) {
    rt.ui.gameLayout.classList.remove('is-in-combat');
    rt.ui.gameLayout.removeAttribute('data-run-state');
  }
  if (rt.ui && rt.ui.gameFrame && rt.ui.gameFrame.classList) {
    rt.ui.gameFrame.classList.remove('is-in-combat');
    rt.ui.gameFrame.removeAttribute('data-run-state');
  }
  if (rt.ui && rt.ui.root && rt.ui.root.removeAttribute) rt.ui.root.removeAttribute('data-run-state');
  rt.ui = null;
  rt.state = null;
  rt.camera = null;
}

var api = {
  init: init,
  restart: restart,
  pause: pause,
  resume: resume,
  destroy: destroy,
  cycleWeaponMode: cycleWeaponMode,
  renderBuildInspector: renderBuildInspector,
  calculateCombatRank: calculateCombatRank,
  getState: function () { return rt.state; },
  getCamera: function () { return rt.camera || camera; },
  getPlayroom: getPlayroom,
  loadAccountProgress: loadAccountProgress,
  saveAccountProgress: saveAccountProgress,
  saveAccountCheckpoint: saveAccountCheckpoint,
  exportUnifiedSaveData: exportUnifiedSaveData,
  importUnifiedSaveData: importUnifiedSaveData,
  getAudio: function () { return AudioFX; },
  getFusionChips: function () { return FUSION_CHIPS; },
  getLanguage: getLanguage,
  setLanguage: setLanguage,
  toggleLanguage: toggleLanguage,
  triggerGameOver: triggerGameOver,
  selfCheck: selfCheck
};

if (typeof window !== 'undefined') {
  window.LunaGame = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); }, { once: true });
  else window.setTimeout(function () { init(); }, 0);
} else {
  globalThis.LunaGame = api;
}

export { api };
