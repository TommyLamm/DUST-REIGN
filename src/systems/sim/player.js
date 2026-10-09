import { rt } from '../../core/runtime.js';
import { clamp } from '../../core/utils.js';
import { isStormFront } from '../flow.js';
import { shoot } from '../weapons.js';

export function stepPlayer(dt, frame) {
  var p = frame.p;
  var boundW = frame.boundW;
  var boundH = frame.boundH;
  var mx = 0;
  var my = 0;
  if (rt.input.keys.has('w') || rt.input.keys.has('arrowup')) my -= 1;
  if (rt.input.keys.has('s') || rt.input.keys.has('arrowdown')) my += 1;
  if (rt.input.keys.has('a') || rt.input.keys.has('arrowleft')) mx -= 1;
  if (rt.input.keys.has('d') || rt.input.keys.has('arrowright')) mx += 1;
  if (rt.input.gamepadX || rt.input.gamepadY) {
    mx += rt.input.gamepadX;
    my += rt.input.gamepadY;
  }
  var moveLength = Math.hypot(mx, my);
  if (moveLength > 0) {
    var moveScale = Math.min(1, moveLength);
    var effectiveSpeed = p.speed * (p.slowTimer > 0 ? 0.55 : 1);
    if (p.weaponMode === 'vanguard' && p.isCharging) {
      effectiveSpeed *= 0.65;
    }
    p.vx = (mx / moveLength) * moveScale * effectiveSpeed;
    p.vy = (my / moveLength) * moveScale * effectiveSpeed;
    p.x = clamp(p.x + p.vx * dt, p.r, boundW - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, boundH - p.r);
  } else {
    p.vx = 0;
    p.vy = 0;
  }
  if (isStormFront()) {
    var stormRad = 35 * Math.PI / 180;
    var windVx = Math.cos(stormRad) * 38;
    var windVy = Math.sin(stormRad) * 38;
    p.x = clamp(p.x + windVx * dt, p.r, boundW - p.r);
    p.y = clamp(p.y + windVy * dt, p.r, boundH - p.r);
  }
  var aimDx = rt.input.mouse.x - p.x;
  var aimDy = rt.input.mouse.y - p.y;
  if (aimDx || aimDy) p.aim = Math.atan2(aimDy, aimDx);

  if (rt.input.mouse.down) {
    p.continuousFireTime = (p.continuousFireTime || 0) + dt;
  } else {
    p.continuousFireTime = 0;
  }

  if (p.weaponMode === 'vanguard') {
    if (rt.input.mouse.down) {
      if (p.cooldown <= 0) {
        p.isCharging = true;
        p.chargeTime += dt;
        if (p.chargeTime >= 0.6) {
          shoot();
        }
      }
    } else {
      if (p.isCharging) {
        if (p.chargeTime >= 0.6 && p.cooldown <= 0) {
          shoot();
        }
        p.chargeTime = 0;
        p.isCharging = false;
      }
    }
  } else {
    p.chargeTime = 0;
    p.isCharging = false;
    if (rt.input.mouse.down) shoot();
  }
}
