import { pushFxEvent } from '../core/fx-events.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { dist2 } from '../core/utils.js';
import { damageEnemy, killEnemy } from './combat.js';
import { isStormFront } from './flow.js';

var hookDepth = 0;

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

function launchMicroMissiles(player, info) {
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
}

export function onEmp(player) {
  if (!player || !player.fortressProtocol) return;
  player.shield = Math.max(player.shield || 0, 30);
  player.shieldTimer = 2;
}

export function onPlayerDamaged(player, info) {}

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
  var execute = !!(player.executioner && !boss && ratio < 0.15);
  var bonus = 0;
  if (player.hollowPoint && ratio < 0.3) bonus += applied * 0.35;
  if (player.executioner && (enemy.empTimer || 0) > 0) bonus += applied * 0.5;
  if (!execute && !(bonus > 0)) return;
  hookDepth += 1;
  try {
    if (execute) damageEnemy(enemy, enemy.hp, info || {});
    else damageEnemy(enemy, bonus, info || {});
  } finally {
    hookDepth -= 1;
  }
}

export function onKill(enemy) {
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
}

export function onPickup(orb, player) {
  if (!orb || !player || orb.kind !== 'scrap') return;
  player.scrapPicked = (player.scrapPicked || 0) + 1;
  if (player.scrapSingularity && player.scrapPicked % 40 === 0) spawnScrapVortex(player);
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
  if (!marks) return;
  var i;
  for (i = marks.length - 1; i >= 0; i -= 1) {
    var mark = marks[i];
    mark.life -= dt;
    mark.tick = (mark.tick || 0) + dt;
    if (mark.tick >= 0.25) {
      mark.tick -= 0.25;
      var enemies = rt.state.enemies || [];
      var ei;
      for (ei = enemies.length - 1; ei >= 0; ei -= 1) {
        var enemy = enemies[ei];
        var reach = (mark.r || 12) + (enemy.r || 10);
        if (dist2(mark.x, mark.y, enemy.x, enemy.y) > reach * reach) continue;
        damageEnemy(enemy, mark.dmg || 1, { source: 'zone', x: mark.x, y: mark.y });
        if (enemy.hp <= 0) killEnemy(enemy, 'zone');
      }
    }
    if (mark.life <= 0) marks.splice(i, 1);
  }
}

function tickSlows(dt) {
  var enemies = rt.state.enemies || [];
  var i;
  for (i = 0; i < enemies.length; i += 1) {
    var enemy = enemies[i];
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
  tickSlows(dt);
  tickScorch(dt);
  pullScrapVortices(dt);
}
