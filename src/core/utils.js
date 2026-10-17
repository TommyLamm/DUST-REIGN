import { rt } from './runtime.js';

function q(selector, root) {
  return (root || document).querySelector(selector);
}

export function qa(selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

export function first(selectors, root) {
  for (var i = 0; i < selectors.length; i += 1) {
    var found = q(selectors[i], root);
    if (found) return found;
  }
  return null;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function dist2(ax, ay, bx, by) {
  var dx = ax - bx;
  var dy = ay - by;
  return dx * dx + dy * dy;
}

export function on(target, name, handler, options) {
  target.addEventListener(name, handler, options);
  rt.listeners.push(function () { target.removeEventListener(name, handler, options); });
}

export function setText(node, value) {
  if (node) {
    var str = String(value);
    if (node._lastText !== str) {
      node._lastText = str;
      node.textContent = str;
    }
  }
}

export function fastUnorderedRemove(list, index) {
  var len = list.length;
  if (len === 0 || index < 0 || index >= len) return;
  list[index] = list[len - 1];
  list.length = len - 1;
}

