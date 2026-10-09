import { rt } from '../core/runtime.js';
import { logEvent, updateDomUi } from '../ui/hud.js';

var Playroom = null;
var playroomPromise = null;

if (typeof window !== 'undefined') {
  try {
    playroomPromise = import('../../playroom-sdk.js')
      .then(function (mod) {
        Playroom = (mod && mod.Playroom) || null;
        return Playroom;
      })
      .catch(function () {
        Playroom = null;
        return null;
      });
  } catch (e) {
    Playroom = null;
    playroomPromise = Promise.resolve(null);
  }
} else {
  playroomPromise = Promise.resolve(null);
}

export function startAccountRun() {
  rt.accountRunSaved = false;
  if (playroomPromise) {
    return playroomPromise
      .then(function (sdk) {
        if (sdk && typeof sdk.startRun === 'function') {
          return sdk.startRun().catch(function () { return null; });
        }
        return null;
      })
      .catch(function () { return null; });
  }
  return Promise.resolve(null);
}

export function finishAccountRun() {
  if (!rt.state || !rt.accountRun) return;
  var currentRun = rt.accountRun;
  rt.accountRun = null;
  var finalScore = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(rt.state.score || 0)));
  currentRun
    .then(function (run) {
      if (!run || !run.runId) return null;
      return playroomPromise.then(function (sdk) {
        if (!sdk || typeof sdk.finishRun !== 'function') return null;
        return sdk.finishRun({ runId: run.runId, score: finalScore });
      });
    })
    .then(function (result) {
      if (result && result.saved === true) {
        rt.accountRunSaved = true;
        updateDomUi();
        logEvent('PLAYROOM // SCORE SAVED');
      }
    })
    .catch(function () {
      // Platform or network failure must not block gameplay
    });
}

export function getPlayroom() {
  return Playroom;
}
