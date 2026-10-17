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

export var PayloadEscortSubsystem = {
  id: 'payload_escort',
  init: function (state, config) {
    this.onEnter(state, config);
  },
  onEnter: function (state, stageConfig) {
    if (!state) state = rt.state;
    if (!state) return;
    if (!stageConfig) stageConfig = state.stageConfig || {};
    var boundW = (rt.ui && rt.ui.width) || state.width || 960;
    var boundH = (rt.ui && rt.ui.height) || state.height || 640;
    var startX = 120;
    var startY = boundH * 0.5;
    var destX = boundW - 120;
    var destY = boundH * 0.5;
    var maxHp = stageConfig.beaconMaxHp || 1200;
    var vehicle = {
      kind: 'convoyVehicle',
      x: startX,
      y: startY,
      startX: startX,
      startY: startY,
      r: 28,
      hp: maxHp,
      maxHp: maxHp,
      speed: 70,
      destX: destX,
      destY: destY,
      powerTimer: 5.0,
      captureRadius: 160,
      arrived: false
    };
    state.convoyVehicle = vehicle;
    state.payloadVehicle = vehicle;
    state.beacon = vehicle;
    state.beaconHp = maxHp;
    state.beaconMaxHp = maxHp;
    state.beaconPlayerStayTime = 0;
    state.payloadProgress = 0;
  },
  step: function (dt, frame) {
    var state = rt.state;
    if (!state || state.over || state.stageCleared) return;
    var v = state.payloadVehicle || state.convoyVehicle;
    if (!v) {
      this.onEnter(state, state.stageConfig);
      v = state.payloadVehicle || state.convoyVehicle;
    }
    if (!v || v.hp <= 0) return;

    var p = (frame && frame.p) || state.player;
    if (p) {
      var pDist = Math.hypot(p.x - v.x, p.y - v.y);
      var inPowerField = pDist <= (v.captureRadius || 160);

      if (inPowerField) {
        v.powerTimer = 5.0;
        p.convoyShield = true; // 15% damage reduction inside convoy power field
        state.beaconPlayerStayTime = (state.beaconPlayerStayTime || 0) + dt;
      } else {
        v.powerTimer = Math.max(0, v.powerTimer - dt);
        p.convoyShield = false;
      }
    }

    // If powered, vehicle moves toward extraction destination
    if (v.powerTimer > 0 && !v.arrived) {
      var cdx = v.destX - v.x;
      var cdy = v.destY - v.y;
      var cd = Math.hypot(cdx, cdy) || 1;
      if (cd > 12) {
        v.x += (cdx / cd) * v.speed * dt;
        v.y += (cdy / cd) * v.speed * dt;
      } else {
        v.arrived = true;
      }
    }

    // Enemy proximity damage to vehicle
    if (typeof dt === 'number' && dt > 0 && state.enemies) {
      for (var ei = 0; ei < state.enemies.length; ei += 1) {
        var foe = state.enemies[ei];
        if (!foe || foe.hp <= 0) continue;
        var fDist = Math.hypot(foe.x - v.x, foe.y - v.y);
        if (fDist <= (v.r + (foe.r || 10) + 12)) {
          v.hp = Math.max(0, v.hp - (foe.damage || 15) * dt * 0.8);
          state.beaconHp = v.hp;
        }
      }
    }

    // Sync state.beacon for backwards compatibility
    state.beacon = v;
    state.beaconHp = v.hp;
    state.beaconMaxHp = v.maxHp;

    this.getProgress(state);
  },
  checkVictory: function (state, dt) {
    if (!state) state = rt.state;
    if (!state || state.over || state.stageCleared) return null;
    var v = state.payloadVehicle || state.convoyVehicle || state.beacon;
    if (!v) return null;

    if (v.hp <= 0 || (state.beaconHp != null && state.beaconHp <= 0)) {
      triggerGameOver({ victory: false });
      return { victory: false, failed: true };
    }

    if (v.arrived) {
      state.stageCleared = true;
      state.stageVictory = true;
      var config = state.stageConfig || {};
      var stars = evaluateStageStars(state, config);
      state.stageStars = stars;
      var stageId = config.id || '';
      triggerGameOver({ victory: true, stars: stars, stageId: stageId });
      return { victory: true, stars: stars, stageId: stageId };
    }

    return null;
  },
  getProgress: function (state) {
    if (!state) state = rt.state;
    var v = (state && (state.payloadVehicle || state.convoyVehicle || state.beacon));
    if (!v) return 0;
    if (v.arrived) {
      if (state) state.payloadProgress = 1;
      return 1;
    }
    var startX = v.startX != null ? v.startX : 120;
    var startY = v.startY != null ? v.startY : 320;
    var destX = v.destX != null ? v.destX : 840;
    var destY = v.destY != null ? v.destY : 320;
    var totalDist = Math.hypot(destX - startX, destY - startY) || 1;
    var remDist = Math.hypot(destX - v.x, destY - v.y);
    var p = Math.max(0, Math.min(1, 1 - (remDist / totalDist)));
    if (state) state.payloadProgress = p;
    return p;
  },
  onBossDefeated: function (state, enemy) {
    this.checkVictory(state, 0);
  },
  onExit: function (state) {}
};

export var CoreOverloadSubsystem = {
  id: 'core_overload',
  init: function (state, config) {
    this.onEnter(state, config);
  },
  onEnter: function (state, stageConfig) {
    if (!state) state = rt.state;
    if (!state) return;
    if (!stageConfig) stageConfig = state.stageConfig || {};
    var boundW = (rt.ui && rt.ui.width) || state.width || 960;
    var boundH = (rt.ui && rt.ui.height) || state.height || 640;
    var targetTime = stageConfig.targetTime || 80;
    state.coreOverload = {
      heat: 0,
      maxHeat: 100,
      ratio: 0,
      peakRatio: 0,
      coreX: boundW * 0.5,
      coreY: boundH * 0.5,
      radius: 130,
      heatPerSec: 6.0,
      coolingPerSec: 14.0,
      targetTime: targetTime,
      playerCooling: false,
      exploded: false,
      secured: false
    };
    state.overloadPeakRatio = 0;
  },
  step: function (dt, frame) {
    var state = rt.state;
    if (!state || state.over || state.stageCleared) return;
    var core = state.coreOverload;
    if (!core) {
      this.onEnter(state, state.stageConfig);
      core = state.coreOverload;
    }
    if (!core || core.exploded || core.secured) return;

    var p = (frame && frame.p) || state.player;
    if (p) {
      var cpDist = Math.hypot(p.x - core.coreX, p.y - core.coreY);
      var inCooling = cpDist <= (core.radius || 130);
      core.playerCooling = inCooling;

      var heatDelta = (core.heatPerSec || 6.0) * dt;
      if (state.enemies && state.enemies.length > 0) {
        var nearbyCount = 0;
        for (var ei = 0; ei < state.enemies.length; ei += 1) {
          var foe = state.enemies[ei];
          if (foe && foe.hp > 0) {
            var fd = Math.hypot(foe.x - core.coreX, foe.y - core.coreY);
            if (fd < 300) nearbyCount += 1;
          }
        }
        heatDelta += nearbyCount * 0.8 * dt;
      }

      if (inCooling) {
        heatDelta -= (core.coolingPerSec || 14.0) * dt;
      }

      core.heat = Math.max(0, core.heat + heatDelta);
      core.ratio = Math.min(1.0, core.heat / core.maxHeat);
      if (core.ratio > core.peakRatio) {
        core.peakRatio = core.ratio;
      }
      state.overloadPeakRatio = core.peakRatio;
    }
  },
  checkVictory: function (state, dt) {
    if (!state) state = rt.state;
    if (!state || state.over || state.stageCleared) return null;
    var core = state.coreOverload;
    if (!core) return null;

    var config = state.stageConfig || {};
    var targetTime = core.targetTime || config.targetTime || 80;

    // Overload 100% failure condition
    if (core.heat >= core.maxHeat || core.ratio >= 1.0) {
      core.exploded = true;
      triggerGameOver({ victory: false });
      return { victory: false, failed: true };
    }

    // Target time held without exploding victory condition
    if ((state.stageElapsed || 0) >= targetTime && !core.exploded) {
      core.secured = true;
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
  getProgress: function (state) {
    if (!state) state = rt.state;
    var core = state && state.coreOverload;
    var targetTime = (core && core.targetTime) || (state && state.stageConfig && state.stageConfig.targetTime) || 80;
    var elapsed = (state && state.stageElapsed) || 0;
    return Math.max(0, Math.min(1, elapsed / targetTime));
  },
  getOverloadRatio: function (state) {
    if (!state) state = rt.state;
    var core = state && state.coreOverload;
    return core ? (core.ratio || 0) : 0;
  },
  getPeakRatio: function (state) {
    if (!state) state = rt.state;
    var core = state && state.coreOverload;
    return core ? (core.peakRatio || 0) : 0;
  },
  onBossDefeated: function (state, enemy) {
    this.checkVictory(state, 0);
  },
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

    if (stageConfig.type === 'payload_escort') {
      PayloadEscortSubsystem.onEnter(state, stageConfig);
    } else if (stageConfig.type === 'core_overload') {
      CoreOverloadSubsystem.onEnter(state, stageConfig);
    } else {
      initCampaignStage(state, stageConfig);
    }
  },

  step: function (dt, frame) {
    var state = rt.state;
    if (!state || state.mode !== 'campaign' || state.over || state.stageCleared) return;
    var config = state.stageConfig;
    var type = config ? (config.type || config.goalType || '') : '';
    if (type === 'payload_escort') {
      PayloadEscortSubsystem.step(dt, frame);
    } else if (type === 'core_overload') {
      CoreOverloadSubsystem.step(dt, frame);
    } else {
      stepCampaignMode(dt, frame);
    }
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

    // 0. Delegate new mode subsystems
    if (type === 'payload_escort') {
      return PayloadEscortSubsystem.checkVictory(state, dt);
    }
    if (type === 'core_overload') {
      return CoreOverloadSubsystem.checkVictory(state, dt);
    }

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
  hardcore: HardcoreModeAdapter,
  payload_escort: PayloadEscortSubsystem,
  core_overload: CoreOverloadSubsystem
};

var SUBSYSTEMS = {
  payload_escort: PayloadEscortSubsystem,
  core_overload: CoreOverloadSubsystem
};

export function registerSubsystem(id, subsystem) {
  if (id && subsystem) {
    SUBSYSTEMS[id] = subsystem;
    ADAPTERS[id] = subsystem;
  }
}

export function getSubsystem(id) {
  return SUBSYSTEMS[id] || null;
}

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
