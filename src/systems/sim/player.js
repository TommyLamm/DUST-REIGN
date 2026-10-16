import { AudioFX } from '../../audio/audio-fx.js';
import { addDecal } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
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
  var prevVx = p.vx || 0;
  var prevVy = p.vy || 0;
  var prevSpeed = Math.hypot(prevVx, prevVy);
  var targetVx = 0;
  var targetVy = 0;

  if (moveLength > 0) {
    var moveScale = Math.min(1, moveLength);
    var speedMult = (typeof p.moveSpeedMult === 'number') ? p.moveSpeedMult : 1;
    if ((p.speedBoostTimer || 0) > 0 && p.speedBoostMult) speedMult *= p.speedBoostMult;
    var effectiveSpeed = p.speed * (p.slowTimer > 0 ? 0.55 : 1) * speedMult;
    if (p.weaponMode === 'vanguard' && p.isCharging) {
      effectiveSpeed *= 0.65;
    }
    targetVx = (mx / moveLength) * moveScale * effectiveSpeed;
    targetVy = (my / moveLength) * moveScale * effectiveSpeed;

    // Desert sharp turn drift / skid detection (angle > 100° and speed > 130)
    if (prevSpeed > 130) {
      var prevAng = Math.atan2(prevVy, prevVx);
      var inAng = Math.atan2(my, mx);
      var turnAngle = Math.abs(Math.atan2(Math.sin(inAng - prevAng), Math.cos(inAng - prevAng)));
      if (turnAngle > (100 * Math.PI / 180)) {
        p.isSkidding = true;
        p.skidTimer = (p.skidTimer || 0) + dt;
        if (p.skidTimer >= 0.035) {
          p.skidTimer = 0;
          var perp = prevAng + Math.PI / 2;
          addDecal(p.x + Math.cos(perp) * 6, p.y + Math.sin(perp) * 6, 3.5, 2.5, 0.28, '#15120e');
          addDecal(p.x - Math.cos(perp) * 6, p.y - Math.sin(perp) * 6, 3.5, 2.5, 0.28, '#15120e');

          if (rt.state && rt.state.particles) {
            var backAng = prevAng + Math.PI;
            for (var si = 0; si < 4; si += 1) {
              var sAngle = backAng + (rng('visual') - 0.5) * (Math.PI / 4);
              var sSpeed = 120 * (0.75 + rng('visual') * 0.5);
              rt.state.particles.push({
                x: p.x + (rng('visual') - 0.5) * 6,
                y: p.y + (rng('visual') - 0.5) * 6,
                vx: Math.cos(sAngle) * sSpeed,
                vy: Math.sin(sAngle) * sSpeed,
                life: 0.20 + rng('visual') * 0.15,
                maxLife: 0.35,
                size: 2.2 + rng('visual') * 1.0,
                color: rng('visual') < 0.5 ? '#d4a86a' : '#bf9355',
                gravity: 10
              });
            }
          }
        }
      } else {
        p.isSkidding = false;
      }
    } else {
      p.isSkidding = false;
    }
  } else {
    p.isSkidding = false;
  }

  p.vx = targetVx;
  p.vy = targetVy;

  // Vector recoil integration with exponential damping
  var recoilLambda = p.recoilLambda || 14.0;
  p.recoilVx = (p.recoilVx || 0) * Math.exp(-recoilLambda * dt);
  p.recoilVy = (p.recoilVy || 0) * Math.exp(-recoilLambda * dt);
  p.x = clamp(p.x + (p.vx + p.recoilVx) * dt, p.r, boundW - p.r);
  p.y = clamp(p.y + (p.vy + p.recoilVy) * dt, p.r, boundH - p.r);
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
        if (!p.isCharging) {
          p.isCharging = true;
          if (AudioFX && typeof AudioFX.vanguardChargeStart === 'function') {
            AudioFX.vanguardChargeStart(p.chargeNeed);
          }
        }
        p.chargeTime += dt;
        if (p.chargeTime >= p.chargeNeed) {
          if (AudioFX && typeof AudioFX.vanguardChargeStop === 'function') {
            AudioFX.vanguardChargeStop();
          }
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
        if (AudioFX && typeof AudioFX.vanguardChargeStop === 'function') {
          AudioFX.vanguardChargeStop();
        }
      }
    }
  } else {
    p.chargeTime = 0;
    p.isCharging = false;
    if (rt.input.mouse.down) shoot();
  }
}
