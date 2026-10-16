import { rt } from '../core/runtime.js';
import { clamp, dist2 } from '../core/utils.js';
import { rng } from '../core/rng.js';
import { AudioFX } from '../audio/audio-fx.js';
import { triggerHaptic } from '../core/settings.js';
import { damageEnemy, killEnemy } from './combat.js';
import { onEnemyEmp } from './sim/enemy-defense.js';
import { launchMicroMissiles } from './card-effects.js';
import { isReducedMotion } from '../core/settings.js';

function pushBullet(b) {
  if (!rt.state) return;
  if (!rt.state.bullets) rt.state.bullets = [];
  rt.state.bullets.push(b);
}

export var TACTICAL_ITEMS = {
  'sentry-turret': {
    id: 'sentry-turret',
    name: '定點自律機槍塔',
    enName: 'DEPLOYABLE SENTRY TURRET',
    cooldown: 16,
    icon: '⛨',
    desc: '部署 120 HP 自動機槍哨塔 (持續 8s)，射速 9 發/秒，帶 90px 友方精準光環'
  },
  'thermal-decoy': {
    id: 'thermal-decoy',
    name: '熱誘餌干擾彈',
    enName: 'DECOY THERMAL FLARE',
    cooldown: 14,
    icon: '✦',
    desc: '彈射 3 顆飄浮高熱誘餌 (持續 4.5s)，強制扭曲 350px 內敵彈並吸引自爆蟲'
  },
  'singularity-grenade': {
    id: 'singularity-grenade',
    name: '微型奇點牽引手雷',
    enName: 'SINGULARITY GRENADE',
    cooldown: 18,
    icon: '◎',
    desc: '投擲重力子核心吸附 150px 敵軍 2.5s，並在坍縮時爆發 80 點動能衝擊與暈眩'
  }
};

function spawnParticles(x, y, color, count, speed, size) {
  if (!rt.state || !rt.state.particles) return;
  var TAU = Math.PI * 2;
  var n = isReducedMotion() ? Math.max(2, Math.floor(count * 0.4)) : count;
  for (var i = 0; i < n; i += 1) {
    var ang = rng('combat') * TAU;
    var spd = (0.3 + rng('combat') * 0.7) * speed;
    rt.state.particles.push({
      x: x,
      y: y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: (0.5 + rng('combat') * 0.5) * size,
      color: color,
      life: 0.35 + rng('combat') * 0.35,
      maxLife: 0.7
    });
  }
}

export function initPlayerTactical(p, id) {
  if (!p) return;
  var itemId = id && TACTICAL_ITEMS[id] ? id : 'sentry-turret';
  var def = TACTICAL_ITEMS[itemId];
  p.tacticalSlot = {
    id: def.id,
    name: def.name,
    enName: def.enName,
    cooldown: 0,
    maxCooldown: def.cooldown,
    icon: def.icon
  };
}

export function triggerTacticalAuxiliary() {
  if (!rt.state || rt.state.paused || rt.state.over || rt.state.interlude) return false;
  var p = rt.state.player;
  if (!p) return false;
  if (!p.tacticalSlot) initPlayerTactical(p, 'sentry-turret');

  var tac = p.tacticalSlot;
  if (tac.cooldown > 0) {
    if (AudioFX && typeof AudioFX.dryFire === 'function') AudioFX.dryFire();
    return false;
  }

  var boundW = (rt.ui && rt.ui.width) || rt.state.width || 960;
  var boundH = (rt.ui && rt.ui.height) || rt.state.height || 640;
  var mouse = (rt.input && rt.input.mouse) || { x: p.x + Math.cos(p.aim || 0) * 120, y: p.y + Math.sin(p.aim || 0) * 120 };
  var executed = false;

  if (!rt.state.tacticalEntities) rt.state.tacticalEntities = [];

  if (tac.id === 'sentry-turret') {
    var tx = clamp(mouse.x, 30, boundW - 30);
    var ty = clamp(mouse.y, 30, boundH - 30);
    rt.state.tacticalEntities.push({
      kind: 'sentry-turret',
      x: tx,
      y: ty,
      hp: 120,
      maxHp: 120,
      life: 8.0,
      maxLife: 8.0,
      r: 16,
      fireCd: 0.1,
      fireRate: 1 / 9,
      damage: 14,
      auraR: 90,
      targetAngle: p.aim || 0
    });
    if (AudioFX && typeof AudioFX.levelUp === 'function') AudioFX.levelUp();
    spawnParticles(tx, ty, '#5be7ff', 18, 140, 3);
    spawnParticles(tx, ty, '#ffd27d', 10, 100, 2);
    executed = true;
  } else if (tac.id === 'thermal-decoy') {
    var moveAng = (p.vx || p.vy) ? Math.atan2(p.vy, p.vx) + Math.PI : (p.aim || 0) + Math.PI;
    for (var di = 0; di < 3; di += 1) {
      var spread = (di - 1) * 0.35;
      var dSpeed = 90 + di * 25;
      rt.state.tacticalEntities.push({
        kind: 'thermal-decoy',
        x: p.x,
        y: p.y,
        vx: Math.cos(moveAng + spread) * dSpeed,
        vy: Math.sin(moveAng + spread) * dSpeed,
        life: 4.5,
        maxLife: 4.5,
        r: 14,
        pullRadius: 350
      });
    }
    if (AudioFX && typeof AudioFX.mortarLaunch === 'function') AudioFX.mortarLaunch();
    spawnParticles(p.x, p.y, '#ff7733', 14, 160, 3);
    executed = true;
  } else if (tac.id === 'singularity-grenade') {
    var gx = clamp(mouse.x, 30, boundW - 30);
    var gy = clamp(mouse.y, 30, boundH - 30);
    rt.state.tacticalEntities.push({
      kind: 'singularity-vortex',
      x: gx,
      y: gy,
      r: 150,
      life: 2.5,
      maxLife: 2.5,
      tearTimer: 0,
      hp: 999
    });
    if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
    spawnParticles(gx, gy, '#bd5bff', 24, 200, 3.5);
    executed = true;
  }

  if (executed) {
    tac.cooldown = tac.maxCooldown;
    triggerHaptic([35, 20, 45]);
    if (rt.state.shockRings) {
      rt.state.shockRings.push({
        x: p.x,
        y: p.y,
        r: 8,
        maxR: 45,
        life: 0.25,
        maxLife: 0.25,
        color: '#5be7ff'
      });
    }
    return true;
  }
  return false;
}

export function stepTactical(dt, frame) {
  var p = frame.p;
  if (!p) return;

  if (!p.tacticalSlot) initPlayerTactical(p, 'sentry-turret');
  var tac = p.tacticalSlot;

  if (tac.cooldown > 0) {
    tac.cooldown = Math.max(0, tac.cooldown - dt);
  }

  var entities = rt.state.tacticalEntities;
  if (!entities || !entities.length) return;

  var enemies = rt.state.enemies || [];
  var enemyBullets = rt.state.enemyBullets || [];
  var playerInAura = false;

  for (var i = entities.length - 1; i >= 0; i -= 1) {
    var ent = entities[i];
    ent.life -= dt;

    if (ent.life <= 0 || (typeof ent.hp === 'number' && ent.hp <= 0)) {
      if (ent.kind === 'singularity-vortex') {
        // Expiry shockwave: 80 kinetic blast + 1s stun (or reflected absorbed damage)
        if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
        rt.state.shake = Math.max(rt.state.shake || 0, 10);
        spawnParticles(ent.x, ent.y, '#bd5bff', 28, 220, 4);
        spawnParticles(ent.x, ent.y, '#ffffff', 14, 160, 2.5);
        var collapseDmg = Math.max(80, Math.round(ent.absorbedDamage || 0));
        for (var ei = enemies.length - 1; ei >= 0; ei -= 1) {
          var targetEnemy = enemies[ei];
          if (dist2(ent.x, ent.y, targetEnemy.x, targetEnemy.y) <= (ent.r + targetEnemy.r) * (ent.r + targetEnemy.r)) {
            damageEnemy(targetEnemy, collapseDmg, { source: 'singularity', x: ent.x, y: ent.y });
            targetEnemy.empTimer = Math.max(targetEnemy.empTimer || 0, 1.0);
            onEnemyEmp(targetEnemy);
            if (targetEnemy.hp <= 0) killEnemy(targetEnemy, 'singularity');
          }
        }
      } else if (ent.kind === 'sentry-turret') {
        spawnParticles(ent.x, ent.y, '#5be7ff', 12, 100, 2);
      } else if (ent.kind === 'holo-mirage') {
        launchMicroMissiles(p, { x: ent.x, y: ent.y });
        spawnParticles(ent.x, ent.y, '#ffd700', 16, 160, 3);
      }
      entities.splice(i, 1);
      continue;
    }

    if (ent.kind === 'sentry-turret') {
      // Precision aura for player
      if (dist2(p.x, p.y, ent.x, ent.y) <= (ent.auraR) * (ent.auraR)) {
        playerInAura = true;
      }

      // Intercept straight enemy bullets
      for (var bi = enemyBullets.length - 1; bi >= 0; bi -= 1) {
        var eb = enemyBullets[bi];
        if (dist2(eb.x, eb.y, ent.x, ent.y) <= (eb.r + ent.r) * (eb.r + ent.r)) {
          ent.hp -= (eb.damage || 12);
          spawnParticles(eb.x, eb.y, '#5be7ff', 4, 80, 2);
          enemyBullets.splice(bi, 1);
          if (ent.hp <= 0) break;
        }
      }

      // Aim and fire at nearest enemy within 280px
      var bestDist2 = 280 * 280;
      var nearest = null;
      for (var ni = 0; ni < enemies.length; ni += 1) {
        var foe = enemies[ni];
        if (!foe || !(foe.hp > 0)) continue;
        var fd2 = dist2(ent.x, ent.y, foe.x, foe.y);
        if (fd2 <= bestDist2) {
          bestDist2 = fd2;
          nearest = foe;
        }
      }

      if (nearest) {
        ent.targetAngle = Math.atan2(nearest.y - ent.y, nearest.x - ent.x);
        ent.fireCd = (ent.fireCd || 0) - dt;
        if (ent.fireCd <= 0) {
          ent.fireCd = ent.fireRate || (1 / 9);
          var bSpeed = 460;
          pushBullet({
            x: ent.x + Math.cos(ent.targetAngle) * (ent.r + 4),
            y: ent.y + Math.sin(ent.targetAngle) * (ent.r + 4),
            vx: Math.cos(ent.targetAngle) * bSpeed,
            vy: Math.sin(ent.targetAngle) * bSpeed,
            r: 3.5,
            damage: ent.damage,
            pierce: 0,
            bounces: 0,
            life: 0.9,
            colorCore: '#5be7ff',
            trail: [],
            isTurret: true
          });
          if (AudioFX && typeof AudioFX.shoot === 'function') AudioFX.shoot();
          spawnParticles(ent.x + Math.cos(ent.targetAngle) * (ent.r + 4), ent.y + Math.sin(ent.targetAngle) * (ent.r + 4), '#5be7ff', 3, 60, 1.5);
        }
      }
    } else if (ent.kind === 'thermal-decoy') {
      // Movement deceleration
      ent.x += ent.vx * dt;
      ent.y += ent.vy * dt;
      ent.vx *= Math.pow(0.2, dt);
      ent.vy *= Math.pow(0.2, dt);

      // Distort enemy bullets within 350px
      for (var dbi = 0; dbi < enemyBullets.length; dbi += 1) {
        var deb = enemyBullets[dbi];
        var debD2 = dist2(ent.x, ent.y, deb.x, deb.y);
        if (debD2 <= ent.pullRadius * ent.pullRadius && debD2 > 16) {
          var debDist = Math.sqrt(debD2);
          var pullF = (1 - debDist / ent.pullRadius) * 220 * dt;
          deb.vx += ((ent.x - deb.x) / debDist) * pullF;
          deb.vy += ((ent.y - deb.y) / debDist) * pullF;
        }
      }

      // Lure rusher or scurrier enemies
      for (var dei = 0; dei < enemies.length; dei += 1) {
        var dFoe = enemies[dei];
        if (dFoe && (dFoe.kind === 'rusher' || dFoe.kind === 'scurrier')) {
          var dFoeDist2 = dist2(ent.x, ent.y, dFoe.x, dFoe.y);
          if (dFoeDist2 <= ent.pullRadius * ent.pullRadius) {
            var dfd = Math.sqrt(dFoeDist2) || 1;
            dFoe.x += ((ent.x - dFoe.x) / dfd) * (dFoe.speed || 100) * dt * 0.8;
            dFoe.y += ((ent.y - dFoe.y) / dfd) * (dFoe.speed || 100) * dt * 0.8;
            if (dFoeDist2 <= (ent.r + dFoe.r) * (ent.r + dFoe.r)) {
              // Self-destruct contact
              damageEnemy(dFoe, 100, { source: 'decoy', x: ent.x, y: ent.y });
              spawnParticles(ent.x, ent.y, '#ff4d2e', 14, 140, 2.5);
              if (dFoe.hp <= 0) killEnemy(dFoe, 'decoy');
            }
          }
        }
      }
    } else if (ent.kind === 'singularity-vortex') {
      // Pull minions and medium armored enemies
      for (var si = 0; si < enemies.length; si += 1) {
        var sFoe = enemies[si];
        if (!sFoe || !(sFoe.hp > 0) || sFoe.isBoss) continue;
        var sDist2 = dist2(ent.x, ent.y, sFoe.x, sFoe.y);
        if (sDist2 <= ent.r * ent.r && sDist2 > 4) {
          var sDist = Math.sqrt(sDist2);
          var pullFactor = (1 - sDist / ent.r) * 160 * dt;
          sFoe.x += ((ent.x - sFoe.x) / sDist) * pullFactor;
          sFoe.y += ((ent.y - sFoe.y) / sDist) * pullFactor;
        }
      }

      // Tear damage every 0.25s
      ent.tearTimer = (ent.tearTimer || 0) + dt;
      if (ent.tearTimer >= 0.25) {
        ent.tearTimer = 0;
        for (var sti = 0; sti < enemies.length; sti += 1) {
          var stFoe = enemies[sti];
          if (!stFoe || !(stFoe.hp > 0)) continue;
          if (dist2(ent.x, ent.y, stFoe.x, stFoe.y) <= ent.r * ent.r) {
            damageEnemy(stFoe, 6, { source: 'singularity', x: ent.x, y: ent.y });
            spawnParticles(stFoe.x, stFoe.y, '#bd5bff', 3, 50, 1.2);
            if (stFoe.hp <= 0) killEnemy(stFoe, 'singularity');
          }
        }
      }

      // Absorb enemy bullets into reflected charge
      for (var abi = enemyBullets.length - 1; abi >= 0; abi -= 1) {
        var abEb = enemyBullets[abi];
        if (dist2(ent.x, ent.y, abEb.x, abEb.y) <= ent.r * ent.r) {
          ent.absorbedDamage = (ent.absorbedDamage || 0) + (abEb.damage || 15);
          spawnParticles(abEb.x, abEb.y, '#bd5bff', 2, 40, 1.2);
          enemyBullets.splice(abi, 1);
        }
      }
    } else if (ent.kind === 'holo-mirage') {
      // Lure rusher or scurrier enemies
      for (var hdi = 0; hdi < enemies.length; hdi += 1) {
        var hFoe = enemies[hdi];
        if (hFoe && (hFoe.kind === 'rusher' || hFoe.kind === 'scurrier' || hFoe.kind === 'swarmer')) {
          var hDist2 = dist2(ent.x, ent.y, hFoe.x, hFoe.y);
          if (hDist2 <= ent.pullRadius * ent.pullRadius) {
            var hfd = Math.sqrt(hDist2) || 1;
            hFoe.x += ((ent.x - hFoe.x) / hfd) * (hFoe.speed || 100) * dt * 0.7;
            hFoe.y += ((ent.y - hFoe.y) / hfd) * (hFoe.speed || 100) * dt * 0.7;
          }
        }
      }
      // Fire towards mouse cursor or nearest enemy
      ent.fireCd = (ent.fireCd || 0) - dt;
      if (ent.fireCd <= 0) {
        ent.fireCd = ent.fireRate || 0.22;
        var aimAng = ent.targetAngle || 0;
        if (rt.input && rt.input.mouse) {
          aimAng = Math.atan2(rt.input.mouse.y - ent.y, rt.input.mouse.x - ent.x);
        }
        var spd = 480;
        pushBullet({
          x: ent.x + Math.cos(aimAng) * (ent.r + 4),
          y: ent.y + Math.sin(aimAng) * (ent.r + 4),
          vx: Math.cos(aimAng) * spd,
          vy: Math.sin(aimAng) * spd,
          r: 3,
          damage: ent.damage || 14,
          pierce: 0,
          bounces: 0,
          life: 0.9,
          colorCore: '#ffd700',
          trail: [],
          isMirage: true
        });
        if (AudioFX && typeof AudioFX.shoot === 'function') AudioFX.shoot();
      }
    }
  }

  p.sentryAuraActive = playerInAura;
}

export function drawTacticalEntities(ctx) {
  if (!ctx || !rt.state || !rt.state.tacticalEntities) return;
  var entities = rt.state.tacticalEntities;
  var TAU = Math.PI * 2;
  var time = rt.renderTime || 0;

  for (var i = 0; i < entities.length; i += 1) {
    var ent = entities[i];
    ctx.save();
    ctx.translate(ent.x, ent.y);

    if (ent.kind === 'sentry-turret') {
      // 90px Aura ring
      ctx.strokeStyle = 'rgba(91, 231, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, ent.auraR, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tripod legs
      ctx.strokeStyle = '#2d241c';
      ctx.lineWidth = 3;
      for (var li = 0; li < 3; li += 1) {
        var la = (li / 3) * TAU + Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(la) * 15, Math.sin(la) * 15);
        ctx.stroke();
      }

      // Swivel Cannon Body
      ctx.rotate(ent.targetAngle || 0);
      ctx.fillStyle = '#3f3126';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = '#5be7ff';
      ctx.fillRect(4, -2, 12, 4);

      // Health bar
      if (ent.maxHp && ent.hp < ent.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-12, -18, 24, 3);
        ctx.fillStyle = '#5be7ff';
        ctx.fillRect(-12, -18, 24 * clamp(ent.hp / ent.maxHp, 0, 1), 3);
      }
    } else if (ent.kind === 'thermal-decoy') {
      // Pulsing heat flare
      var flarePulse = Math.sin(time * 16) * 3;
      ctx.fillStyle = 'rgba(255, 119, 51, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, ent.r + flarePulse, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#ff7733';
      ctx.beginPath();
      ctx.arc(0, 0, ent.r * 0.6, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, ent.r * 0.25, 0, TAU);
      ctx.fill();
    } else if (ent.kind === 'singularity-vortex') {
      // Swirling gravity well
      var rot = time * 4;
      ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(189, 91, 255, 0.4)';
      ctx.lineWidth = 2.5;
      for (var si = 0; si < 4; si += 1) {
        var sa = (si / 4) * TAU;
        ctx.beginPath();
        ctx.arc(0, 0, ent.r * 0.7, sa, sa + 1.1);
        ctx.stroke();
      }

      ctx.fillStyle = '#0a0512';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = '#bd5bff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (ent.kind === 'holo-mirage') {
      var pulse = Math.sin(time * 18) * 0.15;
      ctx.save();
      ctx.globalAlpha = 0.65 + pulse;
      ctx.rotate(ent.targetAngle || 0);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ent.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5be7ff';
      ctx.fillRect(ent.r * 0.5, -2, 10, 4);
      ctx.restore();
    }

    ctx.restore();
  }
}
