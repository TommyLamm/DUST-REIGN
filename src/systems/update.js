import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { stepContracts } from './contracts.js';
import { stepGhost } from './ghost.js';
import { stepMutators } from './mutators.js';
import { stepBullets } from './sim/bullets.js';
import { stepEffects } from './sim/effects.js';
import { stepEnemies } from './sim/enemies.js';
import { stepArtilleryTargets, stepEnemyBullets } from './sim/enemy-bullets.js';
import { stepHazards } from './sim/hazards.js';
import { stepOrbs } from './sim/orbs.js';
import { stepPlayer } from './sim/player.js';
import { stepEnemySpawner, stepWaveClock } from './sim/timers-wave.js';
import { stepTactical } from './tactical.js';
import { stepPois } from './sim/poi.js';
import { stepMode } from './modes/mode-adapter.js';
import { updateDomUi } from '../ui/hud.js';
import { updateCamera } from '../core/camera.js';

var cachedFrame = { p: null, boundW: 960, boundH: 640 };

// Micro hitstops (crits, combo kills, stagger/shield breaks, chip damage) would freeze the sim
// several times a second under rapid fire. They are dropped while the trigger is held and
// rate-limited otherwise; major freezes (>= HITSTOP_MAJOR) always land.
var HITSTOP_MAJOR = 0.07;
var HITSTOP_REFRACTORY = 0.5;
var SUSTAINED_FIRE = 0.3;
var hitstopCooldown = 0;
var hitstopActive = false;

function gateHitstop(dt) {
  if (hitstopCooldown > 0) hitstopCooldown = Math.max(0, hitstopCooldown - dt);
  if (!(rt.state.hitstop > 0)) {
    hitstopActive = false;
    return;
  }
  if (hitstopActive) return;
  var p = rt.state.player;
  var sustained = !!p && (p.continuousFireTime || 0) >= SUSTAINED_FIRE;
  if (rt.state.hitstop < HITSTOP_MAJOR && (sustained || hitstopCooldown > 0)) {
    rt.state.hitstop = 0;
    return;
  }
  hitstopActive = true;
  hitstopCooldown = HITSTOP_REFRACTORY;
}

export function update(dt) {
  if (!rt.state) return;
  // Death/results must advance even if a mid-frame level-up left paused=true.
  if (rt.state.over) {
    if (rt.state.paused) rt.state.paused = false;
    if (rt.state.deathSequenceTimer > 0) {
      rt.state.deathSequenceTimer = Math.max(0, rt.state.deathSequenceTimer - dt);
    }
    // Always reveal results once the timer is done (or never armed) — avoids a stuck death frame.
    if (!(rt.state.deathSequenceTimer > 0)) {
      if (rt.ui && rt.ui.gameOver) rt.ui.gameOver.hidden = false;
      if (rt.ui && rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = !rt.state.isNewRecord;
      if (rt.ui && rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = false;
      updateDomUi();
    }
    return;
  }
  if (rt.state.paused) return;
  if (rt.state.interlude) { updateDomUi(); return; }
  if (isReducedMotion()) {
    rt.state.hitstop = 0;
    rt.state.hitstopDilation = 0;
  }
  gateHitstop(dt);
  if (rt.state.hitstop > 0) {
    var freeze = Math.min(dt, rt.state.hitstop);
    rt.state.hitstop -= freeze;
    dt -= freeze;
    if (rt.state.hitstop <= 0) hitstopActive = false;
  }
  if (dt <= 0) { updateDomUi(); return; }

  if (rt.state.hitstopDilation > 0) {
    var dilationLeft = rt.state.hitstopDilation;
    rt.state.hitstopDilation = Math.max(0, rt.state.hitstopDilation - dt);
    var progress = 1.0 - (dilationLeft / 0.120);
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;
    var timeScale = 0.35 + 0.65 * (progress * progress);
    dt *= timeScale;
  }

  cachedFrame.p = rt.state.player;
  cachedFrame.boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
  cachedFrame.boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
  var frame = cachedFrame;

  stepWaveClock(dt, frame);
  stepMode(dt, frame);
  stepMutators(frame);
  stepHazards(dt, frame);
  stepPois(dt, frame);
  stepPlayer(dt, frame);
  stepEnemySpawner(dt, frame);
  stepBullets(dt, frame);
  stepOrbs(dt, frame);
  stepEnemies(dt, frame);
  stepEnemyBullets(dt, frame);
  stepArtilleryTargets(dt, frame);
  stepTactical(dt, frame);
  stepEffects(dt, frame);
  stepContracts(frame);
  stepGhost(dt);
  if (rt.camera) updateCamera(rt.camera, rt.state.player, rt.input, dt, isReducedMotion());
  updateDomUi();
}
