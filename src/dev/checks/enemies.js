import { clearSeed, seedRun } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { bossHp, enemyProfile } from '../../data/enemies.js';
import { spawnBoss, spawnEnemy } from '../../systems/spawning.js';
import { filterEnemyDamage, clearEnemyShields, takeDeathEvents } from '../../systems/sim/enemy-defense.js';
import { pushEnemyBullet, scaledShot } from '../../systems/sim/enemy-bullets.js';
import { resolveDeathEvents } from '../../systems/sim/new-enemies.js';
import { stepEnemies } from '../../systems/sim/enemies.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

export function run() {
  var crawler = enemyProfile('crawler', 1, { hpScale: 1, dmgScale: 1 });
  var rusher = enemyProfile('rusher', 1);
  assert(crawler.hp === 50 && rusher.hp === 31 && crawler.damage === 14, 'enemy profile wave-1 stats drifted');

  var spitter = enemyProfile('spitter', 6, { hpScale: 1, dmgScale: 1 });
  var scurrier = enemyProfile('scurrier', 7);
  var warden = enemyProfile('warden', 11);
  var burrower = enemyProfile('burrower', 12);
  assert(spitter.hp === 38 && spitter.speed === 60 && spitter.r === 13 && spitter.score === 45, 'spitter base drifted');
  assert(scurrier.hp === 18 && scurrier.speed === 150 && scurrier.xp === 8 && scurrier.repairChance === 0, 'scurrier base drifted');
  assert(warden.hp === 70 && warden.damage === 8 && warden.repairChance === 0.2, 'warden base drifted');
  assert(burrower.hp === 95 && burrower.speed === 40 && burrower.firstWave === 12, 'burrower base drifted');

  var titan = enemyProfile('titan', 5, { hpScale: 1.48, dmgScale: 1.2 });
  assert(titan.hp === 4200 && bossHp('titan', 5) === 4200, 'titan wave-5 hp drifted');
  assert(enemyProfile('crawler', 5, { hpScale: 1, dmgScale: 1 }).hp === 50, 'crawler no longer rebases at scale 1');
  assert(bossHp('titan', 10) === 4200 + 5 * 780, 'pre-overtime titan wave 10 drifted');
  assert(bossHp('dreadnought', 10) === 8400 && bossHp('sovereign', 15) === 5200, 'story boss hp drifted');
  assert(bossHp('titan', 20) === 4200 && bossHp('titan', 25) === Math.round(4200 * 1.35), 'overtime titan cycle drifted');
  assert(bossHp('titan', 5, { bossHpScale: 1.2 }) === Math.round(4200 * 1.2), 'wave 5 boss hp ignored bossHpScale');
  assert(bossHp('dreadnought', 10, { bossHpScale: 1.25 }) === Math.round(8400 * 1.25), 'wave 10 boss hp ignored bossHpScale');

  var grown = enemyProfile('rusher', 5, { hpScale: 1.48, dmgScale: 1.2 });
  var legacyRusher = 26 + 5 * 5;
  assert(Math.abs(grown.hp - legacyRusher) / legacyRusher <= 0.1, 'rusher hpGrowth missed the 10% band');

  var shot = scaledShot(18, 140, true);
  if (rt.state) {
    var prevRecipe = rt.state.recipe;
    rt.state.recipe = { bulletScale: 1.16 };
    shot = scaledShot(18, 140, true);
    var spiral = scaledShot(16, 130, true);
    assert(shot.damage === 21 && Math.abs(shot.speed - 151.2) < 0.001, 'titan twin bulletScale drifted');
    assert(spiral.damage === 19 && Math.abs(spiral.speed - 140.4) < 0.001, 'titan spiral bulletScale drifted');
    rt.state.recipe = prevRecipe;
  }

  if (!rt.state || !rt.state.player || !rt.state.enemies) {
    clearSeed();
    return;
  }

  var saved = {
    enemies: rt.state.enemies,
    recipe: rt.state.recipe,
    wave: rt.state.wave,
    boss: rt.state.boss,
    bossSpawned: rt.state.bossSpawned,
    orbs: rt.state.orbs,
    bullets: rt.state.enemyBullets,
    blasts: rt.state.pendingBlasts,
    pools: rt.state.acidPools,
    strikes: rt.state.lightningStrikes,
    queue: rt.state.deathQueue,
    rerolls: rt.state.rerolls,
    hp: rt.state.player.hp,
    inv: rt.state.player.invulnerable,
    px: rt.state.player.x,
    py: rt.state.player.y,
    banner: rt.state.bannerText,
    score: rt.state.score,
    style: rt.state.scoreBreakdown ? rt.state.scoreBreakdown.style : 0,
    over: rt.state.over
  };

  try {
    rt.state.enemies = [];
    rt.state.orbs = [];
    rt.state.enemyBullets = [];
    rt.state.pendingBlasts = [];
    rt.state.acidPools = [];
    rt.state.deathQueue = [];
    rt.state.player.hp = 100;
    rt.state.player.invulnerable = 0;
    rt.state.player.x = 160;
    rt.state.player.y = 120;

    var shielded = { kind: 'crawler', hp: 80, maxHp: 80, shieldHp: 32, shieldTimer: 5, x: 0, y: 0 };
    var through = filterEnemyDamage(shielded, 50, { source: 'bullet', x: 1, y: 0 });
    assert(through === 18 && shielded.shieldHp === 0, 'warden shield did not absorb 40%');

    var dug = { kind: 'burrower', burrowed: true, hp: 40, x: 0, y: 0 };
    assert(filterEnemyDamage(dug, 12, { source: 'bullet' }) === 0, 'burrowed burrower took damage');

    var dread = { kind: 'dreadnought', hp: 400, maxHp: 400, x: 0, y: 0, aim: 0, empTimer: 0 };
    var rear = filterEnemyDamage(dread, 20, { source: 'bullet', x: -30, y: 0 });
    assert(Math.abs(rear - 30) < 0.001, 'dreadnought rear hit was not x1.5');
    dread.empTimer = 1;
    dread.deathQueued = false;
    var stunnedBarrel = filterEnemyDamage(dread, 20, { source: 'barrel', x: 10, y: 0 });
    assert(Math.abs(stunnedBarrel - 40) < 0.001, 'stunned dreadnought barrel was not x2');
    var styleBefore = rt.state.scoreBreakdown ? (rt.state.scoreBreakdown.style || 0) : 0;
    var stunKill = { kind: 'dreadnought', hp: 30, maxHp: 1600, x: 0, y: 0, aim: 0, empTimer: 1.2, mode: 'stun' };
    var lethalRear = filterEnemyDamage(stunKill, 20, { source: 'bullet', x: -40, y: 0 });
    assert(Math.abs(lethalRear - 40) < 0.001 && stunKill.deathQueued, 'stun rear hit did not kill the dreadnought');
    assert((rt.state.scoreBreakdown.style || 0) - styleBefore === 100, 'dreadnought stun-kill style score was not 100');

    var towerA = { kind: 'stormTower', hp: 200, x: 10, y: 10 };
    var towerB = { kind: 'stormTower', hp: 200, x: 40, y: 40 };
    rt.state.enemies.push(towerA, towerB);
    var sovereign = { kind: 'sovereign', hp: 500, maxHp: 500, x: 20, y: 20, towerRefs: [towerA, towerB] };
    assert(filterEnemyDamage(sovereign, 40, { source: 'bullet', x: 20, y: 20 }) === 0 && sovereign.shielded, 'sovereign shield ignored living towers');
    var empTower = filterEnemyDamage(towerA, 10, { source: 'emp', x: 10, y: 10 });
    assert(empTower === 30, 'storm tower emp was not x3');

    clearEnemyShields({ shieldHp: 10, shieldTimer: 3, knockbackImmune: true, isBoss: false });
    var holder = { kind: 'crawler', shieldHp: 8, shieldTimer: 2, shieldOwner: sovereign, knockbackImmune: true };
    rt.state.enemies.push(holder);
    clearEnemyShields(holder);
    assert(holder.shieldHp === 0 && holder.knockbackImmune === false, 'clearEnemyShields left a shield');

    rt.state.enemyBullets = [];
    var n;
    for (n = 0; n < 5; n += 1) pushEnemyBullet({ type: 'basic', fromBoss: true, life: 1, r: 2, damage: 1 });
    for (n = 0; n < 260; n += 1) pushEnemyBullet({ type: 'basic', life: 1, r: 2, damage: 1, tag: n });
    assert(rt.state.enemyBullets.length === 260, 'enemy bullet cap is not 260');
    assert(rt.state.enemyBullets[0].fromBoss === true, 'cap evicted a boss bullet');
    assert(rt.state.enemyBullets[5].tag === 5, 'cap did not drop the oldest non-boss bullet');

    var armed = { kind: 'scurrier', hp: 8, maxHp: 18, x: 30, y: 30, r: 9, arming: true };
    filterEnemyDamage(armed, 20, { source: 'dash' });
    resolveDeathEvents();
    assert(rt.state.player.hp === 100, 'dash-killed scurrier exploded');

    var victim = { kind: 'crawler', hp: 80, maxHp: 80, x: 36, y: 30, r: 10 };
    rt.state.enemies.push(victim);
    var armedShot = { kind: 'scurrier', hp: 8, maxHp: 18, x: 30, y: 30, r: 9, arming: true };
    filterEnemyDamage(armedShot, 30, { source: 'bullet' });
    resolveDeathEvents();
    assert(victim.hp === 20, 'armed scurrier death did not deal 60 to enemies');

    var parent = {
      kind: 'elite', affix: 'splitter', hp: 5, maxHp: 100, x: 80, y: 80, r: 19,
      speed: 40, damage: 20, color: '#75d1b0'
    };
    filterEnemyDamage(parent, 20, { source: 'bullet' });
    var volatile = {
      kind: 'elite', affix: 'volatile', hp: 5, maxHp: 80, x: 200, y: 40, r: 19
    };
    filterEnemyDamage(volatile, 20, { source: 'bullet' });
    resolveDeathEvents();
    var kids = 0;
    var ki;
    for (ki = 0; ki < rt.state.enemies.length; ki += 1) {
      if (rt.state.enemies[ki].splitterChild) kids += 1;
    }
    assert(kids === 2, 'splitter did not spawn two children');
    assert(rt.state.pendingBlasts && rt.state.pendingBlasts.length === 1 && rt.state.pendingBlasts[0].r === 110, 'volatile telegraph missing');
    takeDeathEvents();

    seedRun('wp-b-spawn');
    rt.state.wave = 8;
    rt.state.recipe = {
      wave: 8,
      eliteChance: 0,
      weights: { scurrier: 1, spitter: 0 },
      affixMinWave: 4,
      hpScale: 1,
      dmgScale: 1,
      bulletScale: 1
    };
    rt.state.enemies = [];
    spawnEnemy();
    assert(rt.state.enemies.length === 3 && rt.state.enemies[0].kind === 'scurrier', 'scurrier pack was not 3');

    rt.state.wave = 8;
    rt.state.recipe.eliteChance = 1;
    rt.state.recipe.weights = { crawler: 1 };
    rt.state.enemies = [];
    var sawVolatile = false;
    var ai;
    for (ai = 0; ai < 24; ai += 1) {
      spawnEnemy();
      var spawned = rt.state.enemies[rt.state.enemies.length - 1];
      assert(spawned.kind === 'elite', 'elite chance did not force an elite');
      assert(spawned.affix !== 'splitter', 'splitter unlocked before wave 13');
      if (spawned.affix === 'volatile') sawVolatile = true;
    }
    assert(sawVolatile, 'volatile never appeared in the unlocked pool');

    rt.state.wave = 16;
    rt.state.recipe.wave = 16;
    rt.state.enemies = [];
    spawnEnemy();
    var overtime = rt.state.enemies[0];
    assert(overtime.affix && overtime.affix2 && overtime.affix !== overtime.affix2, 'overtime elite did not roll two affixes');

    rt.state.recipe.cap = 95;
    rt.state.recipe.eliteChance = 0;
    rt.state.recipe.weights = { scurrier: 1 };
    rt.state.enemies = [];
    var pad;
    for (pad = 0; pad < 94; pad += 1) rt.state.enemies.push({ kind: 'crawler', hp: 1, r: 4 });
    spawnEnemy();
    assert(rt.state.enemies.length === 95, 'scurrier pack exceeded the enemy cap');
    assert(rt.state.enemies[94].kind === 'scurrier', 'capped scurrier pack did not keep the lead bug');

    rt.state.enemies = [];
    rt.state.boss = null;
    rt.state.wave = 10;
    rt.state.recipe = { wave: 10, hpScale: 1, dmgScale: 1, bulletScale: 1.41, boss: 'dreadnought' };
    var dreadBoss = spawnBoss('dreadnought');
    assert(dreadBoss && dreadBoss.isBoss && dreadBoss.kind === 'dreadnought' && rt.state.boss === dreadBoss, 'spawnBoss dreadnought failed');
    assert(dreadBoss.hp === 8400 && dreadBoss.r === 38, 'dreadnought spawn stats drifted');
    var sov = spawnBoss('sovereign');
    assert(sov && sov.isBoss && sov.kind === 'sovereign' && sov.hp === 5200 && rt.state.boss === sov, 'spawnBoss sovereign failed');
    rt.state.wave = 5;
    rt.state.recipe = { wave: 5, hpScale: 1, dmgScale: 1, bulletScale: 1, boss: 'titan' };
    var titanBoss = spawnBoss('titan');
    assert(titanBoss.kind === 'titan' && titanBoss.isBoss && titanBoss.hp === 4200, 'spawnBoss titan failed');
    assert(titanBoss.leftCannonHp === Math.round(4200 * 0.22), 'titan parts were not 22% hp');

    rt.state.over = false;
    rt.state.bossSpawned = true;
    rt.state.player.hp = 100;
    rt.state.player.invulnerable = 0;
    rt.state.player.x = 100;
    rt.state.player.y = 100;
    rt.state.enemies = [{
      kind: 'warden', hp: 70, maxHp: 70, x: 400, y: 100, r: 15,
      speed: 55, damage: 8, touchCooldown: 0, phase: 0, shieldCd: 9
    }];
    stepEnemies(0.05, { p: rt.state.player, boundW: 800, boundH: 600 });
    assert(rt.state.player.hp === 100, 'warden dealt contact damage from across the arena');

    rt.state.player.x = 30;
    rt.state.player.y = 30;
    rt.state.player.hp = 100;
    rt.state.player.invulnerable = 0;
    rt.state.enemies = [{
      kind: 'dreadnought', isBoss: true, hp: 1600, maxHp: 1600,
      x: 700, y: 500, r: 38, speed: 30, damage: 34, touchCooldown: 0,
      mode: 'telegraph', telegraphT: 0.5, telegraphMax: 0.9, aim: 0,
      empTimer: 0, bossPhase: 1, attackCd: 4, fanCd: 4, summonCd: 8
    }];
    stepEnemies(0.05, { p: rt.state.player, boundW: 960, boundH: 640 });
    assert(rt.state.player.hp === 100, 'dreadnought telegraph hurt the player at range');

    rt.state.enemies = [sov];
    rt.state.player.x = 40;
    rt.state.player.y = 40;
    sov.x = 200;
    sov.y = 80;
    sov.hp = sov.maxHp;
    stepEnemies(0.05, { p: rt.state.player, boundW: 320, boundH: 240 });
    assert(sov.windAngle != null && (rt.state.lightningStrikes || []).length >= 0, 'sovereign did not start its arena');
  } finally {
    rt.state.enemies = saved.enemies;
    rt.state.recipe = saved.recipe;
    rt.state.wave = saved.wave;
    rt.state.boss = saved.boss;
    rt.state.bossSpawned = saved.bossSpawned;
    rt.state.orbs = saved.orbs;
    rt.state.enemyBullets = saved.bullets;
    rt.state.pendingBlasts = saved.blasts;
    rt.state.acidPools = saved.pools;
    rt.state.lightningStrikes = saved.strikes;
    rt.state.deathQueue = saved.queue;
    rt.state.rerolls = saved.rerolls;
    rt.state.player.hp = saved.hp;
    rt.state.player.invulnerable = saved.inv;
    rt.state.player.x = saved.px;
    rt.state.player.y = saved.py;
    rt.state.bannerText = saved.banner;
    rt.state.score = saved.score;
    rt.state.over = saved.over;
    if (rt.state.scoreBreakdown) rt.state.scoreBreakdown.style = saved.style;
    clearSeed();
  }
}
