export var UPGRADES = [
  {
    id: 'rapid-fire',
    category: 'OFFENSE',
    title: 'RAPID FIRE',
    text: 'Fire 18% faster',
    aliases: ['quick-hands'],
    apply: function (s) { s.player.fireRate *= 0.82; }
  },
  {
    id: 'scatter-shot',
    category: 'OFFENSE',
    title: 'SCATTER SHOT',
    text: '+8 weapon damage',
    aliases: ['overcharge'],
    apply: function (s) { s.player.damage += 8; }
  },
  {
    id: 'heavy-plating',
    category: 'DEFENSE',
    title: 'HEAVY PLATING',
    text: '+25 max health and heal 40 HP',
    aliases: ['field-medic'],
    apply: function (s) { s.player.maxHp += 25; s.player.hp = Math.min(s.player.maxHp, s.player.hp + 40); }
  },
  {
    id: 'overdrive-injector',
    category: 'TACTICAL',
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
    title: 'HOT LOAD',
    text: '+180 bullet speed and size',
    apply: function (s) { s.player.bulletSpeed += 180; s.player.bulletSize += 1; }
  },
  {
    id: 'rail-slug',
    category: 'OFFENSE',
    title: 'RAIL SLUG',
    text: 'Bullets pierce 1 enemy (70% damage retention)',
    apply: function (s) { s.player.pierce = (s.player.pierce || 0) + 1; }
  },
  {
    id: 'ricochet',
    category: 'OFFENSE',
    title: 'KINETIC RICOCHET',
    text: 'Bullets bounce off screen border 1 time (90% speed)',
    apply: function (s) { s.player.bounces = (s.player.bounces || 0) + 1; }
  },
  {
    id: 'shockwave-dash',
    category: 'TACTICAL',
    title: 'SHOCKWAVE DASH',
    text: 'Dash pulse radius expands to 125px with 2x knockback',
    apply: function (s) { s.player.shockwaveDash = true; }
  },
  {
    id: 'tesla-coil',
    category: 'TACTICAL',
    title: 'TESLA COIL',
    text: 'Orb collection zaps up to 2 foes for 22 dmg',
    apply: function (s) { s.player.teslaCoil = true; }
  },
  {
    id: 'reactive-armor',
    category: 'DEFENSE',
    title: 'REACTIVE ARMOR',
    text: 'Taking damage releases a 360° defensive pulse (75px, 30 dmg)',
    apply: function (s) { s.player.reactiveArmor = true; }
  },
  {
    id: 'high-caliber',
    category: 'OFFENSE',
    title: 'HIGH CALIBER',
    text: 'Crit damage boosted to 2.2x & 20% flat crit chance',
    apply: function (s) { s.player.highCaliber = true; }
  }
];

export var FUSION_CHIPS = [
  {
    id: 'static-tempest',
    category: 'FUSION',
    title: 'STATIC TEMPEST // 靜電風暴',
    text: 'Tesla discharge overloads shockwave dash into lightning storm',
    required: ['tesla-coil', 'shockwave-dash'],
    apply: function (s) { s.player.staticTempest = true; }
  },
  {
    id: 'kinetic-shrapnel',
    category: 'FUSION',
    title: 'KINETIC SHRAPNEL // 動能破片',
    text: 'Piercing rail slugs shatter into ricocheting shrapnel upon impact',
    required: ['rail-slug', 'ricochet'],
    apply: function (s) { s.player.kineticShrapnel = true; }
  },
  {
    id: 'overcharge-retaliation',
    category: 'FUSION',
    title: 'OVERCHARGE RETALIATION // 超載反擊',
    text: 'Reactive armor counter-pulse critically overcharges and vaporizes foes',
    required: ['reactive-armor', 'high-caliber'],
    apply: function (s) { s.player.overchargeRetaliation = true; }
  },
  {
    id: 'vulcan-meltdown',
    category: 'FUSION',
    title: 'VULCAN MELTDOWN // 火神融火',
    text: 'High-velocity incendiary torrent ignites ground with residual firestorm',
    required: ['rapid-fire', 'hot-load'],
    apply: function (s) { s.player.vulcanMeltdown = true; }
  },
  {
    id: 'graviton-bulwark',
    category: 'FUSION',
    title: 'GRAVITON BULWARK // 重力偏折',
    text: 'Heavy armor creates a magnetic gravitational ward deflecting danger',
    required: ['heavy-plating', 'magnet-core'],
    apply: function (s) { s.player.gravitonBulwark = true; }
  },
  {
    id: 'plasma-meltdown',
    category: 'FUSION',
    title: 'PLASMA MELTDOWN CORE // 電漿融核',
    text: 'Scatter blasts during Overdrive ignite high-density plasma burst fields',
    required: ['overdrive-injector', 'scatter-shot'],
    apply: function (s) { s.player.plasmaMeltdown = true; }
  }
];

export function toPropName(id) {
  return id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
}
