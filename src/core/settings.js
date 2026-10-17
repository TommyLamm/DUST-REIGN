import { AudioFX } from '../audio/audio-fx.js';
import { BEST_SCORE_KEY, LEGACY_BEST_SCORE_KEY } from '../config.js';
import { rt } from './runtime.js';

export var SETTINGS_KEY = 'dust-reign:settings:v1';
export var LEGACY_HAPTICS_KEY = 'dust_reign_haptics_enabled';
export var LEGACY_MOTION_KEY = 'dust_reign_motion_reduction';
export var LEGACY_CONTRAST_KEY = 'dust_reign_high_contrast';
export var LEGACY_QUALITY_KEY = 'dust_reign_visual_quality';

function getStore() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch (e) {}
  return null;
}

var hapticsEnabled = true;
var motionCached = false;
var motionValue = false;
var highContrastEnabled = false;
var visualQuality = 'auto';

function syncMotionClass(on) {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('reduced-motion', on);
    }
  } catch (e) {}
}

export function persistSettings() {
  var store = getStore();
  if (!store) return;
  try {
    var payload = {
      hapticsEnabled: hapticsEnabled,
      motionReduction: motionValue,
      highContrast: highContrastEnabled,
      visualQuality: visualQuality
    };
    store.setItem(SETTINGS_KEY, JSON.stringify(payload));
    store.setItem(LEGACY_HAPTICS_KEY, hapticsEnabled ? 'true' : 'false');
    store.setItem(LEGACY_MOTION_KEY, motionValue ? 'true' : 'false');
    store.setItem(LEGACY_CONTRAST_KEY, highContrastEnabled ? 'true' : 'false');
    store.setItem(LEGACY_QUALITY_KEY, visualQuality);
  } catch (e) {}
}

export function loadSettings() {
  var store = getStore();
  if (!store) return;
  try {
    var raw = store.getItem(SETTINGS_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.hapticsEnabled === 'boolean') {
            hapticsEnabled = parsed.hapticsEnabled;
          }
          if (typeof parsed.motionReduction === 'boolean') {
            motionValue = parsed.motionReduction;
            motionCached = true;
            syncMotionClass(motionValue);
          }
          if (typeof parsed.highContrast === 'boolean') {
            highContrastEnabled = parsed.highContrast;
          }
          if (parsed.visualQuality === 'auto' || parsed.visualQuality === 'high' ||
              parsed.visualQuality === 'medium' || parsed.visualQuality === 'low') {
            visualQuality = parsed.visualQuality;
          }
          return;
        }
      } catch (pe) {}
    }

    var legHaptics = store.getItem(LEGACY_HAPTICS_KEY);
    var legMotion = store.getItem(LEGACY_MOTION_KEY);
    var legContrast = store.getItem(LEGACY_CONTRAST_KEY);
    var legQuality = store.getItem(LEGACY_QUALITY_KEY);
    var hasLegacy = (legHaptics !== null || legMotion !== null || legContrast !== null || legQuality !== null);

    if (legHaptics !== null) {
      hapticsEnabled = legHaptics !== 'false';
    }
    if (legMotion !== null) {
      motionValue = legMotion === 'true';
      motionCached = true;
      syncMotionClass(motionValue);
    }
    if (legContrast !== null) {
      highContrastEnabled = legContrast === 'true';
    }
    if (legQuality === 'auto' || legQuality === 'high' || legQuality === 'medium' || legQuality === 'low') {
      visualQuality = legQuality;
    }
    if (hasLegacy) {
      persistSettings();
    }
  } catch (e) {}
}

loadSettings();

export function isHapticsEnabled() {
  return hapticsEnabled;
}

export function setHapticsEnabled(val) {
  hapticsEnabled = Boolean(val);
  persistSettings();
  return hapticsEnabled;
}

function savedMotion() {
  var store = getStore();
  if (!store) return null;
  try {
    var raw = store.getItem(SETTINGS_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && typeof parsed.motionReduction === 'boolean') {
          return parsed.motionReduction ? 'true' : 'false';
        }
      } catch (pe) {}
    }
    return store.getItem(LEGACY_MOTION_KEY);
  } catch (e) {}
  return null;
}

function readMotion() {
  var saved = savedMotion();
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  try {
    return typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

export function isReducedMotion() {
  if (!motionCached) {
    motionValue = readMotion();
    motionCached = true;
    syncMotionClass(motionValue);
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        var onChange = function () {
          if (savedMotion() === 'true' || savedMotion() === 'false') return;
          motionValue = readMotion();
          syncMotionClass(motionValue);
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
      }
    } catch (e) {}
  }
  return motionValue;
}

export function setMotionReduction(val) {
  var bool = Boolean(val);
  motionValue = bool;
  motionCached = true;
  syncMotionClass(bool);
  persistSettings();
  return bool;
}

export function isHighContrast() {
  return highContrastEnabled;
}

export function getVisualQuality() {
  return visualQuality;
}

export function setVisualQuality(val) {
  var next = val === 'high' || val === 'medium' || val === 'low' || val === 'auto' ? val : 'auto';
  visualQuality = next;
  persistSettings();
  return visualQuality;
}

export function cycleVisualQuality() {
  var order = ['auto', 'high', 'medium', 'low'];
  var i = order.indexOf(visualQuality);
  if (i < 0) i = 0;
  return setVisualQuality(order[(i + 1) % order.length]);
}

export function setHighContrast(val) {
  highContrastEnabled = Boolean(val);
  persistSettings();
  try {
    if (rt.ui && rt.ui.root) {
      rt.ui.root.classList.toggle('is-high-contrast', highContrastEnabled);
    } else if (typeof document !== 'undefined') {
      var r = document.querySelector('.game-root') || document.documentElement;
      if (r) r.classList.toggle('is-high-contrast', highContrastEnabled);
    }
  } catch (e) {}
  return highContrastEnabled;
}

export function triggerHaptic(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (hapticsEnabled && !AudioFX.isMuted() && !isReducedMotion()) {
        navigator.vibrate(pattern);
      }
    }
  } catch (e) {}
}

export function readBestScore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 0;
    // Keep the original score readable without deleting or rewriting old saves.
    var current = Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
    var legacy = Number(window.localStorage.getItem(LEGACY_BEST_SCORE_KEY)) || 0;
    return Math.max(0, isFinite(current) ? current : 0, isFinite(legacy) ? legacy : 0);
  } catch (error) {
    return 0;
  }
}

export function writeBestScore(score) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch (error) {
    // Private browsing and file URLs can deny storage; the run still works without it.
  }
}
