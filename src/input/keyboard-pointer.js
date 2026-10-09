import { AudioFX } from '../audio/audio-fx.js';
import { rt } from '../core/runtime.js';
import { isHapticsEnabled, isHighContrast, isReducedMotion, setHapticsEnabled, setHighContrast, setMotionReduction, cycleVisualQuality } from '../core/settings.js';
import { clamp, on } from '../core/utils.js';
import { dash, triggerEmp } from '../systems/abilities.js';
import { beginRun, restart, togglePause } from '../systems/flow.js';
import { isCodexOpen } from '../ui/codex-panel.js';
import { chooseUpgrade } from '../systems/progression.js';
import { resize } from '../ui/dom.js';
import { logEvent } from '../ui/hud.js';
import { getCurrentPauseTab, handleAbandonClick, switchPauseTab, updateAudioBtn, updateSettingsUi } from '../ui/pause-menu.js';
import { readTipsEnabled, resetTipsSeen, writeTipsEnabled } from '../core/meta-store.js';
import { setLanguage, toggleLanguage } from '../core/i18n.js';
import { onTipsReset, updateTips } from '../ui/tips.js';

function pointerPosition(event) {
  var rect = rt.ui.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  rt.input.mouse.x = (event.clientX - rect.left) * (rt.ui.width / rect.width);
  rt.input.mouse.y = (event.clientY - rect.top) * (rt.ui.height / rect.height);
  if (event && event.pointerType === 'mouse') rt.input.touchMode = false;
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

    if (!isFormNavKey && (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright' || key === ' ' || key === 'q' || key === 'e' || key === 't')) {
      event.preventDefault();
    }
    rt.input.keys.add(key);
    if (key === ' ' && !event.repeat) {
      if (!rt.state || !rt.state.paused) dash();
    }
    if (key === 'shift' && !event.repeat && !isFormInput) {
      if (!rt.state || !rt.state.paused) dash();
    }
    if ((key === 'q' || key === 'e') && !event.repeat) {
      if (!rt.state || !rt.state.paused) triggerEmp();
    }
    if (key === 'm' && !event.repeat) { AudioFX.toggleMute(); updateAudioBtn(); }
    if ((key === 'p' || key === 'escape') && !event.repeat && !(rt.state && rt.state.banishPicking)) togglePause();
    if (rt.state && rt.state.paused && rt.ui.startScreen && !rt.ui.startScreen.hidden && key === 'enter' && !event.repeat) {
      var enterTarget = event.target;
      var typingLoadout = enterTarget && enterTarget.closest && enterTarget.closest('#loadoutPanel') && enterTarget.id !== 'startBtn';
      if (!typingLoadout && !isCodexOpen()) beginRun();
    }
    if (rt.state && rt.state.over && rt.state.deathSequenceTimer <= 0 && key === 'r') restart();
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
  on(window, 'keyup', function (event) { rt.input.keys.delete(event.key.toLowerCase()); });
  on(rt.ui.canvas, 'contextmenu', function (event) { event.preventDefault(); });
  on(rt.ui.canvas, 'pointermove', pointerPosition);
  on(rt.ui.canvas, 'pointerdown', function (event) {
    pointerPosition(event);
    if (event.pointerType === 'touch') rt.input.touchMode = true;
    else if (event.pointerType === 'mouse') rt.input.touchMode = false;
    if (rt.ui.canvas.focus) rt.ui.canvas.focus();
    if (rt.state && rt.state.over) { if (rt.state.deathSequenceTimer <= 0) restart(); return; }
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
  var touchFireIds = new Set();
  function releaseFire(event) {
    if (event && event.pointerId !== undefined) {
      rt.firePointers.delete(event.pointerId);
      touchFireIds.delete(event.pointerId);
    }
    rt.input.touchFiring = touchFireIds.size > 0;
    rt.input.mouse.down = rt.firePointers.size > 0 || Boolean(rt.input.gamepadFiring);
  }
  on(window, 'pointerup', releaseFire);
  on(window, 'pointercancel', releaseFire);
  on(window, 'blur', function () {
    rt.input.keys.clear();
    rt.firePointers.clear();
    touchFireIds.clear();
    rt.input.touchFiring = false;
    rt.input.gamepadFiring = false;
    rt.input.mouse.down = false;
    rt.input.gamepadX = 0;
    rt.input.gamepadY = 0;
    cancelEmpDrag();
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

  // Dynamic Floating Analog Joystick
  var joystickZone = (rt.ui && rt.ui.touchJoystickZone) || document.getElementById('touchJoystickZone');
  var joystickBase = (rt.ui && rt.ui.joystickBase) || document.getElementById('joystickBase');
  var joystickThumb = (rt.ui && rt.ui.joystickThumb) || document.getElementById('joystickThumb');
  if (joystickZone && joystickBase && joystickThumb) {
    var activePointerId = null;
    var originX = 0;
    var originY = 0;
    var maxRadius = 48;

    function resetJoystick() {
      activePointerId = null;
      rt.input.gamepadX = 0;
      rt.input.gamepadY = 0;
      joystickBase.classList.remove('is-active');
      joystickBase.style.left = '50%';
      joystickBase.style.top = '50%';
      joystickThumb.style.transform = 'translate(0px, 0px)';
    }

    on(joystickZone, 'pointerdown', function (event) {
      event.preventDefault();
      if (activePointerId !== null) return;
      activePointerId = event.pointerId;
      if (joystickZone.setPointerCapture) {
        try { joystickZone.setPointerCapture(event.pointerId); } catch (e) {}
      }
      rt.input.touchMode = true;

      var rect = joystickZone.getBoundingClientRect();
      var margin = 20;
      var minX = margin;
      var maxX = Math.max(margin, rect.width - margin);
      var minY = margin;
      var maxY = Math.max(margin, rect.height - margin);
      originX = Math.max(minX, Math.min(maxX, event.clientX - rect.left));
      originY = Math.max(minY, Math.min(maxY, event.clientY - rect.top));

      joystickBase.classList.add('is-active');
      joystickBase.style.left = originX + 'px';
      joystickBase.style.top = originY + 'px';
      joystickThumb.style.transform = 'translate(0px, 0px)';
    });

    on(joystickZone, 'pointermove', function (event) {
      if (event.pointerId !== activePointerId) return;
      var rect = joystickZone.getBoundingClientRect();
      var currentX = event.clientX - rect.left;
      var currentY = event.clientY - rect.top;

      var dx = currentX - originX;
      var dy = currentY - originY;
      var dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        var excess = dist - maxRadius;
        originX += (dx / dist) * excess;
        originY += (dy / dist) * excess;
        var margin = 20;
        var minX = margin;
        var maxX = Math.max(margin, rect.width - margin);
        var minY = margin;
        var maxY = Math.max(margin, rect.height - margin);
        originX = Math.max(minX, Math.min(maxX, originX));
        originY = Math.max(minY, Math.min(maxY, originY));
        joystickBase.style.left = originX + 'px';
        joystickBase.style.top = originY + 'px';
        dist = maxRadius;
      }

      var dirX = dist > 0 ? dx / dist : 0;
      var dirY = dist > 0 ? dy / dist : 0;
      var intensity = dist / maxRadius;

      rt.input.gamepadX = dirX * intensity;
      rt.input.gamepadY = dirY * intensity;

      var thumbX = dirX * dist;
      var thumbY = dirY * dist;
      joystickThumb.style.transform = 'translate(' + thumbX.toFixed(1) + 'px, ' + thumbY.toFixed(1) + 'px)';
    });

    on(joystickZone, 'pointerup', function (event) {
      if (event.pointerId === activePointerId) resetJoystick();
    });
    on(joystickZone, 'pointercancel', function (event) {
      if (event.pointerId === activePointerId) resetJoystick();
    });
    on(joystickZone, 'lostpointercapture', function () {
      resetJoystick();
    });
    if (typeof window !== 'undefined') {
      on(window, 'pointerup', function (event) {
        if (event.pointerId === activePointerId) resetJoystick();
      });
      on(window, 'pointercancel', function (event) {
        if (event.pointerId === activePointerId) resetJoystick();
      });
      on(window, 'blur', function () {
        resetJoystick();
      });
    }
  }

  var touchKeys = { touchUp: 'w', touchLeft: 'a', touchDown: 's', touchRight: 'd' };
  Object.keys(touchKeys).forEach(function (id) {
    var button = document.getElementById(id);
    if (!button) return;
    on(button, 'pointerdown', function (event) {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      rt.input.touchMode = true;
      rt.input.keys.add(touchKeys[id]);
    });
    on(button, 'pointerup', function () { rt.input.keys.delete(touchKeys[id]); });
    on(button, 'pointercancel', function () { rt.input.keys.delete(touchKeys[id]); });
    on(button, 'lostpointercapture', function () { rt.input.keys.delete(touchKeys[id]); });
  });
  var touchShoot = document.getElementById('touchShoot');
  if (touchShoot) {
    on(touchShoot, 'pointerdown', function (event) {
      event.preventDefault();
      touchShoot.setPointerCapture(event.pointerId);
      rt.input.touchMode = true;
      rt.firePointers.add(event.pointerId);
      touchFireIds.add(event.pointerId);
      rt.input.touchFiring = true;
      rt.input.mouse.down = true;
    });
    on(touchShoot, 'pointerup', releaseFire);
    on(touchShoot, 'pointercancel', releaseFire);
    on(touchShoot, 'lostpointercapture', releaseFire);
  }
  var touchDash = document.getElementById('touchDash');
  if (touchDash) on(touchDash, 'pointerdown', function (event) { event.preventDefault(); rt.input.touchMode = true; dash(); });

  var touchSpecial = (rt.ui && rt.ui.touchSpecial) || document.getElementById('touchSpecial');
  var empPointerId = null;
  var empStartX = 0;
  var empStartY = 0;
  var empDragging = false;
  var EMP_TAP_PX = 12;
  var EMP_MAX_WORLD = 220;

  function canvasScale() {
    var canvas = rt.ui && rt.ui.canvas;
    if (!canvas || !canvas.getBoundingClientRect) return { sx: 1, sy: 1, rect: null };
    var rect = canvas.getBoundingClientRect();
    var w = (rt.ui && rt.ui.width) || rect.width || 1;
    var h = (rt.ui && rt.ui.height) || rect.height || 1;
    return {
      sx: rect.width ? w / rect.width : 1,
      sy: rect.height ? h / rect.height : 1,
      rect: rect,
      w: w,
      h: h
    };
  }

  function hideEmpReticle() {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('empDropReticle');
    if (el) el.hidden = true;
  }

  function showEmpReticle(worldX, worldY, cancel) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('empDropReticle');
    if (!el) {
      el = document.createElement('div');
      el.id = 'empDropReticle';
      el.className = 'emp-drop-reticle';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    var scale = canvasScale();
    if (!scale.rect || !scale.w || !scale.h) return;
    el.hidden = false;
    el.style.left = (scale.rect.left + (worldX / scale.w) * scale.rect.width) + 'px';
    el.style.top = (scale.rect.top + (worldY / scale.h) * scale.rect.height) + 'px';
    el.classList.toggle('is-cancel', !!cancel);
  }

  function pointOnButton(clientX, clientY, button) {
    if (!button || !button.getBoundingClientRect) return false;
    var r = button.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  function empWorldFromDrag(clientX, clientY) {
    var p = rt.state && rt.state.player;
    if (!p) return null;
    var scale = canvasScale();
    var dx = (clientX - empStartX) * scale.sx;
    var dy = (clientY - empStartY) * scale.sy;
    var len = Math.hypot(dx, dy);
    if (len > EMP_MAX_WORLD) {
      dx = (dx / len) * EMP_MAX_WORLD;
      dy = (dy / len) * EMP_MAX_WORLD;
    }
    var boundW = rt.ui ? rt.ui.width : rt.state.width;
    var boundH = rt.ui ? rt.ui.height : rt.state.height;
    return {
      x: clamp(p.x + dx, 20, boundW - 20),
      y: clamp(p.y + dy, 20, boundH - 20)
    };
  }

  function cancelEmpDrag() {
    empPointerId = null;
    empDragging = false;
    hideEmpReticle();
  }

  function moveEmpDrag(event) {
    if (empPointerId === null || event.pointerId !== empPointerId) return;
    if (!rt.state || !rt.state.player) return;
    var moved = Math.hypot(event.clientX - empStartX, event.clientY - empStartY);
    if (moved > EMP_TAP_PX) empDragging = true;
    if (!empDragging) return;
    var drop = empWorldFromDrag(event.clientX, event.clientY);
    if (!drop) return;
    showEmpReticle(drop.x, drop.y, pointOnButton(event.clientX, event.clientY, touchSpecial));
  }

  function finishEmpDrag(event, forceCancel) {
    if (empPointerId === null || !event || event.pointerId !== empPointerId) return;
    var dragging = empDragging;
    var cancel = forceCancel || (dragging && pointOnButton(event.clientX, event.clientY, touchSpecial));
    var drop = dragging ? empWorldFromDrag(event.clientX, event.clientY) : null;
    cancelEmpDrag();
    if (cancel || (dragging && !drop)) return;
    if (!rt.state || rt.state.paused || rt.state.over) return;
    if (dragging && drop) rt.input.empDrop = drop;
    triggerEmp();
  }

  if (touchSpecial) {
    on(touchSpecial, 'pointerdown', function (event) {
      event.preventDefault();
      if (empPointerId !== null) return;
      rt.input.touchMode = true;
      empPointerId = event.pointerId;
      empStartX = event.clientX;
      empStartY = event.clientY;
      empDragging = false;
      if (touchSpecial.setPointerCapture) {
        try { touchSpecial.setPointerCapture(event.pointerId); } catch (e) {}
      }
    });
    on(touchSpecial, 'pointermove', moveEmpDrag);
    on(touchSpecial, 'pointerup', function (event) { finishEmpDrag(event, false); });
    on(touchSpecial, 'pointercancel', function (event) { finishEmpDrag(event, true); });
    on(window, 'pointermove', moveEmpDrag);
    on(window, 'pointerup', function (event) { finishEmpDrag(event, false); });
    on(window, 'pointercancel', function (event) { finishEmpDrag(event, true); });
  }
}
