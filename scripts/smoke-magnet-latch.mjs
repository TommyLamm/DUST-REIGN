import { makeState } from '../src/core/state.js';
import { rt } from '../src/core/runtime.js';
import { stepOrbs } from '../src/systems/sim/orbs.js';

const prev = rt.state;
const state = makeState(960, 640);
rt.state = state;
state.level = 5;
state.orbs = [];
state.enemies = [];
const p = state.player;
p.x = 400; p.y = 400; p.vx = 0; p.vy = 0;
p.magnetRadius = 165;
p.r = 14;
p.hp = 100; p.maxHp = 100;

state.orbs.push({
  x: 400 + 120, y: 400, vx: 0, vy: 0, r: 6, life: 30,
  kind: 'scrap', value: 5
});
state.orbs.push({
  x: 400 + 80, y: 400, vx: 0, vy: 0, r: 10, life: 30,
  kind: 'crate', type: 'crate', payload: 'repair', amount: 10
});

const frame = { p };
for (let i = 0; i < 3; i++) stepOrbs(1 / 60, frame);
const scrap = state.orbs.find((o) => o.kind === 'scrap');
if (!scrap || !scrap.magnetized) {
  rt.state = prev;
  throw new Error('scrap did not latch magnetized');
}
if (state.orbs.find((o) => o.kind === 'crate').magnetized) {
  rt.state = prev;
  throw new Error('crate must not magnetize');
}

// Dash far beyond magnet radius
p.x = 400 + 120 + 520;
p.y = 400;
let collected = false;
for (let i = 0; i < 240; i++) {
  stepOrbs(1 / 60, frame);
  if (!state.orbs.some((o) => o.kind === 'scrap')) { collected = true; break; }
}
const crateLeft = state.orbs.some((o) => o.kind === 'crate' || o.type === 'crate');
rt.state = prev;
if (!collected) throw new Error('latched scrap was left behind after player dash');
if (!crateLeft) throw new Error('crate should remain until walked onto');
console.log(JSON.stringify({ ok: true, magnetLatchCollect: true }));
