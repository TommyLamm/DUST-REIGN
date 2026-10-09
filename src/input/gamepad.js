import { rt } from '../core/runtime.js';
import { qa } from '../core/utils.js';
import { dash, triggerEmp } from '../systems/abilities.js';
import { beginRun, restart, togglePause } from '../systems/flow.js';
import { chooseUpgrade } from '../systems/progression.js';
import { shoot } from '../systems/weapons.js';
import { getCurrentPauseTab, switchPauseTab } from '../ui/pause-menu.js';
import { updateUpgradeSelectionUi } from '../ui/upgrade-panel.js';

function getActiveGamepad() {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  var gamepads = navigator.getGamepads();
  if (!gamepads) return null;
  for (var i = 0; i < gamepads.length; i += 1) {
    var gp = gamepads[i];
    if (gp && gp.connected) return gp;
  }
  return null;
}

function isBtnPressed(btn) {
  if (!btn) return false;
  if (typeof btn === 'number') return btn > 0.5;
  return Boolean(btn.pressed || (typeof btn.value === 'number' && btn.value > 0.15));
}

export function pollGamepad(dt) {
  var gp = getActiveGamepad();
  if (!gp || !rt.state) return;

  var buttons = gp.buttons || [];
  var axes = gp.axes || [];

  function justPressed(idx) {
    var pressed = isBtnPressed(buttons[idx]);
    var wasPressed = Boolean(rt.gamepadState.prevButtons[idx]);
    return pressed && !wasPressed;
  }

  // Upgrade Selection
  if (rt.state.paused && rt.state.upgradeChoices && rt.state.upgradeChoices.length > 0) {
    if (rt.gamepadState.navDebounce > 0) rt.gamepadState.navDebounce -= dt;
    var upPressed = isBtnPressed(buttons[12]) || (axes.length > 1 && axes[1] < -0.5);
    var downPressed = isBtnPressed(buttons[13]) || (axes.length > 1 && axes[1] > 0.5);
    if (rt.gamepadState.navDebounce <= 0) {
      if (upPressed) {
        rt.gamepadState.selectedUpgrade = (rt.gamepadState.selectedUpgrade - 1 + rt.state.upgradeChoices.length) % rt.state.upgradeChoices.length;
        rt.gamepadState.navDebounce = 0.22;
        updateUpgradeSelectionUi();
      } else if (downPressed) {
        rt.gamepadState.selectedUpgrade = (rt.gamepadState.selectedUpgrade + 1) % rt.state.upgradeChoices.length;
        rt.gamepadState.navDebounce = 0.22;
        updateUpgradeSelectionUi();
      }
    }
    if (justPressed(0)) chooseUpgrade(rt.gamepadState.selectedUpgrade);
    else if (justPressed(2)) chooseUpgrade(0);
    else if (justPressed(3)) chooseUpgrade(1);
    else if (justPressed(1)) chooseUpgrade(2);

    for (var bi = 0; bi < buttons.length; bi += 1) rt.gamepadState.prevButtons[bi] = isBtnPressed(buttons[bi]);
    return;
  }

  // Start Screen / Game Over
  if (rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden) {
    if (justPressed(0) || justPressed(9)) beginRun();
    for (var sbi = 0; sbi < buttons.length; sbi += 1) rt.gamepadState.prevButtons[sbi] = isBtnPressed(buttons[sbi]);
    return;
  }

  if (rt.state.over) {
    if ((justPressed(0) || justPressed(9)) && rt.state.deathSequenceTimer <= 0) restart();
    for (var obi = 0; obi < buttons.length; obi += 1) rt.gamepadState.prevButtons[obi] = isBtnPressed(buttons[obi]);
    return;
  }

  // Pause Toggle / Navigation
  if (rt.state.paused) {
    if (justPressed(9) || justPressed(1)) {
      togglePause();
      for (var pbi = 0; pbi < buttons.length; pbi += 1) rt.gamepadState.prevButtons[pbi] = isBtnPressed(buttons[pbi]);
      return;
    }

    if (rt.ui && rt.ui.pauseModal && !rt.ui.pauseModal.hidden) {
      if (rt.gamepadState.navDebounce > 0) rt.gamepadState.navDebounce -= dt;
      var leftPressed = isBtnPressed(buttons[14]) || (axes.length > 0 && axes[0] < -0.5);
      var rightPressed = isBtnPressed(buttons[15]) || (axes.length > 0 && axes[0] > 0.5);
      var upPressed = isBtnPressed(buttons[12]) || (axes.length > 1 && axes[1] < -0.5);
      var downPressed = isBtnPressed(buttons[13]) || (axes.length > 1 && axes[1] > 0.5);

      if (rt.gamepadState.navDebounce <= 0) {
        if (leftPressed) {
          rt.gamepadState.navDebounce = 0.22;
          var tabOrder = ['system', 'build', 'controls'];
          var curIdx = tabOrder.indexOf(getCurrentPauseTab());
          var nextIdx = (curIdx - 1 + tabOrder.length) % tabOrder.length;
          switchPauseTab(tabOrder[nextIdx]);
        } else if (rightPressed) {
          rt.gamepadState.navDebounce = 0.22;
          var tabOrder2 = ['system', 'build', 'controls'];
          var curIdx2 = tabOrder2.indexOf(getCurrentPauseTab());
          var nextIdx2 = (curIdx2 + 1) % tabOrder2.length;
          switchPauseTab(tabOrder2[nextIdx2]);
        } else if (downPressed || upPressed) {
          rt.gamepadState.navDebounce = 0.22;
          var focusables = qa('button:not([hidden]):not([disabled]), input:not([hidden]):not([disabled])', rt.ui.pauseModal);
          if (focusables.length > 0) {
            var activeEl = document.activeElement;
            var fIdx = focusables.indexOf(activeEl);
            var nextF = downPressed ? (fIdx + 1) % focusables.length : (fIdx - 1 + focusables.length) % focusables.length;
            if (focusables[nextF] && focusables[nextF].focus) focusables[nextF].focus();
          }
        }
      }
      if (justPressed(0)) {
        var activeEl2 = document.activeElement;
        if (activeEl2 && rt.ui.pauseModal.contains(activeEl2) && typeof activeEl2.click === 'function') {
          activeEl2.click();
        }
      }
    }
    for (var pbi2 = 0; pbi2 < buttons.length; pbi2 += 1) rt.gamepadState.prevButtons[pbi2] = isBtnPressed(buttons[pbi2]);
    return;
  }

  // Pause Toggle: Start / Menu (buttons[9])
  if (justPressed(9)) togglePause();

  // Left stick: movement (axes[0], axes[1]) with radial deadzone 0.16
  var lx = axes.length > 0 ? axes[0] : 0;
  var ly = axes.length > 1 ? axes[1] : 0;
  if (Math.hypot(lx, ly) > 0.16) {
    rt.input.gamepadX = lx;
    rt.input.gamepadY = ly;
  } else {
    rt.input.gamepadX = 0;
    rt.input.gamepadY = 0;
  }

  // Right stick: aim (axes[2], axes[3]) with radial deadzone 0.18
  var rx = axes.length > 2 ? axes[2] : 0;
  var ry = axes.length > 3 ? axes[3] : 0;
  if (Math.hypot(rx, ry) > 0.18) {
    var rAngle = Math.atan2(ry, rx);
    rt.state.player.aim = rAngle;
    rt.input.mouse.x = rt.state.player.x + Math.cos(rAngle) * 120;
    rt.input.mouse.y = rt.state.player.y + Math.sin(rAngle) * 120;
  }

  // Fire button: RT (buttons[7]) or RB (buttons[5])
  var gpFiring = isBtnPressed(buttons[7]) || isBtnPressed(buttons[5]);
  if (gpFiring) {
    if (rt.state && rt.state.player && rt.state.player.weaponMode === 'vanguard') {
      rt.input.mouse.down = true;
    } else {
      shoot();
    }
  } else if (rt.gamepadState.connected && !rt.input.touchMode && rt.firePointers.size === 0 && rt.state && rt.state.player && rt.state.player.weaponMode === 'vanguard' && rt.input.mouse.down) {
    rt.input.mouse.down = false;
  }

  // EMP button: LB (buttons[4]) or B (buttons[1])
  if (justPressed(4) || justPressed(1)) triggerEmp();

  // Dash button: LT (buttons[6]) or A (buttons[0])
  if (justPressed(6) || justPressed(0)) dash();

  for (var k = 0; k < buttons.length; k += 1) rt.gamepadState.prevButtons[k] = isBtnPressed(buttons[k]);
}
