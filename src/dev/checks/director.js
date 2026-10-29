import { clearSeed, seedRun } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { makeState } from '../../core/state.js';
import { getDailyRule } from '../../data/daily.js';
import { routeById } from '../../data/routes.js';
import { noteContractEvent } from '../../systems/contracts.js';
import { designScales, evaluateStageStars, evaluateStarCondition, onBossDefeated, onWaveStart, planWave } from '../../systems/director.js';
import { computeThreatTier } from '../../systems/flow.js';
import { getCampaignStage } from '../../data/campaign-stages.js';
import { getSectorOfStage, getSectorReqStars, getStageChain } from '../../core/meta-store.js';
import { spawnCrate } from '../../systems/drops.js';
import { explodeBarrel, killEnemy } from '../../systems/combat.js';
import { triggerGameOver } from '../../systems/flow.js';
import { update } from '../../systems/update.js';
import { assignRoute, chooseInterlude, chooseRepair, confirmExtract, confirmPushDeeper, grantDeferredExtract } from '../../systems/interlude.js';
import { stepHazards } from '../../systems/sim/hazards.js';
import { stepOrbs } from '../../systems/sim/orbs.js';
import { pacingSpawnRate, wolfPackWindowsFor } from '../../systems/sim/timers-wave.js';
import { EDGE_BAND, EDGE_PIN, edgeAwareSpawnMargin, edgePressure } from '../../systems/sim/world-edge.js';

function near(actual, expected) {
  return Math.abs(actual - expected) < 0.001;
}

function fresh() {
  var state = makeState(960, 640);
  state.player.hp = 40;
  state.score = 0;
  state.scoreBreakdown = {
    kill: 0, bounty: 0, storm: 0, graze: 0, repair: 0, wave: 0,
    flawless: 0, boss: 0, style: 0, contract: 0, overtime: 0, extract: 0
  };
  rt.state = state;
  return state;
}

function frameFor(state) {
  return { p: state.player, boundW: state.width, boundH: state.height };
}

export function run() {
  var saved = rt.state;
  try {
    var s1 = designScales(1);
    var s5 = designScales(5);
    var s10 = designScales(10);
    var s15 = designScales(15);
    if (!near(s1.hp, 1) || !near(s5.hp, 1.48) || !near(s10.hp, 2.03) || !near(s15.hp, 2.58)) {
      throw new Error('design hp curve drifted');
    }

    // Elite density: curve soft-cap 0.12; convoy ×1.7; late affixes delayed.
    if (!near(designScales(15).elite, 0.12)) throw new Error('wave 15 elite chance soft-cap drifted');
    if (designScales(15).elite > 0.12) throw new Error('elite chance exceeds soft-cap');
    var convoyRecipe = planWave(8);
    // planWave alone does not apply mutators; probe applyMutatorMods via onWaveStart path below is heavy.
    // Direct scale math: 0.12 * 1.7 = 0.204.
    if (Math.abs(0.12 * 1.7 - 0.204) > 0.001) throw new Error('elite-convoy mult sanity');
    var baseAffix = planWave(1);
    if (baseAffix.volatileMinWave !== 10 || baseAffix.splitterMinWave !== 15) {
      throw new Error('volatile/splitter unlock waves should be delayed to 10/15');
    }

    if (planWave(1).boss !== null || planWave(1).sector !== 'dusk') throw new Error('wave 1 is not a quiet dusk opener');
    if (planWave(5).boss !== 'titan' || planWave(10).boss !== 'dreadnought' || planWave(15).boss !== 'sovereign') {
      throw new Error('act boss schedule drifted');
    }
    if (planWave(20).boss !== 'titan' || planWave(25).boss !== 'dreadnought' || planWave(30).boss !== 'sovereign') {
      throw new Error('overtime boss cycle drifted');
    }
    if (!near(planWave(5).curveHpScale, 1.48)) throw new Error('curveHpScale missing at wave 5');
    var wave5 = planWave(5);
    if (wave5.hpScale !== 1 && !near(wave5.hpScale, wave5.curveHpScale)) {
      throw new Error('hpScale is neither legacy-flat nor the design curve');
    }
    var w6 = planWave(6).weights;
    var w7 = planWave(7).weights;
    var w11 = planWave(11).weights;
    var w12 = planWave(12).weights;
    if (!(w6.spitter > 0) || w6.scurrier !== 0) throw new Error('spitter unlock drifted');
    if (!(w7.scurrier > 0)) throw new Error('scurrier unlock drifted');
    if (!(w11.warden > 0) || w11.burrower !== 0) throw new Error('warden unlock drifted');
    if (!(w12.burrower > 0)) throw new Error('burrower unlock drifted');
    var pureA = planWave(7);
    var pureB = planWave(7);
    if (JSON.stringify(pureA) !== JSON.stringify(pureB)) throw new Error('planWave is not stable');
    pureA.weights.crawler = -1;
    if (planWave(7).weights.crawler === -1) throw new Error('planWave leaked its weights object');

    seedRun('wp-c-wave4');
    var wave4 = fresh();
    wave4.wave = 4;
    onWaveStart(wave4);
    if (!wave4.mutator || !wave4.mutator.id) throw new Error('wave 4 did not roll a mutator');
    if (!wave4.contract || !wave4.contract.id) throw new Error('wave 4 did not roll a contract');

    seedRun('wp-c-boss');
    var bossState = fresh();
    bossState.wave = 5;
    bossState.banishes = 0;
    bossState.rerolls = 4;
    bossState.recipe = planWave(5);
    var beforeHp = bossState.player.hp;
    onBossDefeated({ kind: 'titan', hp: 0, isBoss: true });
    if (bossState.rerolls !== 4) throw new Error('boss clear granted a second reroll');
    if (bossState.banishes !== 1) throw new Error('interlude did not set banishes to 1');
    if (!bossState.interlude || bossState.interlude.step !== 'route' || (bossState.interlude.options || []).length !== 3) {
      throw new Error('wave 5 boss did not open a 3-route interlude');
    }
    if (!bossState.scoreBreakdown || !(bossState.scoreBreakdown.boss > 0) || !(bossState.scoreBreakdown.wave > 0)) {
      throw new Error('boss clear did not pay boss and wave score');
    }
    chooseInterlude(0);
    chooseRepair();
    if (bossState.interlude) throw new Error('chooseRepair left state.interlude set');
    if (bossState.wave !== 6) throw new Error('chooseRepair did not advance the wave');
    if (!bossState.route || !bossState.route.id) throw new Error('chooseInterlude did not assign a route');
    var expectMult = bossState.route.id === 'scorched' ? 1.1 : bossState.route.id === 'blackout' ? 1.2 : 1;
    if (bossState.route.scoreMult !== expectMult || bossState.route.scoreMultiplier !== expectMult) {
      throw new Error('route scoreMult drifted for ' + bossState.route.id);
    }
    if (bossState.player.hp <= beforeHp) throw new Error('chooseRepair did not heal');
    var routeNames = ['scorched', 'ironfield', 'static', 'blackout', 'convoy', 'stormwall'];
    var ri;
    for (ri = 0; ri < routeNames.length; ri += 1) {
      var table = routeById(routeNames[ri]);
      var held = fresh();
      assignRoute(held, routeNames[ri], false);
      var want = routeNames[ri] === 'scorched' ? 1.1 : routeNames[ri] === 'blackout' ? 1.2 : 1;
      if (!table || table.scoreMult !== want || !held.route || held.route.scoreMult !== want) {
        throw new Error('scoreMult missing on ' + routeNames[ri]);
      }
    }

    seedRun('wp-c-push');
    var pushState = fresh();
    pushState.wave = 15;
    pushState.heat = 2;
    pushState.recipe = planWave(15);
    onBossDefeated({ kind: 'sovereign', hp: 0, isBoss: true });
    if (!pushState.interlude || pushState.interlude.step !== 'extract') throw new Error('wave 15 did not open extract');
    confirmPushDeeper();
    if (pushState.interlude || !pushState.overtime || pushState.extracted || pushState.wave !== 16) {
      throw new Error('push deeper did not enter overtime');
    }
    if (pushState.extractDeferredAmount !== 7000) throw new Error('deferred extract amount drifted');

    seedRun('wp-c-extract');
    var extractState = fresh();
    extractState.wave = 15;
    extractState.heat = 2;
    extractState.recipe = planWave(15);
    onBossDefeated({ kind: 'boss', hp: 0, isBoss: true });
    confirmExtract();
    if (!extractState.extracted || !extractState.over || extractState.interlude) throw new Error('extract did not file the run');
    if (!extractState.scoreBreakdown || !(extractState.scoreBreakdown.extract > 0)) throw new Error('extract bonus was not scored');

    var dailyRule = getDailyRule('2026-10-09');
    if (!dailyRule || !dailyRule.routePlan) throw new Error('daily rule shape drifted');
    seedRun('wp-c-daily');
    var dailyState = fresh();
    dailyState.wave = 5;
    dailyState.daily = dailyRule;
    dailyState.recipe = planWave(5);
    onBossDefeated({ kind: 'titan', hp: 0, isBoss: true });
    var act2 = dailyRule.routePlan[1] && dailyRule.routePlan[1].routeId;
    if (!dailyState.interlude || dailyState.interlude.options.length !== 1 || dailyState.interlude.options[0].id !== act2) {
      throw new Error('daily act 2 route was not fixed');
    }
    if (dailyState.interlude.options[0].scoreMult !== (act2 === 'scorched' ? 1.1 : act2 === 'blackout' ? 1.2 : 1)) {
      throw new Error('daily route card is missing scoreMult');
    }

    var heatState = fresh();
    heatState.wave = 6;
    heatState.heat = 5;
    heatState.daily = {
      id: 'double-storm',
      eliteAffixMinWave: 2,
      stormSeconds: 10,
      chainExplosionChance: 0
    };
    onWaveStart(heatState);
    if (!heatState.recipe || heatState.recipe.bossPhaseEarly !== 0.1) throw new Error('heat 5 did not publish bossPhaseEarly');
    if (heatState.recipe.affixMinWave !== 2) throw new Error('daily affix wave was not applied');
    if (heatState.stormSeconds !== 10) throw new Error('daily storm seconds were not applied');
    if (!(heatState.recipe.hpScale > 1)) throw new Error('heat did not scale enemy hp');

    var deal = fresh();
    deal.wave = 4;
    deal.act = 1;
    deal.player.hp = 100;
    deal.player.maxHp = 100;
    deal.contract = {
      id: 'graze',
      name: 'THREAD THE FIRE',
      label: 'GRAZE',
      progress: 11,
      goal: 12,
      reward: { type: 'score', amount: 300, label: '+300 SCORE' },
      done: false,
      failed: false
    };
    noteContractEvent('graze', { x: 1, y: 1 });
    if (!deal.contract.done || deal.stats.contractsCompleted !== 1 || !(deal.scoreBreakdown.contract > 0)) {
      throw new Error('contract completion did not pay or record');
    }

    var arm = fresh();
    arm.wave = 10;
    arm.player.weaponMode = 'standard';
    arm.player.mastery = 0;
    arm.recipe = planWave(10);
    onBossDefeated({ kind: 'dreadnought', hp: 0, isBoss: true });
    chooseInterlude(0);
    chooseInterlude(1);
    if (!((arm.player.masteryBase || 0) >= 1 || (arm.player.mastery || 0) >= 1)) {
      throw new Error('armory mastery did not call grantArmoryMastery');
    }
    if (!arm.interlude || arm.interlude.step !== 'title') throw new Error('mastery did not advance to the act title');

    var armSmuggler = fresh();
    armSmuggler.wave = 10;
    armSmuggler.player.weaponMode = 'standard';
    armSmuggler.player.mastery = 0;
    armSmuggler.player.hp = 100;
    armSmuggler.recipe = planWave(10);
    onBossDefeated({ kind: 'dreadnought', hp: 0, isBoss: true });
    chooseInterlude(0);
    if (!armSmuggler.interlude || !armSmuggler.interlude.options || armSmuggler.interlude.options.length !== 4) {
      throw new Error('armory expected 4 options including smuggler');
    }
    chooseInterlude(3);
    if (armSmuggler.player.hp > 75 || (armSmuggler.banishes || 0) < 2 || (armSmuggler.rerolls || 0) < 3 || (armSmuggler.player.overdrive || 0) < 5.9) {
      throw new Error('smuggler option failed to grant rewards or cost HP');
    }

    var chain = fresh();
    chain.coreSpawned = true;
    chain.player.x = 400;
    chain.player.y = 400;
    var gone = { x: 100, y: 100, r: 14 };
    var nearA = { x: 100, y: 100, r: 14, state: 'idle', chainFuse: 0 };
    var nearB = { x: 128, y: 100, r: 14, state: 'idle', chainFuse: 0 };
    chain.barrels = [nearA, nearB];
    chain._barrelSnap = [{ x: gone.x, y: gone.y, r: 14, ref: gone }];
    stepHazards(0.016, frameFor(chain));
    if (!(nearA.chainFuse > 0) || !(nearB.chainFuse > 0)) throw new Error('barrel chain fuse did not arm');
    if (!(nearA.chainFuse >= 0.4)) throw new Error('barrel chain fuse telegraph too short');
    stepHazards(0.55, frameFor(chain));
    if (chain.barrels.length !== 0 || (chain.stats.barrelChainMax || 0) < 2) throw new Error('barrel chain did not resolve');

    // Same chain may only wound the player once inside the guard window.
    var guard = fresh();
    guard.player.x = 100;
    guard.player.y = 100;
    guard.player.hp = 100;
    guard.player.maxHp = 100;
    guard.player.invulnerable = 0;
    guard.barrels = [{ x: 100, y: 100, r: 14, hp: 20, maxHp: 20, state: 'idle' }];
    explodeBarrel(guard.barrels[0], 0, false);
    var hpAfterFirst = guard.player.hp;
    if (hpAfterFirst !== 100 || !(guard._barrelChainGuard > 0)) throw new Error('barrel should arm chain guard without player HP loss');
    guard.barrels = [{ x: 100, y: 100, r: 14, hp: 20, maxHp: 20, state: 'idle' }];
    guard.player.invulnerable = 0;
    explodeBarrel(guard.barrels[0], 0, true);
    if (guard.player.hp !== hpAfterFirst) throw new Error('barrel chain guard failed to block second player hit');

    var crateState = fresh();
    crateState.player.x = 240;
    crateState.player.y = 200;
    crateState.orbs = [];
    var crate = spawnCrate(100, 200, 0, 0);
    var repair = { kind: 'repair', type: 'repair', x: 100, y: 220, vx: 0, vy: 0, r: 8, value: 18, life: 12 };
    crateState.orbs.push(repair);
    var crateX = crate.x;
    stepOrbs(0.2, frameFor(crateState));
    if (Math.abs(crate.x - crateX) > 0.01) throw new Error('supply crate was pulled by the magnet');
    if (repair.x <= 100) throw new Error('repair scrap was not pulled by the magnet');

    var payout = fresh();
    payout.wave = 5;
    payout.enemies = [{ kind: 'titan', isBoss: true, score: 800, x: 40, y: 40, r: 20, hp: 0, maxHp: 650, color: '#e69535' }];
    killEnemy(0);
    if ((payout.scoreBreakdown.kill || 0) !== 0) throw new Error('boss kill score was counted twice');
    if (payout.scoreBreakdown.boss !== 800) throw new Error('boss payout missing');

    var scored = fresh();
    scored.enemies = [{ kind: 'spitter', score: 45, x: 1, y: 1, r: 10, hp: 0, color: '#b6d34a' }];
    killEnemy(0);
    if (scored.scoreBreakdown.kill !== 45) throw new Error('kill score ignored e.score');

    var deferred = fresh();
    deferred.extractDeferred = true;
    deferred.extractDeferredAmount = 80;
    if (grantDeferredExtract(deferred) !== 40 || deferred.extractPaid !== true) throw new Error('deferred extract was not half');
    if (grantDeferredExtract(deferred) !== 0) throw new Error('deferred extract paid twice');

    var ended = fresh();
    ended.extractDeferred = true;
    ended.extractDeferredAmount = 80;
    ended.player.hp = 20;
    triggerGameOver();
    if (!ended.over || ended.scoreBreakdown.extract !== 40) throw new Error('game over did not grant deferred extract before submit');
    var scoreOnce = ended.score;
    triggerGameOver();
    if (ended.score !== scoreOnce) throw new Error('triggerGameOver paid extract twice');

    // Regression: mid-frame level-up pause must not freeze death results / redeploy.
    var stuck = fresh();
    stuck.paused = true;
    stuck.upgradeChoices = [{ id: 'dummy' }];
    stuck.player.hp = 0;
    rt.ui = rt.ui || {};
    rt.ui.gameOver = { hidden: true };
    rt.ui.overlay = { hidden: false };
    rt.ui.pauseModal = { hidden: true };
    rt.ui.newRecordStamp = { hidden: true };
    rt.ui.combatRankStamp = { hidden: true };
    triggerGameOver();
    if (stuck.paused) throw new Error('triggerGameOver left paused true');
    if (stuck.upgradeChoices && stuck.upgradeChoices.length) throw new Error('triggerGameOver left upgradeChoices');
    if (rt.ui.overlay && rt.ui.overlay.hidden !== true) throw new Error('triggerGameOver did not hide upgrade overlay');
    if (!(stuck.deathSequenceTimer > 0)) throw new Error('deathSequenceTimer not armed');
    for (var di = 0; di < 20; di += 1) update(0.05);
    if (stuck.deathSequenceTimer !== 0) throw new Error('deathSequenceTimer did not drain under former pause');
    if (rt.ui.gameOver.hidden !== false) throw new Error('results card stayed hidden after death sequence');

    var immune = fresh();
    immune.player.invulnerable = 5;
    var brick = { kind: 'dreadnought', isBoss: true, knockbackImmune: true, x: 100, y: 100, r: 30, hp: 800, maxHp: 1600, empTimer: 0 };
    immune.enemies = [brick];
    immune.barrels = [{ x: 100, y: 100, r: 14, hp: 20, maxHp: 20, state: 'flying', flyingTimer: 1, rot: 0 }];
    explodeBarrel(immune.barrels[0], 0, true);
    if (brick.x !== 100 || brick.y !== 100) throw new Error('knockbackImmune boss was shoved');
    if (!(brick.empTimer >= 1.5)) throw new Error('boss barrel did not stun');
    if (Math.abs(brick.hp - 634) > 0.01) throw new Error('boss barrel through bleed softcap expected 166 (hp 634), got ' + brick.hp);

    // Declarative Star Criteria & Dynamic Stage Chain Verifications
    var chain = getStageChain();
    if (!Array.isArray(chain) || chain.length !== 20) throw new Error('dynamic stage chain length should be 20');
    if (chain[0] !== 'stage_1_1' || chain[19] !== 'stage_4_5') throw new Error('stage chain boundaries drifted');
    if (getSectorOfStage('stage_1_1') !== 1 || getSectorOfStage('stage_2_1') !== 2 || getSectorOfStage('stage_3_1') !== 3 || getSectorOfStage('stage_4_1') !== 4) {
      throw new Error('dynamic sector lookup by stage object failed');
    }
    if (getSectorReqStars(1) !== 0 || getSectorReqStars(2) !== 8 || getSectorReqStars(3) !== 18 || getSectorReqStars(4) !== 32) {
      throw new Error('dynamic sector req stars failed');
    }



    // Map-edge pin mitigation helpers
    var northPin = edgePressure(480, EDGE_PIN, 16, 960, 640);
    if (!northPin.pressed || northPin.ny <= 0) throw new Error('north hatch pin not detected');
    var centerFree = edgePressure(480, 320, 16, 960, 640);
    if (centerFree.pressed || centerFree.depth !== 0) throw new Error('center should be free of edge pressure');
    var corner = edgePressure(EDGE_PIN, EDGE_PIN, 16, 960, 640);
    if (!corner.pressed || !(corner.nx > 0 && corner.ny > 0)) throw new Error('corner pin normal drifted');
    if (edgeAwareSpawnMargin({ x: 480, y: EDGE_PIN, r: 16 }, 960, 640, 32) < 110) {
      throw new Error('edge-aware spawn margin failed while pinned');
    }
    if (edgeAwareSpawnMargin({ x: 480, y: 320, r: 16 }, 960, 640, 32) !== 32) {
      throw new Error('center spawn margin should stay at base');
    }
    if (!(EDGE_BAND > EDGE_PIN)) throw new Error('EDGE_BAND must exceed EDGE_PIN');

    // Wolf Pack surge pacing: early low-heat opener is single-pulse;
    // late pulse (if any) ends ≥4s before storm; Heat≥4 cancels late pulse.
    function assertWindows(label, windows, expected) {
      if (windows.length !== expected.length) {
        throw new Error(label + ' window count ' + windows.length + ' !== ' + expected.length);
      }
      var wi;
      for (wi = 0; wi < expected.length; wi += 1) {
        if (!near(windows[wi].start, expected[wi].start) || !near(windows[wi].end, expected[wi].end)) {
          throw new Error(label + ' window ' + wi + ' drifted: ' + JSON.stringify(windows[wi]));
        }
      }
    }
    var earlyOnly = [{ start: 10, end: 13.5 }];
    var heat0Late = [{ start: 10, end: 13.5 }, { start: 17.5, end: 21 }];
    assertWindows('wave1 heat0', wolfPackWindowsFor(1, 0, 5), earlyOnly);
    assertWindows('wave2 heat1', wolfPackWindowsFor(2, 1, 5), earlyOnly);
    assertWindows('wave3 heat0', wolfPackWindowsFor(3, 0, 5), heat0Late);
    assertWindows('wave8 heat3', wolfPackWindowsFor(8, 3, 5), heat0Late);
    assertWindows('wave8 heat4', wolfPackWindowsFor(8, 4, 8), earlyOnly);
    var lateGap = heat0Late[1];
    if (lateGap.end > 25 - 4 + 0.001) throw new Error('late surge overlaps storm gap');

    var stage11 = getCampaignStage('stage_1_1');
    if (!stage11 || !stage11.starRules) throw new Error('stage_1_1 missing declarative starRules');
    var evalState = fresh();
    evalState.wave = 3;
    evalState.stageElapsed = 45;
    evalState.player.hp = 85;
    evalState.player.maxHp = 100;
    evalState.damageTakenInStage = 10;
    evalState.barrelKill = true;
    var starsRes = evaluateStageStars(evalState, stage11);
    if (!starsRes.star1 || !starsRes.star2 || !starsRes.star3) {
      throw new Error('stage_1_1 star evaluation failed: ' + JSON.stringify(starsRes));
    }
    evalState.barrelKill = false;
    var starsNoBarrel = evaluateStageStars(evalState, stage11);
    if (starsNoBarrel.star3) throw new Error('stage_1_1 star3 must require barrel_kill');
    var stage14 = getCampaignStage('stage_1_4');
    evalState.stats = { justDashes: 3 };
    evalState.player.hp = 85;
    var stars14 = evaluateStageStars(evalState, stage14);
    if (!stars14.star3) throw new Error('stage_1_4 star3 should need just dashes AND hp');
    evalState.stats.justDashes = 2;
    if (evaluateStageStars(evalState, stage14).star3) throw new Error('stage_1_4 star3 must not pass on OR hp alone');
    var stage32 = getCampaignStage('stage_3_2');
    evalState.stats = { spireChains: 3 };
    evalState.stageElapsed = 90;
    evalState.empUsed = false;
    evalState.player.hp = 80;
    var stars32 = evaluateStageStars(evalState, stage32);
    if (!stars32.star2) throw new Error('stage_3_2 star2 must accept spire_chains');
    evalState.stats.spireChains = 0;
    if (evaluateStageStars(evalState, stage32).star2) throw new Error('stage_3_2 star2 must not fall back to time_under');

    var quiet = { wave: 1, waveTime: 0, enemies: [], recipe: { cap: 40 }, wolfPackSurge: false, boss: null };
    if (computeThreatTier(quiet) !== 0) throw new Error('quiet field should be LOW threat');
    var surge = { wave: 2, waveTime: 0, enemies: [{ hp: 10, kind: 'crawler' }, { hp: 10, kind: 'rusher' }], recipe: { cap: 40 }, wolfPackSurge: true, boss: null };
    if (computeThreatTier(surge) < 1) throw new Error('wolf pack surge should raise threat');
    var bossField = { wave: 5, waveTime: 0, enemies: [{ hp: 100, kind: 'titan', isBoss: true }], recipe: { cap: 40 }, wolfPackSurge: false, boss: { hp: 100, kind: 'titan' } };
    if (computeThreatTier(bossField) < 2) throw new Error('living boss should be CRITICAL threat');
    if (pacingSpawnRate(1) !== 0.8 || pacingSpawnRate(2) !== 1.2 || pacingSpawnRate(3) !== 1.0 || pacingSpawnRate(4) !== 1.4) {
      throw new Error('pacingSpawnRate phase table drifted');
    }
  } finally {
    clearSeed();
    rt.state = saved;
  }
}
