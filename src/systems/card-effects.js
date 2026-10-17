import { AudioFX } from '../audio/audio-fx.js';
import { pushFxEvent } from '../core/fx-events.js';
import { spawnParticles } from '../core/pools.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { dist2 } from '../core/utils.js';
import { damageEnemy, killEnemy } from './combat.js';
import { isStormFront } from './flow.js';
import { spawnCombatText } from '../render/fx.js';
import { ensureEnemyGrid, getEnemyById, getEnemyBulletById, populateEnemyBulletGrid, queryEnemyBulletGridCallback, queryGridCallback } from '../core/spatial-grid.js';

var hookDepth = 0;

var hookRegistry = {
  onPlayerDamaged: [],
  onKill: [],
  onDash: [],
  onEmp: [],
  onEnemyHit: [],
  onLethal: [],
  onPickup: [],
  onPlayerStep: [],
  onCrit: [],
  onShieldBreak: [],
  onTacticalUsed: []
};

export function registerCardHook(event, callback) {
  if (!hookRegistry[event]) hookRegistry[event] = [];
  hookRegistry[event].push(callback);
  return function unsubscribe() {
    unregisterCardHook(event, callback);
  };
}

export function unregisterCardHook(event, callback) {
  if (!hookRegistry[event]) return;
  var idx = hookRegistry[event].indexOf(callback);
  if (idx !== -1) hookRegistry[event].splice(idx, 1);
}

export function clearCardHooks() {
  for (var k in hookRegistry) {
    hookRegistry[k].length = 0;
  }
}

export function dispatchCardHook(event, arg1, arg2, arg3) {
  var list = hookRegistry[event];
  if (!list || !list.length) return;
  for (var i = 0; i < list.length; i += 1) {
    try {
      list[i](arg1, arg2, arg3);
    } catch (err) {
      // Isolate subscriber errors so gameplay continues uninterrupted
    }
  }
}


function livingEnemies() {
  var list = (rt.state && rt.state.enemies) || [];
  return list.filter(function (enemy) { return enemy && enemy.hp > 0; });
}

function releaseFreeEmp(x, y, radius, stun, damage) {
  if (!rt.state) return;
  var enemies = rt.state.enemies || [];
  var i;
  for (i = enemies.length - 1; i >= 0; i -= 1) {
    var enemy = enemies[i];
    var reach = radius + (enemy.r || 0);
    if (dist2(x, y, enemy.x, enemy.y) > reach * reach) continue;
    damageEnemy(enemy, damage, { source: 'emp', x: x, y: y });
    enemy.empTimer = Math.max(enemy.empTimer || 0, stun);
    if (enemy.hp <= 0) killEnemy(enemy, 'emp');
  }
  if (rt.state.shockRings) {
    rt.state.shockRings.push({
      x: x,
      y: y,
      r: 8,
      maxR: radius,
      life: 0.28,
      maxLife: 0.28,
      color: '#5be7ff'
    });
  }
  pushFxEvent('emp', x, y, { r: radius });
  pushFxEvent('burst', x, y, { preset: 'emp', scale: Math.max(0.35, radius / 140) });
}

export function launchMicroMissiles(player, info) {
  if (!rt.state.bullets) rt.state.bullets = [];
  var originX = info.x;
  var originY = info.y;
  var foes = livingEnemies();
  foes.sort(function (a, b) {
    return dist2(originX, originY, a.x, a.y) - dist2(originX, originY, b.x, b.y);
  });
  var damage = Math.max(1, player.damage * 0.9);
  var i;
  for (i = 0; i < 3; i += 1) {
    var target = foes[i];
    var angle = player.aim || 0;
    if (target) angle = Math.atan2(target.y - originY, target.x - originX);
    else angle += (i - 1) * 0.42;
    var speed = 460;
    rt.state.bullets.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 3,
      damage: damage,
      life: 1.35,
      trail: [],
      pierce: 0,
      bounces: 0,
      hits: [],
      homing: true,
      isMicroMissile: true,
      colorTrail: 'rgba(247, 212, 138, 0.45)',
      colorCore: '#f7d48a'
    });
  }
  pushFxEvent('burst', originX, originY, { preset: 'dashDust', tint: '#f7d48a', scale: 0.8 });
}

function spawnScrapVortex(player) {
  if (!rt.state.scrapVortices) rt.state.scrapVortices = [];
  var angle = player.aim || 0;
  var x = player.x + Math.cos(angle) * 120;
  var y = player.y + Math.sin(angle) * 120;
  rt.state.scrapVortices.push({ x: x, y: y, r: 90, life: 1.5 });
  pushFxEvent('burst', x, y, { preset: 'deathElite', tint: '#b55fe6', scale: 0.45 });
}

function pushRepair(enemy) {
  if (!rt.state.orbs) rt.state.orbs = [];
  rt.state.orbs.push({
    kind: 'repair',
    x: enemy.x,
    y: enemy.y,
    vx: (rng('loot') - 0.5) * 85,
    vy: (rng('loot') - 0.5) * 85,
    r: 10,
    value: 0,
    life: 22
  });
}

export function applyEnemySlow(enemy, duration, mult) {
  if (!enemy) return;
  if (typeof enemy._baseSpeed !== 'number') enemy._baseSpeed = enemy.speed || 0;
  enemy.speed = enemy._baseSpeed * mult;
  enemy.slowLeft = Math.max(enemy.slowLeft || 0, duration);
}

export function onDash(player, info) {
  if (!player) return;
  if (player.afterburner) player.afterburnerTimer = 1;
  if (player.kineticBallet && info && rt.state) launchMicroMissiles(player, info);
  if (player.mirageOverdrive && rt.state) {
    if (!rt.state.tacticalEntities) rt.state.tacticalEntities = [];
    var mx = (info && typeof info.startX === 'number') ? info.startX : player.x;
    var my = (info && typeof info.startY === 'number') ? info.startY : player.y;
    rt.state.tacticalEntities.push({
      kind: 'holo-mirage',
      x: mx,
      y: my,
      r: 16,
      life: 3.2,
      maxLife: 3.2,
      hp: 100,
      maxHp: 100,
      targetAngle: player.aim || 0,
      damage: Math.max(8, Math.round((player.damage || 20) * 0.6)),
      fireCd: 0.15,
      fireRate: 0.22,
      pullRadius: 280
    });
    pushFxEvent('burst', mx, my, { preset: 'dashDust', tint: '#ffd700', scale: 0.9 });
  }
  if (player.solarAfterburner && rt.state) {
    if (!rt.state.scorchMarks) rt.state.scorchMarks = [];
    var sx = (info && typeof info.startX === 'number') ? info.startX : player.x;
    var sy = (info && typeof info.startY === 'number') ? info.startY : player.y;
    var dx = player.x - sx;
    var dy = player.y - sy;
    var dDist = Math.hypot(dx, dy) || 1;
    var storm = isStormFront();
    var trenchRadius = storm ? 38 : 26;
    var steps = Math.max(3, Math.floor(dDist / 25));
    for (var si = 0; si <= steps; si += 1) {
      var ratio = si / steps;
      var tx = sx + dx * ratio;
      var ty = sy + dy * ratio;
      rt.state.scorchMarks.push({
        kind: 'solar-trench',
        x: tx,
        y: ty,
        r: trenchRadius,
        life: 3.0,
        maxLife: 3.0,
        tick: 0,
        dmg: Math.max(6, Math.round((player.damage || 20) * 0.45)),
        vaporize: true
      });
    }
    pushFxEvent('burst', player.x, player.y, { preset: 'dashDust', tint: '#ff7733', scale: 1.1 });
  }
  dispatchCardHook('onDash', player, info);
}

export function onEmp(player, info) {
  if (!player) return;
  if (player.fortressProtocol) {
    player.shield = Math.max(player.shield || 0, 30);
    player.shieldTimer = 2;
  }
  if (player.thermalShock && rt.state) {
    var enemies = livingEnemies();
    for (var ei = enemies.length - 1; ei >= 0; ei -= 1) {
      var foe = enemies[ei];
      var inEmp = info && typeof info.x === 'number' && typeof info.y === 'number' && typeof info.r === 'number'
        ? dist2(info.x, info.y, foe.x, foe.y) <= (info.r + foe.r) * (info.r + foe.r)
        : true;
      if (((foe.burnStacks || 0) > 0 || inEmp) && foe.hp > 0) {
        var burnRemaining = Math.max(1, (foe.burnStacks || 1)) * 36;
        var maxHpBlast = Math.round((foe.maxHp || 100) * 0.15);
        var fractureDmg = burnRemaining + maxHpBlast;
        foe.burnStacks = 0;
        foe.burnTimer = 0;
        applyEnemySlow(foe, 2.0, 0.3);
        damageEnemy(foe, fractureDmg, { source: 'thermal_fracture', x: foe.x, y: foe.y, crit: true });
        spawnCombatText(foe.x, foe.y - 12, 'THERMAL FRACTURE ' + fractureDmg, true);
        pushFxEvent('burst', foe.x, foe.y, { preset: 'emp', tint: '#ff4400', scale: 1.1 });
        if (foe.hp <= 0) killEnemy(foe, 'thermal_fracture');
      }
    }
  }
}

export function onPlayerDamaged(player, info) {
  if (!player || !rt.state) return;
  if (player.singularityMine) {
    if (!rt.state.tacticalEntities) rt.state.tacticalEntities = [];
    rt.state.tacticalEntities.push({
      kind: 'singularity-vortex',
      x: player.x,
      y: player.y,
      r: 180,
      life: 2.0,
      maxLife: 2.0,
      tearTimer: 0,
      absorbedDamage: (info && info.amount ? info.amount : 20) * 1.5,
      hp: 999
    });
    pushFxEvent('burst', player.x, player.y, { preset: 'emp', tint: '#bd5bff', scale: 1.1 });
  }
  dispatchCardHook('onPlayerDamaged', player, info);
}

export function onLethal(player, info) {
  if (!player || !info || !info.saved || !rt.state) return;
  player.hp = Math.max(1, Math.round((player.maxHp || 1) * 0.4));
  player.invulnerable = Math.max(player.invulnerable || 0, 2);
  player.phoenix = false;
  player.phoenixSpent = true;
  var radius = 140 + (player.empRadiusBonus || 0);
  releaseFreeEmp(player.x, player.y, radius, 2.2, 35);
  var list = rt.state.acquiredUpgrades || [];
  var i;
  for (i = list.length - 1; i >= 0; i -= 1) {
    if (list[i] && list[i].id === 'phoenix-core') list.splice(i, 1);
  }
  pushFxEvent('burst', player.x, player.y, { preset: 'pillarMint', scale: 1.1 });
}

export function onEnemyHit(enemy, info) {
  if (!enemy || hookDepth > 0 || !rt.state || !rt.state.player) return;
  var player = rt.state.player;
  var applied = info && info.amount ? info.amount : 0;
  if (!(applied > 0) || enemy.hp <= 0) return;
  var pre = enemy.hp + applied;
  var maxHp = enemy.maxHp || pre || 1;
  var ratio = pre / maxHp;
  var boss = !!(enemy.isBoss || enemy.kind === 'titan');
  var executeThreshold = player.bloodhoundReaper ? 0.35 : 0.15;
  var canExecBoss = !!player.bloodhoundReaper;
  var execute = !!((player.executioner || player.bloodhoundReaper) && (!boss || canExecBoss) && ratio < executeThreshold);
  var bonus = 0;
  if (player.hollowPoint && ratio < 0.3) bonus += applied * 0.35;
  if (player.executioner && (enemy.empTimer || 0) > 0) bonus += applied * 0.5;
  if (player.bloodhoundReaper && ratio < 0.35) bonus += applied * 1.5;
  if (!execute && !(bonus > 0)) return;
  hookDepth += 1;
  try {
    if (execute) {
      var execDmg = Math.round(enemy.hp * (player.bloodhoundReaper ? 2.5 : 1));
      spawnCombatText(enemy.x, enemy.y - 12, 'EXECUTE ' + execDmg, true);
      pushFxEvent('burst', enemy.x, enemy.y, { preset: 'deathBrute', tint: '#ff2222', scale: 1.3 });
      damageEnemy(enemy, execDmg, info || {});
    } else {
      damageEnemy(enemy, bonus, info || {});
    }
  } finally {
    hookDepth -= 1;
  }
}

export function onKill(enemy, info) {
  if (!enemy || !rt.state || !rt.state.player) return;
  var player = rt.state.player;
  if (player.stormRider && isStormFront() && player.hp > 0 && !rt.state.over) {
    player.hp = Math.min(player.maxHp, player.hp + 1);
  }
  var salvage = player.salvageChance || 0;
  var boss = !!(enemy.isBoss || enemy.kind === 'titan');
  if (salvage > 0 && enemy.kind !== 'brute' && enemy.kind !== 'elite' && !boss) {
    if (rng('loot') < salvage) pushRepair(enemy);
  }
  if (boss) rt.state.rerolls = (rt.state.rerolls || 0) + 1;
  if (player.bloodhoundReaper && (enemy.kind === 'elite' || enemy.isBoss || enemy.kind === 'titan' || enemy.isPart || enemy.kind === 'brute')) {
    if (!rt.state.orbs) rt.state.orbs = [];
    rt.state.orbs.push({
      kind: 'overdrive',
      x: enemy.x,
      y: enemy.y,
      vx: (rng('loot') - 0.5) * 80,
      vy: (rng('loot') - 0.5) * 80,
      r: 11,
      life: 25
    });
    spawnCombatText(enemy.x, enemy.y - 20, 'OVERDRIVE ORB', true);
  }
  dispatchCardHook('onKill', enemy, info);
}

export function onPickup(orb, player) {
  if (!orb || !player || orb.kind !== 'scrap') return;
  player.scrapPicked = (player.scrapPicked || 0) + 1;
  if (player.scrapSingularity && player.scrapPicked % 40 === 0) spawnScrapVortex(player);
}

export function onCrit(enemy, info) {
  if (!enemy || !rt.state || !rt.state.player) return;
  var player = rt.state.player;
  if (player.superconductiveResonance && info) {
    var dmg = Math.max(1, Math.round((info.damage || 20) * 0.45));
    var enemies = livingEnemies();
    var hit = 0;
    for (var i = 0; i < enemies.length; i += 1) {
      var other = enemies[i];
      if (other === enemy || other.hp <= 0) continue;
      if (dist2(enemy.x, enemy.y, other.x, other.y) <= 140 * 140) {
        damageEnemy(other, dmg, { source: 'superconductive_resonance', x: enemy.x, y: enemy.y });
        if (rt.state.lightningArcs) {
          rt.state.lightningArcs.push({
            x1: enemy.x,
            y1: enemy.y,
            x2: other.x,
            y2: other.y,
            life: 0.15,
            maxLife: 0.15,
            color: '#00f3ff'
          });
        }
        spawnParticles(other.x, other.y, '#00f3ff', 4, 80, 2);
        if (other.hp <= 0) killEnemy(other, 'superconductive_resonance');
        hit += 1;
        if (hit >= 2) break;
      }
    }
    var b = info.bullet;
    if (b && (b.isColossusCharged || b.isVanguard)) {
      var cap = (typeof player.batteryMax === 'number') ? player.batteryMax : (player.maxEnergy || 100);
      player.energy = Math.min(cap, (player.energy || 0) + 4.0);
      if (player.tacticalSlot && player.tacticalSlot.cooldown > 0) {
        player.tacticalSlot.cooldown = Math.max(0, player.tacticalSlot.cooldown - 0.3);
      }
      spawnParticles(player.x, player.y, '#00f3ff', 6, 90, 2);
    }
  }
  dispatchCardHook('onCrit', enemy, info);
}

export function onShieldBreak(enemy, info) {
  if (!rt.state || !rt.state.player) return;
  var player = rt.state.player;
  var ox = (info && typeof info.x === 'number') ? info.x : (enemy ? enemy.x : player.x);
  var oy = (info && typeof info.y === 'number') ? info.y : (enemy ? enemy.y : player.y);
  if (player.concussionBreaker) {
    var radius = 130;
    var damage = 85;
    var enemies = livingEnemies();
    for (var i = enemies.length - 1; i >= 0; i -= 1) {
      var foe = enemies[i];
      var reach = radius + (foe.r || 0);
      if (dist2(ox, oy, foe.x, foe.y) <= reach * reach) {
        damageEnemy(foe, damage, { source: 'concussion_breaker', x: ox, y: oy });
        foe.empTimer = Math.max(foe.empTimer || 0, 1.5);
        foe.concussionTimer = 5.0;
        spawnParticles(foe.x, foe.y, '#f59e0b', 5, 90, 2);
        if (foe.hp <= 0) killEnemy(foe, 'concussion_breaker');
      }
    }
    if (rt.state.shockRings) {
      rt.state.shockRings.push({
        x: ox,
        y: oy,
        r: 10,
        maxR: radius,
        life: 0.28,
        maxLife: 0.28,
        color: '#f59e0b'
      });
    }
    pushFxEvent('burst', ox, oy, { preset: 'emp', tint: '#f59e0b', scale: 0.9 });
    if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
  }
  dispatchCardHook('onShieldBreak', enemy, info);
}

export function onTacticalUsed(player, info) {
  if (!player || !rt.state) return;
  if (player.tacticalOverdriveCoil) {
    var maxCharges = player.dashCapacitor ? 2 : 1;
    player.dashCharges = maxCharges;
    player.dashCooldown = 0;
    player.tacticalOverdriveTimer = 3.0;
    var cap = (typeof player.batteryMax === 'number') ? player.batteryMax : (player.maxEnergy || 100);
    player.energy = cap;
    spawnParticles(player.x, player.y, '#00f3ff', 12, 120, 2.5);
    pushFxEvent('burst', player.x, player.y, { preset: 'dashDust', tint: '#00f3ff', scale: 0.8 });
  }
  dispatchCardHook('onTacticalUsed', player, info);
}

function pullScrapVortices(dt) {
  var vortices = rt.state.scrapVortices;
  if (!vortices) return;
  var vi;
  for (vi = vortices.length - 1; vi >= 0; vi -= 1) {
    var vortex = vortices[vi];
    vortex.life -= dt;
    if (vortex.life <= 0) {
      vortices.splice(vi, 1);
      continue;
    }
    var radius = vortex.r || 90;
    var enemies = rt.state.enemies || [];
    var ei;
    for (ei = 0; ei < enemies.length; ei += 1) {
      var enemy = enemies[ei];
      if (!enemy || enemy.isBoss || enemy.kind === 'titan') continue;
      var dx = vortex.x - enemy.x;
      var dy = vortex.y - enemy.y;
      var d2 = dx * dx + dy * dy;
      if (d2 > radius * radius || d2 <= 1) continue;
      var dist = Math.sqrt(d2);
      var step = Math.min(220 * dt, dist);
      enemy.x += (dx / dist) * step;
      enemy.y += (dy / dist) * step;
    }
  }
}

function tickScorch(dt) {
  var marks = rt.state.scorchMarks;
  if (!marks || marks.length === 0) return;
  var enemyBullets = rt.state.enemyBullets || [];

  var hasVaporize = marks.some(function (m) { return m && m.vaporize; });

  if (hasVaporize && enemyBullets.length > 0) {
    populateEnemyBulletGrid(enemyBullets);
  }

  var vaporizedAny = false;

  for (var i = marks.length - 1; i >= 0; i -= 1) {
    var mark = marks[i];
    mark.life -= dt;
    mark.tick = (mark.tick || 0) + dt;

    if (mark.vaporize && enemyBullets.length > 0) {
      queryEnemyBulletGridCallback(mark.x, mark.y, mark.r + 8, function (bId) {
        var eb = getEnemyBulletById(bId);
        if (!eb || eb._vaporized) return;
        var reach = mark.r + (eb.r || 4);
        var bdx = mark.x - eb.x;
        var bdy = mark.y - eb.y;
        if (bdx * bdx + bdy * bdy <= reach * reach) {
          eb._vaporized = true;
          vaporizedAny = true;
          pushFxEvent('spark', eb.x, eb.y, { color: '#ff6622', scale: 0.8 });
        }
      });
    }

    if (mark.tick >= 0.25) {
      mark.tick -= 0.25;
      ensureEnemyGrid(rt.state.enemies);
      queryGridCallback(mark.x, mark.y, (mark.r || 12) + 30, function (eId) {
        var enemy = getEnemyById(eId);
        if (!enemy || enemy.hp <= 0) return;
        var reach = (mark.r || 12) + (enemy.r || 10);
        var edx = mark.x - enemy.x;
        var edy = mark.y - enemy.y;
        if (edx * edx + edy * edy <= reach * reach) {
          damageEnemy(enemy, mark.dmg || 1, { source: 'zone', x: mark.x, y: mark.y });
          if (mark.kind === 'solar-trench') {
            enemy.burnStacks = Math.min(10, (enemy.burnStacks || 0) + 1);
            enemy.burnTimer = 3.0;
          }
          if (enemy.hp <= 0) killEnemy(enemy, 'zone');
        }
      });
    }
    if (mark.life <= 0) marks.splice(i, 1);
  }

  if (vaporizedAny) {
    for (var bi = enemyBullets.length - 1; bi >= 0; bi -= 1) {
      if (enemyBullets[bi]._vaporized) {
        enemyBullets.splice(bi, 1);
      }
    }
  }
}

function tickSlows(dt) {
  var enemies = rt.state.enemies || [];
  var i;
  for (i = 0; i < enemies.length; i += 1) {
    var enemy = enemies[i];
    if (enemy.concussionTimer > 0) {
      enemy.concussionTimer = Math.max(0, enemy.concussionTimer - dt);
    }
    if (!(enemy.slowLeft > 0)) continue;
    enemy.slowLeft -= dt;
    if (enemy.slowLeft <= 0 && typeof enemy._baseSpeed === 'number') {
      enemy.slowLeft = 0;
      enemy.speed = enemy._baseSpeed;
    }
  }
}

export function stepCardEffects(dt) {
  if (!rt.state || !rt.state.player) return;
  var state = rt.state;
  var player = state.player;
  if ((state.level || 1) <= 1 && (state.xp || 0) === 0 && state.xpNext === 100) state.xpNext = 80;
  if (player.tacticalOverdriveTimer > 0) player.tacticalOverdriveTimer = Math.max(0, player.tacticalOverdriveTimer - dt);
  if (player.afterburnerTimer > 0) player.afterburnerTimer = Math.max(0, player.afterburnerTimer - dt);
  if (player.shieldTimer > 0) {
    player.shieldTimer -= dt;
    if (player.shieldTimer <= 0) {
      player.shieldTimer = 0;
      player.shield = 0;
    }
  }
  if (player.stormRider) {
    var storm = isStormFront();
    if (storm && !player._stormSpeedOn) {
      player.moveSpeedMult = (player.moveSpeedMult || 1) * 1.2;
      player._stormSpeedOn = true;
    } else if (!storm && player._stormSpeedOn) {
      player.moveSpeedMult = (player.moveSpeedMult || 1) / 1.2;
      player._stormSpeedOn = false;
    }
  }
  if (player.aegisStance) {
    var isStill = Math.abs(player.vx || 0) < 5 && Math.abs(player.vy || 0) < 5;
    if (isStill) {
      player.stationaryTime = (player.stationaryTime || 0) + dt;
      if (player.stationaryTime >= 0.4) {
        player.aegisDeployed = true;
      }
    } else {
      player.stationaryTime = 0;
      player.aegisDeployed = false;
    }
  } else {
    player.aegisDeployed = false;
  }
  tickSlows(dt);
  tickScorch(dt);
  pullScrapVortices(dt);
}
