import { rt } from '../../core/runtime.js';
import { getCampaignStore, getHardcoreStore } from '../../core/meta-store.js';
import { getCampaignStage } from '../../data/campaign-stages.js';
import { HARDCORE_OPERATIONS, getHardcoreOperation } from '../../data/hardcore-operations.js';
import { applyRig } from '../../data/rigs.js';
import { evaluateStageStars } from '../director.js';
import { triggerGameOver } from '../flow.js';
import { initCampaignStage, stepCampaignMode } from './campaign.js';
import { initHardcoreOperation, stepHardcoreMode } from './hardcore.js';

/**
 * GameModeAdapter Lifecycle Contract:
 * - onEnter(state, config): Invoked on mode startup / run begin to inject rules and initialize entities
 * - step(dt, frame): Invoked each frame within the simulation loop
 * - checkVictory(state, dt): Checks win/loss criteria and triggers transition
 * - onBossDefeated(state, enemy): Mode-specific handler when a boss entity is neutralized
 * - onExit(state): Invoked on run teardown or return to menu
 */

export var StandardModeAdapter = {
  id: 'standard',
  onEnter: function (state, config) {
    if (!state) return;
    state.mode = 'standard';
    state.stageConfig = null;
  },
  step: function (dt, frame) {},
  checkVictory: function (state, dt) {
    return null;
  },
  onBossDefeated: function (state, enemy) {},
  onExit: function (state) {}
};

export var DailyModeAdapter = {
  id: 'daily',
  onEnter: function (state, config) {
    if (!state) return;
    state.mode = 'daily';
    state.stageConfig = null;
  },
  step: function (dt, frame) {},
  checkVictory: function (state, dt) {
    return null;
  },
  onBossDefeated: function (state, enemy) {},
  onExit: function (state) {}
};

export var CampaignModeAdapter = {
  id: 'campaign',
  onEnter: function (state, stageConfig) {
    if (!state) return;
    state.mode = 'campaign';
    if (!stageConfig) stageConfig = state.stageConfig;
    if (!stageConfig) {
      var campStore = getCampaignStore();
      var selId = (campStore && campStore.selectedStage) || 'stage_1_1';
      stageConfig = getCampaignStage(selId);
    }
    state.stageConfig = stageConfig;
    if (!stageConfig) return;

    var lockedRig = stageConfig.lockedRig || stageConfig.fixedRig;
    if (lockedRig && state.player) {
      applyRig(state.player, lockedRig);
      state.rigId = lockedRig;
      state.player.rig = lockedRig;
    }
    var lockedWeapon = stageConfig.lockedWeapon || stageConfig.fixedWeapon;
    if (lockedWeapon && state.player) {
      state.weaponId = lockedWeapon;
      state.player.weapon = lockedWeapon;
      state.player.weaponMode = lockedWeapon;
    }
    if (stageConfig.maxHpCap && state.player) {
      state.player.maxHp = Math.min(state.player.maxHp, stageConfig.maxHpCap);
      state.player.hp = state.player.maxHp;
    }
    state.stageElapsed = 0;
    state.stageCleared = false;
    state.stageVictory = false;
    state.stageStars = { star1: false, star2: false, star3: false };
    state.scrapCollectedInStage = 0;
    state.damageTakenInStage = 0;

    initCampaignStage(state, stageConfig);
  },

  step: function (dt, frame) {
    var state = rt.state;
    if (!state || state.mode !== 'campaign' || state.over || state.stageCleared) return;
    stepCampaignMode(dt, frame);
    this.checkVictory(state, dt);
  },

  checkVictory: function (state, dt) {
    if (!state) state = rt.state;
    if (!state || state.over || state.stageCleared) return null;
    if (state.mode !== 'campaign') return null;

    var config = state.stageConfig;
    if (!config) return null;

    if (typeof dt === 'number' && dt > 0) {
      state.stageElapsed = (state.stageElapsed || 0) + dt;
    }

    var type = config.type || config.goalType || '';

    // 1. Beacon defense / Mobile convoy damage & stay time
    if (type === 'beacon_defense') {
      if (state.beacon) {
        if (typeof dt === 'number' && dt > 0 && state.enemies) {
          var b = state.beacon;
          for (var ei = 0; ei < state.enemies.length; ei += 1) {
            var foe = state.enemies[ei];
            if (!foe || foe.hp <= 0) continue;
            var fDist = Math.hypot(foe.x - b.x, foe.y - b.y);
            if (fDist <= (b.r + (foe.r || 10) + 10)) {
              state.beaconHp = Math.max(0, state.beaconHp - (foe.damage || 15) * dt * 0.8);
              b.hp = state.beaconHp;
            }
          }
        }
        if (state.player && typeof dt === 'number' && dt > 0) {
          var pDist = Math.hypot(state.player.x - state.beacon.x, state.player.y - state.beacon.y);
          if (pDist <= (state.beacon.captureRadius || 120)) {
            state.beaconPlayerStayTime = (state.beaconPlayerStayTime || 0) + dt;
            state.stageElapsed += dt * 0.5;
          }
        }
      }
      if (state.beaconHp <= 0) {
        triggerGameOver({ victory: false });
        return { victory: false, failed: true };
      }
    }

    // 2. Scrap rush timeout check
    if (type === 'scrap_rush') {
      var quota = config.targetQuota || 100;
      var tLimit = config.targetTime || 75;
      if (state.stageElapsed > tLimit && (state.scrapCollectedInStage || 0) < quota) {
        triggerGameOver({ victory: false });
        return { victory: false, failed: true };
      }
    }

    var won = false;
    if (type === 'wave_wipeout') {
      var targetWaves = config.targetWaves || 3;
      var livingEnemies = state.enemies ? state.enemies.length : 0;
      if (state.wave >= targetWaves && state.stageElapsed > 3 && livingEnemies === 0) {
        won = true;
      }
    } else if (type === 'vip_hunt') {
      if (state.vipList && state.vipList.length > 0) {
        if (state.vipList.every(function (vip) {
          return !vip || vip.hp <= 0 || !state.enemies || state.enemies.indexOf(vip) === -1;
        })) {
          won = true;
        }
      }
    } else if (type === 'beacon_defense') {
      var defTime = config.targetTime || 90;
      if (state.stageElapsed >= defTime && state.beaconHp > 0) {
        won = true;
      }
    } else if (type === 'scrap_rush') {
      var reqQuota = config.targetQuota || 100;
      var maxTime = config.targetTime || 75;
      if ((state.scrapCollectedInStage || 0) >= reqQuota && state.stageElapsed <= maxTime) {
        won = true;
      }
    } else if (type === 'boss_duel') {
      var bKind = config.boss || (config.bossOverride && config.bossOverride.kind);
      if (bKind) {
        if (state.bossesDefeated && state.bossesDefeated.indexOf(bKind) !== -1) {
          won = true;
        }
      } else if (state.bossesDefeated && state.bossesDefeated.length > 0) {
        won = true;
      }
    }

    if (won) {
      state.stageCleared = true;
      state.stageVictory = true;
      var stars = evaluateStageStars(state, config);
      state.stageStars = stars;
      var stageId = config.id || '';
      triggerGameOver({ victory: true, stars: stars, stageId: stageId });
      return { victory: true, stars: stars, stageId: stageId };
    }

    return null;
  },

  onBossDefeated: function (state, enemy) {
    if (!state) state = rt.state;
    this.checkVictory(state, 0);
  },

  onExit: function (state) {}
};

export var HardcoreModeAdapter = {
  id: 'hardcore',
  onEnter: function (state, operationConfig) {
    if (!state) return;
    state.mode = 'hardcore';
    if (!operationConfig) operationConfig = state.stageConfig;
    if (!operationConfig) {
      var store = getHardcoreStore();
      var id = (store && store.selectedOperation) || 'op_01';
      operationConfig = getHardcoreOperation(id) || HARDCORE_OPERATIONS[0];
    }
    state.stageConfig = operationConfig;
    if (!operationConfig) return;

    var lockedRig = operationConfig.lockedRig || operationConfig.fixedRig;
    if (lockedRig && state.player) {
      applyRig(state.player, lockedRig);
      state.rigId = lockedRig;
      state.player.rig = lockedRig;
    }
    var lockedWeapon = operationConfig.lockedWeapon || operationConfig.fixedWeapon;
    if (lockedWeapon && state.player) {
      state.weaponId = lockedWeapon;
      state.player.weapon = lockedWeapon;
      state.player.weaponMode = lockedWeapon;
    }
    if (operationConfig.maxHpCap && state.player) {
      state.player.maxHp = Math.min(state.player.maxHp, operationConfig.maxHpCap);
      state.player.hp = state.player.maxHp;
    }
    state.stageElapsed = 0;
    state.stageCleared = false;
    state.stageVictory = false;
    state.scrapCollectedInStage = 0;
    state.damageTakenInStage = 0;

    initHardcoreOperation(state, operationConfig);
  },

  step: function (dt, frame) {
    var state = rt.state;
    if (!state || state.mode !== 'hardcore' || state.over || state.stageCleared) return;
    stepHardcoreMode(dt, frame);
    this.checkVictory(state, dt);
  },

  checkVictory: function (state, dt) {
    if (!state) state = rt.state;
    if (!state || state.over || state.stageCleared) return null;
    if (state.mode !== 'hardcore') return null;

    var config = state.stageConfig;
    if (!config) return null;

    if (typeof dt === 'number' && dt > 0) {
      state.stageElapsed = (state.stageElapsed || 0) + dt;
    }

    var bKind = config.boss || (config.bossOverride && config.bossOverride.kind);
    var won = false;
    if (bKind) {
      if (state.bossesDefeated && state.bossesDefeated.indexOf(bKind) !== -1) {
        won = true;
      }
    } else if (state.bossesDefeated && state.bossesDefeated.length > 0) {
      won = true;
    }

    if (won) {
      state.stageCleared = true;
      state.stageVictory = true;
      var stageId = config.id || '';
      triggerGameOver({ victory: true, stageId: stageId });
      return { victory: true, stageId: stageId };
    }

    return null;
  },

  onBossDefeated: function (state, enemy) {
    if (!state) state = rt.state;
    this.checkVictory(state, 0);
  },

  onExit: function (state) {}
};

var ADAPTERS = {
  standard: StandardModeAdapter,
  daily: DailyModeAdapter,
  campaign: CampaignModeAdapter,
  hardcore: HardcoreModeAdapter
};

export function registerModeAdapter(mode, adapter) {
  if (mode && adapter) {
    ADAPTERS[mode] = adapter;
  }
}

export function getModeAdapter(mode) {
  return ADAPTERS[mode] || ADAPTERS.standard;
}

export function initMode(state, mode, config) {
  if (!state) state = rt.state;
  if (!state) return;
  var targetMode = mode || state.mode || 'standard';
  state.mode = targetMode;
  var adapter = getModeAdapter(targetMode);
  if (adapter && typeof adapter.onEnter === 'function') {
    adapter.onEnter(state, config);
  }
}

export function stepMode(dt, frame) {
  var state = rt.state;
  if (!state || state.over || state.paused) return;
  var adapter = getModeAdapter(state.mode);
  if (adapter && typeof adapter.step === 'function') {
    adapter.step(dt, frame);
  }
}

export function checkStageVictory(state, dt) {
  if (!state) state = rt.state;
  if (!state || state.over || state.stageCleared) return null;
  var adapter = getModeAdapter(state.mode);
  if (adapter && typeof adapter.checkVictory === 'function') {
    return adapter.checkVictory(state, dt);
  }
  return null;
}

export function onModeBossDefeated(state, enemy) {
  if (!state) state = rt.state;
  if (!state) return;
  var adapter = getModeAdapter(state.mode);
  if (adapter && typeof adapter.onBossDefeated === 'function') {
    adapter.onBossDefeated(state, enemy);
  }
}

export function exitMode(state) {
  if (!state) state = rt.state;
  if (!state) return;
  var adapter = getModeAdapter(state.mode);
  if (adapter && typeof adapter.onExit === 'function') {
    adapter.onExit(state);
  }
}
