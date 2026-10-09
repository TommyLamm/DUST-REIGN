import { AudioFX } from '../audio/audio-fx.js';
import { TAU } from '../config.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { clamp } from '../core/utils.js';
import { damagePlayer } from './combat.js';
import { spawnCrate, spawnScrap } from './drops.js';
import { addScore } from './scoring.js';

function simDt() {
  var d = rt.state && rt.state.simDt;
  if (!(d > 0)) return 0;
  if (d > 0.05) return 0.05;
  return d;
}

function mutatorId() {
  var m = rt.state && rt.state.mutator;
  if (!m) return '';
  if (typeof m === 'string') return m;
  return m.id || '';
}

function bounds() {
  var w = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  var h = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  return { w: w, h: h };
}

function spawnMeteor() {
  var box = bounds();
  var margin = 48;
  var x = margin + rng('director') * Math.max(20, box.w - margin * 2);
  var y = margin + rng('director') * Math.max(20, box.h - margin * 2);
  if (!rt.state.meteors) rt.state.meteors = [];
  rt.state.meteors.push({ x: x, y: y, r: 34, timer: 0.8, maxTimer: 0.8 });
}

function landMeteor(m) {
  var p = rt.state.player;
  if (p && Math.hypot(p.x - m.x, p.y - m.y) <= (m.r + (p.r || 15))) {
    damagePlayer(12, 'meteor');
  }
  var i;
  for (i = 0; i < 4; i += 1) spawnScrap(m.x, m.y, 10);
  pushFxEvent('burst', m.x, m.y, { preset: 'mortar', scale: 0.75 });
  if (AudioFX && typeof AudioFX.mortarImpact === 'function') AudioFX.mortarImpact();
}

function tickMeteors(dt) {
  var list = rt.state.meteors;
  if (!list) return;
  var i;
  for (i = list.length - 1; i >= 0; i -= 1) {
    list[i].timer -= dt;
    if (list[i].timer <= 0) {
      landMeteor(list[i]);
      list.splice(i, 1);
    }
  }
}

function fireBarrage(frame) {
  var p = (frame && frame.p) || rt.state.player;
  if (!p) return;
  var box = bounds();
  if (!rt.state.artilleryTargets) rt.state.artilleryTargets = [];
  var n;
  for (n = 0; n < 3; n += 1) {
    var ang = rng('director') * TAU;
    var dist = 36 + rng('director') * 100;
    var x = clamp(p.x + Math.cos(ang) * dist, 46, box.w - 46);
    var y = clamp(p.y + Math.sin(ang) * dist, 46, box.h - 46);
    rt.state.artilleryTargets.push({
      x: x,
      y: y,
      r: 46,
      timer: 1.2,
      maxTimer: 1.2,
      wave: rt.state.wave || 1,
      state: 'warning',
      damageTickTimer: 0
    });
  }
}

function tickDevils(dt, frame) {
  var list = rt.state.devils;
  if (!list || !list.length) return;
  var box = bounds();
  var p = (frame && frame.p) || rt.state.player;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var d = list[i];
    d.x += (d.vx || 0) * dt;
    d.y += (d.vy || 0) * dt;
    if (d.x < 40 || d.x > box.w - 40) d.vx = -(d.vx || 0);
    if (d.y < 40 || d.y > box.h - 40) d.vy = -(d.vy || 0);
    pullInto(p, d, dt, true, box);
    var enemies = rt.state.enemies || [];
    var e;
    for (e = 0; e < enemies.length; e += 1) pullInto(enemies[e], d, dt, false, box);
    yawBullets(d);
  }
}

function pullInto(entity, devil, dt, clampIt, box) {
  if (!entity) return;
  var dx = devil.x - entity.x;
  var dy = devil.y - entity.y;
  var dist = Math.hypot(dx, dy);
  var reach = (devil.r || 60) + (entity.r || 0);
  if (!(dist > 0.001) || dist > reach) return;
  entity.x += (dx / dist) * 40 * dt;
  entity.y += (dy / dist) * 40 * dt;
  if (clampIt && box) {
    var r = entity.r || 15;
    entity.x = clamp(entity.x, r, box.w - r);
    entity.y = clamp(entity.y, r, box.h - r);
  }
}

function yawBullets(devil) {
  var bullets = rt.state.bullets;
  if (!bullets) return;
  var key = devil.id != null ? devil.id : 0;
  var i;
  for (i = 0; i < bullets.length; i += 1) {
    var b = bullets[i];
    if (!b) continue;
    if (!b._devils) b._devils = {};
    if (b._devils[key]) continue;
    var dx = b.x - devil.x;
    var dy = b.y - devil.y;
    if (Math.hypot(dx, dy) > (devil.r || 60) + (b.r || 4)) continue;
    var ang = Math.atan2(b.vy || 0, b.vx || 0);
    var sign = b.x < devil.x ? -1 : 1;
    ang += sign * (15 * Math.PI / 180);
    var spd = Math.hypot(b.vx || 0, b.vy || 0);
    if (spd < 1) continue;
    b.vx = Math.cos(ang) * spd;
    b.vy = Math.sin(ang) * spd;
    b._devils[key] = true;
  }
}

function scaleEnemySpeed() {
  var recipe = rt.state.recipe;
  var scale = recipe && recipe.speedScale ? recipe.speedScale : 1;
  var enemies = rt.state.enemies || [];
  var i;
  for (i = 0; i < enemies.length; i += 1) {
    var e = enemies[i];
    if (!e) continue;
    if (e._speedScaleApplied == null) e._speedScaleApplied = 1;
    if (e._speedScaleApplied !== scale && e._speedScaleApplied > 0) {
      e.speed = (e.speed || 0) / e._speedScaleApplied * scale;
      e._speedScaleApplied = scale;
    }
  }
}

function scaleEnemyShots() {
  var recipe = rt.state.recipe;
  var scale = recipe && recipe.bulletSpeedScale ? recipe.bulletSpeedScale : 1;
  if (!(scale > 0) || scale === 1) return;
  var shots = rt.state.enemyBullets;
  if (!shots) return;
  var i;
  for (i = 0; i < shots.length; i += 1) {
    var b = shots[i];
    if (!b || b._spdScaled) continue;
    b.vx = (b.vx || 0) * scale;
    b.vy = (b.vy || 0) * scale;
    b._spdScaled = true;
  }
}

function spawnConvoy() {
  var box = bounds();
  var fromLeft = rng('director') < 0.5;
  var y = 80 + rng('director') * Math.max(40, box.h - 160);
  var recipe = rt.state.recipe || {};
  var scale = recipe.convoyHpScale || recipe.curveHpScale || recipe.hpScale || 1;
  var hp = Math.round(400 * scale);
  rt.state.convoy = {
    x: fromLeft ? -40 : box.w + 40,
    y: y,
    vx: fromLeft ? 70 : -70,
    vy: 0,
    r: 26,
    hp: hp,
    maxHp: hp,
    age: 0,
    entered: false
  };
  rt.state.convoySpawned = true;
}

function stepConvoy(dt) {
  var c = rt.state.convoy;
  if (!c) return;
  var box = bounds();
  c.age = (c.age || 0) + dt;
  c.x += (c.vx || 0) * dt;
  c.y += (c.vy || 0) * dt;
  if (c.x > -20 && c.x < box.w + 20) c.entered = true;
  var gone = c.age >= 25;
  if (c.entered && (c.vx > 0 ? c.x > box.w + 48 : c.x < -48)) gone = true;
  if (gone) rt.state.convoy = null;
}

function destroyConvoy(c) {
  rt.state.convoy = null;
  addScore(150, 'kill');
  spawnCrate(c.x, c.y, 0, 0);
  pushFxEvent('burst', c.x, c.y, { preset: 'barrel', scale: 1.15 });
  if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
  rt.state.shake = Math.max(rt.state.shake || 0, 8);
}

function hurtConvoy(amount) {
  var c = rt.state.convoy;
  if (!c || !(amount > 0)) return;
  c.hp -= amount;
  if (c.hp <= 0) destroyConvoy(c);
}

export function damageConvoy(amount, x, y, radius) {
  var c = rt.state && rt.state.convoy;
  if (!c || !(amount > 0)) return;
  var reach = (radius || 0) + (c.r || 26);
  if (Math.hypot(c.x - x, c.y - y) > reach) return;
  hurtConvoy(amount);
}

export function resolveConvoyHits() {
  var c = rt.state && rt.state.convoy;
  if (!c) return;
  var bullets = rt.state.bullets;
  if (bullets) {
    var i;
    for (i = bullets.length - 1; i >= 0; i -= 1) {
      var b = bullets[i];
      if (!b) continue;
      if (Math.hypot(b.x - c.x, b.y - c.y) <= (c.r + (b.r || 4))) {
        hurtConvoy((b.damage || 0) * 0.5);
        bullets.splice(i, 1);
        if (!rt.state.convoy) return;
        c = rt.state.convoy;
      }
    }
  }
  var rings = rt.state.shockRings;
  if (!rings || !rt.state.convoy) return;
  var r;
  for (r = 0; r < rings.length; r += 1) {
    var ring = rings[r];
    if (!ring || ring._convoy) continue;
    var dmg = blastDamage(ring);
    if (!(dmg > 0)) continue;
    if (Math.hypot(ring.x - c.x, ring.y - c.y) <= (ring.maxR || ring.r || 0) + c.r) {
      ring._convoy = true;
      hurtConvoy(dmg);
      if (!rt.state.convoy) return;
      c = rt.state.convoy;
    }
  }
}

function blastDamage(ring) {
  if (!ring || !ring.color) return 0;
  if (ring.color === '#ff6633') return 120;
  if (ring.color === '#f5a623' && (ring.maxR || 0) >= 125) return 90;
  if (ring.color === '#f5a623') return 85;
  if (ring.color === '#e07a3d') return 60;
  return 0;
}

function extendMolten() {
  var bonus = rt.state.moltenBonus || 0;
  if (!(bonus > 0) || !rt.state.artilleryTargets) return;
  var i;
  for (i = 0; i < rt.state.artilleryTargets.length; i += 1) {
    var at = rt.state.artilleryTargets[i];
    if (!at || at.state !== 'molten' || at._routeMolten) continue;
    at._routeMolten = true;
    at.timer = (at.timer || 0) + bonus;
    at.maxTimer = (at.maxTimer || 0) + bonus;
  }
}

export function stepMutators(frame) {
  if (!rt.state || rt.state.over || rt.state.interlude) return;
  var dt = simDt();
  if (!(dt > 0)) return;
  var id = mutatorId();
  if (id === 'scrap-rain') {
    rt.state.meteorTimer = (rt.state.meteorTimer || 0) - dt;
    if (rt.state.meteorTimer <= 0) {
      rt.state.meteorTimer += 3;
      spawnMeteor();
    }
  }
  if (id === 'barrage') {
    rt.state.barrageTimer = (rt.state.barrageTimer || 0) - dt;
    if (rt.state.barrageTimer <= 0) {
      rt.state.barrageTimer += 5;
      fireBarrage(frame);
    }
  }
  tickMeteors(dt);
  extendMolten();
  if (id === 'dust-devils') tickDevils(dt, frame);
  scaleEnemySpeed();
  scaleEnemyShots();
  var route = rt.state.route;
  if (route && route.convoy && !rt.state.convoy && !rt.state.convoySpawned && rt.state.waveTime >= (rt.state.convoyDue || 8)) {
    spawnConvoy();
  }
  if (rt.state.convoy) stepConvoy(dt);
}
