import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { PALETTE } from './palette.js';
import { markBorn } from './entity-style.js';

var SHADOW_DEEP = 'rgba(6, 10, 14, 0.78)';

function contact(ctx, x, y, radius, deep, stretch, lead) {
  if (!(radius > 0.5)) return;
  var s = stretch || 1;
  var rx = radius * (0.78 + 0.22 * s);
  var ry = radius * (0.34 + 0.05 * s);
  var ox = radius * 0.26 * s;
  var oy = radius * 0.34 * s + (lead || 0);
  ctx.fillStyle = deep ? SHADOW_DEEP : PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(x + ox, y + oy, Math.max(1, rx), Math.max(0.6, ry), 0.46, 0, TAU);
  ctx.fill();
}

function drawTitanShadow(ctx, e) {
  var fx = markBorn(e);
  var reduced = isReducedMotion();
  var age = (rt.renderTime || 0) - fx.born;
  var lead = reduced ? 0 : Math.max(0, 1 - age) * 110;
  contact(ctx, e.x, e.y, e.r * 1.22, true, 1.55, lead);
  if (reduced || age < 0.9 || age > 1.38) return;
  var k = (age - 0.9) / 0.48;
  ctx.save();
  ctx.globalAlpha = (1 - k) * 0.85;
  ctx.strokeStyle = '#d9c7a4';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(e.x + e.r * 0.4, e.y + e.r * 0.52 + Math.max(0, (1 - age) * 20), e.r * (0.9 + k * 2.1), e.r * (0.4 + k * 0.85), 0.46, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawContactShadows(ctx) {
  if (!ctx || !rt.state) return;
  var state = rt.state;
  var i;
  var p = state.player;
  if (p) {
    var dash = (p.dashPulse || 0) > 0;
    contact(ctx, p.x, p.y, p.r * 1.05, false, dash ? 1.5 : 1.2, 3);
  }
  var sand = state.sandMarks;
  if (sand) {
    for (i = 0; i < sand.length; i += 1) {
      var mark = sand[i];
      var fade = mark.maxLife ? mark.life / mark.maxLife : 0.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade) * 0.55;
      contact(ctx, mark.x, mark.y, mark.r || 8, false, 1.4, 0);
      ctx.restore();
    }
  }
  var enemies = state.enemies;
  if (enemies) {
    for (i = 0; i < enemies.length; i += 1) {
      var e = enemies[i];
      if (e.kind === 'burrower' && e.burrowed) {
        contact(ctx, e.x, e.y, e.r * 0.55, false, 1.6, 0);
      } else if (e.kind === 'titan' || e.kind === 'dreadnought') drawTitanShadow(ctx, e);
      else if (e.kind === 'sovereign') contact(ctx, e.x, e.y, e.r * 0.72, false, 1.15, 6);
      else if (e.kind === 'stormTower') contact(ctx, e.x, e.y, e.r * 0.9, true, 2.1, 0);
      else if (e.kind === 'brute' || e.kind === 'warden') contact(ctx, e.x, e.y, e.r * 1.08, e.kind === 'brute', e.kind === 'brute' ? 1.32 : 1.15, 0);
      else if (e.kind === 'elite') contact(ctx, e.x, e.y, e.r * 1.05, false, 1.12, 0);
      else contact(ctx, e.x, e.y, e.r, false, 1, 0);
    }
  }
  var cores = state.volatileCores;
  if (cores) {
    for (i = 0; i < cores.length; i += 1) {
      contact(ctx, cores[i].x, cores[i].y, cores[i].r * 1.15, false, 1.05, 0);
    }
  }
  var barrels = state.barrels;
  if (barrels) {
    for (i = 0; i < barrels.length; i += 1) {
      var b = barrels[i];
      var flying = b.state === 'flying';
      contact(ctx, b.x, b.y, flying ? b.r * 0.72 : b.r, false, flying ? 1.5 : 1.05, flying ? 10 : 0);
    }
  }
  var spires = state.spires;
  if (spires) {
    for (i = 0; i < spires.length; i += 1) {
      contact(ctx, spires[i].x, spires[i].y, spires[i].r * 0.95, true, 2.35, 0);
    }
  }
}
