import { AudioFX } from '../audio/audio-fx.js';
import { BEST_SCORE_KEY, LEGACY_BEST_SCORE_KEY } from '../config.js';
import { rt } from './runtime.js';

var hapticsEnabled = true;
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    hapticsEnabled = window.localStorage.getItem('dust_reign_haptics_enabled') !== 'false';
  }
} catch (e) {
  hapticsEnabled = true;
}

export function isHapticsEnabled() {
  return hapticsEnabled;
}

export function setHapticsEnabled(val) {
  hapticsEnabled = Boolean(val);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dust_reign_haptics_enabled', hapticsEnabled ? 'true' : 'false');
    }
  } catch (e) {}
  return hapticsEnabled;
}

var motionCached = false;
var motionValue = false;

function savedMotion() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('dust_reign_motion_reduction');
    }
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

function syncMotionClass(on) {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('reduced-motion', on);
    }
  } catch (e) {}
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
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dust_reign_motion_reduction', bool ? 'true' : 'false');
    }
    syncMotionClass(bool);
  } catch (e) {}
  return bool;
}

var highContrastEnabled = false;
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    highContrastEnabled = window.localStorage.getItem('dust_reign_high_contrast') === 'true';
  }
} catch (e) {
  highContrastEnabled = false;
}

export function isHighContrast() {
  return highContrastEnabled;
}

var visualQuality = 'auto';
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    var savedQuality = window.localStorage.getItem('dust_reign_visual_quality');
    if (savedQuality === 'auto' || savedQuality === 'high' || savedQuality === 'medium' || savedQuality === 'low') {
      visualQuality = savedQuality;
    }
  }
} catch (e) {
  visualQuality = 'auto';
}

export function getVisualQuality() {
  return visualQuality;
}

export function setVisualQuality(val) {
  var next = val === 'high' || val === 'medium' || val === 'low' || val === 'auto' ? val : 'auto';
  visualQuality = next;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dust_reign_visual_quality', next);
    }
  } catch (e) {}
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
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dust_reign_high_contrast', highContrastEnabled ? 'true' : 'false');
    }
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
