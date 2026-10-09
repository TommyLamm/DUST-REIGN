import { COMBO_WINDOW, OVERDRIVE_DURATION, WAVE_LENGTH } from '../config.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { tickHudPresentation } from '../ui/hud.js';
import { PALETTE } from './palette.js';
import { drawGlow } from './sprites.js';
import { isChinese, tBanner } from '../core/i18n.js';

var titanLag = 1;
var titanRef = null;
var deathGhost = 0;

function hudColor(group, name, fallback) {
  var bucket = PALETTE && PALETTE[group];
  return (bucket && bucket[name]) || fallback;
}

function hashNoise(i, salt) {
  var n = ((i + 1) * 1103515245 + salt * 12345) % 2147483647;
  if (n < 0) n += 2147483647;
  return n;
}

function fillChromaticBar(ctx, x, y, w, h) {
  if (!isReducedMotion() && w > 2) {
    ctx.fillStyle = 'rgba(255, 70, 48, 0.4)';
    ctx.fillRect(x - 2, y - 1, w, h);
    ctx.fillStyle = 'rgba(80, 220, 255, 0.35)';
    ctx.fillRect(x + 2, y + 1, w, h);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
}

function fillDeathNoise(ctx) {
  if (isReducedMotion()) return;
  var salt = Math.floor((rt.renderTime || 0) * 24);
  var width = Math.max(1, rt.ui.width | 0);
  var height = Math.max(1, rt.ui.height | 0);
  ctx.save();
  ctx.globalAlpha = 0.28;
  for (var i = 0; i < 22; i += 1) {
    var x = hashNoise(i, salt) % width;
    var y = hashNoise(i + 9, salt) % height;
    ctx.fillStyle = i % 3 === 0 ? '#ff6a3d' : '#e8e0c6';
    ctx.fillRect(x, y, i % 4 === 0 ? 3 : 2, 1);
  }
  ctx.restore();
}

function drawTitanBar(ctx, titan) {
  if (titanRef !== titan) {
    titanRef = titan;
    titanLag = clamp(titan.hp / titan.maxHp, 0, 1);
  }
  var hpRatio = clamp(titan.hp / titan.maxHp, 0, 1);
  var dt = rt.renderDt || 0.016;
  if (isReducedMotion() || hpRatio >= titanLag) titanLag = hpRatio;
  else titanLag += (hpRatio - titanLag) * Math.min(1, dt * 2.4);

  var barW = Math.min(360, rt.ui.width * 0.65);
  var barH = 12;
  var barX = (rt.ui.width - barW) / 2;
  var barY = 20;
  var enraged = Boolean(titan.phase2Triggered);
  var stroke = enraged ? hudColor('emissive', 'hostile', '#ff6a3d') : hudColor('emissive', 'gold', '#ffd36b');
  var fill = enraged ? '#ff4d2e' : '#d4af37';

  ctx.fillStyle = 'rgba(14, 12, 10, 0.92)';
  ctx.fillRect(barX - 6, barY - 14, barW + 12, barH + 20);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX - 6, barY - 14, barW + 12, barH + 20);

  ctx.font = '900 10px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = enraged ? '#ff4d2e' : '#f5d58f';
  var zh = isChinese();
  var rawName = titan.bossName || 'TITAN';
  var rawSub = (enraged && titan.kind === 'titan') ? 'ENRAGED' : (titan.bossSubtitle || 'APEX THREAT');
  var bName = rawName;
  var bSub = rawSub;
  if (zh) {
    if (rawName === 'TITAN') bName = '泰坦';
    else if (rawName === 'DREADNOUGHT') bName = '無畏巨艦';
    else if (rawName === 'STORM SOVEREIGN') bName = '風暴領主';

    if (rawSub === 'ENRAGED') bSub = '暴怒';
    else if (rawSub === 'APEX THREAT') bSub = '終極威脅';
    else if (rawSub === 'OVERDRIVE') bSub = '超載運轉';
    else if (rawSub === 'DOUBLE RAM') bSub = '雙重衝撞';
    else if (rawSub === 'CHARGE') bSub = '衝能突進';
    else if (rawSub === 'EYE') bSub = '風暴之眼';
    else if (rawSub === 'TWIN SPIRES') bSub = '雙生尖塔';
    else if (rawSub === 'GALE') bSub = '烈風狂嘯';
  }
  var bossTitle = bName + ' // ' + bSub;
  ctx.fillText(bossTitle, barX, barY - 11);
  ctx.textAlign = 'right';
  ctx.fillText(Math.ceil(titan.hp) + ' / ' + titan.maxHp, barX + barW, barY - 11);

  ctx.fillStyle = '#1c1712';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = 'rgba(255, 244, 230, 0.85)';
  ctx.fillRect(barX, barY, barW * titanLag, barH);
  ctx.fillStyle = fill;
  ctx.fillRect(barX, barY, barW * hpRatio, barH);
  if (!isReducedMotion()) drawGlow(ctx, barX + barW * hpRatio, barY + barH / 2, 16, fill, 0.4);

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(barX + barW * 0.25, barY, 1.5, barH);
  ctx.fillRect(barX + barW * 0.50, barY, 2, barH);
  ctx.fillRect(barX + barW * 0.75, barY, 1.5, barH);
}

function drawWaveBanner(ctx) {
  var zh = isChinese();
  var text = rt.state.bannerText ? tBanner(rt.state.bannerText) : (zh ? ('第 ' + String(rt.state.wave).padStart(2, '0') + ' 波') : ('WAVE ' + String(rt.state.wave).padStart(2, '0')));
  var alpha = clamp(Math.min(rt.state.banner, 0.85), 0, 1);
  var cx = rt.ui.width / 2;
  var y = Math.max(96, Math.min(rt.ui.height * 0.36, rt.ui.height * 0.28 + 36));
  var fontSize = Math.max(12, Math.min(rt.state.bannerText ? 20 : 28, rt.ui.width / 16));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 ' + fontSize + 'px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
  var textW = Math.min(rt.ui.width - 40, ctx.measureText(text).width + 56);
  var boxH = fontSize + 22;
  var boxX = cx - textW / 2;
  var boxY = y - boxH / 2;
  ctx.fillStyle = 'rgba(16, 17, 14, 0.78)';
  ctx.fillRect(boxX, boxY, textW, boxH);
  ctx.strokeStyle = rt.state.bannerText ? hudColor('hud', 'mint', '#96baa0') : hudColor('hud', 'amber', '#e8b94e');
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textW, boxH);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(boxX, boxY, 10, 2);
  ctx.fillRect(boxX + textW - 10, boxY + boxH - 2, 10, 2);
  var glitch = 0;
  if (!isReducedMotion()) {
    var frame = Math.floor((rt.renderTime || 0) * 30);
    var slot = frame % 48;
    if (slot === 0 || slot === 1) glitch = slot === 0 ? -1.5 : 1.5;
    ctx.fillStyle = 'rgba(255, 80, 60, 0.55)';
    ctx.fillText(text, cx - Math.abs(glitch) - 1, y);
    ctx.fillStyle = 'rgba(80, 220, 255, 0.45)';
    ctx.fillText(text, cx + Math.abs(glitch) + 1, y);
  }
  ctx.fillStyle = rt.state.bannerText ? '#96baa0' : '#e8b94e';
  ctx.fillText(text, cx + glitch, y);
  ctx.restore();
}

export function drawHud(ctx) {
  tickHudPresentation();
  var p = rt.state.player;
  ctx.save();
  ctx.font = '700 12px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textBaseline = 'top';
  // The full page supplies these metrics in HTML; keep Canvas metrics for fallback hosts.
  if (!rt.ui.health || !rt.ui.xp || !rt.ui.wave || !rt.ui.score) {
    ctx.fillStyle = '#e9d9b9';
    ctx.fillText('WASTELAND // RUN', 20, 18);
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = 'rgba(233,217,185,.72)';
    ctx.fillText('WASD MOVE   MOUSE AIM + HOLD FIRE', 20, 36);

    var barX = 20;
    var barY = 60;
    var barW = Math.min(220, rt.ui.width * .35);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(barX, barY, barW, 8);
    ctx.fillStyle = '#df6b4f'; ctx.fillRect(barX, barY, barW * clamp(p.hp / p.maxHp, 0, 1), 8);
    ctx.fillStyle = '#e9d9b9'; ctx.fillText('HP ' + Math.ceil(p.hp) + ' / ' + Math.ceil(p.maxHp), barX, barY + 13);
    barY += 31;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(barX, barY, barW, 5);
    ctx.fillStyle = '#75d1b0'; ctx.fillRect(barX, barY, barW * clamp(rt.state.xp / rt.state.xpNext, 0, 1), 5);
    ctx.fillStyle = 'rgba(233,217,185,.8)'; ctx.fillText('LV ' + rt.state.level + '   SCRAP ' + rt.state.xp + ' / ' + rt.state.xpNext, barX, barY + 10);

    ctx.textAlign = 'right';
    ctx.font = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = '#f0cf88';
    ctx.fillText('WAVE ' + String(rt.state.wave).padStart(2, '0'), rt.ui.width - 20, 20);
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = 'rgba(233,217,185,.75)';
    ctx.fillText('KILLS ' + rt.state.kills + '   SCORE ' + rt.state.score, rt.ui.width - 20, 39);
  }
  if (rt.state.combo > 0 && !rt.ui.hudChain) {
    ctx.textAlign = 'left';
    ctx.font = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = '#75d1b0';
    ctx.fillText('CHAIN x' + rt.state.combo, 20, 124);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(20, 145, 148, 4);
    ctx.fillStyle = '#75d1b0'; ctx.fillRect(20, 145, 148 * rt.state.comboTimer / COMBO_WINDOW, 4);
    ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = 'rgba(233,217,185,.75)';
    ctx.fillText('KEEP THE SIGNAL HOT', 20, 155);
  }
  if (p.overdrive > 0) {
    ctx.textAlign = 'left';
    ctx.font = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = '#f0cf88';
    ctx.fillText('OVERCLOCK ' + p.overdrive.toFixed(1) + 's', 20, 176);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(20, 197, 148, 4);
    ctx.fillStyle = '#f0cf88'; ctx.fillRect(20, 197, 148 * p.overdrive / OVERDRIVE_DURATION, 4);
    ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = 'rgba(233,217,185,.75)';
    ctx.fillText('DAMAGE +50% / COOLDOWN -38%', 20, 207);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(rt.ui.width - 145, 58, 125, 4);
  ctx.fillStyle = '#d49a55'; ctx.fillRect(rt.ui.width - 145, 58, 125 * clamp(rt.state.waveTime / WAVE_LENGTH, 0, 1), 4);

  var boss = rt.state.boss;
  if (boss && boss.hp > 0) drawTitanBar(ctx, boss);
  else titanRef = null;

  ctx.restore();
}

export function drawOverlay(ctx) {
  if (rt.state.banner > 0 && !rt.state.over) drawWaveBanner(ctx);
  if (rt.state.paused && !rt.state.over && (!rt.state.upgradeChoices || !rt.state.upgradeChoices.length) && (!rt.ui.startScreen || rt.ui.startScreen.hidden)) {
    var hasPauseModal = typeof document !== 'undefined' && Boolean(document.getElementById('pauseModal'));
    if (!hasPauseModal) {
      var zhPause = isChinese();
      ctx.save();
      ctx.fillStyle = 'rgba(8,7,7,.74)'; ctx.fillRect(0, 0, rt.ui.width, rt.ui.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f0cf88';
      ctx.font = '700 ' + Math.min(34, rt.ui.width / 9) + 'px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
      ctx.fillText(zhPause ? '戰鬥已暫停' : 'SIGNAL PAUSED', rt.ui.width / 2, rt.ui.height * .42);
      ctx.fillStyle = '#75d1b0';
      ctx.font = '14px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
      var resumePrompt = document.getElementById('pauseBtn')
        ? (zhPause ? '點擊繼續以回到戰鬥' : 'PRESS RESUME TO CONTINUE')
        : (zhPause ? '按 P 或 ESC 繼續戰鬥' : 'PRESS P OR ESC TO RESUME');
      ctx.fillText(resumePrompt, rt.ui.width / 2, rt.ui.height * .53, rt.ui.width - 24);
      ctx.restore();
    }
  }
  if (rt.state.over) {
    if (rt.state.deathSequenceTimer > 0) {
      var elapsed = 0.55 - rt.state.deathSequenceTimer;
      ctx.save();
      if (elapsed < 0.02) deathGhost = rt.ui.width;
      if (elapsed < 0.25) {
        var t1 = elapsed / 0.25;
        var curH = Math.max(2, rt.ui.height * (1 - t1));
        var topH = (rt.ui.height - curH) / 2;
        ctx.fillStyle = '#050404';
        ctx.fillRect(0, 0, rt.ui.width, topH);
        ctx.fillRect(0, rt.ui.height - topH, rt.ui.width, topH);
        fillDeathNoise(ctx);
        for (var gx = 0; gx < rt.ui.width; gx += 48) drawGlow(ctx, gx, rt.ui.height / 2, 18, '#5be7ff', 0.35);
        fillChromaticBar(ctx, 0, rt.ui.height / 2 - 1, rt.ui.width, 2);
      } else if (elapsed < 0.45) {
        var t2 = (elapsed - 0.25) / 0.20;
        var curW = Math.max(2, rt.ui.width * (1 - t2));
        var leftW = (rt.ui.width - curW) / 2;
        ctx.fillStyle = '#050404';
        ctx.fillRect(0, 0, rt.ui.width, rt.ui.height);
        fillDeathNoise(ctx);
        if (!isReducedMotion() && deathGhost > curW + 4) {
          ctx.save();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = '#5be7ff';
          ctx.fillRect((rt.ui.width - deathGhost) / 2, rt.ui.height / 2 - 1, deathGhost, 2);
          ctx.restore();
        }
        deathGhost = curW;
        drawGlow(ctx, rt.ui.width / 2, rt.ui.height / 2, Math.max(18, curW * 0.5), '#5be7ff', 0.35);
        fillChromaticBar(ctx, leftW, rt.ui.height / 2 - 1, curW, 2);
      } else {
        ctx.fillStyle = '#050404';
        ctx.fillRect(0, 0, rt.ui.width, rt.ui.height);
        fillDeathNoise(ctx);
      }
      ctx.restore();
      return;
    }
    deathGhost = 0;
    var zhOver = isChinese();
    ctx.save();
    ctx.fillStyle = 'rgba(8,7,7,.74)'; ctx.fillRect(0, 0, rt.ui.width, rt.ui.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#df6b4f';
    ctx.font = '700 34px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
    ctx.fillText(zhOver ? '出擊結束' : 'RUN ENDED', rt.ui.width / 2, rt.ui.height * .39);
    ctx.fillStyle = '#e9d9b9';
    ctx.font = '14px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
    var overSummary = zhOver
      ? ('第 ' + rt.state.wave + ' 波  //  分數 ' + rt.state.score + '  //  擊殺 ' + rt.state.kills)
      : ('WAVE ' + rt.state.wave + '  //  SCORE ' + rt.state.score + '  //  KILLS ' + rt.state.kills);
    ctx.fillText(overSummary, rt.ui.width / 2, rt.ui.height * .47);
    ctx.fillStyle = '#75d1b0';
    ctx.fillText(zhOver ? '按 R 或點擊再次出擊' : 'PRESS R OR CLICK TO RESTART', rt.ui.width / 2, rt.ui.height * .56);
    ctx.restore();
  }
}
