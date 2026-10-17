import { TAU } from '../../config.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { POI_REGISTRY, getPoiType, registerPoiType, spawnScrapBurst } from './poi-registry.js';

export { POI_REGISTRY, getPoiType, registerPoiType, spawnScrapBurst };

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

export function stepPois(dt, frame) {
  if (!rt.state || rt.state.paused || rt.state.over) return;
  var pois = rt.state.pois;
  if (!pois || pois.length === 0) return;

  var p = (frame && frame.p) || (rt.state ? rt.state.player : null);
  if (!p) return;

  for (var i = 0; i < pois.length; i += 1) {
    var poi = pois[i];
    if (!poi) continue;

    poi.pulsePhase = (poi.pulsePhase + dt * 2.5) % TAU;
    var dx = p.x - poi.x;
    var dy = p.y - poi.y;
    var distSq = dx * dx + dy * dy;
    var dist = Math.sqrt(distSq);
    var inRange = dist <= poi.r;

    var handler = getPoiType(poi.kind);
    if (handler && typeof handler.step === 'function') {
      handler.step(poi, dt, frame, inRange, dist, distSq);
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
