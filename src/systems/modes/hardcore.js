import { rt } from '../../core/runtime.js';
import { damagePlayer } from '../combat.js';

/**
 * Big-World Hardcore Operations System Adapter
 * - Implements Converging Dark Storm (黑風暴縮圈機制) shrinking towards the ultimate extraction epicenter
 * - Outside storm circle: 6% max HP corrosion true damage every 0.5s + 25% movement speed penalty
 */

export function initHardcoreOperation(state, operationConfig) {
  if (!state) return;
  var boundW = (rt.ui && rt.ui.width) || state.width || 960;
  var boundH = (rt.ui && rt.ui.height) || state.height || 640;
  var centerX = boundW * 0.5;
  var centerY = boundH * 0.5;

  state.toxicRing = {
    x: centerX,
    y: centerY,
    r: 1600,
    active: true
  };
  state.toxicTick = 0;
}

export function stepHardcoreMode(dt, frame) {
  var state = rt.state;
  if (!state || state.mode !== 'hardcore' || state.over || state.stageCleared) return;
  var p = frame.p;
  if (!p) return;

  var elapsed = state.stageElapsed || 0;
  var boundW = frame.boundW || 960;
  var boundH = frame.boundH || 640;
  var cx = boundW * 0.5;
  var cy = boundH * 0.5;

  // Converging Dark Storm radius math:
  // Phase 1 (0 ~ 45s): 1600px -> 1200px
  // Phase 2 (45 ~ 90s): 1200px -> 700px
  // Phase 3 (90s+): 700px -> 450px (locked at 450px)
  var currentR;
  if (elapsed <= 45) {
    currentR = 1600 - (elapsed / 45) * 400;
  } else if (elapsed <= 90) {
    currentR = 1200 - ((elapsed - 45) / 45) * 500;
  } else {
    currentR = Math.max(450, 700 - (elapsed - 90) * 12);
  }
  state.toxicRing = Object.assign(state.toxicRing || {}, { x: cx, y: cy, r: currentR, active: true });

  // Player distance to storm epicenter
  var pDist = Math.hypot(p.x - cx, p.y - cy);
  var outsideStorm = pDist > currentR;

  if (outsideStorm) {
    p.toxicSlow = 0.25;
    state.toxicTick = (state.toxicTick || 0) + dt;
    if (state.toxicTick >= 0.5) {
      state.toxicTick -= 0.5;
      var corrosionDmg = Math.max(1, Math.round((p.maxHp || 100) * 0.06));
      damagePlayer(corrosionDmg, 'zone');
      rt.state.hurtFlash = Math.max(rt.state.hurtFlash || 0, 0.3);
    }
  } else {
    p.toxicSlow = 0;
    state.toxicTick = 0;
  }
}
