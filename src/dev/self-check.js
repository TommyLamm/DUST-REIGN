import { BOUNTY_SURGE_DURATION, REPAIR_OVERFLOW_SCORE, STORM_FRONT_SECONDS, WAVE_LENGTH, WEAPON_MODES } from '../config.js';
import { clearSeed } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { makeState } from '../core/state.js';
import { FUSION_CHIPS, UPGRADES } from '../data/upgrades.js';
import { run as runBuildChecks } from './checks/build.js';
import { run as runDirectorChecks } from './checks/director.js';
import { run as runEnemyChecks } from './checks/enemies.js';
import { run as runMetaChecks } from './checks/meta.js';
import { run as runScoringChecks } from './checks/scoring.js';
import { dash, triggerEmp, triggerReactiveArmor, triggerSpireMicroResonance } from '../systems/abilities.js';
import { explodeBarrel, explodeCore, killEnemy } from '../systems/combat.js';
import { calculateCombatRank, isStormFront } from '../systems/flow.js';
import { randomUpgradeChoices } from '../systems/progression.js';
import { spawnEnemy, spawnSpires, spawnTitan } from '../systems/spawning.js';
import { update } from '../systems/update.js';
import { cycleWeaponMode, shoot } from '../systems/weapons.js';
import { updateDomUi } from '../ui/hud.js';
import { renderBuildInspector } from '../ui/pause-menu.js';

export function selfCheck() {
  var test = makeState(320, 240);
  var previous = rt.state;
  var previousUi = rt.ui;
  var previousMouseDown = rt.input.mouse.down;
  var previousKeys = rt.input.keys;
  var firstScore;
  var chainScore;
  var lightDrop;
  var bruteDrop;
  var eliteDrop;
  var healed;
  var capped;
  var cappedScore;
  var overflowScore;
  var overflowStatus;
  var repairStatus;
  var bountyScore;
  var secondBountyScore;
  var bountyClaimed;
  var bountySurge;
  var retainedSurge;
  var waveReset;
  var stormClock;
  var artilleryScore;
  var grazeOk;
  var justDashOk;
  var barrelKickOk;
  var barrelShootOk;
  var stormWindOk;
  var coreTitanOk;
  var barrelTitanOk;
  rt.state = test;
  try {
    test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
    killEnemy(0);
    firstScore = test.score;
    test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
    killEnemy(0);
    chainScore = test.score;
    test.orbs = [];
    test.enemies.push({ kind: 'rusher', x: 0, y: 0, r: 10, color: '#e1a644' });
    killEnemy(0);
    lightDrop = test.orbs.some(function (orb) { return orb.kind === 'repair'; });
    test.orbs = [];
    test.enemies.push({ kind: 'brute', x: 0, y: 0, r: 23, color: '#bd573f' });
    killEnemy(0);
    bruteDrop = test.orbs.some(function (orb) { return orb.kind === 'repair'; });
    test.orbs = [];
    test.enemies.push({ kind: 'elite', x: 0, y: 0, r: 19, color: '#75d1b0' });
    killEnemy(0);
    eliteDrop = test.orbs.some(function (orb) { return orb.kind === 'repair'; }) && test.orbs.some(function (orb) { return orb.kind === 'overdrive'; });
    rt.ui = { width: 320, height: 240, statusText: { textContent: '' } };
    rt.input.keys = new Set();
    rt.input.mouse.down = false;
    test.hitstop = 0;
    test.player.hp = 50;
    test.orbs = [{ kind: 'repair', x: test.player.x, y: test.player.y, vx: 0, vy: 0, r: 10, value: 0, life: 22 }];
    update(0.016);
    healed = test.player.hp;
    repairStatus = rt.ui.statusText.textContent;
    test.score = 0;
    test.hitstop = 0;
    test.player.hp = test.player.maxHp - 5;
    test.orbs = [{ kind: 'repair', x: test.player.x, y: test.player.y, vx: 0, vy: 0, r: 10, value: 0, life: 22 }];
    update(0.016);
    capped = test.player.hp;
    cappedScore = test.score;
    test.hitstop = 0;
    test.player.hp = test.player.maxHp;
    test.orbs = [{ kind: 'repair', x: test.player.x, y: test.player.y, vx: 0, vy: 0, r: 10, value: 0, life: 22 }];
    update(0.016);
    overflowScore = test.score;
    overflowStatus = rt.ui.statusText.textContent;
    test.score = 0;
    test.combo = 0;
    test.comboTimer = 0;
    test.bountyTarget = 1;
    test.bountyKills = 0;
    test.bountyReward = 37;
    test.bountyClaimed = false;
    test.enemies = [];
    test.orbs = [];
    test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
    killEnemy(0);
    bountyScore = test.score;
    bountySurge = test.player.overdrive;
    bountyClaimed = test.bountyClaimed;
    test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
    killEnemy(0);
    secondBountyScore = test.score;
    test.player.overdrive = 5;
    test.bountyTarget = 1;
    test.bountyKills = 0;
    test.bountyReward = 0;
    test.bountyClaimed = false;
    test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
    killEnemy(0);
    retainedSurge = test.player.overdrive;
    test.hitstop = 0;
    test.waveTime = WAVE_LENGTH - STORM_FRONT_SECONDS - 0.01;
    stormClock = !isStormFront();
    test.waveTime = WAVE_LENGTH - STORM_FRONT_SECONDS;
    stormClock = stormClock && isStormFront();
    test.wave = 1;
    test.waveTime = WAVE_LENGTH;
    test.spawnTimer = 999;
    test.bountyTarget = 1;
    test.bountyKills = 1;
    test.bountyReward = 37;
    test.bountyClaimed = true;
    update(0.016);
    waveReset = test.wave === 2 && test.bountyTarget === 9 && test.bountyKills === 0 && test.bountyReward === 200 && !test.bountyClaimed;
    test.score = 0;
    test.combo = 0;
    test.comboTimer = 0;
    test.enemies = [{ kind: 'artillery', x: 0, y: 0, r: 16, color: '#d69e2e' }];
    killEnemy(0);
    artilleryScore = test.score;
    test.score = 0;
    if (test.stats) test.stats.grazes = 0;
    test.hitstop = 0;
    test.player.x = 100;
    test.player.y = 100;
    test.player.r = 15;
    test.enemyBullets = [{ x: 125, y: 100, vx: 0, vy: 0, r: 3.5, damage: 10, life: 5 }];
    update(0.016);
    grazeOk = Boolean(test.enemyBullets[0] && test.enemyBullets[0].grazed && test.stats && test.stats.grazes === 1 && test.score === 15);
    test.player.x = 100;
    test.player.y = 100;
    test.player.dashCooldown = 0;
    test.enemyBullets = [];
    test.enemies = [];
    dash();
    var normalOk = (test.player.dashCooldown === 2.2 && test.player.dashAmbushTimer === 0.6);

    test.player.x = 100;
    test.player.y = 100;
    test.player.dashCooldown = 0;
    test.player.damage = 10;
    test.enemyBullets = [{ x: 125, y: 100, r: 4 }];
    test.enemies = [{ x: 240, y: 100, r: 10, hp: 100 }];
    test.hitstop = 0;
    dash();
    var bulletJustOk = (test.player.dashCooldown === 0.35 && test.player.dashAmbushTimer === 1.2 && test.hitstop === 0.22 && test.enemies[0].hp === 78);

    test.player.x = 100;
    test.player.y = 100;
    test.player.dashCooldown = 0;
    test.enemyBullets = [];
    test.enemies = [{ x: 125, y: 100, r: 10, hp: 100 }];
    test.hitstop = 0;
    dash();
    var enemyJustOk = (test.player.dashCooldown === 0.35 && test.player.dashAmbushTimer === 1.2 && test.hitstop === 0.22);
    justDashOk = normalOk && bulletJustOk && enemyJustOk;

    test.barrels = [{ x: 240, y: 100, vx: 0, vy: 0, r: 14, hp: 20, maxHp: 20, state: 'idle', flyingTimer: 0, rot: 0 }];
    test.player.x = 100;
    test.player.y = 100;
    test.player.dashCooldown = 0;
    test.enemyBullets = [];
    test.enemies = [];
    rt.input.keys = new Set(['d']);
    dash();
    barrelKickOk = Boolean(test.barrels[0] && test.barrels[0].state === 'flying' && test.barrels[0].vx === 480 && test.barrels[0].flyingTimer === 1.2);

    test.barrels = [{ x: 200, y: 200, vx: 0, vy: 0, r: 14, hp: 10, maxHp: 20, state: 'idle', flyingTimer: 0, rot: 0 }];
    test.bullets = [{ x: 195, y: 200, vx: 100, vy: 0, r: 5, damage: 20, life: 1, trail: [], pierce: 0 }];
    test.enemies = [{ kind: 'crawler', x: 230, y: 200, r: 14, hp: 60, maxHp: 60, speed: 50, color: '#8d7861' }];
    test.hitstop = 0;
    update(0.016);
    barrelShootOk = Boolean(test.barrels.length === 0 && test.enemies.length === 0);

    test.waveTime = WAVE_LENGTH - 2;
    test.player.x = 100;
    test.player.y = 100;
    test.bullets = [{ x: 100, y: 100, vx: 0, vy: 0, life: 1, trail: [], bounces: 0 }];
    test.enemies = [];
    test.barrels = [];
    test.volatileCores = [];
    test.enemyBullets = [];
    rt.input.keys = new Set();
    test.hitstop = 0;
    update(0.016);
    var sRad = 35 * Math.PI / 180;
    var expectedPx = 100 + Math.cos(sRad) * 38 * 0.016;
    var expectedBx = 100 + Math.cos(sRad) * 16 * 0.016;
    stormWindOk = Math.abs(test.player.x - expectedPx) < 0.001 && Math.abs(test.bullets[0].x - expectedBx) < 0.001;

    test.enemies = [{ kind: 'titan', x: 100, y: 100, r: 24, hp: 1000, maxHp: 1000 }];
    test.volatileCores = [{ x: 100, y: 100, r: 12, hp: 30, maxHp: 30, rot: 0 }];
    test.stats.damageDealt = 0;
    explodeCore(test.volatileCores[0], 0);
    coreTitanOk = test.enemies[0].hp === 650 && test.enemies[0].empTimer === 3.0 && test.stats.damageDealt === 350;

    test.enemies = [{ kind: 'titan', x: 100, y: 100, r: 24, hp: 650, maxHp: 1000, empTimer: 0 }];
    test.barrels = [{ x: 100, y: 100, r: 14, hp: 20, maxHp: 20, state: 'flying', flyingTimer: 1.0, rot: 0 }];
    test.stats.damageDealt = 0;
    explodeBarrel(test.barrels[0], 0, true);
    barrelTitanOk = test.enemies[0].hp === 410 && test.enemies[0].empTimer === 1.5 && test.stats.damageDealt === 240;

    test.player.weaponMode = 'standard';
    cycleWeaponMode();
    var c1 = test.player.weaponMode === 'breacher';
    cycleWeaponMode();
    var c2 = test.player.weaponMode === 'vanguard';
    cycleWeaponMode();
    var c3 = test.player.weaponMode === 'arc-welder';
    cycleWeaponMode();
    var c4 = test.player.weaponMode === 'standard';
    cycleWeaponMode('vanguard');
    var c5 = test.player.weaponMode === 'vanguard';
    var weaponCycleOk = c1 && c2 && c3 && c4 && c5;

    test.player.weaponMode = 'breacher';
    test.player.cooldown = 0;
    test.player.x = 200;
    test.player.y = 200;
    test.bullets = [];
    rt.input.mouse.x = 300;
    rt.input.mouse.y = 200;
    shoot();
    var breacherShootOk = test.bullets.length === 5 &&
      test.bullets[0].r === 3.5 &&
      test.bullets[0].life === 0.42 &&
      Math.abs(test.player.x - (200 - 4.5)) < 0.001;

    test.player.weaponMode = 'vanguard';
    test.player.chargeTime = 0;
    test.player.isCharging = false;
    test.player.cooldown = 0;
    test.player.x = 100;
    test.player.y = 100;
    test.bullets = [];
    rt.input.mouse.down = true;
    rt.input.mouse.x = 200;
    rt.input.mouse.y = 100;
    for (var vi = 0; vi < 20; vi += 1) update(0.025);
    var vanguardSlowOk = test.player.isCharging === true && test.player.chargeTime >= 0.5;
    for (var vj = 0; vj < 5; vj += 1) update(0.025);
    var vanguardShootOk = test.bullets.length === 1 &&
      test.bullets[0].r === 6.0 &&
      test.bullets[0].pierce === 99 &&
      test.bullets[0].knockback === 35 &&
      Math.abs(Math.hypot(test.bullets[0].vx, test.bullets[0].vy) - 1350) < 0.001 &&
      test.player.chargeTime === 0 &&
      test.player.isCharging === false;
    rt.input.mouse.down = false;

    test.player.weaponMode = 'arc-welder';
    test.bullets = [{
      x: 100, y: 100, vx: 500, vy: 0, r: 3.0, damage: 20, life: 1, trail: [], hits: [], isArcWelder: true
    }];
    test.enemies = [
      { kind: 'crawler', x: 100, y: 100, r: 10, hp: 100, maxHp: 100 },
      { kind: 'crawler', x: 140, y: 100, r: 10, hp: 100, maxHp: 100 },
      { kind: 'crawler', x: 160, y: 100, r: 10, hp: 100, maxHp: 100 },
      { kind: 'crawler', x: 300, y: 100, r: 10, hp: 100, maxHp: 100 }
    ];
    test.stats.damageDealt = 0;
    test.hitstop = 0;
    update(0.016);
    var arcChainOk = test.enemies[0].hp === 80 &&
      test.enemies[1].hp === 86 &&
      test.enemies[2].hp === 86 &&
      test.enemies[3].hp === 100 &&
      test.stats.damageDealt === (20 + 14 + 14);

    // Fusion Chips Matrix & Synergy Draw Logic Check
    var fusionCountOk = FUSION_CHIPS.length >= 6;
    var fusionReqsOk = FUSION_CHIPS.every(function (fc) {
      return fc.category === 'FUSION' &&
        fc.required &&
        fc.required.length === 2 &&
        fc.required.every(function (reqId) {
          return UPGRADES.some(function (u) { return u.id === reqId; });
        });
    });

    // Test 1: No prereqs met -> randomUpgradeChoices() yields 0 fusion cards
    test.acquiredUpgrades = [];
    var choicesNoPrereq = randomUpgradeChoices();
    var noFusionOk = choicesNoPrereq.length === 3 &&
      choicesNoPrereq.every(function (c) { return c.category !== 'FUSION'; });

    // Test 2: Prereqs for static-tempest met ('tesla-coil' and 'shockwave-dash')
    var teslaCard = UPGRADES.filter(function (u) { return u.id === 'tesla-coil'; })[0];
    var shockCard = UPGRADES.filter(function (u) { return u.id === 'shockwave-dash'; })[0];
    test.acquiredUpgrades = [teslaCard, shockCard];
    var choicesWithPrereq = randomUpgradeChoices();
    var hasStaticTempest = choicesWithPrereq.some(function (c) { return c.id === 'static-tempest' && c.category === 'FUSION'; });
    var hasOffenseCard = choicesWithPrereq.some(function (c) { return c.category === 'OFFENSE' || c.category === 'WEAPON'; });
    var fusionDrawOk = choicesWithPrereq.length === 3 && hasStaticTempest && hasOffenseCard;

    // Test 3: Apply static-tempest -> state flag flipped to true & will not be drawn again
    var staticFusion = FUSION_CHIPS.filter(function (fc) { return fc.id === 'static-tempest'; })[0];
    staticFusion.apply(test);
    test.acquiredUpgrades.push(staticFusion);
    var staticAppliedOk = test.player.staticTempest === true;
    var choicesAfterAcquired = randomUpgradeChoices();
    var noDuplicateFusionOk = !choicesAfterAcquired.some(function (c) { return c.id === 'static-tempest'; });

    var fusionMatrixOk = fusionCountOk && fusionReqsOk && noFusionOk && fusionDrawOk && staticAppliedOk && noDuplicateFusionOk;

    // Phase 2 Step 3: 6 Fusion Chips Gameplay Execution Checks
    // 1. Static Tempest Check
    test.player.x = 100;
    test.player.y = 100;
    test.player.dashCooldown = 0;
    test.player.staticTempest = true;
    test.lightningArcs = [];
    test.enemies = [{ kind: 'rusher', x: 160, y: 100, r: 10, hp: 100, maxHp: 100, empTimer: 0 }];
    test.stats.damageDealt = 0;
    rt.input.keys = new Set();
    dash();
    var staticTempestOk = test.lightningArcs.length === 6 &&
      test.enemies.length === 1 &&
      test.enemies[0].empTimer >= 1.7 &&
      test.enemies[0].hp < 100 &&
      test.stats.damageDealt > 0;

    // 2. Kinetic Shrapnel Check (Bounce & Pierce)
    test.player.kineticShrapnel = true;
    test.bullets = [{ x: 2, y: 100, vx: -200, vy: 0, r: 4, damage: 40, life: 1, bounces: 1, trail: [], isShrapnel: false }];
    test.enemies = [];
    test.volatileCores = [];
    test.barrels = [];
    update(0.016);
    var shrapnelBounceOk = test.bullets.some(function (b) {
      return b.isShrapnel === true && b.r === 2.5 && b.damage === 18 && b.colorCore === '#ffe082';
    });
    test.bullets = [{ x: 100, y: 100, vx: 400, vy: 0, r: 4, damage: 30, life: 1, bounces: 0, pierce: 1, trail: [], hits: [], isShrapnel: false }];
    test.enemies = [{ kind: 'brute', x: 100, y: 100, r: 20, hp: 200, maxHp: 200, empTimer: 0 }];
    update(0.016);
    var shrapnelPierceOk = test.bullets.some(function (b) {
      return b.isShrapnel === true && b.damage === Math.round(30 * 0.45);
    });
    var kineticShrapnelOk = shrapnelBounceOk && shrapnelPierceOk;

    // 3. Overcharge Retaliation Check
    test.player.x = 100;
    test.player.y = 100;
    test.player.aim = 0;
    test.player.overchargeRetaliation = true;
    test.bullets = [];
    test.enemies = [{ kind: 'rusher', x: 120, y: 100, r: 10, hp: 100, maxHp: 100, empTimer: 0 }];
    test.stats.damageDealt = 0;
    triggerReactiveArmor(120, 100);
    var overchargeRetaliationOk = test.enemies[0].hp === (100 - 66) &&
      test.bullets.some(function (b) {
        return b.isOverchargeSpike === true && b.damage === 95 && b.pierce === 99 && b.knockback === 45 && b.r === 6.0;
      });

    // 4. Vulcan Meltdown Check
    test.player.vulcanMeltdown = true;
    test.player.continuousFireTime = 1.3;
    test.player.cooldown = 0;
    test.player.weaponMode = 'standard';
    test.bullets = [];
    var normalRate = test.player.fireRate;
    shoot();
    var vulcanShootOk = test.player.cooldown <= (normalRate * 0.75) &&
      test.player.cooldown < normalRate &&
      test.bullets.length > 0 &&
      test.bullets[0].isVulcan === true &&
      test.bullets[0].pierce >= 1;
    rt.input.mouse.down = true;
    test.player.continuousFireTime = 0;
    update(0.05);
    var continuousTrackingDownOk = test.player.continuousFireTime > 0.04;
    rt.input.mouse.down = false;
    update(0.05);
    var continuousTrackingUpOk = test.player.continuousFireTime === 0;
    var vulcanMeltdownOk = vulcanShootOk && continuousTrackingDownOk && continuousTrackingUpOk;

    // 5. Graviton Bulwark Check
    test.player.x = 100;
    test.player.y = 100;
    test.player.gravitonBulwark = true;
    test.player.magnetRadius = 180;
    test.player.hp = 80;
    test.enemyBullets = [{ x: 150, y: 100, vx: 200, vy: 0, r: 4, damage: 10, life: 2 }];
    test.enemies = [];
    update(0.016);
    var gravitonSlowOk = test.enemyBullets.length > 0 && Math.abs(test.enemyBullets[0].vx - 130) < 0.001;
    test.enemies = [{ kind: 'rusher', x: 150, y: 100, r: 10, hp: 100, maxHp: 100 }];
    test.enemyBullets = [{ x: 130, y: 100, vx: 100, vy: 0, r: 4, damage: 10, life: 2 }];
    test.orbs = [{ kind: 'repair', x: 100, y: 100, vx: 0, vy: 0, r: 10, value: 0, life: 20 }];
    update(0.016);
    var gravitonBurstOk = test.enemyBullets.length === 0 && test.enemies[0].x >= 260;
    var gravitonBulwarkOk = gravitonSlowOk && gravitonBurstOk;

    // 6. Plasma Meltdown Core Check
    test.player.x = 100;
    test.player.y = 100;
    test.player.plasmaMeltdown = true;
    test.player.overdrive = 2.0;
    test.player.cooldown = 0;
    test.bullets = [];
    test.plasmaZones = [];
    shoot();
    var plasmaShootOk = test.bullets.length > 0 &&
      test.bullets[0].isPlasmaMeltdown === true &&
      test.bullets[0].r === (test.player.bulletSize + 3) &&
      test.bullets[0].colorCore === '#ff4d2e';
    test.bullets = [{ x: 100, y: 100, vx: 300, vy: 0, r: 7, damage: 20, life: 1, bounces: 0, pierce: 0, hits: [], isPlasmaMeltdown: true, trail: [] }];
    test.enemies = [{ kind: 'brute', x: 100, y: 100, r: 20, hp: 200, maxHp: 200 }];
    update(0.016);
    var plasmaImpactOk = test.plasmaZones.length === 1 &&
      test.plasmaZones[0].r === 40 &&
      test.plasmaZones[0].maxTimer === 2.0 &&
      test.plasmaZones[0].timer >= 1.9;
    var enemyHpBefore = test.enemies[0].hp;
    update(0.42);
    var plasmaBurnOk = (enemyHpBefore - test.enemies[0].hp) >= 16;
    var plasmaMeltdownOk = plasmaShootOk && plasmaImpactOk && plasmaBurnOk;

    var fusionExecOk = staticTempestOk && kineticShrapnelOk && overchargeRetaliationOk && vulcanMeltdownOk && gravitonBulwarkOk && plasmaMeltdownOk;

    // Phase 2 Step 4: Build Inspector & Fusion Matrix UI Check
    var mockInspectorUi = {
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
    WEAPON_MODES.forEach(function (m) {
      var classes = [];
      mockInspectorUi.chassisSelector.buttons.push({
        getAttribute: function (k) { return k === 'data-mode' ? m : null; },
        setAttribute: function () {},
        classList: {
          toggle: function (cls, val) {
            var idx = classes.indexOf(cls);
            if (val && idx === -1) classes.push(cls);
            else if (!val && idx !== -1) classes.splice(idx, 1);
          },
          contains: function (cls) { return classes.indexOf(cls) !== -1; }
        }
      });
    });

    test.player.staticTempest = false;
    test.player.kineticShrapnel = false;
    test.player.overchargeRetaliation = false;
    test.player.vulcanMeltdown = false;
    test.player.gravitonBulwark = false;
    test.player.plasmaMeltdown = false;
    test.acquiredUpgrades = [];
    rt.ui = mockInspectorUi;
    test.player.weaponMode = 'breacher';
    test.player.fireRate = 0.18;
    test.player.damage = 26;
    test.player.overdrive = 0;
    renderBuildInspector();
    var breacherUiOk = mockInspectorUi.statFireRate.textContent === '2.3 RPS (x5)' &&
      mockInspectorUi.chassisDesc.textContent.indexOf('BREACHER') !== -1 &&
      mockInspectorUi.activeFusionsCount.textContent === '0' &&
      mockInspectorUi.fusionMatrixList.innerHTML.indexOf('is-locked') !== -1;

    test.player.weaponMode = 'vanguard';
    renderBuildInspector();
    var vanguardUiOk = mockInspectorUi.statFireRate.textContent === '1.8 RPS (CHARGE)' &&
      mockInspectorUi.statBallistics.textContent.indexOf('PIERCE 99+') !== -1;

    test.player.weaponMode = 'arc-welder';
    renderBuildInspector();
    var arcUiOk = mockInspectorUi.statFireRate.textContent === '12.5 RPS';

    test.acquiredUpgrades = [
      { id: 'tesla-coil', title: 'TESLA COIL' },
      { id: 'shockwave-dash', title: 'SHOCKWAVE DASH' }
    ];
    renderBuildInspector();
    var readyUiOk = mockInspectorUi.fusionMatrixList.innerHTML.indexOf('is-ready') !== -1 &&
      mockInspectorUi.fusionMatrixList.innerHTML.indexOf('READY FOR SYNTHESIS') !== -1;

    test.player.staticTempest = true;
    renderBuildInspector();
    var unlockedUiOk = mockInspectorUi.activeFusionsCount.textContent === '1' &&
      mockInspectorUi.fusionMatrixList.innerHTML.indexOf('is-unlocked') !== -1 &&
      mockInspectorUi.fusionMatrixList.innerHTML.indexOf('ONLINE') !== -1;

    var buildInspectorUiOk = breacherUiOk && vanguardUiOk && arcUiOk && readyUiOk && unlockedUiOk;

    // Phase 3 Step 1: Elite Affixes System Check
    rt.ui = { width: 320, height: 240, statusText: { textContent: '' } };
    test.player.x = 160;
    test.player.y = 120;
    test.player.vx = 0;
    test.player.vy = 0;
    test.wave = 4;
    test.enemies = [];
    var origRandom = Math.random;
    Math.random = function () { return 0.01; };
    spawnEnemy();
    Math.random = origRandom;
    var spawnedElite = test.enemies[0];
    var affixesList = ['mirror', 'vortex', 'command', 'blink'];
    var affixSpawnOk = test.enemies.length > 0 &&
      spawnedElite.kind === 'elite' &&
      affixesList.indexOf(spawnedElite.affix) !== -1 &&
      spawnedElite.shieldAngle === 0 &&
      spawnedElite.shieldBrokenTimer === 0 &&
      spawnedElite.commandTimer === 2.5 &&
      spawnedElite.blinkTimer === 3.2 &&
      spawnedElite.blinkTelegraph === false;

    test.wave = 3;
    test.enemies = [];
    Math.random = function () { return 0.01; };
    spawnEnemy();
    Math.random = origRandom;
    var wave3NoAffixOk = test.enemies[0].affix === null;

    test.enemies = [{
      kind: 'elite',
      affix: 'mirror',
      x: 150,
      y: 100,
      r: 19,
      hp: 200,
      maxHp: 200,
      shieldAngle: 0,
      shieldBrokenTimer: 0,
      color: '#75d1b0'
    }];
    test.player.x = 200;
    test.player.y = 100;
    test.bullets = [{
      x: 165,
      y: 100,
      vx: -300,
      vy: 0,
      r: 4,
      damage: 26,
      life: 1,
      bounces: 0,
      pierce: 0,
      hits: [],
      trail: []
    }];
    update(0.016);
    var mirrorBlockOk = test.enemies[0].hp === 200 && test.bullets.length === 0;

    test.enemies[0].shieldBrokenTimer = 3.0;
    test.bullets = [{
      x: 165,
      y: 100,
      vx: -300,
      vy: 0,
      r: 4,
      damage: 26,
      life: 1,
      bounces: 0,
      pierce: 0,
      hits: [],
      trail: []
    }];
    update(0.016);
    var mirrorBrokeHitOk = test.enemies[0].hp < 200;

    test.player.x = 20;
    test.player.y = 20;
    test.player.magnetRadius = 0;
    test.enemies = [{ kind: 'crawler', x: 200, y: 100, r: 14, hp: 50, maxHp: 50, speed: 0 }];
    test.orbs = [{ kind: 'scrap', x: 180, y: 100, vx: 0, vy: 0, r: 8, life: 10 }];
    test.vortices = [{ x: 100, y: 100, r: 160, life: 2.5, maxLife: 2.5 }];
    update(0.1);
    var vortexPullOk = test.enemies[0].x < 200 && test.enemies[0].x > 100 &&
      test.orbs.length > 0 && test.orbs[0].x < 180 && test.orbs[0].x > 100;

    test.enemies = [{ kind: 'elite', affix: 'vortex', x: 120, y: 120, r: 19, hp: 0, maxHp: 200, color: '#75d1b0' }];
    test.vortices = [];
    killEnemy(0);
    var vortexSpawnOnDeathOk = test.vortices.length === 1 &&
      test.vortices[0].x === 120 &&
      test.vortices[0].y === 120 &&
      test.vortices[0].r === 160 &&
      test.vortices[0].life === 2.5;

    test.hitstop = 0;
    test.enemies = [
      { kind: 'elite', affix: 'command', x: 100, y: 100, r: 19, hp: 200, maxHp: 200, commandTimer: 0.01, color: '#75d1b0' },
      { kind: 'crawler', x: 150, y: 100, r: 14, hp: 50, maxHp: 50, speed: 50, commandBuffTimer: 0 }
    ];
    update(0.02);
    var crawlerBuffOk = test.enemies[1].commandBuffTimer > 2.4;
    test.hitstop = 0;
    var crawlerXBefore = test.enemies[1].x;
    test.bullets = [{
      x: 150,
      y: 100,
      vx: 300,
      vy: 0,
      knockback: 25,
      r: 4,
      damage: 10,
      life: 1,
      bounces: 0,
      pierce: 0,
      hits: [],
      trail: []
    }];
    update(0.016);
    var commandKnockbackImmuneOk = crawlerBuffOk && Math.abs(test.enemies[1].x - crawlerXBefore) < 5;

    var eliteAffixSystemOk = affixSpawnOk && wave3NoAffixOk && mirrorBlockOk && mirrorBrokeHitOk && vortexPullOk && vortexSpawnOnDeathOk && commandKnockbackImmuneOk;

    // Phase 3 Step 2: Titan Boss Component Destruction System Self-Check
    // 1. Component Existence & Initial State Check
    test.wave = 5;
    test.enemies = [];
    spawnTitan();
    var spawnedTitan = test.enemies[0];
    var titanHull = spawnedTitan.maxHp;
    var titanPart = Math.round(titanHull * 0.22);
    var titanComponentsExistOk = Boolean(spawnedTitan &&
      spawnedTitan.leftCannonHp === titanPart &&
      spawnedTitan.leftCannonMaxHp === spawnedTitan.leftCannonHp &&
      spawnedTitan.leftCannonDestroyed === false &&
      spawnedTitan.rightPodHp === titanPart &&
      spawnedTitan.rightPodMaxHp === spawnedTitan.rightPodHp &&
      spawnedTitan.rightPodDestroyed === false);

    // 2. Targeting, Damage Transfer & Left Cannon Destruction
    test.player.x = 100;
    test.player.y = 200;
    spawnedTitan.x = 100;
    spawnedTitan.y = 100;
    spawnedTitan.hp = titanHull;
    spawnedTitan.empTimer = 0;
    spawnedTitan.shootCd = 0.05;
    test.enemyBullets = [];
    test.orbs = [];
    // Bullet closer to left cannon (lcX = 122, rpX = 78)
    test.bullets = [{ x: 120, y: 100, vx: 0, vy: -100, r: 4, damage: 50, life: 1, bounces: 0, pierce: 0, hits: [], trail: [] }];
    update(0.016);
    var damageTransferOk = spawnedTitan.hp === (titanHull - 50) &&
      spawnedTitan.leftCannonHp === (titanPart - 50) &&
      spawnedTitan.rightPodHp === titanPart;

    // Destroy Left Cannon
    test.bullets = [{ x: 120, y: 100, vx: 0, vy: -100, r: 4, damage: (titanPart - 50) + 20, life: 1, bounces: 0, pierce: 0, hits: [], trail: [] }];
    update(0.016);
    var leftCannonDestroyOk = spawnedTitan.leftCannonDestroyed === true &&
      spawnedTitan.leftCannonHp === 0 &&
      spawnedTitan.empTimer >= 1.7 &&
      test.orbs.some(function (o) { return o.kind === 'repair'; });

    // Disable Check: shootCd expires but Left Cannon does not fire
    spawnedTitan.empTimer = 0;
    spawnedTitan.shootCd = 0.001;
    test.enemyBullets = [];
    update(0.016);
    var leftCannonSkillBlockedOk = test.enemyBullets.length === 0;

    // 3. Right Pod Destruction & Rusher Summon Disable Check
    test.bullets = [{ x: 80, y: 100, vx: 0, vy: -100, r: 4, damage: titanPart + 20, life: 1, bounces: 0, pierce: 0, hits: [], trail: [] }];
    update(0.016);
    var rightPodDestroyOk = spawnedTitan.rightPodDestroyed === true &&
      spawnedTitan.rightPodHp === 0 &&
      spawnedTitan.empTimer >= 1.7 &&
      test.orbs.some(function (o) { return o.kind === 'overdrive'; });

    spawnedTitan.phase2Triggered = true;
    spawnedTitan.empTimer = 0;
    spawnedTitan.summonCd = 0.001;
    var enemiesBeforeSummon = test.enemies.length;
    update(0.016);
    var rightPodSummonBlockedOk = test.enemies.length === enemiesBeforeSummon;

    var titanComponentsSystemOk = titanComponentsExistOk && damageTransferOk && leftCannonDestroyOk && leftCannonSkillBlockedOk && rightPodDestroyOk && rightPodSummonBlockedOk;

    // Phase 3 Step 3: EMP Conduction Spire Environmental Mechanics Check
    test.wave = 3;
    test.spires = [];
    spawnSpires();
    var spireSpawnWave3Ok = test.spires.length === 1 &&
      test.spires[0].r === 18 &&
      test.spires[0].resonanceTimer === 0 &&
      Math.hypot(test.spires[0].x - test.player.x, test.spires[0].y - test.player.y) >= 150;

    test.wave = 2;
    test.spires = [];
    spawnSpires();
    var spireNoSpawnWave2Ok = test.spires.length === 0;

    // EMP Resonance Trigger, 260px Enemy Bullets Evaporate & 3.0s Stun Check
    test.wave = 3;
    test.spires = [{ x: 200, y: 150, r: 18, resonanceTimer: 0, pulseTimer: 0 }];
    test.player.energy = 50;
    test.player.x = 100;
    test.player.y = 150;
    test.player.aim = 0;
    rt.input.touchMode = false;
    rt.input.gamepadX = 0;
    rt.input.gamepadY = 0;
    rt.input.mouse.x = 180;
    rt.input.mouse.y = 150;
    test.enemyBullets = [
      { x: 380, y: 150, r: 4, vx: 0, vy: 0 },
      { x: 500, y: 150, r: 4, vx: 0, vy: 0 }
    ];
    test.enemies = [
      { kind: 'crawler', x: 350, y: 150, r: 12, hp: 100, maxHp: 100, empTimer: 0 },
      { kind: 'elite', affix: 'mirror', x: 390, y: 150, r: 19, hp: 150, maxHp: 150, empTimer: 0, shieldBrokenTimer: 0 },
      { kind: 'brute', x: 550, y: 150, r: 20, hp: 200, maxHp: 200, empTimer: 0 }
    ];
    test.stats.damageDealt = 0;
    triggerEmp();
    var spireResonated = test.spires[0].resonanceTimer === 1.5;
    var bulletsEvaporatedOk = test.enemyBullets.length === 1 && test.enemyBullets[0].x === 500;
    var enemiesStunnedOk = test.enemies[0].hp === 60 &&
      test.enemies[0].empTimer === 3.0 &&
      test.enemies[1].hp === 110 &&
      test.enemies[1].empTimer === 3.0 &&
      test.enemies[1].shieldBrokenTimer === 3.0 &&
      test.enemies[2].hp === 200 &&
      test.enemies[2].empTimer === 0;

    // Spire Arc Conduction Check (Arc-Welder / Tesla)
    test.spires[0].resonanceTimer = 0;
    triggerSpireMicroResonance(test.spires[0], 250, 150);
    var spireMicroResonanceOk = test.spires[0].resonanceTimer >= 0.5 &&
      test.lightningArcs.some(function (arc) { return arc.x2 === test.spires[0].x && arc.y2 === test.spires[0].y; });

    var conductionSpireSystemOk = spireSpawnWave3Ok && spireNoSpawnWave2Ok && spireResonated && bulletsEvaporatedOk && enemiesStunnedOk && spireMicroResonanceOk;

    // Phase 3 Step 4: Endgame Telemetry & Combat Rank Evaluation Check
    var rankSplus = calculateCombatRank(15, 0, { shotsFired: 0, shotsHit: 0, extracted: true, heat: 2 });
    var rankS1 = calculateCombatRank(15, 0, { shotsFired: 10, shotsHit: 0, extracted: true, heat: 1 });
    var rankS2 = calculateCombatRank(3, 220000, { shotsFired: 0, shotsHit: 0, extracted: false, heat: 0 });
    var rankA1 = calculateCombatRank(6, 219999, { shotsFired: 100, shotsHit: 44, extracted: false, heat: 0 });
    var rankA2 = calculateCombatRank(2, 90000, { shotsFired: 0, shotsHit: 0, extracted: false, heat: 0 });
    var rankB1 = calculateCombatRank(6, 30000, { shotsFired: 100, shotsHit: 45, extracted: false, heat: 0 });
    var rankB2 = calculateCombatRank(2, 89999, { shotsFired: 10, shotsHit: 10, extracted: false, heat: 0 });
    var rankC1 = calculateCombatRank(10, 0, { shotsFired: 10, shotsHit: 10, extracted: false, heat: 0 });
    var rankC2 = calculateCombatRank(4, 29999, { shotsFired: 0, shotsHit: 0, extracted: false, heat: 5 });

    var rankLogicOk = rankSplus.letter === 'S+' && rankSplus.title === 'DUST SOVEREIGN' && rankSplus.classMod === 'rank-letter--splus' &&
      rankS1.letter === 'S' && rankS1.title === 'APEX SCAVENGER' && rankS1.classMod === 'rank-letter--s' &&
      rankS2.letter === 'S' &&
      rankA1.letter === 'A' && rankA1.title === 'VETERAN BREACHER' && rankA1.classMod === 'rank-letter--a' &&
      rankA2.letter === 'A' &&
      rankB1.letter === 'B' && rankB1.title === 'IRON SCRAPPER' && rankB1.classMod === 'rank-letter--b' &&
      rankB2.letter === 'B' &&
      rankC1.letter === 'C' && rankC1.title === 'RECRUIT RECLUSE' && rankC1.classMod === 'rank-letter--c' &&
      rankC2.letter === 'C';

    // Telemetry & Rank DOM Sync Check
    var mockUi = {
      gameOver: { hidden: false },
      telAccuracy: { textContent: '' },
      telMaxCombo: { textContent: '' },
      telGrazes: { textContent: '' },
      telDamage: { textContent: '' },
      combatRankStamp: { hidden: false },
      combatRankLetter: {
        textContent: '',
        classList: {
          classes: [],
          remove: function () {
            var args = Array.prototype.slice.call(arguments);
            this.classes = this.classes.filter(function (c) { return args.indexOf(c) === -1; });
          },
          add: function (c) { this.classes.push(c); },
          contains: function (c) { return this.classes.indexOf(c) !== -1; }
        }
      },
      combatRankTitle: { textContent: '' }
    };

    test.over = true;
    test.wave = 7;
    test.score = 40000;
    test.stats.shotsFired = 50;
    test.stats.shotsHit = 25;
    test.stats.maxCombo = 14;
    test.stats.grazes = 9;
    test.stats.damageDealt = 12345.6;
    test.evalRank = null;

    var savedUiForTelemetry = rt.ui;
    rt.ui = mockUi;
    try {
      updateDomUi();
    } finally {
      rt.ui = savedUiForTelemetry;
    }

    var domSyncOk = mockUi.telAccuracy.textContent === '50%' &&
      mockUi.telMaxCombo.textContent === 'x14' &&
      mockUi.telGrazes.textContent === '9' &&
      mockUi.telDamage.textContent === '12346' &&
      mockUi.combatRankLetter.textContent === 'B' &&
      mockUi.combatRankLetter.classList.contains('rank-letter--b') &&
      mockUi.combatRankTitle.textContent === 'IRON SCRAPPER' &&
      test.evalRank && test.evalRank.letter === 'B';

    var combatRankTelemetryOk = rankLogicOk && domSyncOk;
    runBuildChecks();
    runEnemyChecks();
    runDirectorChecks();
    runMetaChecks();
    runScoringChecks();
  } finally {
    clearSeed();
    rt.state = previous;
    rt.ui = previousUi;
    rt.input.mouse.down = previousMouseDown;
    rt.input.keys = previousKeys;
  }
  if (firstScore !== 20 || chainScore !== 45 || lightDrop || !bruteDrop || !eliteDrop || healed !== 68 || capped !== 100 || cappedScore !== 0 || overflowScore !== REPAIR_OVERFLOW_SCORE || overflowStatus.indexOf('REPAIR SCRAP FULL +12 SCORE') !== 0 || repairStatus.indexOf('REPAIR SCRAP +18 HULL') !== 0 || bountyScore !== 57 || secondBountyScore !== 82 || !bountyClaimed || bountySurge !== BOUNTY_SURGE_DURATION || retainedSurge !== 5 || !stormClock || !waveReset || artilleryScore !== 60 || !grazeOk || !justDashOk || !barrelKickOk || !barrelShootOk || !stormWindOk || !coreTitanOk || !barrelTitanOk || !weaponCycleOk || !breacherShootOk || !vanguardSlowOk || !vanguardShootOk || !arcChainOk || !fusionMatrixOk || !fusionExecOk || !buildInspectorUiOk || !eliteAffixSystemOk || !titanComponentsSystemOk || !conductionSpireSystemOk || !combatRankTelemetryOk) throw new Error('LunaGame self-check failed');
  return { ok: true, upgrades: UPGRADES.length, fusions: FUSION_CHIPS.length, controls: 'WASD/arrows + mouse hold', combo: '4s chain window', overdrive: '6s elite core', repair: '18 hp brute/elite scrap', bounty: 'one-shot wave reward', surge: '3s bounty overdrive', overflow: '12 score full repair', storm: '5s front pressure', archetypes: WEAPON_MODES.slice(), fusionExecution: '10 fusions, prerequisites verified', affixes: '4 dynamic affixes verified', titanComponents: 'left/right destruction verified', conductionSpire: 'resonance & 260px mega emp verified', rankEvaluation: 'S+/S/A/B/C score stamp verified' };
}
