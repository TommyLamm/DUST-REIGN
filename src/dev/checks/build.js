import { clearSeed, seedRun } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { makeState } from '../../core/state.js';
import {
  FUSION_CHIPS,
  UPGRADES,
  completesFusionName,
  findUpgrade,
  rarityWeights,
  stackCount
} from '../../data/upgrades.js';
import { dash } from '../../systems/abilities.js';
import { damagePlayer, damageEnemy } from '../../systems/combat.js';
import { onDash, onEmp, onKill } from '../../systems/card-effects.js';
import {
  chooseUpgrade,
  confirmBanish,
  nextXpThreshold,
  randomUpgradeChoices,
  rerollUpgrades,
  skipUpgrade,
  syncXpCurve,
  XP_START
} from '../../systems/progression.js';
import { arcChainProfile, breacherPelletCount, cycleWeaponMode, shoot, vanguardChargeNeed } from '../../systems/weapons.js';
import { renderBuildInspector } from '../../ui/pause-menu.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function idsOf(cards) {
  return cards.map(function (card) { return card.id; }).join(',');
}

function handHas(cards, category) {
  return cards.some(function (card) { return card.category === category; });
}

export function run() {
  var savedState = rt.state;
  var savedUi = rt.ui;
  var savedMouse = rt.input.mouse;
  var savedTouch = rt.input.touchMode;
  var state = makeState(320, 240);
  rt.state = state;
  rt.ui = null;
  rt.input.touchMode = false;
  rt.input.mouse = { x: 280, y: 120, down: false };
  clearSeed();
  try {
    assert(UPGRADES.length === 26, 'expected 12 legacy + 14 new upgrades');
    assert(FUSION_CHIPS.length === 10, 'expected 10 fusions');
    var seenReq = {};
    var fi;
    for (fi = 0; fi < FUSION_CHIPS.length; fi += 1) {
      var fusion = FUSION_CHIPS[fi];
      assert(fusion.category === 'FUSION' && fusion.required && fusion.required.length === 2, 'fusion shape ' + fusion.id);
      var ri;
      for (ri = 0; ri < fusion.required.length; ri += 1) {
        var req = fusion.required[ri];
        assert(!seenReq[req], 'fusion prereq overlap ' + req);
        seenReq[req] = true;
        assert(UPGRADES.some(function (card) { return card.id === req; }), 'missing prereq ' + req);
      }
    }
    var weights = rarityWeights(1);
    assert(weights.common === 70 && weights.rare === 25 && weights.prototype === 5, 'act 1 rarity weights');
    var weights2 = rarityWeights(2);
    assert(weights2.common === 63 && weights2.rare === 30 && weights2.prototype === 7, 'act 2 rarity weights');
    var weights3 = rarityWeights(3);
    assert(weights3.common === 56 && weights3.rare === 35 && weights3.prototype === 9, 'act 3 rarity weights');

    var threshold = XP_START;
    var xpSum = 0;
    var step;
    for (step = 0; step < 6; step += 1) {
      xpSum += threshold;
      threshold = nextXpThreshold(threshold);
    }
    assert(xpSum === 1324, 'six-card XP curve should be 1324, got ' + xpSum);

    state.level = 1;
    state.xp = 0;
    state.xpNext = 100;
    syncXpCurve(state);
    assert(state.xpNext === 80, 'legacy first threshold migrates to 80');

    var legacy = ['rapid-fire', 'scatter-shot', 'heavy-plating', 'overdrive-injector', 'magnet-core', 'hot-load', 'rail-slug', 'ricochet', 'shockwave-dash', 'tesla-coil', 'reactive-armor', 'high-caliber'];
    legacy.forEach(function (id) { assert(findUpgrade(id), 'missing legacy card ' + id); });
    assert(findUpgrade('rapid-fire').maxStacks === 5, 'rapid-fire cap');
    assert(findUpgrade('servo-legs').category === 'MOBILITY', 'servo category');
    assert(findUpgrade('tracer-rounds').weapon === 'standard', 'tracer weapon lock');

    state.player.weaponMode = 'standard';
    state.weaponId = 'standard';
    state.acquiredUpgrades = [];
    seedRun('build-hand');
    var firstHand = randomUpgradeChoices();
    seedRun('build-hand');
    assert(idsOf(randomUpgradeChoices()) === idsOf(firstHand), 'card draw is seeded');
    assert(firstHand.length === 3 && !handHas(firstHand, 'FUSION') && handHas(firstHand, 'OFFENSE'), 'fresh hand is three non-fusion cards with an offense card');

    var rapid = findUpgrade('rapid-fire');
    state.acquiredUpgrades = [rapid, rapid, rapid, rapid, rapid];
    seedRun('build-cap');
    var capped = 0;
    for (capped = 0; capped < 12; capped += 1) {
      var cappedHand = randomUpgradeChoices();
      assert(!cappedHand.some(function (card) { return card.id === 'rapid-fire'; }), 'capped rapid-fire left the pool');
    }

    state.acquiredUpgrades = [];
    state.banished = ['scatter-shot'];
    seedRun('build-ban');
    for (capped = 0; capped < 8; capped += 1) {
      assert(!randomUpgradeChoices().some(function (card) { return card.id === 'scatter-shot'; }), 'banished card stayed out');
    }

    state.banished = [];
    state.player.weaponMode = 'standard';
    seedRun('build-weapon');
    for (capped = 0; capped < 10; capped += 1) {
      var weaponHand = randomUpgradeChoices();
      assert(!weaponHand.some(function (card) { return card.weapon && card.weapon !== 'standard'; }), 'off-weapon card entered the hand');
    }

    state.acquiredUpgrades = [findUpgrade('tesla-coil'), findUpgrade('shockwave-dash')];
    seedRun('build-fusion');
    var fusionHand = randomUpgradeChoices();
    assert(fusionHand.some(function (card) { return card.id === 'static-tempest'; }), 'ready fusion was not offered');
    assert(handHas(fusionHand, 'OFFENSE'), 'fusion hand lost the offense guarantee');
    assert(completesFusionName(state, 'shockwave-dash').indexOf('STATIC TEMPEST') === 0, 'completes label');
    state.player.staticTempest = true;
    state.acquiredUpgrades.push(FUSION_CHIPS[0]);
    seedRun('build-fusion-2');
    assert(!randomUpgradeChoices().some(function (card) { return card.id === 'static-tempest'; }), 'owned fusion was offered again');

    state.acquiredUpgrades = [];
    state.player.staticTempest = false;
    state.paused = true;
    state.rerolls = 1;
    state.upgradeChoices = firstHand.slice();
    assert(rerollUpgrades() === true && state.rerolls === 0 && state.upgradeChoices.length === 3, 'reroll spends one charge');
    assert(rerollUpgrades() === false, 'reroll without charges should no-op');

    state.banishes = 1;
    state.banished = [];
    state.banishPicking = true;
    state.upgradeChoices = [findUpgrade('scatter-shot'), findUpgrade('hot-load'), findUpgrade('heavy-plating')];
    assert(confirmBanish(0) === true, 'banish should confirm');
    assert(state.banishes === 0 && state.banished[0] === 'scatter-shot', 'banish records the card');
    assert(state.upgradeChoices.length === 3 && state.upgradeChoices[0].id !== 'scatter-shot', 'banish replaces the card');

    state.paused = true;
    state.upgradeChoices = [findUpgrade('hot-load'), findUpgrade('heavy-plating'), findUpgrade('magnet-core')];
    state.player.hp = 40;
    state.score = 0;
    state.scoreBreakdown.style = 0;
    state.xp = 0;
    state.xpNext = 80;
    assert(skipUpgrade() === true, 'skip should apply');
    assert(state.player.hp === 50 && state.score === 100 && state.scoreBreakdown.style === 100, 'skip heals 10 and scores 100');
    assert(state.upgradeChoices.length === 0 && state.paused === false, 'skip closes the pick');

    findUpgrade('servo-legs').apply(state);
    assert(Math.abs(state.player.moveSpeedMult - 1.08) < 0.0001, 'servo speed');
    findUpgrade('dash-capacitor').apply(state);
    assert(state.player.dashChargesMax === 2, 'dash capacitor charges');
    var savedKeys = rt.input.keys;
    rt.input.keys = new Set();
    state.paused = false;
    state.over = false;
    state.player.dashCharges = 2;
    state.player.dashCooldown = 0;
    state.player.x = 80;
    state.player.y = 120;
    state.enemies = [];
    state.enemyBullets = [];
    dash();
    assert(state.player.dashCharges === 1 && state.player.dashCooldown === 2.2, 'second dash charge starts its own cooldown');
    dash();
    assert(state.player.dashCharges === 0, 'both dash charges can be spent');
    rt.input.keys = savedKeys;
    findUpgrade('emp-amplifier').apply(state);
    assert(state.player.empCost === 40 && state.player.empRadiusBonus === 40, 'emp amplifier');
    findUpgrade('ablative-mesh').apply(state);
    assert(Math.abs(state.player.damageTakenMult - 0.92) < 0.0001, 'ablative mesh');

    state.player.weaponMode = 'breacher';
    state.player.mastery = 0;
    state.player.flechettePack = false;
    state.player.cooldown = 0;
    state.player.x = 80;
    state.player.y = 120;
    state.bullets = [];
    shoot();
    assert(state.bullets.length === 5 && breacherPelletCount(state.player) === 5, 'breacher mastery 0 stays 5 pellets');
    state.player.mastery = 1;
    state.player.cooldown = 0;
    state.bullets = [];
    shoot();
    assert(state.bullets.length === 7, 'breacher mastery 1 fires 7');
    state.player.flechettePack = true;
    state.player.cooldown = 0;
    state.bullets = [];
    shoot();
    assert(state.bullets.length === 9, 'flechette adds 2 pellets');

    state.player.weaponMode = 'standard';
    state.player.mastery = 2;
    state.player.flechettePack = false;
    state.player.tracerRounds = false;
    state.player.standardRound = 0;
    state.player.cooldown = 0;
    state.bullets = [];
    shoot();
    assert(state.bullets.length === 2 && Math.abs(state.bullets[0].damage - state.player.damage * 0.7) < 0.001, 'standard mastery 2 is a 70% pair');

    state.player.mastery = 0;
    state.player.tracerRounds = true;
    state.player.tracerRound = 0;
    state.player.pierce = 0;
    state.bullets = [];
    var shot;
    for (shot = 0; shot < 5; shot += 1) {
      state.player.cooldown = 0;
      shoot();
    }
    var tracer = state.bullets[4];
    assert(tracer && tracer.forceCrit === true && tracer.pierce >= 2, 'fifth tracer pierces and crits');

    state.player.weaponMode = 'vanguard';
    state.player.mastery = 0;
    state.player.capacitorRail = false;
    assert(vanguardChargeNeed(state.player) === 0.6, 'vanguard base charge');
    state.player.mastery = 1;
    assert(Math.abs(vanguardChargeNeed(state.player) - 0.45) < 0.0001, 'vanguard mastery 1 charge');
    state.player.capacitorRail = true;
    assert(Math.abs(vanguardChargeNeed(state.player) - 0.3375) < 0.0001, 'capacitor rail shortens charge');

    state.player.weaponMode = 'arc-welder';
    state.player.mastery = 0;
    state.player.arcLattice = false;
    var chain = arcChainProfile(state.player);
    assert(chain.targets === 2 && chain.range === 110 && chain.ratio === 0.7, 'arc base chain');
    state.player.mastery = 2;
    state.player.arcLattice = true;
    chain = arcChainProfile(state.player);
    assert(chain.targets === 4 && chain.range === 150 && chain.ratio === 0.8, 'arc mastery and lattice');

    state.player.weaponMode = 'standard';
    state.player.tracerRounds = true;
    state.player.masteryBase = 2;
    state.player.mastery = 3;
    cycleWeaponMode('breacher');
    assert(state.weaponId === 'breacher' && state.player.mastery === 0, 'weapon swap clears mastery');
    cycleWeaponMode('standard');
    assert(state.player.mastery === 1 && stackCount(state, 'tracer-rounds') === 0, 'returning to a owned weapon card restores its mastery point');

    state.player.phoenix = true;
    state.player.hp = 20;
    state.player.maxHp = 100;
    state.player.invulnerable = 0;
    state.player.phoenixSpent = false;
    state.acquiredUpgrades = [findUpgrade('phoenix-core')];
    state.over = false;
    state.enemies = [];
    var revived = damagePlayer(80, 'test');
    assert(revived > 0 && state.over === false && state.player.hp === 40 && state.player.phoenixSpent === true, 'phoenix revives at 40%');
    assert(state.player.invulnerable >= 2 && stackCount(state, 'phoenix-core') === 0, 'phoenix spends the card and grants invulnerability');

    state.player.hollowPoint = true;
    state.player.executioner = false;
    var foe = { kind: 'crawler', x: 0, y: 0, r: 14, hp: 20, maxHp: 100 };
    state.enemies = [foe];
    damageEnemy(foe, 10, { source: 'bullet', x: 0, y: 0 });
    assert(foe.hp === 6.5, 'hollow point adds 35% below 30% HP');

    state.player.executioner = true;
    var marked = { kind: 'rusher', x: 0, y: 0, r: 10, hp: 10, maxHp: 100, empTimer: 0 };
    state.enemies = [marked];
    damageEnemy(marked, 1, { source: 'bullet', x: 0, y: 0 });
    assert(marked.hp <= 0, 'executioner finishes a non-boss below 15% HP');

    state.player.fortressProtocol = true;
    onEmp(state.player, { x: 10, y: 10, r: 140 });
    assert(state.player.shield === 30 && state.player.shieldTimer === 2, 'fortress shield on EMP');
    state.player.shield = 0;
    state.player.invulnerable = 0;
    state.player.damageTakenMult = 1;
    state.player.energy = 60;
    state.player.hp = 70;
    state.player.phoenix = true;
    var fortressApplied = damagePlayer(80, 'contact');
    assert(fortressApplied === 60 && state.player.hp === 10 && state.player.phoenix === true, 'fortress x0.75 applies before phoenix');
    state.player.phoenix = false;
    state.player.fortressProtocol = false;

    state.player.weaponMode = 'standard';
    state.player.mastery = 0;
    state.player.afterburner = true;
    state.player.afterburnerTimer = 1;
    state.player.cooldown = 0;
    state.player.vulcanMeltdown = false;
    state.player.overdrive = 0;
    state.bullets = [];
    shoot();
    assert(Math.abs(state.player.cooldown - state.player.fireRate * 0.7) < 0.0001, 'afterburner shortens cooldown');

    state.bullets = [];
    state.player.kineticBallet = true;
    state.enemies = [
      { kind: 'crawler', x: 140, y: 120, r: 14, hp: 20, maxHp: 20 },
      { kind: 'crawler', x: 180, y: 140, r: 14, hp: 20, maxHp: 20 },
      { kind: 'crawler', x: 200, y: 80, r: 14, hp: 20, maxHp: 20 }
    ];
    onDash(state.player, { just: false, x: 100, y: 120, startX: 40, startY: 120 });
    assert(state.bullets.filter(function (bullet) { return bullet.homing; }).length === 3, 'kinetic ballet launches 3 missiles');

    state.orbs = [];
    state.player.salvageChance = 1;
    seedRun('build-salvage');
    onKill({ kind: 'crawler', x: 12, y: 12, hp: 0 }, { cause: 'bullet' });
    assert(state.orbs.some(function (orb) { return orb.kind === 'repair'; }), 'salvage drops repair scrap');

    var mock = {
      chassisSelector: {
        buttons: [],
        querySelectorAll: function () { return this.buttons; }
      },
      chassisDesc: { textContent: '' },
      statFireRate: { textContent: '' },
      statDamage: { textContent: '' },
      statCrit: { textContent: '' },
      statBallistics: { textContent: '' },
      statSpeed: { textContent: '' },
      statMagnet: { textContent: '' },
      buildPassiveTags: { innerHTML: '' },
      installedChipsCount: { textContent: '' },
      installedChipsList: { innerHTML: '' },
      activeFusionsCount: { textContent: '' },
      fusionMatrixList: { innerHTML: '' }
    };
    ['standard', 'breacher', 'vanguard', 'arc-welder'].forEach(function (mode) {
      var classes = [];
      mock.chassisSelector.buttons.push({
        disabled: false,
        getAttribute: function (key) { return key === 'data-mode' ? mode : null; },
        setAttribute: function () {},
        classList: { toggle: function (cls, on) {
          var idx = classes.indexOf(cls);
          if (on && idx === -1) classes.push(cls);
          else if (!on && idx !== -1) classes.splice(idx, 1);
        } }
      });
    });
    state.player.weaponMode = 'standard';
    state.player.mastery = 0;
    state.player.overdrive = 0;
    state.acquiredUpgrades = [findUpgrade('tracer-rounds'), findUpgrade('flechette-pack')];
    rt.ui = mock;
    renderBuildInspector();
    assert(mock.statFireRate.textContent === '2.3 RPS (x5)' || mock.statFireRate.textContent.indexOf('RPS') !== -1, 'build fire rate still renders');
    assert(mock.chassisDesc.textContent.indexOf('MASTERY M0') !== -1, 'build page shows mastery');
    assert(mock.installedChipsList.innerHTML.indexOf('INACTIVE') !== -1, 'off-weapon card is marked inactive');
    assert(mock.chassisSelector.buttons[0].disabled === true, 'chassis buttons stay read-only');
    rt.ui = null;
  } finally {
    clearSeed();
    rt.state = savedState;
    rt.ui = savedUi;
    rt.input.mouse = savedMouse;
    rt.input.touchMode = savedTouch;
  }
}
