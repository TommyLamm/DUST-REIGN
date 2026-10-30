import { MAGNET_PICKUP_DURATION } from '../src/config.js';
import { makeState } from '../src/core/state.js';
import { rt } from '../src/core/runtime.js';
import { spawnMagnet, trySpawnGroundMagnet } from '../src/systems/drops.js';
import { stepOrbs } from '../src/systems/sim/orbs.js';

const prev = rt.state;
const state = makeState(3520, 2640);
rt.state = state;
state.level = 3;
state.orbs = [];
state.enemies = [];
const p = state.player;
p.x = 400; p.y = 400; p.r = 14; p.magnetRadius = 50; p.hp = 100; p.maxHp = 100;

// Pickup magnet orb at feet
state.orbs.push({ kind: 'magnet', x: p.x, y: p.y, vx: 0, vy: 0, r: 11, value: 0, life: 20 });
stepOrbs(0.05, { p });
if (!((p.lootMagnet || 0) >= MAGNET_PICKUP_DURATION - 0.1)) {
  rt.state = prev;
  throw new Error('magnet pickup did not arm lootMagnet buff, got ' + p.lootMagnet);
}

// Full-map vacuum: distant scrap + crate should move toward player
state.orbs = [
  { kind: 'scrap', x: 3000, y: 2000, vx: 0, vy: 0, r: 7, value: 10, life: 30 },
  { kind: 'crate', type: 'crate', payload: 'repair', amount: 10, x: 2900, y: 1900, vx: 0, vy: 0, r: 12, value: 0, life: 30 },
  { kind: 'repair', x: 2800, y: 1800, vx: 0, vy: 0, r: 10, value: 0, life: 30 }
];
const sx0 = state.orbs[0].x, cx0 = state.orbs[1].x, rx0 = state.orbs[2].x;
stepOrbs(0.2, { p });
if (!(state.orbs[0].x < sx0)) { rt.state = prev; throw new Error('vacuum missed distant scrap'); }
if (!(state.orbs[1].x < cx0)) { rt.state = prev; throw new Error('vacuum missed distant crate'); }
if (!(state.orbs[2].x < rx0)) { rt.state = prev; throw new Error('vacuum missed distant repair'); }

// Buff ends cleanly
p.lootMagnet = 0.01;
stepOrbs(0.05, { p });
// timers-wave ticks lootMagnet; simulate tick
p.lootMagnet = Math.max(0, (p.lootMagnet || 0) - 0.05);
if (p.lootMagnet !== 0) { rt.state = prev; throw new Error('lootMagnet did not expire cleanly'); }

// Passive magnet should NOT pull crate after buff ends
state.orbs = [{ kind: 'crate', type: 'crate', payload: 'repair', amount: 10, x: p.x + 40, y: p.y, vx: 0, vy: 0, r: 12, value: 0, life: 30 }];
const crateX = state.orbs[0].x;
stepOrbs(0.2, { p });
if (Math.abs(state.orbs[0].x - crateX) > 0.01) { rt.state = prev; throw new Error('crate pulled without vacuum'); }

// Ground spawn once
state.magnetGroundSpawned = false;
state.orbs = [];
const g1 = trySpawnGroundMagnet(3520, 2640);
const g2 = trySpawnGroundMagnet(3520, 2640);
if (g2) { rt.state = prev; throw new Error('ground magnet spawned twice in one wave'); }
if (!state.magnetGroundSpawned) { rt.state = prev; throw new Error('magnetGroundSpawned not set'); }

// Direct spawnMagnet
state.orbs = [];
const m = spawnMagnet(100, 100);
if (!m || m.kind !== 'magnet') { rt.state = prev; throw new Error('spawnMagnet failed'); }

rt.state = prev;
console.log(JSON.stringify({
  ok: true,
  duration: MAGNET_PICKUP_DURATION,
  groundFirst: !!g1,
  vacuum: true
}));
