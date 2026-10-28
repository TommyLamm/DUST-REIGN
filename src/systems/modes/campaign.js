import { rt } from '../../core/runtime.js';
import { clamp } from '../../core/utils.js';

/**
 * Big-World Campaign Mode System Adapter
 * - Converts static beacon defense into Mobile Mining Convoy Escort (移動採集車護航)
 * - Converts VIP hunt into Canyon Fleeing Elite Interception (沿峽谷撤離的逃亡精英)
 */

export function initCampaignStage(state, stageConfig) {
  if (!state || !stageConfig) return;
  // Prefer world/map size over viewport so convoy / VIP / overload anchors sit on the big map.
  var boundW = state.width || (rt.ui && rt.ui.width) || 3520;
  var boundH = state.height || (rt.ui && rt.ui.height) || 2640;
  var type = stageConfig.type || stageConfig.goalType || '';

  if (type === 'beacon_defense' || type === 'payload_escort') {
    var startX = 120;
    var startY = boundH * 0.5;
    var destX = boundW - 120;
    var destY = boundH * 0.5;
    var maxHp = stageConfig.beaconMaxHp || (type === 'payload_escort' ? 1200 : 1000);
    var capRadius = type === 'payload_escort' ? 160 : 150;
    state.convoyVehicle = {
      kind: 'convoyVehicle',
      x: startX,
      y: startY,
      startX: startX,
      startY: startY,
      r: 28,
      hp: maxHp,
      maxHp: maxHp,
      speed: type === 'payload_escort' ? 70 : 65,
      destX: destX,
      destY: destY,
      powerTimer: 5.0,
      captureRadius: capRadius,
      arrived: false
    };
    state.payloadVehicle = state.convoyVehicle;
    state.beacon = state.convoyVehicle;
    state.beaconHp = maxHp;
    state.beaconMaxHp = maxHp;
    state.beaconPlayerStayTime = 0;
    state.payloadProgress = 0;
  }

  if (type === 'core_overload') {
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
      targetTime: stageConfig.targetTime || 80,
      playerCooling: false,
      exploded: false,
      secured: false
    };
    state.overloadPeakRatio = 0;
  }

  if (type === 'vip_hunt') {
    if (!state.vipList || state.vipList.length === 0) {
      state.vipList = [];
      var vipCount = stageConfig.targetQuota || 2;
      var vw = boundW;
      var vh = boundH;
      var kind = stageConfig.id === 'stage_1_3' ? 'brute' :
                 stageConfig.id === 'stage_2_2' ? 'elite' :
                 stageConfig.id === 'stage_3_3' ? 'burrower' :
                 stageConfig.id === 'stage_4_4' ? 'brute' : (stageConfig.vipKind || 'brute');
      var baseHp = stageConfig.id === 'stage_4_4' ? 480 : (kind === 'burrower' ? 280 : 380);
      for (var vi = 0; vi < vipCount; vi += 1) {
        var angle = (vi / vipCount) * Math.PI * 2 + Math.PI / 4;
        var dist = 220;
        var vipEnemy = {
          kind: kind,
          x: vw / 2 + Math.cos(angle) * dist,
          y: vh / 2 + Math.sin(angle) * dist,
          r: kind === 'burrower' ? 20 : 22,
          hp: baseHp,
          maxHp: baseHp,
          speed: 120,
          damage: 24,
          score: 300,
          isVip: true,
          color: '#f43f5e',
          touchCooldown: 0,
          shootCooldown: 1.0 + vi * 0.5
        };
        if (kind === 'elite') {
          vipEnemy.affix = 'command';
        }
        if (!state.enemies) state.enemies = [];
        state.enemies.push(vipEnemy);
        state.vipList.push(vipEnemy);
      }
    }
  }
}

export function stepCampaignMode(dt, frame) {
  var state = rt.state;
  if (!state || state.mode !== 'campaign' || state.over || state.stageCleared) return;
  var config = state.stageConfig;
  if (!config) return;
  var type = config.type || config.goalType || '';
  var p = frame.p;
  if (!p) return;

  // 1. Mobile Mining Convoy Escort & Payload Escort (移動採集車 / 物資推車護航)
  if (type === 'beacon_defense' || type === 'payload_escort') {
    if (!state.convoyVehicle) {
      initCampaignStage(state, config);
    }
    var v = state.convoyVehicle;
    if (v && v.hp > 0) {
      var pDist = Math.hypot(p.x - v.x, p.y - v.y);
      var inPowerField = pDist <= (v.captureRadius || (type === 'payload_escort' ? 160 : 150));

      if (inPowerField) {
        v.powerTimer = 5.0;
        p.convoyShield = true; // 15% damage reduction inside convoy power field
        state.beaconPlayerStayTime = (state.beaconPlayerStayTime || 0) + dt;
      } else {
        v.powerTimer = Math.max(0, v.powerTimer - dt);
        p.convoyShield = false;
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

      // Sync state.beacon for backwards compatibility
      state.beacon = v;
      state.beaconHp = v.hp;
      state.beaconMaxHp = v.maxHp;

      var totalDist = Math.hypot((v.destX || 860) - (v.startX || 120), (v.destY || 320) - (v.startY || 320)) || 1;
      var remDist = Math.hypot((v.destX || 860) - v.x, (v.destY || 320) - v.y);
      state.payloadProgress = v.arrived ? 1 : Math.max(0, Math.min(1, 1 - (remDist / totalDist)));
    }
  }

  // 2. Core Overload Defense (地脈核心超載防線)
  if (type === 'core_overload') {
    if (!state.coreOverload) {
      initCampaignStage(state, config);
    }
    var core = state.coreOverload;
    if (core && !core.exploded && !core.secured) {
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
  }

  // 2. Canyon Fleeing Elite (沿峽谷撤離的逃亡精英)
  if (type === 'vip_hunt' && state.vipList && state.vipList.length > 0) {
    var boundW = frame.boundW || state.width || 3520;
    var boundH = frame.boundH || state.height || 2640;
    for (var vi = 0; vi < state.vipList.length; vi += 1) {
      var vip = state.vipList[vi];
      if (!vip || vip.hp <= 0) continue;
      // When VIP HP drops below 60%, trigger turbo thrusters to flee toward escape rift
      if (vip.hp < (vip.maxHp || 100) * 0.6) {
        vip.fleeing = true;
        vip.speed = 160;
        var fleeAngle = Math.atan2(vip.y - p.y, vip.x - p.x);
        vip.vx = Math.cos(fleeAngle) * vip.speed;
        vip.vy = Math.sin(fleeAngle) * vip.speed;
        vip.x = clamp(vip.x + vip.vx * dt, vip.r, boundW - vip.r);
        vip.y = clamp(vip.y + vip.vy * dt, vip.r, boundH - vip.r);
      }
    }
  }
}
