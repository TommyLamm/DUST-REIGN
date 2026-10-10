import { rt } from '../core/runtime.js';
import { qa } from '../core/utils.js';
import { dash, triggerEmp } from '../systems/abilities.js';
import { beginRun, restart, togglePause } from '../systems/flow.js';
import { beginBanish, chooseUpgrade, rerollUpgrades, skipUpgrade } from '../systems/progression.js';
import { isCodexOpen } from '../ui/codex-panel.js';
import { loadoutCommand } from '../ui/loadout-panel.js';
import { getCurrentPauseTab, switchPauseTab } from '../ui/pause-menu.js';
import { updateTips } from '../ui/tips.js';
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

function releaseGamepadFire() {
  if (!rt.input || !rt.input.gamepadFiring) return;
  rt.input.gamepadFiring = false;
  if (!rt.firePointers || rt.firePointers.size === 0) rt.input.mouse.down = false;
}

function enemyLive(enemy) {
  if (!enemy || !(enemy.hp > 0) || !rt.state) return false;
  if (rt.state.boss === enemy) return true;
  var list = rt.state.enemies || [];
  return list.indexOf(enemy) !== -1;
}

// FIRE sticky lock: hold 0.5s unless the target dies or range grows past 1.5×.
// Boss within 380px wins when nothing is inside 120px. Aim stays on the center.
function stepTouchAim(dt) {
  if (!rt.input || !rt.input.touchFiring || !rt.state || !rt.state.player) return;
  if (rt.state.paused || rt.state.over || rt.state.interlude) return;
  var p = rt.state.player;
  var list = rt.state.enemies || [];
  var nearest = null;
  var nearestD = Infinity;
  var close = false;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var enemy = list[i];
    if (!enemy || !(enemy.hp > 0)) continue;
    var d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
    if (d < nearestD) {
      nearest = enemy;
      nearestD = d;
    }
    if (d <= 120) close = true;
  }
  var boss = rt.state.boss;
  var target = nearest;
  if (boss && boss.hp > 0 && !close) {
    var bossD = Math.hypot(boss.x - p.x, boss.y - p.y);
    if (bossD <= 380) target = boss;
  }
  var lock = rt.input.aimLock;
  if (lock && enemyLive(lock.enemy)) {
    var held = Math.hypot(lock.enemy.x - p.x, lock.enemy.y - p.y);
    var cap = ((lock.dist > 1) ? lock.dist : 1) * 1.5;
    if ((lock.left || 0) > 0 && held <= cap) {
      target = lock.enemy;
      lock.left -= (Number(dt) || 0);
    } else if (target) {
      rt.input.aimLock = {
        enemy: target,
        dist: Math.hypot(target.x - p.x, target.y - p.y),
        left: 0.5
      };
    } else {
      rt.input.aimLock = null;
    }
  } else if (target) {
    rt.input.aimLock = {
      enemy: target,
      dist: Math.hypot(target.x - p.x, target.y - p.y),
      left: 0.5
    };
  } else {
    rt.input.aimLock = null;
  }
  if (!target) return;
  rt.input.mouse.x = target.x;
  rt.input.mouse.y = target.y;
  rt.input.touchMode = false;
}

export function pollGamepad(dt) {
  updateTips();
  pollGamepadInner(dt);
  stepTouchAim(dt);
}

function pollGamepadInner(dt) {
  var gp = getActiveGamepad();
  if (!gp || !rt.state) {
    releaseGamepadFire();
    return;
  }

  var buttons = gp.buttons || [];
  var axes = gp.axes || [];

  function justPressed(idx) {
    var pressed = isBtnPressed(buttons[idx]);
    var wasPressed = Boolean(rt.gamepadState.prevButtons[idx]);
    return pressed && !wasPressed;
  }

  // Upgrade Selection
  if (rt.state.paused && rt.state.upgradeChoices && rt.state.upgradeChoices.length > 0) {
    releaseGamepadFire();
    if (rt.gamepadState.navDebounce > 0) rt.gamepadState.navDebounce -= dt;
    var upPressed = isBtnPressed(buttons[12]) || (axes.length > 1 && axes[1] < -0.5);
    var downPressed = isBtnPressed(buttons[13]) || (axes.length > 1 && axes[1] > 0.5);
    var leftPressed = isBtnPressed(buttons[14]) || (axes.length > 0 && axes[0] < -0.5);
    var rightPressed = isBtnPressed(buttons[15]) || (axes.length > 0 && axes[0] > 0.5);
    var navPrev = upPressed || leftPressed;
    var navNext = downPressed || rightPressed;
    if (rt.gamepadState.navDebounce <= 0) {
      if (navPrev) {
        if (typeof rt.gamepadState.selectedUpgrade !== 'number' || rt.gamepadState.selectedUpgrade < 0) {
          rt.gamepadState.selectedUpgrade = rt.state.upgradeChoices.length - 1;
        } else {
          rt.gamepadState.selectedUpgrade = (rt.gamepadState.selectedUpgrade - 1 + rt.state.upgradeChoices.length) % rt.state.upgradeChoices.length;
        }
        rt.gamepadState.navDebounce = 0.22;
        updateUpgradeSelectionUi();
      } else if (navNext) {
        if (typeof rt.gamepadState.selectedUpgrade !== 'number' || rt.gamepadState.selectedUpgrade < 0) {
          rt.gamepadState.selectedUpgrade = 0;
        } else {
          rt.gamepadState.selectedUpgrade = (rt.gamepadState.selectedUpgrade + 1) % rt.state.upgradeChoices.length;
        }
        rt.gamepadState.navDebounce = 0.22;
        updateUpgradeSelectionUi();
      }
    }
    if (justPressed(0)) {
      var pickIndex = (typeof rt.gamepadState.selectedUpgrade === 'number' && rt.gamepadState.selectedUpgrade >= 0) ? rt.gamepadState.selectedUpgrade : 0;
      chooseUpgrade(pickIndex);
    }
    else if (justPressed(2)) rerollUpgrades();
    else if (justPressed(3)) beginBanish();
    else if (justPressed(1)) skipUpgrade();

    for (var bi = 0; bi < buttons.length; bi += 1) rt.gamepadState.prevButtons[bi] = isBtnPressed(buttons[bi]);
    return;
  }

  // Start Screen / Game Over. A starts a run only when the codex is closed and focus is not in the loadout.
  if (rt.ui && rt.ui.startScreen && !rt.ui.startScreen.hidden) {
    releaseGamepadFire();
    var codexOpen = isCodexOpen();
    var loadoutPanel = typeof document !== 'undefined' ? document.getElementById('loadoutPanel') : null;
    var activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    var inLoadout = !!(loadoutPanel && activeEl && loadoutPanel.contains(activeEl) && activeEl.id !== 'startBtn');
    if (rt.gamepadState.navDebounce > 0) rt.gamepadState.navDebounce -= dt;
    if (codexOpen || inLoadout || loadoutPanel) {
      var navLeft = isBtnPressed(buttons[14]) || (axes.length > 0 && axes[0] < -0.5);
      var navRight = isBtnPressed(buttons[15]) || (axes.length > 0 && axes[0] > 0.5);
      var navUp = isBtnPressed(buttons[12]) || (axes.length > 1 && axes[1] < -0.5);
      var navDown = isBtnPressed(buttons[13]) || (axes.length > 1 && axes[1] > 0.5);
      if (rt.gamepadState.navDebounce <= 0) {
        if (navLeft) { loadoutCommand('left'); rt.gamepadState.navDebounce = 0.22; }
        else if (navRight) { loadoutCommand('right'); rt.gamepadState.navDebounce = 0.22; }
        else if (navUp) { loadoutCommand('up'); rt.gamepadState.navDebounce = 0.22; }
        else if (navDown) { loadoutCommand('down'); rt.gamepadState.navDebounce = 0.22; }
      }
    }
    if (codexOpen) {
      if (justPressed(0)) loadoutCommand('confirm');
      else if (justPressed(1)) loadoutCommand('cancel');
    } else if (inLoadout) {
      if (justPressed(0) && activeEl && typeof activeEl.click === 'function') activeEl.click();
      else if (justPressed(9)) beginRun();
    } else if (justPressed(0) || justPressed(9)) {
      beginRun();
    }
    for (var sbi = 0; sbi < buttons.length; sbi += 1) rt.gamepadState.prevButtons[sbi] = isBtnPressed(buttons[sbi]);
    return;
  }

  if (rt.state.over) {
    releaseGamepadFire();
    if ((justPressed(0) || justPressed(9)) && rt.state.deathSequenceTimer <= 0) restart();
    for (var obi = 0; obi < buttons.length; obi += 1) rt.gamepadState.prevButtons[obi] = isBtnPressed(buttons[obi]);
    return;
  }

  // Pause Toggle / Navigation. D-pad stays on tabs here; in play it moves.
  if (rt.state.paused) {
    releaseGamepadFire();
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

  // Left stick (deadzone 0.16) plus D-pad while playing.
  var lx = axes.length > 0 ? axes[0] : 0;
  var ly = axes.length > 1 ? axes[1] : 0;
  var moveX = 0;
  var moveY = 0;
  if (Math.hypot(lx, ly) > 0.16) {
    moveX += lx;
    moveY += ly;
  }
  if (isBtnPressed(buttons[14])) moveX -= 1;
  if (isBtnPressed(buttons[15])) moveX += 1;
  if (isBtnPressed(buttons[12])) moveY -= 1;
  if (isBtnPressed(buttons[13])) moveY += 1;
  rt.input.gamepadX = moveX;
  rt.input.gamepadY = moveY;

  // Right stick: aim (axes[2], axes[3]) with radial deadzone 0.18
  var rx = axes.length > 2 ? axes[2] : 0;
  var ry = axes.length > 3 ? axes[3] : 0;
  if (Math.hypot(rx, ry) > 0.18) {
    var rAngle = Math.atan2(ry, rx);
    rt.state.player.aim = rAngle;
    rt.input.mouse.x = rt.state.player.x + Math.cos(rAngle) * 120;
    rt.input.mouse.y = rt.state.player.y + Math.sin(rAngle) * 120;
  }

  // RT / RB hold sets mouse.down so stepPlayer accumulates continuousFireTime.
  var gpFiring = isBtnPressed(buttons[7]) || isBtnPressed(buttons[5]);
  if (gpFiring) {
    rt.input.mouse.down = true;
    rt.input.gamepadFiring = true;
  } else if (rt.input.gamepadFiring) {
    releaseGamepadFire();
  }

  // EMP button: LB (buttons[4]) or B (buttons[1])
  if (justPressed(4) || justPressed(1)) triggerEmp();

  // Dash button: LT (buttons[6]) or A (buttons[0])
  if (justPressed(6) || justPressed(0)) dash();

  for (var k = 0; k < buttons.length; k += 1) rt.gamepadState.prevButtons[k] = isBtnPressed(buttons[k]);
}
