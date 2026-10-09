import { rt } from '../core/runtime.js';
import { noteMetaEvent } from './meta.js';
import { addScore } from './scoring.js';

function contract() {
  var c = rt.state && rt.state.contract;
  if (!c || typeof c !== 'object' || !c.id || c.done) return null;
  return c;
}

function finish(c) {
  if (!c || c.done) return;
  c.done = true;
  c.failed = false;
  c.progress = c.goal;
  if (rt.state.stats) rt.state.stats.contractsCompleted = (rt.state.stats.contractsCompleted || 0) + 1;
  noteMetaEvent('contract', {
    id: c.id,
    wave: rt.state.wave || 1,
    reward: c.reward || null
  });
  var reward = c.reward || {};
  if (reward.type === 'reroll') {
    rt.state.rerolls = (rt.state.rerolls || 0) + (reward.amount || 1);
  } else if (reward.type === 'repair') {
    var p = rt.state.player;
    var amount = reward.amount || 25;
    if (!p || p.hp >= p.maxHp) addScore(150, 'contract');
    else p.hp = Math.min(p.maxHp, p.hp + amount);
  } else {
    var score = reward.amount || (300 * (rt.state.act || 1));
    addScore(score, 'contract');
  }
  rt.state.banner = Math.max(rt.state.banner || 0, 1.8);
  rt.state.bannerText = 'CONTRACT SEALED // ' + (reward.label || c.name || c.id);
}

function bump(c, amount) {
  if (!c || c.done) return;
  c.progress += amount;
  if (c.progress >= c.goal) finish(c);
}

function killBase(info) {
  if (!info || info.isBoss) return 0;
  if (info.elite || info.kind === 'elite') return 180;
  if (info.kind === 'brute') return 90;
  if (info.kind === 'artillery') return 60;
  if (info.kind === 'rusher') return 35;
  return 20;
}

function swarmBonus(info) {
  var mult = rt.state.mutator && rt.state.mutator.killScoreMult;
  if (!(mult > 1) || !info || info.isBoss) return;
  var base = killBase(info);
  if (!(base > 0)) return;
  var combo = rt.state.combo || 1;
  var awarded = Math.round(base * (1 + (combo - 1) * 0.25));
  var extra = Math.round(awarded * (mult - 1));
  if (extra > 0) addScore(extra, 'kill');
}

export function noteContractEvent(kind, data) {
  if (!rt.state || !kind) return;
  if (kind === 'kill') swarmBonus(data || {});
  var c = contract();
  if (!c) return;
  if (kind === 'kill' && c.id === 'barrel-kills' && data && (data.cause === 'barrel' || data.cause === 'core')) {
    bump(c, 1);
  } else if (kind === 'kill' && c.id === 'elite-hunt' && data && (data.elite || data.kind === 'elite')) {
    bump(c, 1);
  } else if (kind === 'kill' && c.id === 'combo' && (rt.state.combo || 0) >= c.goal) {
    c.progress = c.goal;
    finish(c);
  } else if (kind === 'player-damaged' && c.id === 'no-damage' && data && data.amount > 0) {
    if (c.progress > 0) c.resets = (c.resets || 0) + 1;
    c.progress = 0;
    c.failed = false;
    c._hit = true;
  } else if (kind === 'graze' && c.id === 'graze') {
    bump(c, 1);
  } else if (kind === 'just-dash' && c.id === 'just-dash') {
    bump(c, 1);
  } else if (kind === 'spire-chain' && c.id === 'spire-chain' && data) {
    var hits = data.hits || 0;
    if (hits > (c.progress || 0)) c.progress = hits;
    if (c.progress >= c.goal) finish(c);
  }
}

export function stepContracts(frame) {
  if (!rt.state || rt.state.over || rt.state.interlude) return;
  var c = contract();
  if (!c || c.id !== 'no-damage') return;
  if (c._hit) {
    c._hit = false;
    return;
  }
  var dt = rt.state.simDt;
  if (!(dt > 0)) return;
  if (dt > 0.05) dt = 0.05;
  bump(c, dt);
}
