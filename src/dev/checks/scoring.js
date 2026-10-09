import { clearSeed, rng, seedRun } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { damagePlayer } from '../../systems/combat.js';
import { dash, justDashCooldown, stepDashHeat } from '../../systems/abilities.js';
import { addScore, calculateCombatRank } from '../../systems/scoring.js';

function breakdownSum(breakdown) {
  var sum = 0;
  var key;
  if (!breakdown) return 0;
  for (key in breakdown) {
    if (Object.prototype.hasOwnProperty.call(breakdown, key)) sum += Number(breakdown[key]) || 0;
  }
  return sum;
}

function emptyBreakdown() {
  return {
    kill: 0, bounty: 0, storm: 0, graze: 0, repair: 0, wave: 0,
    flawless: 0, boss: 0, style: 0, contract: 0, overtime: 0, extract: 0
  };
}

function assertRank(rank, letter, title, classMod, label) {
  if (!rank || rank.letter !== letter || rank.title !== title || rank.classMod !== classMod) {
    throw new Error('rank ' + label + ' expected ' + letter + ' got ' + (rank && rank.letter));
  }
}

export function run() {
  clearSeed();
  var orig = Math.random;
  var calls = 0;
  Math.random = function () {
    calls += 1;
    return 0.25;
  };
  var unseeded = rng();
  var unseededSpawn = rng('spawn');
  Math.random = orig;
  if (unseeded !== 0.25 || unseededSpawn !== 0.25 || calls !== 2) {
    throw new Error('rng unseeded passthrough failed');
  }

  seedRun('p0-seed');
  var spawnA = rng('spawn');
  var lootA = rng('loot');
  var spawnB = rng('spawn');
  seedRun('p0-seed');
  if (rng('spawn') !== spawnA || rng('loot') !== lootA || rng('spawn') !== spawnB) {
    clearSeed();
    throw new Error('rng seeded determinism failed');
  }
  seedRun('p0-seed');
  rng('spawn');
  if (rng('loot') !== lootA) {
    clearSeed();
    throw new Error('rng streams are not independent');
  }
  clearSeed();

  if (!rt.state || !rt.state.player) return;
  var state = rt.state;
  var p = state.player;
  var snap = {
    over: state.over,
    paused: state.paused,
    score: state.score,
    heat: state.heat,
    route: state.route,
    extracted: state.extracted,
    breakdown: state.scoreBreakdown,
    enemies: state.enemies,
    bullets: state.enemyBullets,
    barrels: state.barrels,
    hitstop: state.hitstop,
    keys: rt.input.keys,
    gamepadX: rt.input.gamepadX,
    gamepadY: rt.input.gamepadY,
    x: p.x,
    y: p.y,
    aim: p.aim,
    hp: p.hp,
    dashCooldown: p.dashCooldown,
    dashCharges: p.dashCharges,
    dashChargesMax: p.dashChargesMax,
    dashHeat: p.dashHeat,
    dashHeatTimer: p.dashHeatTimer,
    dashHeatArmed: p.dashHeatArmed,
    lastDashJust: p.lastDashJust,
    dashAmbushTimer: p.dashAmbushTimer,
    invulnerable: p.invulnerable,
    damage: p.damage,
    justDashes: state.stats ? state.stats.justDashes : 0,
    shield: p.shield,
    phoenix: p.phoenix,
    damageTakenMult: p.damageTakenMult
  };

  try {
    var wasOver = state.over;
    state.over = false;
    var hp = 80;
    p.hp = hp;
    p.shield = 0;
    p.phoenix = false;
    p.damageTakenMult = 1;
    p.invulnerable = 0.5;
    var blocked = damagePlayer(12, 'test');
    if (blocked !== 0 || p.hp !== hp) throw new Error('damagePlayer ignored invulnerability');
    p.invulnerable = 0;
    var applied = damagePlayer(12, 'test');
    if (applied !== 12 || p.hp !== hp - 12) throw new Error('damagePlayer did not apply damage');
    p.hp = hp;
    p.invulnerable = 0;
    state.over = wasOver;

    state.heat = 0;
    state.route = null;
    state.score = 0;
    state.scoreBreakdown = emptyBreakdown();
    addScore(20, 'kill');
    addScore(15, 'graze');
    if (state.score !== 35 || breakdownSum(state.scoreBreakdown) !== state.score) {
      throw new Error('scoreBreakdown does not sum to score');
    }
    if (addScore(0, 'kill') !== 0 || addScore(-5, 'kill') !== 0 || state.score !== 35) {
      throw new Error('non-positive addScore changed the score');
    }

    state.score = 0;
    state.scoreBreakdown = emptyBreakdown();
    state.heat = 1;
    addScore(20, 'kill');
    if (state.score !== 23 || state.scoreBreakdown.kill !== 23) {
      throw new Error('heat 1 score multiplier expected 23');
    }
    state.heat = 2;
    state.route = { scoreMult: 1.2 };
    state.score = 0;
    state.scoreBreakdown = emptyBreakdown();
    addScore(100, 'style');
    if (state.score !== 156 || state.scoreBreakdown.style !== 156) {
      throw new Error('route.scoreMult 1.2 × heat 2 expected 156');
    }
    state.route = { id: 'scorched' };
    state.heat = 0;
    state.score = 0;
    addScore(50, 'bounty');
    if (state.score !== 50) throw new Error('missing route.scoreMult should stay ×1');
    state.route = null;
    state.heat = 5;
    state.score = 0;
    state.scoreBreakdown = emptyBreakdown();
    addScore(40, 'extract');
    if (state.score !== 70 || state.scoreBreakdown.extract !== 70) {
      throw new Error('heat 5 multiplier expected 70');
    }
    state.heat = 0;
    state.route = null;

    if (justDashCooldown(0) !== 0.35 || justDashCooldown(1) !== 0.65 || justDashCooldown(2) !== 0.95 || justDashCooldown(3) !== 1.25 || justDashCooldown(9) !== 1.25) {
      throw new Error('just dash cooldown formula mismatch');
    }

    var lowAcc = { shotsFired: 10, shotsHit: 0 };
    assertRank(calculateCombatRank(10, 0, lowAcc), 'C', 'RECRUIT RECLUSE', 'rank-letter--c', 'low score');
    assertRank(calculateCombatRank(1, 29999, lowAcc), 'C', 'RECRUIT RECLUSE', 'rank-letter--c', 'below B');
    assertRank(calculateCombatRank(1, 30000, lowAcc), 'B', 'IRON SCRAPPER', 'rank-letter--b', 'B');
    assertRank(calculateCombatRank(2, 89999, { shotsFired: 4, shotsHit: 4 }), 'B', 'IRON SCRAPPER', 'rank-letter--b', 'below A');
    assertRank(calculateCombatRank(3, 90000, lowAcc), 'A', 'VETERAN BREACHER', 'rank-letter--a', 'A');
    assertRank(calculateCombatRank(4, 219999, lowAcc), 'A', 'VETERAN BREACHER', 'rank-letter--a', 'below S');
    assertRank(calculateCombatRank(1, 220000, lowAcc), 'S', 'APEX SCAVENGER', 'rank-letter--s', 'score S');
    var perfect = calculateCombatRank(1, 30000, { shotsFired: 10, shotsHit: 10 });
    if (perfect.letter !== 'B' || perfect.acc !== 1) throw new Error('accuracy must not change the letter');

    state.extracted = true;
    state.heat = 1;
    assertRank(calculateCombatRank(1, 0, {}), 'S', 'APEX SCAVENGER', 'rank-letter--s', 'extract heat 1');
    state.heat = 2;
    assertRank(calculateCombatRank(1, 0, lowAcc), 'S+', 'DUST SOVEREIGN', 'rank-letter--splus', 'S+');
    assertRank(calculateCombatRank(1, 0, { extracted: false, heat: 0 }), 'C', 'RECRUIT RECLUSE', 'rank-letter--c', 'stats override');
    state.extracted = false;
    state.heat = 0;

    state.over = false;
    state.paused = false;
    state.score = 0;
    state.scoreBreakdown = emptyBreakdown();
    state.enemies = [];
    state.enemyBullets = [];
    state.barrels = [];
    state.hitstop = 0;
    rt.input.keys = new Set();
    rt.input.gamepadX = 0;
    rt.input.gamepadY = 0;
    p.x = 200;
    p.y = 120;
    p.aim = Math.PI;
    p.dashChargesMax = 1;
    p.dashCharges = 1;
    p.dashCooldown = 0;
    p.dashHeat = 0;
    p.dashHeatTimer = 0;
    p.dashHeatArmed = false;
    p.lastDashJust = false;
    p.damage = 10;
    var dashesBefore = state.stats ? (state.stats.justDashes || 0) : 0;
    state.enemies = [{ x: p.x + 18, y: p.y, r: 10, hp: 500, kind: 'crawler' }];
    dash();
    if (p.dashCooldown !== 0.35 || p.dashAmbushTimer !== 1.2 || p.dashHeat !== 1 || p.dashHeatArmed) {
      throw new Error('first just dash should stay 0.35 with heat 1 unarmed');
    }
    if (!state.stats || state.stats.justDashes !== dashesBefore + 1) throw new Error('justDashes did not increment');
    if (state.score !== 40 || state.scoreBreakdown.style !== 40) throw new Error('just dash style score expected 40');
    stepDashHeat(0.5);
    if (p.dashHeat !== 1 || p.dashHeatTimer !== 2.5 || !p.dashHeatArmed) {
      throw new Error('heat window did not arm after 0.5s');
    }
    p.dashCharges = 1;
    p.dashCooldown = 0;
    p.x = 200;
    p.y = 120;
    dash();
    if (p.dashCooldown !== 0.65 || p.dashHeat !== 2) throw new Error('second just dash expected 0.65 / heat 2');
    stepDashHeat(0.2);
    p.dashCharges = 1;
    p.dashCooldown = 0;
    p.x = 200;
    p.y = 120;
    dash();
    if (p.dashCooldown !== 0.95 || p.dashHeat !== 3) throw new Error('third just dash expected 0.95 / heat 3');
    stepDashHeat(0.2);
    p.dashCharges = 1;
    p.dashCooldown = 0;
    p.x = 200;
    p.y = 120;
    dash();
    if (p.dashCooldown !== 1.25 || p.dashHeat !== 3) throw new Error('fourth just dash expected 1.25 / heat capped at 3');
    if (state.score !== 160 || state.scoreBreakdown.style !== 160) throw new Error('four just dashes should score 160 style');
    var timerHot = p.dashHeatTimer;
    stepDashHeat(3);
    if (p.dashHeat !== 0 || p.dashHeatTimer !== 0 || p.dashHeatArmed) throw new Error('heat should clear after 3s');

    p.dashHeat = 2;
    p.dashHeatTimer = 2;
    p.dashHeatArmed = true;
    state.enemies = [];
    state.enemyBullets = [];
    p.dashCharges = 1;
    p.dashCooldown = 0;
    p.x = 200;
    p.y = 120;
    dash();
    if (p.dashCooldown !== 2.2 || p.dashHeat !== 2 || p.dashHeatTimer !== 2 || p.lastDashJust) {
      throw new Error('normal dash must not stack or clear heat');
    }
    if (timerHot === 0) throw new Error('heat timer fixture was empty');
  } finally {
    state.over = snap.over;
    state.paused = snap.paused;
    state.score = snap.score;
    state.heat = snap.heat;
    state.route = snap.route;
    state.extracted = snap.extracted;
    state.scoreBreakdown = snap.breakdown;
    state.enemies = snap.enemies;
    state.enemyBullets = snap.bullets;
    state.barrels = snap.barrels;
    state.hitstop = snap.hitstop;
    rt.input.keys = snap.keys;
    rt.input.gamepadX = snap.gamepadX;
    rt.input.gamepadY = snap.gamepadY;
    p.x = snap.x;
    p.y = snap.y;
    p.aim = snap.aim;
    p.hp = snap.hp;
    p.dashCooldown = snap.dashCooldown;
    p.dashCharges = snap.dashCharges;
    p.dashChargesMax = snap.dashChargesMax;
    p.dashHeat = snap.dashHeat;
    p.dashHeatTimer = snap.dashHeatTimer;
    p.dashHeatArmed = snap.dashHeatArmed;
    p.lastDashJust = snap.lastDashJust;
    p.dashAmbushTimer = snap.dashAmbushTimer;
    p.invulnerable = snap.invulnerable;
    p.damage = snap.damage;
    p.shield = snap.shield;
    p.phoenix = snap.phoenix;
    p.damageTakenMult = snap.damageTakenMult;
    if (state.stats) state.stats.justDashes = snap.justDashes;
    clearSeed();
  }
}
