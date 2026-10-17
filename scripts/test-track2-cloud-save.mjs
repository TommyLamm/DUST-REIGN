import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('=== [TRACK 2 TEST SUITE: CLOUD SAVE & SCHEMA V2] ===\n');

// ---------------------------------------------------------------------------
// 1. Manifest Schema Version 2 & Cloud Save Spec Verification
// ---------------------------------------------------------------------------
console.log('[1/5] Verifying game.json Schema v2 & cloudSave declaration...');
const gameJsonPath = path.join(ROOT_DIR, 'game.json');
const gameJson = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));

assert.strictEqual(gameJson.schemaVersion, 2, 'schemaVersion must be 2');
assert.ok(gameJson.cloudSave, 'cloudSave object must be declared');
assert.deepStrictEqual(gameJson.cloudSave.readableFormats, [1], 'readableFormats must contain [1]');
assert.strictEqual(gameJson.cloudSave.writeFormat, 1, 'writeFormat must be 1');
console.log(' -> Manifest Schema v2 & cloudSave declaration verified.');

// Mock localStorage for headless Node execution
var storage = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function (k, v) { storage[k] = String(v); },
  removeItem: function (k) { delete storage[k]; },
  clear: function () { storage = {}; }
};

// Import modules
const {
  exportUnifiedSaveData,
  importUnifiedSaveData,
  readMeta,
  writeMeta,
  readScrap,
  addScrap,
  getCampaignStore,
  saveCampaignStore,
  getHardcoreStore,
  saveHardcoreStore,
  getWorkshopState,
  readBestScoreV2,
  writeBestScoreV2,
  upgradeModule
} = await import('../src/core/meta-store.js');

const {
  loadAccountProgress,
  saveAccountProgress,
  saveAccountCheckpoint,
  getCloudSaveState,
  setPlayroomForTesting,
  resetCloudSaveStateForTesting
} = await import('../src/platform/playroom.js');

// ---------------------------------------------------------------------------
// 2. Unified Save Data Structure, UTF-8 Size (≤ 64 KiB), & Tree Depth (≤ 32)
// ---------------------------------------------------------------------------
console.log('\n[2/5] Testing exportUnifiedSaveData() payload size and depth...');
localStorage.clear();

const snapshot = exportUnifiedSaveData();
assert.ok(snapshot, 'Snapshot must not be null');
assert.strictEqual(snapshot.version, 1, 'Snapshot version should be 1');
assert.ok(snapshot.meta, 'Snapshot must contain meta');
assert.ok(snapshot.campaign, 'Snapshot must contain campaign');
assert.ok(snapshot.hardcore, 'Snapshot must contain hardcore');
assert.ok(snapshot.workshop, 'Snapshot must contain workshop');
assert.ok(snapshot.vault, 'Snapshot must contain vault');
assert.ok(snapshot.bounties, 'Snapshot must contain bounties');
assert.ok(typeof snapshot.bestScore === 'number', 'Snapshot must contain bestScore number');

const serialized = JSON.stringify(snapshot);
const byteLength = Buffer.byteLength(serialized, 'utf8');
console.log(`    Exported Unified Save UTF-8 Size: ${byteLength} bytes (${(byteLength / 1024).toFixed(2)} KiB)`);
assert.ok(byteLength <= 65536, 'Serialized snapshot must be <= 64 KiB (65536 bytes)');

function calculateDepth(obj) {
  if (obj === null || typeof obj !== 'object') return 1;
  let maxChild = 0;
  for (const k of Object.keys(obj)) {
    maxChild = Math.max(maxChild, calculateDepth(obj[k]));
  }
  return 1 + maxChild;
}
const depth = calculateDepth(snapshot);
console.log(`    Exported Unified Save Max Tree Depth: ${depth} levels`);
assert.ok(depth <= 32, 'Max tree depth must be <= 32');
console.log(' -> Unified Save serialization limits and structure verified.');

// ---------------------------------------------------------------------------
// 3. Two-Way Smart Merge (importUnifiedSaveData)
// ---------------------------------------------------------------------------
console.log('\n[3/5] Testing Two-Way Smart Merge (importUnifiedSaveData)...');
localStorage.clear();

// Set local progress
writeBestScoreV2(500);
addScrap(120);
const localCamp = getCampaignStore();
localCamp.stages['stage_1_1'] = {
  stars: 2,
  highScore: 1200,
  bestTime: 65,
  completedAt: '2026-10-10T00:00:00Z',
  starDetails: { star1: true, star2: true, star3: false }
};
saveCampaignStore(localCamp);

// Construct higher cloud progress
const cloudData = {
  bestScore: 850,
  meta: {
    scrap: 400,
    heatUnlocked: 3,
    unlockedRigs: ['scrapper', 'bulwark', 'strider']
  },
  campaign: {
    stages: {
      'stage_1_1': {
        stars: 3,
        highScore: 1800,
        bestTime: 48,
        completedAt: '2026-10-12T00:00:00Z',
        starDetails: { star1: true, star2: true, star3: true }
      },
      'stage_1_2': {
        stars: 1,
        highScore: 900,
        bestTime: 55,
        completedAt: '2026-10-12T00:00:00Z',
        starDetails: { star1: true, star2: false, star3: false }
      }
    },
    unlockedStages: ['stage_1_1', 'stage_1_2']
  },
  hardcore: {
    operations: {
      'op_01': {
        cleared: true,
        bestTime: 52,
        badge: 'badge_razor_clear',
        attempts: 2
      }
    },
    unlockedBadges: ['badge_razor_clear']
  },
  workshop: {
    unlockedModules: {
      m_phase_bearing: 3,
      b_reactive_plasma: 2
    }
  },
  vault: {
    unlockedSkins: ['default', 'paint_neon_dusk'],
    unlockedTrails: ['default', 'trail_amber_jet']
  }
};

const mergeResult = importUnifiedSaveData(cloudData);
assert.strictEqual(mergeResult, true, 'Merge should succeed');

// Assert local state after merge:
assert.strictEqual(readBestScoreV2(), 850, 'Best score should be max(500, 850) = 850');
assert.strictEqual(readScrap(), 400, 'Scrap should be max(120, 400) = 400');

const mergedMeta = readMeta();
assert.strictEqual(mergedMeta.heatUnlocked, 3, 'Heat unlocked should be 3');
assert.ok(mergedMeta.unlockedRigs.includes('bulwark'), 'Bulwark should be unlocked');
assert.ok(mergedMeta.unlockedRigs.includes('strider'), 'Strider should be unlocked');

const mergedCamp = getCampaignStore();
const s1_1 = mergedCamp.stages['stage_1_1'];
assert.strictEqual(s1_1.stars, 3, 'Stage 1-1 stars should be max(2, 3) = 3');
assert.strictEqual(s1_1.highScore, 1800, 'Stage 1-1 highScore should be max(1200, 1800) = 1800');
assert.strictEqual(s1_1.bestTime, 48, 'Stage 1-1 bestTime should be min(65, 48) = 48');
assert.strictEqual(s1_1.starDetails.star3, true, 'Star 3 should be true');
assert.ok(mergedCamp.unlockedStages.includes('stage_1_2'), 'Stage 1-2 should be unlocked');

const mergedHard = getHardcoreStore();
assert.strictEqual(mergedHard.operations['op_01']?.cleared, true, 'Op 01 should be cleared');
assert.ok(mergedHard.unlockedBadges.includes('badge_razor_clear'), 'Badge should be unlocked');

const wsState = getWorkshopState();
assert.strictEqual(wsState.unlockedModules['m_phase_bearing'], 3, 'Module tier should be 3');
assert.strictEqual(wsState.unlockedModules['b_reactive_plasma'], 2, 'Module tier should be 2');

console.log(' -> Two-Way Smart Merge logic verified.');

// ---------------------------------------------------------------------------
// 4. Playroom SDK 1.1.0 Cloud Save Integration & Optimistic Lock
// ---------------------------------------------------------------------------
console.log('\n[4/5] Testing Playroom SDK 1.1.0 Cloud Save Integration...');

// Test 4A: Standalone / Guest mode without progress
resetCloudSaveStateForTesting();
setPlayroomForTesting({
  ready: async () => ({ available: false, progressAvailable: false, mode: 'standalone' })
});

const standaloneLoad = await loadAccountProgress();
assert.strictEqual(standaloneLoad, null, 'Standalone load should resolve null');
assert.strictEqual(getCloudSaveState().revision, null, 'Revision should remain null in standalone');

const standaloneSave = await saveAccountProgress(exportUnifiedSaveData());
assert.strictEqual(standaloneSave, null, 'Standalone save should return null');

// Test 4B: First-time user in authenticated mode (server has null progress)
let serverSave = null;
let serverRevision = 0;
let requestLog = [];

const mockSdk = {
  ready: async () => ({
    available: true,
    progressAvailable: true,
    mode: 'authenticated',
    capabilities: ['scoring', 'progress', 'diagnostics', 'saveFormats', 'machineErrors']
  }),
  loadProgress: async () => {
    if (!serverSave) return null;
    return {
      data: serverSave,
      revision: serverRevision,
      formatVersion: 1
    };
  },
  saveProgress: async ({ data, revision: clientRev, formatVersion, requestId }) => {
    requestLog.push({ clientRev, requestId, data });
    if (clientRev !== serverRevision) {
      const err = new Error('Revision conflict');
      err.code = 409;
      err.machineCode = 'SAVE_REVISION_CONFLICT';
      throw err;
    }
    serverRevision += 1;
    serverSave = JSON.parse(JSON.stringify(data));
    return {
      saved: true,
      revision: serverRevision,
      formatVersion: 1
    };
  }
};

resetCloudSaveStateForTesting();
setPlayroomForTesting(mockSdk);

// First load: server returns null -> local revision becomes 0
const initialLoad = await loadAccountProgress();
assert.deepStrictEqual(initialLoad, { data: null, revision: 0, formatVersion: 1 }, 'Initial load should return revision 0');
assert.strictEqual(getCloudSaveState().revision, 0, 'Local revision must be 0');

// Save first progress: clientRev = 0, serverRevision = 0 -> success, new rev = 1
const firstSave = await saveAccountProgress(exportUnifiedSaveData());
assert.strictEqual(firstSave.saved, true, 'First save should succeed');
assert.strictEqual(firstSave.revision, 1, 'Server returned revision 1');
assert.strictEqual(getCloudSaveState().revision, 1, 'Local revision updated to 1');
assert.strictEqual(serverRevision, 1, 'Server revision is 1');

// Test 4C: RequestId reuse on identical snapshot retry
let failNextSave = true;
let capturedFirstRequestId = null;

const timeoutSdk = {
  ...mockSdk,
  saveProgress: async (payload) => {
    requestLog.push({ ...payload });
    if (failNextSave) {
      failNextSave = false;
      capturedFirstRequestId = payload.requestId;
      const err = new Error('Request Timeout');
      err.code = 408;
      err.machineCode = 'REQUEST_TIMEOUT';
      throw err;
    }
    serverRevision += 1;
    serverSave = JSON.parse(JSON.stringify(payload.data));
    return { saved: true, revision: serverRevision, formatVersion: 1 };
  }
};
setPlayroomForTesting(timeoutSdk);

const testData = exportUnifiedSaveData();
// 1st attempt: fails
let errCaught = false;
try {
  await saveAccountProgress(testData);
} catch (e) {
  errCaught = true;
}
assert.strictEqual(errCaught, true, 'First attempt should throw timeout');
assert.ok(capturedFirstRequestId, 'RequestId should have been generated');

// 2nd attempt (identical snapshot retry): MUST reuse the same requestId
const retrySave = await saveAccountProgress(testData);
assert.strictEqual(retrySave.saved, true, 'Retry save should succeed');
const lastReq = requestLog[requestLog.length - 1];
assert.strictEqual(lastReq.requestId, capturedFirstRequestId, 'Identical snapshot retry must strictly reuse requestId');

// Test 4D: SAVE_REVISION_CONFLICT auto-merge
// Simulate another device updating server to revision 3 with higher stats
serverRevision = 3;
serverSave = {
  bestScore: 9999,
  meta: { scrap: 888, heatUnlocked: 5 },
  campaign: { stages: {} },
  hardcore: { operations: {} },
  workshop: { unlockedModules: { m_phase_bearing: 3 } },
  vault: { unlockedSkins: ['default'] },
  bounties: { date: '' }
};

// Current local client still thinks revision is 2: saving should trigger conflict -> auto-load -> merge -> re-save!
setPlayroomForTesting(mockSdk); // restore mockSdk with normal conflict behavior
const conflictSaveResult = await saveAccountProgress(exportUnifiedSaveData());
assert.strictEqual(conflictSaveResult.saved, true, 'Save with conflict should auto-merge and succeed');
assert.strictEqual(getCloudSaveState().revision, 4, 'Revision should now be 4 after auto-merged save');
assert.strictEqual(readBestScoreV2(), 9999, 'Local best score should have merged to 9999');
assert.strictEqual(readScrap(), 888, 'Local scrap should have merged to 888');

// Test 4E: SAVE_FORMAT_INCOMPATIBLE
const incompatibleSdk = {
  ...mockSdk,
  loadProgress: async () => {
    const err = new Error('Incompatible format');
    err.code = 409;
    err.machineCode = 'SAVE_FORMAT_INCOMPATIBLE';
    throw err;
  }
};
setPlayroomForTesting(incompatibleSdk);
let incompCaught = false;
try {
  await loadAccountProgress();
} catch (e) {
  incompCaught = true;
}
assert.strictEqual(incompCaught, true, 'SAVE_FORMAT_INCOMPATIBLE should reject');
assert.strictEqual(getCloudSaveState().formatIncompatible, true, 'formatIncompatible must be marked true');

// Further writes should be completely blocked
const blockedSave = await saveAccountProgress(exportUnifiedSaveData());
assert.strictEqual(blockedSave, null, 'Writing must be halted when format is incompatible');

console.log(' -> Playroom SDK 1.1.0 Cloud Save & Optimistic Concurrency verified.');

// ---------------------------------------------------------------------------
// 5. Automatic Checkpoint Save Hooks
// ---------------------------------------------------------------------------
console.log('\n[5/5] Testing Automatic Checkpoint Save Hooks...');
resetCloudSaveStateForTesting();
serverRevision = 10;
serverSave = exportUnifiedSaveData();
setPlayroomForTesting(mockSdk);

// Establish clean online session
await loadAccountProgress();
assert.strictEqual(getCloudSaveState().revision, 10, 'Established revision 10');

// Trigger upgradeModule: should auto trigger saveAccountCheckpoint
addScrap(500);
const preScrap = readScrap();
const upgradeRes = upgradeModule('m_vector_thruster');
assert.strictEqual(upgradeRes.ok, true, 'Module upgrade should succeed');

// Give microtask tick for async checkpoint hook
await new Promise(r => setTimeout(r, 50));
assert.strictEqual(getCloudSaveState().revision, 11, 'Checkpoint save should auto increment revision to 11');

console.log(' -> Checkpoint save hooks verified.');

console.log('\n=============================================');
console.log('  ALL TRACK 2 CLOUD SAVE TESTS PASSED (100%) ');
console.log('=============================================\n');
