import { AudioFX } from '../../audio/audio-fx.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { rt } from '../../core/runtime.js';
import { addScore } from '../scoring.js';
import { filterEnemyStrategyDamage } from './enemy-registry.js';
import { onShieldBreak } from '../card-effects.js';
import { spawnCombatText } from '../../render/fx.js';
import { spawnParticles } from '../../core/pools.js';

function angDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function deathQueue() {
  if (!rt.state) return null;
  if (!rt.state.deathQueue) rt.state.deathQueue = [];
  return rt.state.deathQueue;
}

function hasAffix(e, id) {
  return !!e && (e.affix === id || e.affix2 === id);
}

function rememberDeath(e, info, amount) {
  if (!e || e.deathQueued || !(e.hp > 0) || e.hp - amount > 0) return;
  var interesting = e.kind === 'scurrier' || e.kind === 'warden' || e.kind === 'mine' ||
    e.kind === 'dreadnought' || e.kind === 'sovereign' || e.kind === 'behemoth' ||
    hasAffix(e, 'volatile') || hasAffix(e, 'splitter');
  if (!interesting) return;
  var q = deathQueue();
  if (!q) return;
  e.deathQueued = true;
  if (e.kind === 'dreadnought' && e.mode === 'stun') addScore(100, 'style');
  q.push({
    ref: e,
    kind: e.kind,
    x: e.x,
    y: e.y,
    affix: e.affix || null,
    affix2: e.affix2 || null,
    isBoss: !!e.isBoss,
    cause: (info && info.source) || '',
    arming: !!e.arming,
    maxHp: e.maxHp || e.hp,
    speed: e.speed || 0,
    damage: e.damage || 0,
    color: e.color || '#75d1b0',
    noDrop: !!e.noDrop,
    score: e.score || 0
  });
}

export function takeDeathEvents() {
  var q = deathQueue();
  if (!q || !q.length) return [];
  var out = q.slice();
  q.length = 0;
  return out;
}

export function clearEnemyShields(e) {
  if (!e) return;
  e.shieldHp = 0;
  e.shieldTimer = 0;
  e.shieldOwner = null;
  if (!e.isBoss) e.knockbackImmune = false;
}

export function clearShieldsOwnedBy(owner) {
  var list = rt.state && rt.state.enemies;
  if (!owner || !list) return;
  var i;
  for (i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].shieldOwner === owner) clearEnemyShields(list[i]);
  }
}

function livingTowers(e) {
  var refs = e && e.towerRefs;
  var list = rt.state && rt.state.enemies;
  if (!refs || !list) return 0;
  return refs.filter(function (t) { return t && t.hp > 0 && list.indexOf(t) !== -1; }).length;
}

export function refreshSovereignShield(e) {
  if (!e || e.kind !== 'sovereign') return false;
  var up = livingTowers(e) >= 2;
  e.shielded = up;
  return up;
}

// EMP, spire resonance, and static tempest should call this when they connect.
// stepNewEnemy also polls empTimer so shields drop even before that wire-up.
export function onEnemyEmp(e) {
  if (!e) return;
  clearEnemyShields(e);
  if (e.kind === 'warden') clearShieldsOwnedBy(e);
  if (e.kind === 'elite' && (e.affix === 'mirror' || e.affix2 === 'mirror')) {
    e.shieldBrokenTimer = Math.max(e.shieldBrokenTimer || 0, 3.5);
    onShieldBreak(e, { x: e.x, y: e.y, source: 'mirror_break' });
  }
  if (e.kind === 'bulwark') {
    e.shieldHp = 0;
    e.shieldBroken = true;
    e.shieldBreakTimer = 4.0;
  }
  if (e.kind === 'burrower' && e.burrowed) e.forceEmerge = true;
}

export function filterEnemyDamage(e, amount, info) {
  var left = Number(amount);
  if (!e || !(left > 0)) return left > 0 ? left : 0;
  info = info || {};

  var custom = filterEnemyStrategyDamage(e, left, info);
  if (custom !== null && custom !== undefined) {
    left = custom;
    if (left <= 0) return 0;
  }

  if (e.defenseAuraTimer > 0) left *= (1 - (e.damageMitigation || 0.35));
  if (e.armorBreakTimer > 0) left *= 1.4;
  if (e.concussionTimer > 0) left *= 1.35;
  if (e.commandChanneling) {
    e.commandDamageTaken = (e.commandDamageTaken || 0) + left;
    var cmdThreshold = (e.maxHp || e.hp || 100) * 0.18;
    if (e.commandDamageTaken >= cmdThreshold || (info && (info.isCounter || info.counter)) || e.empTimer > 0) {
      e.commandChanneling = false;
      e.commandTimer = 4.5;
      e.commandDamageTaken = 0;
      e.hp = Math.max(1, e.hp - 45);
      e.staggerTimer = Math.max(e.staggerTimer || 0, 2.0);
      spawnCombatText(e.x, e.y - 14, 'WAR-CRY INTERRUPT!', true);
      if (AudioFX && typeof AudioFX.shieldShatter === 'function') AudioFX.shieldShatter();
      pushFxEvent('burst', e.x, e.y, { preset: 'emp', tint: '#f59e0b', scale: 0.9 });
      spawnParticles(e.x, e.y, '#f59e0b', 16, 160, 3);
    }
  }
  if (e.blinkTelegraph && e.blinkDestLocked) {
    var isHeavyHit = false;
    if (info) {
      if (info.isCounter || info.counter) isHeavyHit = true;
      else if (info.bullet && (info.bullet.isVanguard || info.bullet.isColossus || (info.bullet.pierce !== undefined && info.bullet.pierce >= 2))) isHeavyHit = true;
    }
    if (e.staggerTimer > 0 || isHeavyHit) {
      e.blinkDestLocked = false;
      e.blinkTelegraph = false;
      e.blinkTimer = 3.5;
      e.staggerTimer = Math.max(e.staggerTimer || 0, 1.8);
      spawnCombatText(e.x, e.y - 14, 'BLINK INTERCEPTED!', true);
      if (AudioFX && typeof AudioFX.critHit === 'function') AudioFX.critHit();
      spawnParticles(e.x, e.y, '#75d1b0', 16, 160, 3);
    }
  }
  if (e.kind === 'elite' || e.kind === 'brute' || e.kind === 'bulwark') {
    if (e.maxStaggerHp === undefined) {
      e.maxStaggerHp = Math.round((e.maxHp || e.hp || 100) * 0.35);
    }
    if (e.staggerHp === undefined) {
      e.staggerHp = e.maxStaggerHp;
    }
  }
  if (e.staggerTimer > 0) {
    left *= 1.35;
  } else if (e.maxStaggerHp > 0) {
    var isHeavyOrCounter = false;
    if (info) {
      if (info.isCounter || info.counter) {
        isHeavyOrCounter = true;
      } else if (info.bullet) {
        var b = info.bullet;
        if (b.isVanguard || b.isColossus || (b.pierce !== undefined && b.pierce >= 2) || (b.isBreacher && info.isClose)) {
          isHeavyOrCounter = true;
        }
      }
    }
    var staggerLoss = isHeavyOrCounter ? left * 1.8 : left;
    e.staggerHp -= staggerLoss;
    if (e.staggerHp <= 0) {
      e.staggerTimer = 1.6;
      e.staggerHp = e.maxStaggerHp;
      if (AudioFX && typeof AudioFX.critHit === 'function') AudioFX.critHit();
      pushFxEvent('burst', e.x, e.y, { preset: 'emp', tint: '#f59e0b', scale: 0.8 });
      if (rt.state) {
        rt.state.combo = (rt.state.combo || 0) + 2;
        if (rt.state.stats && rt.state.combo > (rt.state.stats.maxCombo || 0)) {
          rt.state.stats.maxCombo = rt.state.combo;
        }
        rt.state.comboTimer = Math.max(rt.state.comboTimer || 0, 3.5);
        rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.060);
      }
      spawnCombatText(e.x, e.y - 14, 'STAGGER BREAK!', true);
    }
  }
  if (e.shieldHp > 0) {
    var absorb = e.shieldHp < left ? e.shieldHp : left;
    e.shieldHp -= absorb;
    left -= absorb;
    if (e.shieldHp <= 0) {
      clearEnemyShields(e);
      if (rt.state) {
        rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.050);
      }
      pushFxEvent('shieldBreak', e.x, e.y, { kind: e.kind, color: '#5be7ff' });
      if (AudioFX && typeof AudioFX.shieldShatter === 'function') AudioFX.shieldShatter();
      onShieldBreak(e, { x: e.x, y: e.y, source: 'shield_break' });
    }
  }

  rememberDeath(e, info, left);
  return left;
}
