/**
 * DUST//REIGN - Camera Tracking Dynamics, Aim Lookahead & Viewport System
 * Core Invariants:
 * 1. Asymmetric Dual-Stage Damping (Cruise: 7.0 s^-1, Dash: 16.0 s^-1)
 * 2. Soft-Leash Deadzone (0.12 * min(viewW, viewH))
 * 3. Bi-directional Aim Lookahead (Hermite curve on cursor screen offset, deadzone 70px,
 *    O_max = 0.18 * min(viewW, viewH); critically damped spring, ease-in/ease-out, <= 260 px/s)
 * 4. Trauma-based Orthogonal Screen Shake (Prime non-resonant frequencies, decoupling for mouse aim)
 * 5. Strict Boundary Clamping (20px safety padding)
 * 6. 0-GC Execution Budget
 */
import { rt } from './runtime.js';
import { clamp } from './utils.js';
import { isReducedMotion } from './settings.js';

// 0-GC Camera Singleton Container
export var camera = {
  // World space center coordinates and target
  x: 480,
  y: 320,
  followX: 480,
  followY: 320,
  renderedX: 480,
  renderedY: 320,
  targetX: 480,
  targetY: 320,

  // Aim lookahead offset
  lookaheadX: 0,
  lookaheadY: 0,
  lookaheadVX: 0,
  lookaheadVY: 0,
  targetLookaheadX: 0,
  targetLookaheadY: 0,

  // Trauma-based screen shake state
  trauma: 0,
  shakeX: 0,
  shakeY: 0,
  shakeAngle: 0,

  // Dimensions
  worldW: 3520,
  worldH: 2640,
  viewW: 960,
  viewH: 640,
  dpr: 1.0,

  // Clamped render coordinates and view origin
  clampedX: 480,
  clampedY: 320,
  viewOriginX: 480,
  viewOriginY: 320
};

var LOOKAHEAD_MAX_RATIO = 0.18;
var LOOKAHEAD_MAX_SPEED = 260.0; // px/s
var LOOKAHEAD_OMEGA_EXTEND = 5.5; // rad/s
var LOOKAHEAD_OMEGA_RETRACT = 7.0; // rad/s
var LOOKAHEAD_SUBSTEP = 1 / 120;
var SHAKE_MAX_OFFSET = 18.0;
var SHAKE_MAX_ANGLE = 0.022; // ~1.26 deg

export function initCamera(cam, worldW, worldH, viewW, viewH) {
  cam = cam || camera;
  cam.worldW = worldW || 3520;
  cam.worldH = worldH || 2640;
  cam.viewW = viewW || (rt.ui && rt.ui.width) || 960;
  cam.viewH = viewH || (rt.ui && rt.ui.height) || 640;
  cam.dpr = (rt.ui && rt.ui.dpr) || 1.0;

  var p = rt.state && rt.state.player;
  cam.x = p ? p.x : cam.worldW * 0.5;
  cam.y = p ? p.y : cam.worldH * 0.5;
  cam.targetX = cam.x;
  cam.targetY = cam.y;
  cam.clampedX = cam.x;
  cam.clampedY = cam.y;
  cam.followX = cam.x;
  cam.followY = cam.y;
  cam.renderedX = cam.x;
  cam.renderedY = cam.y;

  cam.lookaheadX = 0;
  cam.lookaheadY = 0;
  cam.lookaheadVX = 0;
  cam.lookaheadVY = 0;
  cam.targetLookaheadX = 0;
  cam.targetLookaheadY = 0;

  cam.trauma = 0;
  cam.shakeX = 0;
  cam.shakeY = 0;
  cam.shakeAngle = 0;
  cam.viewOriginX = cam.viewW * 0.5;
  cam.viewOriginY = cam.viewH * 0.5;
}

export function addCameraTrauma(amount, cam) {
  cam = cam || camera;
  if (isReducedMotion()) {
    cam.trauma = 0;
    return;
  }
  cam.trauma = clamp(cam.trauma + (amount || 0), 0, 1.0);
}

export function updateCamera(cam, player, input, dt, reducedMotion) {
  cam = cam || (rt && rt.camera) || camera;
  if (!cam) return;
  player = player || (rt.state && rt.state.player);
  input = input || (rt && rt.input);
  if (dt === undefined) dt = (rt && rt.renderDt) || 0.016;
  if (reducedMotion === undefined) reducedMotion = isReducedMotion();

  if (dt <= 0) return;

  var viewW = cam.viewW || (rt.ui && rt.ui.width) || 960;
  var viewH = cam.viewH || (rt.ui && rt.ui.height) || 640;
  cam.viewW = viewW;
  cam.viewH = viewH;
  if (rt.ui && rt.ui.dpr) cam.dpr = rt.ui.dpr;

  // cam.x/cam.y is the rendered center (follow + lookahead). The follow point is
  // kept apart so lookahead never feeds back into the next frame's tracking.
  // An outside write to cam.x (init, tests, respawn) rebases the follow point.
  if (cam.followX === undefined || cam.x !== cam.renderedX || cam.y !== cam.renderedY) {
    cam.followX = cam.x - (cam.lookaheadX || 0);
    cam.followY = cam.y - (cam.lookaheadY || 0);
  }

  if (player) {
    cam.targetX = player.x;
    cam.targetY = player.y;

    // 1. Asymmetric Dual-Stage Dynamic Damping
    // Cruise: lambda = 7.0 s^-1 (half-life ~ 99 ms)
    // High-speed / Dash (V > 380 px/s or dashing): lambda = 16.0 s^-1 (half-life ~ 43 ms)
    var pSpeed = Math.hypot(player.vx || 0, player.vy || 0);
    var isDashing = Boolean((player.dashPulse && player.dashPulse > 0) || player.isDashing || (pSpeed > 380));
    var lambdaFollow = isDashing ? 16.0 : 7.0;
    var decayFollow = Math.exp(-lambdaFollow * dt);

    cam.followX = cam.targetX + (cam.followX - cam.targetX) * decayFollow;
    cam.followY = cam.targetY + (cam.followY - cam.targetY) * decayFollow;

    // Soft-Leash Deadzone: R_leash_max = min(viewW, viewH) * 0.12 (~76.8 px)
    var maxLeash = Math.min(viewW, viewH) * 0.12;
    var dx = player.x - cam.followX;
    var dy = player.y - cam.followY;
    var leashDist = Math.hypot(dx, dy);
    if (leashDist > maxLeash && leashDist > 0.0001) {
      cam.followX = player.x - (dx / leashDist) * maxLeash;
      cam.followY = player.y - (dy / leashDist) * maxLeash;
    }

    // 2. Aim Lookahead
    var maxLookahead = Math.min(viewW, viewH) * LOOKAHEAD_MAX_RATIO; // ~115 px
    var targetLookX = 0;
    var targetLookY = 0;

    // Gamepad right stick support
    var stickX = (input && (input.gamepadRightX || input.gamepadAimX)) || 0;
    var stickY = (input && (input.gamepadRightY || input.gamepadAimY)) || 0;
    var stickMag = Math.hypot(stickX, stickY);

    if (stickMag > 0.18) {
      var stickNorm = (stickMag - 0.18) / 0.82;
      var stickFactor = Math.pow(stickNorm, 1.4);
      targetLookX = (stickX / stickMag) * maxLookahead * stickFactor;
      targetLookY = (stickY / stickMag) * maxLookahead * stickFactor;
    } else {
      // Mouse/Pointer Lookahead. Prefer the cursor's screen offset from the view
      // center: it does not move when the camera moves, so lookahead cannot chase
      // its own output. World aim is the fallback when no screen point exists.
      var aimDx;
      var aimDy;
      if (input && input.mouse && typeof input.mouse.sx === 'number' && !input.gamepadFiring) {
        aimDx = input.mouse.sx - viewW * 0.5;
        aimDy = input.mouse.sy - viewH * 0.5;
      } else {
        var aimTargetX = (player.aimX !== undefined) ? player.aimX : (input && input.mouse ? input.mouse.x : player.x);
        var aimTargetY = (player.aimY !== undefined) ? player.aimY : (input && input.mouse ? input.mouse.y : player.y);
        aimDx = aimTargetX - player.x;
        aimDy = aimTargetY - player.y;
      }
      var L = Math.hypot(aimDx, aimDy);

      // Deadzone: L <= 70px -> offset = 0
      // Hermite smooth curve: t = clamp((L - 70) / (450 - 70), 0, 1), w(t) = 3t^2 - 2t^3
      if (L > 70) {
        var t = clamp((L - 70) / (450 - 70), 0, 1);
        var w = t * t * (3 - 2 * t);
        var mag = maxLookahead * w;
        targetLookX = (aimDx / L) * mag;
        targetLookY = (aimDy / L) * mag;
      }
    }

    cam.targetLookaheadX = targetLookX;
    cam.targetLookaheadY = targetLookY;

    // Critically damped spring lookahead: it starts from rest (slow break-away),
    // accelerates, then settles without overshoot - the same feel as the dash.
    // Omega: extend 5.5 rad/s, retract 7.0 rad/s; speed capped at 260 px/s.
    var curLookMag = Math.hypot(cam.lookaheadX, cam.lookaheadY);
    var targetLookMag = Math.hypot(targetLookX, targetLookY);
    var isRetracting = targetLookMag < curLookMag;
    var omega = isRetracting ? LOOKAHEAD_OMEGA_RETRACT : LOOKAHEAD_OMEGA_EXTEND;
    var lookVX = cam.lookaheadVX || 0;
    var lookVY = cam.lookaheadVY || 0;
    var substeps = Math.max(1, Math.ceil(dt / LOOKAHEAD_SUBSTEP));
    var h = dt / substeps;
    for (var si = 0; si < substeps; si += 1) {
      lookVX += (omega * omega * (targetLookX - cam.lookaheadX) - 2 * omega * lookVX) * h;
      lookVY += (omega * omega * (targetLookY - cam.lookaheadY) - 2 * omega * lookVY) * h;
      var lookSpeed = Math.hypot(lookVX, lookVY);
      if (lookSpeed > LOOKAHEAD_MAX_SPEED) {
        lookVX *= LOOKAHEAD_MAX_SPEED / lookSpeed;
        lookVY *= LOOKAHEAD_MAX_SPEED / lookSpeed;
      }
      cam.lookaheadX += lookVX * h;
      cam.lookaheadY += lookVY * h;
    }
    cam.lookaheadVX = lookVX;
    cam.lookaheadVY = lookVY;
  }

  // 3. World Boundary Clamping
  // Center including lookahead
  var desiredCenterX = cam.followX + cam.lookaheadX;
  var desiredCenterY = cam.followY + cam.lookaheadY;

  var halfW = viewW * 0.5;
  var halfH = viewH * 0.5;
  var shakePad = 20.0;

  var minX = halfW + shakePad;
  var maxX = cam.worldW - halfW - shakePad;
  var minY = halfH + shakePad;
  var maxY = cam.worldH - halfH - shakePad;

  if (maxX < minX) {
    cam.x = (minX + maxX) * 0.5;
  } else {
    cam.x = clamp(desiredCenterX, minX, maxX);
  }

  if (maxY < minY) {
    cam.y = (minY + maxY) * 0.5;
  } else {
    cam.y = clamp(desiredCenterY, minY, maxY);
  }

  cam.clampedX = cam.x;
  cam.clampedY = cam.y;
  cam.renderedX = cam.x;
  cam.renderedY = cam.y;

  // 4. Trauma-based Screen Shake (Prime non-resonant frequencies)
  if (rt && rt.state && rt.state.shake > 0) {
    var legacyTrauma = Math.min(1.0, rt.state.shake / 18.0);
    if (legacyTrauma > cam.trauma) cam.trauma = legacyTrauma;
  }

  if (!reducedMotion && cam.trauma > 0) {
    cam.trauma = Math.max(0, cam.trauma - 1.35 * dt);
    var amp = cam.trauma * cam.trauma;
    var time = (rt && rt.renderTime) || 0;
    cam.shakeX = amp * SHAKE_MAX_OFFSET * Math.sin(31.0 * time);
    cam.shakeY = amp * SHAKE_MAX_OFFSET * Math.cos(27.0 * time);
    cam.shakeAngle = amp * SHAKE_MAX_ANGLE * Math.sin(23.0 * time);
  } else {
    cam.trauma = 0;
    cam.shakeX = 0;
    cam.shakeY = 0;
    cam.shakeAngle = 0;
  }

  cam.viewOriginX = halfW + cam.shakeX;
  cam.viewOriginY = halfH + cam.shakeY;

  // Resync screen mouse to world coordinates if screen coordinates are present
  if (input && input.mouse && input.mouse.sx !== undefined && !input.gamepadFiring) {
    screenToWorld(input.mouse.sx, input.mouse.sy, cam, input.mouse);
    if (player) {
      player.aimX = input.mouse.x;
      player.aimY = input.mouse.y;
    }
  }
}

// 0-GC Static scratch vectors
var _SCREEN_OUT = { x: 0, y: 0 };
var _WORLD_OUT = { x: 0, y: 0 };

export function screenToWorld(sx, sy, cam, out) {
  cam = cam || (rt && rt.camera) || camera;
  out = out || _WORLD_OUT;
  var viewW = cam.viewW || (rt.ui && rt.ui.width) || 960;
  var viewH = cam.viewH || (rt.ui && rt.ui.height) || 640;
  var originX = viewW * 0.5;
  var originY = viewH * 0.5;

  // 關鍵！計算逆矩陣時扣除 shakeX 與 shakeY，消除震屏對準星的干擾！
  var relX = sx - originX;
  var relY = sy - originY;

  if (cam.shakeAngle !== 0) {
    var cos = Math.cos(-cam.shakeAngle);
    var sin = Math.sin(-cam.shakeAngle);
    var rx = relX * cos - relY * sin;
    var ry = relX * sin + relY * cos;
    relX = rx;
    relY = ry;
  }

  out.x = relX + (cam.clampedX !== undefined ? cam.clampedX : cam.x);
  out.y = relY + (cam.clampedY !== undefined ? cam.clampedY : cam.y);
  return out;
}

export function worldToScreen(wx, wy, cam, out) {
  cam = cam || (rt && rt.camera) || camera;
  out = out || _SCREEN_OUT;
  var viewW = cam.viewW || (rt.ui && rt.ui.width) || 960;
  var viewH = cam.viewH || (rt.ui && rt.ui.height) || 640;
  var relX = wx - (cam.clampedX !== undefined ? cam.clampedX : cam.x);
  var relY = wy - (cam.clampedY !== undefined ? cam.clampedY : cam.y);

  if (cam.shakeAngle !== 0) {
    var cos = Math.cos(cam.shakeAngle);
    var sin = Math.sin(cam.shakeAngle);
    var rx = relX * cos - relY * sin;
    var ry = relX * sin + relY * cos;
    relX = rx;
    relY = ry;
  }

  out.x = relX + (viewW * 0.5) + cam.shakeX;
  out.y = relY + (viewH * 0.5) + cam.shakeY;
  return out;
}
