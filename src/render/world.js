import { TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { isChinese } from '../core/i18n.js';
import { clamp } from '../core/utils.js';
import { arcDepth, decay, ensureFx, keyGlowsOnly, outline, tickFlash } from './entity-style.js';
import { PALETTE } from './palette.js';
import { drawGlow } from './sprites.js';
import { getPoiType } from '../systems/sim/poi-registry.js';

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
  var magnet = !crate && orb.kind === 'magnet';
  var repair = !crate && orb.kind === 'repair';
  var color = crate ? crateColor(orb.payload) : power ? PALETTE.emissive.gold : magnet ? PALETTE.emissive.tech : repair ? PALETTE.hud.rust : PALETTE.hud.mint;
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

  var shadowW = (repair || crate) ? s * 1.4 : s * 1.35;
  var shadowH = (repair || crate) ? s * 0.7 : s * 0.65;
  ctx.beginPath();
  ctx.ellipse(0, 0, shadowW, shadowH, 0, 0, TAU);
  ctx.fillStyle = (repair || crate) ? 'rgba(4, 4, 6, 0.85)' : 'rgba(4, 4, 6, 0.82)';
  ctx.fill();

  if (power) {
    // Overclock Core pulsing aura ring
    var ocPulse = reduced ? 0.8 : (0.65 + 0.35 * Math.sin((rt.renderTime || 0) * 8 + (orb.x || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.45, s * 0.72, 0, 0, TAU);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 215, 80, ' + (0.75 * ocPulse).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (magnet) {
    var magPulse = reduced ? 0.8 : (0.6 + 0.4 * Math.sin((rt.renderTime || 0) * 7 + (orb.x || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.5, s * 0.74, 0, 0, TAU);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(91, 231, 255, ' + (0.8 * magPulse).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (repair) {
    // Repair Scrap emergency ring
    var repPulse = reduced ? 0.8 : (0.6 + 0.4 * Math.sin((rt.renderTime || 0) * 6 + (orb.x || 0)));
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.45, s * 0.72, 0, 0, TAU);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 77, 61, ' + (0.75 * repPulse).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (!crate) {
    // Normal Scrap: 12px diameter pulsing holographic halo (thin mint green / gold)
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
  } else if (magnet) {
    ctx.save();
    var magBeamGrad = ctx.createLinearGradient(0, orb.y, 0, orb.y - 34);
    magBeamGrad.addColorStop(0, 'rgba(91, 231, 255, 0.7)');
    magBeamGrad.addColorStop(0.5, 'rgba(91, 231, 255, 0.3)');
    magBeamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = magBeamGrad;
    ctx.fillRect(orb.x - s * 0.75, orb.y - 34, s * 1.5, 34);
    ctx.strokeStyle = 'rgba(220, 250, 255, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(orb.x, orb.y);
    ctx.lineTo(orb.x, orb.y - 34);
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
  if (!keyGlowsOnly()) drawGlow(ctx, 0, 0, s * 2.2, color, power || magnet || repair ? 0.45 : 0.4);

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
  } else if (magnet) {
    // Loot Magnet: cyan horseshoe with dual poles
    ctx.rotate(reduced ? 0 : Math.sin((rt.renderTime || 0) * 2.2) * 0.12);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Obsidian backing U
    ctx.beginPath();
    ctx.moveTo(-s * 0.72, -s * 0.85);
    ctx.lineTo(-s * 0.72, s * 0.35);
    ctx.quadraticCurveTo(-s * 0.72, s * 0.95, 0, s * 0.95);
    ctx.quadraticCurveTo(s * 0.72, s * 0.95, s * 0.72, s * 0.35);
    ctx.lineTo(s * 0.72, -s * 0.85);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = s * 0.55;
    ctx.stroke();
    // Cyan body U
    ctx.beginPath();
    ctx.moveTo(-s * 0.72, -s * 0.85);
    ctx.lineTo(-s * 0.72, s * 0.35);
    ctx.quadraticCurveTo(-s * 0.72, s * 0.95, 0, s * 0.95);
    ctx.quadraticCurveTo(s * 0.72, s * 0.95, s * 0.72, s * 0.35);
    ctx.lineTo(s * 0.72, -s * 0.85);
    ctx.strokeStyle = '#1a8fa8';
    ctx.lineWidth = s * 0.42;
    ctx.stroke();
    ctx.strokeStyle = '#5be7ff';
    ctx.lineWidth = s * 0.22;
    ctx.stroke();
    // Pole tips (N/S caps)
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(-s * 0.95, -s * 1.05, s * 0.46, s * 0.32);
    ctx.fillStyle = '#4d7cff';
    ctx.fillRect(s * 0.49, -s * 1.05, s * 0.46, s * 0.32);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-s * 0.95, -s * 1.05, s * 0.46, s * 0.32);
    ctx.strokeRect(s * 0.49, -s * 1.05, s * 0.46, s * 0.32);
    // Inner white highlight arc
    ctx.beginPath();
    ctx.arc(0, s * 0.2, s * 0.38, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
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
    var fuseLeft = barrel.chainFuse || 0;
    var fusing = fuseLeft > 0;
    var flashing = tickFlash(barrel) || fusing;
    var r = barrel.r;
    if (fusing) {
      // Pre-detonation telegraph: expanding danger ring on the dark ground.
      var fuseT = 1 - Math.min(1, fuseLeft / 0.42);
      var warnR = r + 18 + fuseT * 70;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 120, 48, ' + (0.35 + fuseT * 0.45) + ')';
      ctx.lineWidth = 2 + fuseT * 2;
      ctx.beginPath();
      ctx.arc(barrel.x, barrel.y, warnR, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 70, 30, ' + (0.08 + fuseT * 0.12) + ')';
      ctx.beginPath();
      ctx.arc(barrel.x, barrel.y, warnR, 0, TAU);
      ctx.fill();
      if (!keyGlowsOnly()) drawGlow(ctx, barrel.x, barrel.y, 28 + fuseT * 40, '#ff6633', 0.45 + fuseT * 0.35);
      ctx.restore();
    }
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
    var urgent = remain <= 0.25;
    ctx.save();
    // Dark contrast halo (visual only — timers unchanged)
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r || 34, 0, TAU);
    ctx.strokeStyle = 'rgba(6, 6, 8, 0.9)';
    ctx.lineWidth = (contrast ? 5.2 : 4.2) + (urgent ? 0.6 : 0);
    ctx.stroke();
    // Bright zebra / solid warning ring
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r || 34, 0, TAU);
    ctx.strokeStyle = contrast ? '#ffffff' : (urgent ? 'rgba(255, 220, 160, 0.98)' : 'rgba(255, 176, 90, 0.98)');
    ctx.lineWidth = contrast ? 3.2 : 2.4;
    ctx.setLineDash(reduced ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Countdown fill (alpha capped for readability without obscuring)
    ctx.beginPath();
    ctx.arc(m.x, m.y, Math.max(4, (m.r || 34) * (1 - remain)), 0, TAU);
    ctx.fillStyle = contrast ? 'rgba(255,255,255,0.32)' : 'rgba(223, 64, 40, 0.34)';
    ctx.fill();
    // Bullseye core
    ctx.beginPath();
    ctx.arc(m.x, m.y, 3.2, 0, TAU);
    ctx.fillStyle = contrast ? '#ffffff' : '#fff6e0';
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

  // 1. Dreadnought Monolith Crags
  if (rt.state.monolithCrags && rt.state.monolithCrags.length) {
    for (i = 0; i < rt.state.monolithCrags.length; i += 1) {
      var crag = rt.state.monolithCrags[i];
      if (!crag || crag.hp <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.arc(crag.x, crag.y, crag.r || 32, 0, TAU);
      ctx.fillStyle = '#2a2421';
      ctx.fill();
      // Dark rim + bright amber rim for break-target readability
      ctx.beginPath();
      ctx.arc(crag.x, crag.y, crag.r || 32, 0, TAU);
      ctx.strokeStyle = 'rgba(6, 6, 8, 0.92)';
      ctx.lineWidth = 4.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(crag.x, crag.y, crag.r || 32, 0, TAU);
      ctx.strokeStyle = '#ffb24a';
      ctx.lineWidth = 2.8;
      ctx.stroke();

      var cragPct = clamp(crag.hp / (crag.maxHp || 100), 0, 1);
      if (cragPct < 1.0) {
        ctx.beginPath();
        ctx.arc(crag.x, crag.y, (crag.r || 32) + 5, -Math.PI / 2, -Math.PI / 2 + cragPct * TAU);
        ctx.strokeStyle = 'rgba(6, 6, 8, 0.9)';
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(crag.x, crag.y, (crag.r || 32) + 5, -Math.PI / 2, -Math.PI / 2 + cragPct * TAU);
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 2. Titan Harpoon Cable & Telegraph
  if (rt.state.enemies && rt.state.player) {
    for (i = 0; i < rt.state.enemies.length; i += 1) {
      var foe = rt.state.enemies[i];
      if (!foe || foe.kind !== 'titan' || foe.hp <= 0) continue;
      if (foe.harpoonTelegraph > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(foe.x, foe.y);
        ctx.lineTo(rt.state.player.x, rt.state.player.y);
        ctx.strokeStyle = 'rgba(6, 4, 4, 0.9)';
        ctx.lineWidth = 5.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(foe.x, foe.y);
        ctx.lineTo(rt.state.player.x, rt.state.player.y);
        ctx.strokeStyle = 'rgba(255, 70, 50, 0.95)';
        ctx.lineWidth = 2.6;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.restore();
      } else if (foe.harpoonFiredTimer > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(foe.x, foe.y);
        ctx.lineTo(rt.state.player.x, rt.state.player.y);
        ctx.strokeStyle = '#ff5533';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 3. Campaign Mobile Escort Convoy
  if (rt.state.convoyVehicle && rt.state.convoyVehicle.hp > 0) {
    var v = rt.state.convoyVehicle;
    ctx.save();
    ctx.beginPath();
    ctx.arc(v.x, v.y, v.captureRadius || 150, 0, TAU);
    ctx.fillStyle = v.powerTimer > 0 ? 'rgba(0, 243, 255, 0.08)' : 'rgba(255, 176, 90, 0.04)';
    ctx.fill();
    ctx.strokeStyle = v.powerTimer > 0 ? 'rgba(0, 243, 255, 0.45)' : 'rgba(255, 176, 90, 0.35)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(v.x, v.y, v.r || 26, 0, TAU);
    ctx.fillStyle = '#1e242d';
    ctx.fill();
    ctx.strokeStyle = v.powerTimer > 0 ? '#00f3ff' : '#9ca3af';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(v.x, v.y, 8, 0, TAU);
    ctx.fillStyle = v.powerTimer > 0 ? '#00f3ff' : '#4b5563';
    ctx.fill();
    ctx.restore();
  }

  // 4. Hardcore Converging Dark Storm
  if (rt.state.toxicRing && rt.state.toxicRing.active) {
    var ring = rt.state.toxicRing;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, TAU);
    ctx.strokeStyle = 'rgba(223, 64, 40, 0.75)';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([12, 8]);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Sovereign Eye of the Storm
  if (rt.state.stormEye) {
    var eye = rt.state.stormEye;
    ctx.save();
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, eye.radius || 550, 0, TAU);
    ctx.strokeStyle = 'rgba(117, 209, 176, 0.85)';
    ctx.lineWidth = 2.8;
    ctx.setLineDash([10, 6]);
    ctx.stroke();
    ctx.restore();
  }

  // 6. Tactical Auto-Aim Target Brackets (Touch / Gamepad)
  if (rt.input && rt.input.aimLock && rt.input.aimLock.enemy) {
    var lockEnemy = rt.input.aimLock.enemy;
    if (lockEnemy.hp > 0 && (rt.input.gamepadFiring || (rt.gamepadState && rt.gamepadState.connected) || (rt.input.aimLock.left > 0))) {
      ctx.save();
      var lx = lockEnemy.x;
      var ly = lockEnemy.y;
      var lr = (lockEnemy.r || 16) + 8;
      var arm = Math.max(6, lr * 0.42);
      var pulse = reduced ? 1.0 : (0.85 + 0.15 * Math.sin((rt.renderTime || 0) * 10));
      var isBossTarget = Boolean(lockEnemy.isBoss || lockEnemy.kind === 'titan');
      var bracketColor = isBossTarget ? 'rgba(255, 77, 46, ' + pulse.toFixed(2) + ')' : 'rgba(0, 243, 255, ' + pulse.toFixed(2) + ')';

      ctx.strokeStyle = bracketColor;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'square';
      ctx.beginPath();

      // Top-Left
      ctx.moveTo(lx - lr, ly - lr + arm);
      ctx.lineTo(lx - lr, ly - lr);
      ctx.lineTo(lx - lr + arm, ly - lr);

      // Top-Right
      ctx.moveTo(lx + lr - arm, ly - lr);
      ctx.lineTo(lx + lr, ly - lr);
      ctx.lineTo(lx + lr, ly - lr + arm);

      // Bottom-Left
      ctx.moveTo(lx - lr, ly + lr - arm);
      ctx.lineTo(lx - lr, ly + lr);
      ctx.lineTo(lx - lr + arm, ly + lr);

      // Bottom-Right
      ctx.moveTo(lx + lr - arm, ly + lr);
      ctx.lineTo(lx + lr, ly + lr);
      ctx.lineTo(lx + lr, ly + lr - arm);

      ctx.stroke();

      // Center subtle diamond pip
      ctx.fillStyle = bracketColor;
      ctx.fillRect(lx - 1.5, ly - 1.5, 3, 3);

      ctx.restore();
    }
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
    // emp_spire telegraph ring is >=120px — wider cull so dashed field is not clipped at the view edge.
    var pad = (poi.kind === 'emp_spire' && poi.status !== 'completed') ? 180 : 150;
    var pMinX = hasBounds ? x0 - pad : minX;
    var pMaxX = hasBounds ? x0 + viewW + pad : maxX;
    var pMinY = hasBounds ? y0 - pad : minY;
    var pMaxY = hasBounds ? y0 + viewH + pad : maxY;
    if (poi.x < pMinX || poi.x > pMaxX || poi.y < pMinY || poi.y > pMaxY) continue;

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

    var handler = getPoiType(poi.kind);
    if (handler && typeof handler.draw === 'function') {
      handler.draw(ctx, poi, pulse, rTime, reduced);
    }

    // World-site plate (not player tactical gear) — prefer localized poi.name
    // I18N-FREEZE: Latin poi.label (ORBITAL POD / SILO-N) stays as site telemetry code; banners already go through tBanner.
    // IDLE plates stay quiet so wolf-pack / field tips keep visual priority.
    var isIdle = !poi.status || poi.status === 'idle';
    var isActive = poi.status === 'active' || poi.status === 'interacting' || poi.status === 'armed' || poi.status === 'hostile';
    var isDone = poi.status === 'completed';
    var isDropSite = poi.kind === 'orbital_pod';
    if (isIdle && !contrast) {
      // Soften: smaller + low alpha; skip far IDLE clutter beyond ~520px of view center.
      var viewCx = (typeof x0 === 'number' && typeof viewW === 'number') ? (x0 + viewW * 0.5) : px;
      var viewCy = (typeof y0 === 'number' && typeof viewH === 'number') ? (y0 + viewH * 0.5) : py;
      var idleDist = Math.hypot(px - viewCx, py - viewCy);
      if (idleDist > 520) { ctx.restore(); continue; }
    }
    var labelY = py - pr - (isIdle ? 10 : 14);
    var statusText = String(poi.status || 'idle').toUpperCase();
    if (poi.status === 'active' && poi.activeTimer > 0) {
      statusText = Math.ceil(poi.activeTimer) + 's';
    }
    var zh = isChinese();
    var siteName = (zh && poi.name) ? poi.name : (poi.label || poi.name || 'POI');
    // Keep Latin site code secondary so SILO-N reads as a map node, not aux gear.
    // IDLE: name only (no [IDLE] shout). Active/completed keep status chip.
    var fullTag;
    if (isIdle) {
      fullTag = (zh && poi.label && poi.name) ? (siteName + ' · ' + poi.label) : siteName;
    } else {
      fullTag = (zh && poi.label && poi.name)
        ? (siteName + ' · ' + poi.label + ' [' + statusText + ']')
        : (siteName + ' [' + statusText + ']');
    }

    ctx.font = (isIdle && !isDropSite) ? 'bold 9px monospace' : 'bold 11px monospace';
    var tw = ctx.measureText(fullTag).width;
    var padX = isIdle ? 4 : 6;
    var padY = isIdle ? 8 : 11;
    var boxH = isIdle ? 12 : 16;
    ctx.globalAlpha = (isIdle && !isDropSite) ? (contrast ? 0.7 : 0.38) : 1;
    ctx.fillStyle = (isIdle && !isDropSite) ? 'rgba(10, 12, 16, 0.55)' : 'rgba(10, 12, 16, 0.9)';
    ctx.fillRect(px - tw * 0.5 - padX, labelY - padY, tw + padX * 2, boxH);
    // Amber/bone site chrome — distinct from player tactical cyan HUD.
    ctx.strokeStyle = contrast ? '#ffffff' : (isDone ? '#38d9a9' : (isActive ? '#e8b94e' : 'rgba(232, 185, 78, 0.45)'));
    ctx.lineWidth = isIdle ? 0.8 : 1.2;
    ctx.strokeRect(px - tw * 0.5 - padX, labelY - padY, tw + padX * 2, boxH);

    ctx.fillStyle = contrast ? '#ffffff' : (isDone ? '#38d9a9' : (isActive ? '#f2e6c9' : 'rgba(242, 230, 201, 0.75)'));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullTag, px, labelY - (isIdle ? 2 : 3));
    ctx.globalAlpha = 1;

    ctx.restore();
  }
}

