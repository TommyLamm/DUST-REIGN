import { AudioFX } from '../../audio/audio-fx.js';
import { OVERDRIVE_DURATION, REPAIR_OVERFLOW_SCORE } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { rt } from '../../core/runtime.js';
import { dist2, fastUnorderedRemove } from '../../core/utils.js';
import { getHeatModifiers } from '../../data/heat.js';
import { triggerTeslaCoil } from '../abilities.js';
import { onPickup } from '../card-effects.js';
import { resolveConvoyHits } from '../mutators.js';
import { addXp } from '../progression.js';
import { addScore } from '../scoring.js';
import { noteMetaEvent } from '../meta.js';
import { logEvent, setStatusText } from '../../ui/hud.js';

function isCrate(orb) {
  return !!orb && (orb.kind === 'crate' || orb.type === 'crate');
}

function grantBulkheadShield(p, leftover) {
  if (leftover > 0 && p.tempArmorCap) {
    var curShield = p.shield || 0;
    var shieldGain = Math.min(leftover, Math.max(0, p.tempArmorCap - curShield));
    if (shieldGain > 0) {
      p.shield = curShield + shieldGain;
      logEvent('SCRAP BULKHEAD // +' + Math.round(shieldGain) + ' TEMP SHIELD');
    }
  }
}

function applyCrate(orb, p) {
  var id = orb.payload || 'repair';
  var amount = orb.amount || 0;
  if (id === 'repair') {
    var healed = Math.max(0, Math.min(amount || 30, p.maxHp - p.hp));
    p.hp += healed;
    grantBulkheadShield(p, (amount || 30) - healed);
    noteMetaEvent('repair-pickup', { healed: healed });
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
  // Early-run magnet bump until first upgrade so scrap to level 2 is easier to vacuum.
  var magnetReach = p.magnetRadius || 165;
  if ((rt.state.level || 1) <= 1) magnetReach += 40;
  for (var oi = rt.state.orbs.length - 1; oi >= 0; oi -= 1) {
    var orb = rt.state.orbs[oi];
    var crate = isCrate(orb);
    var isStormCore = (orb.kind === 'storm_core');
    var odx = p.x - orb.x;
    var ody = p.y - orb.y;
    var od = Math.hypot(odx, ody) || 1;
    var reach = magnetReach;
    if (orb.kind === 'repair' && typeof p.repairPickupRadiusMult === 'number') {
      reach *= p.repairPickupRadiusMult;
    }
    var pickupRadius = isStormCore ? (p.r + orb.r + 14) : (p.r + orb.r + 5);
    // Latch magnet once the orb enters reach: never cancel if the player outruns
    // the radius (dash / dash-burst used to leave scrap lagging on the ground).
    if (!crate && !isStormCore && (orb.magnetized || od < reach)) {
      if (!orb.magnetized) orb.magnetized = true;
      orb.magnetAge = (orb.magnetAge || 0) + dt;
      // Ramp chase so a latched orb catches a fast player; skip heavy damp.
      var chase = 480 + Math.min(orb.magnetAge, 1.25) * 820;
      orb.vx = (odx / od) * chase;
      orb.vy = (ody / od) * chase;
      // Guarantee collect when close enough — snap into the player.
      if (od <= Math.max(pickupRadius * 2.5, 42)) {
        orb.x = p.x;
        orb.y = p.y;
        orb.vx = 0;
        orb.vy = 0;
        od = 0;
      } else {
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        odx = p.x - orb.x;
        ody = p.y - orb.y;
        od = Math.hypot(odx, ody) || 1;
      }
    } else {
      orb.vx *= Math.pow(0.08, dt);
      orb.vy *= Math.pow(0.08, dt);
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      odx = p.x - orb.x;
      ody = p.y - orb.y;
      od = Math.hypot(odx, ody) || 1;
    }
    orb.life -= dt;
    if (od < pickupRadius) {
      if (!crate && p.teslaCoil && rt.state.enemies.length > 0) {
        triggerTeslaCoil(orb);
      }
      if (crate) {
        applyCrate(orb, p);
      } else if (isStormCore) {
        var act = (rt.state && rt.state.act) || 1;
        addScore(800 * act, 'storm');
        p.overdrive = Math.max(p.overdrive || 0, 3.0);
        AudioFX.pickup('overdrive');
        spawnParticles(orb.x, orb.y, '#00f3ff', 16, 200, 3.5);

        var waveR = 220;
        if (rt.state.shockRings) {
          rt.state.shockRings.push({
            x: p.x,
            y: p.y,
            r: 12,
            maxR: waveR,
            life: 0.35,
            maxLife: 0.35,
            color: '#00f3ff'
          });
        }
        if (rt.state.enemyBullets) {
          for (var bi = rt.state.enemyBullets.length - 1; bi >= 0; bi -= 1) {
            var eb = rt.state.enemyBullets[bi];
            if (dist2(p.x, p.y, eb.x, eb.y) <= waveR * waveR) {
              spawnParticles(eb.x, eb.y, '#00f3ff', 4, 80, 2);
              fastUnorderedRemove(rt.state.enemyBullets, bi);
            }
          }
        }
        if (rt.state.enemies) {
          for (var ei = 0; ei < rt.state.enemies.length; ei += 1) {
            var foe = rt.state.enemies[ei];
            if (foe.hp > 0 && dist2(p.x, p.y, foe.x, foe.y) <= (waveR + (foe.r || 10)) * (waveR + (foe.r || 10))) {
              foe.empTimer = Math.max(foe.empTimer || 0, 1.8);
              spawnParticles(foe.x, foe.y, '#00f3ff', 5, 90, 2);
            }
          }
        }
        rt.state.shake = Math.max(rt.state.shake || 0, 6);
        logEvent('STORM CORE SIPHONED // OVERDRIVE 3s + EMP SHOCKWAVE');

        rt.state.stormCoresHarvested = (rt.state.stormCoresHarvested || 0) + 1;
        if (rt.state.stormCoresHarvested === 3) {
          addScore(2000 * act, 'storm');
          logEvent('STORM HARVEST GRAND SLAM // +2000 SCORE');
          if (AudioFX && typeof AudioFX.levelUp === 'function') AudioFX.levelUp();
          spawnParticles(p.x, p.y, '#ffd700', 25, 240, 4);
          rt.state.banner = Math.max(rt.state.banner || 0, 2.5);
          rt.state.bannerText = 'STORM HARVEST GRAND SLAM // +' + (2000 * act) + ' SCORE';
        }
      } else if (orb.kind === 'overdrive') {
        var dur = OVERDRIVE_DURATION + (p.overdriveDurationBonus || 0);
        p.overdrive = dur;
        AudioFX.pickup('overdrive');
        spawnParticles(orb.x, orb.y, '#f0cf88', 14, 160, 3);
      } else if (orb.kind === 'repair') {
        var healCap = getHeatModifiers(rt.state.heat || 0).repairHeal + ((typeof p.repairBonus === 'number') ? p.repairBonus : 0);
        var healed = Math.max(0, Math.min(healCap, p.maxHp - p.hp));
        p.hp += healed;
        grantBulkheadShield(p, healCap - healed);
        noteMetaEvent('repair-pickup', { healed: healed });
        AudioFX.pickup('repair');
        if (healed > 0) {
          setStatusText('REPAIR SCRAP +' + Math.round(healed) + ' HULL');
          logEvent('REPAIR SCRAP +' + Math.round(healed) + ' HULL');
        } else {
          addScore(REPAIR_OVERFLOW_SCORE, 'repair');
          setStatusText('REPAIR SCRAP FULL +' + REPAIR_OVERFLOW_SCORE + ' SCORE');
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
                fastUnorderedRemove(rt.state.enemyBullets, debi);
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
          setStatusText('GRAVITON BURST // BULLETS DISSIPATED');
        }
      } else {
        var scrapXp = (typeof orb.value === 'number' && isFinite(orb.value)) ? orb.value
          : ((typeof orb.val === 'number' && isFinite(orb.val)) ? orb.val : 10);
        if (rt.state.route && rt.state.route.xpMultiplier && rt.state.route.xpMultiplier !== 1) {
          scrapXp = Math.round((scrapXp || 0) * rt.state.route.xpMultiplier);
        }
        if (typeof p.scrapXpMult === 'number' && p.scrapXpMult > 0 && p.scrapXpMult !== 1) {
          scrapXp = Math.round((scrapXp || 0) * p.scrapXpMult);
        }
        // Longer Titan fights farmed +35% end XP (757→1020) and dropped Dread p50 60→46.
        // Dampen scrap XP while any boss lives — root-cause coupling, not a Dread hull/stun lever.
        if (rt.state.boss && rt.state.boss.hp > 0) {
          scrapXp = Math.max(1, Math.round((scrapXp || 0) * 0.55));
        }
        addXp(scrapXp);
        var scrapCap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
        p.energy = Math.min(scrapCap, (p.energy || 0) + 3.5);
        AudioFX.pickup('scrap');
        spawnParticles(orb.x, orb.y, '#75d1b0', 6, 90, 2);
      }
      onPickup(orb, p);
      fastUnorderedRemove(rt.state.orbs, oi);
    } else if (orb.life <= 0) fastUnorderedRemove(rt.state.orbs, oi);
  }
}
