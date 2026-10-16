// Quantum Ghost Replay & Split-Timer Renderer
// Renders 0.38 alpha cyan holographic mecha & Trackmania-style split-timer HUD

import { rt } from '../core/runtime.js';
import { currentGhostPlayback } from '../systems/ghost.js';
import { drawGlow } from './sprites.js';
import { isChinese } from '../core/i18n.js';

var TAU = Math.PI * 2;

function ghostHullPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r * 0.68, 0);
  ctx.lineTo(r * 0.28, r * 0.52);
  ctx.lineTo(-r * 0.48, r * 0.46);
  ctx.lineTo(-r * 0.68, r * 0.24);
  ctx.lineTo(-r * 0.68, -r * 0.24);
  ctx.lineTo(-r * 0.48, -r * 0.46);
  ctx.lineTo(r * 0.28, -r * 0.52);
  ctx.closePath();
}

export function drawGhostMecha(ctx) {
  if (!currentGhostPlayback || !ctx) return;
  var ghost = currentGhostPlayback.currentGhostState;
  if (!ghost || ghost.finished) return;

  var r = 15;
  ctx.save();
  ctx.translate(ghost.x, ghost.y);
  ctx.rotate(ghost.aim || 0);

  // 1. Quantum Holographic Ghost Silhouette (0.38 alpha cyan)
  ctx.globalAlpha = 0.38;

  // Translucent body fill
  ghostHullPath(ctx, r);
  ctx.fillStyle = 'rgba(0, 243, 255, 0.22)';
  ctx.fill();

  // Vibrant neon cyan wireframe outline
  ctx.strokeStyle = '#00f3ff';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Quantum cockpit diamond
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(r * 0.4, 0);
  ctx.lineTo(r * 0.1, r * 0.2);
  ctx.lineTo(-r * 0.1, 0);
  ctx.lineTo(r * 0.1, -r * 0.2);
  ctx.closePath();
  ctx.fill();

  // Quantum weapon trace
  ctx.strokeStyle = '#00f3ff';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(r * 0.2, -4);
  ctx.lineTo(r + 16, -4);
  ctx.moveTo(r * 0.2, 4);
  ctx.lineTo(r + 16, 4);
  ctx.stroke();

  // Thruster jet
  ctx.fillStyle = '#00f3ff';
  ctx.beginPath();
  ctx.moveTo(-r * 0.68, -r * 0.18);
  ctx.lineTo(-r * 0.68 - 14, 0);
  ctx.lineTo(-r * 0.68, r * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Holographic light glow
  drawGlow(ctx, ghost.x, ghost.y, 24, '#00f3ff', 0.25);
}

function formatTime(sec) {
  var s = Math.max(0, Number(sec) || 0);
  var mins = Math.floor(s / 60);
  var secs = s % 60;
  var mStr = mins < 10 ? '0' + mins : String(mins);
  var sStr = secs < 10 ? '0' + secs.toFixed(2) : secs.toFixed(2);
  return mStr + ':' + sStr;
}

export function drawGhostSplitTimer(ctx) {
  if (!currentGhostPlayback || !ctx || !rt.ui) return;
  var ghost = currentGhostPlayback.currentGhostState;
  if (!ghost) return;

  var pbTime = currentGhostPlayback.clearTime || 0;
  if (pbTime <= 0) return;

  var zh = isChinese();
  var isAhead = ghost.isAhead;
  var splitSec = Math.abs(ghost.splitTime || 0);
  var sign = isAhead ? '▲ -' : '▼ +';
  var statusText = isAhead ? (zh ? '領先' : 'AHEAD') : (zh ? '落後' : 'BEHIND');
  var splitColor = isAhead ? '#00ff88' : '#ff4433';

  var boxW = 210;
  var boxH = 42;
  var boxX = (rt.ui.width - boxW) / 2;
  var boxY = 14;

  ctx.save();

  // Cyber background card
  ctx.fillStyle = 'rgba(10, 14, 18, 0.88)';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  // Border with dynamic color accent
  ctx.strokeStyle = splitColor;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Left indicator accent bar
  ctx.fillStyle = splitColor;
  ctx.fillRect(boxX, boxY, 4, boxH);

  // Header line: STAGE PB RECORD
  ctx.font = '900 10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#9fd9cc';
  var title = (zh ? '個人最佳 PB // ' : 'PB RECORD // ') + formatTime(pbTime);
  ctx.fillText(title, boxX + 12, boxY + 7);

  // Main Split Time line
  ctx.font = '900 15px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.fillStyle = splitColor;
  var timeStr = sign + splitSec.toFixed(2) + 's [' + statusText + ']';
  ctx.fillText(timeStr, boxX + 12, boxY + 20);

  // Overtake Flash celebration
  if (ghost.paceFlash > 0) {
    ghost.paceFlash -= rt.renderDt || 0.016;
    ctx.fillStyle = 'rgba(0, 255, 136, 0.25)';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = '#00ff88';
    ctx.font = '900 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ NEW BEST PACE! ⚡', rt.ui.width / 2, boxY + boxH + 6);
  }

  ctx.restore();
}
