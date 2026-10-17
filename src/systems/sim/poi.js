import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { clamp, dist2 } from '../../core/utils.js';
import { damageEnemy, killEnemy } from '../combat.js';
import { spawnEnemy } from '../spawning.js';

/**
 * 6 Tactical Points of Interest (POIs) across 3520x2640 Wasteland Map:
 * 1. Scrap Silo (廢料提煉塔): 20s wave defense, periodic shockwave, massive scrap burst + magnet aura
 * 2. Orbital Pod (戰術軌道空投倉): Crush damage on entry, unlocks/recharges 100% energy + overdrive
 * 3. Field Rig (遺棄改裝工作站): Holographic workbench, one-time run overclock modifier
 * 4. Xeno Nest (異形母巢裂隙): 650 HP durable spawner of Spitters/Burrowers, legendary loot on kill
 * 5. EMP Spire (電磁共振尖塔): 3 capacitors, screenwide EMP paralysis + shield pierce on overload
 * 6. Bunker Cache (加固裝甲地堡): 150 HP blast door weak to explosions, drops full medkit + 30 crit ammo
 */

export function makePoiEntity(def) {
  return {
    id: def.id,
    kind: def.kind,
    name: def.name || '',
    x: def.x,
    y: def.y,
    r: def.r || 80,
    status: def.status || 'idle', // 'idle' | 'interacting' | 'active' | 'completed' | 'destroyed'
    progress: 0.0,
    interactTimer: 0.0,
    activeTimer: 0.0,
    targetTime: def.targetTime || 0.0,
    shockTimer: 0.0,
    hp: def.maxHp || 0,
    maxHp: def.maxHp || 0,
    capacitors: def.capacitors || 0,
    maxCapacitors: def.capacitors || 0,
    eliteKind: def.eliteKind || null,
    spawnTimer: 0.0,
    pingTimer: 0.0,
    isTriggered: false,
    label: def.label || '',
    pulsePhase: rng('visual') * TAU
  };
}

export function createDefaultPois() {
  return [
    // 1. Scrap Silos (North & South)
    makePoiEntity({
      id: 'silo_north',
      kind: 'scrap_silo',
      name: '廢料提煉塔·北',
      label: 'SILO-N',
      x: 1760,
      y: 520,
      r: 130,
      targetTime: 20
    }),
    makePoiEntity({
      id: 'silo_south',
      kind: 'scrap_silo',
      name: '廢料提煉塔·南',
      label: 'SILO-S',
      x: 1760,
      y: 2120,
      r: 130,
      targetTime: 20
    }),
    // 2. Orbital Drop Pod (Central-West Landing Zone)
    makePoiEntity({
      id: 'pod_central',
      kind: 'orbital_pod',
      name: '戰術軌道空投倉',
      label: 'ORBITAL POD',
      x: 1150,
      y: 1100,
      r: 85,
      targetTime: 1.0
    }),
    // 3. Field Modification Rig (Far West Outpost)
    makePoiEntity({
      id: 'rig_west',
      kind: 'field_rig',
      name: '遺棄改裝工作站',
      label: 'FIELD RIG',
      x: 650,
      y: 1320,
      r: 90,
      targetTime: 0.8
    }),
    // 4. Xeno Nest Fissure (Far East Infestation)
    makePoiEntity({
      id: 'nest_east',
      kind: 'xeno_nest',
      name: '異形母巢裂隙',
      label: 'XENO NEST',
      x: 2850,
      y: 1320,
      r: 110,
      maxHp: 650,
      hp: 650,
      eliteKind: 'spitter'
    }),
    // 5. EMP Resonance Spire (Northwest Highlands)
    makePoiEntity({
      id: 'spire_nw',
      kind: 'emp_spire',
      name: '電磁共振尖塔',
      label: 'EMP SPIRE',
      x: 950,
      y: 650,
      r: 95,
      capacitors: 3,
      maxCapacitors: 3,
      maxHp: 240,
      hp: 240
    }),
    // 6. Bunker Cache (Southeast Fortification)
    makePoiEntity({
      id: 'bunker_se',
      kind: 'bunker_cache',
      name: '加固裝甲地堡',
      label: 'BUNKER CACHE',
      x: 2600,
      y: 2000,
      r: 90,
      maxHp: 150,
      hp: 150
    })
  ];
}

function spawnScrapBurst(cx, cy, count) {
  if (!rt.state || !rt.state.orbs) return;
  var TAU = Math.PI * 2;
  var n = Math.min(count || 60, 100);
  for (var i = 0; i < n; i += 1) {
    var ang = rng('spawn') * TAU;
    var dist = 20 + rng('spawn') * 90;
    var speed = 80 + rng('spawn') * 160;
    rt.state.orbs.push({
      x: cx + Math.cos(ang) * 15,
      y: cy + Math.sin(ang) * 15,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: 4.5,
      val: 1,
      kind: 'scrap'
    });
  }
}

export function stepPois(dt, frame) {
  if (!rt.state || rt.state.paused || rt.state.over) return;
  var pois = rt.state.pois;
  if (!pois || pois.length === 0) return;

  var p = frame.p || (rt.state ? rt.state.player : null);
  if (!p) return;

  var bullets = rt.state.bullets || [];
  var enemies = rt.state.enemies || [];
  var barrels = rt.state.barrels || [];

  for (var i = 0; i < pois.length; i += 1) {
    var poi = pois[i];
    if (!poi) continue;

    poi.pulsePhase = (poi.pulsePhase + dt * 2.5) % TAU;
    var dx = p.x - poi.x;
    var dy = p.y - poi.y;
    var distSq = dx * dx + dy * dy;
    var dist = Math.sqrt(distSq);
    var inRange = dist <= poi.r;

    // 1. Scrap Extraction Silo
    if (poi.kind === 'scrap_silo') {
      if (poi.status === 'idle') {
        if (inRange) {
          poi.interactTimer += dt;
          poi.progress = Math.min(1, poi.interactTimer / 1.5);
          if (poi.interactTimer >= 1.5) {
            poi.status = 'active';
            poi.activeTimer = poi.targetTime || 20.0;
            poi.progress = 0;
            poi.shockTimer = 0;
            if (AudioFX && typeof AudioFX.bountyClaim === 'function') AudioFX.bountyClaim();
            if (rt.state) {
              rt.state.banner = 2.0;
              rt.state.bannerText = 'SILO OVERCHARGE DEFENSE: 20s HAZARD LOCKDOWN!';
            }
            // Spawn initial guard wave
            for (var si = 0; si < 5; si += 1) spawnEnemy();
          }
        } else {
          poi.interactTimer = Math.max(0, poi.interactTimer - dt * 1.5);
          poi.progress = poi.interactTimer / 1.5;
        }
      } else if (poi.status === 'active') {
        poi.activeTimer -= dt;
        poi.progress = Math.min(1, 1 - (poi.activeTimer / (poi.targetTime || 20.0)));
        poi.shockTimer += dt;

        // Seismic shockwave every 5 seconds
        if (poi.shockTimer >= 5.0) {
          poi.shockTimer = 0;
          if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
          if (rt.state.shockRings) {
            rt.state.shockRings.push({ x: poi.x, y: poi.y, r: 10, maxR: 180, life: 0.45, maxLife: 0.45, color: '#f5a623' });
          }
          // Pushback and stun nearby enemies
          for (var ei = 0; ei < enemies.length; ei += 1) {
            var e = enemies[ei];
            if (!e || e.hp <= 0) continue;
            var edx = e.x - poi.x;
            var edy = e.y - poi.y;
            var eDist = Math.hypot(edx, edy) || 1;
            if (eDist <= 180) {
              e.stun = Math.max(e.stun || 0, 2.0);
              e.vx = (edx / eDist) * 250;
              e.vy = (edy / eDist) * 250;
            }
          }
        }

        // Completion
        if (poi.activeTimer <= 0) {
          poi.status = 'completed';
          poi.progress = 1.0;
          spawnScrapBurst(poi.x, poi.y, 80);
          p.magnetRadius = Math.max(p.magnetRadius || 165, 600);
          p.magnetBonusTimer = 5.0;
          if (rt.state) {
            rt.state.banner = 2.5;
            rt.state.bannerText = 'EXTRACTION COMPLETE: +80 REFINED SCRAP & 600px VACUUM!';
          }
        }
      }
    }

    // 2. Orbital Drop Pod
    else if (poi.kind === 'orbital_pod') {
      if (poi.status === 'idle') {
        if (inRange) {
          poi.interactTimer += dt;
          poi.progress = Math.min(1, poi.interactTimer / 1.0);
          if (poi.interactTimer >= 1.0) {
            poi.status = 'completed';
            poi.progress = 1.0;
            p.energy = p.maxEnergy || 100;
            p.hp = Math.min(p.maxHp || 100, p.hp + 50);
            p.overdrive = Math.max(p.overdrive || 0, 6.0);
            spawnParticles(poi.x, poi.y, '#38d9a9', 24, 160, 3);
            if (AudioFX && typeof AudioFX.overdriveStart === 'function') AudioFX.overdriveStart();
            if (rt.state) {
              rt.state.banner = 2.2;
              rt.state.bannerText = 'ORBITAL POD OPENED: FULL OVERDRIVE & BATTERY OVERCHARGE!';
            }
          }
        } else {
          poi.interactTimer = Math.max(0, poi.interactTimer - dt * 2);
          poi.progress = poi.interactTimer / 1.0;
        }
      }
    }

    // 3. Field Modification Rig
    else if (poi.kind === 'field_rig') {
      if (poi.status === 'idle') {
        if (inRange) {
          poi.interactTimer += dt;
          poi.progress = Math.min(1, poi.interactTimer / 0.8);
          if (poi.interactTimer >= 0.8) {
            poi.status = 'completed';
            poi.progress = 1.0;
            // Grant field overclock: +35% fireRate, -20% damageTaken
            p.fireRate = Math.max(0.08, p.fireRate * 0.75);
            p.damageTakenMult = (p.damageTakenMult || 1) * 0.80;
            p.speed = Math.round(p.speed * 1.15);
            spawnParticles(poi.x, poi.y, '#4dabf7', 20, 140, 2.8);
            if (AudioFX && typeof AudioFX.upgrade === 'function') AudioFX.upgrade();
            if (rt.state) {
              rt.state.banner = 2.5;
              rt.state.bannerText = 'FIELD RIG OVERCLOCK: +35% CYCLIC RATE & HARDENED CHASSIS!';
            }
          }
        } else {
          poi.interactTimer = Math.max(0, poi.interactTimer - dt * 2);
          poi.progress = poi.interactTimer / 0.8;
        }
      }
    }

    // 4. Xeno Nest Fissure
    else if (poi.kind === 'xeno_nest') {
      if (poi.status !== 'destroyed') {
        poi.spawnTimer += dt;
        // Spawns an enemy every 6.5s
        if (poi.spawnTimer >= 6.5) {
          poi.spawnTimer = 0;
          var spawned = spawnEnemy();
          if (spawned) {
            spawned.x = poi.x + (rng('spawn') - 0.5) * 40;
            spawned.y = poi.y + (rng('spawn') - 0.5) * 40;
          }
        }

        // Bullet collision with nest
        for (var bi = 0; bi < bullets.length; bi += 1) {
          var b = bullets[bi];
          if (!b || b.life <= 0) continue;
          var bDist = Math.hypot(b.x - poi.x, b.y - poi.y);
          if (bDist <= poi.r * 0.75) {
            var dmg = (b.damage || 20) * 0.40; // 60% armor reduction
            poi.hp -= dmg;
            b.life = 0;
            spawnParticles(b.x, b.y, '#b197fc', 4, 80, 2);
            if (poi.hp <= 0) {
              poi.hp = 0;
              poi.status = 'destroyed';
              if (AudioFX && typeof AudioFX.eliteDeath === 'function') AudioFX.eliteDeath();
              spawnParticles(poi.x, poi.y, '#9775fa', 36, 220, 4);
              if (rt.state.shockRings) {
                rt.state.shockRings.push({ x: poi.x, y: poi.y, r: 10, maxR: 200, life: 0.5, maxLife: 0.5, color: '#b197fc' });
              }
              // Kill surrounding trash
              for (var cEi = 0; cEi < enemies.length; cEi += 1) {
                var ce = enemies[cEi];
                if (ce && ce.hp > 0 && Math.hypot(ce.x - poi.x, ce.y - poi.y) <= 200) {
                  damageEnemy(ce, 400);
                }
              }
              spawnScrapBurst(poi.x, poi.y, 40);
              if (rt.state.volatileCores) {
                rt.state.volatileCores.push({ x: poi.x, y: poi.y, r: 14, hp: 40, maxHp: 40, rot: 0 });
              }
              if (rt.state) {
                rt.state.banner = 2.5;
                rt.state.bannerText = 'XENO NEST DESTROYED: SHOCKWAVE DETONATED!';
              }
              break;
            }
          }
        }
      }
    }

    // 5. EMP Resonance Spire
    else if (poi.kind === 'emp_spire') {
      if (poi.status !== 'completed') {
        for (var spBi = 0; spBi < bullets.length; spBi += 1) {
          var spB = bullets[spBi];
          if (!spB || spB.life <= 0) continue;
          var spDist = Math.hypot(spB.x - poi.x, spB.y - poi.y);
          if (spDist <= poi.r * 0.8) {
            poi.hp -= spB.damage || 25;
            spB.life = 0;
            poi.capacitors = Math.max(0, Math.ceil(poi.hp / 80));
            spawnParticles(spB.x, spB.y, '#7950f2', 5, 110, 2);

            if (poi.hp <= 0) {
              poi.hp = 0;
              poi.capacitors = 0;
              poi.status = 'completed';
              if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
              // Screenwide EMP wave
              for (var sei = 0; sei < enemies.length; sei += 1) {
                var se = enemies[sei];
                if (!se || se.hp <= 0) continue;
                se.stun = Math.max(se.stun || 0, 3.5);
                se.shield = 0;
              }
              if (rt.state.shockRings) {
                rt.state.shockRings.push({ x: poi.x, y: poi.y, r: 10, maxR: 350, life: 0.6, maxLife: 0.6, color: '#7950f2' });
              }
              if (rt.state.lightningArcs) {
                for (var lai = 0; lai < 3; lai += 1) {
                  rt.state.lightningArcs.push({
                    x0: poi.x,
                    y0: poi.y,
                    x1: poi.x + (rng('visual') - 0.5) * 500,
                    y1: poi.y + (rng('visual') - 0.5) * 500,
                    life: 0.35,
                    maxLife: 0.35,
                    color: '#e599f7'
                  });
                }
              }
              if (rt.state) {
                rt.state.banner = 2.5;
                rt.state.bannerText = 'EMP SPIRE OVERLOAD: 3.5s TOTAL FIELD STUN & SHIELDS SHATTERED!';
              }
              break;
            }
          }
        }
      }
    }

    // 6. Bunker Cache
    else if (poi.kind === 'bunker_cache') {
      if (poi.status !== 'completed') {
        // Check bullet damage
        for (var bki = 0; bki < bullets.length; bki += 1) {
          var bkB = bullets[bki];
          if (!bkB || bkB.life <= 0) continue;
          var bkDist = Math.hypot(bkB.x - poi.x, bkB.y - poi.y);
          if (bkDist <= poi.r * 0.75) {
            poi.hp -= (bkB.damage || 20);
            bkB.life = 0;
            spawnParticles(bkB.x, bkB.y, '#ffd43b', 4, 90, 2);
          }
        }
        // Check explosive barrel proximity detonations
        for (var barI = 0; barI < barrels.length; barI += 1) {
          var bar = barrels[barI];
          if (bar && bar.state === 'exploding' && Math.hypot(bar.x - poi.x, bar.y - poi.y) <= 120) {
            poi.hp -= 90; // explosive vulnerability
          }
        }

        if (poi.hp <= 0) {
          poi.hp = 0;
          poi.status = 'completed';
          p.hp = p.maxHp || 100;
          p.guaranteedCrits = (p.guaranteedCrits || 0) + 30;
          spawnParticles(poi.x, poi.y, '#ffd43b', 28, 170, 3.5);
          if (AudioFX && typeof AudioFX.upgrade === 'function') AudioFX.upgrade();
          if (rt.state) {
            rt.state.banner = 2.5;
            rt.state.bannerText = 'BUNKER BREACHED: FULL EMERGENCY REPAIR & 30 AP CRITICAL ROUNDS!';
          }
        }
      }
    }
  }

  // Decay magnet bonus timer
  if (p.magnetBonusTimer > 0) {
    p.magnetBonusTimer -= dt;
    if (p.magnetBonusTimer <= 0) {
      p.magnetRadius = 165;
    }
  }
}
