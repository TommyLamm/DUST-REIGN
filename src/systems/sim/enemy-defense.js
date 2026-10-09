import { rt } from '../../core/runtime.js';
import { addScore } from '../scoring.js';

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
    e.kind === 'dreadnought' || e.kind === 'sovereign' ||
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
  var n = 0;
  var i;
  for (i = 0; i < refs.length; i += 1) {
    var t = refs[i];
    if (t && t.hp > 0 && list.indexOf(t) !== -1) n += 1;
  }
  return n;
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
  if (e.kind === 'burrower' && e.burrowed) e.forceEmerge = true;
}

export function filterEnemyDamage(e, amount, info) {
  var left = Number(amount);
  if (!e || !(left > 0)) return left > 0 ? left : 0;
  info = info || {};
  if (e.kind === 'burrower' && e.burrowed && !e.forceEmerge) return 0;
  if (e.kind === 'sovereign' && refreshSovereignShield(e)) return 0;
  if (e.kind === 'stormTower' && (info.source === 'emp' || info.source === 'spire')) left *= 3;
  if (e.shieldHp > 0) {
    var absorb = e.shieldHp < left ? e.shieldHp : left;
    e.shieldHp -= absorb;
    left -= absorb;
    if (e.shieldHp <= 0) clearEnemyShields(e);
  }
  if (e.kind === 'dreadnought' && info.source === 'bullet' && info.x != null && info.y != null) {
    var hitAng = Math.atan2(info.y - e.y, info.x - e.x);
    var rear = (e.aim || 0) + Math.PI;
    if (Math.abs(angDiff(hitAng, rear)) <= Math.PI / 3) left *= (e.empTimer > 0 ? 2 : 1.5);
  }
  if (e.kind === 'dreadnought' && info.source === 'barrel' && e.empTimer > 0) left *= 2;
  rememberDeath(e, info, left);
  return left;
}
