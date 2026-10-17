import { rt } from '../../core/runtime.js';
import { clamp } from '../../core/utils.js';

/**
 * Big-World Campaign Mode System Adapter
 * - Converts static beacon defense into Mobile Mining Convoy Escort (移動採集車護航)
 * - Converts VIP hunt into Canyon Fleeing Elite Interception (沿峽谷撤離的逃亡精英)
 */

export function initCampaignStage(state, stageConfig) {
  if (!state || !stageConfig) return;
  var boundW = (rt.ui && rt.ui.width) || state.width || 960;
  var boundH = (rt.ui && rt.ui.height) || state.height || 640;
  var type = stageConfig.type || stageConfig.goalType || '';

  if (type === 'beacon_defense') {
    var startX = 100;
    var startY = boundH * 0.5;
    var destX = boundW - 100;
    var destY = boundH * 0.5;
    var maxHp = stageConfig.beaconMaxHp || 1000;
    state.convoyVehicle = {
      kind: 'convoyVehicle',
      x: startX,
      y: startY,
      r: 26,
      hp: maxHp,
      maxHp: maxHp,
      speed: 65,
      destX: destX,
      destY: destY,
      powerTimer: 5.0,
      captureRadius: 150,
      arrived: false
    };
    state.beacon = state.convoyVehicle;
    state.beaconHp = maxHp;
    state.beaconMaxHp = maxHp;
    state.beaconPlayerStayTime = 0;
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

  // 1. Mobile Mining Convoy Escort (移動採集車護航)
  if (type === 'beacon_defense') {
    if (!state.convoyVehicle) {
      initCampaignStage(state, config);
    }
    var v = state.convoyVehicle;
    if (v && v.hp > 0) {
      var pDist = Math.hypot(p.x - v.x, p.y - v.y);
      var inPowerField = pDist <= (v.captureRadius || 150);

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
    }
  }

  // 2. Canyon Fleeing Elite (沿峽谷撤離的逃亡精英)
  if (type === 'vip_hunt' && state.vipList && state.vipList.length > 0) {
    var boundW = frame.boundW || 960;
    var boundH = frame.boundH || 640;
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
