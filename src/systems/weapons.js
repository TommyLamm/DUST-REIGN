import { AudioFX } from '../audio/audio-fx.js';
import { OVERDRIVE_COOLDOWN, OVERDRIVE_DAMAGE, WEAPON_MODES } from '../config.js';
import { ejectCasing, spawnParticles } from '../core/pools.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { clamp, dist2 } from '../core/utils.js';
import { currentWeaponId, weaponModActive } from '../data/upgrades.js';
import { logEvent } from '../ui/hud.js';
import { getWeaponStrategy, listWeaponStrategies, registerWeaponStrategy } from './weapon-registry.js';

export { getWeaponStrategy, listWeaponStrategies, registerWeaponStrategy };

export function spawnKineticShrapnel(b, originX, originY) {
  if (!rt.state || !rt.state.bullets) return;
  var p = rt.state.player;
  var isPrismatic = Boolean(p && p.prismaticFlak);
  var bAngle = Math.atan2(b.vy, b.vx);
  var shrapnelSpeed = 520;
  var shrapnelDmg = Math.max(1, Math.round(b.damage * 0.45));
  var angleOffset = isPrismatic ? (Math.PI / 3) : (Math.PI / 2);
  var sideAngles = [bAngle + angleOffset, bAngle - angleOffset];
  for (var ski = 0; ski < 2; ski += 1) {
    var sAngle = sideAngles[ski];
    rt.state.bullets.push({
      x: originX,
      y: originY,
      vx: Math.cos(sAngle) * shrapnelSpeed,
      vy: Math.sin(sAngle) * shrapnelSpeed,
      r: 2.5,
      damage: shrapnelDmg,
      life: 0.38,
      trail: [],
      pierce: isPrismatic ? 1 : 0,
      bounces: 0,
      hits: [],
      isShrapnel: true,
      isPrismatic: isPrismatic,
      colorTrail: isPrismatic ? 'rgba(255, 215, 0, 0.5)' : 'rgba(255, 224, 130, 0.45)',
      colorCore: '#ffe082'
    });
  }
  spawnParticles(originX, originY, isPrismatic ? '#ffd700' : '#ffe082', 6, 85, 1.8);
}

export function spawnPlasmaMeltdownZone(x, y) {
  if (!rt.state) return;
  if (!rt.state.plasmaZones) rt.state.plasmaZones = [];
  rt.state.plasmaZones.push({
    x: x,
    y: y,
    r: 40,
    timer: 2.0,
    maxTimer: 2.0,
    damageTickTimer: 0
  });
  spawnParticles(x, y, '#ff4d2e', 12, 110, 3.2);
  spawnParticles(x, y, '#ff8c00', 8, 80, 2.5);
  spawnParticles(x, y, '#555555', 6, 50, 2.0);
  if (rt.state.shockRings) {
    rt.state.shockRings.push({
      x: x,
      y: y,
      r: 6,
      maxR: 40,
      life: 0.22,
      maxLife: 0.22,
      color: '#ff4d2e'
    });
  }
}

function weaponMasteryBonus(p, state) {
  if (!p) return 0;
  var weapon = currentWeaponId(state || rt.state);
  if (weapon === 'standard' && p.tracerRounds) return 1;
  if (weapon === 'breacher' && p.flechettePack) return 1;
  if (weapon === 'vanguard' && p.capacitorRail) return 1;
  if (weapon === 'arc-welder' && p.arcLattice) return 1;
  return 0;
}

export function vanguardChargeNeed(p) {
  var strategy = getWeaponStrategy('vanguard');
  if (strategy && typeof strategy.chargeNeed === 'function') {
    return strategy.chargeNeed(p);
  }
  var need = 0.6;
  if (!p) return need;
  var mode = p.weaponMode || (rt.state && rt.state.weaponId) || 'standard';
  if (mode !== 'vanguard') return need;
  if ((p.mastery || 0) >= 1) need = 0.45;
  if (p.capacitorRail) need *= 0.75;
  if (p.chargeTimeMult) need *= p.chargeTimeMult;
  return need;
}

export function resyncMastery(p, state) {
  if (!p) return;
  if (typeof p.masteryBase !== 'number') p.masteryBase = p.mastery || 0;
  p.mastery = Math.min(3, p.masteryBase + weaponMasteryBonus(p, state));
  p.chargeNeed = vanguardChargeNeed(p);
}

export function grantArmoryMastery(state) {
  if (!state || !state.player) return;
  var p = state.player;
  if (typeof p.masteryBase !== 'number') {
    p.masteryBase = Math.max(0, (p.mastery || 0) - weaponMasteryBonus(p, state));
  }
  if (p.masteryBase < 3) p.masteryBase += 1;
  resyncMastery(p, state);
}

export function breacherPelletCount(p) {
  var n = 5;
  if (!p || (p.weaponMode || 'standard') !== 'breacher') return n;
  if ((p.mastery || 0) >= 1) n += 2;
  if (p.flechettePack) n += 2;
  return n;
}

export function breacherSpread(count, scale) {
  var step = 0.14 * (scale || 1);
  var mid = (count - 1) / 2;
  var angles = [];
  var i;
  for (i = 0; i < count; i += 1) angles.push((i - mid) * step);
  return angles;
}

export function arcChainProfile(p) {
  var profile = { targets: 2, range: 110, ratio: 0.7 };
  if (!p || (p.weaponMode || 'standard') !== 'arc-welder') return profile;
  if ((p.mastery || 0) >= 1) profile.targets = 3;
  if ((p.mastery || 0) >= 2) profile.range = 150;
  if (p.arcLattice) {
    profile.targets += 1;
    profile.ratio = 0.8;
  }
  return profile;
}

function shotCooldown(p, value) {
  var v = value;
  if (p.afterburner && (p.afterburnerTimer || 0) > 0) v *= 0.7;
  if (p.aegisDeployed) v *= (1 / 1.45);
  if (p.surgeUnit && p.surgeUnit.active) v /= 1.40;
  return v;
}

export function cycleWeaponMode(targetMode) {
  if (!rt.state || !rt.state.player) return;
  var p = rt.state.player;
  var previous = p.weaponMode || 'standard';
  if (targetMode && WEAPON_MODES.indexOf(targetMode) !== -1) {
    p.weaponMode = targetMode;
  } else {
    var curIdx = WEAPON_MODES.indexOf(previous);
    p.weaponMode = WEAPON_MODES[(curIdx + 1) % WEAPON_MODES.length];
  }
  rt.state.weaponId = p.weaponMode;
  p.chargeTime = 0;
  p.isCharging = false;
  p.recoilVx = 0;
  p.recoilVy = 0;
  if (p.weaponMode !== previous) {
    p.masteryBase = 0;
    resyncMastery(p, rt.state);
  } else {
    p.chargeNeed = vanguardChargeNeed(p);
  }
  if (AudioFX && typeof AudioFX.click === 'function') AudioFX.click();
  logEvent('WEAPON CHASSIS // ' + p.weaponMode.toUpperCase());
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'WEAPON CHASSIS // ' + p.weaponMode.toUpperCase();
}

export function getChassisMass(rigId) {
  if (rigId === 'strider') return 0.75;
  if (rigId === 'bulwark') return 1.85;
  if (rigId === 'salvager') return 1.15;
  return 1.0;
}

export function applyWeaponRecoil(p, impulse, lambda) {
  if (!p) return;
  var rigId = (rt.state && rt.state.rigId) || p.rigId || 'scrapper';
  var mass = getChassisMass(rigId);
  var speed = impulse / mass;
  p.recoilVx = (p.recoilVx || 0) - Math.cos(p.aim) * speed;
  p.recoilVy = (p.recoilVy || 0) - Math.sin(p.aim) * speed;
  p.recoilLambda = lambda;
  p.recoil = 1.0;
}

export function shoot() {
  if (!rt.state || !rt.state.player) return;
  var p = rt.state.player;
  if (p.cooldown > 0) return;
  var aimX = (rt.input && rt.input.mouse) ? rt.input.mouse.x : p.x;
  var aimY = (rt.input && rt.input.mouse) ? rt.input.mouse.y : p.y;
  var lock = rt.input && rt.input.aimLock;
  var lockHeld = false;
  if (lock && lock.enemy && lock.enemy.hp > 0 && lock.left > 0 && !lock.enemy.burrowed && !lock.enemy.untargetable) {
    var lockLimit = (lock.dist || 0) * 1.5;
    if (dist2(p.x, p.y, lock.enemy.x, lock.enemy.y) <= lockLimit * lockLimit) {
      aimX = lock.enemy.x;
      aimY = lock.enemy.y;
      lockHeld = true;
    }
  }
  if (!lockHeld && rt.input && rt.input.touchMode && rt.state.enemies && rt.state.enemies.length) {
    // ponytail: linear nearest-target scan; the enemy cap keeps it cheap, use a spatial hash only if mobile scale grows.
    var nearest = rt.state.enemies[0];
    var nearestDistance = dist2(p.x, p.y, nearest.x, nearest.y);
    for (var ni = 1; ni < rt.state.enemies.length; ni += 1) {
      var candidate = rt.state.enemies[ni];
      var candidateDistance = dist2(p.x, p.y, candidate.x, candidate.y);
      if (candidateDistance < nearestDistance) { nearest = candidate; nearestDistance = candidateDistance; }
    }
    aimX = nearest.x;
    aimY = nearest.y;
  }
  var dx = aimX - p.x;
  var dy = aimY - p.y;
  var baseAngle = Math.atan2(dy, dx);
  p.aim = baseAngle;

  var mode = p.weaponMode || 'standard';
  var strategy = getWeaponStrategy(mode);
  p.chargeNeed = (strategy && typeof strategy.chargeNeed === 'function') ? strategy.chargeNeed(p) : 0;
  if (strategy && typeof strategy.onFire === 'function') {
    strategy.onFire(p, baseAngle);
  }
}
