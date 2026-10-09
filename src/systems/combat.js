import { AudioFX } from '../audio/audio-fx.js';
import { BOUNTY_SURGE_DURATION, COMBO_WINDOW, MAX_COMBO } from '../config.js';
import { addDecal, spawnParticles } from '../core/pools.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../core/settings.js';
import { clamp, dist2 } from '../core/utils.js';
import { triggerReactiveArmor } from './abilities.js';
import { isStormFront, triggerGameOver } from './flow.js';
import { logEvent } from '../ui/hud.js';

export function killEnemy(index) {
  var e = rt.state.enemies[index];
  if (!e) return;
  rt.state.enemies.splice(index, 1);
  rt.state.kills += 1;
  if (isStormFront()) rt.state.stormKills = (rt.state.stormKills || 0) + 1;
  var elite = e.kind === 'elite';
  var isTitan = e.kind === 'titan';
  var baseScore = elite ? 180 : e.kind === 'brute' ? 90 : e.kind === 'artillery' ? 60 : e.kind === 'rusher' ? 35 : isTitan ? 800 : 20;
  rt.state.combo = rt.state.comboTimer > 0 ? Math.min(MAX_COMBO, rt.state.combo + 1) : 1;
  if (rt.state.stats && rt.state.combo > rt.state.stats.maxCombo) {
    rt.state.stats.maxCombo = rt.state.combo;
  }
  rt.state.comboTimer = COMBO_WINDOW;
  rt.state.score += Math.round(baseScore * (1 + (rt.state.combo - 1) * 0.25));

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
    rt.state.orbs.push({ kind: 'overdrive', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 95, vy: (Math.random() - 0.5) * 95, r: 11, value: 0, life: 25 });
    rt.state.orbs.push({ kind: 'repair', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 85, vy: (Math.random() - 0.5) * 85, r: 10, value: 0, life: 25 });
    for (var gsi = 0; gsi < 3; gsi += 1) {
      rt.state.orbs.push({
        kind: 'scrap',
        x: e.x + (Math.random() - 0.5) * 35,
        y: e.y + (Math.random() - 0.5) * 35,
        vx: (Math.random() - 0.5) * 110,
        vy: (Math.random() - 0.5) * 110,
        r: 12,
        value: 60,
        life: 35
      });
    }
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
      rt.state.score += rt.state.bountyReward;
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
  var decalLife = 12 + Math.random() * 6;
  addDecal(e.x, e.y, decalR, decalLife, 0.38, '#1b1715');
  if (elite) {
    triggerHaptic([25, 35, 45]);
    if (e.affix === 'vortex') {
      if (!rt.state.vortices) rt.state.vortices = [];
      rt.state.vortices.push({ x: e.x, y: e.y, r: 160, life: 2.5, maxLife: 2.5 });
      spawnParticles(e.x, e.y, '#9d4edd', 22, 190, 3.5);
    }
  }
  if (!isTitan) {
    rt.state.orbs.push({ kind: 'scrap', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, r: elite ? 9 : e.kind === 'artillery' ? 8 : 7, value: elite ? 40 : e.kind === 'brute' ? 34 : e.kind === 'artillery' ? 24 : e.kind === 'rusher' ? 13 : 10, life: 28 });
    if (elite || e.kind === 'brute' || (e.kind === 'artillery' && Math.random() < 0.15)) rt.state.orbs.push({ kind: 'repair', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 85, vy: (Math.random() - 0.5) * 85, r: 10, value: 0, life: 22 });
    if (elite) rt.state.orbs.push({ kind: 'overdrive', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 95, vy: (Math.random() - 0.5) * 95, r: 11, value: 0, life: 18 });
  }
  spawnParticles(e.x, e.y, e.color, elite ? 26 : (e.kind === 'brute' || e.kind === 'artillery') ? 22 : 11, elite ? 260 : (e.kind === 'brute' || e.kind === 'artillery') ? 220 : 150, elite ? 5 : (e.kind === 'brute' || e.kind === 'artillery') ? 5 : 3);
  rt.state.shake = Math.max(rt.state.shake, elite ? 10 : (e.kind === 'brute' || e.kind === 'artillery') ? 7 : 3);
  pushFxEvent('kill', e.x, e.y, { kind: e.kind, color: e.color || '', elite: elite ? 1 : 0, affix: e.affix || '', hp: e.hp, ref: e });
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
      if (enemy.kind === 'titan') {
        enemy.hp -= 350;
        if (rt.state.stats) rt.state.stats.damageDealt += 350;
        enemy.empTimer = 3.0;
        AudioFX.critHit();
        triggerHaptic([50, 40, 60, 80]);
        rt.state.shake = Math.max(rt.state.shake, 18);
        logEvent('TITAN ARMOR BREACH // CORE STRIKE -350 HP');
        if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN ARMOR BREACH -350 HP // SYSTEM OVERHEAT STUN 3.0s';
        spawnParticles(enemy.x, enemy.y, '#ff4d2e', 30, 240, 4);
      } else {
        enemy.hp -= 90;
        if (rt.state.stats) rt.state.stats.damageDealt += 90;
      }
      var kdx = enemy.x - core.x;
      var kdy = enemy.y - core.y;
      var kd = Math.hypot(kdx, kdy) || 1;
      enemy.x += (kdx / kd) * 45;
      enemy.y += (kdy / kd) * 45;
      spawnParticles(enemy.x, enemy.y, '#f5a623', 8, 160, 3);
      if (enemy.hp <= 0) killEnemy(ei);
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
      p.hp -= 15;
      p.invulnerable = 0.5;
      AudioFX.hurt();
      triggerHaptic([45]);
      rt.state.shake = Math.max(rt.state.shake, 8);
      rt.state.hurtFlash = 0.45;
      pushFxEvent('playerHit', p.x, p.y, null);
      spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
      if (isStormFront()) rt.state.stormHurt = true;
      if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(core.x, core.y);
      if (p.hp <= 0) triggerGameOver();
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
      if (enemy.kind === 'titan' && isKicked) {
        dmg = 240;
        enemy.empTimer = Math.max(enemy.empTimer || 0, 1.5);
        AudioFX.critHit();
        triggerHaptic([40, 50, 70]);
        rt.state.shake = Math.max(rt.state.shake, 16);
        logEvent('TITAN STRUCK BY KICKED BARREL // -240 HP');
        spawnParticles(enemy.x, enemy.y, '#ff4d2e', 20, 220, 4);
      }
      enemy.hp -= dmg;
      if (rt.state.stats) rt.state.stats.damageDealt += dmg;
      var kdx = enemy.x - barrel.x;
      var kdy = enemy.y - barrel.y;
      var kd = Math.hypot(kdx, kdy) || 1;
      enemy.x += (kdx / kd) * 40;
      enemy.y += (kdy / kd) * 40;
      spawnParticles(enemy.x, enemy.y, '#ff5522', 8, 160, 3);
      if (enemy.hp <= 0) killEnemy(ei);
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
      p.hp -= 10;
      p.invulnerable = 0.4;
      AudioFX.hurt();
      triggerHaptic([35]);
      rt.state.shake = Math.max(rt.state.shake, 7);
      rt.state.hurtFlash = 0.35;
      pushFxEvent('playerHit', p.x, p.y, null);
      spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
      if (isStormFront()) rt.state.stormHurt = true;
      if (p.reactiveArmor || p.overchargeRetaliation) triggerReactiveArmor(barrel.x, barrel.y);
      if (p.hp <= 0) triggerGameOver();
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
