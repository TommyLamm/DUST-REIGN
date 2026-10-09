import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { addDecal, spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2 } from '../../core/utils.js';
import { enemyProfile } from '../../data/enemies.js';
import { triggerReactiveArmor } from '../abilities.js';
import { damageEnemy, damagePlayer, killEnemy } from '../combat.js';
import { dropBossShard } from '../drops.js';
import { clearShieldsOwnedBy, takeDeathEvents } from './enemy-defense.js';
import { pushEnemyBullet, scaledShot } from './enemy-bullets.js';

function dmgScale() {
  var recipe = rt.state && rt.state.recipe;
  var s = recipe && typeof recipe.dmgScale === 'number' ? recipe.dmgScale : 1;
  return s > 0 ? s : 1;
}

function bounds(frame) {
  return {
    w: frame.boundW || 960,
    h: frame.boundH || 640
  };
}

export function blastAt(x, y, radius, playerDmg, enemyDmg, tint) {
  var p = rt.state && rt.state.player;
  var list = rt.state.enemies;
  var i;
  if (playerDmg > 0 && p && Math.hypot(p.x - x, p.y - y) <= radius + p.r) {
    var hit = damagePlayer(playerDmg, 'zone');
    if (hit > 0) {
      p.invulnerable = 0.2;
      AudioFX.hurt();
      triggerHaptic([30]);
      rt.state.shake = Math.max(rt.state.shake, 7);
      rt.state.hurtFlash = 0.35;
      spawnParticles(p.x, p.y, '#df6b4f', 8, 120, 2.5);
      if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(x, y);
    }
  }
  if (enemyDmg > 0 && list) {
    for (i = list.length - 1; i >= 0; i -= 1) {
      var foe = list[i];
      if (!foe || foe.hp <= 0) continue;
      if (dist2(foe.x, foe.y, x, y) > (radius + foe.r) * (radius + foe.r)) continue;
      damageEnemy(foe, enemyDmg, { source: 'zone', x: x, y: y });
    }
  }
  if (!rt.state.shockRings) rt.state.shockRings = [];
  rt.state.shockRings.push({
    x: x,
    y: y,
    r: 8,
    maxR: radius,
    life: 0.32,
    maxLife: 0.32,
    color: tint || '#d6e36a'
  });
  spawnParticles(x, y, tint || '#d6e36a', 14, 160, 3);
  rt.state.shake = Math.max(rt.state.shake || 0, 6);
  pushFxEvent('burst', x, y, { preset: 'explosionLarge', tint: tint || '#d6e36a', scale: radius > 90 ? 0.85 : 0.55 });
}

function applyDeathEvent(ev) {
  if (!ev) return;
  if (ev.kind === 'warden' && ev.ref) clearShieldsOwnedBy(ev.ref);
  if (ev.kind === 'scurrier') {
    if (ev.cause === 'dash' || !ev.arming) return;
    blastAt(ev.x, ev.y, 70, 0, 60, '#e07a3d');
    return;
  }
  if (ev.kind === 'mine' && ev.ref && !ev.ref.detonated) {
    ev.ref.detonated = true;
    var mineDmg = scaledShot(25, 0, true).damage;
    blastAt(ev.x, ev.y, 80, mineDmg, 40, '#e0a84e');
    return;
  }
  if (ev.affix === 'volatile' || ev.affix2 === 'volatile') {
    if (!rt.state.pendingBlasts) rt.state.pendingBlasts = [];
    rt.state.pendingBlasts.push({
      x: ev.x,
      y: ev.y,
      r: 110,
      timer: 0.8,
      maxTimer: 0.8,
      playerDmg: Math.round(30 * dmgScale()),
      enemyDmg: 60,
      tint: '#e8b94e'
    });
  }
  if (ev.affix === 'splitter' || ev.affix2 === 'splitter') spawnSplit(ev);
  if (ev.kind === 'dreadnought') grantBossLoot(ev, 4);
  if (ev.kind === 'sovereign') grantBossLoot(ev, 5);
}

function spawnSplit(ev) {
  if (!rt.state.enemies) return;
  var hp = Math.max(1, Math.round((ev.maxHp || 40) * 0.4));
  var i;
  for (i = 0; i < 2; i += 1) {
    var side = i === 0 ? -1 : 1;
    rt.state.enemies.push({
      kind: 'elite',
      x: ev.x + side * 18,
      y: ev.y + side * 6,
      r: 13,
      hp: hp,
      maxHp: hp,
      speed: ev.speed > 0 ? ev.speed * 0.85 : 48,
      damage: Math.max(8, Math.round((ev.damage || 16) * 0.7)),
      color: ev.color || '#75d1b0',
      score: 0,
      xp: 10,
      repairChance: 0,
      noDrop: true,
      splitterChild: true,
      touchCooldown: 0,
      phase: rng('combat') * TAU,
      shootCd: 2.4,
      ringTriggered: true,
      affix: null,
      shieldAngle: 0,
      shieldBrokenTimer: 0,
      commandTimer: 8,
      blinkTimer: 8,
      blinkTelegraph: false
    });
  }
  spawnParticles(ev.x, ev.y, '#75d1b0', 10, 120, 2);
}

function grantBossLoot(ev, scrapCount) {
  if (!rt.state.orbs) rt.state.orbs = [];
  var i;
  rt.state.orbs.push({
    kind: 'overdrive', x: ev.x, y: ev.y,
    vx: (rng('loot') - 0.5) * 90, vy: (rng('loot') - 0.5) * 90,
    r: 11, value: 0, life: 25
  });
  rt.state.orbs.push({
    kind: 'repair', x: ev.x, y: ev.y,
    vx: (rng('loot') - 0.5) * 80, vy: (rng('loot') - 0.5) * 80,
    r: 10, value: 0, life: 25
  });
  rt.state.orbs.push({
    kind: 'repair', x: ev.x + 12, y: ev.y,
    vx: (rng('loot') - 0.5) * 80, vy: (rng('loot') - 0.5) * 80,
    r: 10, value: 0, life: 25
  });
  for (i = 0; i < scrapCount; i += 1) {
    rt.state.orbs.push({
      kind: 'scrap',
      x: ev.x + (rng('loot') - 0.5) * 36,
      y: ev.y + (rng('loot') - 0.5) * 36,
      vx: (rng('loot') - 0.5) * 110,
      vy: (rng('loot') - 0.5) * 110,
      r: 12,
      value: 60,
      life: 35
    });
  }
  pushFxEvent('burst', ev.x, ev.y, { preset: 'deathTitan', tint: '#e69535', scale: 0.72 });
  dropBossShard(ev.x, ev.y);
}

export function resolveDeathEvents() {
  var guard = 0;
  while (guard < 8) {
    var events = takeDeathEvents();
    if (!events.length) return;
    var i;
    for (i = 0; i < events.length; i += 1) applyDeathEvent(events[i]);
    guard += 1;
  }
}

function stepAcidPools(dt, frame) {
  var pools = rt.state.acidPools;
  if (!pools) return;
  var p = frame.p;
  var slowed = false;
  var i;
  for (i = pools.length - 1; i >= 0; i -= 1) {
    var pool = pools[i];
    pool.timer -= dt;
    if (pool.timer <= 0) {
      pools.splice(i, 1);
      continue;
    }
    if (!p) continue;
    var inside = Math.hypot(p.x - pool.x, p.y - pool.y) <= pool.r + p.r;
    if (!inside) {
      pool.tick = 0;
      continue;
    }
    slowed = true;
    pool.tick = (pool.tick || 0) + dt;
    if (pool.tick >= 0.5) {
      pool.tick -= 0.5;
      var hit = damagePlayer(6, 'acid');
      if (hit > 0) {
        p.invulnerable = 0.12;
        AudioFX.hurt();
        triggerHaptic([12]);
        rt.state.hurtFlash = Math.max(rt.state.hurtFlash || 0, 0.2);
      }
    }
  }
  if (slowed && p) {
    p.acidSlow = 0.16;
    p.x -= (p.vx || 0) * dt * 0.25;
    p.y -= (p.vy || 0) * dt * 0.25;
    var box = bounds(frame);
    p.x = clamp(p.x, p.r, box.w - p.r);
    p.y = clamp(p.y, p.r, box.h - p.r);
  } else if (p && p.acidSlow > 0) {
    p.acidSlow = Math.max(0, p.acidSlow - dt);
  }
}

function stepPendingBlasts(dt) {
  var list = rt.state.pendingBlasts;
  if (!list) return;
  var i;
  for (i = list.length - 1; i >= 0; i -= 1) {
    var blast = list[i];
    blast.timer -= dt;
    if (blast.timer > 0) continue;
    blastAt(blast.x, blast.y, blast.r, blast.playerDmg, blast.enemyDmg, blast.tint);
    list.splice(i, 1);
  }
}

function stepSand(dt) {
  var marks = rt.state.sandMarks;
  if (!marks) return;
  var i;
  for (i = marks.length - 1; i >= 0; i -= 1) {
    marks[i].life -= dt;
    if (marks[i].life <= 0) marks.splice(i, 1);
  }
}

export function stepEnemyHazards(dt, frame) {
  stepAcidPools(dt, frame);
  stepPendingBlasts(dt);
  stepSand(dt);
  resolveDeathEvents();
}

export function sweepDefeated() {
  var list = rt.state.enemies;
  if (!list) return;
  var i;
  for (i = list.length - 1; i >= 0; i -= 1) {
    var e = list[i];
    if (!e || e.hp > 0) continue;
    killEnemy(e, e.deathCause || 'other');
  }
}

function leaveSand(e) {
  if (!rt.state.sandMarks) rt.state.sandMarks = [];
  e.sandAcc = (e.sandAcc || 0) + 1;
  if (e.sandAcc < 4) return;
  e.sandAcc = 0;
  var marks = rt.state.sandMarks;
  marks.push({ x: e.x, y: e.y, r: e.r * 0.7, life: 1.6, maxLife: 1.6 });
  if (marks.length > 70) marks.splice(0, marks.length - 70);
}

function nearestAllies(e, limit) {
  var list = rt.state.enemies;
  var found = [];
  if (!list) return found;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var other = list[i];
    if (!other || other === e || other.isBoss || other.hp <= 0) continue;
    if (other.kind === 'mine' || other.kind === 'stormTower' || other.kind === 'warden') continue;
    if (other.burrowed) continue;
    found.push(other);
  }
  found.sort(function (a, b) {
    return dist2(e.x, e.y, a.x, a.y) - dist2(e.x, e.y, b.x, b.y);
  });
  if (found.length > limit) found.length = limit;
  return found;
}

function spitAcid(e, frame) {
  var p = frame.p;
  var box = bounds(frame);
  var tx = clamp(p.x + (p.vx || 0) * 0.6, 40, box.w - 40);
  var ty = clamp(p.y + (p.vy || 0) * 0.6, 40, box.h - 40);
  var dmg = Math.round(16 * dmgScale());
  pushEnemyBullet({
    type: 'acid',
    noGraze: true,
    x: e.x,
    y: e.y,
    originX: e.x,
    originY: e.y,
    targetX: tx,
    targetY: ty,
    age: 0,
    flight: 0.7,
    arc: 42,
    vx: 0,
    vy: 0,
    r: 7,
    damage: dmg,
    life: 1.2,
    color: '#c6e35a',
    glowColor: '#d6ff6a'
  });
  spawnParticles(e.x, e.y, '#c6e35a', 5, 70, 2);
}

function emergeBurrower(e, frame, fireSpikes) {
  var p = frame.p;
  e.burrowed = false;
  e.untargetable = false;
  e.state = 'surface';
  e.surfaceT = 3;
  e.warnT = 0;
  if (!fireSpikes) return;
  var hitR = 50 + (p ? p.r : 0);
  if (p && Math.hypot(p.x - e.x, p.y - e.y) <= hitR) {
    var dmg = Math.round(28 * dmgScale());
    var hit = damagePlayer(dmg, 'contact');
    if (hit > 0) {
      p.invulnerable = 0.35;
      AudioFX.hurt();
      triggerHaptic([40]);
      rt.state.shake = Math.max(rt.state.shake, 8);
      rt.state.hurtFlash = 0.4;
    }
  }
  var i;
  for (i = 0; i < 8; i += 1) {
    var a = (i / 8) * TAU;
    var shot = scaledShot(9, 240, false);
    pushEnemyBullet({
      type: 'spike',
      x: e.x + Math.cos(a) * (e.r + 4),
      y: e.y + Math.sin(a) * (e.r + 4),
      vx: Math.cos(a) * shot.speed,
      vy: Math.sin(a) * shot.speed,
      r: 3.2,
      damage: shot.damage,
      life: 1.35,
      color: '#e6d2a8',
      glowColor: '#f0e2c4'
    });
  }
  pushFxEvent('burst', e.x, e.y, { preset: 'mortar', tint: '#c4a574', scale: 0.65 });
  spawnParticles(e.x, e.y, '#c4a574', 16, 150, 3);
  rt.state.shake = Math.max(rt.state.shake, 7);
  e.touchCooldown = 0.55;
}

export function stepNewEnemy(e, dt, frame, empFrozen) {
  var p = frame.p;
  var dx = p.x - e.x;
  var dy = p.y - e.y;
  var dist = Math.hypot(dx, dy) || 1;

  if (e.kind === 'mine') {
    if (!e.arming && dist <= 80) {
      e.arming = true;
      e.armTimer = 0.4;
    }
    if (e.arming) {
      e.armTimer -= dt;
      if (e.armTimer <= 0 && !e.detonated) {
        e.detonated = true;
        e.hp = 0;
        e.deathCause = 'other';
        blastAt(e.x, e.y, 80, scaledShot(25, 0, true).damage, 40, '#e0a84e');
      }
    }
    return { dx: dx, dy: dy, d: dist, speed: 0 };
  }

  if (e.kind === 'stormTower') {
    return { dx: 0, dy: 1, d: 1, speed: 0 };
  }

  if (e.kind === 'spitter') {
    var speed = e.speed;
    var aimX = dx;
    var aimY = dy;
    if (dist > 300) {
      speed = e.speed;
    } else if (dist < 220) {
      speed = e.speed * 0.8;
      aimX = -dx;
      aimY = -dy;
    } else {
      speed = e.speed * 0.35;
      aimX = -dy;
      aimY = dx;
    }
    if (empFrozen) speed *= 0.3;
    if (!empFrozen) {
      e.spitCd = (e.spitCd != null ? e.spitCd : 1.6) - dt;
      if (e.spitCd <= 0) {
        e.spitCd = 2.6;
        spitAcid(e, frame);
      }
    }
    var aimD = Math.hypot(aimX, aimY) || 1;
    return { dx: aimX, dy: aimY, d: aimD, speed: speed };
  }

  if (e.kind === 'scurrier') {
    var scurSpeed = e.speed;
    if (empFrozen) scurSpeed *= 0.3;
    if (!e.arming && dist <= 70 && !empFrozen) {
      e.arming = true;
      e.armTimer = 0.45;
    }
    if (e.arming) {
      if (empFrozen) {
        return { dx: dx, dy: dy, d: dist, speed: 0 };
      }
      e.armTimer -= dt;
      if (e.armTimer <= 0) {
        e.detonated = true;
        e.arming = false;
        e.hp = 0;
        e.deathCause = 'other';
        blastAt(e.x, e.y, 70, Math.round(22 * dmgScale()), 0, '#e07a3d');
        return { dx: dx, dy: dy, d: dist, speed: 0 };
      }
      return { dx: dx, dy: dy, d: dist, speed: 0 };
    }
    return { dx: dx, dy: dy, d: dist, speed: scurSpeed };
  }

  if (e.kind === 'warden') {
    var pack = nearestAllies(e, 3);
    var tx = p.x;
    var ty = p.y;
    if (pack.length) {
      var cx = 0;
      var cy = 0;
      var pi;
      for (pi = 0; pi < pack.length; pi += 1) {
        cx += pack[pi].x;
        cy += pack[pi].y;
      }
      cx /= pack.length;
      cy /= pack.length;
      var away = Math.atan2(cy - p.y, cx - p.x);
      var hold = Math.max(260, Math.hypot(cx - p.x, cy - p.y) + 70);
      tx = p.x + Math.cos(away) * hold;
      ty = p.y + Math.sin(away) * hold;
    } else {
      var solo = Math.atan2(e.y - p.y, e.x - p.x);
      tx = p.x + Math.cos(solo) * 280;
      ty = p.y + Math.sin(solo) * 280;
    }
    var box = bounds(frame);
    tx = clamp(tx, e.r + 8, box.w - e.r - 8);
    ty = clamp(ty, e.r + 8, box.h - e.r - 8);
    var wx = tx - e.x;
    var wy = ty - e.y;
    var wd = Math.hypot(wx, wy) || 1;
    var wSpeed = wd < 12 ? 0 : e.speed;
    if (empFrozen) wSpeed *= 0.3;
    if (!empFrozen) {
      e.shieldCd = (e.shieldCd != null ? e.shieldCd : 2) - dt;
      if (e.shieldCd <= 0) {
        e.shieldCd = 4;
        var near = [];
        var list = rt.state.enemies;
        var si;
        for (si = 0; si < list.length; si += 1) {
          var ally = list[si];
          if (!ally || ally === e || ally.isBoss || ally.hp <= 0) continue;
          if (ally.kind === 'mine' || ally.kind === 'stormTower') continue;
          if (ally.burrowed) continue;
          if (dist2(e.x, e.y, ally.x, ally.y) > 180 * 180) continue;
          near.push(ally);
        }
        near.sort(function (a, b) {
          return dist2(e.x, e.y, a.x, a.y) - dist2(e.x, e.y, b.x, b.y);
        });
        var give = Math.min(3, near.length);
        var gi;
        for (gi = 0; gi < give; gi += 1) {
          var target = near[gi];
          target.shieldHp = Math.max(target.shieldHp || 0, (target.maxHp || target.hp) * 0.4);
          target.shieldTimer = 5;
          target.shieldOwner = e;
          target.knockbackImmune = true;
        }
        if (give > 0) spawnParticles(e.x, e.y, '#9fd0ea', 8, 90, 2);
      }
    }
    return { dx: wx, dy: wy, d: wd, speed: wSpeed };
  }

  if (e.kind === 'burrower') {
    if (e.forceEmerge || (e.burrowed && e.empTimer > 0)) {
      e.forceEmerge = false;
      e.empTimer = Math.max(e.empTimer || 0, 2);
      emergeBurrower(e, frame, false);
      return { dx: dx, dy: dy, d: dist, speed: 0 };
    }
    if (!e.state) {
      e.state = 'burrow';
      e.burrowed = true;
      e.untargetable = true;
      e.burrowT = 2.5;
    }
    if (e.state === 'burrow') {
      e.burrowed = true;
      e.untargetable = true;
      if (!empFrozen) {
        e.burrowT -= dt;
        leaveSand(e);
      }
      if (e.burrowT <= 0) {
        e.state = 'warn';
        e.warnT = 0.8;
        e.warnX = p.x;
        e.warnY = p.y;
      }
      var burrowSpeed = empFrozen ? 0 : 140;
      return { dx: dx, dy: dy, d: dist, speed: burrowSpeed };
    }
    if (e.state === 'warn') {
      e.burrowed = true;
      e.untargetable = true;
      var mx = (e.warnX || p.x) - e.x;
      var my = (e.warnY || p.y) - e.y;
      var md = Math.hypot(mx, my) || 1;
      if (!empFrozen) e.warnT -= dt;
      if (e.warnT <= 0) {
        e.x = e.warnX;
        e.y = e.warnY;
        emergeBurrower(e, frame, true);
        return { dx: dx, dy: dy, d: dist, speed: 0 };
      }
      return { dx: mx, dy: my, d: md, speed: empFrozen ? 0 : 140 };
    }
    e.burrowed = false;
    e.untargetable = false;
    if (!empFrozen) e.surfaceT -= dt;
    if (e.surfaceT <= 0) {
      e.state = 'burrow';
      e.burrowed = true;
      e.untargetable = true;
      e.burrowT = 2.5;
      return { dx: dx, dy: dy, d: dist, speed: 0 };
    }
    var surfaceSpeed = e.speed;
    if (empFrozen) surfaceSpeed *= 0.3;
    return { dx: dx, dy: dy, d: dist, speed: surfaceSpeed };
  }

  return null;
}

export function primeEnemy(kind, e) {
  if (kind === 'spitter') e.spitCd = 0.8 + ((e.phase || 0) % 1) * 1.6;
  if (kind === 'scurrier') {
    e.arming = false;
    e.armTimer = 0;
  }
  if (kind === 'warden') e.shieldCd = 1.5 + ((e.phase || 0) % 1) * 2;
  if (kind === 'burrower') {
    e.state = 'burrow';
    e.burrowed = true;
    e.untargetable = true;
    e.burrowT = 2.5;
    var stats = enemyProfile('burrower', (rt.state && rt.state.wave) || 1, rt.state && rt.state.recipe);
    e.speed = stats.speed;
  }
}
