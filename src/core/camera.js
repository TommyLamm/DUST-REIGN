/**
 * DUST//REIGN - Camera Tracking Dynamics, Aim Lookahead & Viewport System
 * Core Invariants:
 * 1. Asymmetric Dual-Stage Damping (Cruise: 8.5 s^-1, Dash: 24.0 s^-1)
 * 2. Soft-Leash Deadzone (0.12 * min(viewW, viewH))
 * 3. Bi-directional Aim Lookahead (Hermite curve, deadzone 70px, O_max = 0.22 * min(viewW, viewH))
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
  targetX: 480,
  targetY: 320,

  // Aim lookahead offset
  lookaheadX: 0,
  lookaheadY: 0,
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

var SHAKE_MAX_OFFSET = 18.0;
var SHAKE_MAX_ANGLE = 0.022; // ~1.26 deg

export function initCamera(cam, worldW, worldH, viewW, viewH) {
  if (typeof cam === 'number') {
    viewH = viewW;
    viewW = worldH;
    worldH = worldW;
    worldW = cam;
    cam = camera;
  }
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

  cam.lookaheadX = 0;
  cam.lookaheadY = 0;
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
  // Support flexible argument patterns
  if (typeof cam === 'number') {
    dt = cam;
    cam = camera;
    player = rt.state && rt.state.player;
    input = rt.input;
  }
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

  if (player) {
    cam.targetX = player.x;
    cam.targetY = player.y;

    // 1. Asymmetric Dual-Stage Dynamic Damping
    // Cruise: lambda = 8.5 s^-1 (half-life ~ 81.5 ms)
    // High-speed / Dash (V > 380 px/s or dashing): lambda = 24.0 s^-1 (half-life ~ 28.8 ms)
    var pSpeed = Math.hypot(player.vx || 0, player.vy || 0);
    var isDashing = Boolean((player.dashPulse && player.dashPulse > 0) || player.isDashing || (pSpeed > 380));
    var lambdaFollow = isDashing ? 24.0 : 8.5;
    var decayFollow = Math.exp(-lambdaFollow * dt);

    cam.x = cam.targetX + (cam.x - cam.targetX) * decayFollow;
    cam.y = cam.targetY + (cam.y - cam.targetY) * decayFollow;

    // Soft-Leash Deadzone: R_leash_max = min(viewW, viewH) * 0.12 (~76.8 px)
    var maxLeash = Math.min(viewW, viewH) * 0.12;
    var dx = player.x - cam.x;
    var dy = player.y - cam.y;
    var leashDist = Math.hypot(dx, dy);
    if (leashDist > maxLeash && leashDist > 0.0001) {
      cam.x = player.x - (dx / leashDist) * maxLeash;
      cam.y = player.y - (dy / leashDist) * maxLeash;
    }

    // 2. Aim Lookahead
    var maxLookahead = Math.min(viewW, viewH) * 0.22; // ~140 px
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
      // Mouse/Pointer Lookahead
      var aimTargetX = (player.aimX !== undefined) ? player.aimX : (input && input.mouse ? input.mouse.x : player.x);
      var aimTargetY = (player.aimY !== undefined) ? player.aimY : (input && input.mouse ? input.mouse.y : player.y);
      var aimDx = aimTargetX - player.x;
      var aimDy = aimTargetY - player.y;
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

    // Asymmetric lookahead smoothing:
    // Retract: lambda = 12.0 s^-1; Extend: lambda = 5.5 s^-1
    var curLookMag = Math.hypot(cam.lookaheadX, cam.lookaheadY);
    var targetLookMag = Math.hypot(targetLookX, targetLookY);
    var isRetracting = targetLookMag < curLookMag;
    var lambdaLook = isRetracting ? 12.0 : 5.5;
    var decayLook = Math.exp(-lambdaLook * dt);

    cam.lookaheadX = targetLookX + (cam.lookaheadX - targetLookX) * decayLook;
    cam.lookaheadY = targetLookY + (cam.lookaheadY - targetLookY) * decayLook;
  }

  // 3. World Boundary Clamping
  // Center including lookahead
  var desiredCenterX = cam.x + cam.lookaheadX;
  var desiredCenterY = cam.y + cam.lookaheadY;

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
  if (input && input.mouse && input.mouse.sx !== undefined && !input.touchMode && !input.gamepadFiring) {
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
