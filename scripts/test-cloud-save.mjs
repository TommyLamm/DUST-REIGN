import assert from 'node:assert';
import {
  readMeta,
  writeMeta,
  getCampaignStore,
  saveCampaignStore,
  getHardcoreStore,
  saveHardcoreStore,
  readBestScoreV2,
  writeBestScoreV2,
  readModdedBestScore,
  writeModdedBestScore,
  readScrap,
  addScrap
} from '../src/core/meta-store.js';
import {
  isHapticsEnabled,
  setHapticsEnabled,
  isReducedMotion,
  setMotionReduction,
  isHighContrast,
  setHighContrast,
  getVisualQuality,
  setVisualQuality,
  loadSettings as loadCoreSettings,
  SETTINGS_KEY,
  LEGACY_HAPTICS_KEY,
  LEGACY_MOTION_KEY,
  LEGACY_CONTRAST_KEY,
  LEGACY_QUALITY_KEY
} from '../src/core/settings.js';
import { AudioFX } from '../src/audio/audio-fx.js';
var { AUDIO_KEY, LEGACY_AUDIO_MUTED_KEY, LEGACY_AUDIO_VOLUME_KEY } = AudioFX;
import {
  getLanguage,
  setLanguage,
  loadLanguage,
  LANG_KEY,
  LEGACY_LANG_KEY
} from '../src/core/i18n.js';
import {
  createUnifiedSave,
  applyUnifiedSave,
  calculateSaveSize,
  calculateSaveDepth,
  smartMergeSaves,
  CloudSaveManager,
  UNIFIED_SAVE_SCHEMA_VERSION
} from '../src/core/cloud-save.js';

console.log('================================================================');
console.log('  DUST//REIGN CLOUD SAVE & NAMESPACE MIGRATION TEST SUITE');
console.log('================================================================');

// Mock localStorage for Node test environment
var storageMap = Object.create(null);
globalThis.localStorage = {
  getItem: function (k) {
    return Object.prototype.hasOwnProperty.call(storageMap, k) ? storageMap[k] : null;
  },
  setItem: function (k, v) {
    storageMap[k] = String(v);
  },
  removeItem: function (k) {
    delete storageMap[k];
  },
  clear: function () {
    storageMap = Object.create(null);
  }
};

// ============================================================================
// 1. 舊版鍵值平滑自動遷移驗證 (Legacy Key Backward-Compatible Smooth Migration)
// ============================================================================
console.log('\n[1/4] Testing Legacy Key Smooth Backward-Compatible Migration...');

// 1A. Audio FX Migration
localStorage.clear();
localStorage.setItem(LEGACY_AUDIO_MUTED_KEY, 'true');
localStorage.setItem(LEGACY_AUDIO_VOLUME_KEY, '42');
assert.strictEqual(localStorage.getItem(AUDIO_KEY), null, 'New audio key should not exist initially');

AudioFX.loadSettings();
assert.strictEqual(AudioFX.isMuted(), true, 'AudioFX should read muted=true from legacy key');
assert.strictEqual(AudioFX.getMasterVolume(), 42, 'AudioFX should read masterVolume=42 from legacy key');

var migratedAudioRaw = localStorage.getItem(AUDIO_KEY);
assert.notStrictEqual(migratedAudioRaw, null, 'AudioFX must smoothly migrate and write to dust-reign:audio:v1');
var migratedAudio = JSON.parse(migratedAudioRaw);
assert.strictEqual(migratedAudio.muted, true, 'Migrated audio.muted should be true');
assert.strictEqual(migratedAudio.masterVolume, 42, 'Migrated audio.masterVolume should be 42');

// Test modifying audio persists to new standard key
AudioFX.setMasterVolume(75);
AudioFX.setMuted(false);
var updatedAudio = JSON.parse(localStorage.getItem(AUDIO_KEY));
assert.strictEqual(updatedAudio.muted, false, 'Updated audio.muted should be false in dust-reign:audio:v1');
assert.strictEqual(updatedAudio.masterVolume, 75, 'Updated audio.masterVolume should be 75 in dust-reign:audio:v1');
console.log('  -> AudioFX migration to dust-reign:audio:v1 verified.');

// 1B. i18n Migration
localStorage.clear();
localStorage.setItem(LEGACY_LANG_KEY, 'en');
assert.strictEqual(localStorage.getItem(LANG_KEY), null, 'New lang key should not exist initially');

loadLanguage();
assert.strictEqual(getLanguage(), 'en', 'i18n should read "en" from legacy key');
assert.strictEqual(localStorage.getItem(LANG_KEY), 'en', 'i18n must smoothly migrate and write to dust-reign:lang:v1');

setLanguage('zh');
assert.strictEqual(localStorage.getItem(LANG_KEY), 'zh', 'setLanguage should persist to dust-reign:lang:v1');
console.log('  -> i18n migration to dust-reign:lang:v1 verified.');

// 1C. Settings Migration
localStorage.clear();
localStorage.setItem(LEGACY_HAPTICS_KEY, 'false');
localStorage.setItem(LEGACY_MOTION_KEY, 'true');
localStorage.setItem(LEGACY_CONTRAST_KEY, 'true');
localStorage.setItem(LEGACY_QUALITY_KEY, 'low');
assert.strictEqual(localStorage.getItem(SETTINGS_KEY), null, 'New settings key should not exist initially');

loadCoreSettings();
assert.strictEqual(isHapticsEnabled(), false, 'Haptics should read false from legacy key');
assert.strictEqual(isReducedMotion(), true, 'Motion reduction should read true from legacy key');
assert.strictEqual(isHighContrast(), true, 'High contrast should read true from legacy key');
assert.strictEqual(getVisualQuality(), 'low', 'Visual quality should read "low" from legacy key');

var migratedSettingsRaw = localStorage.getItem(SETTINGS_KEY);
assert.notStrictEqual(migratedSettingsRaw, null, 'Settings must smoothly migrate and write to dust-reign:settings:v1');
var migratedSettings = JSON.parse(migratedSettingsRaw);
assert.strictEqual(migratedSettings.hapticsEnabled, false);
assert.strictEqual(migratedSettings.motionReduction, true);
assert.strictEqual(migratedSettings.highContrast, true);
assert.strictEqual(migratedSettings.visualQuality, 'low');

// Test updating settings persists to standard key
setVisualQuality('high');
var updatedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
assert.strictEqual(updatedSettings.visualQuality, 'high', 'Visual quality should update in dust-reign:settings:v1');
console.log('  -> Settings migration to dust-reign:settings:v1 verified.');

// ============================================================================
// 2. Unified Save 序列化結構與大小限制檢驗 (Structure & Size Constraints)
// ============================================================================
console.log('\n[2/4] Testing Unified Save Serialization, Size (<16 KiB) & Depth (<=5)...');

// Simulate maximum endgame progression:
// 15★ Campaign stages with full 3-star details and high scores
var maxStages = {};
var stageChain = [
  'stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4',
  'stage_2_1', 'stage_2_2', 'stage_2_3', 'stage_2_4',
  'stage_3_1', 'stage_3_2', 'stage_3_3', 'stage_3_4',
  'stage_ex_1', 'stage_ex_2', 'stage_ex_3'
];
stageChain.forEach(function (id, idx) {
  maxStages[id] = {
    stars: 3,
    highScore: 85000 + idx * 3000,
    bestTime: 95.4 + idx * 5.2,
    completedAt: '2026-10-17T12:00:00.000Z',
    starDetails: { star1: true, star2: true, star3: true }
  };
});

var fullCampaign = {
  v: 1,
  selectedStage: 'stage_ex_3',
  unlockedStages: stageChain.slice(),
  unlockedBoosters: ['emergency_overdrive', 'resonant_emp', 'heavy_pierce'],
  stages: maxStages,
  stats: {
    totalStars: 45,
    stagesCleared: 15,
    attempts: 42
  }
};
saveCampaignStore(fullCampaign);

// 6 Hardcore Operations cleared with badges
var hardcoreOps = {};
var hardcoreBadges = ['badge_iron', 'badge_razor', 'badge_void', 'badge_storm', 'badge_titan', 'badge_apex'];
['op_01', 'op_02', 'op_03', 'op_04', 'op_05', 'op_06'].forEach(function (opId, idx) {
  hardcoreOps[opId] = {
    cleared: true,
    bestTime: 82.5 + idx * 8.0,
    attempts: 6 + idx,
    completedAt: '2026-10-17T12:30:00.000Z',
    badge: hardcoreBadges[idx]
  };
});
saveHardcoreStore({
  v: 1,
  selectedOperation: 'op_06',
  operations: hardcoreOps,
  unlockedBadges: hardcoreBadges.slice()
});

// Meta progression: max stats, 9 modules at tier 3, all rigs, full achievements
var fullMeta = {
  v: 1,
  selectedRig: 'bulwark',
  selectedWeapon: 'vanguard',
  selectedHeat: 5,
  selectedMode: 'campaign',
  heatUnlocked: 5,
  unlockedRigs: ['scrapper', 'strider', 'bulwark', 'salvager'],
  scrap: 12500,
  achievements: {
    first_blood: '2026-10-17T10:00:00.000Z',
    boss_slayer: '2026-10-17T10:15:00.000Z',
    extraction_veteran: '2026-10-17T10:30:00.000Z',
    iron_wall: '2026-10-17T10:45:00.000Z',
    overclock_master: '2026-10-17T11:00:00.000Z'
  },
  stats: {
    runs: 128,
    kills: 45200,
    justDashes: 1840,
    contracts: 320,
    extractions: 64,
    bestWave: 25,
    playTimeSec: 48600,
    bossKills: { titan: 12, sovereign: 8, dreadnought: 15 },
    fusionsSeen: ['fusion_plasma_lance', 'fusion_tempest_array', 'fusion_supernova'],
    seenEnemies: ['crawler', 'rusher', 'brute', 'artillery', 'elite', 'spitter', 'scurrier', 'warden', 'burrower', 'titan', 'dreadnought', 'sovereign', 'stormTower', 'mine', 'spire']
  },
  workshop: {
    unlockedModules: {
      m_phase_bearing: 3,
      m_vector_thruster: 3,
      m_kinetic_turbine: 3,
      b_reactive_plasma: 3,
      b_scrap_bulkhead: 3,
      b_aegis_core: 3,
      c_resonance_fc: 3,
      c_flux_condenser: 3,
      c_surge_unit: 3
    },
    loadout: {
      propulsion: 'm_vector_thruster',
      armor: 'b_reactive_plasma',
      tactical: 'c_resonance_fc'
    }
  },
  cosmetics: {
    selectedSkin: 'obsidian',
    selectedTrail: 'neon_amber',
    unlockedSkins: ['default', 'obsidian', 'hazard_stripes', 'arctic_camo'],
    unlockedTrails: ['default', 'neon_amber', 'plasma_blue', 'void_purple']
  },
  dailyContracts: {
    date: '2026-10-17',
    bounties: [
      { id: 'bounty_kill_count', progress: 50, goal: 50, claimed: true, reward: 120 },
      { id: 'bounty_no_damage', progress: 3, goal: 3, claimed: true, reward: 180 },
      { id: 'bounty_boss_fast', progress: 1, goal: 1, claimed: true, reward: 250 }
    ],
    grandSlamClaimed: true
  }
};
writeMeta(fullMeta);
writeBestScoreV2(982400);
writeModdedBestScore(765100);

// Generate Unified Save
var unified = createUnifiedSave();

// Structural assertions
assert.strictEqual(unified.schemaVersion, 1, 'Unified save schemaVersion should be 1');
assert.strictEqual(unified.game, 'dust-reign', 'Unified save game identifier should be dust-reign');
assert.strictEqual(unified.campaign.stats.totalStars, 45, 'Campaign total stars should be 45');
assert.strictEqual(unified.hardcore.unlockedBadges.length, 6, 'Hardcore should have 6 badges');
assert.strictEqual(unified.scores.bestScoreV2, 982400, 'bestScoreV2 should be 982400');
assert.strictEqual(unified.scores.modScoreV2, 765100, 'modScoreV2 should be 765100');

// Serialization size limit check: Must be far below 64 KiB platform limit (e.g. < 16 KiB)
var sizeBytes = calculateSaveSize(unified);
var sizeKiB = (sizeBytes / 1024).toFixed(2);
console.log('  -> Full Endgame Unified Save Size: ' + sizeBytes + ' bytes (' + sizeKiB + ' KiB)');
assert.ok(sizeBytes < 16384, 'Unified save size (' + sizeBytes + ' bytes) must be strictly under 16 KiB');
assert.ok(sizeBytes < 65536, 'Unified save size must be strictly under platform 64 KiB ceiling');

// Object hierarchy depth check: Must be <= 5 levels
var depth = calculateSaveDepth(unified);
console.log('  -> Full Endgame Object Hierarchy Depth: ' + depth + ' levels');
assert.ok(depth <= 5, 'Unified save object hierarchy depth (' + depth + ') must be <= 5 levels');

// ============================================================================
// 3. 智慧合併演算法 (Smart Merge: Cross-Device Union & Max)
// ============================================================================
console.log('\n[3/4] Testing Smart Merge Algorithm (10★ vs 12★ Cross-Device Union)...');

// Device A (Local): 10★ total, high score on stage 1-4 = 60,000, bestScore = 95,000
var localSave = {
  schemaVersion: 1,
  game: 'dust-reign',
  exportedAt: '2026-10-17T11:00:00.000Z',
  scores: { bestScoreV2: 95000, modScoreV2: 40000 },
  campaign: {
    v: 1,
    selectedStage: 'stage_1_4',
    unlockedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4'],
    unlockedBoosters: ['emergency_overdrive'],
    stages: {
      stage_1_1: { stars: 3, highScore: 50000, bestTime: 90, starDetails: { star1: true, star2: true, star3: true } },
      stage_1_2: { stars: 3, highScore: 45000, bestTime: 95, starDetails: { star1: true, star2: true, star3: true } },
      stage_1_3: { stars: 3, highScore: 40000, bestTime: 100, starDetails: { star1: true, star2: true, star3: true } },
      stage_1_4: { stars: 1, highScore: 60000, bestTime: 130, starDetails: { star1: true, star2: false, star3: false } }
    },
    stats: { totalStars: 10, stagesCleared: 4, attempts: 18 }
  },
  hardcore: {
    v: 1,
    selectedOperation: 'op_02',
    operations: {
      op_01: { cleared: true, bestTime: 110, attempts: 2, badge: 'badge_iron' },
      op_02: { cleared: true, bestTime: 115, attempts: 4, badge: 'badge_razor' }
    },
    unlockedBadges: ['badge_iron', 'badge_razor']
  },
  meta: {
    v: 1,
    scrap: 500,
    unlockedRigs: ['scrapper', 'bulwark'],
    achievements: { first_blood: '2026-10-17T09:00:00.000Z' },
    stats: { runs: 20, kills: 5000, justDashes: 100, bestWave: 15 },
    workshop: {
      unlockedModules: { m_phase_bearing: 3, b_reactive_plasma: 1 },
      loadout: { propulsion: 'm_phase_bearing', armor: null, tactical: null }
    },
    cosmetics: {
      unlockedSkins: ['default', 'obsidian'],
      unlockedTrails: ['default']
    }
  },
  settings: { hapticsEnabled: true, motionReduction: false, highContrast: true, visualQuality: 'high' },
  audio: { muted: false, masterVolume: 80 },
  lang: 'zh'
};

// Device B (Cloud): 12★ total, lower score on stage 1-4 = 25,000, bestScore = 70,000, has op_03 cleared
var cloudSave = {
  schemaVersion: 1,
  game: 'dust-reign',
  exportedAt: '2026-10-17T11:30:00.000Z',
  scores: { bestScoreV2: 70000, modScoreV2: 55000 },
  campaign: {
    v: 1,
    selectedStage: 'stage_2_1',
    unlockedStages: ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4', 'stage_2_1'],
    unlockedBoosters: ['emergency_overdrive', 'resonant_emp'],
    stages: {
      stage_1_1: { stars: 3, highScore: 30000, bestTime: 85, starDetails: { star1: true, star2: true, star3: true } },
      stage_1_2: { stars: 3, highScore: 32000, bestTime: 92, starDetails: { star1: true, star2: true, star3: true } },
      stage_1_3: { stars: 3, highScore: 35000, bestTime: 98, starDetails: { star1: true, star2: true, star3: true } },
      stage_1_4: { stars: 3, highScore: 25000, bestTime: 105, starDetails: { star1: true, star2: true, star3: true } }
    },
    stats: { totalStars: 12, stagesCleared: 4, attempts: 25 }
  },
  hardcore: {
    v: 1,
    selectedOperation: 'op_03',
    operations: {
      op_02: { cleared: true, bestTime: 100, attempts: 3, badge: 'badge_razor' },
      op_03: { cleared: true, bestTime: 120, attempts: 5, badge: 'badge_void' }
    },
    unlockedBadges: ['badge_razor', 'badge_void']
  },
  meta: {
    v: 1,
    scrap: 800,
    unlockedRigs: ['scrapper', 'strider'],
    achievements: { boss_slayer: '2026-10-17T09:30:00.000Z' },
    stats: { runs: 28, kills: 7200, justDashes: 150, bestWave: 18 },
    workshop: {
      unlockedModules: { m_phase_bearing: 1, b_reactive_plasma: 2 },
      loadout: { propulsion: null, armor: 'b_reactive_plasma', tactical: null }
    },
    cosmetics: {
      unlockedSkins: ['default'],
      unlockedTrails: ['default', 'neon_amber']
    }
  },
  settings: { hapticsEnabled: true, motionReduction: false, highContrast: false, visualQuality: 'medium' },
  audio: { muted: false, masterVolume: 80 },
  lang: 'en'
};

var merged = smartMergeSaves(localSave, cloudSave);

// Verify Union & Max properties:
// Campaign stage 1-4: Stars from Cloud (3★), High Score from Local (60,000), Best Time from Cloud (105s)
assert.strictEqual(merged.campaign.stages.stage_1_4.stars, 3, 'Merged stage 1-4 stars should be 3 (from Cloud 12★)');
assert.strictEqual(merged.campaign.stages.stage_1_4.highScore, 60000, 'Merged stage 1-4 score should be 60000 (from Local max score)');
assert.strictEqual(merged.campaign.stages.stage_1_4.bestTime, 105, 'Merged stage 1-4 bestTime should be 105s (faster time from Cloud)');
assert.strictEqual(merged.campaign.stats.totalStars, 12, 'Merged campaign totalStars should be 12 (union total)');
assert.ok(merged.campaign.unlockedStages.indexOf('stage_2_1') !== -1, 'stage_2_1 should be unlocked');
assert.ok(merged.campaign.unlockedBoosters.indexOf('resonant_emp') !== -1, 'resonant_emp booster should be unlocked');

// Hardcore: op_01 (from local), op_02 (both), op_03 (from cloud)
assert.strictEqual(merged.hardcore.operations.op_01.cleared, true, 'op_01 should remain cleared');
assert.strictEqual(merged.hardcore.operations.op_02.cleared, true, 'op_02 should remain cleared');
assert.strictEqual(merged.hardcore.operations.op_03.cleared, true, 'op_03 should be merged from cloud');
assert.strictEqual(merged.hardcore.operations.op_02.bestTime, 100, 'op_02 bestTime should take faster 100s');
assert.deepStrictEqual(merged.hardcore.unlockedBadges.sort(), ['badge_iron', 'badge_razor', 'badge_void'].sort(), 'Hardcore badges should be union of both');

// Meta: scrap = max(500, 800) = 800, rigs = scrapper + bulwark + strider, modules = phase 3 + reactive 2
assert.strictEqual(merged.meta.scrap, 800, 'Scrap should be Math.max(500, 800) = 800');
assert.ok(merged.meta.unlockedRigs.indexOf('bulwark') !== -1 && merged.meta.unlockedRigs.indexOf('strider') !== -1, 'Rigs should be union');
assert.strictEqual(merged.meta.workshop.unlockedModules.m_phase_bearing, 3, 'm_phase_bearing should be max tier 3 (from local)');
assert.strictEqual(merged.meta.workshop.unlockedModules.b_reactive_plasma, 2, 'b_reactive_plasma should be max tier 2 (from cloud)');
assert.ok(merged.meta.achievements.first_blood && merged.meta.achievements.boss_slayer, 'Achievements should be union');

// Scores: classic bestScoreV2 = max(95000, 70000) = 95000, modScoreV2 = max(40000, 55000) = 55000
assert.strictEqual(merged.scores.bestScoreV2, 95000, 'bestScoreV2 should be 95000');
assert.strictEqual(merged.scores.modScoreV2, 55000, 'modScoreV2 should be 55000');

// Test Commutative Property: smartMergeSaves(cloud, local) == smartMergeSaves(local, cloud)
var reverseMerged = smartMergeSaves(cloudSave, localSave);
assert.strictEqual(reverseMerged.campaign.stats.totalStars, merged.campaign.stats.totalStars);
assert.strictEqual(reverseMerged.campaign.stages.stage_1_4.highScore, merged.campaign.stages.stage_1_4.highScore);
assert.strictEqual(reverseMerged.scores.bestScoreV2, merged.scores.bestScoreV2);
assert.strictEqual(reverseMerged.meta.scrap, merged.meta.scrap);
console.log('  -> Smart Merge algorithm verified with union, max & symmetry.');

// ============================================================================
// 4. 樂觀鎖衝突與重試模擬 (SAVE_REVISION_CONFLICT & REQUEST_ID_REUSED)
// ============================================================================
console.log('\n[4/4] Testing Optimistic Locking (SAVE_REVISION_CONFLICT & REQUEST_ID_REUSED)...');

// 4A. SAVE_REVISION_CONFLICT Simulation
// Scenario: Client starts at revision 1, but remote server was updated to revision 2 by another device.
var serverDb = {
  revision: 2,
  cloudData: cloudSave
};

var conflictTriggered = false;
var mockTransport = {
  save: async function (req) {
    if (req.revision !== serverDb.revision) {
      conflictTriggered = true;
      var conflictError = new Error('SAVE_REVISION_CONFLICT: server revision is ' + serverDb.revision + ' but received ' + req.revision);
      conflictError.code = 'SAVE_REVISION_CONFLICT';
      throw conflictError;
    }
    // Revision matches: update server state
    serverDb.revision += 1;
    serverDb.cloudData = JSON.parse(req.data);
    return { saved: true, revision: serverDb.revision };
  },
  load: async function () {
    return { revision: serverDb.revision, data: serverDb.cloudData };
  }
};

var conflictMergedFired = false;
var manager = new CloudSaveManager({
  transport: mockTransport,
  revision: 1, // Stale revision!
  maxRetries: 3,
  onConflictMerged: function (mergedData, newRev) {
    conflictMergedFired = true;
    assert.strictEqual(newRev, 2, 'Conflict callback should receive current server revision 2');
    assert.strictEqual(mergedData.campaign.stats.totalStars, 12, 'Merged data should incorporate remote 12★');
  }
});

var saveResult = await manager.saveProgress(localSave);
assert.strictEqual(conflictTriggered, true, 'SAVE_REVISION_CONFLICT should be triggered on stale revision');
assert.strictEqual(conflictMergedFired, true, 'Conflict merge callback should have fired');
assert.strictEqual(saveResult.ok, true, 'Save should succeed after automatic retry with merged data');
assert.strictEqual(saveResult.saved, true, 'Save result saved flag should be true');
assert.strictEqual(saveResult.attempts, 2, 'Should succeed on attempt 2 after conflict resolution');
assert.strictEqual(saveResult.revision, 3, 'Final server revision should be 3');
assert.strictEqual(serverDb.revision, 3, 'Server DB revision should now be 3');
assert.strictEqual(serverDb.cloudData.campaign.stages.stage_1_4.highScore, 60000, 'Persisted cloud data should have merged local high score');
console.log('  -> SAVE_REVISION_CONFLICT detected, merged, retried and resolved to revision ' + saveResult.revision);

// 4B. REQUEST_ID_REUSED Simulation
// Scenario: Client submits a duplicate request ID that was already consumed for another operation.
var usedRequestIds = new Set(['req-already-consumed-123']);
var reusedTransport = {
  save: async function (req) {
    if (usedRequestIds.has(req.requestId)) {
      var reusedError = new Error('REQUEST_ID_REUSED: The request ID has already been processed');
      reusedError.code = 'REQUEST_ID_REUSED';
      throw reusedError;
    }
    return { saved: true, revision: req.revision + 1 };
  },
  load: async function () {
    return { revision: 1, data: null };
  }
};

var reusedManager = new CloudSaveManager({
  transport: reusedTransport,
  revision: 1,
  maxRetries: 3
});

var reusedResult = await reusedManager.saveProgress(localSave, 'req-already-consumed-123');
assert.strictEqual(reusedResult.ok, false, 'Result ok should be false on REQUEST_ID_REUSED');
assert.strictEqual(reusedResult.error, 'REQUEST_ID_REUSED', 'Error code should be REQUEST_ID_REUSED');
assert.strictEqual(reusedResult.stopped, true, 'Retry loop must stop immediately per platform contract');
assert.strictEqual(reusedResult.attempts, 1, 'Should NOT perform runaway retries with the reused requestId');
console.log('  -> REQUEST_ID_REUSED stopped immediately without runaway retries.');

console.log('\n================================================================');
console.log('  ALL CLOUD SAVE & NAMESPACE MIGRATION TESTS PASSED (100%)');
console.log('================================================================\n');
