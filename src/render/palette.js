import { STORM_FRONT_SECONDS, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';

export var PALETTE = {
  ground: { base: '#28211a', light: '#322a21', dark: '#1a1511', crack: '#110d0a' },
  shadow: 'rgba(2, 3, 5, 0.92)',
  ambient: {
    dusk: { r: 24, g: 20, b: 16 },
    storm: { r: 34, g: 14, b: 10 },
    night: { r: 10, g: 16, b: 23 },
    crystal: { r: 14, g: 18, b: 32 }
  },
  emissive: { player: '#7cf0c8', hostile: '#ff552e', tech: '#5be7ff', gold: '#ffd36b', void: '#b55fe6' },
  hud: { bone: '#e8e0c6', rust: '#ed6842', amber: '#e8b94e', mint: '#96baa0' }
};

export var SECTOR_BLEND_SEC = 1.5;
export var STORM_BLEND_SEC = 0.6;

var GROUND_SECTORS = {
  dusk: {
    base: '#28211a',
    light: '#322a21',
    dark: '#1a1511',
    crack: '#110d0a',
    hi: '#3d3227',
    moteColor: { normal: '#e6d3ad', storm: '#e27846' },
    fogColor: { dark: '#7a3824', light: '#c45a32', streakA: '#ed6842', streakB: '#e0a84e' }
  },
  rust: {
    base: '#2a1b14',
    light: '#36231a',
    dark: '#1b110d',
    crack: '#120a08',
    hi: '#3f261c',
    moteColor: { normal: '#d48a60', storm: '#d44220' },
    fogColor: { dark: '#5a2216', light: '#a63c20', streakA: '#d44e28', streakB: '#c4783c' }
  },
  night: {
    base: '#141d28',
    light: '#1c2736',
    dark: '#0c1219',
    crack: '#070b10',
    hi: '#253547',
    moteColor: { normal: '#8ab0d0', storm: '#5a78a6' },
    fogColor: { dark: '#101c2e', light: '#1e3452', streakA: '#386294', streakB: '#5c8bc2' }
  },
  crystal: {
    base: '#141a2b',
    light: '#1d2840',
    dark: '#0c1020',
    crack: '#070a14',
    hi: '#38bdf8',
    prism: '#c084fc',
    moteColor: { normal: '#67e8f9', storm: '#e879f9' },
    fogColor: { dark: '#0a1128', light: '#1c2b4d', streakA: '#38bdf8', streakB: '#c084fc' }
  }
};

function mixChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function registerGroundSector(name, config) {
  GROUND_SECTORS[name] = Object.assign({}, GROUND_SECTORS.dusk, config);
}

export function groundPalette(name) {
  return GROUND_SECTORS[name] || GROUND_SECTORS.dusk;
}

export function sectorAtmosphere(name) {
  var s = GROUND_SECTORS[name] || GROUND_SECTORS.dusk;
  return {
    moteColor: s.moteColor || GROUND_SECTORS.dusk.moteColor,
    fogColor: s.fogColor || GROUND_SECTORS.dusk.fogColor
  };
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
  var a = PALETTE.ambient[from] || PALETTE.ambient.dusk;
  var b = PALETTE.ambient[name] || PALETTE.ambient.dusk;
  var r = mixChannel(a.r, b.r, t);
  var g = mixChannel(a.g, b.g, t);
  var bl = mixChannel(a.b, b.b, t);
  var stormMix = storm === true ? 0.72 : (typeof storm === 'number' ? Math.max(0, Math.min(1, storm)) : 0);
  if (stormMix > 0) {
    var s = PALETTE.ambient.storm;
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
  var crystalW = 0;
  if (tint && tint.name === 'crystal') crystalW += blend;
  if (tint && tint.from === 'crystal') crystalW += 1 - blend;
  var s = typeof storm === 'number' ? storm : storm ? 1 : 0;
  if (s < 0) s = 0;
  if (s > 1) s = 1;
  var lift = 0.74 - nightW * 0.05 - crystalW * 0.06 - s * 0.04;
  if (lift < 0.65) lift = 0.65;
  var r = tint ? tint.r : 58;
  var g = tint ? tint.g : 42;
  var b = tint ? tint.b : 30;
  return {
    r: Math.min(255, (r + (255 - r) * lift) | 0),
    g: Math.min(255, (g + (255 - g) * lift) | 0),
    b: Math.min(255, (b + (255 - b) * lift) | 0)
  };
}
