import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { drawFarMotes, drawNearAtmosphere, drawScreenPost } from './atmosphere.js';
import { drawEnemy, drawHighContrastMarkers, drawRusherTelegraphs } from './enemies.js';
import { drawAdditiveFx, drawDamageNumbers, drawScreenFlashes, updateFx } from './fx.js';
import { drawLightmap } from './lighting.js';
import { drawHud, drawOverlay } from './overlay.js';
import { drawPlayer } from './player.js';
import { drawArtilleryTelegraphs, drawEnemyBullets, drawLightningArcs, drawMoltenZones, drawOpticalFlashes, drawPlasmaZones, drawPlayerBullets, drawShockRings, drawVortices } from './projectiles.js';
import { drawContactShadows } from './shadows.js';
import { beginGlowBatch, endGlowBatch } from './sprites.js';
import { drawDecals, drawGround } from './terrain.js';
import { drawBarrels, drawCasings, drawCores, drawFieldReadability, drawOrb, drawSpires } from './world.js';

export function draw() {
  if (!rt.ui || !rt.state) return;
  var ctx = rt.ui.ctx;
  ctx.setTransform(rt.ui.dpr, 0, 0, rt.ui.dpr, 0, 0);
  updateFx(rt.renderDt || 0);

  var activeShake = isReducedMotion() ? 0 : rt.state.shake;
  var shakeX = activeShake ? (Math.random() - 0.5) * activeShake : 0;
  var shakeY = activeShake ? (Math.random() - 0.5) * activeShake : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawGround(ctx);
  drawDecals(ctx);
  drawFarMotes(ctx);
  drawContactShadows(ctx);
  drawCasings(ctx);
  drawCores(ctx);
  drawBarrels(ctx);
  drawSpires(ctx);
  var orbList = rt.state.orbs;
  var oi;
  if (orbList) {
    for (oi = 0; oi < orbList.length; oi += 1) drawOrb(ctx, orbList[oi]);
  }
  drawMoltenZones(ctx);
  drawPlasmaZones(ctx);
  drawVortices(ctx);
  var enemyList = rt.state.enemies;
  var ei;
  if (enemyList) {
    for (ei = 0; ei < enemyList.length; ei += 1) drawEnemy(ctx, enemyList[ei]);
  }
  drawPlayer(ctx);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  drawLightmap(ctx);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  beginGlowBatch();
  drawPlayerBullets(ctx);
  drawShockRings(ctx);
  drawLightningArcs(ctx);
  drawOpticalFlashes(ctx);
  drawAdditiveFx(ctx);
  endGlowBatch();
  ctx.restore();

  drawNearAtmosphere(ctx);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  drawEnemyBullets(ctx);
  drawArtilleryTelegraphs(ctx);
  drawRusherTelegraphs(ctx);
  drawFieldReadability(ctx);
  drawHighContrastMarkers(ctx);
  drawDamageNumbers(ctx);
  ctx.restore();

  if (!isReducedMotion() && !isHighContrast() && rt.state.player && rt.state.player.fx) {
    var chronoUntil = rt.state.player.fx.chronoUntil || 0;
    if (chronoUntil > rt.renderTime) {
      var chronoLeft = chronoUntil - rt.renderTime;
      var chronoA = chronoLeft > 0.18 ? 0.78 : (0.78 * chronoLeft / 0.18);
      if (chronoA > 0.04) {
        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        if (ctx.globalCompositeOperation === 'saturation') {
          ctx.globalAlpha = chronoA;
          ctx.fillStyle = '#7a7a7a';
          ctx.fillRect(-48, -48, rt.ui.width + 96, rt.ui.height + 96);
        }
        ctx.restore();
      }
    }
  }

  ctx.restore();

  drawScreenPost(ctx);
  drawScreenFlashes(ctx);
  drawHud(ctx);
  drawOverlay(ctx);
}
