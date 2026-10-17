import { enemyProfile, isBossKind, bossHp, bossScore } from '../src/data/enemies.js';
import { initBehemothParts, checkMultiPartBulletHit } from '../src/systems/sim/boss-parts.js';
import { getEnemyStrategy, primeEnemyStrategy, stepEnemyStrategy, filterEnemyStrategyDamage } from '../src/systems/sim/enemy-registry.js';
import { ENEMY_BODY_RENDERERS } from '../src/render/enemies.js';
import { rt } from '../src/core/runtime.js';
import { makeState } from '../src/core/state.js';

function assert(condition, msg) {
  if (!condition) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

console.log('=== [TESTING ENEMIES & BEHEMOTH BOSS EXPANSION] ===');
rt.state = makeState(960, 640);
rt.state.player = { x: 300, y: 200, r: 12, hp: 100 };

// 1. Data Profiles
console.log('1. Verifying enemy data profiles...');
var prowler = enemyProfile('prowler', 16, { hpScale: 1, dmgScale: 1 });
assert(prowler.hp === 48, 'prowler HP should be 48');
assert(prowler.speed === 105, 'prowler speed should be 105');
assert(prowler.damage === 24, 'prowler damage should be 24');
assert(prowler.r === 12, 'prowler radius should be 12');

var bulwark = enemyProfile('bulwark', 16, { hpScale: 1, dmgScale: 1 });
assert(bulwark.hp === 190, 'bulwark HP should be 190');
assert(bulwark.speed === 34, 'bulwark speed should be 34');
assert(bulwark.damage === 18, 'bulwark damage should be 18');
assert(bulwark.r === 21, 'bulwark radius should be 21');

var behemoth = enemyProfile('behemoth', 19, { hpScale: 1, dmgScale: 1 });
assert(behemoth.hp === 8800, 'behemoth HP should be 8800');
assert(behemoth.speed === 32, 'behemoth speed should be 32');
assert(behemoth.damage === 32, 'behemoth damage should be 32');
assert(behemoth.r === 44, 'behemoth radius should be 44');
assert(isBossKind('behemoth') === true, 'isBossKind(behemoth) must be true');
assert(bossHp('behemoth', 19) === 8800, 'bossHp(behemoth, 19) should be 8800');
assert(bossScore('behemoth', 19) === 3500, 'bossScore(behemoth, 19) should be 3500');

// 2. Boss Parts Initialization
console.log('2. Verifying initBehemothParts...');
var boss = { kind: 'behemoth', hp: 8800, maxHp: 8800, x: 200, y: 200, aim: 0 };
initBehemothParts(boss);
assert(Array.isArray(boss.parts) && boss.parts.length === 3, 'Behemoth must have 3 parts');

var horn = boss.parts.find(p => p.id === 'behemoth_horn');
var gland = boss.parts.find(p => p.id === 'behemoth_gland');
var tail = boss.parts.find(p => p.id === 'behemoth_tail');

assert(horn && horn.hp === 1800 && horn.empStun === 2.2, 'Horn part verified (1800 HP, 2.2s EMP)');
assert(gland && gland.hp === 1400 && gland.vulnMultiplier === 2.5, 'Gland part verified (1400 HP, 2.5x vuln)');
assert(tail && tail.hp === 1200 && tail.speedPenalty === 0.25, 'Tail part verified (1200 HP, 25% speed penalty)');

// 3. Prowler Strategy
console.log('3. Verifying prowler strategy...');
var pEnemy = { kind: 'prowler', hp: 48, maxHp: 48, x: 100, y: 100 };
primeEnemyStrategy('prowler', pEnemy);
assert(pEnemy.phaseState === 'stalk', 'Prowler starts in stalk state');

// Stalk damage reduction (70% reduction -> takes 30%)
var stalkDmg = filterEnemyStrategyDamage(pEnemy, 100, { source: 'bullet' });
assert(stalkDmg === 30, 'Prowler stalk takes 30% damage (received: ' + stalkDmg + ')');

// 4. Bulwark Strategy & Shield Block
console.log('4. Verifying bulwark strategy & shield mechanics...');
var bEnemy = { kind: 'bulwark', hp: 190, maxHp: 190, x: 100, y: 100, aim: 0 };
primeEnemyStrategy('bulwark', bEnemy);
assert(bEnemy.shieldHp === 350 && !bEnemy.shieldBroken, 'Bulwark starts with 350 shield HP');

// Frontal hit (aim is 0, hit from x=150, y=100 -> angle 0)
var blockedDmg = filterEnemyStrategyDamage(bEnemy, 100, { source: 'bullet', x: 150, y: 100 });
assert(blockedDmg === 0, 'Bulwark frontal shield blocks 100% of damage');
assert(bEnemy.shieldHp === 250, 'Bulwark shield absorbed 100 damage (remaining: ' + bEnemy.shieldHp + ')');

// Shield break threshold (another 250 damage)
var breakDmg = filterEnemyStrategyDamage(bEnemy, 260, { source: 'bullet', x: 150, y: 100 });
assert(breakDmg === 0, 'Break shot fully absorbed');
assert(bEnemy.shieldBroken === true && bEnemy.empTimer >= 4.0, 'Shield break paralyzes for 4s');

// 5. Behemoth Strategy & Phase 2
console.log('5. Verifying behemoth boss strategy & enrage...');
rt.state = makeState(960, 640);
rt.state.player = { x: 300, y: 200, r: 12, hp: 100 };
var bBoss = { kind: 'behemoth', hp: 8800, maxHp: 8800, x: 200, y: 200, speed: 32 };
primeEnemyStrategy('behemoth', bBoss);

// Frontal damage reduction when horn intact
var frontDmg = filterEnemyStrategyDamage(bBoss, 100, { source: 'bullet', x: 300, y: 200 });
assert(frontDmg === 40, 'Horn provides 60% frontal reduction (received: ' + frontDmg + ')');

// Damage to 50% HP triggers Phase 2
bBoss.hp = 4300;
var frame = { p: rt.state.player, boundW: 960, boundH: 640 };
stepEnemyStrategy(bBoss, 0.016, frame, false, false);
assert(bBoss.phase2Triggered === true && bBoss.coreExposed === true, 'Phase 2 triggered at 50% HP with core exposed');

// Direct hit to exposed core deals 1.6x crit
var coreDmg = filterEnemyStrategyDamage(bBoss, 100, { source: 'bullet', x: 200, y: 300 }); // from side
assert(coreDmg === 160, 'Core exposed deals 1.6x crit damage (received: ' + coreDmg + ')');

// 6. Body Renderers Registered
console.log('6. Verifying renderer registrations...');
assert(typeof ENEMY_BODY_RENDERERS.prowler === 'function', 'prowler body renderer registered');
assert(typeof ENEMY_BODY_RENDERERS.bulwark === 'function', 'bulwark body renderer registered');
assert(typeof ENEMY_BODY_RENDERERS.behemoth === 'function', 'behemoth body renderer registered');

console.log('===> ALL ENEMIES & BEHEMOTH EXPANSION CHECKS PASSED SUCCESSFULLY! <===');
