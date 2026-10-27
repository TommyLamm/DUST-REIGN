import { rt } from '../core/runtime.js';
import { getVisualQuality } from '../core/settings.js';

var QUALITY_WINDOW = 90;
var QUALITY_LIMIT = 0.019;
var STALL_GAP = 1;
// Skip the first seconds of a run (terrain and sprite bakes) so a startup hitch cannot pin a low tier.
var WARMUP_SEC = 2;
// After a downgrade, a long smooth stretch earns one step back up per run.
var RECOVER_WINDOW = 600;
var RECOVER_LIMIT = 0.0175;

var BUDGETS = {
  high: { tier: 'high', lightmap: true, grain: true, maxParticles: 600, motes: 60, terrainDetail: true, arcDepth: 3, keyGlowsOnly: false },
  medium: { tier: 'medium', lightmap: false, grain: false, maxParticles: 350, motes: 30, terrainDetail: true, arcDepth: 2, keyGlowsOnly: false },
  low: { tier: 'low', lightmap: false, grain: false, maxParticles: 180, motes: 0, terrainDetail: false, arcDepth: 1, keyGlowsOnly: true }
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
var warmup = 0;
var recovered = false;
var smoothCount = 0;
var smoothSum = 0;

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
  smoothCount = 0;
  smoothSum = 0;
}

function syncQuality() {
  var setting = getVisualQuality();
  if (rt.state !== boundState) {
    boundState = rt.state;
    autoTier = initialTier();
    warmup = WARMUP_SEC;
    recovered = false;
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

function recoverAuto() {
  var start = initialTier();
  if (recovered || autoTier === start) return;
  if (autoTier === 'low') autoTier = 'medium';
  else if (autoTier === 'medium' && start === 'high') autoTier = 'high';
  else return;
  recovered = true;
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

export function getBudget() {
  return BUDGETS[getQuality()] || BUDGETS.high;
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
  if (warmup > 0) {
    warmup -= dt;
    return;
  }
  if (!recovered && autoTier !== initialTier()) {
    smoothCount += 1;
    smoothSum += dt;
    if (smoothCount >= RECOVER_WINDOW) {
      if (smoothSum / smoothCount <= RECOVER_LIMIT) {
        recoverAuto();
        return;
      }
      smoothCount = 0;
      smoothSum = 0;
    }
  }
  if (sampleCount === QUALITY_WINDOW) sampleSum -= samples[sampleSlot];
  else sampleCount += 1;
  samples[sampleSlot] = dt;
  sampleSum += dt;
  sampleSlot = (sampleSlot + 1) % QUALITY_WINDOW;
  if (sampleCount < QUALITY_WINDOW) return;
  if (sampleSum / QUALITY_WINDOW > QUALITY_LIMIT) downgradeAuto();
}
