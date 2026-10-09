function scaled(base, scale) {
  var s = (typeof scale === 'number' && scale > 0) ? scale : 1;
  return base * s;
}

function scaleOf(scales, key) {
  if (!scales || typeof scales[key] !== 'number' || !(scales[key] > 0)) return 1;
  return scales[key];
}

// Rusher's old curve sits just over 10% under the uniform hpScale at wave 5.
function hpGrowth(kind, wave) {
  if (kind === 'rusher' && wave >= 1 && wave <= 5) return 1 + (wave - 1) * 0.028;
  return 1;
}

var BASE = {
  crawler: { hp: 50, speed: 53, damage: 14, r: 14, score: 20, xp: 10, repair: 0, firstWave: 1, color: '#8d7861' },
  rusher: { hp: 31, speed: 94, damage: 10, r: 10, score: 35, xp: 13, repair: 0, firstWave: 1, color: '#e1a644' },
  brute: { hp: 141, speed: 33, damage: 27, r: 23, score: 90, xp: 34, repair: 1, firstWave: 1, color: '#bd573f' },
  artillery: { hp: 97, speed: 29, damage: 19, r: 16, score: 60, xp: 24, repair: 0.15, firstWave: 2, color: '#d69e2e' },
  spitter: { hp: 38, speed: 60, damage: 10, r: 13, score: 45, xp: 16, repair: 0.05, firstWave: 6, color: '#b6d34a' },
  scurrier: { hp: 18, speed: 150, damage: 22, r: 9, score: 30, xp: 8, repair: 0, firstWave: 7, color: '#e07a3d' },
  warden: { hp: 70, speed: 55, damage: 8, r: 15, score: 110, xp: 30, repair: 0.2, firstWave: 11, color: '#7eb6d6' },
  burrower: { hp: 95, speed: 40, damage: 18, r: 17, score: 120, xp: 32, repair: 0.25, firstWave: 12, color: '#c4a574' },
  elite: { hp: 214, speed: 45, damage: 21, r: 19, score: 180, xp: 40, repair: 1, firstWave: 3, color: '#75d1b0' },
  titan: { hp: 4200, speed: 36, damage: 28, r: 32, score: 800, xp: 60, repair: 1, firstWave: 5, color: '#e69535' },
  dreadnought: { hp: 8400, speed: 30, damage: 34, r: 38, score: 1500, xp: 60, repair: 1, firstWave: 10, color: '#d4654a' },
  sovereign: { hp: 5200, speed: 24, damage: 30, r: 34, score: 3000, xp: 60, repair: 1, firstWave: 15, color: '#9ec0ea' },
  stormTower: { hp: 320, speed: 0, damage: 0, r: 20, score: 40, xp: 12, repair: 0, firstWave: 15, color: '#d5e6f5' },
  mine: { hp: 16, speed: 0, damage: 0, r: 8, score: 0, xp: 0, repair: 0, firstWave: 10, color: '#e0a84e' }
};

export function bossCycle(wave, scales) {
  if (scales && typeof scales.bossCycle === 'number') return scales.bossCycle;
  var w = wave | 0;
  if (w >= 20 && w % 5 === 0) return Math.floor((w - 20) / 5);
  return 0;
}

function bossMult(wave, scales) {
  if (scales && typeof scales.bossHpScale === 'number' && scales.bossHpScale > 0) return scales.bossHpScale;
  return 1 + 0.35 * bossCycle(wave, scales);
}

var TITAN_HULL = 4200;
var TITAN_STEP = 780;
var DREADNOUGHT_HULL = 8400;
var SOVEREIGN_HULL = 5200;

export function bossHp(kind, wave, scales) {
  var w = wave | 0;
  var mult = bossMult(w, scales);
  if (kind === 'titan') {
    var extra = (w >= 5 && w < 20) ? (w - 5) * TITAN_STEP : 0;
    var hp = TITAN_HULL + extra;
    if (hp < TITAN_HULL) hp = TITAN_HULL;
    return Math.round(hp * mult);
  }
  var base = kind === 'dreadnought' ? DREADNOUGHT_HULL : kind === 'sovereign' ? SOVEREIGN_HULL : 0;
  if (!(base > 0)) return 0;
  return Math.round(base * mult);
}

export function bossScore(kind, wave, scales) {
  var base = kind === 'dreadnought' ? 1500 : kind === 'sovereign' ? 3000 : 800;
  var w = wave | 0;
  if (w < 20) return base;
  var cycle = bossCycle(w, scales);
  return Math.round(base * (1 + 0.5 * cycle));
}

export function enemyProfile(kind, wave, scales) {
  var w = wave | 0;
  if (w < 1) w = 1;
  scales = scales || {};
  var hpScale = scaleOf(scales, 'hpScale');
  var dmgScale = scaleOf(scales, 'dmgScale');
  var row = BASE[kind] || BASE.crawler;
  var hp;
  var speed;
  var damage;
  var r = row.r;
  var resolved = kind && BASE[kind] ? kind : 'crawler';

  if (resolved === 'titan' || resolved === 'dreadnought' || resolved === 'sovereign') {
    hp = bossHp(resolved, w, scales);
    speed = row.speed;
    damage = resolved === 'titan' ? (28 + w * 1.5) * dmgScale : row.damage * dmgScale;
  } else {
    hp = row.hp * hpGrowth(resolved, w) * hpScale;
    speed = row.speed * (1 + (hpScale - 1) * 0.25);
    damage = row.damage * dmgScale;
    hp = Math.round(hp);
    damage = Math.round(damage);
  }

  if (!(hp > 0) && resolved !== 'mine') hp = scaled(row.hp, hpScale);
  return {
    kind: resolved,
    r: r,
    hp: hp,
    maxHp: hp,
    speed: speed,
    damage: damage,
    color: row.color,
    score: resolved === 'titan' || resolved === 'dreadnought' || resolved === 'sovereign' ? bossScore(resolved, w, scales) : row.score,
    xp: row.xp,
    repairChance: row.repair,
    firstWave: row.firstWave
  };
}
