import { COMBO_WINDOW, OVERDRIVE_DURATION, WAVE_LENGTH, TAU } from '../config.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion } from '../core/settings.js';
import { clamp } from '../core/utils.js';
import { tickHudPresentation } from '../ui/hud.js';
import { PALETTE } from './palette.js';
import { drawGlow } from './sprites.js';
import { isChinese, tBanner } from '../core/i18n.js';
import { worldToScreen } from '../core/camera.js';
import { getComboWindow } from '../systems/combat.js';

var bossLag = 1;
var bossRef = null;
var deathGhost = 0;
var hudInset = 0;
var hudInsetKey = '';


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
  // 4. Storm Core Indicators (青金色箭頭附 CORE 標記)
  var orbs = rt.state.orbs;
  if (orbs && orbs.length > 0) {
    for (var oi = 0; oi < orbs.length; oi += 1) {
      var scOrb = orbs[oi];
      if (scOrb && scOrb.kind === 'storm_core') {
        var scRes = computeEdgeIntersection(scOrb.x, scOrb.y, cam, viewW, viewH, margin, _CHEVRON_INTERSECT);
        if (scRes) {
          var scDistM = Math.round(Math.hypot(scOrb.x - p.x, scOrb.y - p.y) / 16);
          ctx.save();
          ctx.translate(scRes.x, scRes.y);
          ctx.rotate(scRes.angle);

          ctx.fillStyle = '#00f3ff';
          ctx.beginPath();
          ctx.moveTo(8, 0); ctx.lineTo(-3, -5); ctx.lineTo(-1, 0); ctx.lineTo(-3, 5); ctx.closePath();
          ctx.fill();
          ctx.restore();

          ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Consolas, monospace';
          ctx.fillStyle = '#00f3ff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          var scxOffset = clamp(scRes.x - Math.cos(scRes.angle) * 14, 32, viewW - 32);
          var scyOffset = clamp(scRes.y - Math.sin(scRes.angle) * 14, 18, viewH - 18);
          ctx.fillText('CORE ' + scDistM + 'm', scxOffset, scyOffset);
        }
      }
    }
  }

  ctx.restore();
}

function drawPartBadge(ctx, x, y, w, h, label, destroyed, exposed) {
  ctx.save();
  if (destroyed) {
    // 部位破壞狀態標籤：深黑底 + 紅框 + 劃線徽章
    ctx.fillStyle = 'rgba(12, 4, 4, 0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ff2233';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, w, h);

    ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff6666';
    ctx.fillText(label, x + w / 2, y + h / 2);

    // Strikethrough line (劃線徽章)
    ctx.strokeStyle = '#ff2233';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + h / 2);
    ctx.lineTo(x + w - 2, y + h / 2);
    ctx.stroke();
  } else if (exposed) {
    // 弱點過熱時：金色準心 + 高亮金邊
    var pulse = isReducedMotion() ? 1 : (0.7 + 0.3 * Math.sin((rt.renderTime || 0) * 12));
    ctx.fillStyle = 'rgba(28, 20, 6, 0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 215, 0, ' + pulse.toFixed(2) + ')';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, w, h);

    ctx.font = '900 8.5px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(label, x + 13, y + h / 2);

    // 金色準心 (Golden Crosshair)
    var cx = x + 6.5;
    var cy = y + h / 2;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4.5, cy);
    ctx.lineTo(cx + 4.5, cy);
    ctx.moveTo(cx, cy - 4.5);
    ctx.lineTo(cx, cy + 4.5);
    ctx.stroke();
  } else {
    // Normal intact part
    ctx.fillStyle = 'rgba(16, 14, 12, 0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(110, 95, 80, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c8bcab';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }
  ctx.restore();
}

// Bottom edge of the DOM wave pill in canvas CSS px; measured once per canvas size.
function waveHudInset() {
  var key = rt.ui.width + 'x' + rt.ui.height;
  if (hudInsetKey === key && hudInset > 0) return hudInset;
  var metric = rt.ui.wave && rt.ui.wave.closest ? rt.ui.wave.closest('.metric') : null;
  var canvas = rt.ui.canvas;
  if (!metric || !canvas || !metric.getBoundingClientRect || !canvas.getBoundingClientRect) return 0;
  hudInset = Math.max(0, metric.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top);
  hudInsetKey = key;
  return hudInset;
}

export function drawBossHealthBar(ctx, boss) {
  if (!ctx || !boss || !(boss.hp > 0)) return;
  if (bossRef !== boss) {
    bossRef = boss;
    bossLag = clamp(boss.hp / boss.maxHp, 0, 1);
  }
  var hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
  var dt = rt.renderDt || 0.016;
  if (isReducedMotion() || hpRatio >= bossLag) bossLag = hpRatio;
  else bossLag += (hpRatio - bossLag) * Math.min(1, dt * 2.4);

  var parts = boss.parts;
  if ((!parts || !parts.length) && boss.kind === 'titan') {
    parts = [
      { id: 'left_cannon', nameZh: '左迫砲', nameEn: 'L-CANNON', destroyed: boss.leftCannonDestroyed, exposed: false },
      { id: 'right_pod', nameZh: '右蜂巢', nameEn: 'R-POD', destroyed: boss.rightPodDestroyed, exposed: false },
      { id: 'radiator', nameZh: '鰭片', nameEn: 'FINS', destroyed: boss.radiatorDestroyed, exposed: boss.radiatorExposed },
      { id: 'treads', nameZh: '履帶', nameEn: 'TREADS', destroyed: boss.treadDestroyed, exposed: false }
    ];
  }
  var hasParts = Boolean(parts && parts.length > 0);

  var barW = Math.min(360, rt.ui.width * 0.65);
  var barH = 12;
  var barX = (rt.ui.width - barW) / 2;
  // Sit below the page HUD's top-center wave pill when it exists.
  var barY = rt.ui.wave ? Math.max(20, waveHudInset() + 22) : 20;
  var boxExtraH = hasParts ? 20 : 0;
  var enraged = Boolean(boss.phase2Triggered);
  var stroke = enraged ? PALETTE.emissive.hostile : PALETTE.emissive.gold;
  var fill = enraged ? '#ff4d2e' : '#d4af37';

  ctx.fillStyle = 'rgba(14, 12, 10, 0.94)';
  ctx.fillRect(barX - 6, barY - 14, barW + 12, barH + 20 + boxExtraH);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX - 6, barY - 14, barW + 12, barH + 20 + boxExtraH);

  ctx.font = '900 10px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = enraged ? '#ff4d2e' : '#f5d58f';
  var zh = isChinese();
  var rawName = boss.bossName || (boss.kind ? boss.kind.toUpperCase() : 'BOSS');
  var rawSub = (enraged && boss.kind === 'titan') ? 'ENRAGED' : (boss.bossSubtitle || 'APEX THREAT');
  var bName = rawName;
  var bSub = rawSub;
  if (zh) {
    if (rawName === 'TITAN') bName = '泰坦';
    else if (rawName === 'DREADNOUGHT') bName = '無畏巨艦';
    else if (rawName === 'STORM SOVEREIGN') bName = '風暴主宰';
    else if (rawName === 'BEHEMOTH') bName = '巨獸';

    if (rawSub === 'ENRAGED') bSub = '暴怒';
    else if (rawSub === 'ARMOR BREAK') bSub = '破甲輸出';
    else if (rawSub === 'APEX THREAT') bSub = '終極威脅';
    else if (rawSub === 'OVERDRIVE') bSub = '超載運轉';
    else if (rawSub === 'DOUBLE RAM') bSub = '雙重衝撞';
    else if (rawSub === 'CHARGE') bSub = '衝能突進';
    else if (rawSub === 'EYE') bSub = '風暴之眼';
    else if (rawSub === 'TWIN SPIRES') bSub = '雙生尖塔';
    else if (rawSub === 'GALE') bSub = '烈風狂嘯';
    else if (rawSub === 'ABYSSAL COLOSSUS') bSub = '深淵巨像';
  }
  var bossTitle = bName + ' // ' + bSub;
  ctx.fillText(bossTitle, barX, barY - 11);
  ctx.textAlign = 'right';
  ctx.fillText(Math.ceil(boss.hp) + ' / ' + boss.maxHp, barX + barW, barY - 11);

  ctx.fillStyle = '#1c1712';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = 'rgba(255, 244, 230, 0.85)';
  ctx.fillRect(barX, barY, barW * bossLag, barH);
  ctx.fillStyle = fill;
  ctx.fillRect(barX, barY, barW * hpRatio, barH);
  if (!isReducedMotion()) drawGlow(ctx, barX + barW * hpRatio, barY + barH / 2, 16, fill, 0.4);

  // 25%, 50%, 75% tick marks (pure black dividers)
  ctx.fillStyle = '#000000';
  ctx.fillRect(barX + barW * 0.25 - 0.75, barY, 1.5, barH);
  ctx.fillRect(barX + barW * 0.50 - 1, barY, 2, barH);
  ctx.fillRect(barX + barW * 0.75 - 0.75, barY, 1.5, barH);

  // Dynamic multi-part breakdown badges
  if (hasParts && parts.length > 0) {
    var numParts = parts.length;
    var badgeY = barY + barH + 5;
    var badgeH = 13;
    var badgeGap = 5;
    var badgeW = Math.max(16, (barW - badgeGap * (numParts - 1)) / numParts);

    for (var pi = 0; pi < numParts; pi += 1) {
      var pt = parts[pi];
      var label;
      if (zh) {
        label = pt.nameZh || pt.badgeZh || (pt.id === 'left_cannon' ? '左迫砲' : pt.id === 'right_pod' ? '右蜂巢' : pt.id === 'radiator' ? '鰭片' : pt.id === 'treads' ? '履帶' : (pt.name || pt.id));
      } else {
        label = pt.nameEn || pt.badgeEn || (pt.id === 'left_cannon' ? 'L-CANNON' : pt.id === 'right_pod' ? 'R-POD' : pt.id === 'radiator' ? 'FINS' : pt.id === 'treads' ? 'TREADS' : (pt.name || pt.id.toUpperCase()));
      }
      var destroyed = Boolean(pt.destroyed ||
        (pt.id === 'left_cannon' && boss.leftCannonDestroyed) ||
        (pt.id === 'right_pod' && boss.rightPodDestroyed) ||
        (pt.id === 'radiator' && boss.radiatorDestroyed) ||
        (pt.id === 'treads' && boss.treadDestroyed));
      var exposed = Boolean(pt.exposed || (pt.id === 'radiator' && boss.radiatorExposed));
      var bx = barX + (badgeW + badgeGap) * pi;
      drawPartBadge(ctx, bx, badgeY, badgeW, badgeH, label, destroyed, exposed);
    }
  }
}

export function drawTitanBar(ctx, titan) {
  return drawBossHealthBar(ctx, titan);
}

function drawWaveBanner(ctx) {
  var zh = isChinese();
  var text = rt.state.bannerText ? tBanner(rt.state.bannerText) : (zh ? ('第 ' + String(rt.state.wave).padStart(2, '0') + ' 波') : ('WAVE ' + String(rt.state.wave).padStart(2, '0')));
  var alpha = clamp(Math.min(rt.state.banner, 0.92), 0, 1);
  var cx = rt.ui.width / 2;
  var y = Math.max(96, Math.min(rt.ui.height * 0.36, rt.ui.height * 0.28 + 36));
  var fontSize = Math.max(12, Math.min(rt.state.bannerText ? 20 : 28, rt.ui.width / 16));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 ' + fontSize + 'px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
  var textW = Math.min(rt.ui.width - 40, ctx.measureText(text).width + 64);
  var boxH = fontSize + 26;
  var boxX = cx - textW / 2;
  var boxY = y - boxH / 2;
  // Short dark plate under text — readable on sand without new chrome strings.
  ctx.fillStyle = 'rgba(8, 9, 7, 0.88)';
  ctx.fillRect(boxX, boxY, textW, boxH);
  ctx.strokeStyle = rt.state.bannerText ? '#e8b94e' : PALETTE.hud.amber;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(boxX, boxY, textW, boxH);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(boxX, boxY, 10, 2);
  ctx.fillRect(boxX + textW - 10, boxY + boxH - 2, 10, 2);
  var glitch = 0;
  if (!isReducedMotion()) {
    var frame = Math.floor((rt.renderTime || 0) * 30);
    var slot = frame % 48;
    if (slot === 0 || slot === 1) glitch = slot === 0 ? -1.5 : 1.5;
    ctx.fillStyle = 'rgba(255, 80, 60, 0.35)';
    ctx.fillText(text, cx - Math.abs(glitch) - 1, y);
    ctx.fillStyle = 'rgba(80, 220, 255, 0.28)';
    ctx.fillText(text, cx + Math.abs(glitch) + 1, y);
  }
  // Bone / amber body (was mint-gray on sand).
  ctx.fillStyle = rt.state.bannerText ? '#f2e6c9' : '#e8b94e';
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
    ctx.fillStyle = '#75d1b0'; ctx.fillRect(20, 145, 148 * rt.state.comboTimer / getComboWindow(rt.state.combo), 4);
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
  // The page HUD shows wave progress under the wave pill; only fallback hosts get the canvas bar.
  if (!rt.ui.wave) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(rt.ui.width - 145, 58, 125, 4);
    ctx.fillStyle = '#d49a55'; ctx.fillRect(rt.ui.width - 145, 58, 125 * clamp(rt.state.waveTime / WAVE_LENGTH, 0, 1), 4);
  }

  var boss = rt.state.boss;
  if (boss && boss.hp > 0) drawBossHealthBar(ctx, boss);
  else bossRef = null;

  ctx.restore();
}

function drawLowHpVignette(ctx) {
  if (isReducedMotion() || !rt.state || !rt.state.player || rt.state.over) return;
  var p = rt.state.player;
  if (!p || !(p.hp > 0) || !(p.maxHp > 0) || (p.hp / p.maxHp > 0.25)) return;

  var w = rt.ui ? rt.ui.width : (rt.state ? rt.state.width : 960);
  var h = rt.ui ? rt.ui.height : (rt.state ? rt.state.height : 640);
  var now = rt.renderTime || 0;
  var pulse = 0.55 + 0.45 * Math.sin(now * 7.5);
  var hpRatio = p.hp / p.maxHp;
  var intensity = clamp((0.25 - hpRatio) / 0.25, 0, 1);
  // Edge-only: keep center clear so mortar marks / crawlers stay readable.
  var edgeAlpha = clamp(0.22 + intensity * 0.38 * pulse, 0.12, 0.62);
  var inset = Math.max(28, Math.min(w, h) * 0.045);

  ctx.save();
  // Soft ring: transparent through most of the arena, red only near the frame.
  var cx = w * 0.5;
  var cy = h * 0.5;
  var inner = Math.min(w, h) * 0.42;
  var outer = Math.max(w, h) * 0.78;
  var grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, 'rgba(255, 0, 20, 0)');
  grad.addColorStop(0.72, 'rgba(180, 10, 15, 0)');
  grad.addColorStop(0.9, 'rgba(160, 8, 14, ' + (edgeAlpha * 0.35).toFixed(3) + ')');
  grad.addColorStop(1, 'rgba(120, 0, 10, ' + edgeAlpha.toFixed(3) + ')');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Thin pulsing frame — no world/terrain color multiply.
  ctx.strokeStyle = 'rgba(255, 48, 56, ' + (edgeAlpha * 0.95).toFixed(3) + ')';
  ctx.lineWidth = 2 + intensity * 2.5;
  ctx.strokeRect(inset * 0.35, inset * 0.35, w - inset * 0.7, h - inset * 0.7);

  ctx.restore();
}

var _CURSOR_SCREEN_POS = { x: 0, y: 0 };

export function drawTacticalCursorReticle(ctx) {
  if (!ctx || !rt.state || !rt.state.player || rt.state.over || rt.state.paused) return;
  if (!rt.input || !rt.input.mouse) return;
  var mx = rt.input.mouse.sx;
  var my = rt.input.mouse.sy;
  if (typeof mx !== 'number' || typeof my !== 'number') return;
  var p = rt.state.player;

  ctx.save();

  // 1. Dynamic Recoil Spread Crosshair
  var recoil = (p && p.recoil) || 0;
  var R = 10 + Math.min(18, recoil * 14);

  ctx.strokeStyle = 'rgba(0, 243, 255, 0.85)';
  ctx.fillStyle = '#00f3ff';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';

  // 4 ticks
  ctx.beginPath();
  // Top
  ctx.moveTo(mx, my - R);
  ctx.lineTo(mx, my - R - 6);
  // Bottom
  ctx.moveTo(mx, my + R);
  ctx.lineTo(mx, my + R + 6);
  // Left
  ctx.moveTo(mx - R, my);
  ctx.lineTo(mx - R - 6, my);
  // Right
  ctx.moveTo(mx + R, my);
  ctx.lineTo(mx + R + 6, my);
  ctx.stroke();

  // Center pip
  ctx.beginPath();
  ctx.arc(mx, my, 1.5, 0, TAU);
  ctx.fill();

  // 2. Vanguard / Colossus 360° Charge Progress Arc
  if (p && p.isCharging && (p.chargeNeed || 0) > 0) {
    var prog = clamp((p.chargeTime || 0) / p.chargeNeed, 0, 1);
    var isFull = prog >= 1;
    var pulse = isReducedMotion() ? 1 : (0.8 + 0.2 * Math.sin((rt.renderTime || 0) * 16));

    ctx.beginPath();
    ctx.arc(mx, my, R + 4, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
    ctx.strokeStyle = isFull ? ('rgba(255, 211, 107, ' + pulse.toFixed(2) + ')') : 'rgba(0, 243, 255, 0.85)';
    ctx.lineWidth = isFull ? 2.5 : 1.8;
    ctx.stroke();

    if (isFull) {
      ctx.beginPath();
      ctx.arc(mx, my, R + 6, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 211, 107, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // 3. EMP Ready Pip (Cyan diamond right below reticle)
  var empCostPip = (p && typeof p.empCost === 'number') ? p.empCost : 50;
  if (p && (p.energy || 0) >= empCostPip) {
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.moveTo(mx, my + R + 6);
    ctx.lineTo(mx + 3.5, my + R + 9.5);
    ctx.lineTo(mx, my + R + 13);
    ctx.lineTo(mx - 3.5, my + R + 9.5);
    ctx.closePath();
    ctx.fill();
  }

  // 4. Three-Tier Hitmarker Flash (45° diagonal X)
  var hmElapsed = (rt.renderTime || 0) - (p.hitmarkerTime || 0);
  if (hmElapsed >= 0 && hmElapsed < 0.12) {
    var hmA = 1 - (hmElapsed / 0.12);
    var hmType = p.hitmarkerType || 1;
    var hmColor = hmType === 3
      ? ('rgba(255, 34, 68, ' + hmA.toFixed(3) + ')')
      : (hmType === 2 ? ('rgba(255, 215, 0, ' + hmA.toFixed(3) + ')') : ('rgba(255, 255, 255, ' + hmA.toFixed(3) + ')'));

    ctx.strokeStyle = hmColor;
    ctx.lineWidth = hmType === 3 ? 2.6 : (hmType === 2 ? 2.0 : 1.5);
    var gap = Math.max(4, R * 0.35);
    var len = 6;

    ctx.beginPath();
    ctx.moveTo(mx - gap - len, my - gap - len);
    ctx.lineTo(mx - gap, my - gap);
    ctx.moveTo(mx + gap, my - gap);
    ctx.lineTo(mx + gap + len, my - gap - len);
    ctx.moveTo(mx - gap - len, my + gap + len);
    ctx.lineTo(mx - gap, my + gap);
    ctx.moveTo(mx + gap, my + gap);
    ctx.lineTo(mx + gap + len, my + gap + len);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBlinkTeleportTelegraphs(ctx) {
  if (!ctx || !rt.state || !rt.state.enemies || rt.state.over) return;
  var cam = rt.camera;
  var enemies = rt.state.enemies;
  for (var i = 0; i < enemies.length; i += 1) {
    var en = enemies[i];
    if (en && en.blinkTelegraph && en.blinkDestLocked && typeof en.blinkDestX === 'number') {
      worldToScreen(en.blinkDestX, en.blinkDestY, cam, _CURSOR_SCREEN_POS);
      var bx = _CURSOR_SCREEN_POS.x;
      var by = _CURSOR_SCREEN_POS.y;
      var pulse = isReducedMotion() ? 1 : (0.7 + 0.3 * Math.sin((rt.renderTime || 0) * 12));

      ctx.save();
      ctx.strokeStyle = 'rgba(157, 78, 221, ' + (pulse * 0.85).toFixed(2) + ')';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.arc(bx, by, 32, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(157, 78, 221, ' + (pulse * 0.25).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(bx, by, 16 * pulse, 0, TAU);
      ctx.fill();

      ctx.font = '700 8.5px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = '#e0aaff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VOID RIFT // INTERCEPTABLE', bx, by - 40);
      ctx.restore();
    }
  }
}

export function drawOverlay(ctx) {
  if (!rt.state.over) {
    drawLowHpVignette(ctx);
    drawBlinkTeleportTelegraphs(ctx);
    drawTacticalCursorReticle(ctx);
  }
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

export function drawHpBar(ctx, x, y, w, ratio, ghostRatio) {
  if (!(w > 0)) return;
  var left = Math.round(x - w * 0.5);
  var top = Math.round(y);
  var barH = 6;
  var pad = 2;

  // 1. 2px 深黑底槽襯底 (rgba(4, 4, 6, 0.96))
  ctx.fillStyle = 'rgba(4, 4, 6, 0.96)';
  ctx.fillRect(left - pad, top - pad, w + pad * 2, barH + pad * 2);

  // 2. 底槽背景色
  ctx.fillStyle = '#1c1712';
  ctx.fillRect(left, top, w, barH);

  // 3. 受擊滯後白條（Damage Ghost Bar）：扣血瞬間保留 0.22 秒亮白/黃色滯後殘影
  var curRatio = clamp(ratio, 0, 1);
  var gRatio = ghostRatio != null ? clamp(ghostRatio, 0, 1) : curRatio;
  if (gRatio > curRatio) {
    ctx.fillStyle = 'rgba(255, 244, 210, 0.92)';
    ctx.fillRect(left, top, w * gRatio, barH);
  }

  // 4. 當前血條 (高反差血條)
  ctx.fillStyle = PALETTE.hud.rust;
  ctx.fillRect(left, top, Math.max(0, w * curRatio), barH);

  // 5. 刻度垂直黑線標記 25%、50%、75% 分段
  ctx.fillStyle = '#000000';
  ctx.fillRect(left + Math.round(w * 0.25) - 0.75, top, 1.5, barH);
  ctx.fillRect(left + Math.round(w * 0.50) - 0.75, top, 1.5, barH);
  ctx.fillRect(left + Math.round(w * 0.75) - 0.75, top, 1.5, barH);
}

export function updateEntityGhostHp(e, dt) {
  if (!e) return 1;
  if (!e.fx || typeof e.fx !== 'object') e.fx = {};
  var fx = e.fx;
  var curHp = e.hp || 0;
  var maxHp = e.maxHp || 1;
  if (fx.ghostHp == null) {
    fx.ghostHp = curHp;
    fx.ghostTimer = 0;
  }
  if (curHp < fx.ghostHp) {
    if (fx.ghostTimer == null || fx.ghostTimer <= 0) {
      fx.ghostTimer = 0.22; // 0.22s 亮白/黃色滯後殘影
    } else {
      fx.ghostTimer -= dt;
      if (fx.ghostTimer <= 0) {
        fx.ghostHp += (curHp - fx.ghostHp) * Math.min(1, dt * 10);
      }
    }
  } else {
    fx.ghostHp = curHp;
    fx.ghostTimer = 0;
  }
  return fx.ghostHp / maxHp;
}

export function drawOverheadBars(ctx) {
  if (!ctx || !rt.state) return;
  var dt = rt.renderDt || 0.016;
  var list = rt.state.enemies;
  var i;
  if (list) {
    for (i = 0; i < list.length; i += 1) {
      var e = list[i];
      if (!(e.maxHp > 0) || !(e.hp < e.maxHp)) continue;
      var gRatio = updateEntityGhostHp(e, dt);
      drawHpBar(ctx, e.x, e.y - e.r - 12, Math.max(18, e.r * 2), e.hp / e.maxHp, gRatio);
    }
  }
  var cores = rt.state.volatileCores;
  if (cores) {
    for (i = 0; i < cores.length; i += 1) {
      var c = cores[i];
      if (!(c.maxHp > 0) || !(c.hp < c.maxHp)) continue;
      var gRatioC = updateEntityGhostHp(c, dt);
      drawHpBar(ctx, c.x, c.y - c.r * 1.3 - 10, c.r * 2.4, c.hp / c.maxHp, gRatioC);
    }
  }
  var barrels = rt.state.barrels;
  if (barrels) {
    for (i = 0; i < barrels.length; i += 1) {
      var b = barrels[i];
      if (!(b.maxHp > 0) || !(b.hp < b.maxHp)) continue;
      var gRatioB = updateEntityGhostHp(b, dt);
      drawHpBar(ctx, b.x, b.y - b.r - 10, b.r * 2, b.hp / b.maxHp, gRatioB);
    }
  }
}

var FONT_NUM = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
var FONT_CRIT = '700 18px ui-monospace, SFMono-Regular, Consolas, monospace';

// 0-GC Preallocated Pools and Buckets for Damage Numbers Batching
var NORMAL_LIST = [];
var CRIT_LIST = [];
var NUM_POOL = [];
var POOL_MAX = 128;
for (var np = 0; np < POOL_MAX; np += 1) {
  NUM_POOL[np] = { x: 0, y: 0, alpha: 1, label: '', textColor: '#ffffff', popScale: 1 };
}

export function renderDamageNumbers(ctx, numbers, numMax) {
  if (!ctx) return;
  drawOverheadBars(ctx);

  if (!numbers) return;
  var maxN = numMax || numbers.length;
  if (!maxN) return;

  var reduced = isReducedMotion();
  NORMAL_LIST.length = 0;
  CRIT_LIST.length = 0;
  var poolIdx = 0;
  var i;

  for (i = 0; i < maxN; i += 1) {
    var n = numbers[i];
    if (!n || !n.active) continue;
    var alpha = n.maxLife ? n.life / n.maxLife : 1;
    if (alpha <= 0) continue;
    if (alpha > 1) alpha = 1;

    var label = n.text;
    if (!label) {
      var v = Math.round(n.value);
      if (v < 0) v = 0;
      if (v > 99999) v = 99999;
      label = n.crit ? ('CRIT ' + v) : String(v);
      n.text = label;
    }

    var isCrit = Boolean(n.crit);
    var popScale = 1;
    if (isCrit && !reduced) {
      var alive = (n.maxLife || 0.68) - n.life;
      if (alive < 0.08) {
        popScale = 1 + 0.25 * (1 - alive / 0.08);
      }
    }

    var textColor = '#ffffff';
    if (n.owner && (n.owner === (rt.state && rt.state.player) || n.owner.isPlayer || n.isPlayerHurt)) {
      textColor = '#ff2233';
    } else if (isCrit) {
      textColor = '#ffd700';
    }

    if (poolIdx >= NUM_POOL.length) {
      NUM_POOL.push({ x: 0, y: 0, alpha: 1, label: '', textColor: '#ffffff', popScale: 1 });
    }
    var item = NUM_POOL[poolIdx];
    poolIdx += 1;
    item.x = n.x;
    item.y = n.y;
    item.alpha = alpha;
    item.label = label;
    item.textColor = textColor;
    item.popScale = popScale;

    if (isCrit) {
      CRIT_LIST.push(item);
    } else {
      NORMAL_LIST.push(item);
    }
  }

  if (NORMAL_LIST.length === 0 && CRIT_LIST.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4.5;

  // 1. Normal Group Batch (13px Font set once)
  if (NORMAL_LIST.length > 0) {
    ctx.font = FONT_NUM;
    ctx.strokeStyle = '#000000';
    for (i = 0; i < NORMAL_LIST.length; i += 1) {
      var norm = NORMAL_LIST[i];
      ctx.globalAlpha = norm.alpha;
      ctx.strokeText(norm.label, norm.x, norm.y);
    }
    for (i = 0; i < NORMAL_LIST.length; i += 1) {
      var normF = NORMAL_LIST[i];
      ctx.globalAlpha = normF.alpha;
      ctx.fillStyle = normF.textColor;
      ctx.fillText(normF.label, normF.x, normF.y);
    }
  }

  // 2. Crit Group Batch (18px Font set once)
  if (CRIT_LIST.length > 0) {
    ctx.font = FONT_CRIT;
    ctx.strokeStyle = '#000000';
    for (i = 0; i < CRIT_LIST.length; i += 1) {
      var crt = CRIT_LIST[i];
      ctx.globalAlpha = crt.alpha;
      if (crt.popScale !== 1) {
        ctx.save();
        ctx.translate(crt.x, crt.y);
        ctx.scale(crt.popScale, crt.popScale);
        ctx.strokeText(crt.label, 0, 0);
        ctx.restore();
      } else {
        ctx.strokeText(crt.label, crt.x, crt.y);
      }
    }
    for (i = 0; i < CRIT_LIST.length; i += 1) {
      var crtF = CRIT_LIST[i];
      ctx.globalAlpha = crtF.alpha;
      ctx.fillStyle = crtF.textColor;
      if (crtF.popScale !== 1) {
        ctx.save();
        ctx.translate(crtF.x, crtF.y);
        ctx.scale(crtF.popScale, crtF.popScale);
        ctx.fillText(crtF.label, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(crtF.label, crtF.x, crtF.y);
      }
    }
  }

  ctx.restore();
}


var _CHEVRON_SCREEN_POS = { x: 0, y: 0 };
var _CHEVRON_INTERSECT = { x: 0, y: 0, angle: 0 };

function computeEdgeIntersection(worldX, worldY, cam, viewW, viewH, margin, out) {
  worldToScreen(worldX, worldY, cam, _CHEVRON_SCREEN_POS);
  var sx = _CHEVRON_SCREEN_POS.x;
  var sy = _CHEVRON_SCREEN_POS.y;

  var minX = margin;
  var maxX = viewW - margin;
  var minY = margin;
  var maxY = viewH - margin;

  // If target is inside screen bounds, no offscreen chevron needed
  if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
    return null;
  }

  var cx = viewW * 0.5;
  var cy = viewH * 0.5;
  var vx = sx - cx;
  var vy = sy - cy;

  var tx = 1e9;
  if (vx > 0.0001) tx = (maxX - cx) / vx;
  else if (vx < -0.0001) tx = (minX - cx) / vx;

  var ty = 1e9;
  if (vy > 0.0001) ty = (maxY - cy) / vy;
  else if (vy < -0.0001) ty = (minY - cy) / vy;

  var t = Math.min(tx, ty);
  if (t < 0 || t >= 1e8) return null;

  out.x = cx + vx * t;
  out.y = cy + vy * t;
  out.angle = Math.atan2(vy, vx);
  return out;
}

export function drawOffscreenChevrons(ctx) {
  if (!ctx || !rt.state || !rt.state.player || !rt.ui) return;
  if (rt.state.over) return;
  if (rt.ui.startScreen && !rt.ui.startScreen.hidden) return;

  var p = rt.state.player;
  var cam = rt.camera;
  var viewW = rt.ui.width || 960;
  var viewH = rt.ui.height || 640;
  var margin = 24;

  ctx.save();

  // 1. Boss Indicators (猩紅箭頭附距離數字) - Priority P0
  var boss = rt.state.boss;
  if (boss && boss.hp > 0) {
    var bRes = computeEdgeIntersection(boss.x, boss.y, cam, viewW, viewH, margin, _CHEVRON_INTERSECT);
    if (bRes) {
      var bDistM = Math.round(Math.hypot(boss.x - p.x, boss.y - p.y) / 16);
      ctx.save();
      ctx.translate(bRes.x, bRes.y);
      ctx.rotate(bRes.angle);

      // 猩紅雙尖角 (Double Chevron)
      ctx.fillStyle = '#ff4d2e';
      ctx.beginPath();
      ctx.moveTo(4, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath();
      ctx.moveTo(12, 0); ctx.lineTo(2, -6); ctx.lineTo(5, 0); ctx.lineTo(2, 6); ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 距離數字
      ctx.font = '700 9px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = '#ff4d2e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var bxOffset = clamp(bRes.x - Math.cos(bRes.angle) * 15, 36, viewW - 36);
      var byOffset = clamp(bRes.y - Math.sin(bRes.angle) * 15, 18, viewH - 18);
      ctx.fillText((boss.name ? boss.name.toUpperCase() : 'BOSS') + ' ' + bDistM + 'm', bxOffset, byOffset);
    }
  }

  // 2. Key POI Indicators (SPIRE threat chevrons) - Priority P1
  var spires = rt.state.spires;
  if (spires && spires.length > 0) {
    var lowHull = p && p.maxHp > 0 && (p.hp / p.maxHp) <= 0.35;
    for (var si = 0; si < spires.length; si += 1) {
      var sp = spires[si];
      var sRes = computeEdgeIntersection(sp.x, sp.y, cam, viewW, viewH, margin, _CHEVRON_INTERSECT);
      if (sRes) {
        var sDistPx = Math.hypot(sp.x - p.x, sp.y - p.y);
        var sDistM = Math.round(sDistPx / 16);
        var resonating = (sp.resonanceTimer || 0) > 0;
        var hot = resonating || lowHull || sDistPx < 720;
        var col = hot ? '#ffb020' : '#00e5a3';
        var scale = hot ? 1.45 : 1;
        ctx.save();
        ctx.translate(sRes.x, sRes.y);
        ctx.rotate(sRes.angle);
        ctx.scale(scale, scale);
        // Double chevron when dangerous so direction still reads at low HP / haze.
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(-4, -6.5); ctx.lineTo(-1.5, 0); ctx.lineTo(-4, 6.5); ctx.closePath();
        ctx.fill();
        if (hot) {
          ctx.beginPath();
          ctx.moveTo(16, 0); ctx.lineTo(3, -6.5); ctx.lineTo(5.5, 0); ctx.lineTo(3, 6.5); ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        ctx.font = hot ? '800 10px ui-monospace, SFMono-Regular, Consolas, monospace' : '700 8.5px ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var sxOffset = clamp(sRes.x - Math.cos(sRes.angle) * (hot ? 20 : 14), 36, viewW - 36);
        var syOffset = clamp(sRes.y - Math.sin(sRes.angle) * (hot ? 20 : 14), 18, viewH - 18);
        var label = (resonating ? 'SPIRE!' : 'SPIRE') + ' ' + sDistM + 'm';
        // Tiny plate behind label when hot so sand/haze cannot wash it out.
        if (hot) {
          var tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(10, 8, 4, 0.72)';
          ctx.fillRect(sxOffset - tw * 0.5 - 4, syOffset - 7, tw + 8, 14);
          ctx.fillStyle = col;
        }
        ctx.fillText(label, sxOffset, syOffset);
      }
    }
  }

  // 3. Elite Enemy Indicators (菁英橙色箭頭) - Priority P1
  var enemies = rt.state.enemies;
  if (enemies && enemies.length > 0) {
    var eliteCount = 0;
    for (var ei = 0; ei < enemies.length && eliteCount < 4; ei += 1) {
      var en = enemies[ei];
      if (en.elite && en.hp > 0) {
        var eDist = Math.hypot(en.x - p.x, en.y - p.y);
        if (eDist <= 1600) {
          var eRes = computeEdgeIntersection(en.x, en.y, cam, viewW, viewH, margin, _CHEVRON_INTERSECT);
          if (eRes) {
            eliteCount += 1;
            var eDistM = Math.round(eDist / 16);
            ctx.save();
            ctx.translate(eRes.x, eRes.y);
            ctx.rotate(eRes.angle);

            // 橙色箭頭
            ctx.fillStyle = '#ff9800';
            ctx.beginPath();
            ctx.moveTo(7, 0); ctx.lineTo(-3, -4.5); ctx.lineTo(-1, 0); ctx.lineTo(-3, 4.5); ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.font = '700 8px ui-monospace, SFMono-Regular, Consolas, monospace';
            ctx.fillStyle = '#ff9800';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            var exOffset = clamp(eRes.x - Math.cos(eRes.angle) * 13, 28, viewW - 28);
            var eyOffset = clamp(eRes.y - Math.sin(eRes.angle) * 13, 18, viewH - 18);
            ctx.fillText(eDistM + 'm', exOffset, eyOffset);
          }
        }
      }
    }
  }

  ctx.restore();
}

export function drawTacticalMinimap(ctx) {
  if (!ctx || !rt.state || !rt.ui) return;
  if (rt.ui.startScreen && !rt.ui.startScreen.hidden) return;

  var viewW = rt.ui.width || 960;
  var viewH = rt.ui.height || 640;
  var cam = rt.camera;
  var worldW = (cam && cam.worldW) || 3520;
  var worldH = (cam && cam.worldH) || 2640;

  var mapW = 128;
  var mapH = 96; // 128 * (2640 / 3520) = 96 (exact 4:3 aspect ratio)
  var mapX = viewW - mapW - 16;
  var mapY = 16;

  ctx.save();

  // Background and Tactical Frame
  ctx.fillStyle = 'rgba(12, 10, 8, 0.82)';
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mapX, mapY, mapW, mapH);

  // Inner Tactical Crosshair
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mapX + mapW * 0.5, mapY);
  ctx.lineTo(mapX + mapW * 0.5, mapY + mapH);
  ctx.moveTo(mapX, mapY + mapH * 0.5);
  ctx.lineTo(mapX + mapW, mapY + mapH * 0.5);
  ctx.stroke();

  var sx = mapW / worldW;
  var sy = mapH / worldH;

  // 4 桶批次繪製 (Batched 4-Bucket Zero-GC Pipeline)

  // 桶 1: 白框視口 (Camera Viewport Frame)
  var camX = cam ? (cam.clampedX !== undefined ? cam.clampedX : cam.x) : viewW * 0.5;
  var camY = cam ? (cam.clampedY !== undefined ? cam.clampedY : cam.y) : viewH * 0.5;
  var cViewW = cam ? cam.viewW : viewW;
  var cViewH = cam ? cam.viewH : viewH;
  // The view can extend past the world edge; keep the frame inside the map.
  var vx = clamp((camX - cViewW * 0.5) * sx, 0, mapW);
  var vy = clamp((camY - cViewH * 0.5) * sy, 0, mapH);
  var vw = clamp((camX + cViewW * 0.5) * sx, 0, mapW) - vx;
  var vh = clamp((camY + cViewH * 0.5) * sy, 0, mapH) - vy;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX + vx, mapY + vy, vw, vh);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(mapX + vx, mapY + vy, vw, vh);

  // 桶 2: 紅點敵怪 (Hostile Entities - Single Batch Fill)
  var enemies = rt.state.enemies;
  if (enemies && enemies.length > 0) {
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    for (var i = 0; i < enemies.length; i += 1) {
      var en = enemies[i];
      if (en.hp > 0 && !en.isBoss && !en.elite) {
        ctx.rect(mapX + en.x * sx - 1, mapY + en.y * sy - 1, 2, 2);
      }
    }
    ctx.fill();
  }

  // 桶 3: 金點 Boss / POI / 菁英怪 (Boss / POI / Elites - Single Batch Fill)
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  if (rt.state.boss && rt.state.boss.hp > 0) {
    var bx = mapX + rt.state.boss.x * sx;
    var by = mapY + rt.state.boss.y * sy;
    ctx.rect(bx - 2.5, by - 2.5, 5, 5);
  }
  if (enemies) {
    for (var j = 0; j < enemies.length; j += 1) {
      var el = enemies[j];
      if (el.elite && el.hp > 0) {
        ctx.rect(mapX + el.x * sx - 1.5, mapY + el.y * sy - 1.5, 3.5, 3.5);
      }
    }
  }
  if (rt.state.spires) {
    for (var k = 0; k < rt.state.spires.length; k += 1) {
      var sp = rt.state.spires[k];
      ctx.rect(mapX + sp.x * sx - 2, mapY + sp.y * sy - 2, 4, 4);
    }
  }
  ctx.fill();

  // 桶 3.5: 風暴晶核 (Storm Core - 青金高亮點 / 菱形)
  var mOrbs = rt.state.orbs;
  if (mOrbs && mOrbs.length > 0) {
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    for (var moi = 0; moi < mOrbs.length; moi += 1) {
      var mOrb = mOrbs[moi];
      if (mOrb && mOrb.kind === 'storm_core') {
        var ox = mapX + mOrb.x * sx;
        var oy = mapY + mOrb.y * sy;
        ctx.rect(ox - 2, oy - 2, 4, 4);
      }
    }
    ctx.fill();
  }

  // 桶 4: 綠點玩家 (Player Position & Heading Notch)
  var p = rt.state.player;
  if (p) {
    var px = mapX + p.x * sx;
    var py = mapY + p.y * sy;
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(p.aim || 0) * 5, py + Math.sin(p.aim || 0) * 5);
    ctx.stroke();
  }

  // Header label sits above the frame so the viewport box never crosses it.
  ctx.font = '700 8px ui-monospace, SFMono-Regular, Consolas, "PingFang TC", "Microsoft JhengHei", monospace';
  ctx.fillStyle = 'rgba(212, 175, 55, 0.75)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(isChinese() ? '戰術 // 地圖' : 'TACTICAL // MAP', mapX + mapW, mapY - 3);

  ctx.restore();
}

