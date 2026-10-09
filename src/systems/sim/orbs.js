import { AudioFX } from '../../audio/audio-fx.js';
import { OVERDRIVE_DURATION, REPAIR_OVERFLOW_SCORE } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { rt } from '../../core/runtime.js';
import { dist2 } from '../../core/utils.js';
import { getHeatModifiers } from '../../data/heat.js';
import { triggerTeslaCoil } from '../abilities.js';
import { onPickup } from '../card-effects.js';
import { resolveConvoyHits } from '../mutators.js';
import { addXp } from '../progression.js';
import { addScore } from '../scoring.js';
import { logEvent } from '../../ui/hud.js';

function isCrate(orb) {
  return !!orb && (orb.kind === 'crate' || orb.type === 'crate');
}

function applyCrate(orb, p) {
  var id = orb.payload || 'repair';
  var amount = orb.amount || 0;
  if (id === 'repair') {
    var healed = Math.max(0, Math.min(amount || 30, p.maxHp - p.hp));
    p.hp += healed;
    AudioFX.pickup('repair');
    if (healed > 0) logEvent('SUPPLY CRATE // +' + Math.round(healed) + ' HULL');
    else logEvent('SUPPLY CRATE // HULL FULL');
    spawnParticles(orb.x, orb.y, '#ed6842', 12, 145, 3);
  } else if (id === 'battery') {
    var scrapCap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
    p.energy = Math.min(scrapCap, (p.energy || 0) + (amount || 50));
    AudioFX.pickup('scrap');
    logEvent('SUPPLY CRATE // BATTERY +' + (amount || 50));
    spawnParticles(orb.x, orb.y, '#5be7ff', 10, 120, 3);
  } else if (id === 'reroll') {
    rt.state.rerolls = (rt.state.rerolls || 0) + (amount || 1);
    AudioFX.pickup('overdrive');
    logEvent('SUPPLY CRATE // +1 REROLL');
    spawnParticles(orb.x, orb.y, '#e8b94e', 10, 120, 3);
  } else {
    p.overdrive = Math.max(p.overdrive || 0, amount || 4);
    AudioFX.pickup('overdrive');
    logEvent('SUPPLY CRATE // OVERDRIVE ' + (amount || 4) + 's');
    spawnParticles(orb.x, orb.y, '#f0cf88', 14, 160, 3);
  }
}

export function stepOrbs(dt, frame) {
  resolveConvoyHits();
  var p = frame.p;
  var magnetReach = p.magnetRadius || 165;
  for (var oi = rt.state.orbs.length - 1; oi >= 0; oi -= 1) {
    var orb = rt.state.orbs[oi];
    var crate = isCrate(orb);
    var odx = p.x - orb.x;
    var ody = p.y - orb.y;
    var od = Math.hypot(odx, ody) || 1;
    if (!crate && od < magnetReach) {
      var pull = (1 - od / magnetReach) * 520;
      orb.vx += (odx / od) * pull * dt;
      orb.vy += (ody / od) * pull * dt;
    }
    orb.vx *= Math.pow(0.08, dt);
    orb.vy *= Math.pow(0.08, dt);
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    orb.life -= dt;
    if (od < p.r + orb.r + 5) {
      if (!crate && p.teslaCoil && rt.state.enemies.length > 0) {
        triggerTeslaCoil(orb);
      }
      if (crate) {
        applyCrate(orb, p);
      } else if (orb.kind === 'overdrive') {
        var dur = OVERDRIVE_DURATION + (p.overdriveDurationBonus || 0);
        p.overdrive = dur;
        AudioFX.pickup('overdrive');
        spawnParticles(orb.x, orb.y, '#f0cf88', 14, 160, 3);
      } else if (orb.kind === 'repair') {
        var healCap = getHeatModifiers(rt.state.heat || 0).repairHeal + ((typeof p.repairBonus === 'number') ? p.repairBonus : 0);
        var healed = Math.max(0, Math.min(healCap, p.maxHp - p.hp));
        p.hp += healed;
        AudioFX.pickup('repair');
        if (healed > 0) {
          if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'REPAIR SCRAP +' + Math.round(healed) + ' HULL';
          logEvent('REPAIR SCRAP +' + Math.round(healed) + ' HULL');
        } else {
          addScore(REPAIR_OVERFLOW_SCORE, 'repair');
          if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'REPAIR SCRAP FULL +' + REPAIR_OVERFLOW_SCORE + ' SCORE';
          logEvent('REPAIR SCRAP FULL +' + REPAIR_OVERFLOW_SCORE + ' SCORE');
        }
        spawnParticles(orb.x, orb.y, '#ed6842', 12, 145, 3);
        if (p.gravitonBulwark) {
          var gBurstR = Math.max(180, p.magnetRadius || 180);
          if (rt.state.shockRings) {
            rt.state.shockRings.push({
              x: p.x,
              y: p.y,
              r: 10,
              maxR: gBurstR,
              life: 0.35,
              maxLife: 0.35,
              color: '#9d4edd'
            });
          }
          if (rt.state.enemyBullets) {
            for (var debi = rt.state.enemyBullets.length - 1; debi >= 0; debi -= 1) {
              var dEb = rt.state.enemyBullets[debi];
              if (dist2(p.x, p.y, dEb.x, dEb.y) <= gBurstR * gBurstR) {
                spawnParticles(dEb.x, dEb.y, '#c77dff', 4, 80, 2);
                rt.state.enemyBullets.splice(debi, 1);
              }
            }
          }
          if (rt.state.enemies) {
            for (var gei = 0; gei < rt.state.enemies.length; gei += 1) {
              var gEnemy = rt.state.enemies[gei];
              if (dist2(p.x, p.y, gEnemy.x, gEnemy.y) <= (gBurstR + (gEnemy.r || 10)) * (gBurstR + (gEnemy.r || 10))) {
                var gdx = gEnemy.x - p.x;
                var gdy = gEnemy.y - p.y;
                var gd = Math.hypot(gdx, gdy) || 1;
                gEnemy.x += (gdx / gd) * 120;
                gEnemy.y += (gdy / gd) * 120;
                spawnParticles(gEnemy.x, gEnemy.y, '#9d4edd', 6, 120, 2.5);
              }
            }
          }
          rt.state.shake = Math.max(rt.state.shake, 7);
          if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
          logEvent('GRAVITON BULWARK // GRAVITATIONAL OVERLOAD BURST');
          if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'GRAVITON BURST // BULLETS DISSIPATED';
        }
      } else {
        var scrapXp = orb.value;
        if (rt.state.route && rt.state.route.xpMultiplier && rt.state.route.xpMultiplier !== 1) {
          scrapXp = Math.round((scrapXp || 0) * rt.state.route.xpMultiplier);
        }
        if (typeof p.scrapXpMult === 'number' && p.scrapXpMult > 0 && p.scrapXpMult !== 1) {
          scrapXp = Math.round((scrapXp || 0) * p.scrapXpMult);
        }
        addXp(scrapXp);
        var scrapCap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
        p.energy = Math.min(scrapCap, (p.energy || 0) + 3.5);
        AudioFX.pickup('scrap');
        spawnParticles(orb.x, orb.y, '#75d1b0', 6, 90, 2);
      }
      onPickup(orb, p);
      rt.state.orbs.splice(oi, 1);
    } else if (orb.life <= 0) rt.state.orbs.splice(oi, 1);
  }
}
