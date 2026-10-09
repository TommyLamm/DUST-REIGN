import { AudioFX } from '../audio/audio-fx.js';
import { OVERDRIVE_COOLDOWN, OVERDRIVE_DAMAGE, WEAPON_MODES } from '../config.js';
import { ejectCasing, spawnParticles } from '../core/pools.js';
import { rt } from '../core/runtime.js';
import { clamp, dist2 } from '../core/utils.js';
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

export function cycleWeaponMode(targetMode) {
  if (!rt.state || !rt.state.player) return;
  var p = rt.state.player;
  if (targetMode && WEAPON_MODES.indexOf(targetMode) !== -1) {
    p.weaponMode = targetMode;
  } else {
    var curIdx = WEAPON_MODES.indexOf(p.weaponMode || 'standard');
    p.weaponMode = WEAPON_MODES[(curIdx + 1) % WEAPON_MODES.length];
  }
  p.chargeTime = 0;
  p.isCharging = false;
  if (AudioFX && typeof AudioFX.click === 'function') AudioFX.click();
  logEvent('WEAPON CHASSIS // ' + p.weaponMode.toUpperCase());
  if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'WEAPON CHASSIS // ' + p.weaponMode.toUpperCase();
}

export function shoot() {
  var p = rt.state.player;
  if (p.cooldown > 0) return;
  var aimX = rt.input.mouse.x;
  var aimY = rt.input.mouse.y;
  if (rt.input.touchMode && rt.state.enemies.length) {
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

  if (mode === 'breacher') {
    var offsets = [-0.28, -0.14, 0, 0.14, 0.28];
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
        isPlasmaMeltdown: isPlasma
      });
    }
    if (rt.state.stats) rt.state.stats.shotsFired += 5;
    p.cooldown = p.fireRate * 2.4 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.5 : 1);
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
    var vgDmg = Math.round(p.damage * 3.4 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1));
    if (rt.state.stats) rt.state.stats.shotsFired += 1;
    var vgR = 6.0 + (isPlasma ? 3 : 0);
    var vgTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(91, 231, 255, 0.45)');
    var vgCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#5be7ff');
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
      isPlasmaMeltdown: isPlasma
    });
    p.cooldown = 0.55 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.5 : 1);
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
    p.cooldown = p.fireRate * 0.45 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.5 : 1);
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
    var angle = baseAngle + (Math.random() - 0.5) * 0.035;
    var speed = p.bulletSpeed;
    if (rt.state.stats) rt.state.stats.shotsFired += 1;
    var stdR = (p.bulletSize || 4) + (isPlasma ? 3 : 0);
    var stdTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : null);
    var stdCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : null);
    var stdBullet = {
      x: p.x + Math.cos(angle) * (p.r + 8),
      y: p.y + Math.sin(angle) * (p.r + 8),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: stdR,
      damage: p.damage * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1),
      life: 1.25,
      trail: [],
      pierce: (p.pierce || 0) + extraPierce,
      bounces: p.bounces || 0,
      hits: [],
      ambush: (p.dashAmbushTimer || 0) > 0,
      isVulcan: isVulcan,
      isPlasmaMeltdown: isPlasma
    };
    if (stdTrail) stdBullet.colorTrail = stdTrail;
    if (stdCore) stdBullet.colorCore = stdCore;
    rt.state.bullets.push(stdBullet);
    p.cooldown = p.fireRate * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.5 : 1);

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
