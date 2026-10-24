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
  writeModdedBestScore
} from './meta-store.js';
import {
  isHapticsEnabled,
  setHapticsEnabled,
  isReducedMotion,
  setMotionReduction,
  isHighContrast,
  setHighContrast,
  getVisualQuality,
  setVisualQuality
} from './settings.js';
import { AudioFX } from '../audio/audio-fx.js';
import { getLanguage, setLanguage } from './i18n.js';

export var UNIFIED_SAVE_SCHEMA_VERSION = 1;

/**
 * Creates a normalized Unified Save payload representing complete progression and preferences.
 */
export function createUnifiedSave() {
  return {
    schemaVersion: UNIFIED_SAVE_SCHEMA_VERSION,
    game: 'dust-reign',
    exportedAt: new Date().toISOString(),
    meta: readMeta(),
    campaign: getCampaignStore(),
    hardcore: getHardcoreStore(),
    scores: {
      bestScoreV2: readBestScoreV2(),
      modScoreV2: readModdedBestScore()
    },
    settings: {
      hapticsEnabled: isHapticsEnabled(),
      motionReduction: isReducedMotion(),
      highContrast: isHighContrast(),
      visualQuality: getVisualQuality()
    },
    audio: {
      muted: AudioFX.isMuted(),
      masterVolume: AudioFX.getMasterVolume()
    },
    lang: getLanguage()
  };
}

/**
 * Applies a Unified Save payload into local stores.
 */
export function applyUnifiedSave(saveData) {
  if (!saveData || typeof saveData !== 'object') return false;

  if (saveData.meta && typeof saveData.meta === 'object') {
    writeMeta(saveData.meta);
  }
  if (saveData.campaign && typeof saveData.campaign === 'object') {
    saveCampaignStore(saveData.campaign);
  }
  if (saveData.hardcore && typeof saveData.hardcore === 'object') {
    saveHardcoreStore(saveData.hardcore);
  }
  if (saveData.scores && typeof saveData.scores === 'object') {
    if (typeof saveData.scores.bestScoreV2 === 'number') {
      writeBestScoreV2(saveData.scores.bestScoreV2);
    }
    if (typeof saveData.scores.modScoreV2 === 'number') {
      writeModdedBestScore(saveData.scores.modScoreV2);
    }
  }
  if (saveData.settings && typeof saveData.settings === 'object') {
    if (typeof saveData.settings.hapticsEnabled === 'boolean') {
      setHapticsEnabled(saveData.settings.hapticsEnabled);
    }
    if (typeof saveData.settings.motionReduction === 'boolean') {
      setMotionReduction(saveData.settings.motionReduction);
    }
    if (typeof saveData.settings.highContrast === 'boolean') {
      setHighContrast(saveData.settings.highContrast);
    }
    if (typeof saveData.settings.visualQuality === 'string') {
      setVisualQuality(saveData.settings.visualQuality);
    }
  }
  if (saveData.audio && typeof saveData.audio === 'object') {
    if (typeof saveData.audio.muted === 'boolean') {
      AudioFX.setMuted(saveData.audio.muted);
    }
    if (typeof saveData.audio.masterVolume === 'number') {
      AudioFX.setMasterVolume(saveData.audio.masterVolume);
    }
  }
  if (typeof saveData.lang === 'string' && (saveData.lang === 'zh' || saveData.lang === 'en')) {
    setLanguage(saveData.lang);
  }
  return true;
}

/**
 * Calculates UTF-8 serialized byte count of a save object.
 */
export function calculateSaveSize(saveData) {
  var json = typeof saveData === 'string' ? saveData : JSON.stringify(saveData);
  if (typeof Buffer !== 'undefined' && Buffer.byteLength) {
    return Buffer.byteLength(json, 'utf8');
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(json).length;
  }
  return json.length;
}

/**
 * Calculates maximum object nesting depth of a save object.
 */
export function calculateSaveDepth(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  var maxChild = 0;
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      var d = calculateSaveDepth(obj[k]);
      if (d > maxChild) maxChild = d;
    }
  }
  return 1 + maxChild;
}

function unionStrings(a, b) {
  return Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])).filter(function (x) { return typeof x === 'string' && x; });
}

/**
 * Smart Merge algorithm for cross-device synchronization:
 * Merges two save snapshots by taking the union and maximum progression values.
 */
export function smartMergeSaves(localSave, remoteSave) {
  if (!localSave && !remoteSave) return null;
  if (!localSave) return remoteSave;
  if (!remoteSave) return localSave;

  var localExported = localSave.exportedAt || '';
  var remoteExported = remoteSave.exportedAt || '';
  var laterExported = remoteExported > localExported ? remoteExported : (localExported || new Date().toISOString());

  // 1. Scores
  var lScores = localSave.scores || {};
  var rScores = remoteSave.scores || {};
  var mergedScores = {
    bestScoreV2: Math.max(Number(lScores.bestScoreV2) || 0, Number(rScores.bestScoreV2) || 0),
    modScoreV2: Math.max(Number(lScores.modScoreV2) || 0, Number(rScores.modScoreV2) || 0)
  };

  // 2. Campaign progression
  var lCamp = localSave.campaign || {};
  var rCamp = remoteSave.campaign || {};
  var lStages = lCamp.stages || {};
  var rStages = rCamp.stages || {};
  var allStageIds = {};
  var stageId;
  for (stageId in lStages) {
    if (Object.prototype.hasOwnProperty.call(lStages, stageId)) allStageIds[stageId] = true;
  }
  for (stageId in rStages) {
    if (Object.prototype.hasOwnProperty.call(rStages, stageId)) allStageIds[stageId] = true;
  }

  var mergedStages = {};
  var totalStars = 0;
  var stagesCleared = 0;

  for (stageId in allStageIds) {
    var ls = lStages[stageId] || {};
    var rs = rStages[stageId] || {};

    var sd1 = !!((ls.starDetails && ls.starDetails.star1) || (rs.starDetails && rs.starDetails.star1));
    var sd2 = !!((ls.starDetails && ls.starDetails.star2) || (rs.starDetails && rs.starDetails.star2));
    var sd3 = !!((ls.starDetails && ls.starDetails.star3) || (rs.starDetails && rs.starDetails.star3));
    var earnedStars = (sd1 ? 1 : 0) + (sd2 ? 1 : 0) + (sd3 ? 1 : 0);
    var finalStars = Math.max(Number(ls.stars) || 0, Number(rs.stars) || 0, earnedStars);
    var finalScore = Math.max(Number(ls.highScore) || 0, Number(rs.highScore) || 0);

    var lt = Number(ls.bestTime) || 0;
    var rt = Number(rs.bestTime) || 0;
    var finalBestTime = 0;
    if (lt > 0 && rt > 0) finalBestTime = Math.min(lt, rt);
    else finalBestTime = lt > 0 ? lt : rt;

    var completedAt = (rs.completedAt > ls.completedAt ? rs.completedAt : ls.completedAt) || '';

    mergedStages[stageId] = {
      stars: finalStars,
      highScore: finalScore,
      bestTime: finalBestTime,
      completedAt: completedAt,
      starDetails: { star1: sd1, star2: sd2, star3: sd3 }
    };

    if (finalStars > 0) {
      totalStars += finalStars;
      stagesCleared += 1;
    }
  }

  var lCampStats = lCamp.stats || {};
  var rCampStats = rCamp.stats || {};
  var mergedCampaign = {
    v: 1,
    selectedStage: lCamp.selectedStage || rCamp.selectedStage || 'stage_1_1',
    unlockedStages: unionStrings(lCamp.unlockedStages, rCamp.unlockedStages),
    unlockedBoosters: unionStrings(lCamp.unlockedBoosters, rCamp.unlockedBoosters),
    stages: mergedStages,
    stats: {
      totalStars: totalStars,
      stagesCleared: stagesCleared,
      attempts: Math.max(Number(lCampStats.attempts) || 0, Number(rCampStats.attempts) || 0)
    }
  };
  if (mergedCampaign.unlockedStages.indexOf('stage_1_1') === -1) {
    mergedCampaign.unlockedStages.unshift('stage_1_1');
  }

  // 3. Hardcore operations
  var lHc = localSave.hardcore || {};
  var rHc = remoteSave.hardcore || {};
  var lOps = lHc.operations || {};
  var rOps = rHc.operations || {};
  var allOpIds = {};
  var opId;
  for (opId in lOps) {
    if (Object.prototype.hasOwnProperty.call(lOps, opId)) allOpIds[opId] = true;
  }
  for (opId in rOps) {
    if (Object.prototype.hasOwnProperty.call(rOps, opId)) allOpIds[opId] = true;
  }

  var mergedOps = {};
  for (opId in allOpIds) {
    var lo = lOps[opId] || {};
    var ro = rOps[opId] || {};

    var cleared = !!(lo.cleared || ro.cleared);
    var lot = Number(lo.bestTime) || 0;
    var rot = Number(ro.bestTime) || 0;
    var finalOpTime = 0;
    if (lot > 0 && rot > 0) finalOpTime = Math.min(lot, rot);
    else finalOpTime = lot > 0 ? lot : rot;

    var opCompletedAt = (ro.completedAt > lo.completedAt ? ro.completedAt : lo.completedAt) || '';
    var badge = lo.badge || ro.badge || '';

    mergedOps[opId] = {
      cleared: cleared,
      bestTime: finalOpTime,
      attempts: Math.max(Number(lo.attempts) || 0, Number(ro.attempts) || 0),
      completedAt: opCompletedAt,
      badge: badge
    };
  }

  var mergedHardcore = {
    v: 1,
    selectedOperation: lHc.selectedOperation || rHc.selectedOperation || 'op_01',
    operations: mergedOps,
    unlockedBadges: unionStrings(lHc.unlockedBadges, rHc.unlockedBadges)
  };

  // 4. Meta progression & workshop
  var lMeta = localSave.meta || {};
  var rMeta = remoteSave.meta || {};
  var lStats = lMeta.stats || {};
  var rStats = rMeta.stats || {};

  var mergedBossKills = {};
  var lBoss = lStats.bossKills || {};
  var rBoss = rStats.bossKills || {};
  var bossId;
  for (bossId in lBoss) {
    if (Object.prototype.hasOwnProperty.call(lBoss, bossId)) mergedBossKills[bossId] = Number(lBoss[bossId]) || 0;
  }
  for (bossId in rBoss) {
    if (Object.prototype.hasOwnProperty.call(rBoss, bossId)) {
      mergedBossKills[bossId] = Math.max(mergedBossKills[bossId] || 0, Number(rBoss[bossId]) || 0);
    }
  }

  var lWs = lMeta.workshop || {};
  var rWs = rMeta.workshop || {};
  var lMods = lWs.unlockedModules || {};
  var rMods = rWs.unlockedModules || {};
  var mergedModules = {};
  var modId;
  for (modId in lMods) {
    if (Object.prototype.hasOwnProperty.call(lMods, modId)) mergedModules[modId] = Number(lMods[modId]) || 1;
  }
  for (modId in rMods) {
    if (Object.prototype.hasOwnProperty.call(rMods, modId)) {
      mergedModules[modId] = Math.max(mergedModules[modId] || 1, Number(rMods[modId]) || 1);
    }
  }

  var lTune = lWs.tuning || {};
  var rTune = rWs.tuning || {};
  var mergedTuning = {};
  for (modId in lTune) {
    if (Object.prototype.hasOwnProperty.call(lTune, modId)) mergedTuning[modId] = Number(lTune[modId]) || 0;
  }
  for (modId in rTune) {
    if (Object.prototype.hasOwnProperty.call(rTune, modId)) {
      mergedTuning[modId] = Math.max(mergedTuning[modId] || 0, Number(rTune[modId]) || 0);
    }
  }

  var lCos = lMeta.cosmetics || {};
  var rCos = rMeta.cosmetics || {};

  var lAch = lMeta.achievements || {};
  var rAch = rMeta.achievements || {};
  var mergedAchievements = {};
  var achKey;
  for (achKey in lAch) {
    if (Object.prototype.hasOwnProperty.call(lAch, achKey)) mergedAchievements[achKey] = lAch[achKey];
  }
  for (achKey in rAch) {
    if (Object.prototype.hasOwnProperty.call(rAch, achKey)) {
      if (!mergedAchievements[achKey] || rAch[achKey] < mergedAchievements[achKey]) {
        mergedAchievements[achKey] = rAch[achKey];
      }
    }
  }

  var mergedMeta = {
    v: 1,
    selectedRig: lMeta.selectedRig || rMeta.selectedRig || 'scrapper',
    selectedWeapon: lMeta.selectedWeapon || rMeta.selectedWeapon || 'standard',
    selectedHeat: Math.max(Number(lMeta.selectedHeat) || 0, Number(rMeta.selectedHeat) || 0),
    selectedMode: lMeta.selectedMode || rMeta.selectedMode || 'standard',
    heatUnlocked: Math.max(Number(lMeta.heatUnlocked) || 0, Number(rMeta.heatUnlocked) || 0),
    unlockedRigs: unionStrings(lMeta.unlockedRigs, rMeta.unlockedRigs),
    achievements: mergedAchievements,
    scrap: Math.max(Number(lMeta.scrap) || 0, Number(rMeta.scrap) || 0),
    stats: {
      runs: Math.max(Number(lStats.runs) || 0, Number(rStats.runs) || 0),
      kills: Math.max(Number(lStats.kills) || 0, Number(rStats.kills) || 0),
      justDashes: Math.max(Number(lStats.justDashes) || 0, Number(rStats.justDashes) || 0),
      contracts: Math.max(Number(lStats.contracts) || 0, Number(rStats.contracts) || 0),
      extractions: Math.max(Number(lStats.extractions) || 0, Number(rStats.extractions) || 0),
      bestWave: Math.max(Number(lStats.bestWave) || 0, Number(rStats.bestWave) || 0),
      playTimeSec: Math.max(Number(lStats.playTimeSec) || 0, Number(rStats.playTimeSec) || 0),
      bossKills: mergedBossKills,
      fusionsSeen: unionStrings(lStats.fusionsSeen, rStats.fusionsSeen),
      seenEnemies: unionStrings(lStats.seenEnemies, rStats.seenEnemies)
    },
    workshop: {
      unlockedModules: mergedModules,
      tuning: mergedTuning,
      loadout: {
        propulsion: (lWs.loadout && lWs.loadout.propulsion) || (rWs.loadout && rWs.loadout.propulsion) || null,
        armor: (lWs.loadout && lWs.loadout.armor) || (rWs.loadout && rWs.loadout.armor) || null,
        tactical: (lWs.loadout && lWs.loadout.tactical) || (rWs.loadout && rWs.loadout.tactical) || null
      }
    },
    cosmetics: {
      selectedSkin: lCos.selectedSkin || rCos.selectedSkin || 'default',
      selectedTrail: lCos.selectedTrail || rCos.selectedTrail || 'default',
      unlockedSkins: unionStrings(lCos.unlockedSkins, rCos.unlockedSkins),
      unlockedTrails: unionStrings(lCos.unlockedTrails, rCos.unlockedTrails)
    },
    dailyContracts: (rMeta.dailyContracts && rMeta.dailyContracts.date >= ((lMeta.dailyContracts && lMeta.dailyContracts.date) || ''))
      ? rMeta.dailyContracts
      : (lMeta.dailyContracts || { date: '', bounties: [], grandSlamClaimed: false })
  };

  if (mergedMeta.unlockedRigs.indexOf('scrapper') === -1) {
    mergedMeta.unlockedRigs.unshift('scrapper');
  }

  // 5. Settings, Audio, Lang
  var newerSave = remoteExported > localExported ? remoteSave : localSave;
  var mergedSettings = {
    hapticsEnabled: newerSave.settings && typeof newerSave.settings.hapticsEnabled === 'boolean'
      ? newerSave.settings.hapticsEnabled
      : true,
    motionReduction: newerSave.settings && typeof newerSave.settings.motionReduction === 'boolean'
      ? newerSave.settings.motionReduction
      : false,
    highContrast: newerSave.settings && typeof newerSave.settings.highContrast === 'boolean'
      ? newerSave.settings.highContrast
      : false,
    visualQuality: newerSave.settings && typeof newerSave.settings.visualQuality === 'string'
      ? newerSave.settings.visualQuality
      : 'auto'
  };

  var mergedAudio = {
    muted: newerSave.audio && typeof newerSave.audio.muted === 'boolean' ? newerSave.audio.muted : false,
    masterVolume: newerSave.audio && typeof newerSave.audio.masterVolume === 'number' ? newerSave.audio.masterVolume : 80
  };

  var mergedLang = (newerSave.lang === 'en' || newerSave.lang === 'zh') ? newerSave.lang : 'zh';

  return {
    schemaVersion: UNIFIED_SAVE_SCHEMA_VERSION,
    game: 'dust-reign',
    exportedAt: laterExported,
    meta: mergedMeta,
    campaign: mergedCampaign,
    hardcore: mergedHardcore,
    scores: mergedScores,
    settings: mergedSettings,
    audio: mergedAudio,
    lang: mergedLang
  };
}

/**
 * Cloud Save Client Manager simulating optimistic locking and retry handling.
 */
export class CloudSaveManager {
  constructor(options) {
    options = options || {};
    this.transport = options.transport || null;
    this.currentRevision = options.revision || 0;
    this.gameVersion = options.gameVersion || '1.0.0';
    this.formatVersion = options.formatVersion || 1;
    this.maxRetries = options.maxRetries || 3;
    this.onConflictMerged = options.onConflictMerged || null;
  }

  generateRequestId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'req-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
  }

  async saveProgress(saveData, customRequestId) {
    if (!this.transport) {
      throw new Error('No cloud save transport configured');
    }

    var requestId = customRequestId || this.generateRequestId();
    var currentData = saveData;
    var attempts = 0;

    while (attempts < this.maxRetries) {
      attempts += 1;
      try {
        var response = await this.transport.save({
          version: this.gameVersion,
          requestId: requestId,
          data: typeof currentData === 'string' ? currentData : JSON.stringify(currentData),
          revision: this.currentRevision,
          formatVersion: this.formatVersion
        });

        if (response && response.saved === true) {
          this.currentRevision = response.revision;
          return {
            ok: true,
            saved: true,
            revision: this.currentRevision,
            attempts: attempts,
            data: currentData
          };
        }
        throw new Error((response && response.error) || 'SAVE_FAILED');
      } catch (err) {
        var errCode = err.code || (err.message && err.message.indexOf('SAVE_REVISION_CONFLICT') !== -1 ? 'SAVE_REVISION_CONFLICT' : null) ||
                      (err.message && err.message.indexOf('REQUEST_ID_REUSED') !== -1 ? 'REQUEST_ID_REUSED' : null);

        if (errCode === 'SAVE_REVISION_CONFLICT') {
          // Optimistic locking conflict: fetch latest cloud snapshot and smart merge
          var cloudSnapshot = await this.transport.load();
          var cloudData = cloudSnapshot && cloudSnapshot.data
            ? (typeof cloudSnapshot.data === 'string' ? JSON.parse(cloudSnapshot.data) : cloudSnapshot.data)
            : null;

          this.currentRevision = cloudSnapshot ? cloudSnapshot.revision : (this.currentRevision + 1);
          currentData = smartMergeSaves(currentData, cloudData);

          if (typeof this.onConflictMerged === 'function') {
            this.onConflictMerged(currentData, this.currentRevision);
          }

          // A new revision requires a fresh request ID for retry
          requestId = this.generateRequestId();
          continue;
        }

        if (errCode === 'REQUEST_ID_REUSED') {
          // Stop immediately as specified by the platform contract:
          // REQUEST_ID_REUSED indicates the request ID was used for a different operation and must not be retried.
          return {
            ok: false,
            error: 'REQUEST_ID_REUSED',
            stopped: true,
            attempts: attempts
          };
        }

        throw err;
      }
    }

    return {
      ok: false,
      error: 'MAX_RETRIES_EXCEEDED',
      attempts: attempts
    };
  }
}
