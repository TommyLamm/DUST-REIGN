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

function crateColor(payload) {
  if (payload === 'battery') return PALETTE.emissive.tech;
  if (payload === 'reroll') return PALETTE.hud.amber;
  if (payload === 'overdrive') return PALETTE.emissive.gold;
  return PALETTE.hud.rust;
}

export function drawOrb(ctx, orb) {
  if (!ctx || !orb) return;
  var crate = orb.kind === 'crate' || orb.type === 'crate';
  var power = !crate && orb.kind === 'overdrive';
  var repair = !crate && orb.kind === 'repair';
  var color = crate ? crateColor(orb.payload) : power ? PALETTE.emissive.gold : repair ? PALETTE.hud.rust : PALETTE.hud.mint;
  var fadeWrap = false;
  if (crate && orb.life <= 3) {
    fadeWrap = true;
    ctx.save();
    if (isReducedMotion()) ctx.globalAlpha = Math.max(0.25, (orb.life || 0) / 3);
    else ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin((rt.renderTime || 0) * 10));
  }
  var reduced = isReducedMotion();
  var pulse = reduced ? 1 : (1 + Math.sin((rt.renderTime || 0) * 5 + orb.x) * 0.08);
  var fx = ensureFx(orb);
  shiftOrbHist(orb, fx);
  drawOrbTrail(ctx, orb, fx, color);
  var s = orb.r * pulse;

  // 1. Fixed Ground Contact Shadow & Halo (y + 4px)
  var groundY = orb.y + 4;
  ctx.save();
  ctx.translate(orb.x, groundY);
  if (power) {
    // Overclock Core ground shadow & pulsing aura ring
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.35, s * 0.65, 0, 0, TAU);
    ctx.fillStyle = 'rgba(4, 4, 6, 0.82)';
    ctx.fill();

    var ocPulse = reduced ? 0.8 : (0.65 + 0.35 * Math.sin((rt.renderTime || 0) * 8 + (orb.x || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.45, s * 0.72, 0, 0, TAU);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 215, 80, ' + (0.75 * ocPulse).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (repair) {
    // Repair Scrap ground shadow & emergency ring
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.4, s * 0.7, 0, 0, TAU);
    ctx.fillStyle = 'rgba(4, 3, 6, 0.85)';
    ctx.fill();

    var repPulse = reduced ? 0.8 : (0.6 + 0.4 * Math.sin((rt.renderTime || 0) * 6 + (orb.x || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.45, s * 0.72, 0, 0, TAU);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 77, 61, ' + (0.75 * repPulse).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (crate) {
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.4, s * 0.7, 0, 0, TAU);
    ctx.fillStyle = 'rgba(4, 4, 6, 0.85)';
    ctx.fill();
  } else {
    // Normal Scrap: Ground shadow fixed at y + 4px
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.35, s * 0.65, 0, 0, TAU);
    ctx.fillStyle = 'rgba(4, 4, 6, 0.82)';
    ctx.fill();

    // 12px diameter pulsing holographic halo (thin mint green / gold)
    var scrapPulse = reduced ? 0.75 : (0.55 + 0.45 * Math.sin((rt.renderTime || 0) * 6 + (orb.x || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 3.2, 0, 0, TAU); // 12px diameter
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(110, 231, 183, ' + (0.75 * scrapPulse).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();

  // 2. Vertical Beacon Beams (Projected upwards from orb.x, orb.y)
  if (repair) {
    // 32px Vertical Semi-transparent Emergency Beacon Beam
    ctx.save();
    var repBeamGrad = ctx.createLinearGradient(0, orb.y, 0, orb.y - 32);
    repBeamGrad.addColorStop(0, 'rgba(255, 45, 35, 0.6)');
    repBeamGrad.addColorStop(0.5, 'rgba(255, 100, 80, 0.35)');
    repBeamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = repBeamGrad;
    ctx.fillRect(orb.x - s * 0.75, orb.y - 32, s * 1.5, 32);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(orb.x, orb.y);
    ctx.lineTo(orb.x, orb.y - 32);
    ctx.stroke();
    ctx.restore();
  } else if (power) {
    // 36px Golden Vertical Energy Beam
    ctx.save();
    var ocBeamGrad = ctx.createLinearGradient(0, orb.y, 0, orb.y - 36);
    ocBeamGrad.addColorStop(0, 'rgba(255, 215, 0, 0.65)');
    ocBeamGrad.addColorStop(0.5, 'rgba(255, 230, 100, 0.35)');
    ocBeamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = ocBeamGrad;
    ctx.fillRect(orb.x - s * 0.8, orb.y - 36, s * 1.6, 36);
    ctx.strokeStyle = 'rgba(255, 255, 230, 0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(orb.x, orb.y);
    ctx.lineTo(orb.x, orb.y - 36);
    ctx.stroke();
    ctx.restore();
  } else if (crate) {
    // 28px Cargo Crate Vertical Beacon
    ctx.save();
    var crBeamGrad = ctx.createLinearGradient(0, orb.y, 0, orb.y - 28);
    crBeamGrad.addColorStop(0, color);
    crBeamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = crBeamGrad;
    ctx.fillRect(orb.x - s * 0.8, orb.y - 28, s * 1.6, 28);
    ctx.restore();
  }

  // 3. Floating Entity Body (with 2.5Hz sine wave vertical floating 3.5~4px)
  var bobY = reduced ? 0 : Math.sin((rt.renderTime || 0) * 2.5 * TAU + (orb.x || 0)) * 3.8;
  var bodyY = orb.y + bobY - 2;

  ctx.save();
  ctx.translate(orb.x, bodyY);
  if (!keyGlowsOnly()) drawGlow(ctx, 0, 0, s * 2.2, color, power || repair ? 0.45 : 0.4);

  if (power) {
    // Overclock Core (金色超頻核心): Heavy angle-iron reinforced container + inverted high-contrast icon
    ctx.rotate(reduced ? 0.2 : (rt.renderTime || 0) * 0.8);

    // Thick obsidian outer housing
    ctx.fillStyle = '#14100c';
    ctx.fillRect(-s * 0.62, -s * 1.02, s * 1.24, s * 1.84);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.6;
    ctx.strokeRect(-s * 0.62, -s * 1.02, s * 1.24, s * 1.84);

    // Radiant electric gold battery housing
    ctx.fillStyle = '#946e22';
    ctx.fillRect(-s * 0.52, -s * 0.92, s * 1.04, s * 1.64);
    ctx.fillStyle = '#f5c642';
    ctx.fillRect(-s * 0.38, -s * 0.75, s * 0.76, s * 1.3);

    // White-hot superconductor core beam
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.2, -s * 0.62, s * 0.4, s * 1.04);

    // Top terminal anode / cathode studs in bright platinum
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.32, -s * 1.25, s * 0.28, s * 0.32);
    ctx.fillRect(s * 0.08, -s * 1.15, s * 0.24, s * 0.24);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-s * 0.32, -s * 1.25, s * 0.28, s * 0.32);
    ctx.strokeRect(s * 0.08, -s * 1.15, s * 0.24, s * 0.24);

    // Sharp inner border
    ctx.strokeStyle = '#ffdf7a';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-s * 0.52, -s * 0.92, s * 1.04, s * 1.64);
  } else if (repair) {
    // Repair Scrap: 2.5px pure black outline + crimson box body + blazing white cross core (2Hz breath flashing)
    ctx.fillStyle = '#000000';
    ctx.fillRect(-s * 0.78, -s * 0.52, s * 1.56, s * 1.04);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-s * 0.78, -s * 0.52, s * 1.56, s * 1.04);

    // Crimson box body
    ctx.fillStyle = '#c5221f';
    ctx.fillRect(-s * 0.68, -s * 0.42, s * 1.36, s * 0.84);

    // Blazing pure white emergency cross core (2Hz breathing flash)
    var crossBreath = reduced ? 1 : (0.75 + 0.25 * Math.sin((rt.renderTime || 0) * 2 * TAU));
    ctx.fillStyle = '#ff4d3d';
    ctx.fillRect(-s * 0.22, -s * 0.82, s * 0.44, s * 1.64);
    ctx.fillRect(-s * 0.82, -s * 0.22, s * 1.64, s * 0.44);

    ctx.save();
    ctx.globalAlpha = crossBreath;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.12, -s * 0.72, s * 0.24, s * 1.44);
    ctx.fillRect(-s * 0.72, -s * 0.12, s * 1.44, s * 0.24);
    ctx.restore();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(-s * 0.22, -s * 0.82, s * 0.44, s * 1.64);
    ctx.strokeRect(-s * 0.82, -s * 0.22, s * 1.64, s * 0.44);

    // Cross micro-flare rays
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.25);
    ctx.lineTo(0, s * 1.25);
    ctx.moveTo(-s * 1.25, 0);
    ctx.lineTo(s * 1.25, 0);
    ctx.strokeStyle = 'rgba(255, 230, 220, ' + (0.85 * crossBreath).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (crate) {
    // Supply Crates: heavy angle-iron reinforced container & inverted high-contrast icon
    ctx.fillStyle = '#1e1a14';
    ctx.fillRect(-s * 0.9, -s * 0.7, s * 1.8, s * 1.4);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.8;
    ctx.strokeRect(-s * 0.9, -s * 0.7, s * 1.8, s * 1.4);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-s * 0.86, -s * 0.66, s * 1.72, s * 1.32);

    // Angle-iron reinforced corners
    ctx.fillStyle = '#5c4832';
    ctx.fillRect(-s * 0.9, -s * 0.7, s * 0.35, s * 0.28);
    ctx.fillRect(s * 0.55, -s * 0.7, s * 0.35, s * 0.28);
    ctx.fillRect(-s * 0.9, s * 0.42, s * 0.35, s * 0.28);
    ctx.fillRect(s * 0.55, s * 0.42, s * 0.35, s * 0.28);

    // Payload high-contrast icon
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    if (orb.payload === 'reroll') {
      ctx.beginPath();
      ctx.arc(0, s * 0.04, s * 0.28, 0.4, TAU - 0.2);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else if (orb.payload === 'battery') {
      ctx.fillRect(-s * 0.16, -s * 0.05, s * 0.32, s * 0.55);
      ctx.fillRect(-s * 0.08, -s * 0.16, s * 0.16, s * 0.12);
    } else if (orb.payload === 'overdrive') {
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.35);
      ctx.lineTo(-s * 0.22, s * 0.05);
      ctx.lineTo(s * 0.02, s * 0.05);
      ctx.lineTo(-s * 0.08, s * 0.4);
      ctx.lineTo(s * 0.28, -s * 0.02);
      ctx.lineTo(s * 0.02, -s * 0.02);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(-s * 0.1, -s * 0.28, s * 0.2, s * 0.7);
      ctx.fillRect(-s * 0.32, -s * 0.08, s * 0.64, s * 0.2);
    }
  } else {
    // Normal Scrap: 3D arcade floating metal chunk
    ctx.rotate(reduced ? (orb.x || 0) * 0.01 : (rt.renderTime || 0) * 1.7 + (orb.x || 0));

    // Dark silhouette backing
    ctx.beginPath();
    ctx.moveTo(s * 1.25, -s * 0.12);
    ctx.lineTo(-s * 0.18, s * 0.95);
    ctx.lineTo(-s * 0.9, -s * 0.24);
    ctx.closePath();
    ctx.fillStyle = '#060606';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Base metallic alloy
    ctx.fillStyle = '#9c9588';
    ctx.beginPath();
    ctx.moveTo(s * 1.2, -s * 0.1);
    ctx.lineTo(-s * 0.15, s * 0.9);
    ctx.lineTo(-s * 0.85, -s * 0.2);
    ctx.closePath();
    ctx.fill();

    // Polished chrome specular highlight facet
    ctx.fillStyle = '#faf6ed';
    ctx.beginPath();
    ctx.moveTo(s * 1.2, -s * 0.1);
    ctx.lineTo(s * 0.15, s * 0.12);
    ctx.lineTo(s * 0.05, -s * 0.45);
    ctx.closePath();
    ctx.fill();

    // Deep dark-bevel facet
    ctx.fillStyle = '#5c554c';
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.15);
    ctx.lineTo(s * 0.45, s * 0.85);
    ctx.lineTo(-s * 0.55, s * 0.55);
    ctx.closePath();
    ctx.fill();

    outline(ctx, 1.4);

    // Specular glint tip at apex (s * 1.15, -s * 0.1)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s * 1.15, -s * 0.1, 1.8, 0, TAU);
    ctx.fill();

    // Dynamic micro-starburst flash 1 frame every 1.2s
    var glintPhase = ((rt.renderTime || 0) + (orb.x * 0.07)) % 1.2;
    if (!reduced && glintPhase < 0.08) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(s * 1.15 - 5, -s * 0.1);
      ctx.lineTo(s * 1.15 + 5, -s * 0.1);
      ctx.moveTo(s * 1.15, -s * 0.1 - 5);
      ctx.lineTo(s * 1.15, -s * 0.1 + 5);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  if (isHighContrast()) {
    ctx.save();
    ctx.font = '900 12px "Segoe UI Symbol", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var oGlyph = crate ? (orb.payload === 'reroll' ? 'R' : orb.payload === 'battery' ? 'B' : '+') : repair ? '+' : power ? '✦' : '●';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(oGlyph, orb.x, bodyY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(oGlyph, orb.x, bodyY);
    ctx.restore();
  }
  if (fadeWrap) ctx.restore();
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
  drawConvoys(ctx);
}

function drawConvoys(ctx) {
  if (!ctx || !rt.state || !rt.state.convoy) return;
  var c = rt.state.convoy;
  var ratio = c.maxHp > 0 ? clamp(c.hp / c.maxHp, 0, 1) : 1;
  ctx.save();
  ctx.translate(c.x, c.y);
  if ((c.vx || 0) < 0) ctx.scale(-1, 1);
  ctx.fillStyle = '#3a2a22';
  ctx.fillRect(-c.r, -c.r * 0.55, c.r * 2, c.r * 1.1);
  ctx.fillStyle = '#6a4632';
  ctx.fillRect(-c.r * 0.2, -c.r * 0.72, c.r * 0.9, c.r * 0.7);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(-c.r * 0.85, c.r * 0.35, c.r * 0.45, c.r * 0.38);
  ctx.fillRect(c.r * 0.35, c.r * 0.35, c.r * 0.45, c.r * 0.38);
  ctx.strokeStyle = PALETTE.hud.amber;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-c.r, -c.r * 0.55, c.r * 2, c.r * 1.1);
  if (!keyGlowsOnly()) drawGlow(ctx, c.r * 0.85, 0, 10, PALETTE.emissive.hostile, 0.45);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'rgba(12, 10, 8, 0.8)';
  ctx.fillRect(c.x - c.r, c.y - c.r - 8, c.r * 2, 4);
  ctx.fillStyle = ratio > 0.35 ? PALETTE.hud.amber : PALETTE.hud.rust;
  ctx.fillRect(c.x - c.r, c.y - c.r - 8, c.r * 2 * ratio, 4);
  ctx.restore();
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
  drawDevils(ctx);
}

function drawDevils(ctx) {
  if (!ctx || !rt.state || !rt.state.devils) return;
  var reduced = isReducedMotion();
  var contrast = isHighContrast();
  var i;
  for (i = 0; i < rt.state.devils.length; i += 1) {
    var d = rt.state.devils[i];
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.strokeStyle = contrast ? '#ffffff' : 'rgba(232, 185, 78, 0.9)';
    ctx.lineWidth = contrast ? 2.4 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, d.r || 60, 0, TAU);
    ctx.stroke();
    if (!reduced) {
      ctx.rotate((rt.renderTime || 0) * 0.8 + i);
      ctx.beginPath();
      ctx.arc(0, 0, (d.r || 60) * 0.55, 0.4, 2.2);
      ctx.stroke();
    }
    if (!keyGlowsOnly()) drawGlow(ctx, 0, 0, (d.r || 60) * 0.45, PALETTE.hud.amber, contrast ? 0.2 : 0.28);
    ctx.restore();
  }
}

export function drawFieldReadability(ctx) {
  if (!ctx || !rt.state) return;
  var reduced = isReducedMotion();
  var contrast = isHighContrast();
  var list = rt.state.meteors || [];
  var i;
  for (i = 0; i < list.length; i += 1) {
    var m = list[i];
    var maxT = m.maxTimer || 0.8;
    var remain = maxT > 0 ? clamp(m.timer / maxT, 0, 1) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r || 34, 0, TAU);
    ctx.strokeStyle = contrast ? '#ffffff' : 'rgba(255, 176, 90, 0.95)';
    ctx.lineWidth = contrast ? 2.6 : 1.7;
    ctx.setLineDash(reduced ? [] : [4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, Math.max(4, (m.r || 34) * (1 - remain)), 0, TAU);
    ctx.fillStyle = contrast ? 'rgba(255,255,255,0.28)' : 'rgba(223, 64, 40, 0.28)';
    ctx.fill();
    ctx.restore();
  }
  var route = rt.state.route;
  var blackout = rt.state.blackout || (route && route.blackout);
  if (blackout && !contrast && rt.state.player) {
    var p = rt.state.player;
    var w = rt.state.width || (rt.ui && rt.ui.width) || 960;
    var h = rt.state.height || (rt.ui && rt.ui.height) || 640;
    var g = ctx.createRadialGradient(p.x, p.y, 80, p.x, p.y, 340);
    g.addColorStop(0, 'rgba(6, 8, 12, 0)');
    g.addColorStop(1, 'rgba(6, 8, 12, 0.78)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, w + 80, h + 80);
    ctx.restore();
  }
}

export function drawPois(ctx, x0, y0, viewW, viewH) {
  if (!ctx || !rt.state || !rt.state.pois) return;
  var pois = rt.state.pois;
  var rTime = rt.renderTime || 0;
  var reduced = isReducedMotion();
  var contrast = isHighContrast();

  var hasBounds = typeof x0 === 'number' && typeof viewW === 'number';
  var minX = hasBounds ? x0 - 150 : -9999;
  var maxX = hasBounds ? x0 + viewW + 150 : 99999;
  var minY = hasBounds ? y0 - 150 : -9999;
  var maxY = hasBounds ? y0 + viewH + 150 : 99999;

  for (var i = 0; i < pois.length; i += 1) {
    var poi = pois[i];
    if (!poi) continue;
    if (poi.x < minX || poi.x > maxX || poi.y < minY || poi.y > maxY) continue;

    ctx.save();
    var px = poi.x;
    var py = poi.y;
    var pr = poi.r || 80;
    var pulse = reduced ? 1 : 1 + Math.sin(rTime * 3 + (poi.pulsePhase || 0)) * 0.06;

    // Ground Contact Shadow
    ctx.beginPath();
    ctx.ellipse(px, py + pr * 0.35, pr * 1.15, pr * 0.45, 0, 0, TAU);
    ctx.fillStyle = 'rgba(2, 3, 5, 0.72)';
    ctx.fill();

    // 1. Scrap Silo
    if (poi.kind === 'scrap_silo') {
      var isActive = poi.status === 'active';
      var isDone = poi.status === 'completed';

      // Ground hazard warning circle
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = isActive ? (reduced ? '#ff4028' : (Math.sin(rTime * 12) > 0 ? '#ff4028' : '#ffd43b')) : (isDone ? '#38d9a9' : 'rgba(255, 212, 59, 0.55)');
      ctx.lineWidth = isActive ? 3.5 : 2.0;
      ctx.setLineDash(isActive ? [8, 6] : [6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Progress Arc
      if (poi.progress > 0 && poi.progress < 1) {
        ctx.beginPath();
        ctx.arc(px, py, pr + 4, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * poi.progress);
        ctx.strokeStyle = isActive ? '#ff4028' : '#ffd43b';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // Base Platform
      ctx.fillStyle = '#212529';
      ctx.fillRect(px - 32, py - 32, 64, 64);
      ctx.strokeStyle = '#495057';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px - 32, py - 32, 64, 64);

      // Drill Towers
      ctx.fillStyle = isActive ? '#f59f00' : '#868e96';
      ctx.fillRect(px - 22, py - 24, 16, 48);
      ctx.fillRect(px + 6, py - 24, 16, 48);

      // Hazard Stripes on Silo
      ctx.fillStyle = '#111';
      ctx.fillRect(px - 22, py - 6, 16, 6);
      ctx.fillRect(px + 6, py - 6, 16, 6);

      // Center Core
      ctx.beginPath();
      ctx.arc(px, py, 14 * pulse, 0, TAU);
      ctx.fillStyle = isDone ? '#38d9a9' : (isActive ? '#ff6b6b' : '#ffd43b');
      ctx.fill();

      // Top Beacon
      ctx.beginPath();
      ctx.arc(px, py - 36, 6, 0, TAU);
      ctx.fillStyle = isActive ? (Math.sin(rTime * 14) > 0 ? '#ff0000' : '#ffffff') : (isDone ? '#38d9a9' : '#ffd43b');
      ctx.fill();
    }

    // 2. Orbital Drop Pod
    else if (poi.kind === 'orbital_pod') {
      var podDone = poi.status === 'completed';

      // Landing Scorch & Beam
      if (!podDone) {
        var grad = ctx.createLinearGradient(px, py, px, py - 160);
        grad.addColorStop(0, 'rgba(56, 217, 169, 0.45)');
        grad.addColorStop(1, 'rgba(56, 217, 169, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - 14, py - 160, 28, 160);
      }

      // Ground Ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = podDone ? 'rgba(56, 217, 169, 0.3)' : 'rgba(56, 217, 169, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (poi.progress > 0 && poi.progress < 1) {
        ctx.beginPath();
        ctx.arc(px, py, pr + 4, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * poi.progress);
        ctx.strokeStyle = '#38d9a9';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }

      // Pod Octagonal Hull
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      for (var pi = 0; pi < 8; pi += 1) {
        var ang = (pi / 8) * TAU + Math.PI / 8;
        var hx = Math.cos(ang) * 26;
        var hy = Math.sin(ang) * 26;
        if (pi === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = podDone ? '#343a40' : '#495057';
      ctx.fill();
      ctx.strokeStyle = podDone ? '#212529' : '#20c997';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Vent ports
      ctx.fillStyle = podDone ? '#111' : '#63e6be';
      ctx.fillRect(-10, -10, 20, 20);
      ctx.restore();
    }

    // 3. Field Modification Rig
    else if (poi.kind === 'field_rig') {
      var rigDone = poi.status === 'completed';

      // Holographic workbench ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = rigDone ? 'rgba(77, 171, 247, 0.25)' : 'rgba(77, 171, 247, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (poi.progress > 0 && poi.progress < 1) {
        ctx.beginPath();
        ctx.arc(px, py, pr + 4, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * poi.progress);
        ctx.strokeStyle = '#4dabf7';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }

      // Tracked Vehicle Chassis
      ctx.fillStyle = '#343a40';
      ctx.fillRect(px - 36, py - 20, 72, 40);
      // Treads
      ctx.fillStyle = '#1a1d20';
      ctx.fillRect(px - 38, py - 24, 76, 7);
      ctx.fillRect(px - 38, py + 17, 76, 7);

      // Holographic bench projector
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, TAU);
      ctx.fillStyle = rigDone ? '#212529' : '#1864ab';
      ctx.fill();
      ctx.strokeStyle = rigDone ? '#495057' : '#74c0fc';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crane arm
      ctx.strokeStyle = '#868e96';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px - 10, py);
      ctx.lineTo(px + 18, py - 22);
      ctx.stroke();
    }

    // 4. Xeno Nest Fissure
    else if (poi.kind === 'xeno_nest') {
      var nestDead = poi.status === 'destroyed';

      // Chitinous Tendril Rings
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = nestDead ? 'rgba(73, 80, 87, 0.4)' : 'rgba(177, 151, 252, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Organic fleshy mound
      ctx.beginPath();
      ctx.arc(px, py, 34 * (nestDead ? 0.8 : pulse), 0, TAU);
      ctx.fillStyle = nestDead ? '#1a1024' : '#3b1854';
      ctx.fill();
      ctx.strokeStyle = nestDead ? '#495057' : '#9775fa';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Pulsating egg sacs
      if (!nestDead) {
        for (var ni = 0; ni < 3; ni += 1) {
          var nAng = (ni / 3) * TAU + rTime * 1.5;
          var nx = px + Math.cos(nAng) * 16;
          var ny = py + Math.sin(nAng) * 16;
          ctx.beginPath();
          ctx.arc(nx, ny, 7, 0, TAU);
          ctx.fillStyle = '#da77f2';
          ctx.fill();
        }

        // Nest HP Bar
        var hpPct = poi.maxHp > 0 ? clamp(poi.hp / poi.maxHp, 0, 1) : 0;
        ctx.fillStyle = '#111';
        ctx.fillRect(px - 30, py - 46, 60, 6);
        ctx.fillStyle = '#b197fc';
        ctx.fillRect(px - 30, py - 46, 60 * hpPct, 6);
      }
    }

    // 5. EMP Resonance Spire
    else if (poi.kind === 'emp_spire') {
      var spireDone = poi.status === 'completed';

      // Ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = spireDone ? 'rgba(100, 100, 120, 0.3)' : 'rgba(121, 80, 242, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Triangular Base
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      for (var ti = 0; ti < 3; ti += 1) {
        var tAng = (ti / 3) * TAU - Math.PI / 2;
        var tx = Math.cos(tAng) * 28;
        var ty = Math.sin(tAng) * 28;
        if (ti === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.closePath();
      ctx.fillStyle = spireDone ? '#212529' : '#343a40';
      ctx.fill();
      ctx.strokeStyle = spireDone ? '#495057' : '#7950f2';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Capacitors at vertices
      if (!spireDone) {
        for (var ci = 0; ci < poi.capacitors; ci += 1) {
          var cAng = (ci / 3) * TAU - Math.PI / 2;
          var cx = Math.cos(cAng) * 28;
          var cy = Math.sin(cAng) * 28;
          ctx.beginPath();
          ctx.arc(cx, cy, 7 * pulse, 0, TAU);
          ctx.fillStyle = '#e599f7';
          ctx.fill();
        }
      }

      // Central Spire Core
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fillStyle = spireDone ? '#495057' : '#7950f2';
      ctx.fill();
      ctx.restore();
    }

    // 6. Bunker Cache
    else if (poi.kind === 'bunker_cache') {
      var bunkerDone = poi.status === 'completed';

      // Outer fortified ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = bunkerDone ? 'rgba(255, 212, 59, 0.3)' : 'rgba(255, 212, 59, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hexagonal Armor Door
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      for (var bi = 0; bi < 6; bi += 1) {
        var bAng = (bi / 6) * TAU;
        var bx = Math.cos(bAng) * 28;
        var by = Math.sin(bAng) * 28;
        if (bi === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.fillStyle = bunkerDone ? '#1a1a1a' : '#2b2b2b';
      ctx.fill();
      ctx.strokeStyle = bunkerDone ? '#495057' : '#ffd43b';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Hazard Warning Bar
      if (!bunkerDone) {
        ctx.fillStyle = '#ffd43b';
        ctx.fillRect(-16, -6, 32, 12);
        ctx.fillStyle = '#111';
        ctx.fillRect(-10, -6, 6, 12);
        ctx.fillRect(4, -6, 6, 12);

        // HP bar if damaged
        if (poi.hp < poi.maxHp) {
          var bHp = clamp(poi.hp / poi.maxHp, 0, 1);
          ctx.fillStyle = '#111';
          ctx.fillRect(-24, -38, 48, 5);
          ctx.fillStyle = '#ffd43b';
          ctx.fillRect(-24, -38, 48 * bHp, 5);
        }
      } else {
        // Blown open interior
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, TAU);
        ctx.fillStyle = '#38d9a9';
        ctx.fill();
      }
      ctx.restore();
    }

    // High-Contrast Tactical HUD Label above POI
    var labelY = py - pr - 14;
    var statusText = poi.status.toUpperCase();
    if (poi.status === 'active' && poi.activeTimer > 0) {
      statusText = Math.ceil(poi.activeTimer) + 's';
    }
    var fullTag = poi.label + ' [' + statusText + ']';

    ctx.font = 'bold 11px monospace';
    var tw = ctx.measureText(fullTag).width;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
    ctx.fillRect(px - tw * 0.5 - 6, labelY - 11, tw + 12, 16);
    ctx.strokeStyle = contrast ? '#ffffff' : (poi.status === 'completed' ? '#38d9a9' : '#e0a800');
    ctx.lineWidth = 1;
    ctx.strokeRect(px - tw * 0.5 - 6, labelY - 11, tw + 12, 16);

    ctx.fillStyle = contrast ? '#ffffff' : (poi.status === 'completed' ? '#38d9a9' : '#f8f9fa');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullTag, px, labelY - 3);

    ctx.restore();
  }
}

