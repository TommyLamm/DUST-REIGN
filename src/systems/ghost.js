// 5Hz Lightweight Ghost Replay Racing Engine
// Delta-compression & Base64 serialization for Campaign & Hardcore Speedruns
// Target size: < 3 KB for 120-second run

import { readGhost, writeGhost } from '../core/meta-store.js';
import { rt } from '../core/runtime.js';
import { clamp } from '../core/utils.js';

var SAMPLE_INTERVAL = 0.20; // 5Hz sampling (every 200ms)

// Bitfield flags for ghost keyframe
export var GHOST_FLAG_FIRING = 1 << 0;
export var GHOST_FLAG_DASHING = 1 << 1;
export var GHOST_FLAG_EMP = 1 << 2;
export var GHOST_FLAG_HIT = 1 << 3;

function uint8ToBase64(u8) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64');
  }
  var binary = '';
  var len = u8.byteLength;
  for (var i = 0; i < len; i += 1) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}

function base64ToUint8(str) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64'));
  }
  var binary = atob(str);
  var len = binary.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeGhostFrames(frames) {
  if (!frames || !frames.length) return '';
  var n = frames.length;
  // Frame 0: 8 bytes [t0 (2), x0 (2), y0 (2), aim0 (1), flags0 (1)]
  // Frame 1..n-1: 3 bytes each [dx (1), dy (1), (aim5 << 3 | flags3) (1)]
  var buf = new Uint8Array(8 + (n - 1) * 3);
  var f0 = frames[0];
  var t0 = Math.round(f0.t * 100);
  buf[0] = (t0 >> 8) & 0xff;
  buf[1] = t0 & 0xff;
  var x0 = Math.round(f0.x);
  buf[2] = (x0 >> 8) & 0xff;
  buf[3] = x0 & 0xff;
  var y0 = Math.round(f0.y);
  buf[4] = (y0 >> 8) & 0xff;
  buf[5] = y0 & 0xff;
  var aim0 = Math.round(((f0.aim % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 255);
  buf[6] = aim0 & 0xff;
  buf[7] = f0.flags & 0x0f;

  var prevX = x0;
  var prevY = y0;
  var offset = 8;
  for (var i = 1; i < n; i += 1) {
    var f = frames[i];
    var curX = Math.round(f.x);
    var curY = Math.round(f.y);
    var dx = Math.max(-128, Math.min(127, curX - prevX));
    var dy = Math.max(-128, Math.min(127, curY - prevY));
    buf[offset] = dx < 0 ? dx + 256 : dx;
    buf[offset + 1] = dy < 0 ? dy + 256 : dy;

    var normAim = (f.aim % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    var aim5 = Math.round((normAim / (2 * Math.PI)) * 31) & 0x1f;
    var fl3 = f.flags & 0x07;
    buf[offset + 2] = (aim5 << 3) | fl3;

    prevX = curX;
    prevY = curY;
    offset += 3;
  }

  return uint8ToBase64(buf);
}

export function decodeGhostFrames(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  if (encoded.charAt(0) === '[') {
    try {
      return JSON.parse(encoded);
    } catch (e) {
      return [];
    }
  }

  var bytes;
  try {
    bytes = base64ToUint8(encoded);
  } catch (e) {
    return [];
  }
  if (!bytes || bytes.length < 8) return [];

  var t0 = ((bytes[0] << 8) | bytes[1]) / 100;
  var curX = (bytes[2] << 8) | bytes[3];
  var curY = (bytes[4] << 8) | bytes[5];
  var aim0 = (bytes[6] / 255) * (2 * Math.PI);
  var flags0 = bytes[7];

  var frames = [{
    t: t0,
    x: curX,
    y: curY,
    aim: Number(aim0.toFixed(2)),
    flags: flags0
  }];

  var offset = 8;
  var frameIdx = 1;
  while (offset + 2 < bytes.length) {
    var rawDx = bytes[offset];
    var dx = rawDx >= 128 ? rawDx - 256 : rawDx;
    var rawDy = bytes[offset + 1];
    var dy = rawDy >= 128 ? rawDy - 256 : rawDy;
    var b2 = bytes[offset + 2];
    var aim5 = (b2 >> 3) & 0x1f;
    var aim = (aim5 / 31) * (2 * Math.PI);
    var flags = b2 & 0x07;

    curX += dx;
    curY += dy;
    var curT = Number((t0 + frameIdx * SAMPLE_INTERVAL).toFixed(2));

    frames.push({
      t: curT,
      x: curX,
      y: curY,
      aim: Number(aim.toFixed(2)),
      flags: flags
    });

    frameIdx += 1;
    offset += 3;
  }

  return frames;
}

export class GhostRecorder {
  constructor(arg1, arg2, arg3) {
    this.frames = [];
    this.elapsed = 0;
    this.lastSampleTime = -1;
    this.active = true;
    if (arg1 === 'campaign' || arg1 === 'hardcore' || arg1 === 'daily' || arg1 === 'standard') {
      this.mode = arg1;
      this.stageId = typeof arg2 === 'string' ? arg2 : 'stage_1_1';
    } else {
      this.stageId = typeof arg1 === 'string' ? arg1 : 'stage_1_1';
      this.mode = typeof arg2 === 'string' ? arg2 : 'campaign';
    }
    var state = (arg3 && typeof arg3 === 'object') ? arg3 : {};
    this.rigId = state.rigId || 'scrapper';
    this.weaponId = state.weaponId || 'standard';
  }


  sample(elapsed, player) {
    if (!this.active || !player) return;
    this.elapsed = elapsed;
    if (elapsed - this.lastSampleTime < SAMPLE_INTERVAL && this.lastSampleTime >= 0) return;
    this.lastSampleTime = elapsed;

    var flags = 0;
    if (player.cooldown > 0) flags |= GHOST_FLAG_FIRING;
    if ((player.dashPulse || 0) > 0 || (player.invulnerable || 0) > 0) flags |= GHOST_FLAG_DASHING;
    if ((player.energy || 0) < 15) flags |= GHOST_FLAG_EMP;
    if ((player.lastHitTimer || 0) > 0) flags |= GHOST_FLAG_HIT;

    this.frames.push({
      t: Number(elapsed.toFixed(2)),
      x: Math.round(player.x),
      y: Math.round(player.y),
      aim: Number((player.aim || 0).toFixed(2)),
      flags: flags
    });
  }

  finish(clearTime) {
    return this.finalize(true, 0, clearTime);
  }

  finalize(isVictory, score, clearTime) {
    this.active = false;
    if (!isVictory || !this.frames.length) return null;
    var duration = typeof clearTime === 'number' ? clearTime : this.elapsed;
    var compressed = encodeGhostFrames(this.frames);
    return {
      v: 1,
      stageId: this.stageId,
      mode: this.mode,
      clearTime: Number(duration.toFixed(2)),
      score: score || 0,
      rigId: this.rigId,
      weaponId: this.weaponId,
      recordedAt: new Date().toISOString(),
      data: compressed,
      compressed: compressed,
      frameCount: this.frames.length
    };
  }
}

export class GhostPlaybackEngine {
  constructor(ghostDataOrString) {
    var rawData = '';
    var clearTime = 0;
    if (typeof ghostDataOrString === 'string') {
      rawData = ghostDataOrString;
      this.header = { data: rawData };
    } else if (ghostDataOrString && typeof ghostDataOrString === 'object') {
      this.header = ghostDataOrString;
      rawData = ghostDataOrString.data || ghostDataOrString.compressed || '';
      clearTime = ghostDataOrString.clearTime || 0;
    } else {
      this.header = {};
    }
    this.frames = decodeGhostFrames(rawData);
    this.hasGhost = (this.frames && this.frames.length > 0);
    this.clearTime = clearTime || (this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0);
    this.currentIndex = 0;
    this.currentGhostState = {
      x: 0,
      y: 0,
      aim: 0,
      isDashing: false,
      isFiring: false,
      isEmp: false,
      finished: false,
      splitTime: 0,
      isAhead: true,
      paceFlash: 0
    };
    this.prevAhead = true;
    if (this.frames.length > 0) {
      this.currentGhostState.x = this.frames[0].x;
      this.currentGhostState.y = this.frames[0].y;
      this.currentGhostState.aim = this.frames[0].aim;
    }
  }

  getGhostAtTime(time) {
    if (!this.frames || !this.frames.length) return null;
    var idx = 0;
    while (idx < this.frames.length - 2 && this.frames[idx + 1].t <= time) {
      idx += 1;
    }
    var f0 = this.frames[idx];
    var f1 = this.frames[idx + 1];
    if (!f1) return { x: f0.x, y: f0.y, aim: f0.aim };
    var span = f1.t - f0.t;
    var factor = span > 0 ? clamp((time - f0.t) / span, 0, 1) : 0;
    return {
      x: f0.x + (f1.x - f0.x) * factor,
      y: f0.y + (f1.y - f0.y) * factor,
      aim: f0.aim + (f1.aim - f0.aim) * factor
    };
  }

  getSplitDiff(playerTime, ghostTime) {
    var raw = playerTime - ghostTime;
    return {
      status: raw > 0 ? 'BEHIND' : 'AHEAD',
      diff: Math.abs(raw),
      raw: raw
    };
  }

  update(currentStageTime) {
    if (!this.frames || !this.frames.length) return null;

    // Advance keyframe index
    while (
      this.currentIndex < this.frames.length - 2 &&
      this.frames[this.currentIndex + 1].t <= currentStageTime
    ) {
      this.currentIndex += 1;
    }

    var f0 = this.frames[this.currentIndex];
    var f1 = this.frames[this.currentIndex + 1];

    if (!f1 || currentStageTime >= this.clearTime) {
      // Reached or surpassed ghost finish
      var last = this.frames[this.frames.length - 1];
      this.currentGhostState.x = last.x;
      this.currentGhostState.y = last.y;
      this.currentGhostState.aim = last.aim;
      this.currentGhostState.isDashing = false;
      this.currentGhostState.isFiring = false;
      this.currentGhostState.finished = true;
      var split = currentStageTime - this.clearTime;
      this.currentGhostState.splitTime = split;
      this.currentGhostState.isAhead = split <= 0;
      return this.currentGhostState;
    }

    // Catmull-Rom / Lerp time factor
    var span = f1.t - f0.t;
    var factor = span > 0 ? clamp((currentStageTime - f0.t) / span, 0, 1) : 0;

    // Linear position interpolation
    this.currentGhostState.x = f0.x + (f1.x - f0.x) * factor;
    this.currentGhostState.y = f0.y + (f1.y - f0.y) * factor;

    // Shortest angular slerp for aim
    var diff = f1.aim - f0.aim;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.currentGhostState.aim = f0.aim + diff * factor;

    // Flags from current frame
    this.currentGhostState.isDashing = (f0.flags & GHOST_FLAG_DASHING) !== 0;
    this.currentGhostState.isFiring = (f0.flags & GHOST_FLAG_FIRING) !== 0;
    this.currentGhostState.isEmp = (f0.flags & GHOST_FLAG_EMP) !== 0;
    this.currentGhostState.finished = false;

    // Trackmania-style Split-Timer:
    // Compare player's elapsed time against ghost progress
    var ghostProgress = clamp(currentStageTime / Math.max(1, this.clearTime), 0, 1);
    var targetGhostTime = ghostProgress * this.clearTime;
    var splitTime = currentStageTime - targetGhostTime;
    this.currentGhostState.splitTime = splitTime;
    var isAhead = splitTime <= 0;

    if (!this.prevAhead && isAhead) {
      this.currentGhostState.paceFlash = 1.8; // Trigger overtake flash
    }
    this.prevAhead = isAhead;
    this.currentGhostState.isAhead = isAhead;

    return this.currentGhostState;
  }
}

// Global active ghost session controllers
export var currentGhostRecorder = null;
export var currentGhostPlayback = null;

export function initGhostForRun(state) {
  currentGhostRecorder = null;
  currentGhostPlayback = null;
  if (!state || (state.mode !== 'campaign' && state.mode !== 'hardcore')) return;

  var stageId = '';
  if (state.mode === 'campaign') {
    stageId = (state.stageConfig && state.stageConfig.id) || 'stage_1_1';
  } else if (state.mode === 'hardcore') {
    stageId = (state.stageConfig && state.stageConfig.id) || 'op_01';
  }
  if (!stageId) return;

  // Start recording 5Hz stream
  currentGhostRecorder = new GhostRecorder(stageId, state.mode, state);

  // Load PB ghost replay if exists
  var saved = readGhost(stageId);
  if (saved && saved.data) {
    currentGhostPlayback = new GhostPlaybackEngine(saved);
  }
}

export function stepGhost(dt) {
  if (!rt.state || rt.state.paused || rt.state.over) return;
  var stageElapsed = rt.state.stageElapsed || 0;
  var player = rt.state.player;

  if (currentGhostRecorder && player) {
    currentGhostRecorder.sample(stageElapsed, player);
  }
  if (currentGhostPlayback) {
    currentGhostPlayback.update(stageElapsed);
  }
}

export function finalizeGhostOnClear(stageId, clearTime, isNewPb) {
  if (!currentGhostRecorder || !isNewPb) return;
  var ghostData = currentGhostRecorder.finish(clearTime);
  if (ghostData) {
    writeGhost(stageId, ghostData);
  }
}
