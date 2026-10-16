import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { PALETTE } from './palette.js';
import { markBorn } from './entity-style.js';

var SHADOW_CORE = 'rgba(2, 3, 5, 0.94)';
var SHADOW_PENUMBRA = 'rgba(4, 6, 9, 0.45)';
var SHADOW_DEEP = 'rgba(2, 3, 5, 0.96)';

export function contact(ctx, x, y, radius, deep, stretch, lead, altitude) {
  if (!(radius > 0.5)) return;
  var alt = altitude || 0;
  if (alt < 0) alt = 0;
  var s = stretch || 1;

  // Tier 2 (Penumbra): ~135% radius with elevation spread
  var penScale = 1 + alt * 0.45;
  var rxPen = radius * 1.35 * (0.78 + 0.22 * s) * penScale;
  var ryPen = radius * 1.35 * (0.34 + 0.05 * s) * penScale;
  var oxPen = radius * 0.26 * s;
  var oyPen = radius * 0.34 * s + (lead || 0) + alt * 14;

  ctx.fillStyle = SHADOW_PENUMBRA;
  ctx.beginPath();
  ctx.ellipse(x + oxPen, y + oyPen, Math.max(1, rxPen), Math.max(0.6, ryPen), 0.46, 0, TAU);
  ctx.fill();

  // Tier 1 (Core AO): ~70% radius hard contact line; shrinks and fades out as altitude rises
  if (alt < 0.85) {
    var coreAlpha = Math.max(0, 1 - alt * 1.25);
    if (coreAlpha > 0.04) {
      var shrink = 1 - alt * 0.4;
      var rxCore = radius * 0.70 * (0.78 + 0.22 * s) * shrink;
      var ryCore = radius * 0.70 * (0.34 + 0.05 * s) * shrink;
      var oxCore = radius * 0.18 * s;
      var oyCore = radius * 0.24 * s + (lead ? lead * 0.7 : 0);

      ctx.save();
      if (coreAlpha < 0.99) {
        ctx.globalAlpha = (ctx.globalAlpha || 1) * coreAlpha;
      }
      ctx.fillStyle = deep ? SHADOW_DEEP : (PALETTE.shadow || SHADOW_CORE);
      ctx.beginPath();
      ctx.ellipse(x + oxCore, y + oyCore, Math.max(0.8, rxCore), Math.max(0.5, ryCore), 0.46, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawTitanShadow(ctx, e) {
  var fx = markBorn(e);
  var reduced = isReducedMotion();
  var age = (rt.renderTime || 0) - fx.born;
  var lead = reduced ? 0 : Math.max(0, 1 - age) * 110;
  contact(ctx, e.x, e.y, e.r * 1.22, true, 1.55, lead, 0);
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
    contact(ctx, p.x, p.y, p.r * 1.05, false, dash ? 1.5 : 1.2, 3, p.altitude || 0);
  }
  var sand = state.sandMarks;
  if (sand) {
    for (i = 0; i < sand.length; i += 1) {
      var mark = sand[i];
      var fade = mark.maxLife ? mark.life / mark.maxLife : 0.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade) * 0.55;
      contact(ctx, mark.x, mark.y, mark.r || 8, false, 1.4, 0, 0);
      ctx.restore();
    }
  }
  var enemies = state.enemies;
  if (enemies) {
    for (i = 0; i < enemies.length; i += 1) {
      var e = enemies[i];
      var alt = e.altitude || e.z || 0;
      if (e.kind === 'burrower' && e.burrowed) {
        contact(ctx, e.x, e.y, e.r * 0.55, false, 1.6, 0, 0);
      } else if (e.kind === 'titan' || e.kind === 'dreadnought') {
        drawTitanShadow(ctx, e);
      } else if (e.kind === 'sovereign') {
        contact(ctx, e.x, e.y, e.r * 0.85, true, 1.2, 4, 0.45);
      } else if (e.kind === 'stormTower') {
        contact(ctx, e.x, e.y, e.r * 0.9, true, 2.1, 0, 0);
      } else if (e.kind === 'brute' || e.kind === 'warden') {
        contact(ctx, e.x, e.y, e.r * 1.08, e.kind === 'brute', e.kind === 'brute' ? 1.32 : 1.15, 0, alt);
      } else if (e.kind === 'elite') {
        contact(ctx, e.x, e.y, e.r * 1.05, false, 1.12, 0, alt);
      } else {
        contact(ctx, e.x, e.y, e.r, false, 1, 0, alt);
      }
    }
  }
  var cores = state.volatileCores;
  if (cores) {
    for (i = 0; i < cores.length; i += 1) {
      contact(ctx, cores[i].x, cores[i].y, cores[i].r * 1.15, false, 1.05, 0, 0);
    }
  }
  var barrels = state.barrels;
  if (barrels) {
    for (i = 0; i < barrels.length; i += 1) {
      var b = barrels[i];
      var flying = b.state === 'flying';
      var bAlt = flying ? Math.min(1, Math.max(0.35, (b.flyingTimer != null ? b.flyingTimer / 1.2 : 0.6))) : 0;
      contact(ctx, b.x, b.y, b.r, false, flying ? 1.4 : 1.05, 0, bAlt);
    }
  }
  var spires = state.spires;
  if (spires) {
    for (i = 0; i < spires.length; i += 1) {
      contact(ctx, spires[i].x, spires[i].y, spires[i].r * 0.95, true, 2.35, 0, 0);
    }
  }
  var tacticals = state.tacticalEntities;
  if (tacticals) {
    for (i = 0; i < tacticals.length; i += 1) {
      var te = tacticals[i];
      if (!te) continue;
      contact(ctx, te.x, te.y, (te.r || 14) * 0.9, false, 1.1, 0, te.altitude || 0);
    }
  }
}
