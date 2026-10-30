import { readBestScoreV2 } from './meta-store.js';
import { createCasingPool, createDecalPool } from './pools.js';
import { rng } from './rng.js';
import { WORLD_WIDTH, WORLD_HEIGHT, SPAWN_CENTER_X, SPAWN_CENTER_Y } from './constants.js';
import { createDefaultPois } from '../systems/sim/poi.js';

export function makeState(width, height) {
  var isCustomSize = typeof width === 'number' && typeof height === 'number';
  var w = isCustomSize ? width : WORLD_WIDTH;
  var h = isCustomSize ? height : WORLD_HEIGHT;

  var player = {
    x: isCustomSize ? (w / 2) : SPAWN_CENTER_X,
    y: isCustomSize ? (h / 2) : SPAWN_CENTER_Y,
    vx: 0,
    vy: 0,
    r: 15,
    speed: 235,
    hp: 100,
    maxHp: 100,
    energy: 50,
    maxEnergy: 100,
    resonances: { kinetic: 0, plasma: 0, static: 0, tactical: 0 },
    damage: 26,
    fireRate: 0.18,
    cooldown: 0,
    bulletSpeed: 700,
    bulletSize: 4,
    xpMult: 1,
    aim: 0,
    invulnerable: 0,
    dashCooldown: 0,
    dashPulse: 0,
    overdrive: 0,
    lootMagnet: 0,
    recoil: 0,
    recoilVx: 0,
    recoilVy: 0,
    recoilLambda: 14.0,
    skidTimer: 0,
    isSkidding: false,
    pierce: 0,
    bounces: 0,
    shockwaveDash: false,
    teslaCoil: false,
    reactiveArmor: false,
    highCaliber: false,
    staticTempest: false,
    kineticShrapnel: false,
    overchargeRetaliation: false,
    vulcanMeltdown: false,
    gravitonBulwark: false,
    plasmaMeltdown: false,
    magnetRadius: 165,
    slowTimer: 0,
    dashAmbushTimer: 0,
    overdriveDurationBonus: 0,
    weaponMode: 'standard',
    chargeTime: 0,
    isCharging: false,
    mastery: 0,
    dashCharges: 1,
    dashChargesMax: 1,
    dashHeat: 0,
    dashHeatTimer: 0,
    damageTakenMult: 1,
    moveSpeedMult: 1,
    empCost: 50,
    empRadiusBonus: 0,
    repairBonus: 0,
    batteryMax: 100,
    batteryRegen: 2,
    phoenix: false,
    shield: 0,
    tacticalSlot: null
  };

  var _invuln = 0;
  Object.defineProperty(player, 'invulnerable', {
    get: function () { return _invuln; },
    set: function (val) {
      if (player._capNextInvuln !== undefined && val > player._capNextInvuln) {
        _invuln = player._capNextInvuln;
      } else {
        _invuln = val;
      }
      player._capNextInvuln = undefined;
    },
    configurable: true,
    enumerable: true
  });

  var state = {
    width: w,
    height: h,
    paused: false,
    over: false,
    level: 1,
    xp: 0,
    xpNext: 55,
    score: 0,
    combo: 0,
    comboTimer: 0,
    grazeCombo: 0,
    grazeTimer: 0,
    bestScore: readBestScoreV2(),
    kills: 0,
    wave: 1,
    waveTime: 0,
    bountyTarget: 7,
    bountyKills: 0,
    bountyReward: 160,
    bountyClaimed: false,
    spawnTimer: 0.5,
    banner: 1.8,
    bannerText: '',
    shake: 0,
    hurtFlash: 0,
    deathCause: null,
    hitstop: 0,
    hitstopDilation: 0,
    heartbeatTimer: 0,
    stormAlerted: false,
    stormKills: 0,
    stormHurt: false,
    stormCoresSpawned: false,
    stormCoresHarvested: 0,
    magnetGroundSpawned: false,
    magnetGroundDueAt: 8 + rng('spawn') * 14,
    bossSpawned: false,
    deathSequenceTimer: 0,
    statusHold: 0,
    statusHoldKind: '',
    statusHoldBountyReward: 0,
    isNewRecord: false,
    coreSpawnTime: 8 + rng('spawn') * 8,
    coreSpawned: false,
    act: 1,
    sector: 'dusk',
    recipe: null,
    mutator: null,
    route: null,
    routeHistory: [],
    contract: null,
    boss: null,
    bossesDefeated: [],
    extracted: false,
    overtime: false,
    overheat: 0,
    interlude: null,
    rerolls: 1,
    banishes: 1,
    banished: [],
    heat: 0,
    rigId: 'scrapper',
    weaponId: 'standard',
    daily: null,
    mode: 'standard',
    stageConfig: null,
    stageElapsed: 0,
    stageCleared: false,
    stageStars: { star1: false, star2: false, star3: false },
    beaconHp: 1000,
    beaconMaxHp: 1000,
    vipList: [],
    scrapCollectedInStage: 0,
    damageTakenInStage: 0,
    scoreBreakdown: { kill: 0, bounty: 0, storm: 0, graze: 0, repair: 0, wave: 0, flawless: 0, boss: 0, style: 0, contract: 0, overtime: 0, extract: 0 },
    waveDamageTaken: 0,
    flawlessStreak: 0,
    stats: {
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      crits: 0,
      coresDetonated: 0,
      grazes: 0,
      maxCombo: 0,
      contractsCompleted: 0,
      justDashes: 0,
      partsDestroyed: 0,
      flawlessWaves: 0,
      barrelChainMax: 0,
      fusionsUnlocked: 0
    },
    casings: createCasingPool(),
    casingIndex: 0,
    decals: createDecalPool(),
    decalIndex: 0,
    player: player,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    orbs: [],
    particles: [],
    shockRings: [],
    lightningArcs: [],
    volatileCores: [],
    barrels: [],
    artilleryTargets: [],
    opticalFlashes: [],
    plasmaZones: [],
    vortices: [],
    spires: [],
    pois: (isCustomSize && w < 1000) ? [] : createDefaultPois(),
    tacticalEntities: [],
    upgradeChoices: [],
    acquiredUpgrades: []
  };

  var _xp = 0;
  Object.defineProperty(state, 'xp', {
    get: function () { return _xp; },
    set: function (val) {
      if (typeof val === 'number') {
        if (val > _xp) {
          state.scrapCollectedInStage = (state.scrapCollectedInStage || 0) + 1;
        }
        _xp = val;
      }
    },
    configurable: true,
    enumerable: true
  });

  return state;
}
