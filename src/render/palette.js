import { STORM_FRONT_SECONDS, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';

export var PALETTE = {
  ground: { base: '#2a241c', light: '#4a3d2a', dark: '#15120e', crack: '#0e0c09' },
  shadow: 'rgba(6, 10, 14, 0.55)',
  ambient: { dusk: '#3a2a1e', storm: '#3b1712', night: '#0d1420' },
  emissive: { player: '#7cf0c8', hostile: '#ff6a3d', tech: '#5be7ff', gold: '#ffd36b', void: '#b55fe6' },
  hud: { bone: '#e8e0c6', rust: '#ed6842', amber: '#e8b94e', mint: '#96baa0' }
};

export var SECTOR_BLEND_SEC = 1.5;
export var STORM_BLEND_SEC = 0.6;

var GROUND_SECTORS = {
  dusk: { base: '#2a241c', light: '#5c4a34', dark: '#15120e', crack: '#0e0c09', hi: '#d7c4a2' },
  rust: { base: '#3a2218', light: '#704030', dark: '#1a100c', crack: '#120a08', hi: '#e2b089' },
  night: { base: '#243246', light: '#6a84a8', dark: '#141c28', crack: '#0e141c', hi: '#d5e2f2' }
};

function hexToRgb(hex) {
  var h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0
  };
}

function mixChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function groundPalette(name) {
  return GROUND_SECTORS[name] || GROUND_SECTORS.dusk;
}

export function sectorForWave(wave) {
  var w = Math.max(1, wave | 0);
  if (rt.state && typeof rt.state.sector === 'string' && rt.state.sector && w === (rt.state.wave | 0)) {
    return rt.state.sector;
  }
  var slot = w % 5;
  if (slot === 1 || slot === 2) return 'dusk';
  if (slot === 3 || slot === 4) return 'rust';
  return 'night';
}

export function stormBlend(waveTime) {
  var t = Number(waveTime);
  if (!(t >= 0)) return 0;
  var start = WAVE_LENGTH - STORM_FRONT_SECONDS;
  if (t < start || t > WAVE_LENGTH) return 0;
  var into = (t - start) / STORM_BLEND_SEC;
  var out = (WAVE_LENGTH - t) / STORM_BLEND_SEC;
  var m = into < 1 ? into : 1;
  if (out < 1) m = m < out ? m : out;
  if (m < 0) return 0;
  if (m > 1) return 1;
  return m;
}

export function sectorTint(wave, waveTime, storm) {
  var name = sectorForWave(wave);
  var from = wave > 1 ? sectorForWave(wave - 1) : name;
  var t = waveTime == null ? 1 : Math.max(0, Math.min(1, Number(waveTime) / SECTOR_BLEND_SEC));
  var a = hexToRgb(PALETTE.ambient[from] || PALETTE.ambient.dusk);
  var b = hexToRgb(PALETTE.ambient[name] || PALETTE.ambient.dusk);
  var r = mixChannel(a.r, b.r, t);
  var g = mixChannel(a.g, b.g, t);
  var bl = mixChannel(a.b, b.b, t);
  var stormMix = storm === true ? 0.72 : (typeof storm === 'number' ? Math.max(0, Math.min(1, storm)) : 0);
  if (stormMix > 0) {
    var s = hexToRgb(PALETTE.ambient.storm);
    r = mixChannel(r, s.r, stormMix);
    g = mixChannel(g, s.g, stormMix);
    bl = mixChannel(bl, s.b, stormMix);
  }
  return {
    name: name,
    from: from,
    t: t,
    r: r,
    g: g,
    b: bl,
    css: 'rgb(' + r + ',' + g + ',' + bl + ')'
  };
}

export function ambientShade(tint, storm) {
  var blend = tint && tint.t != null ? tint.t : 1;
  if (blend < 0) blend = 0;
  if (blend > 1) blend = 1;
  var nightW = 0;
  if (tint && tint.name === 'night') nightW += blend;
  if (tint && tint.from === 'night') nightW += 1 - blend;
  var s = typeof storm === 'number' ? storm : storm ? 1 : 0;
  if (s < 0) s = 0;
  if (s > 1) s = 1;
  var lift = 0.62 - nightW * 0.06 - s * 0.05;
  var r = tint ? tint.r : 58;
  var g = tint ? tint.g : 42;
  var b = tint ? tint.b : 30;
  return {
    r: (r + (255 - r) * lift) | 0,
    g: (g + (255 - g) * lift) | 0,
    b: (b + (255 - b) * lift) | 0
  };
}
