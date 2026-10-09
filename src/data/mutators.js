// Wave mutators. Boss waves never roll one. The same id does not repeat on consecutive waves.

export var MUTATORS = {
  swarm: {
    id: 'swarm',
    name: 'SWARM TIDE',
    blurb: 'Faster spawns, thinner hulls.',
    detail: 'Spawn interval ×0.6, enemy HP ×0.7, crawler and scurrier weights ×2. Kills score ×1.1.'
  },
  'elite-convoy': {
    id: 'elite-convoy',
    name: 'ELITE CONVOY',
    blurb: 'Elites pack the lane.',
    detail: 'Elite chance ×2.5, enemy cap ×0.7. Elite crates rise from 15% to 40%.'
  },
  'scrap-rain': {
    id: 'scrap-rain',
    name: 'SCRAP RAIN',
    blurb: 'The sky drops hot salvage.',
    detail: 'Every 3s a meteor warns for 0.8s (r 34), hits for 12, and leaves 4 scrap.'
  },
  barrage: {
    id: 'barrage',
    name: 'ARTILLERY BARRAGE',
    blurb: 'Off-map guns find you.',
    detail: 'Every 5s, three lava warnings near you. Wave end pays +200.'
  },
  'dust-devils': {
    id: 'dust-devils',
    name: 'DUST DEVILS',
    blurb: 'Two funnels walk the basin.',
    detail: 'Radius 60, pull 40 px/s. Player shots that cross them yaw 15°.'
  },
  overcharged: {
    id: 'overcharged',
    name: 'OVERCHARGED',
    blurb: 'Everything runs hot.',
    detail: 'Enemy speed ×1.2. Your battery regen ×2.'
  }
};

export var MUTATOR_IDS = ['swarm', 'elite-convoy', 'scrap-rain', 'barrage', 'dust-devils', 'overcharged'];

export function mutatorById(id) {
  return MUTATORS[id] || null;
}
