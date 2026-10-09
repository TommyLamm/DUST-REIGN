import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { arcDepth, decay, ensureFx, keyGlowsOnly, outline, tickFlash } from './entity-style.js';
import { PALETTE } from './palette.js';
import { drawGlow } from './sprites.js';

function boltTo(ctx, x0, y0, x1, y1, depth, time, salt, reduced) {
  if (depth <= 0) {
    ctx.lineTo(x1, y1);
    return;
  }
  var mx = (x0 + x1) * 0.5;
  var my = (y0 + y1) * 0.5;
  if (!reduced) {
    var nx = y0 - y1;
    var ny = x1 - x0;
    var len = Math.hypot(nx, ny) || 1;
    var jag = Math.sin(time * 17 + salt) * len * 0.24;
    mx += (nx / len) * jag;
    my += (ny / len) * jag;
  }
  boltTo(ctx, x0, y0, mx, my, depth - 1, time, salt + 1.7, reduced);
  boltTo(ctx, mx, my, x1, y1, depth - 1, time, salt + 4.1, reduced);
}

function strokeBolt(ctx, x0, y0, x1, y1, depth, time, salt, reduced) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  boltTo(ctx, x0, y0, x1, y1, depth, time, salt, reduced);
  ctx.stroke();
}

function shiftOrbHist(orb, fx) {
  if (fx.h0x == null || Math.hypot(orb.x - fx.h0x, orb.y - fx.h0y) > 7) {
    fx.h2x = fx.h1x;
    fx.h2y = fx.h1y;
    fx.h1x = fx.h0x;
    fx.h1y = fx.h0y;
    fx.h0x = orb.x;
    fx.h0y = orb.y;
  }
}

function drawOrbTrail(ctx, orb, fx, color) {
  var speed = Math.hypot(orb.vx || 0, orb.vy || 0);
  if (speed < 42 || fx.h1x == null) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(orb.x, orb.y);
  ctx.lineTo(fx.h1x, fx.h1y);
  if (fx.h2x != null) ctx.lineTo(fx.h2x, fx.h2y);
  ctx.stroke();
  ctx.restore();
  if (!keyGlowsOnly()) drawGlow(ctx, orb.x, orb.y, orb.r + 8, color, 0.28);
}

export function drawOrb(ctx, orb) {
  if (!ctx || !orb) return;
  var power = orb.kind === 'overdrive';
  var repair = orb.kind === 'repair';
  var color = power ? PALETTE.emissive.gold : repair ? PALETTE.hud.rust : PALETTE.hud.mint;
  var reduced = isReducedMotion();
  var pulse = reduced ? 1 : (1 + Math.sin((rt.renderTime || 0) * 5 + orb.x) * 0.08);
  var fx = ensureFx(orb);
  shiftOrbHist(orb, fx);
  drawOrbTrail(ctx, orb, fx, color);
  var s = orb.r * pulse;
  ctx.save();
  ctx.translate(orb.x, orb.y);
  if (!keyGlowsOnly()) drawGlow(ctx, 0, 0, s * 2.2, color, power || repair ? 0.45 : 0.4);
  if (power) {
    ctx.rotate(reduced ? 0.2 : (rt.renderTime || 0) * 0.8);
    ctx.fillStyle = '#8a6420';
    ctx.fillRect(-s * 0.55, -s * 0.95, s * 1.1, s * 1.7);
    ctx.fillStyle = '#f0c85a';
    ctx.fillRect(-s * 0.42, -s * 0.78, s * 0.7, s * 1.35);
    ctx.fillStyle = '#fff1c2';
    ctx.fillRect(-s * 0.28, -s * 1.22, s * 0.28, s * 0.32);
    ctx.fillRect(s * 0.08, -s * 1.12, s * 0.24, s * 0.24);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-s * 0.55, -s * 0.95, s * 1.1, s * 1.7);
  } else if (repair) {
    ctx.fillStyle = '#7a2e22';
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.45);
    ctx.lineTo(s * 0.7, -s * 0.45);
    ctx.lineTo(s * 0.7, s * 0.45);
    ctx.lineTo(-s * 0.7, s * 0.45);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1.5);
    ctx.fillStyle = '#ffd0c2';
    ctx.fillRect(-s * 0.16, -s * 0.78, s * 0.32, s * 1.56);
    ctx.fillRect(-s * 0.78, -s * 0.16, s * 1.56, s * 0.32);
    ctx.strokeStyle = '#3a120e';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-s * 0.16, -s * 0.78, s * 0.32, s * 1.56);
    ctx.strokeRect(-s * 0.78, -s * 0.16, s * 1.56, s * 0.32);
  } else {
    ctx.rotate(reduced ? (orb.x || 0) * 0.01 : (rt.renderTime || 0) * 1.7 + (orb.x || 0));
    ctx.fillStyle = '#8d877c';
    ctx.beginPath();
    ctx.moveTo(s * 1.2, -s * 0.1);
    ctx.lineTo(-s * 0.15, s * 0.9);
    ctx.lineTo(-s * 0.85, -s * 0.2);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1.4);
    ctx.fillStyle = '#e4ddd0';
    ctx.beginPath();
    ctx.moveTo(s * 1.2, -s * 0.1);
    ctx.lineTo(s * 0.15, s * 0.12);
    ctx.lineTo(s * 0.05, -s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6e675e';
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.15);
    ctx.lineTo(s * 0.45, s * 0.85);
    ctx.lineTo(-s * 0.55, s * 0.55);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1.2);
  }
  ctx.restore();
  if (isHighContrast()) {
    ctx.save();
    ctx.font = '900 12px "Segoe UI Symbol", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var oGlyph = repair ? '+' : power ? '✦' : '●';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(oGlyph, orb.x, orb.y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(oGlyph, orb.x, orb.y);
    ctx.restore();
  }
}

export function drawCasings(ctx) {
  if (!ctx || !rt.state || !rt.state.casings) return;
  var reduced = isReducedMotion();
  var i;
  for (i = 0; i < rt.state.casings.length; i += 1) {
    var c = rt.state.casings[i];
    if (!c.active) continue;
    var fx = ensureFx(c);
    if (c.life >= c.maxLife - 0.001) {
      fx.bounced = false;
      fx.bounce = 0;
    }
    var speed = Math.hypot(c.vx || 0, c.vy || 0);
    if (!fx.bounced && speed < 22 && c.life < c.maxLife * 0.72) {
      fx.bounced = true;
      fx.bounce = 0.16;
    }
    decay(fx, 'bounce');
    var hop = 0;
    if (fx.bounce > 0) hop = Math.sin((1 - fx.bounce / 0.16) * Math.PI) * 4.5;
    ctx.save();
    ctx.translate(c.x, c.y - hop);
    ctx.rotate(c.rot || 0);
    ctx.globalAlpha = clamp(c.life / c.maxLife, 0, 1) * 0.9;
    ctx.fillStyle = '#b8893e';
    ctx.fillRect(-2.4, -0.9, 4.8, 1.8);
    ctx.fillStyle = '#f0dd9a';
    ctx.fillRect(-1.5, -0.9, 1.5, 0.7);
    if (!reduced && Math.sin((rt.renderTime || 0) * 3 + i * 1.7) > 0.965) {
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(-0.5, -0.55, 1.1, 1.1);
    }
    ctx.restore();
  }
}

function drawCoreCracks(ctx, r, count, flick) {
  var i;
  ctx.save();
  ctx.strokeStyle = '#ffd36b';
  ctx.globalAlpha = 0.35 + 0.65 * flick;
  ctx.lineWidth = 1.3;
  for (i = 0; i < count; i += 1) {
    var a = (i / count) * TAU + 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
    ctx.lineTo(Math.cos(a + 0.25) * r * 0.72, Math.sin(a + 0.25) * r * 0.72);
    ctx.lineTo(Math.cos(a + 0.05) * r * 1.15, Math.sin(a + 0.05) * r * 1.15);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCores(ctx) {
  if (!ctx || !rt.state || !rt.state.volatileCores) return;
  var reduced = isReducedMotion();
  var i;
  for (i = 0; i < rt.state.volatileCores.length; i += 1) {
    var core = rt.state.volatileCores[i];
    var flashing = tickFlash(core);
    var ratio = core.maxHp > 0 ? clamp(core.hp / core.maxHp, 0, 1) : 1;
    var cracks = 2 + ((1 - ratio) * 4) | 0;
    var flick = reduced ? 1 : (0.72 + 0.28 * Math.sin((rt.renderTime || 0) * (4 + (1 - ratio) * 14)));
    var rad = core.r * 1.3;
    ctx.save();
    ctx.translate(core.x, core.y);
    ctx.rotate(core.rot || 0);
    ctx.beginPath();
    ctx.moveTo(rad, 0);
    ctx.lineTo(0, rad);
    ctx.lineTo(-rad, 0);
    ctx.lineTo(0, -rad);
    ctx.closePath();
    ctx.fillStyle = flashing ? '#ffffff' : '#3a2e22';
    ctx.fill();
    if (!flashing) {
      ctx.fillStyle = '#6a5438';
      ctx.beginPath();
      ctx.moveTo(0, -rad);
      ctx.lineTo(-rad * 0.35, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(rad, 0);
    ctx.lineTo(0, rad);
    ctx.lineTo(-rad, 0);
    ctx.lineTo(0, -rad);
    ctx.closePath();
    outline(ctx, 1.6);
    if (!flashing) drawCoreCracks(ctx, core.r, cracks, flick);
    if (!keyGlowsOnly() && !flashing) drawGlow(ctx, 0, 0, core.r * (1.1 + (1 - ratio)) + 8, PALETTE.emissive.gold, 0.35 + (1 - ratio) * 0.4);
    ctx.fillStyle = flashing ? '#ffffff' : '#fff2b2';
    ctx.globalAlpha = flick;
    ctx.beginPath();
    ctx.moveTo(core.r * 0.55, 0);
    ctx.lineTo(0, core.r * 0.55);
    ctx.lineTo(-core.r * 0.55, 0);
    ctx.lineTo(0, -core.r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function drawBarrels(ctx) {
  if (!ctx || !rt.state || !rt.state.barrels) return;
  var i;
  var sx;
  for (i = 0; i < rt.state.barrels.length; i += 1) {
    var barrel = rt.state.barrels[i];
    var flashing = tickFlash(barrel);
    var r = barrel.r;
    ctx.save();
    ctx.translate(barrel.x, barrel.y);
    if (barrel.state === 'flying') {
      var spd = Math.hypot(barrel.vx || 0, barrel.vy || 0) || 1;
      var bx = -(barrel.vx || 0) / spd;
      var by = -(barrel.vy || 0) / spd;
      var f;
      for (f = 1; f <= 3; f += 1) {
        var px = bx * (r + f * 7);
        var py = by * (r + f * 7);
        if (!keyGlowsOnly()) drawGlow(ctx, px, py, 10 - f, f === 1 ? '#ffd36b' : PALETTE.emissive.hostile, 0.5 - f * 0.12);
        ctx.save();
        ctx.globalAlpha = 0.75 - f * 0.18;
        ctx.fillStyle = f === 1 ? '#fff1c2' : '#ff6a3d';
        ctx.beginPath();
        ctx.arc(px, py, 5.5 - f, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    if (barrel.rot) ctx.rotate(barrel.rot);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = '#221c18';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 1.6, 0, TAU);
    ctx.clip();
    ctx.fillStyle = flashing ? '#ffffff' : '#d9631e';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    if (!flashing) {
      ctx.fillStyle = '#1c1917';
      var stripeW = 5;
      for (sx = -r * 2; sx < r * 2; sx += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(sx, -r);
        ctx.lineTo(sx + stripeW, -r);
        ctx.lineTo(sx + stripeW - r * 0.7, r);
        ctx.lineTo(sx - r * 0.7, r);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, TAU);
    outline(ctx, 2);
    if (!flashing) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(r * 0.28, r * 0.32, r * 0.5, r * 0.28, 0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 214, 160, 0.3)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.22, -r * 0.26, r * 0.38, r * 0.2, 0.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 12, 8, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(r * 0.18, r * 0.22, r * 0.22, 0.2, 2.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.34, r * 0.05, r * 0.16, 1.2, 3.4);
      ctx.stroke();
    }
    ctx.fillStyle = flashing ? '#ffffff' : '#c9852a';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.08, r * 0.42, r * 0.28, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#221c18';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = flashing ? '#ffffff' : '#f5a623';
    ctx.beginPath();
    ctx.arc(0, -r * 0.08, 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

export function drawSpires(ctx) {
  if (!ctx || !rt.state || !rt.state.spires) return;
  var reduced = isReducedMotion();
  var depth = arcDepth();
  var time = rt.renderTime || 0;
  var i;
  for (i = 0; i < rt.state.spires.length; i += 1) {
    var spire = rt.state.spires[i];
    var resonating = spire.resonanceTimer > 0;
    var baseR = spire.r + 5;
    var mastX = -spire.r * 0.42;
    var mastY = -spire.r * 1.05;
    ctx.save();
    ctx.translate(spire.x, spire.y);
    ctx.fillStyle = '#1c1a18';
    ctx.beginPath();
    var bi;
    for (bi = 0; bi < 8; bi += 1) {
      var bAng = (bi / 8) * TAU + Math.PI / 8;
      var bx = Math.cos(bAng) * baseR;
      var by = Math.sin(bAng) * baseR;
      if (bi === 0) ctx.moveTo(bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = resonating ? PALETTE.emissive.tech : '#453f3a';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#2a2420';
    ctx.beginPath();
    ctx.arc(0, 0, spire.r * 0.72, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#b8653b';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, spire.r * 0.58, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#6a5044';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(spire.r * 0.15, spire.r * 0.1);
    ctx.lineTo(mastX, mastY);
    ctx.stroke();
    ctx.fillStyle = resonating ? '#f4fdff' : PALETTE.emissive.tech;
    ctx.beginPath();
    ctx.arc(mastX, mastY, resonating ? 5.4 : 4.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (!keyGlowsOnly()) drawGlow(ctx, mastX, mastY, resonating ? 18 : 9, PALETTE.emissive.tech, resonating ? 0.7 : 0.4);
    ctx.strokeStyle = resonating ? '#e8fbff' : 'rgba(91, 231, 255, 0.75)';
    ctx.lineWidth = resonating ? 1.6 : 1.15;
    if (resonating) {
      var bolt;
      var bolts = depth >= 3 ? 7 : (depth === 2 ? 5 : 4);
      for (bolt = 0; bolt < bolts; bolt += 1) {
        var ang = (bolt / bolts) * TAU + (reduced ? 0.3 : time * 0.4);
        var len = spire.r * (1.8 + (bolt % 2) * 0.45);
        strokeBolt(ctx, mastX, mastY, mastX + Math.cos(ang) * len, mastY + Math.sin(ang) * len, depth, time, bolt * 2.2, reduced);
      }
    } else if (reduced) {
      ctx.beginPath();
      ctx.moveTo(mastX, mastY);
      ctx.lineTo(mastX + 5, mastY - 7);
      ctx.lineTo(mastX - 2, mastY - 12);
      ctx.stroke();
    } else {
      strokeBolt(ctx, mastX, mastY, mastX + 4, mastY - 14, 1, time, i, false);
    }
    ctx.restore();
  }
}
