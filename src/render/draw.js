import { rt } from '../core/runtime.js';
import { isHighContrast, isReducedMotion } from '../core/settings.js';
import { drawFarMotes, drawNearAtmosphere, drawScreenPost } from './atmosphere.js';
import { drawEnemy, drawHighContrastMarkers, drawRusherTelegraphs } from './enemies.js';
import { drawAdditiveFx, drawDamageNumbers, drawScreenFlashes, updateFx } from './fx.js';
import { drawLightmap } from './lighting.js';
import { drawHud, drawOverlay, drawOffscreenChevrons, drawTacticalMinimap } from './overlay.js';
import { drawPlayer } from './player.js';
import { drawGhostMecha, drawGhostSplitTimer } from './ghost.js';
import { drawArtilleryTelegraphs, drawEnemyBullets, drawLightningArcs, drawMoltenZones, drawOpticalFlashes, drawPlasmaZones, drawPlayerBullets, drawShockRings, drawVortices } from './projectiles.js';
import { drawContactShadows } from './shadows.js';
import { beginGlowBatch, endGlowBatch } from './sprites.js';
import { drawDecals, drawGround } from './terrain.js';
import { drawWorldBoundary, drawWorldBoundaryGlow } from './boundary.js';
import { drawBarrels, drawCasings, drawCores, drawFieldReadability, drawOrb, drawPois, drawSpires } from './world.js';
import { drawTacticalEntities } from '../systems/tactical.js';

// Pre-allocated flat buffer for 0-GC frustum culling
export var culledEnemyIndices = new Int16Array(1024);
export var culledEnemyCount = 0;

export function updateFrustumCulling(camX, camY, viewW, viewH) {
  var halfW = viewW * 0.5;
  var halfH = viewH * 0.5;
  var pad = 48;

  var enemies = rt.state ? rt.state.enemies : null;
  if (!enemies) {
    culledEnemyCount = 0;
    return;
  }

  var count = 0;
  var len = enemies.length;
  for (var i = 0; i < len; i += 1) {
    var e = enemies[i];
    if (!e || e.hp <= 0) continue;

    // Boss gets 220px padding; regular enemies get 48px
    var p = (e.isBoss || e.kind === 'titan' || e.kind === 'dreadnought' || e.kind === 'sovereign') ? 220 : pad;
    var exMin = camX - halfW - p;
    var exMax = camX + halfW + p;
    var eyMin = camY - halfH - p;
    var eyMax = camY + halfH + p;

    if (e.x >= exMin && e.x <= exMax && e.y >= eyMin && e.y <= eyMax) {
      culledEnemyIndices[count] = i;
      count += 1;
      if (count >= 1024) break;
    }
  }
  culledEnemyCount = count;
}

export function draw() {
  if (!rt.ui || !rt.state) return;
  var ctx = rt.ui.ctx;
  ctx.setTransform(rt.ui.dpr, 0, 0, rt.ui.dpr, 0, 0);
  updateFx(rt.renderDt || 0);

  var viewW = rt.ui.width || 960;
  var viewH = rt.ui.height || 640;
  var halfW = viewW * 0.5;
  var halfH = viewH * 0.5;
  var worldW = (rt.state && rt.state.width) || 3520;
  var worldH = (rt.state && rt.state.height) || 2640;

  var cam = (rt.camera && typeof rt.camera.x === 'number') ? rt.camera : null;
  var camX = cam ? cam.x : (rt.state && rt.state.player ? rt.state.player.x : worldW * 0.5);
  var camY = cam ? cam.y : (rt.state && rt.state.player ? rt.state.player.y : worldH * 0.5);

  var x0 = camX - halfW;
  var y0 = camY - halfH;

  updateFrustumCulling(camX, camY, viewW, viewH);

  ctx.save();
  if (cam) {
    ctx.translate(halfW + cam.shakeX, halfH + cam.shakeY);
    if (cam.shakeAngle !== 0) ctx.rotate(cam.shakeAngle);
    ctx.translate(-camX, -camY);
  } else {
    var activeShake = isReducedMotion() ? 0 : rt.state.shake;
    var shakeX = activeShake ? (Math.random() - 0.5) * activeShake : 0;
    var shakeY = activeShake ? (Math.random() - 0.5) * activeShake : 0;
    ctx.translate(-x0 + shakeX, -y0 + shakeY);
  }

  drawGround(ctx, camX, camY, viewW, viewH);
  drawDecals(ctx, x0, y0, viewW, viewH);
  drawWorldBoundary(ctx, x0, y0, viewW, viewH);
  drawFarMotes(ctx);
  drawContactShadows(ctx, culledEnemyIndices, culledEnemyCount);
  drawCasings(ctx);
  drawCores(ctx);
  drawBarrels(ctx);
  drawSpires(ctx);
  drawPois(ctx, x0, y0, viewW, viewH);

  var orbList = rt.state.orbs;
  if (orbList) {
    for (var oi = 0; oi < orbList.length; oi += 1) {
      var orb = orbList[oi];
      if (orb && orb.x >= x0 - 36 && orb.x <= x0 + viewW + 36 && orb.y >= y0 - 36 && orb.y <= y0 + viewH + 36) {
        drawOrb(ctx, orb);
      }
    }
  }

  drawMoltenZones(ctx);
  drawPlasmaZones(ctx);
  drawVortices(ctx);
  drawTacticalEntities(ctx);

  var enemyList = rt.state.enemies;
  if (enemyList) {
    for (var ei = 0; ei < culledEnemyCount; ei += 1) {
      var enemy = enemyList[culledEnemyIndices[ei]];
      if (enemy) drawEnemy(ctx, enemy);
    }
  }

  drawGhostMecha(ctx);
  drawPlayer(ctx);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  drawLightmap(ctx, x0, y0, viewW, viewH);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  beginGlowBatch();
  drawPlayerBullets(ctx);
  drawShockRings(ctx);
  drawLightningArcs(ctx);
  drawOpticalFlashes(ctx);
  drawAdditiveFx(ctx);
  drawWorldBoundaryGlow(ctx, x0, y0, viewW, viewH);
  endGlowBatch();
  ctx.restore();

  drawNearAtmosphere(ctx);

  drawEnemyBullets(ctx);
  drawArtilleryTelegraphs(ctx);
  drawRusherTelegraphs(ctx);
  drawFieldReadability(ctx);
  drawHighContrastMarkers(ctx);
  drawDamageNumbers(ctx);

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
          ctx.fillRect(x0 - 48, y0 - 48, viewW + 96, viewH + 96);
        }
        ctx.restore();
      }
    }
  }

  ctx.restore(); // Restores context from camera translation

  drawScreenPost(ctx);
  drawScreenFlashes(ctx);
  drawTacticalMinimap(ctx);
  drawOffscreenChevrons(ctx);
  drawHud(ctx);
  drawGhostSplitTimer(ctx);
  drawOverlay(ctx);
}
