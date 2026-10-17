/**
 * DUST//REIGN - Touch Input & Coordinate Inverse Mapping
 */
import { rt } from '../core/runtime.js';
import { screenToWorld } from '../core/camera.js';

var _TOUCH_WORLD_OUT = { x: 0, y: 0 };

export function touchToWorld(clientX, clientY, cachedRect, out) {
  out = out || _TOUCH_WORLD_OUT;
  var viewW = (rt.ui && rt.ui.width) || 960;
  var viewH = (rt.ui && rt.ui.height) || 640;
  var rectW = (cachedRect && cachedRect.width) || viewW;
  var rectH = (cachedRect && cachedRect.height) || viewH;
  var rectL = (cachedRect && cachedRect.left) || 0;
  var rectT = (cachedRect && cachedRect.top) || 0;

  var sx = (clientX - rectL) * (viewW / rectW);
  var sy = (clientY - rectT) * (viewH / rectH);

  return screenToWorld(sx, sy, rt.camera, out);
}
