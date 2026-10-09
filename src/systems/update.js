import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { stepContracts } from './contracts.js';
import { stepMutators } from './mutators.js';
import { stepBullets } from './sim/bullets.js';
import { stepEffects } from './sim/effects.js';
import { stepEnemies } from './sim/enemies.js';
import { stepArtilleryTargets, stepEnemyBullets } from './sim/enemy-bullets.js';
import { stepHazards } from './sim/hazards.js';
import { stepOrbs } from './sim/orbs.js';
import { stepPlayer } from './sim/player.js';
import { stepEnemySpawner, stepWaveClock } from './sim/timers-wave.js';
import { updateDomUi } from '../ui/hud.js';

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
  if (isReducedMotion()) rt.state.hitstop = 0;
  if (rt.state.hitstop > 0) {
    var freeze = Math.min(dt, rt.state.hitstop);
    rt.state.hitstop -= freeze;
    dt -= freeze;
  }
  if (dt <= 0) { updateDomUi(); return; }

  var frame = {
    p: rt.state.player,
    boundW: (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960,
    boundH: (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640
  };

  stepWaveClock(dt, frame);
  stepMutators(frame);
  stepHazards(dt, frame);
  stepPlayer(dt, frame);
  stepEnemySpawner(dt, frame);
  stepBullets(dt, frame);
  stepOrbs(dt, frame);
  stepEnemies(dt, frame);
  stepEnemyBullets(dt, frame);
  stepArtilleryTargets(dt, frame);
  stepEffects(dt, frame);
  stepContracts(frame);
  updateDomUi();
}
