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
import { makeState } from './core/state.js';
import { FUSION_CHIPS } from './data/upgrades.js';
import { selfCheck } from './dev/self-check.js';
import { pollGamepad } from './input/gamepad.js';
import { bindInput } from './input/keyboard-pointer.js';
import { getPlayroom, startAccountRun } from './platform/playroom.js';
import { draw } from './render/draw.js';
import { sampleFrame } from './render/quality.js';
import { calculateCombatRank, restart, triggerGameOver } from './systems/flow.js';
import { spawnEnemy } from './systems/spawning.js';
import { update } from './systems/update.js';
import { cycleWeaponMode } from './systems/weapons.js';
import { resize, setupDom } from './ui/dom.js';
import { updateDomUi } from './ui/hud.js';
import { renderBuildInspector, updateSettingsUi } from './ui/pause-menu.js';

function frame(timestamp) {
  if (!rt.started) return;
  var rawDt = rt.lastTime ? (timestamp - rt.lastTime) / 1000 : 0;
  var dt = rawDt > 0 ? Math.min(0.05, rawDt) : 0;
  rt.lastTime = timestamp;
  rt.renderDt = dt;
  rt.renderTime += dt;
  sampleFrame(dt);
  pollGamepad(dt);
  update(dt);
  draw();
  rt.raf = window.requestAnimationFrame(frame);
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
  updateSettingsUi();
  rt.state = makeState(960, 640);
  resize();
  rt.state = makeState(rt.ui.width, rt.ui.height);
  rt.state.paused = Boolean(rt.ui.startScreen && !rt.ui.startScreen.hidden);
  if (!rt.state.paused) rt.accountRun = startAccountRun();
  rt.input.mouse.x = rt.ui.width / 2 + 100;
  rt.input.mouse.y = rt.ui.height / 2;
  bindInput();
  rt.started = true;
  for (var i = 0; i < 3; i += 1) spawnEnemy();
  updateDomUi();
  draw();
  rt.raf = window.requestAnimationFrame(frame);
  return api;
}

function pause() {
  if (rt.state && !rt.state.over) { rt.state.paused = true; updateDomUi(); }
}

function resume() {
  if (rt.state && !rt.state.over && !rt.state.upgradeChoices.length) { rt.state.paused = false; updateDomUi(); }
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
  rt.ui = null;
  rt.state = null;
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
  getPlayroom: getPlayroom,
  getAudio: function () { return AudioFX; },
  getFusionChips: function () { return FUSION_CHIPS; },
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
