import { CASING_POOL_SIZE, DECAL_POOL_SIZE, TAU } from '../config.js';
import { rng } from './rng.js';
import { rt } from './runtime.js';

export function createCasingPool() {
  var pool = new Array(CASING_POOL_SIZE);
  for (var i = 0; i < CASING_POOL_SIZE; i += 1) {
    pool[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0, life: 0, maxLife: 0.6 };
  }
  return pool;
}

export function createDecalPool() {
  var pool = new Array(DECAL_POOL_SIZE);
  for (var i = 0; i < DECAL_POOL_SIZE; i += 1) {
    pool[i] = { active: false, x: 0, y: 0, r: 10, life: 0, maxLife: 15, alpha: 0.38, color: '#1b1715', rot: 0 };
  }
  return pool;
}

export function addDecal(x, y, r, maxLife, baseAlpha, color) {
  if (!rt.state || !rt.state.decals) return;
  var d = rt.state.decals[rt.state.decalIndex];
  rt.state.decalIndex = (rt.state.decalIndex + 1) % DECAL_POOL_SIZE;
  d.active = true;
  d.x = x;
  d.y = y;
  d.r = r || (8 + rng('visual') * 10);
  d.maxLife = maxLife || (12 + rng('visual') * 6);
  d.life = d.maxLife;
  d.alpha = baseAlpha !== undefined ? baseAlpha : 0.38;
  d.color = color || '#1b1715';
  d.rot = rng('visual') * TAU;
}

export function spawnParticles(x, y, color, amount, speed, size) {
  amount = amount || 8;
  speed = speed || 130;
  size = size || 3;
  for (var i = 0; i < amount; i += 1) {
    var angle = rng('visual') * TAU;
    var velocity = speed * (0.35 + rng('visual') * 0.9);
    rt.state.particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0.25 + rng('visual') * 0.5,
      maxLife: 0.75,
      size: size * (0.55 + rng('visual') * 0.9),
      color: color,
      gravity: 24
    });
  }
  if (rt.state.particles.length > 700) rt.state.particles.splice(0, rt.state.particles.length - 700);
}

export function ejectCasing(p) {
  if (!rt.state || !rt.state.casings) return;
  var c = rt.state.casings[rt.state.casingIndex];
  rt.state.casingIndex = (rt.state.casingIndex + 1) % CASING_POOL_SIZE;
  c.active = true;
  c.x = p.x;
  c.y = p.y;
  var ejectAngle = p.aim - Math.PI / 2 + (rng('visual') - 0.5) * 0.6;
  var speed = 80 + rng('visual') * 50;
  c.vx = Math.cos(ejectAngle) * speed;
  c.vy = Math.sin(ejectAngle) * speed;
  c.rot = rng('visual') * TAU;
  c.vrot = (rng('visual') - 0.5) * 18;
  c.life = 0.6;
  c.maxLife = 0.6;
}
