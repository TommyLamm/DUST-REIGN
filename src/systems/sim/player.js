import { AudioFX } from '../../audio/audio-fx.js';
import { addDecal } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { clamp } from '../../core/utils.js';
import { stepDash } from '../abilities.js';
import { stormWind } from '../flow.js';
import { dispatchCardHook } from '../card-effects.js';
import { getWeaponStrategy } from '../weapon-registry.js';
import { shoot, vanguardChargeNeed } from '../weapons.js';
import { applyPlayerEdgeRepulsion } from './world-edge.js';

export function stepPlayer(dt, frame) {
  var p = frame.p;
  dispatchCardHook('onPlayerStep', p, dt);
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
    if ((p.tacticalOverdriveTimer || 0) > 0) speedMult *= 1.20;
    if (p.toxicSlow) speedMult *= (1 - p.toxicSlow);
    var effectiveSpeed = p.speed * (p.slowTimer > 0 ? 0.55 : 1) * speedMult;
    if (p.isCharging) {
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

  // Vector recoil integration with exponential damping
  var recoilLambda = p.recoilLambda || 14.0;
  p.recoilVx = (p.recoilVx || 0) * Math.exp(-recoilLambda * dt);
  p.recoilVy = (p.recoilVy || 0) * Math.exp(-recoilLambda * dt);
  // An active dash owns movement until it lands; walking, recoil drift and wind resume after.
  if (!stepDash(p, dt, boundW, boundH)) {
    p.vx = targetVx;
    p.vy = targetVy;
    p.x = clamp(p.x + (p.vx + p.recoilVx) * dt, p.r, boundW - p.r);
    p.y = clamp(p.y + (p.vy + p.recoilVy) * dt, p.r, boundH - p.r);
    var wind = stormWind();
    if (wind) {
      p.x = clamp(p.x + Math.cos(wind.angle) * wind.power * dt, p.r, boundW - p.r);
      p.y = clamp(p.y + Math.sin(wind.angle) * wind.power * dt, p.r, boundH - p.r);
    }
  }
  // Soft spring off the hatch stripe — keeps the hard wall fantasy, frees pin traps.
  applyPlayerEdgeRepulsion(p, dt, boundW, boundH);
  var aimDx = rt.input.mouse.x - p.x;
  var aimDy = rt.input.mouse.y - p.y;
  if (aimDx || aimDy) p.aim = Math.atan2(aimDy, aimDx);

  if (rt.input.mouse.down) {
    p.continuousFireTime = (p.continuousFireTime || 0) + dt;
  } else {
    p.continuousFireTime = 0;
  }

  var strategy = getWeaponStrategy(p.weaponMode || 'standard');
  if (strategy && typeof strategy.chargeNeed === 'function') {
    p.chargeNeed = strategy.chargeNeed(p);
  }
  if (strategy && typeof strategy.onTick === 'function') {
    strategy.onTick(p, dt, Boolean(rt.input && rt.input.mouse && rt.input.mouse.down));
  } else {
    p.chargeTime = 0;
    p.isCharging = false;
    if (rt.input && rt.input.mouse && rt.input.mouse.down) shoot();
  }
}
