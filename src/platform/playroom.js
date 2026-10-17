import { rt } from '../core/runtime.js';
import { logEvent, updateDomUi } from '../ui/hud.js';
import { exportUnifiedSaveData, importUnifiedSaveData, registerCheckpointHook } from '../core/meta-store.js';

var Playroom = null;
var playroomPromise = null;

// Cloud Save Container
var revision = null;
var lastSavedData = null;
var pendingRequestId = null;
var lastPendingDataJson = null;
var isSaving = false;
var formatIncompatible = false;
var saveQueue = Promise.resolve();

function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getPlayroomAsync() {
  if (Playroom) return Promise.resolve(Playroom);
  if (playroomPromise) return playroomPromise;
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
      return playroomPromise;
    } catch (e) {
      Playroom = null;
      return Promise.resolve(null);
    }
  }
  return Promise.resolve(null);
}

if (typeof window !== 'undefined') {
  getPlayroomAsync();
}

export function startAccountRun() {
  rt.accountRunSaved = false;
  return getPlayroomAsync()
    .then(function (sdk) {
      if (sdk && typeof sdk.startRun === 'function') {
        return sdk.startRun().catch(function () { return null; });
      }
      return null;
    })
    .catch(function () { return null; });
}

export function finishAccountRun() {
  if (!rt.state || !rt.accountRun) return;
  var currentRun = rt.accountRun;
  rt.accountRun = null;
  var finalScore = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(rt.state.score || 0)));
  currentRun
    .then(function (run) {
      if (!run || !run.runId) return null;
      return getPlayroomAsync().then(function (sdk) {
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

export function getCloudSaveState() {
  return {
    revision: revision,
    lastSavedData: lastSavedData,
    pendingRequestId: pendingRequestId,
    isSaving: isSaving,
    formatIncompatible: formatIncompatible
  };
}

export function setPlayroomForTesting(mockSdk) {
  Playroom = mockSdk;
  playroomPromise = Promise.resolve(mockSdk);
}

export function resetCloudSaveStateForTesting() {
  revision = null;
  lastSavedData = null;
  pendingRequestId = null;
  lastPendingDataJson = null;
  isSaving = false;
  formatIncompatible = false;
  saveQueue = Promise.resolve();
}

/**
 * loadAccountProgress()
 * - Calls Playroom.loadProgress()
 * - Returns { data, revision, formatVersion } on success
 * - Returns null in offline / unauthenticated standalone mode
 * - When server has no save (null), revision becomes 0
 * - Rejects Promise on network / server error (NEVER treat as empty save)
 * - Traps SAVE_FORMAT_INCOMPATIBLE, halts writes, and warns user
 */
export async function loadAccountProgress() {
  var sdk = await getPlayroomAsync();
  if (!sdk || typeof sdk.loadProgress !== 'function') {
    return null;
  }

  var readyState = null;
  if (typeof sdk.ready === 'function') {
    try {
      readyState = await sdk.ready();
    } catch (e) {
      readyState = null;
    }
  }

  var progressAvailable = Boolean(readyState && readyState.progressAvailable);
  var isPreview = Boolean(
    readyState &&
    readyState.mode === 'preview' &&
    readyState.capabilities &&
    readyState.capabilities.indexOf('diagnostics') !== -1
  );

  // Standalone / guest mode without progress capability: smoothly resolve null
  if (!progressAvailable && !isPreview) {
    return null;
  }

  try {
    var result = await sdk.loadProgress();
    if (result) {
      revision = typeof result.revision === 'number' ? result.revision : 0;
      return {
        data: result.data,
        revision: revision,
        formatVersion: result.formatVersion || 1
      };
    } else {
      // Server returned null (no prior save for this user)
      revision = 0;
      return {
        data: null,
        revision: 0,
        formatVersion: 1
      };
    }
  } catch (err) {
    var isFormatIncompatible = Boolean(
      err && (
        err.machineCode === 'SAVE_FORMAT_INCOMPATIBLE' ||
        (err.code === 409 && String(err.message || '').indexOf('FORMAT') !== -1)
      )
    );
    if (isFormatIncompatible) {
      formatIncompatible = true;
      logEvent('PLAYROOM // SAVE FORMAT INCOMPATIBLE');
    }
    // Reject promise on network/server error - MUST NOT initialize empty progress!
    throw err;
  }
}

/**
 * saveAccountProgress(data, options)
 * - Only saves when progressAvailable (or preview diagnostics) and revision !== null
 * - Stops writing if formatIncompatible is true
 * - Constructs { data, revision, formatVersion: 1, requestId }
 * - Reuses same requestId on network timeout / interruption retry for identical snapshot
 * - On SAVE_REVISION_CONFLICT (409): loads latest cloud progress, executes two-way smart merge, and retries saving
 * - Only updates local revision when saved === true
 * - Returns null in preview mode (memory only, never saved to real account)
 */
export function saveAccountProgress(data, options) {
  options = options || {};
  if (formatIncompatible) {
    return Promise.resolve(null);
  }
  if (revision === null) {
    return Promise.resolve(null);
  }

  // Chain save operations sequentially while allowing queue recovery on errors
  var currentSave = saveQueue
    .catch(function () {})
    .then(function () {
      return executeSave(data, options);
    });
  saveQueue = currentSave.catch(function () {});
  return currentSave;
}

async function executeSave(data, options, conflictCount) {
  conflictCount = conflictCount || 0;
  if (conflictCount > 3) {
    throw new Error('SAVE_REVISION_CONFLICT: Max auto-merge retry exceeded');
  }

  var sdk = await getPlayroomAsync();
  if (!sdk || typeof sdk.saveProgress !== 'function') {
    return null;
  }

  var readyState = null;
  if (typeof sdk.ready === 'function') {
    try {
      readyState = await sdk.ready();
    } catch (e) {
      readyState = null;
    }
  }

  var progressAvailable = Boolean(readyState && readyState.progressAvailable);
  var isPreview = Boolean(
    readyState &&
    readyState.mode === 'preview' &&
    readyState.capabilities &&
    readyState.capabilities.indexOf('diagnostics') !== -1
  );

  if (!progressAvailable && !isPreview) {
    return null;
  }

  // Manage requestId
  var dataJson = JSON.stringify(data);
  var requestId;
  if (options && options.requestId) {
    requestId = options.requestId;
  } else if (lastPendingDataJson === dataJson && pendingRequestId) {
    requestId = pendingRequestId;
  } else {
    requestId = generateUuid();
    lastPendingDataJson = dataJson;
    pendingRequestId = requestId;
  }

  var payload = {
    data: data,
    revision: revision,
    formatVersion: 1,
    requestId: requestId
  };

  isSaving = true;
  try {
    var result = await sdk.saveProgress(payload);
    isSaving = false;

    if (readyState && readyState.mode === 'preview') {
      // Preview mode returns null; transient memory only
      pendingRequestId = null;
      lastPendingDataJson = null;
      return null;
    }

    if (result && result.saved === true) {
      revision = typeof result.revision === 'number' ? result.revision : (revision + 1);
      lastSavedData = data;
      pendingRequestId = null;
      lastPendingDataJson = null;
      logEvent('PLAYROOM // CLOUD SAVE SYNCED');
      updateDomUi();
      return result;
    }
    return result;
  } catch (err) {
    isSaving = false;

    var isConflict = Boolean(
      err && (
        err.machineCode === 'SAVE_REVISION_CONFLICT' ||
        err.code === 409 ||
        String(err.message || '').indexOf('REVISION_CONFLICT') !== -1
      )
    );
    var isFormatIncomp = Boolean(
      err && (
        err.machineCode === 'SAVE_FORMAT_INCOMPATIBLE' ||
        String(err.message || '').indexOf('FORMAT') !== -1
      )
    );

    if (isFormatIncomp) {
      formatIncompatible = true;
      logEvent('PLAYROOM // SAVE FORMAT INCOMPATIBLE');
      throw err;
    }

    if (isConflict) {
      logEvent('PLAYROOM // REVISION CONFLICT -> AUTO MERGING');
      // 1. Fetch latest progress from cloud
      var latest = await loadAccountProgress();
      if (latest && latest.data) {
        // 2. Perform two-way smart merge into local localStorage
        importUnifiedSaveData(latest.data);
      }
      // 3. Export new merged data and save with new requestId
      var mergedData = exportUnifiedSaveData();
      pendingRequestId = null;
      lastPendingDataJson = null;
      return executeSave(mergedData, { requestId: generateUuid() }, conflictCount + 1);
    }

    // Network timeout / request in flight: keep pendingRequestId for retry
    throw err;
  }
}

/**
 * saveAccountCheckpoint()
 * High-level checkpoint trigger: exports unified save and saves to cloud.
 * Never throws, allowing gameplay to proceed uninterrupted.
 */
export function saveAccountCheckpoint() {
  if (revision === null || formatIncompatible) {
    return Promise.resolve(null);
  }
  try {
    var snapshot = exportUnifiedSaveData();
    return saveAccountProgress(snapshot).catch(function () {
      return null;
    });
  } catch (e) {
    return Promise.resolve(null);
  }
}

// Register as the global checkpoint hook for meta-store mutations
registerCheckpointHook(saveAccountCheckpoint);
