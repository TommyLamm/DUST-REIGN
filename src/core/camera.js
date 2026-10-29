/**
 * DUST//REIGN - Camera Tracking & Viewport System
 * Core Invariants:
 * 1. Player follow with soft world clamp: interior tracking stays player-centered;
 *    near map edges the camera biases inward so most of the view stays playable ground
 *    (avoids half-screen void + swarm pinch against the hatch).
 * 2. Player is hard-clamped by the simulation; void / barrier still drawn by render/boundary.js
 *    for the thin strip that can remain at extreme edges.
 * 3. Trauma-based Orthogonal Screen Shake (Prime non-resonant frequencies, decoupling for mouse aim)
 * 4. 0-GC Execution Budget
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

  // Prefer live canvas CSS size (rt.ui) over a stale cam.viewW from pre-layout deploy.
  var viewW = (rt.ui && rt.ui.width) || cam.viewW || 960;
  var viewH = (rt.ui && rt.ui.height) || cam.viewH || 640;
  cam.viewW = viewW;
  cam.viewH = viewH;
  if (rt.ui && rt.ui.dpr) cam.dpr = rt.ui.dpr;

  // Follow the player, then soft-clamp the view center inside the world so the
  // hatch/void never eats half the screen when the hull is rim-pinned.
  var halfW = viewW * 0.5;
  var halfH = viewH * 0.5;
  var worldW = cam.worldW || (rt.state && rt.state.width) || 3520;
  var worldH = cam.worldH || (rt.state && rt.state.height) || 2640;
  cam.worldW = worldW;
  cam.worldH = worldH;

  if (player) {
    cam.targetX = player.x;
    cam.targetY = player.y;
    cam.followX = player.x;
    cam.followY = player.y;
    var minCX = worldW > viewW ? halfW : worldW * 0.5;
    var maxCX = worldW > viewW ? (worldW - halfW) : worldW * 0.5;
    var minCY = worldH > viewH ? halfH : worldH * 0.5;
    var maxCY = worldH > viewH ? (worldH - halfH) : worldH * 0.5;
    cam.x = clamp(player.x, minCX, maxCX);
    cam.y = clamp(player.y, minCY, maxCY);
  }
  cam.lookaheadX = 0;
  cam.lookaheadY = 0;
  cam.lookaheadVX = 0;
  cam.lookaheadVY = 0;
  cam.targetLookaheadX = 0;
  cam.targetLookaheadY = 0;

  cam.clampedX = cam.x;
  cam.clampedY = cam.y;
  cam.renderedX = cam.x;
  cam.renderedY = cam.y;

  // 2. Trauma-based Screen Shake (Prime non-resonant frequencies)
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
  var viewW = (rt.ui && rt.ui.width) || cam.viewW || 960;
  var viewH = (rt.ui && rt.ui.height) || cam.viewH || 640;
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
  var viewW = (rt.ui && rt.ui.width) || cam.viewW || 960;
  var viewH = (rt.ui && rt.ui.height) || cam.viewH || 640;
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
