import { AudioFX } from '../../audio/audio-fx.js';
import { STORM_FRONT_SECONDS, STORM_SPAWN_FACTOR, WAVE_LENGTH } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { clamp } from '../../core/utils.js';
import { dashRechargeCooldown } from '../abilities.js';
import { onWaveEnd, onWaveStart } from '../director.js';
import { addScore } from '../scoring.js';
import * as spawning from '../spawning.js';
import { logEvent, setStatusText } from '../../ui/hud.js';

function stormSeconds() {
  var n = rt.state && rt.state.stormSeconds;
  if (typeof n === 'number' && n > 0) return n;
  return STORM_FRONT_SECONDS;
}

function frontActive() {
  return !!rt.state && rt.state.waveTime >= WAVE_LENGTH - stormSeconds();
}

function fieldSize() {
  return {
    w: (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960,
    h: (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640
  };
}

function placeAway(px, py, margin, minDist) {
  var box = fieldSize();
  var x = margin + rng('spawn') * Math.max(20, box.w - margin * 2);
  var y = margin + rng('spawn') * Math.max(20, box.h - margin * 2);
  var tries;
  for (tries = 0; tries < 12; tries += 1) {
    if (Math.hypot(x - px, y - py) >= minDist) break;
    x = margin + rng('spawn') * Math.max(20, box.w - margin * 2);
    y = margin + rng('spawn') * Math.max(20, box.h - margin * 2);
  }
  if (Math.hypot(x - px, y - py) < minDist) {
    var ang = Math.atan2(y - py, x - px);
    x = clamp(px + Math.cos(ang) * minDist, margin, box.w - margin);
    y = clamp(py + Math.sin(ang) * minDist, margin, box.h - margin);
  }
  return { x: x, y: y };
}

function spawnOneBarrel() {
  if (!rt.state) return;
  if (!rt.state.barrels) rt.state.barrels = [];
  var p = rt.state.player || { x: 0, y: 0 };
  var spot = placeAway(p.x, p.y, 70, 120);
  rt.state.barrels.push({
    x: spot.x,
    y: spot.y,
    vx: 0,
    vy: 0,
    r: 14,
    hp: 20,
    maxHp: 20,
    state: 'idle',
    flyingTimer: 0,
    rot: 0
  });
}

function spawnOneSpire() {
  if (!rt.state) return;
  if (!rt.state.spires) rt.state.spires = [];
  var p = rt.state.player || { x: 0, y: 0 };
  var spot = placeAway(p.x, p.y, 90, 160);
  rt.state.spires.push({ x: spot.x, y: spot.y, r: 18, resonanceTimer: 0, pulseTimer: 0 });
}

function summonBoss(kind) {
  spawning.spawnBoss(kind);
}

export function commitWaveAdvance(early) {
  if (!rt.state) return;
  var p = rt.state.player;
  rt.state._barrelChainMute = 1;
  rt.state.stormKills = 0;
  rt.state.stormHurt = false;
  rt.state.stormCoresSpawned = false;
  rt.state.stormCoresHarvested = 0;
  rt.state.volatileCores = [];
  rt.state.barrels = [];
  rt.state.convoy = null;
  rt.state.meteors = [];
  rt.state.devils = [];
  spawning.spawnBarrels();
  var extraBarrels = rt.state.route && rt.state.route.extraBarrels;
  if (extraBarrels) {
    var bi;
    for (bi = 0; bi < extraBarrels; bi += 1) spawnOneBarrel();
  }
  rt.state.coreSpawnTime = 8 + rng('spawn') * 8;
  rt.state.coreSpawned = false;
  rt.state.bossSpawned = false;
  rt.state.recycledTokens = 0;
  rt.state.recycleRefundTimer = 0;
  rt.state.recycleSpentThisWave = 0;
  rt.state._recycleArmed = false;
  if (early) rt.state.waveTime = 0;
  else rt.state.waveTime -= WAVE_LENGTH;
  rt.state.wave += 1;
  onWaveStart(rt.state);
  rt.state.spires = [];
  spawning.spawnSpires();
  var spireWant = rt.state.wave >= 3 ? 1 : 0;
  if (rt.state.wave === 15) spireWant = 2;
  else if (rt.state.route && rt.state.route.extraSpires) spireWant += rt.state.route.extraSpires;
  while (rt.state.spires.length < spireWant) spawnOneSpire();
  rt.state.stormAlerted = false;
  rt.state.bountyTarget = 5 + rt.state.wave * 2;
  rt.state.bountyKills = 0;
  rt.state.bountyReward = 120 + rt.state.wave * 40;
  rt.state.bountyClaimed = false;
  rt.state.waveDamageTaken = 0;
  logEvent('WAVE ' + String(rt.state.wave).padStart(2, '0') + ' // BOUNTY RESET');
  rt.state.banner = Math.max(rt.state.banner, 2.3);
  if (rt.state.routeAnnounce && rt.state.mutator && rt.state.mutator.name) {
    rt.state.banner = 2.5;
    rt.state.bannerText = rt.state.routeAnnounce + ' // ' + rt.state.mutator.name;
    logEvent(rt.state.bannerText);
    rt.state.routeAnnounce = null;
  } else if (rt.state.mutator && rt.state.mutator.name) {
    rt.state.banner = 2.5;
    rt.state.bannerText = rt.state.mutator.name + ' // ' + (rt.state.mutator.blurb || '');
    logEvent(rt.state.bannerText);
  } else if (rt.state.routeAnnounce) {
    rt.state.banner = 2.5;
    rt.state.bannerText = rt.state.routeAnnounce;
    logEvent(rt.state.routeAnnounce);
    rt.state.routeAnnounce = null;
  }
  if (p) spawnParticles(p.x, p.y, '#e0a84e', 24, 230, 3);
  var burst = Math.min(3, 1 + Math.floor(rt.state.wave / 4));
  var wi;
  for (wi = 0; wi < burst; wi += 1) spawning.spawnEnemy();
}

// Wolf Pack surge windows: mid-wave pulse at 10–13.5s.
// Late pulse (if any) must end ≥4s before the storm front.
// Wave 1–2 at Heat ≤1: single surge only (no double opener).
// Heat ≥4: cancel the late surge (storm starts earlier).
export function wolfPackWindowsFor(wave, heat, stormSec) {
  var SURGE_DUR = 3.5;
  var STORM_GAP = 4;
  var earlyStart = 10;
  var earlyEnd = earlyStart + SURGE_DUR;
  var h = heat | 0;
  var w = wave | 0;
  var storm = (typeof stormSec === 'number' && stormSec > 0) ? stormSec : STORM_FRONT_SECONDS;
  var stormStart = WAVE_LENGTH - storm;
  var windows = [{ start: earlyStart, end: earlyEnd }];

  if (h >= 4 || (w <= 2 && h <= 1)) return windows;

  var lateEnd = stormStart - STORM_GAP;
  var lateStart = lateEnd - SURGE_DUR;
  if (lateStart >= earlyEnd + 1) {
    windows.push({ start: lateStart, end: lateEnd });
  }
  return windows;
}

function wolfPackActiveAt(wTime) {
  var heat = (rt.state && rt.state.heat) | 0;
  var wave = (rt.state && rt.state.wave) | 0;
  var windows = wolfPackWindowsFor(wave, heat, stormSeconds());
  var i;
  for (i = 0; i < windows.length; i += 1) {
    if (wTime >= windows[i].start && wTime < windows[i].end) return true;
  }
  return false;
}

export function stepWaveClock(dt, frame) {
  var p = frame.p;
  rt.state.simDt = dt;
  var maxCharges = (typeof p.dashChargesMax === 'number' && p.dashChargesMax > 0) ? p.dashChargesMax : 1;
  if (typeof p.dashCharges !== 'number') p.dashCharges = maxCharges;
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  if (p.dashCharges < maxCharges && p.dashCooldown <= 0) {
    p.dashCharges += 1;
    if (p.dashCharges < maxCharges) p.dashCooldown = dashRechargeCooldown(p);
  }
  var regen = (typeof p.batteryRegen === 'number') ? p.batteryRegen : 2;
  if (rt.state.route && rt.state.route.batteryRegenMultiplier) regen *= rt.state.route.batteryRegenMultiplier;
  if (rt.state.mutator && rt.state.mutator.id === 'overcharged') regen *= 2;
  var batteryCap = (typeof p.batteryMax === 'number') ? p.batteryMax : (p.maxEnergy || 100);
  p.energy = Math.min(batteryCap, (p.energy || 0) + regen * dt);

  rt.state.waveTime += dt;
  rt.state.banner = Math.max(0, rt.state.banner - dt);
  rt.state.shake = Math.max(0, rt.state.shake - dt * 18);
  rt.state.hurtFlash = Math.max(0, rt.state.hurtFlash - dt * 3);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.recoil = Math.max(0, (p.recoil || 0) - dt * 16);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.dashPulse = Math.max(0, p.dashPulse - dt);
  p.dashAmbushTimer = Math.max(0, (p.dashAmbushTimer || 0) - dt);
  p.overdrive = Math.max(0, p.overdrive - dt);
  if (p.reactiveMicroEmp && (p.reactiveMicroEmp.timer || 0) > 0) {
    p.reactiveMicroEmp.timer = Math.max(0, p.reactiveMicroEmp.timer - dt);
  }
  if (p.surgeUnit && p.surgeUnit.active) {
    p.surgeUnit.timer = Math.max(0, p.surgeUnit.timer - dt);
    if (p.surgeUnit.timer <= 0) p.surgeUnit.active = false;
  }
  if ((p.speedBoostTimer || 0) > 0) {
    p.speedBoostTimer = Math.max(0, p.speedBoostTimer - dt);
    if (p.speedBoostTimer <= 0) p.speedBoostMult = 1;
  }
  if (p.slowTimer > 0) p.slowTimer -= dt;
  rt.state.comboTimer = Math.max(0, rt.state.comboTimer - dt);
  if (rt.state.comboTimer === 0) rt.state.combo = 0;
  rt.state.grazeTimer = Math.max(0, (rt.state.grazeTimer || 0) - dt);
  if (rt.state.grazeTimer === 0) rt.state.grazeCombo = 0;

  var hpRatio = p.hp / p.maxHp;
  if (hpRatio < 0.25 && !rt.state.over) {
    AudioFX.setLowpass(480);
    rt.state.heartbeatTimer = (rt.state.heartbeatTimer || 0) - dt;
    if (rt.state.heartbeatTimer <= 0) {
      AudioFX.playHeartbeat();
      rt.state.heartbeatTimer = 0.85;
    }
  } else if (hpRatio < 0.35 && !rt.state.over) {
    AudioFX.setLowpass(1400);
    rt.state.heartbeatTimer = (rt.state.heartbeatTimer || 0) - dt;
    if (rt.state.heartbeatTimer <= 0) {
      AudioFX.playHeartbeat();
      rt.state.heartbeatTimer = 0.95;
    }
  } else {
    AudioFX.setLowpass(0);
    rt.state.heartbeatTimer = 0;
  }

  // 4-Phase Wave Flow Pacing Cycle
  var wTime = rt.state.waveTime;
  if (wTime < 6) {
    rt.state.pacingPhase = 1; // Infiltration
  } else if (wTime < 20) {
    rt.state.pacingPhase = 2; // Tactical Pincer
  } else if (wTime < 25) {
    rt.state.pacingPhase = 3; // Elite Peak
  } else {
    rt.state.pacingPhase = 4; // Storm Harvest
  }

  if (wolfPackActiveAt(wTime)) {
    if (!rt.state.wolfPackSurge) {
      rt.state.wolfPackSurge = true;
      AudioFX.stormSiren();
      rt.state.banner = 2.5;
      rt.state.bannerText = 'WOLF PACK SURGE // CENTRIPETAL COMPRESSION';
      logEvent('WOLF PACK SURGE // CENTRIPETAL COMPRESSION');
    }
  } else {
    rt.state.wolfPackSurge = false;
  }

  if (frontActive() && !rt.state.stormAlerted && !rt.state.over) {
    rt.state.stormAlerted = true;
    AudioFX.stormSiren();
  }
  if (frontActive() && !rt.state.stormCoresSpawned && !rt.state.over) {
    rt.state.stormCoresSpawned = true;
    if (!rt.state.orbs) rt.state.orbs = [];
    var stormP = rt.state.player || { x: 0, y: 0 };
    var sLife = stormSeconds();
    for (var sci = 0; sci < 3; sci += 1) {
      var scSpot = placeAway(stormP.x, stormP.y, 80, 140);
      rt.state.orbs.push({
        kind: 'storm_core',
        x: scSpot.x,
        y: scSpot.y,
        vx: (rng('spawn') - 0.5) * 40,
        vy: (rng('spawn') - 0.5) * 40,
        r: 12,
        life: sLife,
        maxLife: sLife,
        color: '#00f3ff'
      });
      pushFxEvent('burst', scSpot.x, scSpot.y, { preset: 'emp', tint: '#00f3ff', scale: 0.6 });
    }
    logEvent('STORM CORES DETECTED // HARVEST FOR OVERDRIVE');
  }


  var recipe = rt.state.recipe;
  var bossKind = recipe ? recipe.boss : null;
  if (!recipe && (rt.state.wave === 5 || rt.state.wave === 10)) bossKind = 'titan';
  if (bossKind && rt.state.waveTime >= 8 && !rt.state.bossSpawned) {
    rt.state.bossSpawned = true;
    summonBoss(bossKind);
  }

  if (rt.state.forceWaveAdvance) {
    rt.state.forceWaveAdvance = false;
    commitWaveAdvance(true);
    return;
  }

  if (rt.state.waveTime >= WAVE_LENGTH) {
    var bossAlive = rt.state.enemies.some(function (e) { return e.isBoss; });
    if (bossAlive) {
      rt.state.waveTime = WAVE_LENGTH - 0.1;
    } else {
      if (!rt.state.stormHurt && (rt.state.stormKills || 0) >= 3) {
        var stormPay = 350;
        if (rt.state.route && rt.state.route.stormScoreMultiplier) stormPay = Math.round(350 * rt.state.route.stormScoreMultiplier);
        addScore(stormPay, 'storm');
        rt.state.player.overdrive = Math.max(rt.state.player.overdrive, 3.5);
        rt.state.banner = 2.8;
        rt.state.bannerText = 'STORM BREAKER // SURGE UNLOCKED';
        setStatusText('STORM BREAKER // SURGE UNLOCKED');
        logEvent('STORM BREAKER // SURGE UNLOCKED');
        AudioFX.pickup('overdrive');
        spawnParticles(p.x, p.y, '#75d1b0', 25, 240, 4);
        pushFxEvent('surge', p.x, p.y, { kind: 'storm' });
      } else {
        rt.state.bannerText = '';
      }
      onWaveEnd(rt.state);
      commitWaveAdvance(false);
    }
  }
}

export function stepEnemySpawner(dt, frame) {
  rt.state.spawnTimer -= dt;
  var recipe = rt.state.recipe;
  var enemyCap = recipe && typeof recipe.cap === 'number' ? recipe.cap : Math.min(95, 5 + rt.state.wave * 4);

  // Large-world recycle refund: culls must not instantly restack front pressure.
  // Delay first refund ~2s, drip ~0.85s between spends, and cap spends per wave.
  var worldW = (rt.state && rt.state.width) || 960;
  var largeWorld = worldW >= 2400;
  var recycleDelay = largeWorld ? 2.0 : 0;
  var recycleDrip = largeWorld ? 0.85 : 0;
  var recycleWaveCap = largeWorld ? Math.max(4, Math.floor(enemyCap * 0.35)) : 999;
  var tokens = rt.state.recycledTokens || 0;
  if (tokens > 0) {
    if (!(rt.state.recycleRefundTimer > 0) && rt.state._recycleArmed !== true) {
      rt.state.recycleRefundTimer = recycleDelay;
      rt.state._recycleArmed = true;
    } else {
      rt.state.recycleRefundTimer = (rt.state.recycleRefundTimer || 0) - dt;
    }
  } else {
    rt.state.recycleRefundTimer = 0;
    rt.state._recycleArmed = false;
  }
  var spent = rt.state.recycleSpentThisWave || 0;
  while (
    (rt.state.recycledTokens || 0) > 0 &&
    rt.state.enemies.length < enemyCap &&
    spent < recycleWaveCap &&
    (rt.state.recycleRefundTimer || 0) <= 0
  ) {
    rt.state.recycledTokens -= 1;
    spawning.spawnEnemy();
    spent += 1;
    rt.state.recycleSpentThisWave = spent;
    if (recycleDrip > 0 && (rt.state.recycledTokens || 0) > 0) {
      rt.state.recycleRefundTimer = recycleDrip;
      break;
    }
  }
  if (spent >= recycleWaveCap && (rt.state.recycledTokens || 0) > 0) {
    rt.state.recycledTokens = 0;
  }

  if (rt.state.spawnTimer <= 0 && rt.state.enemies.length < enemyCap) {
    rt.state.lastSpawnSlots = 1;
    spawning.spawnEnemy();
    var baseInterval = recipe && typeof recipe.spawnInterval === 'number' ? recipe.spawnInterval : Math.max(0.24, 1.08 - rt.state.wave * 0.045);
    var slots = Math.max(1, rt.state.lastSpawnSlots || 1);
    rt.state.spawnTimer = baseInterval * slots * (0.78 + rng('spawn') * 0.38) * (frontActive() ? STORM_SPAWN_FACTOR : 1);
  }
}
