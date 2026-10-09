// Optional per-wave contracts. Offered on non-boss waves from wave 3.
// Rewards are rolled when the wave opens: reroll, repair 25, or 300 × act score.

export var CONTRACTS = {
  'barrel-kills': {
    id: 'barrel-kills',
    name: 'BARREL HARVEST',
    label: 'BARRELS',
    detail: 'Kill 4 enemies with a barrel or a core.',
    goal: 4,
    minWave: 3
  },
  'no-damage': {
    id: 'no-damage',
    name: 'UNBROKEN',
    label: 'CLEAN',
    detail: 'Take no damage for 20 seconds.',
    goal: 20,
    minWave: 3
  },
  graze: {
    id: 'graze',
    name: 'THREAD THE FIRE',
    label: 'GRAZE',
    detail: 'Graze 12 enemy shots.',
    goal: 12,
    minWave: 4
  },
  'just-dash': {
    id: 'just-dash',
    name: 'JUST IN TIME',
    label: 'JUST',
    detail: 'Land 3 Just Dashes.',
    goal: 3,
    minWave: 4
  },
  combo: {
    id: 'combo',
    name: 'CHAIN EIGHT',
    label: 'COMBO',
    detail: 'Reach a x8 kill chain.',
    goal: 8,
    minWave: 6
  },
  'elite-hunt': {
    id: 'elite-hunt',
    name: 'ELITE HUNT',
    label: 'ELITES',
    detail: 'Kill 2 elites.',
    goal: 2,
    minWave: 6
  },
  'spire-chain': {
    id: 'spire-chain',
    name: 'SPIRE CHAIN',
    label: 'SPIRE',
    detail: 'One spire resonance hits 5 or more enemies.',
    goal: 5,
    minWave: 6
  }
};

export function contractById(id) {
  return CONTRACTS[id] || null;
}
