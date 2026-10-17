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
import { stepCampaignMode } from './modes/campaign.js';
import { stepHardcoreMode } from './modes/hardcore.js';
import { updateDomUi } from '../ui/hud.js';

var cachedFrame = { p: null, boundW: 960, boundH: 640 };

export function update(dt) {
  if (!rt.state || rt.state.paused) return;
  if (rt.state.over) {
    if (rt.state.deathSequenceTimer > 0) {
      rt.state.deathSequenceTimer = Math.max(0, rt.state.deathSequenceTimer - dt);
      if (rt.state.deathSequenceTimer === 0) {
        if (rt.ui && rt.ui.gameOver) rt.ui.gameOver.hidden = false;
        if (rt.ui && rt.ui.newRecordStamp) rt.ui.newRecordStamp.hidden = !rt.state.isNewRecord;
        if (rt.ui && rt.ui.combatRankStamp) rt.ui.combatRankStamp.hidden = false;
        updateDomUi();
      }
    }
    return;
  }
  if (rt.state.interlude) { updateDomUi(); return; }
  if (isReducedMotion()) {
    rt.state.hitstop = 0;
    rt.state.hitstopDilation = 0;
  }
  if (rt.state.hitstop > 0) {
    var freeze = Math.min(dt, rt.state.hitstop);
    rt.state.hitstop -= freeze;
    dt -= freeze;
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
  cachedFrame.boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
  cachedFrame.boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
  var frame = cachedFrame;

  stepWaveClock(dt, frame);
  if (rt.state.mode === 'campaign') stepCampaignMode(dt, frame);
  else if (rt.state.mode === 'hardcore') stepHardcoreMode(dt, frame);
  stepMutators(frame);
  stepHazards(dt, frame);
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
  updateDomUi();
}
