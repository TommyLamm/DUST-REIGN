import { rt } from '../../core/runtime.js';
import { clamp } from '../../core/utils.js';
import { stormWind } from '../flow.js';
import { shoot, vanguardChargeNeed } from '../weapons.js';

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
    var speedMult = (typeof p.moveSpeedMult === 'number') ? p.moveSpeedMult : 1;
    var effectiveSpeed = p.speed * (p.slowTimer > 0 ? 0.55 : 1) * speedMult;
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
  var wind = stormWind();
  if (wind) {
    p.x = clamp(p.x + Math.cos(wind.angle) * wind.power * dt, p.r, boundW - p.r);
    p.y = clamp(p.y + Math.sin(wind.angle) * wind.power * dt, p.r, boundH - p.r);
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
    p.chargeNeed = vanguardChargeNeed(p);
    if (rt.input.mouse.down) {
      if (p.cooldown <= 0) {
        p.isCharging = true;
        p.chargeTime += dt;
        if (p.chargeTime >= p.chargeNeed) {
          shoot();
        }
      }
    } else {
      if (p.isCharging) {
        if (p.chargeTime >= p.chargeNeed && p.cooldown <= 0) {
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
