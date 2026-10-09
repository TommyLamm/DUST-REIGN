import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp } from '../../core/utils.js';
import { enemyProfile } from '../../data/enemies.js';
import { getHeatModifiers } from '../../data/heat.js';
import { damagePlayer } from '../combat.js';
import { logEvent } from '../../ui/hud.js';
import { refreshSovereignShield } from './enemy-defense.js';
import { pushEnemyBullet, scaledShot } from './enemy-bullets.js';

function dmgScale() {
  var recipe = rt.state && rt.state.recipe;
  var s = recipe && typeof recipe.dmgScale === 'number' ? recipe.dmgScale : 1;
  return s > 0 ? s : 1;
}

function phaseShift() {
  var recipe = rt.state && rt.state.recipe;
  var n = recipe && recipe.bossPhaseEarly;
  if (!(n > 0)) {
    var mods = getHeatModifiers(rt.state && rt.state.heat);
    n = mods && mods.bossPhaseEarly;
  }
  if (!(n > 0)) return 0;
  return n > 0.4 ? 0.4 : n;
}

function dreadPhase(ratio) {
  var early = phaseShift();
  if (ratio > 0.6 + early) return 1;
  if (ratio > 0.25 + early) return 2;
  return 3;
}

function sovereignPhase(ratio) {
  var early = phaseShift();
  if (ratio > 0.66 + early) return 1;
  if (ratio > 0.33 + early) return 2;
  return 3;
}

function boxOf(frame) {
  return { w: frame.boundW || 960, h: frame.boundH || 640 };
}

function aimAtPlayer(e, p) {
  e.aim = Math.atan2(p.y - e.y, p.x - e.x);
}

function fireFlak(e, angle, speed, damage) {
  var shot = scaledShot(damage, speed, true);
  pushEnemyBullet({
    type: 'flak',
    fromBoss: true,
    x: e.x + Math.cos(angle) * (e.r + 6),
    y: e.y + Math.sin(angle) * (e.r + 6),
    vx: Math.cos(angle) * shot.speed,
    vy: Math.sin(angle) * shot.speed,
    r: 5.2,
    damage: shot.damage,
    life: 5.5,
    glow: true,
    color: '#ff8a3d',
    glowColor: '#ff5a2a'
  });
}

function fireFan(e, p) {
  var base = Math.atan2(p.y - e.y, p.x - e.x);
  var offsets = [-0.42, -0.21, 0, 0.21, 0.42];
  var i;
  for (i = 0; i < offsets.length; i += 1) fireFlak(e, base + offsets[i], 165, 14);
  AudioFX.shoot();
}

function fireRing(e) {
  var i;
  var spin = e.ringAngle || 0;
  e.ringAngle = spin + 0.26;
  for (i = 0; i < 12; i += 1) fireFlak(e, spin + (i / 12) * TAU, 150, 14);
  spawnParticles(e.x, e.y, '#ff8a3d', 12, 140, 3);
  AudioFX.shoot();
}

function dropLava(e) {
  if (!rt.state.artilleryTargets) rt.state.artilleryTargets = [];
  rt.state.artilleryTargets.push({
    x: e.x,
    y: e.y,
    r: 30,
    timer: 2,
    maxTimer: 2,
    wave: rt.state.wave || 1,
    state: 'molten',
    damageTickTimer: 0
  });
}

function makeMine(x, y) {
  var stats = enemyProfile('mine', rt.state.wave || 1, rt.state.recipe);
  return {
    kind: 'mine',
    x: x,
    y: y,
    r: stats.r,
    hp: stats.hp,
    maxHp: stats.maxHp,
    speed: 0,
    damage: 0,
    color: stats.color,
    score: 0,
    xp: 0,
    noDrop: true,
    touchCooldown: 0,
    phase: rng('combat') * TAU,
    arming: false,
    armTimer: 0
  };
}

function dropMines(e) {
  var back = (e.aim || 0) + Math.PI;
  var i;
  for (i = 0; i < 2; i += 1) {
    var side = i === 0 ? -0.7 : 0.7;
    var a = back + side;
    rt.state.enemies.push(makeMine(
      e.x + Math.cos(a) * (e.r + 18),
      e.y + Math.sin(a) * (e.r + 18)
    ));
  }
}

function makeScurrier(x, y) {
  var stats = enemyProfile('scurrier', rt.state.wave || 1, rt.state.recipe);
  return {
    kind: 'scurrier',
    x: x,
    y: y,
    r: stats.r,
    hp: stats.hp,
    maxHp: stats.maxHp,
    speed: stats.speed,
    damage: stats.damage,
    color: stats.color,
    score: stats.score,
    xp: stats.xp,
    repairChance: 0,
    touchCooldown: 0,
    phase: rng('spawn') * TAU,
    arming: false,
    armTimer: 0
  };
}

function summonScurriers(e, count, frame) {
  var box = boxOf(frame);
  var i;
  for (i = 0; i < count; i += 1) {
    var a = rng('combat') * TAU;
    var dist = e.r + 28 + rng('combat') * 20;
    rt.state.enemies.push(makeScurrier(
      clamp(e.x + Math.cos(a) * dist, 20, box.w - 20),
      clamp(e.y + Math.sin(a) * dist, 20, box.h - 20)
    ));
  }
  spawnParticles(e.x, e.y, '#e07a3d', 10, 120, 2);
  AudioFX.levelUp();
}

function startTelegraph(e, p, seconds) {
  aimAtPlayer(e, p);
  e.mode = 'telegraph';
  e.telegraphT = seconds;
  e.telegraphMax = seconds;
}

function beginCharge(e) {
  e.mode = 'charge';
  e.chargeCarry = 0;
  var ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  e.bossPhase = dreadPhase(ratio);
  e.chargeSpeed = e.bossPhase >= 3 ? 624 : 520;
  e.chargeDamage = scaledShot(30, 520, true).damage;
}

function endCharge(e, frame) {
  var ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  e.bossPhase = dreadPhase(ratio);
  if (e.bossPhase >= 2) dropMines(e);
  e.chargesQueued = (e.chargesQueued || 1) - 1;
  if (e.chargesQueued > 0) {
    startTelegraph(e, frame.p, 0.7);
    return;
  }
  e.mode = 'stun';
  e.stunT = 1.2;
  e.empTimer = Math.max(e.empTimer || 0, 1.2);
  fireRing(e);
  rt.state.shake = Math.max(rt.state.shake, 10);
  AudioFX.blast();
}

function stepDreadnought(e, dt, frame, empFrozen) {
  var p = frame.p;
  var box = boxOf(frame);
  var ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  e.bossPhase = dreadPhase(ratio);
  e.bossSubtitle = e.bossPhase >= 3 ? 'OVERDRIVE' : e.bossPhase === 2 ? 'DOUBLE RAM' : 'CHARGE';
  if (!e.mode) {
    e.mode = 'idle';
    e.attackCd = 2.2;
    e.fanCd = 1.5;
    e.summonCd = 8;
  }

  if (e.mode === 'charge') {
    var step = e.chargeSpeed * dt;
    e.x += Math.cos(e.aim) * step;
    e.y += Math.sin(e.aim) * step;
    e.chargeCarry = (e.chargeCarry || 0) + step;
    if (e.chargeCarry >= 42) {
      e.chargeCarry = 0;
      dropLava(e);
    }
    var m = e.r + 2;
    var hitWall = e.x <= m || e.y <= m || e.x >= box.w - m || e.y >= box.h - m;
    e.x = clamp(e.x, m, box.w - m);
    e.y = clamp(e.y, m, box.h - m);
    e.damage = e.chargeDamage;
    if (hitWall) endCharge(e, frame);
    return { handled: true, vx: Math.cos(e.aim) * e.chargeSpeed, vy: Math.sin(e.aim) * e.chargeSpeed };
  }

  e.damage = Math.round(34 * dmgScale());

  if (e.mode === 'telegraph') {
    e.telegraphT -= dt;
    if (e.telegraphT <= 0) beginCharge(e);
    return { dx: 0, dy: 1, d: 1, speed: 0 };
  }

  if (e.mode === 'stun') {
    e.stunT -= dt;
    e.empTimer = Math.max(e.empTimer || 0, e.stunT > 0 ? e.stunT : 0);
    if (e.stunT <= 0) {
      e.mode = 'idle';
      e.attackCd = 4;
      e.fanCd = 1.2;
    }
    return { dx: 0, dy: 1, d: 1, speed: 0 };
  }

  if (!empFrozen) {
    if (e.bossPhase === 1) {
      e.fanCd -= dt;
      if (e.fanCd <= 0) {
        e.fanCd = 1.5;
        fireFan(e, p);
      }
    }
    if (e.bossPhase >= 3) {
      e.summonCd -= dt;
      if (e.summonCd <= 0) {
        e.summonCd = 8;
        summonScurriers(e, 4, frame);
      }
    }
    e.attackCd -= dt;
    if (e.attackCd <= 0) {
      e.chargesQueued = e.bossPhase >= 2 ? 2 : 1;
      startTelegraph(e, p, 0.9);
    }
  }
  aimAtPlayer(e, p);
  return null;
}

function spawnTower(e, x, y) {
  var stats = enemyProfile('stormTower', rt.state.wave || 1, { hpScale: 1, dmgScale: 1 });
  var tower = {
    kind: 'stormTower',
    x: x,
    y: y,
    r: 20,
    hp: stats.hp,
    maxHp: stats.maxHp,
    speed: 0,
    damage: 0,
    color: stats.color,
    score: stats.score,
    xp: stats.xp,
    noDrop: true,
    touchCooldown: 0,
    phase: 0,
    owner: e
  };
  rt.state.enemies.push(tower);
  return tower;
}

function summonTowers(e, frame) {
  var box = boxOf(frame);
  e.towerRefs = [
    spawnTower(e, box.w * 0.28, box.h * 0.32),
    spawnTower(e, box.w * 0.72, box.h * 0.68)
  ];
  refreshSovereignShield(e);
  spawnParticles(e.x, e.y, '#9ec0ea', 16, 140, 3);
  AudioFX.levelUp();
}

function windPower(phase) {
  if (phase >= 3) return 60;
  if (phase >= 2) return 49;
  return 38;
}

function queueBolts(frame, gap) {
  if (!rt.state.lightningStrikes) rt.state.lightningStrikes = [];
  var box = boxOf(frame);
  var dmg = scaledShot(26, 0, true).damage;
  var i;
  for (i = 0; i < 3; i += 1) {
    var horizontal = rng('combat') < 0.5;
    var along = 36 + rng('combat') * ((horizontal ? box.h : box.w) - 72);
    if (horizontal) {
      rt.state.lightningStrikes.push({
        x1: 0, y1: along, x2: box.w, y2: along,
        timer: 0.9, maxTimer: 0.9, width: 26, warning: true, damage: dmg, gap: gap
      });
    } else {
      rt.state.lightningStrikes.push({
        x1: along, y1: 0, x2: along, y2: box.h,
        timer: 0.9, maxTimer: 0.9, width: 26, warning: true, damage: dmg, gap: gap
      });
    }
  }
}

function fireSpiral(e) {
  var shot = scaledShot(14, 120, true);
  var spin = e.spiralAngle || 0;
  e.spiralAngle = spin + 0.22;
  var i;
  for (i = 0; i < 16; i += 1) {
    var a = spin + (i / 16) * TAU;
    pushEnemyBullet({
      type: 'spiral',
      fromBoss: true,
      x: e.x + Math.cos(a) * (e.r + 8),
      y: e.y + Math.sin(a) * (e.r + 8),
      vx: Math.cos(a) * shot.speed,
      vy: Math.sin(a) * shot.speed,
      r: 4.2,
      damage: shot.damage,
      life: 6,
      glow: true,
      color: '#9ec0ea',
      glowColor: '#d5e8ff'
    });
  }
  spawnParticles(e.x, e.y, '#9ec0ea', 8, 90, 2);
  AudioFX.shoot();
}

function stepSovereign(e, dt, frame, empFrozen) {
  var p = frame.p;
  var box = boxOf(frame);
  var ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  var phase = sovereignPhase(ratio);
  e.bossPhase = phase;
  e.bossSubtitle = phase >= 3 ? 'EYE' : phase === 2 ? 'TWIN SPIRES' : 'GALE';
  if (e.windAngle == null) e.windAngle = rng('combat') * TAU;
  if (e.windCd == null) e.windCd = 6;
  if (e.boltCd == null) e.boltCd = 1.6;
  if (e.spiralCd == null) e.spiralCd = 2.2;
  if (phase >= 2 && !e.towersBorn) {
    e.towersBorn = true;
    summonTowers(e, frame);
  }
  if (phase >= 2 && e.towersBorn) {
    var shielded = refreshSovereignShield(e);
    if (e.wasShielded && !shielded && e.reshieldTimer == null && !e.resummoned) e.reshieldTimer = 20;
    e.wasShielded = shielded;
    if (e.reshieldTimer != null) {
      e.reshieldTimer -= dt;
      if (e.reshieldTimer <= 0) {
        e.reshieldTimer = null;
        if (!shielded && !refreshSovereignShield(e) && !e.resummoned) {
          var alive = 0;
          var refs = e.towerRefs || [];
          var ti;
          for (ti = 0; ti < refs.length; ti += 1) {
            if (refs[ti] && refs[ti].hp > 0 && rt.state.enemies.indexOf(refs[ti]) !== -1) alive += 1;
          }
          if (alive === 0) {
            e.resummoned = true;
            summonTowers(e, frame);
          }
        }
      }
    }
  } else {
    e.shielded = false;
  }

  if (phase >= 3 && e.eyeWarn == null) e.eyeWarn = 2;
  if (phase >= 3) {
    e.eyeX = box.w * 0.5;
    e.eyeY = box.h * 0.5;
  }
  if (e.eyeWarn != null && e.eyeWarn > 0) {
    e.eyeWarn -= dt;
    e.eyeRadius = Math.hypot(box.w, box.h) * 0.5;
  }
  if (phase >= 3 && e.eyeWarn <= 0) {
    var finalR = Math.min(box.w, box.h) * 0.6;
    var startR = Math.hypot(box.w, box.h) * 0.5;
    e.eyeShrink = (e.eyeShrink || 0) + dt;
    var u = e.eyeShrink / 6;
    if (u > 1) u = 1;
    e.eyeRadius = startR + (finalR - startR) * u;
    e.eyeX = box.w * 0.5;
    e.eyeY = box.h * 0.5;
  }

  e.windCd -= dt;
  if (e.windCd <= 1 && e.windNext == null) {
    e.windNext = rng('combat') * TAU;
    rt.state.banner = Math.max(rt.state.banner || 0, 1.1);
    rt.state.bannerText = 'WIND SHIFT // INBOUND';
    logEvent('WIND SHIFT // INBOUND');
  }
  if (e.windCd <= 0) {
    e.windAngle = e.windNext != null ? e.windNext : rng('combat') * TAU;
    e.windNext = null;
    e.windCd = 6;
  }
  e.windPower = windPower(phase);

  if (!empFrozen) {
    e.boltCd -= dt;
    if (e.boltCd <= 0) {
      e.boltCd = phase >= 3 ? 2.2 : 3;
      queueBolts(frame, phase >= 3 ? 2.2 : 3);
    }
    if (phase === 1) {
      e.spiralCd -= dt;
      if (e.spiralCd <= 0) {
        e.spiralCd = 4;
        fireSpiral(e);
      }
    }
  }

  if (phase >= 3 && rt.state.spires && rt.state.spires.length) {
    var resonating = false;
    var si;
    for (si = 0; si < rt.state.spires.length; si += 1) {
      if ((rt.state.spires[si].resonanceTimer || 0) > 1) resonating = true;
    }
    if (resonating && !e.spireSeen && (e.spireLock || 0) <= 0) {
      e.empTimer = Math.max(e.empTimer || 0, 2);
      e.spireLock = 10;
      rt.state.shake = Math.max(rt.state.shake, 8);
      logEvent('SOVEREIGN STAGGERED // SPIRE FEEDBACK');
    }
    e.spireSeen = resonating;
    if (e.spireLock > 0) e.spireLock -= dt;
  }

  var orbit = (rt.state.waveTime || 0) * 0.35;
  var tx = box.w * 0.5 + Math.cos(orbit) * 48;
  var ty = box.h * 0.42 + Math.sin(orbit * 0.8) * 28;
  var mx = tx - e.x;
  var my = ty - e.y;
  var md = Math.hypot(mx, my) || 1;
  e.aim = Math.atan2(my, mx);
  var speed = md < 8 ? 0 : e.speed;
  if (empFrozen) speed *= 0.3;
  return { dx: mx, dy: my, d: md, speed: speed };
}

export function stepBoss(e, dt, frame, empFrozen) {
  if (!e || !e.isBoss) return null;
  if (e.kind === 'dreadnought') return stepDreadnought(e, dt, frame, empFrozen);
  if (e.kind === 'sovereign') return stepSovereign(e, dt, frame, empFrozen);
  return null;
}

function pointLineDist(px, py, x1, y1, x2, y2) {
  var vx = x2 - x1;
  var vy = y2 - y1;
  var len = Math.hypot(vx, vy) || 1;
  var t = ((px - x1) * vx + (py - y1) * vy) / (len * len);
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

export function stepBossArena(dt, frame) {
  var list = rt.state.enemies;
  var boss = null;
  var i;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].kind === 'sovereign' && list[i].hp > 0) boss = list[i];
    }
  }
  var p = frame.p;
  if (boss && p && boss.eyeRadius > 0 && boss.eyeWarn <= 0) {
    boss.eyeTick = (boss.eyeTick || 0) + dt;
    var outside = Math.hypot(p.x - boss.eyeX, p.y - boss.eyeY) > boss.eyeRadius + p.r;
    if (outside && boss.eyeTick >= 0.5) {
      boss.eyeTick -= 0.5;
      var eyeHit = 0;
      if (p.invulnerable <= 0) {
        eyeHit = damagePlayer(scaledShot(8, 0, true).damage, 'zone');
      }
      if (eyeHit > 0) {
        p.invulnerable = 0.12;
        rt.state.hurtFlash = Math.max(rt.state.hurtFlash || 0, 0.25);
      }
    }
  }
  var strikes = rt.state.lightningStrikes;
  if (!strikes) return;
  for (i = strikes.length - 1; i >= 0; i -= 1) {
    var bolt = strikes[i];
    bolt.timer -= dt;
    if (bolt.warning && bolt.timer <= 0) {
      bolt.warning = false;
      bolt.struck = true;
      if (p) {
        var dist = pointLineDist(p.x, p.y, bolt.x1, bolt.y1, bolt.x2, bolt.y2);
        if (dist <= bolt.width * 0.5 + p.r && p.invulnerable <= 0) {
          var zap = damagePlayer(bolt.damage || 26, 'zone');
          if (zap > 0) {
            p.invulnerable = 0.28;
            AudioFX.hurt();
            triggerHaptic([35]);
            rt.state.shake = Math.max(rt.state.shake, 8);
            rt.state.hurtFlash = 0.4;
            spawnParticles(p.x, p.y, '#d5e8ff', 8, 120, 2);
          }
        }
      }
      pushFxEvent('burst', (bolt.x1 + bolt.x2) * 0.5, (bolt.y1 + bolt.y2) * 0.5, {
        preset: 'emp', tint: '#d5e8ff', scale: 0.45
      });
      bolt.timer = 0.18;
    } else if (!bolt.warning && bolt.timer <= 0) {
      strikes.splice(i, 1);
    }
  }
}

export function createDreadnought(wave, frameW, frameH) {
  var stats = enemyProfile('dreadnought', wave, rt.state.recipe);
  var hp = stats.hp;
  return {
    kind: 'dreadnought',
    isBoss: true,
    bossName: 'DREADNOUGHT',
    bossSubtitle: 'CHARGE',
    x: frameW * 0.5,
    y: -36,
    r: stats.r,
    hp: hp,
    maxHp: hp,
    speed: stats.speed,
    damage: Math.round(34 * dmgScale()),
    color: stats.color,
    score: stats.score,
    xp: stats.xp,
    repairChance: 1,
    touchCooldown: 0,
    phase: 0,
    aim: Math.PI / 2,
    mode: 'idle',
    attackCd: 2.4,
    fanCd: 1.5,
    summonCd: 8,
    bossPhase: 1,
    empTimer: 0,
    knockbackImmune: true
  };
}

export function createSovereign(wave, frameW, frameH) {
  var stats = enemyProfile('sovereign', wave, rt.state.recipe);
  var hp = stats.hp;
  return {
    kind: 'sovereign',
    isBoss: true,
    bossName: 'STORM SOVEREIGN',
    bossSubtitle: 'GALE',
    x: frameW * 0.5,
    y: frameH * 0.42,
    r: stats.r,
    hp: hp,
    maxHp: hp,
    speed: stats.speed,
    damage: Math.round(30 * dmgScale()),
    color: stats.color,
    score: stats.score,
    xp: stats.xp,
    repairChance: 1,
    touchCooldown: 0,
    phase: 0,
    aim: 0,
    bossPhase: 1,
    empTimer: 0,
    shielded: false,
    knockbackImmune: true,
    towerRefs: null
  };
}
