import { rt } from '../core/runtime.js';
import { getVisualQuality } from '../core/settings.js';

var QUALITY_WINDOW = 90;
var QUALITY_LIMIT = 0.019;
var STALL_GAP = 1;

var BUDGETS = {
  high: { lightmap: true, grain: true, maxParticles: 900, motes: 140, terrainDetail: true, arcDepth: 3, keyGlowsOnly: false },
  medium: { lightmap: false, grain: false, maxParticles: 500, motes: 70, terrainDetail: true, arcDepth: 2, keyGlowsOnly: false },
  low: { lightmap: false, grain: false, maxParticles: 260, motes: 0, terrainDetail: false, arcDepth: 1, keyGlowsOnly: true }
};

var autoTier = '';
var boundState = null;
var seenSetting = '';
var samples = new Array(QUALITY_WINDOW);
var sampleSlot = 0;
var sampleCount = 0;
var sampleSum = 0;
var lastSampleMs = 0;
var visHooked = false;
var skipAfterShow = false;

function initialTier() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches) return 'high';
  } catch (e) {}
  if (typeof window === 'undefined') return 'high';
  return 'medium';
}

function resetSamples() {
  sampleSlot = 0;
  sampleCount = 0;
  sampleSum = 0;
}

function syncQuality() {
  var setting = getVisualQuality();
  if (rt.state !== boundState) {
    boundState = rt.state;
    autoTier = initialTier();
    resetSamples();
  }
  if (!autoTier) autoTier = initialTier();
  if (setting !== seenSetting) {
    seenSetting = setting;
    if (setting === 'auto') {
      autoTier = initialTier();
      resetSamples();
    }
  }
  return setting;
}

function downgradeAuto() {
  if (autoTier === 'high') autoTier = 'medium';
  else if (autoTier === 'medium') autoTier = 'low';
  else return;
  resetSamples();
}

function hookVisibility() {
  if (visHooked || typeof document === 'undefined' || !document.addEventListener) return;
  visHooked = true;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') skipAfterShow = true;
  });
}

export function getQuality() {
  var setting = syncQuality();
  if (setting === 'high' || setting === 'medium' || setting === 'low') return setting;
  return autoTier || initialTier();
}

var budgetOut = {
  tier: '',
  lightmap: false,
  grain: false,
  maxParticles: 0,
  motes: 0,
  terrainDetail: false,
  arcDepth: 1,
  keyGlowsOnly: false
};

export function getBudget() {
  var tier = getQuality();
  var src = BUDGETS[tier] || BUDGETS.high;
  if (budgetOut.tier !== tier) {
    budgetOut.tier = tier;
    budgetOut.lightmap = src.lightmap;
    budgetOut.grain = src.grain;
    budgetOut.maxParticles = src.maxParticles;
    budgetOut.motes = src.motes;
    budgetOut.terrainDetail = src.terrainDetail;
    budgetOut.arcDepth = src.arcDepth;
    budgetOut.keyGlowsOnly = src.keyGlowsOnly;
  }
  return budgetOut;
}

export function sampleFrame(dt) {
  hookVisibility();
  var now = Date.now();
  var gap = lastSampleMs ? (now - lastSampleMs) / 1000 : 0;
  lastSampleMs = now;
  var setting = syncQuality();
  if (setting !== 'auto') return;
  if (skipAfterShow) {
    skipAfterShow = false;
    return;
  }
  if (typeof document !== 'undefined' && document.hidden) return;
  if (gap > STALL_GAP) return;
  if (!(dt > 0)) return;
  if (sampleCount === QUALITY_WINDOW) sampleSum -= samples[sampleSlot];
  else sampleCount += 1;
  samples[sampleSlot] = dt;
  sampleSum += dt;
  sampleSlot = (sampleSlot + 1) % QUALITY_WINDOW;
  if (sampleCount < QUALITY_WINDOW) return;
  if (sampleSum / QUALITY_WINDOW > QUALITY_LIMIT) downgradeAuto();
}
