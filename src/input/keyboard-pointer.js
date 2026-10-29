import { AudioFX } from '../audio/audio-fx.js';
import { rt } from '../core/runtime.js';
import { isHapticsEnabled, isHighContrast, isReducedMotion, setHapticsEnabled, setHighContrast, setMotionReduction, cycleVisualQuality } from '../core/settings.js';
import { clamp, on } from '../core/utils.js';
import { dash, triggerEmp } from '../systems/abilities.js';
import { triggerTacticalAuxiliary } from '../systems/tactical.js';
import { doubleDownCurrentContract } from '../systems/contracts.js';
import { beginRun, restart, togglePause } from '../systems/flow.js';
import { isCodexOpen } from '../ui/codex-panel.js';
import { chooseUpgrade } from '../systems/progression.js';
import { resize } from '../ui/dom.js';
import { logEvent } from '../ui/hud.js';
import { getCurrentPauseTab, handleAbandonClick, switchPauseTab, updateAudioBtn, updateSettingsUi } from '../ui/pause-menu.js';
import { readTipsEnabled, resetTipsSeen, writeTipsEnabled } from '../core/meta-store.js';
import { setLanguage, toggleLanguage } from '../core/i18n.js';
import { onTipsReset, updateTips } from '../ui/tips.js';
import { screenToWorld } from '../core/camera.js';

export var cachedCanvasRect = { left: 0, top: 0, width: 1, height: 1 };

export function updateCanvasRect() {
  if (!rt.ui || !rt.ui.canvas || typeof rt.ui.canvas.getBoundingClientRect !== 'function') return;
  var rect = rt.ui.canvas.getBoundingClientRect();
  if (rect.width && rect.height) {
    cachedCanvasRect.left = rect.left;
    cachedCanvasRect.top = rect.top;
    cachedCanvasRect.width = rect.width;
    cachedCanvasRect.height = rect.height;
  }
}

function pointerPosition(event) {
  if (!cachedCanvasRect.width || !cachedCanvasRect.height || cachedCanvasRect.width <= 1) {
    updateCanvasRect();
    if (!cachedCanvasRect.width || !cachedCanvasRect.height) return;
  }
  var sx = (event.clientX - cachedCanvasRect.left) * (rt.ui.width / cachedCanvasRect.width);
  var sy = (event.clientY - cachedCanvasRect.top) * (rt.ui.height / cachedCanvasRect.height);
  rt.input.mouse.sx = sx;
  rt.input.mouse.sy = sy;
  if (rt.camera) {
    screenToWorld(sx, sy, rt.camera, rt.input.mouse);
  } else {
    var camX = (rt.state && rt.state.player ? rt.state.player.x : ((rt.state && rt.state.width) || 3520) * 0.5);
    var camY = (rt.state && rt.state.player ? rt.state.player.y : ((rt.state && rt.state.height) || 2640) * 0.5);
    var viewW = (rt.ui && rt.ui.width) || 960;
    var viewH = (rt.ui && rt.ui.height) || 640;
    rt.input.mouse.x = sx + (camX - viewW * 0.5);
    rt.input.mouse.y = sy + (camY - viewH * 0.5);
  }
  var p = rt.state && rt.state.player;
  if (p) {
    p.aimX = rt.input.mouse.x;
    p.aimY = rt.input.mouse.y;
    var dx = p.aimX - p.x;
    var dy = p.aimY - p.y;
    if (dx || dy) p.aim = Math.atan2(dy, dx);
  }
}

export function bindInput() {
  on(window, 'pointerdown', AudioFX.unlock, { passive: true });
  on(window, 'keydown', AudioFX.unlock, { passive: true });
  on(window, 'keydown', function (event) {
    var key = event.key.toLowerCase();
    var activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    var isFormInput = Boolean(activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'SELECT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    ));

    var isFormNavKey = isFormInput && (
      key === 'arrowleft' || key === 'arrowright' ||
      key === 'arrowup' || key === 'arrowdown' ||
      key === ' '
    );

    if (!isFormNavKey && (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright' || key === ' ' || key === 'q' || key === 'e' || key === 'f' || key === 't' || key === 'h')) {
      event.preventDefault();
    }
    rt.input.keys.add(key);
    if (key === ' ' && !event.repeat) {
      if (!rt.state || !rt.state.paused) dash();
    }
    if (key === 'shift' && !event.repeat && !isFormInput) {
      if (!rt.state || !rt.state.paused) dash();
    }
    if (key === 'q' && !event.repeat) {
      if (!rt.state || !rt.state.paused) triggerEmp();
    }
    if ((key === 'e' || key === 'f') && !event.repeat) {
      if (!rt.state || !rt.state.paused) triggerTacticalAuxiliary();
    }
    if (key === 'h' && !event.repeat) {
      if (!rt.state || !rt.state.paused) {
        if (typeof doubleDownCurrentContract === 'function') doubleDownCurrentContract();
      }
    }
    if (key === 'm' && !event.repeat) { AudioFX.toggleMute(); updateAudioBtn(); }
    if ((key === 'p' || key === 'escape') && !event.repeat && !(rt.state && rt.state.banishPicking)) togglePause();
    if (rt.state && rt.state.paused && rt.ui.startScreen && !rt.ui.startScreen.hidden && key === 'enter' && !event.repeat) {
      var enterTarget = event.target;
      var typingLoadout = enterTarget && enterTarget.closest && enterTarget.closest('#loadoutPanel') && enterTarget.id !== 'startBtn';
      if (!typingLoadout && !isCodexOpen()) beginRun();
    }
    if (rt.state && rt.state.over && key === 'r') restart();
    if (rt.state && rt.state.paused && (key === '1' || key === '2' || key === '3')) {
      if (rt.state.upgradeChoices && rt.state.upgradeChoices.length > 0) {
        chooseUpgrade(Number(key) - 1);
      }
    }
    if (rt.state && rt.state.paused && rt.ui && rt.ui.pauseModal && !rt.ui.pauseModal.hidden) {
      if (!isFormInput && (key === 'arrowleft' || key === 'arrowright')) {
        var tabOrder = ['system', 'build', 'controls'];
        var curIdx = tabOrder.indexOf(getCurrentPauseTab());
        var nextIdx = key === 'arrowleft' ? (curIdx - 1 + tabOrder.length) % tabOrder.length : (curIdx + 1) % tabOrder.length;
        switchPauseTab(tabOrder[nextIdx]);
      }
    }
  });
  updateCanvasRect();
  on(window, 'resize', updateCanvasRect, { passive: true });
  on(window, 'scroll', updateCanvasRect, { passive: true });
  on(window, 'keyup', function (event) { rt.input.keys.delete(event.key.toLowerCase()); });
  on(rt.ui.canvas, 'contextmenu', function (event) { event.preventDefault(); });
  on(rt.ui.canvas, 'pointermove', pointerPosition);
  on(rt.ui.canvas, 'pointerdown', function (event) {
    updateCanvasRect();
    pointerPosition(event);
    if (rt.ui.canvas.focus) rt.ui.canvas.focus();
    if (rt.state && rt.state.over) { restart(); return; }
    if (event.button === 2) {
      event.preventDefault();
      if (!rt.state || !rt.state.paused) triggerEmp();
      return;
    }
    if (event.button === undefined || event.button === 0) {
      rt.firePointers.add(event.pointerId);
      rt.input.mouse.down = true;
    }
    if (rt.ui.canvas.setPointerCapture && event.pointerId !== undefined) rt.ui.canvas.setPointerCapture(event.pointerId);
  });
  function releaseFire(event) {
    if (event && event.pointerId !== undefined) {
      rt.firePointers.delete(event.pointerId);
    }
    rt.input.mouse.down = rt.firePointers.size > 0 || Boolean(rt.input.gamepadFiring);
  }
  on(window, 'pointerup', releaseFire);
  on(window, 'pointercancel', releaseFire);
  on(window, 'blur', function () {
    rt.input.keys.clear();
    rt.firePointers.clear();
    rt.input.gamepadFiring = false;
    rt.input.mouse.down = false;
    rt.input.gamepadX = 0;
    rt.input.gamepadY = 0;
  });
  on(window, 'gamepadconnected', function (e) {
    rt.gamepadState.connected = true;
    logEvent('GAMEPAD ONLINE // ' + (e.gamepad && e.gamepad.id ? e.gamepad.id.slice(0, 20) : 'DEVICE'));
  });
  on(window, 'gamepaddisconnected', function () {
    rt.gamepadState.connected = false;
    rt.input.gamepadX = 0;
    rt.input.gamepadY = 0;
    logEvent('GAMEPAD OFFLINE');
  });
  on(window, 'resize', resize);
  if (window.ResizeObserver) {
    rt.resizeObserver = new ResizeObserver(resize);
    rt.resizeObserver.observe(rt.ui.canvas);
  }
  var pauseButton = document.getElementById('pauseBtn');
  if (pauseButton) on(pauseButton, 'click', togglePause);
  if (rt.ui.audioBtn) on(rt.ui.audioBtn, 'click', function () { AudioFX.toggleMute(); updateAudioBtn(); });
  if (rt.ui.langBtn) {
    on(rt.ui.langBtn, 'click', function (event) {
      var target = event && event.target;
      var opt = target && ((target.classList && target.classList.contains('lang-opt')) ? target : (target.closest && target.closest('.lang-opt')));
      if (opt && opt.textContent) {
        var txt = opt.textContent.trim();
        if (txt === 'ENG') { setLanguage('en'); return; }
        if (txt === '繁中') { setLanguage('zh'); return; }
      }
      toggleLanguage();
    });
  }
  if (rt.ui.restart) on(rt.ui.restart, 'click', restart);
  if (rt.ui.startButton) on(rt.ui.startButton, 'click', beginRun);

  if (rt.ui.tabBtnSystem) on(rt.ui.tabBtnSystem, 'click', function () { switchPauseTab('system'); });
  if (rt.ui.tabBtnBuild) on(rt.ui.tabBtnBuild, 'click', function () { switchPauseTab('build'); });
  if (rt.ui.tabBtnControls) on(rt.ui.tabBtnControls, 'click', function () { switchPauseTab('controls'); });
  if (rt.ui.settingMasterVolume) {
    on(rt.ui.settingMasterVolume, 'input', function (event) {
      var val = Number(event.target.value);
      AudioFX.setMasterVolume(val);
      if (rt.ui.volumeValue) rt.ui.volumeValue.textContent = val + '%';
    });
  }
  if (rt.ui.toggleAudioMute) on(rt.ui.toggleAudioMute, 'click', function () { AudioFX.toggleMute(); updateAudioBtn(); });
  if (rt.ui.toggleHaptics) on(rt.ui.toggleHaptics, 'click', function () { setHapticsEnabled(!isHapticsEnabled()); updateSettingsUi(); });
  if (rt.ui.toggleMotionReduction) on(rt.ui.toggleMotionReduction, 'click', function () { setMotionReduction(!isReducedMotion()); updateSettingsUi(); });
  if (rt.ui.toggleHighContrast) on(rt.ui.toggleHighContrast, 'click', function () { setHighContrast(!isHighContrast()); updateSettingsUi(); });
  if (rt.ui.settingVisualQuality) on(rt.ui.settingVisualQuality, 'click', function () { cycleVisualQuality(); updateSettingsUi(); });
  if (rt.ui.toggleTips) {
    on(rt.ui.toggleTips, 'click', function () {
      writeTipsEnabled(!readTipsEnabled());
      updateTips();
      updateSettingsUi();
    });
  }
  if (rt.ui.resetTips) {
    on(rt.ui.resetTips, 'click', function () {
      resetTipsSeen();
      onTipsReset();
      updateSettingsUi();
    });
  }
  if (rt.ui.toggleLanguage) on(rt.ui.toggleLanguage, 'click', function () { toggleLanguage(); });
  if (rt.ui.pauseResumeBtn) on(rt.ui.pauseResumeBtn, 'click', togglePause);
  if (rt.ui.pauseAbandonBtn) on(rt.ui.pauseAbandonBtn, 'click', handleAbandonClick);

}
