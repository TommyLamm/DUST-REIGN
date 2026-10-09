import { TAU } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { rt } from '../../core/runtime.js';
import { dist2 } from '../../core/utils.js';
import { killEnemy } from '../combat.js';

export function stepEffects(dt, frame) {
  if (rt.state.opticalFlashes) {
    for (var ofi = rt.state.opticalFlashes.length - 1; ofi >= 0; ofi -= 1) {
      rt.state.opticalFlashes[ofi].life -= dt;
      if (rt.state.opticalFlashes[ofi].life <= 0) rt.state.opticalFlashes.splice(ofi, 1);
    }
  }

  for (var sri = rt.state.shockRings.length - 1; sri >= 0; sri -= 1) {
    rt.state.shockRings[sri].life -= dt;
    if (rt.state.shockRings[sri].life <= 0) rt.state.shockRings.splice(sri, 1);
  }

  for (var lai = rt.state.lightningArcs.length - 1; lai >= 0; lai -= 1) {
    rt.state.lightningArcs[lai].life -= dt;
    if (rt.state.lightningArcs[lai].life <= 0) rt.state.lightningArcs.splice(lai, 1);
  }

  if (rt.state.plasmaZones) {
    for (var pzi = rt.state.plasmaZones.length - 1; pzi >= 0; pzi -= 1) {
      var pz = rt.state.plasmaZones[pzi];
      pz.timer -= dt;
      pz.damageTickTimer = (pz.damageTickTimer || 0) + dt;
      if (pz.damageTickTimer >= 0.4) {
        pz.damageTickTimer -= 0.4;
        if (rt.state.enemies) {
          for (var pzei = rt.state.enemies.length - 1; pzei >= 0; pzei -= 1) {
            var pzEnemy = rt.state.enemies[pzei];
            if (dist2(pz.x, pz.y, pzEnemy.x, pzEnemy.y) <= (pz.r + (pzEnemy.r || 10)) * (pz.r + (pzEnemy.r || 10))) {
              pzEnemy.hp -= 16;
              if (rt.state.stats) rt.state.stats.damageDealt += 16;
              spawnParticles(pzEnemy.x, pzEnemy.y, '#ff4d2e', 4, 80, 2);
              if (pzEnemy.hp <= 0) killEnemy(pzei);
            }
          }
        }
      }
      if (Math.random() < 0.2) {
        spawnParticles(pz.x + (Math.random() - 0.5) * pz.r * 1.2, pz.y + (Math.random() - 0.5) * pz.r * 1.2, '#ff4d2e', 1, 35, 1.8);
      }
      if (pz.timer <= 0) {
        rt.state.plasmaZones.splice(pzi, 1);
      }
    }
  }

  if (rt.state.vortices) {
    for (var vi = rt.state.vortices.length - 1; vi >= 0; vi -= 1) {
      var vortex = rt.state.vortices[vi];
      vortex.life -= dt;
      if (vortex.life <= 0) {
        rt.state.vortices.splice(vi, 1);
        continue;
      }
      var vr = vortex.r || 160;
      var vr2 = vr * vr;
      if (rt.state.enemies) {
        for (var vei = 0; vei < rt.state.enemies.length; vei += 1) {
          var ve = rt.state.enemies[vei];
          if (ve.kind === 'elite' || ve.kind === 'titan') continue;
          var vdx = vortex.x - ve.x;
          var vdy = vortex.y - ve.y;
          var vd2 = vdx * vdx + vdy * vdy;
          if (vd2 <= vr2 && vd2 > 1) {
            var vd = Math.sqrt(vd2);
            var moveDist = Math.min(220 * dt, vd);
            ve.x += (vdx / vd) * moveDist;
            ve.y += (vdy / vd) * moveDist;
          }
        }
      }
      if (rt.state.orbs) {
        for (var voi = 0; voi < rt.state.orbs.length; voi += 1) {
          var vo = rt.state.orbs[voi];
          var vodx = vortex.x - vo.x;
          var vody = vortex.y - vo.y;
          var vod2 = vodx * vodx + vody * vody;
          if (vod2 <= vr2 && vod2 > 1) {
            var vod = Math.sqrt(vod2);
            var orbDist = Math.min(220 * dt, vod);
            vo.x += (vodx / vod) * orbDist;
            vo.y += (vody / vod) * orbDist;
          }
        }
      }
      if (Math.random() < 0.25) {
        var vPartAngle = Math.random() * TAU;
        var vPartDist = 20 + Math.random() * (vr - 20);
        rt.state.particles.push({
          x: vortex.x + Math.cos(vPartAngle) * vPartDist,
          y: vortex.y + Math.sin(vPartAngle) * vPartDist,
          vx: -Math.cos(vPartAngle) * 50 - Math.sin(vPartAngle) * 70,
          vy: -Math.sin(vPartAngle) * 50 + Math.cos(vPartAngle) * 70,
          life: 0.18 + Math.random() * 0.12,
          maxLife: 0.3,
          size: 2,
          color: '#b55fe6',
          gravity: 0
        });
      }
    }
  }

  if (rt.state.decals) {
    for (var dci = 0; dci < rt.state.decals.length; dci += 1) {
      var dItem = rt.state.decals[dci];
      if (!dItem.active) continue;
      dItem.life -= dt;
      if (dItem.life <= 0) dItem.active = false;
    }
  }

  if (rt.state.casings) {
    for (var ci = 0; ci < rt.state.casings.length; ci += 1) {
      var c = rt.state.casings[ci];
      if (!c.active) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.pow(0.06, dt);
      c.vy *= Math.pow(0.06, dt);
      c.rot += c.vrot * dt;
      c.vrot *= Math.pow(0.08, dt);
      c.life -= dt;
      if (c.life <= 0) c.active = false;
    }
  }

  for (var pi = rt.state.particles.length - 1; pi >= 0; pi -= 1) {
    var part = rt.state.particles[pi];
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    part.vy += part.gravity * dt;
    part.vx *= Math.pow(0.08, dt);
    part.vy *= Math.pow(0.08, dt);
    part.life -= dt;
    if (part.life <= 0) rt.state.particles.splice(pi, 1);
  }
}
