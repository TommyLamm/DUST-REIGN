import { rt } from '../core/runtime.js';
import { setStatusText } from '../ui/hud.js';
import { clamp, dist2 } from '../core/utils.js';
import { rng } from '../core/rng.js';
import { AudioFX } from '../audio/audio-fx.js';
import { triggerHaptic } from '../core/settings.js';
import { damageEnemy, killEnemy } from './combat.js';
import { onEnemyEmp } from './sim/enemy-defense.js';
import { dispatchCardHook, launchMicroMissiles } from './card-effects.js';
import { spawnParticles } from '../core/pools.js';
import { addCameraTrauma } from '../core/camera.js';
import { isChinese } from '../core/i18n.js';

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
    desc: '部署 120 HP 自動機槍哨塔 (持續 8s)，射速 9 發/秒，帶 90px 友方精準光環',
    onDeploy: function (p, mouse, boundW, boundH) {
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
      return true;
    }
  },
  'thermal-decoy': {
    id: 'thermal-decoy',
    name: '熱誘餌干擾彈',
    enName: 'DECOY THERMAL FLARE',
    cooldown: 14,
    icon: '✦',
    desc: '彈射 3 顆飄浮高熱誘餌 (持續 4.5s)，強制扭曲 350px 內敵彈並吸引自爆蟲',
    onDeploy: function (p, mouse, boundW, boundH) {
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
      return true;
    }
  },
  'singularity-grenade': {
    id: 'singularity-grenade',
    name: '微型奇點牽引手雷',
    enName: 'SINGULARITY GRENADE',
    cooldown: 18,
    icon: '◎',
    desc: '投擲重力子核心吸附 150px 敵軍 2.5s，並在坍縮時爆發 80 點動能衝擊與暈眩',
    onDeploy: function (p, mouse, boundW, boundH) {
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
      return true;
    }
  },
  'aegis-barrier': {
    id: 'aegis-barrier',
    name: '硬光防禦屏障',
    enName: 'AEGIS BARRIER',
    cooldown: 15,
    icon: '⛊',
    desc: '部署 240 HP 正面 130° 硬光屏障 (持續 5s)，吸收敵彈並折射增幅友軍子彈 (+30% 傷害/+200 速度/+1 穿透)',
    onDeploy: function (p, mouse, boundW, boundH) {
      var dist = Math.hypot(mouse.x - p.x, mouse.y - p.y);
      var facing = (dist > 8) ? Math.atan2(mouse.y - p.y, mouse.x - p.x) : (p.aim || 0);
      var deployDist = Math.min(Math.max(48, dist), 130);
      var bx = clamp(p.x + Math.cos(facing) * deployDist, 35, boundW - 35);
      var by = clamp(p.y + Math.sin(facing) * deployDist, 35, boundH - 35);
      rt.state.tacticalEntities.push({
        kind: 'aegis-barrier',
        x: bx,
        y: by,
        hp: 240,
        maxHp: 240,
        life: 5.0,
        maxLife: 5.0,
        r: 44,
        angle: facing,
        arc: 130 * (Math.PI / 180)
      });
      if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
      spawnParticles(bx, by, '#00f3ff', 20, 160, 3);
      spawnParticles(bx, by, '#ffffff', 10, 100, 2);
      return true;
    }
  }
};

export function registerTacticalGear(gear) {
  if (!gear || !gear.id) throw new Error('Tactical gear must have an id');
  TACTICAL_ITEMS[gear.id] = gear;
  return gear;
}

export function getTacticalGear(id) {
  return TACTICAL_ITEMS[id] || TACTICAL_ITEMS['sentry-turret'] || null;
}

export function listTacticalGears() {
  return Object.values(TACTICAL_ITEMS);
}

export function setPlayerTactical(p, id) {
  if (!p) return;
  var prevCd = p.tacticalSlot ? p.tacticalSlot.cooldown : 0;
  initPlayerTactical(p, id);
  if (p.tacticalSlot) {
    p.tacticalSlot.cooldown = Math.min(prevCd, p.tacticalSlot.maxCooldown);
  }
}

export function cyclePlayerTactical(p, delta) {
  if (!p) return;
  delta = delta || 1;
  var keys = Object.keys(TACTICAL_ITEMS);
  var currentId = (p.tacticalSlot && p.tacticalSlot.id) || 'sentry-turret';
  var idx = keys.indexOf(currentId);
  if (idx === -1) idx = 0;
  var nextId = keys[(idx + delta + keys.length) % keys.length];
  setPlayerTactical(p, nextId);
  return nextId;
}

export function initPlayerTactical(p, id) {
  if (!p) return;
  var def = getTacticalGear(id) || TACTICAL_ITEMS['sentry-turret'];
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

  var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
  var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
  var mouse = (rt.input && rt.input.mouse) || { x: p.x + Math.cos(p.aim || 0) * 120, y: p.y + Math.sin(p.aim || 0) * 120 };
  var executed = false;

  if (!rt.state.tacticalEntities) rt.state.tacticalEntities = [];

  var gear = getTacticalGear(tac.id);
  if (gear && typeof gear.onDeploy === 'function') {
    executed = gear.onDeploy(p, mouse, boundW, boundH);
  }

  if (executed) {
    tac.cooldown = tac.maxCooldown;
    addCameraTrauma(0.15);
    triggerHaptic([35, 20, 45]);
    dispatchCardHook('onTacticalUsed', p, gear || tac);
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
    var prevCd = tac.cooldown;
    tac.cooldown = Math.max(0, tac.cooldown - dt);
    if (prevCd > 0 && tac.cooldown === 0) {
      if (AudioFX && typeof AudioFX.tacticalReady === 'function') {
        AudioFX.tacticalReady();
      }
      if (rt.ui && rt.ui.statusText) {
        var readyGear = getTacticalGear(tac.id);
        var readyGearName = isChinese()
          ? ((readyGear && readyGear.name) || '戰術裝備')
          : ((readyGear && readyGear.enName) || 'TACTICAL GEAR');
        setStatusText(readyGearName + ' // READY');
      }
    }
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
        // Expiry shockwave: 80 kinetic blast + absorbed damage supernova collapse
        if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
        rt.state.shake = Math.max(rt.state.shake || 0, 10);
        spawnParticles(ent.x, ent.y, '#bd5bff', 28, 220, 4);
        spawnParticles(ent.x, ent.y, '#ffffff', 14, 160, 2.5);
        var absorbed = Math.round(ent.absorbedDamage || 0);
        var collapseDmg = 80 + absorbed;
        var extraR = Math.min(45, Math.round(absorbed * 0.5));
        var blastR = ent.r + extraR;
        if (absorbed > 30) {
          setStatusText('SUPERNOVA COLLAPSE! +' + absorbed + ' BONUS DMG');
        }
        if (rt.state.shockRings) {
          rt.state.shockRings.push({
            x: ent.x,
            y: ent.y,
            r: 10,
            maxR: blastR,
            life: 0.35,
            maxLife: 0.35,
            color: '#bd5bff'
          });
        }
        for (var ei = enemies.length - 1; ei >= 0; ei -= 1) {
          var targetEnemy = enemies[ei];
          if (!targetEnemy) continue;
          if (dist2(ent.x, ent.y, targetEnemy.x, targetEnemy.y) <= (blastR + targetEnemy.r) * (blastR + targetEnemy.r)) {
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
      } else if (ent.kind === 'aegis-barrier') {
        if (AudioFX && typeof AudioFX.blast === 'function') AudioFX.blast();
        rt.state.shake = Math.max(rt.state.shake || 0, 8);
        spawnParticles(ent.x, ent.y, '#00f3ff', 24, 180, 3.5);
        spawnParticles(ent.x, ent.y, '#ffffff', 12, 120, 2);
        if (rt.state.shockRings) {
          rt.state.shockRings.push({
            x: ent.x,
            y: ent.y,
            r: 10,
            maxR: 90,
            life: 0.25,
            maxLife: 0.25,
            color: '#00f3ff'
          });
        }
        for (var aei = enemies.length - 1; aei >= 0; aei -= 1) {
          var aTarget = enemies[aei];
          if (!aTarget || aTarget.hp <= 0) continue;
          var aeDist2 = dist2(ent.x, ent.y, aTarget.x, aTarget.y);
          if (aeDist2 <= (90 + (aTarget.r || 0)) * (90 + (aTarget.r || 0))) {
            damageEnemy(aTarget, 50, { source: 'aegis_barrier', x: ent.x, y: ent.y });
            aTarget.empTimer = Math.max(aTarget.empTimer || 0, 0.8);
            onEnemyEmp(aTarget);
            if (!aTarget.knockbackImmune) {
              var aKbDist = Math.sqrt(aeDist2) || 1;
              aTarget.x += ((aTarget.x - ent.x) / aKbDist) * 35;
              aTarget.y += ((aTarget.y - ent.y) / aKbDist) * 35;
            }
            if (aTarget.hp <= 0) killEnemy(aTarget, 'aegis_barrier');
          }
        }
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

      var isOvercharged = (ent.overchargeTimer || 0) > 0;
      if (isOvercharged) {
        ent.overchargeTimer = Math.max(0, ent.overchargeTimer - dt);
      }
      if (nearest) {
        ent.targetAngle = Math.atan2(nearest.y - ent.y, nearest.x - ent.x);
        ent.fireCd = (ent.fireCd || 0) - dt;
        if (ent.fireCd <= 0) {
          var baseRate = ent.fireRate || (1 / 9);
          var effectiveRate = isOvercharged ? (baseRate * 0.6) : baseRate;
          var effectiveDmg = isOvercharged ? Math.round(ent.damage * 1.25) : ent.damage;
          ent.fireCd = effectiveRate;
          var bSpeed = 460;
          pushBullet({
            x: ent.x + Math.cos(ent.targetAngle) * (ent.r + 4),
            y: ent.y + Math.sin(ent.targetAngle) * (ent.r + 4),
            vx: Math.cos(ent.targetAngle) * bSpeed,
            vy: Math.sin(ent.targetAngle) * bSpeed,
            r: 3.5,
            damage: effectiveDmg,
            pierce: 0,
            bounces: 0,
            life: 0.9,
            colorCore: isOvercharged ? '#ffd700' : '#5be7ff',
            trail: [],
            isTurret: true,
            isOvercharged: isOvercharged
          });
          if (AudioFX && typeof AudioFX.shoot === 'function') AudioFX.shoot();
          spawnParticles(ent.x + Math.cos(ent.targetAngle) * (ent.r + 4), ent.y + Math.sin(ent.targetAngle) * (ent.r + 4), isOvercharged ? '#ffd700' : '#5be7ff', 3, 60, 1.5);
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
    } else if (ent.kind === 'aegis-barrier') {
      var halfArc = (ent.arc || (130 * Math.PI / 180)) * 0.5;
      // 1. 攔截並吸收敵方常規子彈 (正面 130° 弧面)
      for (var bi = enemyBullets.length - 1; bi >= 0; bi -= 1) {
        var aeb = enemyBullets[bi];
        var aebDist2 = dist2(ent.x, ent.y, aeb.x, aeb.y);
        var aReach = ent.r + (aeb.r || 4);
        if (aebDist2 <= aReach * aReach) {
          var aebAng = Math.atan2(aeb.y - ent.y, aeb.x - ent.x);
          var aebDiff = Math.abs(Math.atan2(Math.sin(aebAng - ent.angle), Math.cos(aebAng - ent.angle)));
          if (aebDiff <= halfArc + 0.25) {
            ent.hp -= (aeb.damage || 14);
            spawnParticles(aeb.x, aeb.y, '#00f3ff', 5, 90, 2);
            spawnParticles(aeb.x, aeb.y, '#ffffff', 3, 60, 1.5);
            enemyBullets.splice(bi, 1);
            if (AudioFX && typeof AudioFX.hit === 'function') AudioFX.hit();
            if (ent.hp <= 0) break;
          }
        }
      }

      // 2. 穿過屏障的友軍子彈獲得折射增幅：傷害 +30%、速度 +200 px/s、穿透 +1、青藍能量光暈
      var pBullets = rt.state.bullets || [];
      for (var pbi = 0; pbi < pBullets.length; pbi += 1) {
        var apb = pBullets[pbi];
        if (!apb || apb.aegisRefracted) continue;
        var apbDist2 = dist2(ent.x, ent.y, apb.x, apb.y);
        var apReach = ent.r + 16;
        if (apbDist2 <= apReach * apReach) {
          var apbAng = Math.atan2(apb.y - ent.y, apb.x - ent.x);
          var apbDiff = Math.abs(Math.atan2(Math.sin(apbAng - ent.angle), Math.cos(apbAng - ent.angle)));
          if (apbDiff <= halfArc + 0.35) {
            apb.aegisRefracted = true;
            apb.damage = Math.round(apb.damage * 1.30);
            var aSpd = Math.hypot(apb.vx, apb.vy);
            if (aSpd > 0) {
              var aNewSpd = aSpd + 200;
              apb.vx = (apb.vx / aSpd) * aNewSpd;
              apb.vy = (apb.vy / aSpd) * aNewSpd;
            }
            apb.pierce = (apb.pierce || 0) + 1;
            apb.colorCore = '#00f3ff';
            apb.colorTrail = 'rgba(0, 243, 255, 0.65)';
            spawnParticles(apb.x, apb.y, '#00f3ff', 6, 110, 2);
          }
        }
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
    } else if (ent.kind === 'aegis-barrier') {
      var halfArc = (ent.arc || (130 * Math.PI / 180)) * 0.5;
      var aStart = (ent.angle || 0) - halfArc;
      var aEnd = (ent.angle || 0) + halfArc;
      var hpRatio = clamp(ent.hp / (ent.maxHp || 240), 0, 1);

      // Outer glow arc
      ctx.strokeStyle = 'rgba(0, 243, 255, ' + (0.35 * hpRatio + 0.15) + ')';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, ent.r, aStart, aEnd);
      ctx.stroke();

      // Main hard-light core arc
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, ent.r, aStart, aEnd);
      ctx.stroke();

      // Inner refraction lattice
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, ent.r - 2, aStart + 0.08, aEnd - 0.08);
      ctx.stroke();

      // Honeycomb rib lines
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.55)';
      ctx.lineWidth = 2;
      for (var seg = 0; seg <= 4; seg += 1) {
        var segAng = aStart + (seg / 4) * (aEnd - aStart);
        ctx.beginPath();
        ctx.moveTo(Math.cos(segAng) * (ent.r - 8), Math.sin(segAng) * (ent.r - 8));
        ctx.lineTo(Math.cos(segAng) * (ent.r + 4), Math.sin(segAng) * (ent.r + 4));
        ctx.stroke();
      }

      // Emitter base at center
      ctx.fillStyle = '#142c33';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Health bar above
      if (ent.maxHp && ent.hp < ent.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-14, -ent.r - 12, 28, 3.5);
        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(-14, -ent.r - 12, 28 * hpRatio, 3.5);
      }
    }

    ctx.restore();
  }
}
