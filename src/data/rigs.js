// Rig definitions. applyRig writes absolute chassis fields on the existing player
// object (it does not replace the player). Scrapper matches makeState() defaults.
// dashDistance, dashCooldownMult, dashHeatReset, and crateDropMult are for WP-E / WP-C.

export var RIGS = [
  {
    id: 'scrapper',
    name: 'SCRAPPER',
    blurb: 'Stock hull. No tricks.',
    req: '',
    maxHp: 100,
    speed: 235,
    dashDistance: 140,
    dashCooldownMult: 1,
    dashHeatReset: 3,
    damageTakenMult: 1,
    repairBonus: 0,
    magnetRadius: 165,
    xpMult: 1,
    crateDropMult: 1,
    rerolls: 1
  },
  {
    id: 'strider',
    name: 'STRIDER',
    blurb: 'Light hull. Just Dash heat clears in 2s.',
    req: 'REQ: 25 JUST DASHES',
    maxHp: 80,
    speed: 265,
    dashDistance: 140,
    dashCooldownMult: 0.85,
    dashHeatReset: 2,
    damageTakenMult: 1,
    repairBonus: 0,
    magnetRadius: 165,
    xpMult: 1,
    crateDropMult: 1,
    rerolls: 1
  },
  {
    id: 'bulwark',
    name: 'BULWARK',
    blurb: 'Heavy hull. Repair scrap heals more.',
    req: 'REQ: REACH WAVE 10',
    maxHp: 120,
    speed: 210,
    dashDistance: 110,
    dashCooldownMult: 1,
    dashHeatReset: 3,
    damageTakenMult: 0.94,
    repairBonus: 6,
    magnetRadius: 165,
    xpMult: 1,
    crateDropMult: 1,
    rerolls: 1
  },
  {
    id: 'salvager',
    name: 'SALVAGER',
    blurb: 'Wider magnet, more XP, extra reroll.',
    req: 'REQ: 15 CONTRACTS',
    maxHp: 100,
    speed: 230,
    dashDistance: 140,
    dashCooldownMult: 1,
    dashHeatReset: 3,
    damageTakenMult: 1,
    repairBonus: 0,
    magnetRadius: 245,
    xpMult: 1.1,
    crateDropMult: 1.5,
    rerolls: 2
  }
];

export function getRig(id) {
  var i;
  for (i = 0; i < RIGS.length; i += 1) {
    if (RIGS[i].id === id) return RIGS[i];
  }
  return null;
}

export function applyRig(player, rigId) {
  if (!player) return null;
  var rig = getRig(rigId) || getRig('scrapper');
  player.maxHp = rig.maxHp;
  player.hp = rig.maxHp;
  player.speed = rig.speed;
  player.damageTakenMult = rig.damageTakenMult;
  player.repairBonus = rig.repairBonus;
  player.magnetRadius = rig.magnetRadius;
  player.xpMult = rig.xpMult;
  player.dashDistance = rig.dashDistance;
  player.dashCooldownMult = rig.dashCooldownMult;
  player.dashHeatReset = rig.dashHeatReset;
  player.crateDropMult = rig.crateDropMult;
  return rig;
}
