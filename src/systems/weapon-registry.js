import { AudioFX } from '../audio/audio-fx.js';
import { OVERDRIVE_COOLDOWN, OVERDRIVE_DAMAGE, TAU } from '../config.js';
import { ejectCasing, spawnParticles } from '../core/pools.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { clamp } from '../core/utils.js';
import { weaponModActive } from '../data/upgrades.js';
import { addCameraTrauma } from '../core/camera.js';

var WEAPON_REGISTRY = new Map();

export function registerWeaponStrategy(strategy) {
  if (!strategy || !strategy.id) {
    throw new Error('Weapon strategy must have an id');
  }
  WEAPON_REGISTRY.set(strategy.id, strategy);
  return strategy;
}

export function getWeaponStrategy(id) {
  return WEAPON_REGISTRY.get(id) || WEAPON_REGISTRY.get('standard') || null;
}

export function listWeaponStrategies() {
  return Array.from(WEAPON_REGISTRY.values());
}

export function shotCooldown(p, value) {
  var v = value;
  if (p.afterburner && (p.afterburnerTimer || 0) > 0) v *= 0.7;
  if (p.aegisDeployed) v *= (1 / 1.45);
  if (p.surgeUnit && p.surgeUnit.active) v /= 1 + 0.40 * (p.surgeUnit.tune || 1);
  if (p.tacticalOverdriveTimer && p.tacticalOverdriveTimer > 0) v *= 0.8;
  return v;
}

function getChassisMass(rigId) {
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

function defaultOutline(ctx, width) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#030204';
  ctx.lineWidth = width || 1.6;
  ctx.stroke();
}

// ----------------------------------------------------
// 1. STANDARD: Twin Heavy Autocannons
// ----------------------------------------------------
registerWeaponStrategy({
  id: 'standard',
  name: 'STANDARD',
  category: 'kinetic',
  chargeNeed: function () {
    return 0;
  },
  onTick: function (p, dt, isMouseDown) {
    p.chargeTime = 0;
    p.isCharging = false;
    if (isMouseDown && p.cooldown <= 0) {
      this.onFire(p, p.aim);
    }
  },
  onFire: function (p, aimAngle) {
    if (!rt.state) return;
    var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
    var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
    var isVulcan = !!(p.vulcanMeltdown && ((p.continuousFireTime || 0) >= 1.2));
    var isPlasma = !!(p.plasmaMeltdown && (p.overdrive > 0));
    var extraPierce = isVulcan ? 1 : 0;

    var angle = aimAngle + (rng('combat') - 0.5) * 0.035;
    var speed = p.bulletSpeed * (p.bulletSpeedMult || 1);
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
        hitMask0: 0,
        hitMask1: 0,
        hitMask2: 0,
        hitMask3: 0,
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
    var recoilPushStd = (p.recoilMult || 1);
    p.x -= Math.cos(p.aim) * 1.4 * recoilPushStd;
    p.y -= Math.sin(p.aim) * 1.4 * recoilPushStd;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);
    applyWeaponRecoil(p, 65, 16.0);
    ejectCasing(p);
    if (isVulcan) ejectCasing(p);
    AudioFX.shoot('standard');

    spawnParticles(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#f7d48a'), 4, 90, 2);
    if (isVulcan) spawnParticles(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, '#ffd700', 6, 90, 2);
    rt.state.shake = Math.max(rt.state.shake, 2.5);
  },
  bulletProfile: {
    damageMult: 1.0,
    speed: 700,
    pierce: 0,
    life: 1.25
  },
  audio: {
    shoot: 'standard'
  },
  renderGun: function (ctx, p, kick, flashing, helpers) {
    var r = p.r;
    var metal = flashing ? '#ffffff' : '#d7c094';
    var trim = flashing ? '#ffffff' : '#f4e2b4';
    var steel = flashing ? '#ffffff' : '#222927';
    var outline = (helpers && helpers.outline) || defaultOutline;
    var drawMuzzle = helpers && helpers.drawMuzzle;

    var x0 = r * 0.16 - kick;
    var len = r + 18;

    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.rect(x0 - 4, -6.5, 8, 13);
    ctx.fill();
    outline(ctx, 1.2);

    ctx.fillStyle = metal;
    ctx.fillRect(x0, -5.4, len, 3.6);
    ctx.fillRect(x0, 1.8, len, 3.6);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x0, -5.4, len, 3.6);
    ctx.strokeRect(x0, 1.8, len, 3.6);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, -3.6);
    ctx.lineTo(x0 + len - 4, -3.6);
    ctx.moveTo(x0 + 4, 3.6);
    ctx.lineTo(x0 + len - 4, 3.6);
    ctx.stroke();

    if (!flashing) {
      ctx.fillStyle = '#1c1812';
      ctx.fillRect(x0 + 4, -4.2, len - 10, 1.2);
      ctx.fillRect(x0 + 4, 3, len - 10, 1.2);
    }

    ctx.fillStyle = trim;
    ctx.fillRect(x0 + len - 4, -6.2, 6, 5.2);
    ctx.fillRect(x0 + len - 4, 1, 6, 5.2);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x0 + len - 4, -6.2, 6, 5.2);
    ctx.strokeRect(x0 + len - 4, 1, 6, 5.2);

    if (drawMuzzle && (p.recoil || 0) > 0.05) {
      drawMuzzle(ctx, 'standard', x0 + len + 2, -3.6, p.recoil);
      drawMuzzle(ctx, 'standard', x0 + len + 2, 3.6, p.recoil);
    }
  }
});

// ----------------------------------------------------
// 2. BREACHER: Close-Spread Shotgun
// ----------------------------------------------------
registerWeaponStrategy({
  id: 'breacher',
  name: 'BREACHER',
  category: 'kinetic',
  chargeNeed: function () {
    return 0;
  },
  onTick: function (p, dt, isMouseDown) {
    p.chargeTime = 0;
    p.isCharging = false;
    if (isMouseDown && p.cooldown <= 0) {
      this.onFire(p, p.aim);
    }
  },
  onFire: function (p, aimAngle) {
    if (!rt.state) return;
    var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
    var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
    var isVulcan = !!(p.vulcanMeltdown && ((p.continuousFireTime || 0) >= 1.2));
    var isPlasma = !!(p.plasmaMeltdown && (p.overdrive > 0));
    var extraPierce = isVulcan ? 1 : 0;

    var spreadScale = weaponModActive(rt.state, 'flechette-pack') ? 0.9 : 1;
    var offsets = breacherSpread(breacherPelletCount(p), spreadScale);
    var breacherDmg = Math.max(1, Math.round(p.damage * 0.42 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1)));
    var bSpeed = p.bulletSpeed * (p.bulletSpeedMult || 1);
    var bR = 3.5 + (isPlasma ? 3 : 0);
    var bTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(255, 170, 80, 0.32)');
    var bCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#ffd08a');

    for (var bi = 0; bi < offsets.length; bi += 1) {
      var spreadAngle = aimAngle + offsets[bi];
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
        hitMask0: 0,
        hitMask1: 0,
        hitMask2: 0,
        hitMask3: 0,
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
    var recoilPush = (p.recoilMult || 1);
    p.x -= Math.cos(p.aim) * 4.5 * recoilPush;
    p.y -= Math.sin(p.aim) * 4.5 * recoilPush;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);
    applyWeaponRecoil(p, 340, 11.0);
    ejectCasing(p);
    ejectCasing(p);
    if (isVulcan) { ejectCasing(p); ejectCasing(p); }
    AudioFX.shoot('breacher');
    spawnParticles(p.x + Math.cos(aimAngle) * 24, p.y + Math.sin(aimAngle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#f7d48a'), 12, 130, 2.5);
    if (isVulcan) spawnParticles(p.x + Math.cos(aimAngle) * 24, p.y + Math.sin(aimAngle) * 24, '#ffd700', 8, 110, 2);
    rt.state.shake = Math.max(rt.state.shake, 4.5);
    addCameraTrauma(0.09);
  },
  bulletProfile: {
    damageMult: 0.42,
    pellets: 5,
    life: 0.42
  },
  audio: {
    shoot: 'breacher'
  },
  renderGun: function (ctx, p, kick, flashing, helpers) {
    var r = p.r;
    var metal = flashing ? '#ffffff' : '#d7c094';
    var trim = flashing ? '#ffffff' : '#f4e2b4';
    var steel = flashing ? '#ffffff' : '#222927';
    var gunDark = flashing ? '#ffffff' : '#141c1a';
    var outline = (helpers && helpers.outline) || defaultOutline;
    var drawMuzzle = helpers && helpers.drawMuzzle;

    var bx = r * 0.12 - kick;
    var blen = r * 0.72;

    ctx.fillStyle = gunDark;
    ctx.fillRect(bx + 4, 3.5, blen - 8, 4.5);
    ctx.fillStyle = flashing ? '#ffffff' : '#72644e';
    ctx.fillRect(bx + 8, 4, blen * 0.5, 3.5);

    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.rect(bx, -6.5, blen, 13);
    ctx.fill();
    outline(ctx, 1.4);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx + 4, 0);
    ctx.lineTo(bx + blen - 4, 0);
    ctx.stroke();

    if (!flashing) {
      ctx.fillStyle = '#18140f';
      var hi;
      for (hi = 0; hi < 3; hi += 1) {
        ctx.beginPath();
        ctx.arc(bx + 8 + hi * 9, -2.5, 1.6, 0, TAU);
        ctx.arc(bx + 8 + hi * 9, 2.5, 1.6, 0, TAU);
        ctx.fill();
      }
    }

    ctx.fillStyle = trim;
    ctx.fillRect(bx + blen - 2, -8, 8, 16);
    ctx.strokeStyle = '#0e0c09';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(bx + blen - 2, -8, 8, 16);

    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.rect(-r * 0.18, -r * 0.98, 13, 15);
    ctx.fill();
    outline(ctx, 1.4);

    if (!flashing) {
      ctx.fillStyle = '#d49b38';
      ctx.fillRect(-r * 0.15, -r * 0.95, 3.5, 12);
      ctx.fillRect(-r * 0.05, -r * 0.95, 3.5, 12);
    }

    ctx.strokeStyle = flashing ? '#ffffff' : '#e7d3a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, -r * 0.88);
    ctx.lineTo(-r * 0.02, -r * 0.2);
    ctx.moveTo(-r * 0.12, -r * 0.52);
    ctx.lineTo(r * 0.12, -r * 0.52);
    ctx.stroke();

    if (drawMuzzle && (p.recoil || 0) > 0.05) {
      drawMuzzle(ctx, 'breacher', bx + blen + 6, 0, p.recoil);
    }
  }
});

// ----------------------------------------------------
// 3. VANGUARD: High-Velocity Piercing Railgun
// ----------------------------------------------------
registerWeaponStrategy({
  id: 'vanguard',
  name: 'VANGUARD',
  category: 'energy',
  chargeNeed: function (p) {
    var need = 0.6;
    if (!p) return need;
    if ((p.mastery || 0) >= 1) need = 0.45;
    if (p.capacitorRail) need *= 0.75;
    if (p.chargeTimeMult) need *= p.chargeTimeMult;
    return need;
  },
  onTick: function (p, dt, isMouseDown) {
    p.chargeNeed = this.chargeNeed(p);
    if (isMouseDown) {
      if (p.cooldown <= 0) {
        if (!p.isCharging) {
          p.isCharging = true;
          if (AudioFX && typeof AudioFX.vanguardChargeStart === 'function') {
            AudioFX.vanguardChargeStart(p.chargeNeed);
          }
        }
        p.chargeTime += dt;
        if (p.chargeTime >= p.chargeNeed) {
          if (AudioFX && typeof AudioFX.vanguardChargeStop === 'function') {
            AudioFX.vanguardChargeStop();
          }
          this.onFire(p, p.aim);
        }
      }
    } else {
      if (p.isCharging) {
        if (p.chargeTime >= p.chargeNeed && p.cooldown <= 0) {
          this.onFire(p, p.aim);
        }
        p.chargeTime = 0;
        p.isCharging = false;
        if (AudioFX && typeof AudioFX.vanguardChargeStop === 'function') {
          AudioFX.vanguardChargeStop();
        }
      }
    }
  },
  onFire: function (p, aimAngle) {
    if (!rt.state) return;
    var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
    var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
    var isVulcan = !!(p.vulcanMeltdown && ((p.continuousFireTime || 0) >= 1.2));
    var isPlasma = !!(p.plasmaMeltdown && (p.overdrive > 0));
    var extraPierce = isVulcan ? 1 : 0;

    var railBonus = weaponModActive(rt.state, 'capacitor-rail') ? 1.2 : 1;
    var vgDmg = Math.round(p.damage * 3.4 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1) * railBonus);
    if (rt.state.stats) rt.state.stats.shotsFired += 1;
    var vgR = 6.0 + (isPlasma ? 3 : 0);
    var vgTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(91, 231, 255, 0.45)');
    var vgCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#5be7ff');
    var mastery = p.mastery || 0;
    var vgSpeed = 1350 * (p.bulletSpeedMult || 1);

    rt.state.bullets.push({
      x: p.x + Math.cos(aimAngle) * (p.r + 10),
      y: p.y + Math.sin(aimAngle) * (p.r + 10),
      vx: Math.cos(aimAngle) * vgSpeed,
      vy: Math.sin(aimAngle) * vgSpeed,
      r: vgR,
      damage: vgDmg,
      life: 1.5,
      trail: [],
      pierce: 99 + extraPierce,
      bounces: p.bounces || 0,
      hits: [],
      hitMask0: 0,
      hitMask1: 0,
      hitMask2: 0,
      hitMask3: 0,
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
    var recoilPushVg = (p.recoilMult || 1);
    p.x -= Math.cos(p.aim) * 3.5 * recoilPushVg;
    p.y -= Math.sin(p.aim) * 3.5 * recoilPushVg;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);
    applyWeaponRecoil(p, 480, 8.5);
    ejectCasing(p);
    if (isVulcan) ejectCasing(p);
    AudioFX.shoot('vanguard');
    spawnParticles(p.x + Math.cos(aimAngle) * 24, p.y + Math.sin(aimAngle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#5be7ff'), 10, 160, 3);
    if (isVulcan) spawnParticles(p.x + Math.cos(aimAngle) * 24, p.y + Math.sin(aimAngle) * 24, '#ffd700', 8, 120, 2);
    rt.state.shake = Math.max(rt.state.shake, 6.0);
    rt.state.hitstop = Math.max(rt.state.hitstop, 0.04);
    addCameraTrauma(0.15);
    p.chargeTime = 0;
    p.isCharging = false;
  },
  bulletProfile: {
    damageMult: 3.4,
    speed: 1350,
    pierce: 99,
    knockback: 35,
    life: 1.5
  },
  audio: {
    shoot: 'vanguard'
  },
  renderGun: function (ctx, p, kick, flashing, helpers) {
    var r = p.r;
    var gunDark = flashing ? '#ffffff' : '#141c1a';
    var outline = (helpers && helpers.outline) || defaultOutline;
    var drawMuzzle = helpers && helpers.drawMuzzle;
    var drawGlow = helpers && helpers.drawGlow;
    var PALETTE = helpers && helpers.PALETTE;
    var keyGlowsOnly = (helpers && helpers.keyGlowsOnly) ? helpers.keyGlowsOnly : function () { return false; };

    var chargeNeed = (typeof p.chargeNeed === 'number' && p.chargeNeed > 0) ? p.chargeNeed : 0.6;
    var charge = clamp((p.chargeTime || 0) / chargeNeed, 0, 1);

    var vx = r * 0.12 - kick;
    var vlen = r + 24;

    ctx.fillStyle = gunDark;
    ctx.beginPath();
    ctx.rect(vx - 4, -4.5, 8, 9);
    ctx.fill();
    outline(ctx, 1.2);

    ctx.fillStyle = flashing ? '#ffffff' : '#142c33';
    ctx.fillRect(vx, -3.5, vlen, 2.8);
    ctx.fillRect(vx, 0.7, vlen, 2.8);

    ctx.fillStyle = flashing ? '#ffffff' : '#8fd0d8';
    ctx.fillRect(vx + 2, -2.8, vlen - 4, 1.4);
    ctx.fillRect(vx + 2, 1.4, vlen - 4, 1.4);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(vx + 4, 0);
    ctx.lineTo(vx + vlen - 4, 0);
    ctx.stroke();

    var seg;
    for (seg = 0; seg < 5; seg += 1) {
      var on = p.isCharging && charge >= (seg + 1) / 5;
      ctx.fillStyle = on ? '#e8fbff' : (flashing ? '#ffffff' : '#1e4852');
      ctx.fillRect(vx + 6 + seg * ((vlen - 14) / 5), -4.6, 5, 9.2);
      ctx.strokeStyle = on ? '#5be7ff' : '#0c1a1e';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx + 6 + seg * ((vlen - 14) / 5), -4.6, 5, 9.2);
    }

    if (p.isCharging && charge > 0.05 && !keyGlowsOnly() && drawGlow && PALETTE) {
      drawGlow(ctx, vx + vlen, 0, 10 + charge * 12, PALETTE.emissive.tech, 0.45 + charge * 0.45);
      if (Math.sin((rt.renderTime || 0) * 30) > 0.2) {
        ctx.strokeStyle = '#e8fbff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(vx + vlen * 0.5, -2);
        ctx.lineTo(vx + vlen * 0.65, 0);
        ctx.lineTo(vx + vlen * 0.5, 2);
        ctx.stroke();
      }
    }
    if (drawMuzzle && (p.recoil || 0) > 0.05) {
      drawMuzzle(ctx, 'vanguard', vx + vlen, 0, p.recoil);
    }
  }
});

// ----------------------------------------------------
// 4. ARC-WELDER: Chain Lightning
// ----------------------------------------------------
registerWeaponStrategy({
  id: 'arc-welder',
  name: 'ARC WELDER',
  category: 'energy',
  chargeNeed: function () {
    return 0;
  },
  onTick: function (p, dt, isMouseDown) {
    p.chargeTime = 0;
    p.isCharging = false;
    if (isMouseDown && p.cooldown <= 0) {
      this.onFire(p, p.aim);
    }
  },
  onFire: function (p, aimAngle) {
    if (!rt.state) return;
    var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
    var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
    var isVulcan = !!(p.vulcanMeltdown && ((p.continuousFireTime || 0) >= 1.2));
    var isPlasma = !!(p.plasmaMeltdown && (p.overdrive > 0));
    var extraPierce = isVulcan ? 1 : 0;

    var arcDmg = Math.max(1, Math.round(p.damage * 0.32 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1)));
    var arcSpeed = p.bulletSpeed * (p.bulletSpeedMult || 1);
    if (rt.state.stats) rt.state.stats.shotsFired += 1;
    var arcR = 3.0 + (isPlasma ? 3 : 0);
    var arcTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(91, 231, 255, 0.35)');
    var arcCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#a8f5e5');

    rt.state.bullets.push({
      x: p.x + Math.cos(aimAngle) * (p.r + 8),
      y: p.y + Math.sin(aimAngle) * (p.r + 8),
      vx: Math.cos(aimAngle) * arcSpeed,
      vy: Math.sin(aimAngle) * arcSpeed,
      r: arcR,
      damage: arcDmg,
      life: 1.0,
      trail: [],
      pierce: (p.pierce || 0) + extraPierce,
      bounces: p.bounces || 0,
      hits: [],
      hitMask0: 0,
      hitMask1: 0,
      hitMask2: 0,
      hitMask3: 0,
      ambush: (p.dashAmbushTimer || 0) > 0,
      isArcWelder: true,
      colorTrail: arcTrail,
      colorCore: arcCore,
      isVulcan: isVulcan,
      isPlasmaMeltdown: isPlasma
    });

    p.cooldown = shotCooldown(p, p.fireRate * 0.45 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.7 : 1));
    applyWeaponRecoil(p, 25, 22.0);
    p.recoil = 0.5;
    var recoilPushArc = (p.recoilMult || 1);
    p.x -= Math.cos(p.aim) * 0.5 * recoilPushArc;
    p.y -= Math.sin(p.aim) * 0.5 * recoilPushArc;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);
    ejectCasing(p);
    if (isVulcan) ejectCasing(p);
    AudioFX.shoot('arc-welder');
    spawnParticles(p.x + Math.cos(aimAngle) * 24, p.y + Math.sin(aimAngle) * 24, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#5be7ff'), 4, 100, 2);
    if (isVulcan) spawnParticles(p.x + Math.cos(aimAngle) * 24, p.y + Math.sin(aimAngle) * 24, '#ffd700', 6, 90, 2);
    rt.state.shake = Math.max(rt.state.shake, 1.5);
  },
  bulletProfile: {
    damageMult: 0.32,
    speed: 600,
    life: 1.0
  },
  audio: {
    shoot: 'arc-welder'
  },
  renderGun: function (ctx, p, kick, flashing, helpers) {
    var r = p.r;
    var outline = (helpers && helpers.outline) || defaultOutline;
    var drawMuzzle = helpers && helpers.drawMuzzle;
    var drawIdleArc = helpers && helpers.drawIdleArc;

    var ax = r * 0.26 - kick;
    var tip = ax + r * 0.98;

    ctx.fillStyle = flashing ? '#ffffff' : '#2b3834';
    ctx.beginPath();
    ctx.rect(ax - 6, -6.5, 9, 13);
    ctx.fill();
    outline(ctx, 1.2);

    if (!flashing) {
      ctx.fillStyle = '#c87842';
      ctx.fillRect(ax - 4, -5.5, 5, 11);
      ctx.strokeStyle = '#e29e68';
      ctx.lineWidth = 1;
      ctx.strokeRect(ax - 4, -5.5, 5, 11);
    }

    ctx.strokeStyle = flashing ? '#ffffff' : '#9fffe8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, -4);
    ctx.lineTo(tip, -8.5);
    ctx.moveTo(ax, 4);
    ctx.lineTo(tip, 8.5);
    ctx.stroke();

    ctx.fillStyle = flashing ? '#ffffff' : '#e8fff8';
    ctx.beginPath();
    ctx.arc(tip, -8.5, 2.6, 0, TAU);
    ctx.arc(tip, 8.5, 2.6, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(tip - 4, 0);
    ctx.stroke();

    if (drawMuzzle && (p.recoil || 0) > 0.05) {
      drawMuzzle(ctx, 'arc-welder', tip + 4, 0, p.recoil);
    } else if (drawIdleArc) {
      drawIdleArc(ctx, tip);
    }
  }
});

// ----------------------------------------------------
// 5. COLOSSUS: Heavy Dual-Stage Particle Railgun
// ----------------------------------------------------
registerWeaponStrategy({
  id: 'colossus',
  name: 'COLOSSUS',
  category: 'energy',
  chargeNeed: function (p) {
    var need = 0.85;
    if (!p) return need;
    if ((p.mastery || 0) >= 1) need *= 0.8; // superconducting: 蓄力時間 -20% (0.68s)
    if (p.chargeTimeMult) need *= p.chargeTimeMult;
    return need;
  },
  onTick: function (p, dt, isMouseDown) {
    p.chargeNeed = this.chargeNeed(p);
    if (isMouseDown) {
      if (p.cooldown <= 0) {
        if (!p.isCharging) {
          p.isCharging = true;
          p.chargeTime = 0;
          if (AudioFX && typeof AudioFX.vanguardChargeStart === 'function') {
            AudioFX.vanguardChargeStart(p.chargeNeed);
          }
        }
        p.chargeTime += dt;
        if (p.chargeTime >= p.chargeNeed) {
          if (AudioFX && typeof AudioFX.vanguardChargeStop === 'function') {
            AudioFX.vanguardChargeStop();
          }
          this.onFire(p, p.aim, true);
        }
      }
    } else {
      if (p.isCharging) {
        if (p.chargeTime >= p.chargeNeed && p.cooldown <= 0) {
          this.onFire(p, p.aim, true);
        } else if (p.cooldown <= 0) {
          this.onFire(p, p.aim, false);
        }
        p.chargeTime = 0;
        p.isCharging = false;
        if (AudioFX && typeof AudioFX.vanguardChargeStop === 'function') {
          AudioFX.vanguardChargeStop();
        }
      }
    }
  },
  onFire: function (p, aimAngle, forceCharged) {
    if (!rt.state) return;
    var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
    var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
    var isVulcan = !!(p.vulcanMeltdown && ((p.continuousFireTime || 0) >= 1.2));
    var isPlasma = !!(p.plasmaMeltdown && (p.overdrive > 0));
    var extraPierce = isVulcan ? 1 : 0;
    var mastery = p.mastery || 0;
    var isCharged = (forceCharged !== undefined) ? forceCharged : ((p.chargeTime || 0) >= (p.chargeNeed || 0.85));

    if (rt.state.stats) rt.state.stats.shotsFired += 1;

    if (isCharged) {
      // 蓄滿釋放穿透 99 的重型軌道電漿束
      var cDmg = Math.round(p.damage * 4.2 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1));
      var cSpeed = 1550 * (p.bulletSpeedMult || 1);
      var cR = 8.5 + (isPlasma ? 3 : 0);
      var cTrail = isPlasma ? 'rgba(255, 77, 46, 0.65)' : (isVulcan ? 'rgba(255, 69, 0, 0.55)' : 'rgba(0, 243, 255, 0.65)');
      var cCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#00f3ff');

      rt.state.bullets.push({
        x: p.x + Math.cos(aimAngle) * (p.r + 14),
        y: p.y + Math.sin(aimAngle) * (p.r + 14),
        vx: Math.cos(aimAngle) * cSpeed,
        vy: Math.sin(aimAngle) * cSpeed,
        r: cR,
        damage: cDmg,
        life: 1.4,
        trail: [],
        pierce: 99 + extraPierce,
        bounces: p.bounces || 0,
        hits: [],
        hitMask0: 0,
        hitMask1: 0,
        hitMask2: 0,
        hitMask3: 0,
        ambush: (p.dashAmbushTimer || 0) > 0,
        knockback: 45,
        isColossus: true,
        isColossusCharged: true,
        colorTrail: cTrail,
        colorCore: cCore,
        isVulcan: isVulcan,
        isPlasmaMeltdown: isPlasma,
        colossusDisintegration: mastery >= 2,
        colossusGraviton: mastery >= 3,
        isEventHorizon: Boolean(p.eventHorizon)
      });

      p.cooldown = shotCooldown(p, 0.75 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.7 : 1));
      p.recoil = 1.0;
      var recoilPush = (p.recoilMult || 1);
      var recoilDist = 7.0 * (mastery >= 1 ? 1.25 : 1.0) * recoilPush;
      p.x -= Math.cos(p.aim) * recoilDist;
      p.y -= Math.sin(p.aim) * recoilDist;
      p.x = clamp(p.x, p.r, boundW - p.r);
      p.y = clamp(p.y, p.r, boundH - p.r);

      // 極強後座反衝 (superconducting +25% recoil)
      var baseImpulse = 620 * (mastery >= 1 ? 1.25 : 1.0);
      applyWeaponRecoil(p, baseImpulse, 7.0);

      ejectCasing(p);
      if (isVulcan) { ejectCasing(p); ejectCasing(p); }
      AudioFX.shoot('vanguard');
      if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();

      spawnParticles(p.x + Math.cos(aimAngle) * 28, p.y + Math.sin(aimAngle) * 28, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#00f3ff'), 14, 180, 3.5);
      spawnParticles(p.x + Math.cos(aimAngle) * 28, p.y + Math.sin(aimAngle) * 28, '#ffffff', 8, 120, 2);
      if (rt.state.shockRings) {
        rt.state.shockRings.push({
          x: p.x + Math.cos(aimAngle) * 24,
          y: p.y + Math.sin(aimAngle) * 24,
          r: 8,
          maxR: 45,
          life: 0.22,
          maxLife: 0.22,
          color: '#00f3ff'
        });
      }
      rt.state.shake = Math.max(rt.state.shake, 8.0);
      rt.state.hitstop = Math.max(rt.state.hitstop, 0.05);
      addCameraTrauma(0.22);
    } else {
      // 未滿蓄發射等離子球
      var orbDmg = Math.round(p.damage * 1.4 * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1));
      var orbSpeed = 680 * (p.bulletSpeedMult || 1);
      var orbR = 7.0 + (isPlasma ? 3 : 0);
      var orbTrail = isPlasma ? 'rgba(255, 77, 46, 0.5)' : (isVulcan ? 'rgba(255, 69, 0, 0.45)' : 'rgba(0, 243, 255, 0.45)');
      var orbCore = isPlasma ? '#ff4d2e' : (isVulcan ? '#ffa022' : '#38bdf8');

      rt.state.bullets.push({
        x: p.x + Math.cos(aimAngle) * (p.r + 10),
        y: p.y + Math.sin(aimAngle) * (p.r + 10),
        vx: Math.cos(aimAngle) * orbSpeed,
        vy: Math.sin(aimAngle) * orbSpeed,
        r: orbR,
        damage: orbDmg,
        life: 1.1,
        trail: [],
        pierce: 0 + extraPierce,
        bounces: p.bounces || 0,
        hits: [],
        hitMask0: 0,
        hitMask1: 0,
        hitMask2: 0,
        hitMask3: 0,
        ambush: (p.dashAmbushTimer || 0) > 0,
        knockback: 18,
        isColossus: true,
        isColossusOrb: true,
        colorTrail: orbTrail,
        colorCore: orbCore,
        isVulcan: isVulcan,
        isPlasmaMeltdown: isPlasma
      });

      p.cooldown = shotCooldown(p, 0.38 * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1) * (isVulcan ? 0.7 : 1));
      p.recoil = 0.75;
      var recoilPushOrb = (p.recoilMult || 1);
      p.x -= Math.cos(p.aim) * 2.5 * recoilPushOrb;
      p.y -= Math.sin(p.aim) * 2.5 * recoilPushOrb;
      p.x = clamp(p.x, p.r, boundW - p.r);
      p.y = clamp(p.y, p.r, boundH - p.r);
      applyWeaponRecoil(p, 180, 12.0);

      ejectCasing(p);
      AudioFX.shoot('breacher');
      spawnParticles(p.x + Math.cos(aimAngle) * 20, p.y + Math.sin(aimAngle) * 20, isPlasma ? '#ff4d2e' : (isVulcan ? '#ff4500' : '#38bdf8'), 6, 110, 2);
      rt.state.shake = Math.max(rt.state.shake, 3.0);
      addCameraTrauma(0.08);
    }

    p.chargeTime = 0;
    p.isCharging = false;
  },
  bulletProfile: {
    damageMult: 6.0,
    speed: 1550,
    pierce: 99,
    knockback: 45,
    life: 1.4
  },
  audio: {
    shoot: 'vanguard'
  },
  renderGun: function (ctx, p, kick, flashing, helpers) {
    var r = p.r;
    var gunDark = flashing ? '#ffffff' : '#10171d';
    var railSteel = flashing ? '#ffffff' : '#1e303d';
    var outline = (helpers && helpers.outline) || defaultOutline;
    var drawMuzzle = helpers && helpers.drawMuzzle;
    var drawGlow = helpers && helpers.drawGlow;
    var PALETTE = helpers && helpers.PALETTE;
    var keyGlowsOnly = (helpers && helpers.keyGlowsOnly) ? helpers.keyGlowsOnly : function () { return false; };

    var chargeNeed = (typeof p.chargeNeed === 'number' && p.chargeNeed > 0) ? p.chargeNeed : 0.85;
    var charge = clamp((p.chargeTime || 0) / chargeNeed, 0, 1);

    var cx = r * 0.1 - kick;
    var clen = r + 28;

    // Heavy breech chassis
    ctx.fillStyle = gunDark;
    ctx.beginPath();
    ctx.rect(cx - 5, -7.5, 10, 15);
    ctx.fill();
    outline(ctx, 1.4);

    // Deploying heat fins: spread out based on charge
    var finSpread = charge * 5.5;
    ctx.fillStyle = flashing ? '#ffffff' : '#00f3ff';
    ctx.strokeStyle = '#051b24';
    ctx.lineWidth = 1.0;
    // Top radiator fin
    ctx.beginPath();
    ctx.moveTo(cx + 4, -5.5);
    ctx.lineTo(cx + clen * 0.45, -7.5 - finSpread);
    ctx.lineTo(cx + clen * 0.65, -7.5 - finSpread);
    ctx.lineTo(cx + clen * 0.75, -5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bottom radiator fin
    ctx.beginPath();
    ctx.moveTo(cx + 4, 5.5);
    ctx.lineTo(cx + clen * 0.45, 7.5 + finSpread);
    ctx.lineTo(cx + clen * 0.65, 7.5 + finSpread);
    ctx.lineTo(cx + clen * 0.75, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dual-rail elongated barrel
    // Top rail
    ctx.fillStyle = railSteel;
    ctx.fillRect(cx, -5.2, clen, 3.5);
    ctx.strokeStyle = '#051017';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx, -5.2, clen, 3.5);

    // Bottom rail
    ctx.fillStyle = railSteel;
    ctx.fillRect(cx, 1.7, clen, 3.5);
    ctx.strokeStyle = '#051017';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx, 1.7, clen, 3.5);

    // Inner plasma channel with energy core line
    var energyColor = charge > 0.8 ? '#ffffff' : (charge > 0.3 ? '#00f3ff' : '#145366');
    ctx.strokeStyle = energyColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx + 2, 0);
    ctx.lineTo(cx + clen - 2, 0);
    ctx.stroke();

    // Capacitive power nodes along the dual rail
    var seg;
    for (seg = 0; seg < 4; seg += 1) {
      var on = p.isCharging && charge >= (seg + 1) / 4;
      ctx.fillStyle = on ? '#00f3ff' : (flashing ? '#ffffff' : '#0d222b');
      ctx.fillRect(cx + 6 + seg * ((clen - 14) / 4), -5.8, 4, 11.6);
      ctx.strokeStyle = on ? '#e0fcff' : '#061318';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 6 + seg * ((clen - 14) / 4), -5.8, 4, 11.6);
    }

    if (p.isCharging && charge > 0.05 && !keyGlowsOnly() && drawGlow && PALETTE) {
      drawGlow(ctx, cx + clen, 0, 12 + charge * 16, PALETTE.emissive.tech, 0.5 + charge * 0.5);
    }
    if (drawMuzzle && (p.recoil || 0) > 0.05) {
      drawMuzzle(ctx, 'vanguard', cx + clen + 4, 0, p.recoil);
    }
  }
});
