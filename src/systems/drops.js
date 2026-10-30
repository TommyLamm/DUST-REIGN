import { MAGNET_ELITE_DROP_BONUS, MAGNET_GROUND_SPAWN_CHANCE, MAGNET_KILL_DROP_CHANCE } from '../config.js';
import { MAP_MARGIN } from '../core/constants.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { clamp } from '../core/utils.js';
import { damageEnemy, killEnemy } from './combat.js';
import { damageConvoy } from './mutators.js';
import { addScore } from './scoring.js';

function pushOrb(orb) {
  if (!rt.state.orbs) rt.state.orbs = [];
  rt.state.orbs.push(orb);
}

function rollPayload() {
  var n = Math.floor(rng('loot') * 4);
  if (n <= 0) return { id: 'repair', amount: 30 };
  if (n === 1) return { id: 'battery', amount: 50 };
  if (n === 2) return { id: 'reroll', amount: 1 };
  return { id: 'overdrive', amount: 4 };
}

export function spawnCrate(x, y, vx, vy) {
  if (!rt.state) return null;
  var payload = rollPayload();
  var orb = {
    kind: 'crate',
    type: 'crate',
    payload: payload.id,
    amount: payload.amount,
    x: x,
    y: y,
    vx: vx || 0,
    vy: vy || 0,
    r: 12,
    value: 0,
    life: 20
  };
  pushOrb(orb);
  return orb;
}


export function spawnMagnet(x, y, vx, vy) {
  if (!rt.state) return null;
  var orb = {
    kind: 'magnet',
    x: x,
    y: y,
    vx: typeof vx === 'number' ? vx : (rng('loot') - 0.5) * 60,
    vy: typeof vy === 'number' ? vy : (rng('loot') - 0.5) * 60,
    r: 11,
    value: 0,
    life: 26
  };
  pushOrb(orb);
  return orb;
}

function magnetKillChance(elite) {
  var chance = MAGNET_KILL_DROP_CHANCE + (elite ? MAGNET_ELITE_DROP_BONUS : 0);
  if (chance > 0.35) chance = 0.35;
  if (chance < 0) chance = 0;
  return chance;
}

function maybeDropMagnet(e, elite) {
  if (!e || e.kind === 'phoenix-core') return;
  if (rng('loot') >= magnetKillChance(!!elite)) return;
  spawnMagnet(e.x, e.y);
}

/** Random ground refresh: at most one live magnet orb per call; world-space away from player. */
export function trySpawnGroundMagnet(boundW, boundH) {
  if (!rt.state || rt.state.over) return null;
  if (rt.state.magnetGroundSpawned) return null;
  if (rng('loot') >= MAGNET_GROUND_SPAWN_CHANCE) {
    rt.state.magnetGroundSpawned = true;
    return null;
  }
  var orbs = rt.state.orbs || [];
  var i;
  for (i = 0; i < orbs.length; i += 1) {
    if (orbs[i] && orbs[i].kind === 'magnet') {
      rt.state.magnetGroundSpawned = true;
      return null;
    }
  }
  var p = rt.state.player || { x: 0, y: 0 };
  var w = typeof boundW === 'number' ? boundW : (rt.state.width || 3520);
  var h = typeof boundH === 'number' ? boundH : (rt.state.height || 2640);
  var margin = Math.max(80, MAP_MARGIN || 160);
  var cx = margin + rng('spawn') * Math.max(20, w - margin * 2);
  var cy = margin + rng('spawn') * Math.max(20, h - margin * 2);
  var tries;
  for (tries = 0; tries < 12; tries += 1) {
    if (Math.hypot(cx - p.x, cy - p.y) >= 220) break;
    cx = margin + rng('spawn') * Math.max(20, w - margin * 2);
    cy = margin + rng('spawn') * Math.max(20, h - margin * 2);
  }
  if (Math.hypot(cx - p.x, cy - p.y) < 220) {
    var ang = Math.atan2(cy - p.y, cx - p.x) || 0;
    cx = clamp(p.x + Math.cos(ang) * 220, margin, w - margin);
    cy = clamp(p.y + Math.sin(ang) * 220, margin, h - margin);
  }
  rt.state.magnetGroundSpawned = true;
  return spawnMagnet(cx, cy, 0, 0);
}

export function spawnScrap(x, y, value) {
  if (!rt.state) return null;
  var orb = {
    kind: 'scrap',
    x: x,
    y: y,
    vx: (rng('loot') - 0.5) * 70,
    vy: (rng('loot') - 0.5) * 70,
    r: 7,
    value: value || 10,
    life: 28
  };
  pushOrb(orb);
  return orb;
}

function crateChance() {
  var m = rt.state.mutator;
  var base = (m && typeof m.crateChance === 'number') ? m.crateChance : 0.15;
  var player = rt.state.player;
  var mult = player && typeof player.crateDropMult === 'number' && player.crateDropMult > 0 ? player.crateDropMult : 1;
  var chance = base * mult;
  if (chance > 1) chance = 1;
  if (chance < 0) chance = 0;
  return chance;
}

function wantsRepair(e, elite) {
  if (typeof e.repairChance === 'number') {
    if (e.repairChance >= 1) return true;
    if (!(e.repairChance > 0)) return false;
    return rng('loot') < e.repairChance;
  }
  if (elite || e.kind === 'brute') return true;
  if (e.kind === 'artillery') return rng('loot') < 0.15;
  // Boss arenas need more sustain so Sovereign kill samples are reachable.
  if (rt.state && rt.state.boss && rt.state.boss.hp > 0) {
    if (e.kind === 'warden' || e.kind === 'spitter') return rng('loot') < 0.35;
    return rng('loot') < 0.12;
  }
  return false;
}

var chainDepth = 0;

function chainReact(e) {
  var daily = rt.state.daily;
  var chance = daily && typeof daily.chainExplosionChance === 'number' ? daily.chainExplosionChance : 0;
  if (!(chance > 0) || chainDepth >= 6 || !e || e.kind === 'phoenix-core') return;
  if (rng('loot') >= chance) return;
  chainDepth += 1;
  var x = e.x;
  var y = e.y;
  var radius = 64;
  var dmg = 22;
  if (!rt.state.shockRings) rt.state.shockRings = [];
  rt.state.shockRings.push({
    x: x,
    y: y,
    r: 6,
    maxR: radius,
    life: 0.28,
    maxLife: 0.28,
    color: '#e7d27a'
  });
  pushFxEvent('burst', x, y, { preset: 'deathSmall', scale: 0.8 });
  damageConvoy(dmg, x, y, radius);
  var list = rt.state.enemies || [];
  var i;
  for (i = list.length - 1; i >= 0; i -= 1) {
    var foe = list[i];
    if (!foe || foe === e || foe.hp <= 0) continue;
    if (Math.hypot((foe.x || 0) - x, (foe.y || 0) - y) > radius + (foe.r || 10)) continue;
    damageEnemy(foe, dmg, { source: 'zone', x: x, y: y });
    if (foe.hp <= 0) killEnemy(foe, 'other');
  }
  chainDepth -= 1;
}

export function dropBossShard(x, y, value) {
  if (!rt.state) return;
  addScore(10, 'style');
  var scrapXp = (typeof value === 'number' && value > 0) ? value : 60;
  pushOrb({
    kind: 'scrap',
    x: x,
    y: y,
    vx: (rng('loot') - 0.5) * 70,
    vy: (rng('loot') - 0.5) * 70,
    r: 8,
    value: scrapXp,
    life: 22
  });
}

export function rollDrops(e) {
  if (!rt.state || !e) return;
  if (e.splitterChild) {
    pushOrb({ kind: 'repair', x: e.x, y: e.y, vx: (rng('loot') - 0.5) * 85, vy: (rng('loot') - 0.5) * 85, r: 10, value: 0, life: 22 });
    pushOrb({ kind: 'overdrive', x: e.x, y: e.y, vx: (rng('loot') - 0.5) * 95, vy: (rng('loot') - 0.5) * 95, r: 11, value: 0, life: 18 });
    return;
  }
  if (e.noDrop) return;
  if (e.kind === 'dreadnought' || e.kind === 'sovereign' || e.kind === 'behemoth') {
    var shardXp = (typeof e.xp === 'number' && e.xp > 0) ? e.xp : 60;
    var shards = e.kind === 'sovereign' ? 4 : 3;
    var si;
    for (si = 0; si < shards; si += 1) dropBossShard(e.x, e.y, shardXp);
    return;
  }
  var elite = e.kind === 'elite';
  var isTitan = e.kind === 'titan';
  if (isTitan) {
    pushOrb({ kind: 'overdrive', x: e.x, y: e.y, vx: (rng('loot') - 0.5) * 95, vy: (rng('loot') - 0.5) * 95, r: 11, value: 0, life: 25 });
    pushOrb({ kind: 'repair', x: e.x, y: e.y, vx: (rng('loot') - 0.5) * 85, vy: (rng('loot') - 0.5) * 85, r: 10, value: 0, life: 25 });
    var gsi;
    for (gsi = 0; gsi < 3; gsi += 1) {
      pushOrb({
        kind: 'scrap',
        x: e.x + (rng('loot') - 0.5) * 35,
        y: e.y + (rng('loot') - 0.5) * 35,
        vx: (rng('loot') - 0.5) * 110,
        vy: (rng('loot') - 0.5) * 110,
        r: 12,
        value: 60,
        life: 35
      });
    }
    maybeDropMagnet(e, true);
    chainReact(e);
    return;
  }
  var scrapValue = elite ? 40 : e.kind === 'brute' ? 34 : e.kind === 'artillery' ? 24 : e.kind === 'rusher' ? 13 : 10;
  if (typeof e.xp === 'number' && e.xp > 0) scrapValue = e.xp;
  pushOrb({
    kind: 'scrap',
    x: e.x,
    y: e.y,
    vx: (rng('loot') - 0.5) * 70,
    vy: (rng('loot') - 0.5) * 70,
    r: elite ? 9 : e.kind === 'artillery' ? 8 : 7,
    value: scrapValue,
    life: 28
  });
  if (wantsRepair(e, elite)) {
    pushOrb({ kind: 'repair', x: e.x, y: e.y, vx: (rng('loot') - 0.5) * 85, vy: (rng('loot') - 0.5) * 85, r: 10, value: 0, life: 22 });
  }
  if (elite) {
    pushOrb({ kind: 'overdrive', x: e.x, y: e.y, vx: (rng('loot') - 0.5) * 95, vy: (rng('loot') - 0.5) * 95, r: 11, value: 0, life: 18 });
    if (e.kind !== 'phoenix-core' && rng('loot') < crateChance()) {
      spawnCrate(e.x, e.y, (rng('loot') - 0.5) * 40, (rng('loot') - 0.5) * 40);
    }
  }
  maybeDropMagnet(e, elite);
  chainReact(e);
}
