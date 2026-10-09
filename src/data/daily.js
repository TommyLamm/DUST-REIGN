// Daily challenge rule. dateKey is the player's local calendar date, YYYY-MM-DD.
// Returns null when the key is missing or not a real calendar day.
// Otherwise returns a fresh object:
// {
//   id, date, seed, rigId, weaponId, heat: 1,
//   routePlan: [{ act, sector, routeId }, ...] // act 1 sector dusk; acts 2–3 fixed route ids
//   title, summary,
//   eliteAffixMinWave: number|null,  // all-elites-early => 2
//   stormSeconds: number|null,        // double-storm => 10
//   scrapXpMult, crateMult, hpMult, damageMult, chainExplosionChance
// }
// seed is the date key as a number (YYYYMMDD) for seedRun. The pick is a pure hash,
// so it does not consume rng streams.

var RIG_IDS = ['scrapper', 'strider', 'bulwark', 'salvager'];
var WEAPON_IDS = ['standard', 'breacher', 'vanguard', 'arc-welder'];
var ROUTE_IDS = ['scorched', 'ironfield', 'static', 'blackout', 'convoy', 'stormwall'];
var RULES = [
  {
    id: 'all-elites-early',
    title: 'ALL ELITES EARLY',
    summary: 'Elite affixes start on wave 2.',
    eliteAffixMinWave: 2,
    stormSeconds: null,
    scrapXpMult: 1,
    crateMult: 1,
    hpMult: 1,
    damageMult: 1,
    chainExplosionChance: 0
  },
  {
    id: 'double-storm',
    title: 'DOUBLE STORM',
    summary: 'Storms last 10 seconds.',
    eliteAffixMinWave: null,
    stormSeconds: 10,
    scrapXpMult: 1,
    crateMult: 1,
    hpMult: 1,
    damageMult: 1,
    chainExplosionChance: 0
  },
  {
    id: 'scrap-famine',
    title: 'SCRAP FAMINE',
    summary: 'Scrap XP −25%. Supply crates ×2.',
    eliteAffixMinWave: null,
    stormSeconds: null,
    scrapXpMult: 0.75,
    crateMult: 2,
    hpMult: 1,
    damageMult: 1,
    chainExplosionChance: 0
  },
  {
    id: 'glass-rig',
    title: 'GLASS RIG',
    summary: 'Hull −40%. Damage +30%.',
    eliteAffixMinWave: null,
    stormSeconds: null,
    scrapXpMult: 1,
    crateMult: 1,
    hpMult: 0.6,
    damageMult: 1.3,
    chainExplosionChance: 0
  },
  {
    id: 'chain-reaction',
    title: 'CHAIN REACTION',
    summary: 'Enemy deaths have a 30% chance to pop.',
    eliteAffixMinWave: null,
    stormSeconds: null,
    scrapXpMult: 1,
    crateMult: 1,
    hpMult: 1,
    damageMult: 1,
    chainExplosionChance: 0.3
  }
];

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function hash32(text) {
  var h = 2166136261;
  var s = String(text);
  var i;
  for (i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function localDateKey(date) {
  var d = date instanceof Date ? date : new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function validDateKey(dateKey) {
  if (typeof dateKey !== 'string') return false;
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return false;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  var parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

export function getDailyRule(dateKey) {
  if (!validDateKey(dateKey)) return null;
  var rule = RULES[hash32(dateKey + ':rule') % RULES.length];
  var routeHash = hash32(dateKey + ':route');
  var first = routeHash % ROUTE_IDS.length;
  var second = (first + 1 + ((routeHash >>> 8) % (ROUTE_IDS.length - 1))) % ROUTE_IDS.length;
  var seed = Number(dateKey.slice(0, 4) + dateKey.slice(5, 7) + dateKey.slice(8, 10));
  return {
    id: rule.id,
    date: dateKey,
    seed: seed,
    rigId: RIG_IDS[hash32(dateKey + ':rig') % RIG_IDS.length],
    weaponId: WEAPON_IDS[hash32(dateKey + ':weapon') % WEAPON_IDS.length],
    heat: 1,
    routePlan: [
      { act: 1, sector: 'dusk', routeId: null },
      { act: 2, sector: null, routeId: ROUTE_IDS[first] },
      { act: 3, sector: null, routeId: ROUTE_IDS[second] }
    ],
    title: rule.title,
    summary: rule.summary,
    eliteAffixMinWave: rule.eliteAffixMinWave,
    stormSeconds: rule.stormSeconds,
    scrapXpMult: rule.scrapXpMult,
    crateMult: rule.crateMult,
    hpMult: rule.hpMult,
    damageMult: rule.damageMult,
    chainExplosionChance: rule.chainExplosionChance
  };
}
