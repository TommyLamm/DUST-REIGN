import { AudioFX } from '../../audio/audio-fx.js';
import { STORM_SPAWN_FACTOR, WAVE_LENGTH } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rt } from '../../core/runtime.js';
import { isStormFront } from '../flow.js';
import { spawnBarrels, spawnEnemy, spawnSpires, spawnTitan } from '../spawning.js';
import { logEvent } from '../../ui/hud.js';

export function stepWaveClock(dt, frame) {
  var p = frame.p;
  p.energy = Math.min(p.maxEnergy, (p.energy || 0) + 2.0 * dt);

  rt.state.waveTime += dt;
  rt.state.banner = Math.max(0, rt.state.banner - dt);
  rt.state.shake = Math.max(0, rt.state.shake - dt * 18);
  rt.state.hurtFlash = Math.max(0, rt.state.hurtFlash - dt * 3);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.recoil = Math.max(0, (p.recoil || 0) - dt * 16);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.dashPulse = Math.max(0, p.dashPulse - dt);
  p.dashAmbushTimer = Math.max(0, (p.dashAmbushTimer || 0) - dt);
  p.overdrive = Math.max(0, p.overdrive - dt);
  if (p.slowTimer > 0) p.slowTimer -= dt;
  rt.state.comboTimer = Math.max(0, rt.state.comboTimer - dt);
  if (rt.state.comboTimer === 0) rt.state.combo = 0;
  rt.state.grazeTimer = Math.max(0, (rt.state.grazeTimer || 0) - dt);
  if (rt.state.grazeTimer === 0) rt.state.grazeCombo = 0;

  if (p.hp / p.maxHp < 0.35 && !rt.state.over) {
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

  if (isStormFront() && !rt.state.stormAlerted && !rt.state.over) {
    rt.state.stormAlerted = true;
    AudioFX.stormSiren();
  }

  // Boss spawn check for Wave 5 and 10
  if ((rt.state.wave === 5 || rt.state.wave === 10) && rt.state.waveTime >= 8 && !rt.state.bossSpawned) {
    rt.state.bossSpawned = true;
    spawnTitan();
  }

  if (rt.state.waveTime >= WAVE_LENGTH) {
    var titanAlive = rt.state.enemies.some(function (e) { return e.kind === 'titan'; });
    if (titanAlive) {
      rt.state.waveTime = WAVE_LENGTH - 0.1;
    } else {
      if (!rt.state.stormHurt && (rt.state.stormKills || 0) >= 3) {
        rt.state.score += 350;
        rt.state.player.overdrive = Math.max(rt.state.player.overdrive, 3.5);
        rt.state.banner = 2.8;
        rt.state.bannerText = 'STORM BREAKER // SURGE UNLOCKED';
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'STORM BREAKER // SURGE UNLOCKED';
        logEvent('STORM BREAKER // SURGE UNLOCKED');
        AudioFX.pickup('overdrive');
        spawnParticles(p.x, p.y, '#75d1b0', 25, 240, 4);
        pushFxEvent('surge', p.x, p.y, { kind: 'storm' });
      } else {
        rt.state.bannerText = '';
      }
      rt.state.stormKills = 0;
      rt.state.stormHurt = false;
      rt.state.volatileCores = [];
      rt.state.barrels = [];
      spawnBarrels();
      rt.state.coreSpawnTime = 8 + Math.random() * 8;
      rt.state.coreSpawned = false;
      rt.state.bossSpawned = false;

      rt.state.waveTime -= WAVE_LENGTH;
      rt.state.wave += 1;
      rt.state.spires = [];
      spawnSpires();
      rt.state.stormAlerted = false;
      rt.state.bountyTarget = 5 + rt.state.wave * 2;
      rt.state.bountyKills = 0;
      rt.state.bountyReward = 120 + rt.state.wave * 40;
      rt.state.bountyClaimed = false;
      logEvent('WAVE ' + String(rt.state.wave).padStart(2, '0') + ' // BOUNTY RESET');
      rt.state.banner = Math.max(rt.state.banner, 2.3);
      spawnParticles(p.x, p.y, '#e0a84e', 24, 230, 3);
      for (var wi = 0; wi < Math.min(3, 1 + Math.floor(rt.state.wave / 4)); wi += 1) spawnEnemy();
    }
  }
}

export function stepEnemySpawner(dt, frame) {
  rt.state.spawnTimer -= dt;
  var enemyCap = Math.min(95, 5 + rt.state.wave * 4);
  if (rt.state.spawnTimer <= 0 && rt.state.enemies.length < enemyCap) {
    spawnEnemy();
    rt.state.spawnTimer = Math.max(0.24, 1.08 - rt.state.wave * 0.045) * (0.78 + Math.random() * 0.38) * (isStormFront() ? STORM_SPAWN_FACTOR : 1);
  }
}
