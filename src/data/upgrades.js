import { resyncMastery } from '../systems/weapons.js';

export var UPGRADES = [
  {
    id: 'rapid-fire',
    category: 'OFFENSE',
    rarity: 'common',
    maxStacks: 5,
    title: 'RAPID FIRE',
    text: 'Fire 12% faster',
    aliases: ['quick-hands'],
    apply: function (s) { s.player.fireRate *= 0.88; }
  },
  {
    id: 'scatter-shot',
    category: 'OFFENSE',
    rarity: 'common',
    maxStacks: 6,
    title: 'SCATTER SHOT',
    text: '+5 weapon damage',
    aliases: ['overcharge'],
    apply: function (s) { s.player.damage += 5; }
  },
  {
    id: 'heavy-plating',
    category: 'DEFENSE',
    rarity: 'common',
    maxStacks: 4,
    title: 'HEAVY PLATING',
    text: '+25 max health and heal 40 HP',
    aliases: ['field-medic'],
    apply: function (s) { s.player.maxHp += 25; s.player.hp = Math.min(s.player.maxHp, s.player.hp + 40); }
  },
  {
    id: 'overdrive-injector',
    category: 'TACTICAL',
    rarity: 'common',
    maxStacks: 3,
    title: 'OVERDRIVE INJECTOR',
    text: '+2.5s Overdrive length and trigger 3.5s Surge',
    aliases: ['road-runner'],
    apply: function (s) {
      s.player.overdriveDurationBonus = (s.player.overdriveDurationBonus || 0) + 2.5;
      s.player.overdrive = Math.max(s.player.overdrive, 3.5);
    }
  },
  {
    id: 'magnet-core',
    category: 'TACTICAL',
    rarity: 'common',
    maxStacks: 3,
    title: 'MAGNET CORE',
    text: '+65px magnet reach & +25% scrap XP',
    aliases: ['scavenger'],
    apply: function (s) {
      s.player.magnetRadius = (s.player.magnetRadius || 165) + 65;
      s.player.xpMult *= 1.25;
    }
  },
  {
    id: 'hot-load',
    category: 'OFFENSE',
    rarity: 'common',
    maxStacks: 4,
    title: 'HOT LOAD',
    text: '+180 bullet speed and size',
    apply: function (s) { s.player.bulletSpeed += 180; s.player.bulletSize += 1; }
  },
  {
    id: 'rail-slug',
    category: 'OFFENSE',
    rarity: 'common',
    maxStacks: 3,
    title: 'RAIL SLUG',
    text: 'Bullets pierce 1 enemy (70% damage retention)',
    apply: function (s) { s.player.pierce = (s.player.pierce || 0) + 1; }
  },
  {
    id: 'ricochet',
    category: 'OFFENSE',
    rarity: 'common',
    maxStacks: 3,
    title: 'KINETIC RICOCHET',
    text: 'Bullets bounce off screen border 1 time (90% speed)',
    apply: function (s) { s.player.bounces = (s.player.bounces || 0) + 1; }
  },
  {
    id: 'shockwave-dash',
    category: 'TACTICAL',
    rarity: 'rare',
    maxStacks: 1,
    title: 'SHOCKWAVE DASH',
    text: 'Dash pulse radius expands to 125px with 2x knockback',
    apply: function (s) { s.player.shockwaveDash = true; }
  },
  {
    id: 'tesla-coil',
    category: 'TACTICAL',
    rarity: 'rare',
    maxStacks: 1,
    title: 'TESLA COIL',
    text: 'Orb collection zaps up to 2 foes for 22 dmg',
    apply: function (s) { s.player.teslaCoil = true; }
  },
  {
    id: 'reactive-armor',
    category: 'DEFENSE',
    rarity: 'rare',
    maxStacks: 1,
    title: 'REACTIVE ARMOR',
    text: 'Taking damage releases a 360° defensive pulse (75px, 30 dmg)',
    apply: function (s) { s.player.reactiveArmor = true; }
  },
  {
    id: 'high-caliber',
    category: 'OFFENSE',
    rarity: 'rare',
    maxStacks: 1,
    title: 'HIGH CALIBER',
    text: 'Crit damage boosted to 2.2x & 20% flat crit chance',
    apply: function (s) { s.player.highCaliber = true; }
  },
  {
    id: 'servo-legs',
    category: 'MOBILITY',
    rarity: 'common',
    maxStacks: 3,
    title: 'SERVO LEGS',
    text: 'Move speed +8%',
    apply: function (s) { s.player.moveSpeedMult = (s.player.moveSpeedMult || 1) * 1.08; }
  },
  {
    id: 'dash-capacitor',
    category: 'MOBILITY',
    rarity: 'rare',
    maxStacks: 1,
    title: 'DASH CAPACITOR',
    text: 'Dash stores 2 charges, each regenerating on its own cooldown',
    apply: function (s) {
      var p = s.player;
      p.dashChargesMax = Math.max(p.dashChargesMax || 1, 2);
      p.dashCharges = Math.max(p.dashCharges || 0, p.dashChargesMax);
      p.dashIndependent = true;
    }
  },
  {
    id: 'ablative-mesh',
    category: 'DEFENSE',
    rarity: 'common',
    maxStacks: 3,
    title: 'ABLATIVE MESH',
    text: 'Damage taken ×0.92 (minimum 1)',
    apply: function (s) {
      var p = s.player;
      p.damageTakenMult = (p.damageTakenMult || 1) * 0.92;
      p.ablativeStacks = (p.ablativeStacks || 0) + 1;
    }
  },
  {
    id: 'salvage-protocol',
    category: 'DEFENSE',
    rarity: 'common',
    maxStacks: 2,
    title: 'SALVAGE PROTOCOL',
    text: 'Non-brute kills drop repair scrap +6%',
    apply: function (s) { s.player.salvageChance = (s.player.salvageChance || 0) + 0.06; }
  },
  {
    id: 'capacitor-bank',
    category: 'TACTICAL',
    rarity: 'common',
    maxStacks: 2,
    title: 'CAPACITOR BANK',
    text: 'Battery +25 max and +0.5 regen per second',
    apply: function (s) {
      var p = s.player;
      p.batteryMax = (p.batteryMax || 100) + 25;
      p.batteryRegen = (p.batteryRegen || 2) + 0.5;
    }
  },
  {
    id: 'emp-amplifier',
    category: 'TACTICAL',
    rarity: 'rare',
    maxStacks: 1,
    title: 'EMP AMPLIFIER',
    text: 'EMP radius +40 and energy cost 50 → 40',
    apply: function (s) {
      var p = s.player;
      p.empRadiusBonus = (p.empRadiusBonus || 0) + 40;
      p.empCost = Math.max(1, (typeof p.empCost === 'number' ? p.empCost : 50) - 10);
    }
  },
  {
    id: 'hollow-point',
    category: 'OFFENSE',
    rarity: 'rare',
    maxStacks: 1,
    title: 'HOLLOW POINT',
    text: '+35% damage to enemies below 30% HP',
    apply: function (s) { s.player.hollowPoint = true; }
  },
  {
    id: 'afterburner',
    category: 'MOBILITY',
    rarity: 'rare',
    maxStacks: 1,
    title: 'AFTERBURNER',
    text: 'For 1s after a dash, fire cooldown ×0.7',
    apply: function (s) { s.player.afterburner = true; }
  },
  {
    id: 'tracer-rounds',
    category: 'WEAPON',
    rarity: 'rare',
    maxStacks: 1,
    weapon: 'standard',
    title: 'TRACER ROUNDS',
    text: 'Every 5th round pierces +2 and always crits. Mastery +1',
    apply: function (s) {
      s.player.tracerRounds = true;
      resyncMastery(s.player, s);
    }
  },
  {
    id: 'flechette-pack',
    category: 'WEAPON',
    rarity: 'rare',
    maxStacks: 1,
    weapon: 'breacher',
    title: 'FLECHETTE PACK',
    text: '+2 pellets and -10% spread. Mastery +1',
    apply: function (s) {
      s.player.flechettePack = true;
      resyncMastery(s.player, s);
    }
  },
  {
    id: 'capacitor-rail',
    category: 'WEAPON',
    rarity: 'rare',
    maxStacks: 1,
    weapon: 'vanguard',
    title: 'CAPACITOR RAIL',
    text: 'Charge time -25% and full-charge damage +20%. Mastery +1',
    apply: function (s) {
      s.player.capacitorRail = true;
      resyncMastery(s.player, s);
    }
  },
  {
    id: 'arc-lattice',
    category: 'WEAPON',
    rarity: 'rare',
    maxStacks: 1,
    weapon: 'arc-welder',
    title: 'ARC LATTICE',
    text: '+1 chain target and chain damage 70% → 80%. Mastery +1',
    apply: function (s) {
      s.player.arcLattice = true;
      resyncMastery(s.player, s);
    }
  },
  {
    id: 'phoenix-core',
    category: 'DEFENSE',
    rarity: 'prototype',
    maxStacks: 1,
    title: 'PHOENIX CORE',
    text: 'First lethal hit revives at 40% HP, 2s invulnerable, free EMP',
    apply: function (s) { s.player.phoenix = true; }
  },
  {
    id: 'scrap-singularity',
    category: 'TACTICAL',
    rarity: 'prototype',
    maxStacks: 1,
    title: 'SCRAP SINGULARITY',
    text: 'Every 40 scrap, a 1.5s vortex pulls foes 120px ahead',
    apply: function (s) { s.player.scrapSingularity = true; }
  }
];

export var FUSION_CHIPS = [
  {
    id: 'prismatic-flak',
    aliases: ['kinetic-shrapnel'],
    category: 'FUSION',
    title: 'PRISMATIC FLAK // 稜鏡碎裂彈',
    text: 'Piercing slugs shatter into 2 prismatic shards at 60°; multiple hits trigger 8% lost HP true damage',
    required: ['rail-slug', 'ricochet'],
    apply: function (s) {
      s.player.prismaticFlak = true;
      s.player.kineticShrapnel = true;
    }
  },
  {
    id: 'thermal-shock',
    category: 'FUSION',
    title: 'THERMAL SHOCK // 熱能衝擊',
    text: 'Bullets apply overheating burn; EMP triggers thermal fracture dealing all burn + 15% max HP blast & 70% slow',
    required: ['hot-load', 'emp-amplifier'],
    apply: function (s) {
      s.player.thermalShock = true;
    }
  },
  {
    id: 'apocalypse-thor',
    aliases: ['static-tempest'],
    category: 'FUSION',
    title: 'APOCALYPSE THOR // 天罰雷暴陣列',
    text: 'Every 3 arc hits summon an orbital ion thunderbolt dealing 180 AoE damage and leaving ionized ground',
    required: ['arc-lattice', 'tesla-coil'],
    apply: function (s) {
      s.player.apocalypseThor = true;
      s.player.staticTempest = true;
    }
  },
  {
    id: 'singularity-mine',
    aliases: ['overcharge-retaliation'],
    category: 'FUSION',
    title: 'SINGULARITY MINE // 奇點黑洞地雷',
    text: 'Taking damage generates a 180px gravity well pulling foes and absorbing bullets, collapsing into 150% reflected damage',
    required: ['scrap-singularity', 'reactive-armor'],
    apply: function (s) {
      s.player.singularityMine = true;
      s.player.overchargeRetaliation = true;
    }
  },
  {
    id: 'mirage-overdrive',
    aliases: ['kinetic-ballet'],
    category: 'FUSION',
    title: 'MIRAGE OVERDRIVE // 幻影過載誘餌',
    text: 'Dash deploys a holographic decoy taunting enemies and firing toward cursor (60% dmg), splitting into missiles on expiry',
    required: ['dash-capacitor', 'overdrive-injector'],
    apply: function (s) {
      s.player.mirageOverdrive = true;
      s.player.kineticBallet = true;
    }
  },
  {
    id: 'aegis-stance',
    aliases: ['graviton-bulwark', 'fortress-protocol'],
    category: 'FUSION',
    title: 'AEGIS STANCE // 鋼鐵風暴壁壘',
    text: 'Stationary 0.4s deploys a 160° frontal aegis reflecting enemy bullets at 2x dmg, +45% fire rate, and 35% rear damage reduction',
    required: ['heavy-plating', 'ablative-mesh'],
    apply: function (s) {
      s.player.aegisStance = true;
      s.player.gravitonBulwark = true;
      s.player.fortressProtocol = true;
    }
  },
  {
    id: 'bloodhound-reaper',
    aliases: ['executioner'],
    category: 'FUSION',
    title: 'BLOODHOUND REAPER // 血性收割協議',
    text: 'Executes foes below 35% HP for 250% damage with metal scrap gore; executing boss parts or elites guarantees Overdrive Orbs',
    required: ['hollow-point', 'salvage-protocol'],
    apply: function (s) {
      s.player.bloodhoundReaper = true;
      s.player.executioner = true;
    }
  },
  {
    id: 'solar-afterburner',
    aliases: ['storm-rider'],
    category: 'FUSION',
    title: 'SOLAR AFTERBURNER // 日冕風暴羽翼',
    text: 'Dash lays an incandescent fire trench vaporizing enemy bullets, burning foes and fanning out in sandstorms',
    required: ['afterburner', 'servo-legs'],
    apply: function (s) {
      s.player.solarAfterburner = true;
      s.player.stormRider = true;
    }
  }
];

export function toPropName(id) {
  return id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
}

export function currentWeaponId(state) {
  var p = state && state.player;
  if (p && p.weaponMode) return p.weaponMode;
  if (state && state.weaponId) return state.weaponId;
  return 'standard';
}

export function stackCount(state, id) {
  var list = (state && state.acquiredUpgrades) || [];
  var n = 0;
  var i;
  for (i = 0; i < list.length; i += 1) {
    var card = list[i];
    if (!card) continue;
    if (card.id === id || (card.aliases && card.aliases.indexOf(id) !== -1)) n += 1;
  }
  return n;
}

export function findUpgrade(id) {
  var i;
  for (i = 0; i < UPGRADES.length; i += 1) {
    if (UPGRADES[i].id === id || (UPGRADES[i].aliases && UPGRADES[i].aliases.indexOf(id) !== -1)) return UPGRADES[i];
  }
  for (i = 0; i < FUSION_CHIPS.length; i += 1) {
    if (FUSION_CHIPS[i].id === id || (FUSION_CHIPS[i].aliases && FUSION_CHIPS[i].aliases.indexOf(id) !== -1)) return FUSION_CHIPS[i];
  }
  return null;
}

export function rarityWeights(act) {
  var steps = Math.max(0, (act || 1) - 1);
  var rare = 25 + steps * 5;
  var prototype = 5 + steps * 2;
  var common = 70 - steps * 7;
  if (common < 1) common = 1;
  return { common: common, rare: rare, prototype: prototype };
}

export function cardIsBanned(state, id) {
  var list = (state && state.banished) || [];
  return list.indexOf(id) !== -1;
}

export function legacyFlagBlocks(card, player) {
  if (!card || !player) return false;
  if (card.id === 'shockwave-dash' && player.shockwaveDash) return true;
  if (card.id === 'tesla-coil' && player.teslaCoil) return true;
  if (card.id === 'reactive-armor' && player.reactiveArmor) return true;
  if (card.id === 'high-caliber' && player.highCaliber) return true;
  if (card.id === 'phoenix-core' && player.phoenixSpent) return true;
  return false;
}

export function weaponModActive(state, id) {
  var p = state && state.player;
  if (!p) return false;
  var weapon = currentWeaponId(state);
  if (id === 'tracer-rounds') return weapon === 'standard' && !!p.tracerRounds;
  if (id === 'flechette-pack') return weapon === 'breacher' && !!p.flechettePack;
  if (id === 'capacitor-rail') return weapon === 'vanguard' && !!p.capacitorRail;
  if (id === 'arc-lattice') return weapon === 'arc-welder' && !!p.arcLattice;
  return false;
}

export function completesFusionName(state, cardId) {
  var i;
  var p = state && state.player;
  for (i = 0; i < FUSION_CHIPS.length; i += 1) {
    var fc = FUSION_CHIPS[i];
    if (!fc.required || fc.required.length !== 2) continue;
    if (p && (p[toPropName(fc.id)] || (fc.aliases && fc.aliases.some(function (a) { return p[toPropName(a)]; })))) continue;
    if (fc.required[0] !== cardId && fc.required[1] !== cardId) continue;
    var other = fc.required[0] === cardId ? fc.required[1] : fc.required[0];
    if (stackCount(state, other) > 0) return fc.title;
  }
  return '';
}
