import { pushFxEvent } from '../core/fx-events.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
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

export function dropBossShard(x, y) {
  if (!rt.state) return;
  addScore(10, 'style');
  pushOrb({
    kind: 'scrap',
    x: x,
    y: y,
    vx: (rng('loot') - 0.5) * 70,
    vy: (rng('loot') - 0.5) * 70,
    r: 8,
    value: 0,
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
  if (e.kind === 'dreadnought' || e.kind === 'sovereign') {
    dropBossShard(e.x, e.y);
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
  chainReact(e);
}
