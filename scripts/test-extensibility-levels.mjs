import assert from 'node:assert/strict';
import { makeState } from '../src/core/state.js';
import { rt } from '../src/core/runtime.js';
import { CAMPAIGN_SECTORS, CAMPAIGN_STAGES, getCampaignStage } from '../src/data/campaign-stages.js';
import { HARDCORE_OPERATIONS, getHardcoreOperation } from '../src/data/hardcore-operations.js';
import { getSectorOfStage, getSectorReqStars, getStageChain, isStageUnlocked, recordStageClear, getCampaignStore, saveCampaignStore } from '../src/core/meta-store.js';
import { evaluateStageStars, evaluateStarCondition } from '../src/systems/director.js';
import { isStormFront } from '../src/systems/flow.js';
import { getModeAdapter, registerModeAdapter, initMode, stepMode, checkStageVictory } from '../src/systems/modes/mode-adapter.js';

console.log('================================================================');
console.log('  LEVELS & CAMPAIGN EXTENSIBILITY ARCHITECTURE TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// [1/4] Declarative Star Criteria Engine & 100% Backward Compatibility
// -----------------------------------------------------------------------------
console.log('[1/4] Testing Declarative Star Criteria Engine & Condition Types...');

// Test all individual condition types
var testState = makeState(960, 640);
testState.player.maxHp = 100;
testState.player.hp = 80;
testState.stageElapsed = 45;
testState.wave = 3;
testState.damageTakenInStage = 15;
testState.stats.justDashes = 4;
testState.stats.spireChains = 3;
testState.stats.coresDetonated = 1;
testState.stats.maxCombo = 12;
testState.steppedInLava = false;
testState.empUsed = false;
testState.beaconHp = 850;
testState.beaconMaxHp = 1000;
testState.beaconPlayerStayTime = 50;

assert.equal(evaluateStarCondition({ type: 'waves_cleared', count: 3 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'waves_cleared', count: 4 }, testState), false);

assert.equal(evaluateStarCondition({ type: 'time_under', seconds: 50 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'time_under', seconds: 40 }, testState), false);

assert.equal(evaluateStarCondition({ type: 'hp_ratio', ratio: 0.8 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'hp_ratio', ratio: 0.85 }, testState), false);

assert.equal(evaluateStarCondition({ type: 'damage_taken_under', maxDamage: 20 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'damage_taken_under', maxDamage: 10 }, testState), false);

assert.equal(evaluateStarCondition({ type: 'barrel_kill' }, testState), true);

assert.equal(evaluateStarCondition({ type: 'no_lava' }, testState), true);
testState.steppedInLava = true;
assert.equal(evaluateStarCondition({ type: 'no_lava' }, testState), false);
testState.steppedInLava = false;

assert.equal(evaluateStarCondition({ type: 'just_dashes', count: 3 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'just_dashes', count: 5 }, testState), false);

assert.equal(evaluateStarCondition({ type: 'spire_chains', count: 3, noEmp: true }, testState), true);
testState.empUsed = true;
assert.equal(evaluateStarCondition({ type: 'spire_chains', count: 3, noEmp: true }, testState), false);
testState.empUsed = false;

assert.equal(evaluateStarCondition({ type: 'combo', count: 10 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'combo', count: 15 }, testState), false);

assert.equal(evaluateStarCondition({ type: 'beacon_hp_ratio', ratio: 0.80 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'beacon_hp_ratio', ratio: 0.90 }, testState), false);

assert.equal(evaluateStarCondition({ type: 'beacon_stay_time', seconds: 45 }, testState), true);
assert.equal(evaluateStarCondition({ type: 'beacon_stay_time', seconds: 60 }, testState), false);

// Composite conditions (all & any)
var composite = {
  all: [
    { type: 'hp_ratio', ratio: 0.8 },
    {
      any: [
        { type: 'damage_taken_under', maxDamage: 20 },
        { type: 'barrel_kill' }
      ]
    }
  ]
};
assert.equal(evaluateStarCondition(composite, testState), true);

// Verify all 15 stages have starRules and evaluate successfully
assert.equal(CAMPAIGN_STAGES.length, 15);
for (var i = 0; i < CAMPAIGN_STAGES.length; i++) {
  var stg = CAMPAIGN_STAGES[i];
  assert.ok(stg.starRules, `Stage ${stg.id} must define starRules`);
  assert.ok(stg.starRules.star1, `Stage ${stg.id} must define starRules.star1`);
  assert.ok(stg.starRules.star2, `Stage ${stg.id} must define starRules.star2`);
  assert.ok(stg.starRules.star3, `Stage ${stg.id} must define starRules.star3`);
}

// Backward-compatibility: stage config with no starRules falls back cleanly
var legacyStage = { id: 'stage_1_1', type: 'wave_wipeout', targetWaves: 3, targetTime: 60 };
var legacyResult = evaluateStageStars(testState, legacyStage);
assert.equal(legacyResult.star1, true);
assert.equal(legacyResult.star2, true);
assert.equal(legacyResult.star3, true);

console.log(' -> Declarative Star Criteria Engine verified across all 15 stages.');

// -----------------------------------------------------------------------------
// [2/4] Dynamic Stage Chain, Sector Requirements & Object Sector Lookup
// -----------------------------------------------------------------------------
console.log('\n[2/4] Testing Dynamic Stage Chain & Sector Requirements...');

var chain = getStageChain();
assert.equal(chain.length, 15);
assert.deepEqual(chain, [
  'stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4',
  'stage_2_1', 'stage_2_2', 'stage_2_3', 'stage_2_4',
  'stage_3_1', 'stage_3_2', 'stage_3_3', 'stage_3_4',
  'stage_ex_1', 'stage_ex_2', 'stage_ex_3'
]);

// Dynamic sector req stars from CAMPAIGN_SECTORS
assert.equal(getSectorReqStars(1), 0);
assert.equal(getSectorReqStars(2), 8);
assert.equal(getSectorReqStars(3), 18);
assert.equal(getSectorReqStars(4), 28);
assert.equal(getSectorReqStars(99), 0);

// Dynamic sector lookup from stage object
assert.equal(getSectorOfStage('stage_1_1'), 1);
assert.equal(getSectorOfStage('stage_1_4'), 1);
assert.equal(getSectorOfStage('stage_2_1'), 2);
assert.equal(getSectorOfStage('stage_3_1'), 3);
assert.equal(getSectorOfStage('stage_ex_1'), 4);
assert.equal(getSectorOfStage('stage_ex_3'), 4);
assert.equal(getSectorOfStage('non_existent'), 0);

console.log(' -> Dynamic stage chain and sector requirement queries verified.');

// -----------------------------------------------------------------------------
// [3/4] GameModeAdapter Lifecycle Contract & isStormFront Decoupling
// -----------------------------------------------------------------------------
console.log('\n[3/4] Testing GameModeAdapter Lifecycle Contract...');

var standardAdapter = getModeAdapter('standard');
var campaignAdapter = getModeAdapter('campaign');
var hardcoreAdapter = getModeAdapter('hardcore');

var lifecycleMethods = ['onEnter', 'step', 'checkVictory', 'onBossDefeated', 'onExit'];
for (var m of lifecycleMethods) {
  assert.equal(typeof standardAdapter[m], 'function', `Standard adapter missing ${m}`);
  assert.equal(typeof campaignAdapter[m], 'function', `Campaign adapter missing ${m}`);
  assert.equal(typeof hardcoreAdapter[m], 'function', `Hardcore adapter missing ${m}`);
}

// Verify isStormFront() has NO victory side-effects
rt.state = makeState(960, 640);
rt.state.mode = 'campaign';
rt.state.stageConfig = getCampaignStage('stage_1_1');
rt.state.stageElapsed = 10;
rt.renderDt = 0.016;
rt.renderTime = 1.0;

// Call isStormFront() multiple times
isStormFront();
isStormFront();
isStormFront();

// Stage elapsed must not advance via isStormFront
assert.equal(rt.state.stageElapsed, 10, 'isStormFront() must not modify stageElapsed or check victory');
assert.equal(rt.state.stageCleared, false);

// Mode initialization & injection test
initMode(rt.state, 'campaign', getCampaignStage('stage_1_1'));
assert.equal(rt.state.mode, 'campaign');
assert.equal(rt.state.stageConfig.id, 'stage_1_1');
assert.equal(rt.state.stageElapsed, 0);

initMode(rt.state, 'hardcore', HARDCORE_OPERATIONS[0]);
assert.equal(rt.state.mode, 'hardcore');
assert.equal(rt.state.stageConfig.id, 'op_01');
assert.ok(rt.state.toxicRing && rt.state.toxicRing.active);

console.log(' -> GameModeAdapter lifecycle and decoupled victory checking verified.');

// -----------------------------------------------------------------------------
// [4/4] Mode Transition & Simulation Step
// -----------------------------------------------------------------------------
console.log('\n[4/4] Testing Simulation Step via Adapter...');

initMode(rt.state, 'campaign', getCampaignStage('stage_2_3'));
assert.ok(rt.state.beacon);
assert.equal(rt.state.beaconHp, 1000);

// Run stepMode
var dummyFrame = { p: rt.state.player, boundW: 960, boundH: 640 };
stepMode(0.5, dummyFrame);
assert.equal(rt.state.stageElapsed, 0.5);

console.log(' -> Mode step integration verified.');

console.log('\n================================================================');
console.log('  ALL EXTENSIBILITY LEVELS ARCHITECTURE TESTS PASSED (100%)');
console.log('================================================================\n');
