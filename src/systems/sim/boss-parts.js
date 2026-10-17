import { AudioFX } from '../../audio/audio-fx.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../../core/settings.js';
import { damageEnemy } from '../combat.js';
import { onShieldBreak } from '../card-effects.js';
import { noteMetaEvent } from '../meta.js';
import { addScore } from '../scoring.js';
import { logEvent } from '../../ui/hud.js';
import { spawnCombatText } from '../../render/fx.js';

export function notePartDestroyed() {
  addScore(200, 'style');
  if (!rt.state || !rt.state.stats) return;
  rt.state.stats.partsDestroyed = (rt.state.stats.partsDestroyed || 0) + 1;
  noteMetaEvent('parts', { count: rt.state.stats.partsDestroyed });
}

/**
 * Updates single-frame cached transform and part world coordinates for multi-part enemies.
 * Shared across all bullets in the frame to eliminate redundant trigonometric operations.
 */
export function updateEnemyPartCache(enemy, player) {
  if (!enemy) return null;
  var px = player ? player.x : enemy.x;
  var py = player ? player.y : enemy.y;
  var aim = enemy.aim !== undefined ? enemy.aim : Math.atan2(py - enemy.y, px - enemy.x);
  var cosA = Math.cos(aim);
  var sinA = Math.sin(aim);

  if (!enemy.partCache) {
    enemy.partCache = {
      aim: 0,
      cosA: 1,
      sinA: 0,
      lcX: 0, lcY: 0,
      rpX: 0, rpY: 0,
      radX: 0, radY: 0,
      trdX: 0, trdY: 0,
      _frameTime: -1
    };
  }

  var c = enemy.partCache;
  c.aim = aim;
  c.cosA = cosA;
  c.sinA = sinA;

  // Legacy part coordinate caching for Titan compatibility
  c.lcX = enemy.x + 22 * sinA;
  c.lcY = enemy.y - 22 * cosA;
  c.rpX = enemy.x - 22 * sinA;
  c.rpY = enemy.y + 22 * cosA;
  c.radX = enemy.x - 32 * cosA;
  c.radY = enemy.y - 32 * sinA;
  c.trdX = enemy.x - 18 * cosA;
  c.trdY = enemy.y - 18 * sinA;

  return c;
}

export function getPartWorldPos(enemy, part, cache) {
  var relX = part.relX || 0;
  var relY = part.relY || 0;
  return {
    x: enemy.x + (relX * cache.cosA - relY * cache.sinA),
    y: enemy.y + (relX * cache.sinA + relY * cache.cosA)
  };
}

function syncLegacyPartHp(enemy, part) {
  if (part.id === 'left_cannon') enemy.leftCannonHp = part.hp;
  else if (part.id === 'right_pod') enemy.rightPodHp = part.hp;
  else if (part.id === 'radiator') enemy.radiatorHp = part.hp;
  else if (part.id === 'treads') enemy.treadHp = part.hp;
}

function syncLegacyPartDestroyed(enemy, part) {
  if (part.id === 'left_cannon') {
    enemy.leftCannonHp = 0;
    enemy.leftCannonDestroyed = true;
  } else if (part.id === 'right_pod') {
    enemy.rightPodHp = 0;
    enemy.rightPodDestroyed = true;
  } else if (part.id === 'radiator') {
    enemy.radiatorHp = 0;
    enemy.radiatorDestroyed = true;
    enemy.radiatorExposed = false;
  } else if (part.id === 'treads') {
    enemy.treadHp = 0;
    enemy.treadDestroyed = true;
  }
}

function defaultDestroyMsg(part) {
  if (part.id === 'left_cannon') return 'TITAN COMPONENT DESTROYED // LEFT CANNON OFFLINE';
  if (part.id === 'right_pod') return 'TITAN COMPONENT DESTROYED // REINFORCEMENTS DISABLED';
  if (part.id === 'radiator') return 'TITAN COMPONENT DESTROYED // HEAT-SINK FINS OVERLOAD [STUN 4s]';
  if (part.id === 'treads') return 'TITAN COMPONENT DESTROYED // TREAD SKIRTS DAMAGED [-40% SPEED]';
  return 'BOSS COMPONENT DESTROYED // ' + (part.name || part.id).toUpperCase();
}

function defaultStatusMsg(part) {
  if (part.id === 'left_cannon') return 'TITAN LEFT CANNON DESTROYED // TWIN CANNON OFFLINE [STUN 1.8s]';
  if (part.id === 'right_pod') return 'TITAN RIGHT POD DESTROYED // MINIONS OFFLINE [STUN 1.8s]';
  if (part.id === 'radiator') return 'TITAN FINS DESTROYED // OVERLOAD CRITICAL [STUN 4.0s]';
  if (part.id === 'treads') return 'TITAN TREADS DESTROYED // MOBILITY CRIPPLED [-40% SPEED]';
  return 'BOSS ' + (part.name || part.id).toUpperCase() + ' DESTROYED';
}

function spawnPartBreakParticles(x, y, part) {
  if (part.id === 'treads') {
    spawnParticles(x, y, '#a0a0a0', 22, 180, 3.5);
    spawnParticles(x, y, '#ff7733', 14, 140, 2.5);
  } else if (part.id === 'radiator') {
    spawnParticles(x, y, '#ffd27d', 24, 200, 4);
    spawnParticles(x, y, '#ff4d2e', 18, 160, 3);
  } else {
    spawnParticles(x, y, '#ff4d2e', 22, 190, 4);
    spawnParticles(x, y, '#ffd27d', 16, 150, 3);
    spawnParticles(x, y, '#5be7ff', 12, 120, 2);
  }
}

/**
 * Checks bullet hit against breakable parts of an enemy.
 * Handles 2D local space rotation transform, part HP reduction, weakpoint critical checks,
 * part destruction 0.08s hitstop, screen shake, audio, and reward orb drops.
 *
 * @param {Object} enemy
 * @param {Object} bullet
 * @returns {Boolean} true if a part was hit and resolved
 */
export function checkMultiPartBulletHit(enemy, bullet) {
  if (!enemy || !enemy.parts || !enemy.parts.length || !bullet) return false;

  var p = rt.state && rt.state.player;
  var cache = enemy.partCache;
  var waveTime = (rt.state && rt.state.waveTime) || 0;
  if (!cache || cache._frameTime !== waveTime) {
    cache = updateEnemyPartCache(enemy, p);
    if (cache) cache._frameTime = waveTime;
  }
  if (!cache) return false;

  // Local rotation transform (inverse of aim angle)
  var bdx = bullet.x - enemy.x;
  var bdy = bullet.y - enemy.y;
  var xLoc = bdx * cache.cosA + bdy * cache.sinA;
  var yLoc = -bdx * cache.sinA + bdy * cache.cosA;

  // Find nearest part in local coordinate space
  var minD = Infinity;
  var closestPart = null;
  var parts = enemy.parts;
  for (var i = 0; i < parts.length; i += 1) {
    var pt = parts[i];
    var pdx = xLoc - (pt.relX || 0);
    var pdy = yLoc - (pt.relY || 0);
    var d2 = pdx * pdx + pdy * pdy;
    if (d2 < minD) {
      minD = d2;
      closestPart = pt;
    }
  }

  if (!closestPart) return false;

  var isDestroyed = Boolean(closestPart.destroyed ||
    (closestPart.id === 'left_cannon' && enemy.leftCannonDestroyed) ||
    (closestPart.id === 'right_pod' && enemy.rightPodDestroyed) ||
    (closestPart.id === 'radiator' && enemy.radiatorDestroyed) ||
    (closestPart.id === 'treads' && enemy.treadDestroyed));
  if (isDestroyed) return false;

  var pos = getPartWorldPos(enemy, closestPart, cache);
  var ptX = pos.x;
  var ptY = pos.y;

  var partDmg = bullet.damage;
  var isWeakpoint = Boolean(closestPart.isWeakpoint);
  var isExposed = isWeakpoint && Boolean(closestPart.exposed || (closestPart.id === 'radiator' && enemy.radiatorExposed));

  if (isWeakpoint) {
    if (isExposed) {
      var vulnMult = closestPart.vulnMultiplier || 2.5;
      partDmg = Math.round(bullet.damage * vulnMult);
      damageEnemy(enemy, partDmg - bullet.damage, { source: 'weakpoint', crit: true, x: ptX, y: ptY });
      spawnCombatText(ptX, ptY - 12, 'CRIT ' + (closestPart.combatText || 'FINS') + ' -' + partDmg, true);
    } else {
      spawnCombatText(ptX, ptY - 12, (closestPart.combatText || 'FINS') + ' (RESIST)', false);
    }
  } else {
    var tag = closestPart.combatText || (closestPart.id === 'left_cannon' ? 'MORTAR' : closestPart.id === 'right_pod' ? 'POD' : closestPart.id === 'treads' ? 'TREADS' : (closestPart.label || closestPart.id.toUpperCase()));
    spawnCombatText(ptX, ptY - 10, tag + ' -' + Math.round(bullet.damage), false);
  }

  if (closestPart.hp === undefined) {
    closestPart.hp = closestPart.maxHp || Math.round((enemy.maxHp || enemy.hp) * 0.22);
  }
  closestPart.hp -= partDmg;
  syncLegacyPartHp(enemy, closestPart);

  if (closestPart.hp <= 0) {
    closestPart.hp = 0;
    closestPart.destroyed = true;
    if (closestPart.exposed) closestPart.exposed = false;
    syncLegacyPartDestroyed(enemy, closestPart);

    // 0.08s hitstop
    if (!isReducedMotion()) {
      rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.083);
    }
    rt.state.hitstop = 0.08;

    notePartDestroyed();
    onShieldBreak(enemy, { x: ptX, y: ptY, part: closestPart, source: 'part_break' });
    AudioFX.blast();
    rt.state.shake = Math.max(rt.state.shake || 0, closestPart.shake || (closestPart.id === 'radiator' ? 16 : 14));
    triggerHaptic(closestPart.haptic || (closestPart.id === 'radiator' ? [40, 60, 80] : [40, 50, 60]));

    if (rt.state.shockRings) {
      rt.state.shockRings.push({
        x: ptX,
        y: ptY,
        r: 8,
        maxR: closestPart.ringR || 70,
        life: 0.3,
        maxLife: 0.3,
        color: closestPart.ringColor || '#ff4d2e'
      });
    }

    spawnPartBreakParticles(ptX, ptY, closestPart);

    var reward = closestPart.rewardKind;
    if (reward && rt.state.orbs) {
      rt.state.orbs.push({
        kind: reward,
        x: ptX,
        y: ptY,
        vx: (rng('loot') - 0.5) * (reward === 'overdrive' ? 95 : 85),
        vy: (rng('loot') - 0.5) * (reward === 'overdrive' ? 95 : 85),
        r: reward === 'overdrive' ? 11 : 10,
        value: 0,
        life: 25
      });
    }

    if (closestPart.empStun || closestPart.id === 'left_cannon' || closestPart.id === 'right_pod') {
      enemy.empTimer = Math.max(enemy.empTimer || 0, closestPart.empStun || 1.8);
    } else if (closestPart.id === 'radiator') {
      enemy.empTimer = Math.max(enemy.empTimer || 0, 4.0);
      var overloadDmg = Math.round((enemy.maxHp || enemy.hp) * 0.12);
      damageEnemy(enemy, overloadDmg, { source: 'overload', crit: true, x: ptX, y: ptY });
    }

    if (closestPart.speedPenalty || closestPart.id === 'treads') {
      enemy.speed = (enemy.baseSpeed || enemy.speed || 50) * (1 - (closestPart.speedPenalty || 0.4));
    }

    var logMsg = closestPart.destroyMsg || defaultDestroyMsg(closestPart);
    if (logMsg) logEvent(logMsg);
    var statusMsg = closestPart.statusMsg || defaultStatusMsg(closestPart);
    if (statusMsg && rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = statusMsg;
  }

  return true;
}
