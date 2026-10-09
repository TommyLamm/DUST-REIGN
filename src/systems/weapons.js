import { AudioFX } from '../audio/audio-fx.js';
import { OVERDRIVE_COOLDOWN, OVERDRIVE_DAMAGE, WEAPON_MODES } from '../config.js';
import { ejectCasing, spawnParticles } from '../core/pools.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { clamp, dist2 } from '../core/utils.js';
import { currentWeaponId, weaponModActive } from '../data/upgrades.js';
import { logEvent } from '../ui/hud.js';

export function spawnKineticShrapnel(b, originX, originY) {
  if (!rt.state || !rt.state.bullets) return;
  var bAngle = Math.atan2(b.vy, b.vx);
  var shrapnelSpeed = 520;
  var shrapnelDmg = Math.max(1, Math.round(b.damage * 0.45));
  var sideAngles = [bAngle + Math.PI / 2, bAngle - Math.PI / 2];
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
      pierce: 0,
      bounces: 0,
      hits: [],
      isShrapnel: true,
      colorTrail: 'rgba(255, 224, 130, 0.45)',
      colorCore: '#ffe082'
    });
  }
  spawnParticles(originX, originY, '#ffe082', 6, 85, 1.8);
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
  var need = 0.6;
  if (!p) return need;
  var mode = p.weaponMode || (rt.state && rt.state.weaponId) || 'standard';
  if (mode !== 'vanguard') return need;
  if ((p.mastery || 0) >= 1) need = 0.45;
  if (p.capacitorRail) need *= 0.75;
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
  if (p.afterburner && (p.afterburnerTimer || 0) > 0) return value * 0.7;
  return value;
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

export function shoot() {
  var p = rt.state.player;
  if (p.cooldown > 0) return;
  var aimX = rt.input.mouse.x;
  var aimY = rt.input.mouse.y;
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
  if (!lockHeld && rt.input.touchMode && rt.state.enemies.length) {
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
  var boundW = rt.ui ? rt.ui.width : rt.state.width;
  var boundH = rt.ui ? rt.ui.height : rt.state.height;
  var mode = p.weaponMode || 'standard';
  var isVulcan = !!(p.vulcanMeltdown && ((p.continuousFireTime || 0) >= 1.2));
  var isPlasma = !!(p.plasmaMeltdown && (p.overdrive > 0));
  var extraPierce = isVulcan ? 1 : 0;
  p.chargeNeed = vanguardChargeNeed(p);

  if (mode === 'breacher') {
    var spreadScale = weaponModActive(rt.state, 'flechette-pack') ? 0.9 : 1;
    var offsets = breacherSpread(breacherPelletCount(p), spreadScale);
    var breacherDmg = Math.max(1, Math.round(p.damage * 0.42 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1)));
    var bSpeed = p.bulletSpeed;
    var bR = 3.5 + (isPlasma ? 3 : 0);
    var bTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(255, 170, 80, 0.32)');
    var bCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#ffd08a');
    for (var bi = 0; bi < offsets.length; bi += 1) {
      var spreadAngle = baseAngle + offsets[bi];
      rt.state.bullets.push({
        x: p.x + Math.cos(spreadAngle) * (p.r + 8),
        y: p.y + Math.sin(spreadAngle) * (p.r + 8),
        vx: Math.cos(spreadAngle) * bSpeed,
        vy: Math.sin(spreadAngle) * bSpeed,
        r: bR,
        damage: breacherDmg,
        life: 0.42,
        trail: [],
        pierce: (p.pierce || 0) + extraPierce,
        bounces: p.bounces || 0,
        hits: [],
        ambush: (p.dashAmbushTimer || 0) > 0,
        colorTrail: bTrail,
        colorCore: bCore,
        isVulcan: isVulcan,
        isPlasmaMeltdown: isPlasma,
        isBreacher: true
      });
    }
    if (rt.state.stats) rt.state.stats.shotsFired += offsets.length;
    p.cooldown = shotCooldown(p, p.fireRate * 2.4 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.7 : 1));
    p.recoil = 1.0;
    p.x -= Math.cos(p.aim) * 4.5;
    p.y -= Math.sin(p.aim) * 4.5;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);
    ejectCasing(p);
    ejectCasing(p);
    if (isVulcan) { ejectCasing(p); ejectCasing(p); }
    AudioFX.shoot();
    spawnParticles(p.x + Math.cos(baseAngle) * 24, p.y + Math.sin(baseAngle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#f7d48a'), 12, 130, 2.5);
    if (isVulcan) spawnParticles(p.x + Math.cos(baseAngle) * 24, p.y + Math.sin(baseAngle) * 24, '#ffd700', 8, 110, 2);
    rt.state.shake = Math.max(rt.state.shake, 4.5);
  } else if (mode === 'vanguard') {
    var railBonus = weaponModActive(rt.state, 'capacitor-rail') ? 1.2 : 1;
    var vgDmg = Math.round(p.damage * 3.4 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1) * railBonus);
    if (rt.state.stats) rt.state.stats.shotsFired += 1;
    var vgR = 6.0 + (isPlasma ? 3 : 0);
    var vgTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(91, 231, 255, 0.45)');
    var vgCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#5be7ff');
    var mastery = p.mastery || 0;
    rt.state.bullets.push({
      x: p.x + Math.cos(baseAngle) * (p.r + 10),
      y: p.y + Math.sin(baseAngle) * (p.r + 10),
      vx: Math.cos(baseAngle) * 1350,
      vy: Math.sin(baseAngle) * 1350,
      r: vgR,
      damage: vgDmg,
      life: 1.5,
      trail: [],
      pierce: 99 + extraPierce,
      bounces: p.bounces || 0,
      hits: [],
      ambush: (p.dashAmbushTimer || 0) > 0,
      knockback: 35,
      isVanguard: true,
      colorTrail: vgTrail,
      colorCore: vgCore,
      isVulcan: isVulcan,
      isPlasmaMeltdown: isPlasma,
      scorchLine: mastery >= 2,
      vanguardBurst: mastery >= 3,
      scorchDamage: Math.max(1, vgDmg * 0.2)
    });
    p.cooldown = shotCooldown(p, 0.55 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.7 : 1));
    p.recoil = 1.0;
    p.x -= Math.cos(p.aim) * 3.5;
    p.y -= Math.sin(p.aim) * 3.5;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);
    ejectCasing(p);
    if (isVulcan) ejectCasing(p);
    AudioFX.shoot();
    spawnParticles(p.x + Math.cos(baseAngle) * 24, p.y + Math.sin(baseAngle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#5be7ff'), 10, 160, 3);
    if (isVulcan) spawnParticles(p.x + Math.cos(baseAngle) * 24, p.y + Math.sin(baseAngle) * 24, '#ffd700', 8, 120, 2);
    rt.state.shake = Math.max(rt.state.shake, 6.0);
    rt.state.hitstop = Math.max(rt.state.hitstop, 0.04);
    p.chargeTime = 0;
    p.isCharging = false;
  } else if (mode === 'arc-welder') {
    var arcDmg = Math.max(1, Math.round(p.damage * 0.32 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1)));
    var arcSpeed = p.bulletSpeed;
    if (rt.state.stats) rt.state.stats.shotsFired += 1;
    var arcR = 3.0 + (isPlasma ? 3 : 0);
    var arcTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(91, 231, 255, 0.35)');
    var arcCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#a8f5e5');
    rt.state.bullets.push({
      x: p.x + Math.cos(baseAngle) * (p.r + 8),
      y: p.y + Math.sin(baseAngle) * (p.r + 8),
      vx: Math.cos(baseAngle) * arcSpeed,
      vy: Math.sin(baseAngle) * arcSpeed,
      r: arcR,
      damage: arcDmg,
      life: 1.0,
      trail: [],
      pierce: (p.pierce || 0) + extraPierce,
      bounces: p.bounces || 0,
      hits: [],
      ambush: (p.dashAmbushTimer || 0) > 0,
      isArcWelder: true,
      colorTrail: arcTrail,
      colorCore: arcCore,
      isVulcan: isVulcan,
      isPlasmaMeltdown: isPlasma
    });
    p.cooldown = shotCooldown(p, p.fireRate * 0.45 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.7 : 1));
    p.recoil = 0.5;
    p.x -= Math.cos(p.aim) * 0.5;
    p.y -= Math.sin(p.aim) * 0.5;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);
    ejectCasing(p);
    if (isVulcan) ejectCasing(p);
    AudioFX.shoot();
    spawnParticles(p.x + Math.cos(baseAngle) * 24, p.y + Math.sin(baseAngle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#5be7ff'), 4, 100, 2);
    if (isVulcan) spawnParticles(p.x + Math.cos(baseAngle) * 24, p.y + Math.sin(baseAngle) * 24, '#ffd700', 6, 90, 2);
    rt.state.shake = Math.max(rt.state.shake, 1.5);
  } else {
    var angle = baseAngle + (rng('combat') - 0.5) * 0.035;
    var speed = p.bulletSpeed;
    var stdCount = (p.mastery || 0) >= 2 ? 2 : 1;
    var stdScale = stdCount === 2 ? 0.7 : 1;
    var stdR = (p.bulletSize || 4) + (isPlasma ? 3 : 0);
    var stdTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : null);
    var stdCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : null);
    var tracerLive = weaponModActive(rt.state, 'tracer-rounds');
    if (rt.state.stats) rt.state.stats.shotsFired += stdCount;
    for (var si = 0; si < stdCount; si += 1) {
      var side = stdCount === 2 ? (si === 0 ? -1 : 1) : 0;
      var perp = angle + Math.PI / 2;
      p.standardRound = (p.standardRound || 0) + 1;
      var masteryPierce = ((p.mastery || 0) >= 1 && p.standardRound % 4 === 0) ? 1 : 0;
      var tracerPierce = 0;
      var forceCrit = false;
      if (tracerLive) {
        p.tracerRound = (p.tracerRound || 0) + 1;
        if (p.tracerRound % 5 === 0) {
          tracerPierce = 2;
          forceCrit = true;
        }
      }
      var stdBullet = {
        x: p.x + Math.cos(angle) * (p.r + 8) + Math.cos(perp) * side * 7,
        y: p.y + Math.sin(angle) * (p.r + 8) + Math.sin(perp) * side * 7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: stdR,
        damage: p.damage * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1) * stdScale,
        life: 1.25,
        trail: [],
        pierce: (p.pierce || 0) + extraPierce + masteryPierce + tracerPierce,
        bounces: p.bounces || 0,
        hits: [],
        ambush: (p.dashAmbushTimer || 0) > 0,
        isVulcan: isVulcan,
        isPlasmaMeltdown: isPlasma,
        forceCrit: forceCrit,
        masteryRicochet: (p.mastery || 0) >= 3
      };
      if (stdTrail) stdBullet.colorTrail = stdTrail;
      if (stdCore) stdBullet.colorCore = stdCore;
      rt.state.bullets.push(stdBullet);
    }
    p.cooldown = shotCooldown(p, p.fireRate * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.7 : 1));

    p.recoil = 1.0;
    p.x -= Math.cos(p.aim) * 1.4;
    p.y -= Math.sin(p.aim) * 1.4;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);

    ejectCasing(p);
    if (isVulcan) ejectCasing(p);
    AudioFX.shoot();

    spawnParticles(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#f7d48a'), 4, 90, 2);
    if (isVulcan) spawnParticles(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, '#ffd700', 6, 90, 2);
    rt.state.shake = Math.max(rt.state.shake, 2.5);
  }
}
