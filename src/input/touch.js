/**
 * DUST//REIGN - Touch Input & Coordinate Inverse Mapping
 */
import { rt } from '../core/runtime.js';
import { screenToWorld } from '../core/camera.js';

var _TOUCH_WORLD_OUT = { x: 0, y: 0 };

export function touchToWorld(clientX, clientY, cachedRect, out) {
  var ui = rt.ui;
  var viewW = (ui && ui.width) || 960;
  var viewH = (ui && ui.height) || 640;
  var rect = cachedRect || {};
  var rectW = rect.width || viewW;
  var rectH = rect.height || viewH;
  var sx = (clientX - (rect.left || 0)) * (viewW / rectW);
  var sy = (clientY - (rect.top || 0)) * (viewH / rectH);

  return screenToWorld(sx, sy, rt.camera, out || _TOUCH_WORLD_OUT);
}
