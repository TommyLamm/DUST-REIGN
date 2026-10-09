import { AudioFX } from '../audio/audio-fx.js';
import { BOUNTY_SURGE_DURATION, COMBO_WINDOW, MAX_COMBO } from '../config.js';
import { addDecal, spawnParticles } from '../core/pools.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../core/settings.js';
import { clamp, dist2 } from '../core/utils.js';
import { triggerReactiveArmor } from './abilities.js';
import { onEnemyHit, onKill, onLethal, onPlayerDamaged } from './card-effects.js';
import { noteContractEvent } from './contracts.js';
import { onBossDefeated } from './director.js';
import { rollDrops } from './drops.js';
import { filterEnemyDamage } from './sim/enemy-defense.js';
import { isStormFront, triggerGameOver } from './flow.js';
import { noteMetaEvent } from './meta.js';
import { addScore } from './scoring.js';
import { logEvent } from '../ui/hud.js';

function playerHitOpts(source) {
  if (source === 'molten') return { light: 1, source: source };
  return source ? { source: source } : null;
}

// Boss payout lives in onBossDefeated. A second kill award double-counts Titan's 800.
function killBaseScore(e) {
  if (!e || e.isBoss) return 0;
  if (typeof e.score === 'number') return e.score;
  if (e.kind === 'elite') return 180;
  if (e.kind === 'brute') return 90;
  if (e.kind === 'artillery') return 60;
  if (e.kind === 'rusher') return 35;
  if (e.kind === 'titan') return 800;
  return 20;
}

function canDropLoot(e) {
  if (!e) return false;
  if (e.splitterChild) return true;
  if (e.noDrop) return false;
  if (e.isBoss && e.kind !== 'titan') return false;
  return true;
}

function shoveEnemy(enemy, dx, dy, dist) {
  if (!enemy || enemy.knockbackImmune) return;
  var kd = Math.hypot(dx, dy) || 1;
  enemy.x += (dx / kd) * dist;
  enemy.y += (dy / kd) * dist;
}

export function damagePlayer(amount, source) {
  if (!rt.state || !rt.state.player || rt.state.over) return 0;
  var p = rt.state.player;
  if (p.invulnerable > 0) return 0;
  var requested = Number(amount);
  if (!(requested > 0)) return 0;
  var mult = (typeof p.damageTakenMult === 'number') ? p.damageTakenMult : 1;
  if (p.fortressProtocol && (p.energy || 0) >= 50) mult *= 0.75;
  var remaining = requested * mult;
  if (!(remaining > 0)) return 0;
  if (p.shield > 0) {
    var absorbed = Math.min(p.shield, remaining);
    p.shield -= absorbed;
    remaining -= absorbed;
  }
  // Ablative mesh never lets a connecting hit land for less than 1.
  if ((p.ablativeStacks || 0) > 0 && remaining > 0 && remaining < 1) remaining = 1;
  if (!(remaining > 0)) return 0;
  rt.state.lastDamageSource = source || '';
  var applied = remaining;
  var saved = false;
  if (p.phoenix && p.hp - remaining <= 0) {
    applied = Math.max(0, p.hp - 1);
    p.hp = 1;
    p.phoenix = false;
    saved = true;
  } else {
    p.hp -= remaining;
  }
  if (isStormFront()) rt.state.stormHurt = true;
  rt.state.waveDamageTaken = (rt.state.waveDamageTaken || 0) + applied;
  var info = { amount: applied, requested: requested, source: source || '', saved: saved };
  onPlayerDamaged(p, info);
  noteContractEvent('player-damaged', info);
  noteMetaEvent('player-damaged', info);
  pushFxEvent('playerHit', p.x, p.y, playerHitOpts(source));
  if (saved || p.hp <= 0) onLethal(p, info);
  if (!saved && p.hp <= 0) triggerGameOver();
  return applied;
}

var BOSS_BLEED_WINDOW = 0.4;
var BOSS_BLEED_FULL = 55;
var BOSS_BLEED_OVERFLOW = 0.25;

function isDurableBoss(e) {
  return !!(e && (e.isBoss || e.kind === 'titan' || e.kind === 'dreadnought' || e.kind === 'sovereign'));
}

// A torrent still hurts, but damage above ~138 DPS in a short window is only 25% effective.
// Stock fire stays inside the window; Rapid Fire + Vulcan no longer erases a phase.
function softenBossHit(e, amount, info) {
  if (!isDurableBoss(e) || !(amount > 0)) return amount;
  if (info && (info.source === 'core' || info.source === 'barrel')) return amount;
  var now = rt.state.waveTime || 0;
  if (typeof e.bossBleedAt !== 'number' || now < e.bossBleedAt || now - e.bossBleedAt > BOSS_BLEED_WINDOW) {
    e.bossBleedAt = now;
    e.bossBleed = 0;
  }
  var room = BOSS_BLEED_FULL - (e.bossBleed || 0);
  var full = 0;
  var rest = amount;
  if (room > 0) {
    full = rest < room ? rest : room;
    rest -= full;
  }
  e.bossBleed = (e.bossBleed || 0) + full;
  return full + rest * BOSS_BLEED_OVERFLOW;
}

export function damageEnemy(e, amount, info) {
  if (!rt.state || !e) return 0;
  var requested = Number(amount);
  if (!(requested > 0)) return 0;
  info = info || {};
  var filtered = filterEnemyDamage(e, requested, info);
  var applied = softenBossHit(e, Number(filtered), info);
  if (!(applied > 0)) return 0;
  e.hp -= applied;
  if (rt.state.stats) rt.state.stats.damageDealt += applied;
  onEnemyHit(e, {
    amount: applied,
    source: info.source || '',
    crit: Boolean(info.crit),
    bullet: info.bullet || null,
    x: info.x,
    y: info.y
  });
  return applied;
}

export function killEnemy(enemyOrIndex, cause) {
  var index;
  var e;
  if (typeof enemyOrIndex === 'number') {
    index = enemyOrIndex;
    e = rt.state.enemies[index];
  } else {
    e = enemyOrIndex;
    index = rt.state.enemies.indexOf(e);
  }
  if (!e || index < 0) return;
  var why = cause || 'other';
  rt.state.enemies.splice(index, 1);
  rt.state.kills += 1;
  if (isStormFront()) rt.state.stormKills = (rt.state.stormKills || 0) + 1;
  var elite = e.kind === 'elite';
  var isTitan = e.kind === 'titan';
  var baseScore = killBaseScore(e);
  rt.state.combo = rt.state.comboTimer > 0 ? Math.min(MAX_COMBO, rt.state.combo + 1) : 1;
  if (rt.state.stats && rt.state.combo > rt.state.stats.maxCombo) {
    rt.state.stats.maxCombo = rt.state.combo;
  }
  rt.state.comboTimer = COMBO_WINDOW;
  if (baseScore > 0) addScore(Math.round(baseScore * (1 + (rt.state.combo - 1) * 0.25)), 'kill');

  if (isTitan) {
    rt.state.shake = Math.max(rt.state.shake, 16);
    rt.state.banner = 4.0;
    rt.state.bannerText = 'TITAN NEUTRALIZED // SECTOR SECURED';
    if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN NEUTRALIZED // SECTOR SECURED';
    logEvent('TITAN NEUTRALIZED // SECTOR SECURED');
    AudioFX.blast();
    triggerHaptic([30, 40, 50, 60, 80]);
    if (!isReducedMotion()) {
      rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.055);
    }
    if (canDropLoot(e)) rollDrops(e);
    addDecal(e.x, e.y, 28, 20, 0.45, '#1b1715');
    spawnParticles(e.x, e.y, '#e69535', 40, 260, 5);
    spawnParticles(e.x, e.y, '#ff4d2e', 25, 200, 4);
    spawnParticles(e.x, e.y, '#ffd27d', 20, 160, 3);
  } else {
    AudioFX.kill(rt.state.combo);
    if (!isReducedMotion()) {
      var freezeDuration = elite ? 0.045 : (e.kind === 'brute' || e.kind === 'artillery') ? 0.025 : rt.state.combo >= 6 ? 0.020 : 0;
      if (freezeDuration > 0) {
        rt.state.hitstop = Math.max(rt.state.hitstop || 0, freezeDuration);
      }
    }
  }
  if (!rt.state.bountyClaimed && rt.state.bountyTarget > 0) {
    rt.state.bountyKills += 1;
    if (rt.state.bountyKills >= rt.state.bountyTarget) {
      rt.state.bountyClaimed = true;
      addScore(rt.state.bountyReward, 'bounty');
      var surgeDuration = Math.max(rt.state.player.overdrive, BOUNTY_SURGE_DURATION);
      rt.state.player.overdrive = surgeDuration;
      rt.state.banner = Math.max(rt.state.banner, 2.1);
      if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'BOUNTY CLEAR +' + rt.state.bountyReward + ' SCORE // SURGE ' + surgeDuration.toFixed(1) + 's';
      logEvent('BOUNTY SECURED // SURGE ONLINE');
      spawnParticles(e.x, e.y, '#f0cf88', 12, 180, 3);
      pushFxEvent('bounty', e.x, e.y, null);
    }
  }
  var decalR = elite ? 18 : (e.kind === 'brute' || e.kind === 'artillery') ? 15 : e.kind === 'rusher' ? 10 : 8;
  var decalLife = 12 + rng('combat') * 6;
  addDecal(e.x, e.y, decalR, decalLife, 0.38, '#1b1715');
  if (elite) {
    triggerHaptic([25, 35, 45]);
    if (e.affix === 'vortex' || e.affix2 === 'vortex') {
      if (!rt.state.vortices) rt.state.vortices = [];
      rt.state.vortices.push({ x: e.x, y: e.y, r: 160, life: 2.5, maxLife: 2.5 });
      spawnParticles(e.x, e.y, '#9d4edd', 22, 190, 3.5);
    }
  }
  if (!isTitan && canDropLoot(e)) rollDrops(e);
  spawnParticles(e.x, e.y, e.color, elite ? 26 : (e.kind === 'brute' || e.kind === 'artillery') ? 22 : 11, elite ? 260 : (e.kind === 'brute' || e.kind === 'artillery') ? 220 : 150, elite ? 5 : (e.kind === 'brute' || e.kind === 'artillery') ? 5 : 3);
  rt.state.shake = Math.max(rt.state.shake, elite ? 10 : (e.kind === 'brute' || e.kind === 'artillery') ? 7 : 3);
  pushFxEvent('kill', e.x, e.y, { kind: e.kind, color: e.color || '', elite: elite ? 1 : 0, affix: e.affix || '', hp: e.hp, ref: e });
  var killInfo = { cause: why, kind: e.kind, elite: elite, isBoss: Boolean(e.isBoss) };
  onKill(e, killInfo);
  noteContractEvent('kill', killInfo);
  noteMetaEvent('kill', killInfo);
  if (e.isBoss) onBossDefeated(e);
}

export function explodeCore(core, index) {
  if (!rt.state) return;
  if (rt.state.stats) rt.state.stats.coresDetonated += 1;
  rt.state.volatileCores.splice(index, 1);
  var p = rt.state.player;
  var blastR = 130;
  addDecal(core.x, core.y, 18, 16, 0.42, '#1b1715');
  triggerHaptic([25, 35, 45]);
  for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
    var enemy = rt.state.enemies[ei];
    if (dist2(core.x, core.y, enemy.x, enemy.y) <= (blastR + enemy.r) * (blastR + enemy.r)) {
      if (enemy.isBoss || enemy.kind === 'titan') {
        damageEnemy(enemy, 350, { source: 'core', x: core.x, y: core.y });
        enemy.empTimer = 3.0;
        AudioFX.critHit();
        triggerHaptic([50, 40, 60, 80]);
        rt.state.shake = Math.max(rt.state.shake, 18);
        logEvent('TITAN ARMOR BREACH // CORE STRIKE -350 HP');
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN ARMOR BREACH -350 HP // SYSTEM OVERHEAT STUN 3.0s';
        spawnParticles(enemy.x, enemy.y, '#ff4d2e', 30, 240, 4);
      } else {
        damageEnemy(enemy, 90, { source: 'core', x: core.x, y: core.y });
      }
      shoveEnemy(enemy, enemy.x - core.x, enemy.y - core.y, 45);
      spawnParticles(enemy.x, enemy.y, '#f5a623', 8, 160, 3);
      if (enemy.hp <= 0) killEnemy(enemy, 'core');
    }
  }
  if (dist2(core.x, core.y, p.x, p.y) <= (blastR + p.r) * (blastR + p.r)) {
    var boundW = rt.ui ? rt.ui.width : rt.state.width;
    var boundH = rt.ui ? rt.ui.height : rt.state.height;
    var pkdx = p.x - core.x;
    var pkdy = p.y - core.y;
    var pkd = Math.hypot(pkdx, pkdy) || 1;
    p.x = clamp(p.x + (pkdx / pkd) * 20, p.r, boundW - p.r);
    p.y = clamp(p.y + (pkdy / pkd) * 20, p.r, boundH - p.r);
    if (p.invulnerable <= 0) {
      var coreHit = damagePlayer(15, 'core');
      if (coreHit > 0) {
        p.invulnerable = 0.5;
        AudioFX.hurt();
        triggerHaptic([45]);
        rt.state.shake = Math.max(rt.state.shake, 8);
        rt.state.hurtFlash = 0.45;
        spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
        if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(core.x, core.y);
      }
    }
  }
  rt.state.shake = Math.max(rt.state.shake, 14);
  rt.state.shockRings.push({ x: core.x, y: core.y, r: 8, maxR: blastR, life: 0.35, maxLife: 0.35, color: '#f5a623' });
  spawnParticles(core.x, core.y, '#f5a623', 28, 250, 4);
  spawnParticles(core.x, core.y, '#ffd27d', 16, 170, 3);
  AudioFX.blast();
  logEvent('VOLATILE CORE DETONATED');
  pushFxEvent('core', core.x, core.y, null);
}

export function explodeBarrel(barrel, index, isKicked) {
  if (!rt.state) return;
  if (typeof index === 'number' && index >= 0 && index < rt.state.barrels.length && rt.state.barrels[index] === barrel) {
    rt.state.barrels.splice(index, 1);
  } else {
    var bIdx = rt.state.barrels.indexOf(barrel);
    if (bIdx !== -1) rt.state.barrels.splice(bIdx, 1);
  }
  var p = rt.state.player;
  var blastR = isKicked ? 125 : 110;
  var blastDmg = isKicked ? 120 : 85;
  addDecal(barrel.x, barrel.y, 16, 14, 0.4, '#1b1715');
  triggerHaptic(isKicked ? [30, 40, 55] : [20, 30, 40]);

  for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
    var enemy = rt.state.enemies[ei];
    if (dist2(barrel.x, barrel.y, enemy.x, enemy.y) <= (blastR + enemy.r) * (blastR + enemy.r)) {
      var dmg = blastDmg;
      var bossKick = (enemy.isBoss || enemy.kind === 'titan') && isKicked;
      if (bossKick) dmg = 240;
      damageEnemy(enemy, dmg, { source: 'barrel', x: barrel.x, y: barrel.y });
      if (bossKick) {
        enemy.empTimer = Math.max(enemy.empTimer || 0, 1.5);
        AudioFX.critHit();
        triggerHaptic([40, 50, 70]);
        rt.state.shake = Math.max(rt.state.shake, 16);
        logEvent('TITAN STRUCK BY KICKED BARREL // -240 HP');
        spawnParticles(enemy.x, enemy.y, '#ff4d2e', 20, 220, 4);
      }
      shoveEnemy(enemy, enemy.x - barrel.x, enemy.y - barrel.y, 40);
      spawnParticles(enemy.x, enemy.y, '#ff5522', 8, 160, 3);
      if (enemy.hp <= 0) killEnemy(enemy, 'barrel');
    }
  }

  if (p && dist2(barrel.x, barrel.y, p.x, p.y) <= (blastR + p.r) * (blastR + p.r)) {
    var boundW = (rt.ui && rt.ui.width) || (rt.state && rt.state.width) || 960;
    var boundH = (rt.ui && rt.ui.height) || (rt.state && rt.state.height) || 640;
    var pkdx = p.x - barrel.x;
    var pkdy = p.y - barrel.y;
    var pkd = Math.hypot(pkdx, pkdy) || 1;
    p.x = clamp(p.x + (pkdx / pkd) * 20, p.r, boundW - p.r);
    p.y = clamp(p.y + (pkdy / pkd) * 20, p.r, boundH - p.r);
    if (p.invulnerable <= 0) {
      var barrelHit = damagePlayer(10, 'barrel');
      if (barrelHit > 0) {
        p.invulnerable = 0.4;
        AudioFX.hurt();
        triggerHaptic([35]);
        rt.state.shake = Math.max(rt.state.shake, 7);
        rt.state.hurtFlash = 0.35;
        spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
        if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(barrel.x, barrel.y);
      }
    }
  }

  rt.state.shake = Math.max(rt.state.shake, isKicked ? 14 : 10);
  if (rt.state.shockRings) {
    rt.state.shockRings.push({
      x: barrel.x,
      y: barrel.y,
      r: 8,
      maxR: blastR,
      life: 0.32,
      maxLife: 0.32,
      color: isKicked ? '#ff6633' : '#f5a623'
    });
  }
  spawnParticles(barrel.x, barrel.y, '#ff4422', isKicked ? 28 : 22, isKicked ? 240 : 190, 4);
  spawnParticles(barrel.x, barrel.y, '#ffaa33', 18, 160, 3);
  AudioFX.blast();
  logEvent(isKicked ? 'BARREL DETONATED // SUPERCRIT' : 'BARREL DETONATED');
  pushFxEvent('barrel', barrel.x, barrel.y, { kicked: isKicked ? 1 : 0 });
}
