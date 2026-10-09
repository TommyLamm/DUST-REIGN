// Sector routes. One rule lasts the whole act and stacks with mutators.
// state.route.scoreMult is what scoring reads. scoreMultiplier stays as the same number.

export var ROUTES = [
  {
    id: 'scorched',
    name: 'SCORCHED FLATS',
    rule: 'Lava lasts +1s. One extra barrel each wave.',
    reward: 'Score ×1.10',
    sector: 'rust',
    scoreMultiplier: 1.1,
    xpMultiplier: 1,
    batteryRegenMultiplier: 1,
    stormScoreMultiplier: 1,
    eliteChanceBonus: 0,
    bruteWeightBonus: 0,
    bulletSpeedScale: 1,
    extraBarrels: 1,
    extraSpires: 0,
    moltenBonus: 1,
    stormSeconds: 0,
    convoy: false,
    blackout: false
  },
  {
    id: 'ironfield',
    name: 'IRON FIELD',
    rule: 'Brute weight +10%. Scrap XP +20%.',
    reward: 'Act opens with +1 reroll',
    sector: 'dusk',
    scoreMultiplier: 1,
    xpMultiplier: 1.2,
    batteryRegenMultiplier: 1,
    stormScoreMultiplier: 1,
    eliteChanceBonus: 0,
    bruteWeightBonus: 0.1,
    bulletSpeedScale: 1,
    extraBarrels: 0,
    extraSpires: 0,
    moltenBonus: 0,
    stormSeconds: 0,
    convoy: false,
    blackout: false
  },
  {
    id: 'static',
    name: 'STATIC MIRE',
    rule: 'One extra spire each wave. Enemy shots +10% speed.',
    reward: 'Battery regen +50%',
    sector: 'night',
    scoreMultiplier: 1,
    xpMultiplier: 1,
    batteryRegenMultiplier: 1.5,
    stormScoreMultiplier: 1,
    eliteChanceBonus: 0,
    bruteWeightBonus: 0,
    bulletSpeedScale: 1.1,
    extraBarrels: 0,
    extraSpires: 1,
    moltenBonus: 0,
    stormSeconds: 0,
    convoy: false,
    blackout: false
  },
  {
    id: 'blackout',
    name: 'BLACKOUT',
    rule: 'Vision closes in. Elite chance +4%.',
    reward: 'Score ×1.20',
    sector: 'night',
    scoreMultiplier: 1.2,
    xpMultiplier: 1,
    batteryRegenMultiplier: 1,
    stormScoreMultiplier: 1,
    eliteChanceBonus: 0.04,
    bruteWeightBonus: 0,
    bulletSpeedScale: 1,
    extraBarrels: 0,
    extraSpires: 0,
    moltenBonus: 0,
    stormSeconds: 0,
    convoy: false,
    blackout: true
  },
  {
    id: 'convoy',
    name: 'SCRAP CONVOY',
    rule: 'An armored hauler crosses once each wave.',
    reward: 'Each wreck drops a supply crate',
    sector: 'rust',
    scoreMultiplier: 1,
    xpMultiplier: 1,
    batteryRegenMultiplier: 1,
    stormScoreMultiplier: 1,
    eliteChanceBonus: 0,
    bruteWeightBonus: 0,
    bulletSpeedScale: 1,
    extraBarrels: 0,
    extraSpires: 0,
    moltenBonus: 0,
    stormSeconds: 0,
    convoy: true,
    blackout: false
  },
  {
    id: 'stormwall',
    name: 'STORM WALL',
    rule: 'The storm front lasts 8 seconds.',
    reward: 'Storm Breaker score ×2',
    sector: 'night',
    scoreMultiplier: 1,
    xpMultiplier: 1,
    batteryRegenMultiplier: 1,
    stormScoreMultiplier: 2,
    eliteChanceBonus: 0,
    bruteWeightBonus: 0,
    bulletSpeedScale: 1,
    extraBarrels: 0,
    extraSpires: 0,
    moltenBonus: 0,
    stormSeconds: 8,
    convoy: false,
    blackout: false
  }
];

var scoreStamp;
for (scoreStamp = 0; scoreStamp < ROUTES.length; scoreStamp += 1) {
  var stamped = ROUTES[scoreStamp];
  if (stamped.id === 'scorched') stamped.scoreMult = 1.1;
  else if (stamped.id === 'blackout') stamped.scoreMult = 1.2;
  else stamped.scoreMult = 1;
}

export function routeById(id) {
  var i;
  for (i = 0; i < ROUTES.length; i += 1) {
    if (ROUTES[i].id === id) return ROUTES[i];
  }
  return null;
}

export function routeIds() {
  var out = [];
  var i;
  for (i = 0; i < ROUTES.length; i += 1) out.push(ROUTES[i].id);
  return out;
}
