import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { pushFxEvent } from '../../core/fx-events.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { triggerHaptic } from '../../core/settings.js';
import { clamp, dist2 } from '../../core/utils.js';
import { enemyProfile } from '../../data/enemies.js';
import { explodeBarrel } from '../combat.js';
import { fireArtillery } from '../spawning.js';
import { dropBossShard } from '../drops.js';
import { logEvent } from '../../ui/hud.js';
import { stepBoss, stepTitanHarpoon } from './bosses.js';
import { updateEnemyPartCache } from './boss-parts.js';
import { clearShieldsOwnedBy, refreshSovereignShield } from './enemy-defense.js';
import { pushEnemyBullet, scaledShot } from './enemy-bullets.js';
import { blastAt, grantBossLoot, primeEnemy as primeNewEnemy, stepNewEnemy } from './new-enemies.js';

var ENEMY_STRATEGIES = Object.create(null);

function angDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function registerEnemyStrategy(kind, strategy) {
  ENEMY_STRATEGIES[kind] = strategy;
}

export function getEnemyStrategy(kind) {
  return ENEMY_STRATEGIES[kind] || null;
}

export function stepEnemyStrategy(e, dt, frame, empFrozen, isCulled) {
  var strat = ENEMY_STRATEGIES[e.kind];
  if (strat && typeof strat.step === 'function') {
    return strat.step(e, dt, frame, empFrozen, isCulled);
  }
  return null;
}

export function filterEnemyStrategyDamage(e, amount, info) {
  var strat = ENEMY_STRATEGIES[e.kind];
  if (strat && typeof strat.filterDamage === 'function') {
    return strat.filterDamage(e, amount, info);
  }
  return null;
}

export function handleEnemyStrategyDeath(ev) {
  var strat = ENEMY_STRATEGIES[ev.kind];
  if (strat && typeof strat.onDeath === 'function') {
    return strat.onDeath(ev);
  }
  return false;
}

export function primeEnemyStrategy(kind, e) {
  var strat = ENEMY_STRATEGIES[kind];
  if (strat && typeof strat.prime === 'function') {
    return strat.prime(e);
  }
  return primeNewEnemy(kind, e);
}

// -------------------------------------------------------------
// Standard Strategies Registration
// -------------------------------------------------------------

registerEnemyStrategy('crawler', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    if (rt.state.wolfPackSurge && !empFrozen && !isCulled) {
      var p = frame.p;
      var slotAngle = (e.phase || 0) + rt.state.waveTime * 0.6;
      var slotX = p.x + Math.cos(slotAngle) * 80;
      var slotY = p.y + Math.sin(slotAngle) * 80;
      var distToSlot = Math.hypot(slotX - e.x, slotY - e.y);
      if (distToSlot > 20) {
        return {
          dx: slotX - e.x,
          dy: slotY - e.y,
          d: distToSlot
        };
      }
    }
    return null;
  }
});

registerEnemyStrategy('rusher', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    var p = frame.p;
    if (e.burstCd === undefined) { e.burstCd = 1.5 + rng('spawn') * 1.0; e.burstTime = 0; }
    if (empFrozen || isCulled) return null;

    var speed = e.speed * 1.20;
    var dx = p.x - e.x;
    var dy = p.y - e.y;
    var d = Math.hypot(dx, dy) || 1;

    if (e.burstTime > 0) {
      e.burstTime -= dt;
      speed = e.speed * 1.55 * 1.20;
      if (e.burstAngle !== undefined) {
        dx = Math.cos(e.burstAngle);
        dy = Math.sin(e.burstAngle);
        d = 1;
      }
      if (e.burstTime <= 0) e.burstCd = 2.4;
    } else if (e.burstCd > 0) {
      e.burstCd -= dt;
      if (e.burstCd <= 0.30 && e.burstCd > 0) {
        speed = e.speed * 0.25;
        e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
      } else if (e.burstCd > 0.30) {
        var pvx = p.vx || 0;
        var pvy = p.vy || 0;
        var pSpd = Math.hypot(pvx, pvy);
        var flankSide = e.flankSide || 1;
        var targetX, targetY;
        if (pSpd > 15) {
          var nx = -pvy / pSpd;
          var ny = pvx / pSpd;
          targetX = p.x + pvx * 0.8 + flankSide * nx * 130;
          targetY = p.y + pvy * 0.8 + flankSide * ny * 130;
        } else {
          var baseAng = Math.atan2(e.y - p.y, e.x - p.x);
          targetX = p.x + Math.cos(baseAng + flankSide * 0.6) * 120;
          targetY = p.y + Math.sin(baseAng + flankSide * 0.6) * 120;
        }
        dx = targetX - e.x;
        dy = targetY - e.y;
        d = Math.hypot(dx, dy) || 1;
      }
      if (e.burstCd <= 0) {
        e.burstTime = 0.30;
        e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
        speed = e.speed * 1.55 * 1.20;
        dx = Math.cos(e.burstAngle);
        dy = Math.sin(e.burstAngle);
        d = 1;
      }
    }
    return { dx: dx, dy: dy, d: d, speed: speed };
  }
});

registerEnemyStrategy('artillery', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    var p = frame.p;
    var dx = p.x - e.x;
    var dy = p.y - e.y;
    var distToP = Math.hypot(dx, dy) || 1;
    e.barrelAngle = Math.atan2(dy, dx);

    if (isCulled) {
      return { speed: e.speed, dx: dx, dy: dy, d: distToP };
    }
    e.timeAlive = (e.timeAlive || 0) + dt;
    if (!e.deployed) {
      if ((distToP >= 180 && distToP <= 340) || e.timeAlive > 4) {
        e.deployed = true;
        e.siegeTimer = 0.9;
        e.cooldown = 0;
        return { speed: 0, dx: dx, dy: dy, d: distToP };
      }
      return { speed: e.speed, dx: dx, dy: dy, d: distToP };
    }
    if (!empFrozen) {
      if (e.siegeTimer > 0) {
        e.siegeTimer -= dt;
        if (e.siegeTimer <= 0) {
          fireArtillery(e);
          e.cooldown = 3.8;
        }
      } else if (e.cooldown > 0) {
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          fireArtillery(e);
          e.cooldown = 3.8;
        }
      }
    }
    return { speed: 0, dx: dx, dy: dy, d: distToP };
  }
});

registerEnemyStrategy('elite', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    var p = frame.p;
    var boundW = frame.boundW;
    var boundH = frame.boundH;

    if (e.affix === 'mirror' || e.affix2 === 'mirror') {
      e.shieldAngle = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.shieldBrokenTimer > 0) {
        e.shieldBrokenTimer = Math.max(0, e.shieldBrokenTimer - dt);
      }
    }
    if (e.affix === 'command' || e.affix2 === 'command') {
      if (!empFrozen) {
        e.commandTimer = (e.commandTimer !== undefined ? e.commandTimer : 2.5) - dt;
        if (e.commandTimer <= 0) {
          e.commandTimer = 2.5;
          rt.state.shockRings.push({
            x: e.x, y: e.y, r: 8, maxR: 150,
            life: 0.45, maxLife: 0.45, color: '#e69535'
          });
          spawnParticles(e.x, e.y, '#f59e0b', 12, 140, 2.5);
          var cmdR2 = 150 * 150;
          for (var ci = 0; ci < rt.state.enemies.length; ci += 1) {
            var ce = rt.state.enemies[ci];
            if (ce.kind === 'crawler' || ce.kind === 'rusher') {
              if (dist2(e.x, e.y, ce.x, ce.y) <= cmdR2) {
                ce.commandBuffTimer = 2.5;
                spawnParticles(ce.x, ce.y, '#e69535', 4, 80, 2);
              }
            }
          }
        }
      }
    }
    if (e.affix === 'blink' || e.affix2 === 'blink') {
      if (!empFrozen) {
        e.blinkTimer = (e.blinkTimer !== undefined ? e.blinkTimer : 3.2) - dt;
        e.blinkTelegraph = (e.blinkTimer <= 0.3 && e.blinkTimer > 0);
        if (e.blinkTimer <= 0) {
          e.blinkTimer = 3.2;
          e.blinkTelegraph = false;
          var flankSide = rng('combat') < 0.5 ? 1 : -1;
          var flankAngle = (p.aim !== undefined ? p.aim : 0) + flankSide * (Math.PI / 2);
          var oldX = e.x;
          var oldY = e.y;
          e.x = clamp(p.x + Math.cos(flankAngle) * 110, e.r, boundW - e.r);
          e.y = clamp(p.y + Math.sin(flankAngle) * 110, e.r, boundH - e.r);
          spawnParticles(oldX, oldY, '#75d1b0', 10, 140, 2.5);
          spawnParticles(oldX, oldY, '#ffffff', 8, 110, 2);
          spawnParticles(e.x, e.y, '#75d1b0', 12, 160, 3);
          spawnParticles(e.x, e.y, '#ffffff', 8, 130, 2);
          AudioFX.dash();
        }
      }
    }

    if (!empFrozen && !isCulled) {
      e.shootCd = (e.shootCd || 3.5) - dt;
      if (e.shootCd <= 0) {
        e.shootCd = 3.5;
        var baseAngle = Math.atan2(p.y - e.y, p.x - e.x);
        var spread = [-0.26, 0, 0.26];
        for (var si = 0; si < spread.length; si += 1) {
          var sa = baseAngle + spread[si];
          var eliteShot = scaledShot(14, 115, true);
          pushEnemyBullet({
            type: 'basic',
            x: e.x + Math.cos(sa) * (e.r + 4),
            y: e.y + Math.sin(sa) * (e.r + 4),
            vx: Math.cos(sa) * eliteShot.speed,
            vy: Math.sin(sa) * eliteShot.speed,
            r: 3.5,
            damage: eliteShot.damage,
            life: 6,
            color: '#75d1b0',
            glowColor: '#7cf0c8'
          });
        }
        spawnParticles(e.x, e.y, '#75d1b0', 5, 80, 2);
      }
    }

    if (!e.ringTriggered && !isCulled && e.hp < e.maxHp * 0.5) {
      e.ringTriggered = true;
      var rdx = p.x - e.x;
      var rdy = p.y - e.y;
      var edpDist2 = rdx * rdx + rdy * rdy;
      if (edpDist2 <= 120 * 120) {
        var edpDist = Math.sqrt(edpDist2) || 1;
        var pushX = (rdx / edpDist) * 15;
        var pushY = (rdy / edpDist) * 15;
        p.x = clamp(p.x + pushX, p.r, boundW - p.r);
        p.y = clamp(p.y + pushY, p.r, boundH - p.r);
        p.slowTimer = Math.max(p.slowTimer || 0, 0.5);
      }
      rt.state.shockRings.push({ x: e.x, y: e.y, r: 8, maxR: 120, life: 0.35, maxLife: 0.35, color: '#75d1b0' });
      rt.state.shake = Math.max(rt.state.shake, 5);
      spawnParticles(e.x, e.y, '#75d1b0', 12, 160, 3);
      AudioFX.dash();
    }
    return null;
  }
});

registerEnemyStrategy('titan', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    var p = frame.p;
    var boundW = frame.boundW;
    var boundH = frame.boundH;

    updateEnemyPartCache(e, p);
    if (e.partCache) e.partCache._frameTime = rt.state.waveTime;
    if (e.treadDestroyed) {
      e.speed = (e.baseSpeed || 50) * 0.6;
    }
    if (e.radiatorExposeTimer > 0) {
      e.radiatorExposeTimer -= dt;
      if (e.radiatorExposeTimer <= 0) {
        e.radiatorExposed = false;
      }
    }

    // Titan crushing barrels
    if (rt.state.barrels && rt.state.barrels.length) {
      for (var bi = rt.state.barrels.length - 1; bi >= 0; bi -= 1) {
        var b = rt.state.barrels[bi];
        var crushDist = (e.r || 40) + (b.r || 14) + 15;
        if (dist2(e.x, e.y, b.x, b.y) <= crushDist * crushDist) {
          explodeBarrel(b, bi, false);
        }
      }
    }

    // Molten lava footprint every 0.45s
    e.treadLavaTimer = (e.treadLavaTimer || 0.45) - dt;
    if (e.treadLavaTimer <= 0) {
      e.treadLavaTimer = 0.45;
      if (!rt.state.artilleryTargets) rt.state.artilleryTargets = [];
      rt.state.artilleryTargets.push({
        x: e.x, y: e.y, r: 28, timer: 6.0, maxTimer: 6.0,
        wave: rt.state.wave || 1, state: 'molten', damageTickTimer: 0
      });
    }

    // Titan Harpoon
    stepTitanHarpoon(e, dt, frame);

    if (!empFrozen && !e.leftCannonDestroyed) {
      e.shootCd = (e.shootCd || 2.8) - dt;
      if (e.shootCd <= 0) {
        e.shootCd = 2.8;
        var tBaseAngle = Math.atan2(p.y - e.y, p.x - e.x);
        var twinOffsets = [-0.14, 0.14];
        for (var tii = 0; tii < twinOffsets.length; tii += 1) {
          var ta = tBaseAngle + twinOffsets[tii];
          var twin = scaledShot(18, 140, true);
          pushEnemyBullet({
            type: 'basic',
            fromBoss: true,
            x: e.x + Math.cos(ta) * (e.r + 8),
            y: e.y + Math.sin(ta) * (e.r + 8),
            vx: Math.cos(ta) * twin.speed,
            vy: Math.sin(ta) * twin.speed,
            r: 5.5,
            damage: twin.damage,
            life: 7,
            glow: true,
            color: '#ff5533',
            glowColor: '#ff3b1a'
          });
        }
        spawnParticles(e.x, e.y, '#ff5533', 8, 120, 3);
        AudioFX.mortarLaunch();
      }
    }

    var phaseEarly = 0;
    if (rt.state.recipe && typeof rt.state.recipe.bossPhaseEarly === 'number') phaseEarly = rt.state.recipe.bossPhaseEarly;
    if (phaseEarly < 0) phaseEarly = 0;
    if (phaseEarly > 0.4) phaseEarly = 0.4;
    if (!e.phase2Triggered && e.hp <= e.maxHp * (0.5 + phaseEarly)) {
      e.phase2Triggered = true;
      rt.state.banner = 3.5;
      rt.state.bannerText = 'TITAN ENRAGED // BARRAGE PROTOCOL';
      if (rt.ui && rt.ui.statusText) rt.ui.statusText.textContent = 'TITAN ENRAGED // BARRAGE PROTOCOL';
      logEvent('TITAN ENRAGED // BARRAGE PROTOCOL');
      rt.state.shake = Math.max(rt.state.shake, 14);
      triggerHaptic([50, 40, 80, 40, 100]);
      AudioFX.blast();
      AudioFX.stormSiren();

      var tdx = p.x - e.x;
      var tdy = p.y - e.y;
      var tpDist2 = tdx * tdx + tdy * tdy;
      if (tpDist2 <= 180 * 180) {
        var tpDist = Math.sqrt(tpDist2) || 1;
        p.x = clamp(p.x + (tdx / tpDist) * 30, p.r, boundW - p.r);
        p.y = clamp(p.y + (tdy / tpDist) * 30, p.r, boundH - p.r);
        p.slowTimer = Math.max(p.slowTimer || 0, 0.6);
      }
      rt.state.shockRings.push({
        x: e.x, y: e.y, r: 14, maxR: 180, life: 0.45, maxLife: 0.45, color: '#ff4d2e'
      });
      spawnParticles(e.x, e.y, '#ff4d2e', 24, 220, 4);
      spawnParticles(e.x, e.y, '#ffd27d', 16, 170, 3);
      pushFxEvent('titanPhase', e.x, e.y, null);
    }

    if (e.phase2Triggered && !empFrozen) {
      e.spiralCd = (e.spiralCd || 3.2) - dt;
      if (e.spiralCd <= 0) {
        e.spiralCd = 3.2;
        e.spiralAngle = (e.spiralAngle || 0) + 0.38;
        if (!e.radiatorDestroyed) {
          e.radiatorExposed = true;
          e.radiatorExposeTimer = 3.2;
          spawnParticles(e.x, e.y, '#ffd27d', 10, 120, 2.5);
        }
        for (var spi = 0; spi < 8; spi += 1) {
          var sAng = e.spiralAngle + (spi * TAU / 8);
          var spiral = scaledShot(16, 130, true);
          pushEnemyBullet({
            type: 'spiral',
            fromBoss: true,
            x: e.x + Math.cos(sAng) * (e.r + 6),
            y: e.y + Math.sin(sAng) * (e.r + 6),
            vx: Math.cos(sAng) * spiral.speed,
            vy: Math.sin(sAng) * spiral.speed,
            r: 4.5,
            damage: spiral.damage,
            life: 6.5,
            glow: true,
            color: '#ff7733',
            glowColor: '#ff4d2e'
          });
        }
        spawnParticles(e.x, e.y, '#ff7733', 12, 140, 3);
        AudioFX.shoot();
      }

      if (!e.rightPodDestroyed) {
        e.summonCd = (e.summonCd || 6.0) - dt;
        if (e.summonCd <= 0) {
          e.summonCd = 6.0;
          for (var smi = 0; smi < 2; smi += 1) {
            var smOffset = smi === 0 ? -40 : 40;
            var summoned = enemyProfile('rusher', rt.state.wave, rt.state.recipe);
            rt.state.enemies.push({
              kind: 'rusher',
              x: clamp(e.x + smOffset, 24, boundW - 24),
              y: clamp(e.y + (rng('spawn') - 0.5) * 30, 24, boundH - 24),
              r: summoned.r,
              hp: summoned.hp,
              maxHp: summoned.maxHp,
              speed: summoned.speed,
              damage: summoned.damage,
              color: summoned.color,
              touchCooldown: 0,
              phase: rng('spawn') * TAU,
              burstCd: 1.2,
              burstTime: 0,
              burstAngle: 0,
              trail: []
            });
            spawnParticles(e.x + smOffset, e.y, '#e1a644', 8, 120, 2.5);
          }
          AudioFX.levelUp();
        }
      }
    }
    return null;
  }
});

registerEnemyStrategy('dreadnought', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepBoss(e, dt, frame, empFrozen);
  },
  filterDamage: function (e, amount, info) {
    if (info && info.source === 'bullet' && info.x != null && info.y != null) {
      var hitAng = Math.atan2(info.y - e.y, info.x - e.x);
      var rear = (e.aim || 0) + Math.PI;
      if (Math.abs(angDiff(hitAng, rear)) <= Math.PI / 3) {
        amount *= (e.empTimer > 0 ? 2 : 1.5);
      }
    }
    if (info && info.source === 'barrel' && e.empTimer > 0) {
      amount *= 2;
    }
    return amount;
  },
  onDeath: function (ev) {
    grantBossLoot(ev, 4);
    return true;
  }
});

registerEnemyStrategy('sovereign', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepBoss(e, dt, frame, empFrozen);
  },
  filterDamage: function (e, amount, info) {
    if (refreshSovereignShield(e)) return 0;
    return amount;
  },
  onDeath: function (ev) {
    grantBossLoot(ev, 5);
    return true;
  }
});

registerEnemyStrategy('spitter', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepNewEnemy(e, dt, frame, empFrozen);
  },
  prime: function (e) {
    e.spitCd = 0.8 + ((e.phase || 0) % 1) * 1.6;
  }
});

registerEnemyStrategy('scurrier', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepNewEnemy(e, dt, frame, empFrozen);
  },
  prime: function (e) {
    e.arming = false;
    e.armTimer = 0;
  },
  onDeath: function (ev) {
    if (ev.cause === 'dash' || !ev.arming) return true;
    blastAt(ev.x, ev.y, 70, 0, 60, '#e07a3d');
    return true;
  }
});

registerEnemyStrategy('warden', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepNewEnemy(e, dt, frame, empFrozen);
  },
  prime: function (e) {
    e.shieldCd = 1.5 + ((e.phase || 0) % 1) * 2;
  },
  onDeath: function (ev) {
    if (ev.ref) clearShieldsOwnedBy(ev.ref);
    return true;
  }
});

registerEnemyStrategy('burrower', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepNewEnemy(e, dt, frame, empFrozen);
  },
  prime: function (e) {
    e.state = 'burrow';
    e.burrowed = true;
    e.untargetable = true;
    e.burrowT = 2.5;
    var stats = enemyProfile('burrower', (rt.state && rt.state.wave) || 1, rt.state && rt.state.recipe);
    e.speed = stats.speed;
  },
  filterDamage: function (e, amount, info) {
    if (e.burrowed && !e.forceEmerge) return 0;
    return amount;
  }
});

registerEnemyStrategy('mine', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepNewEnemy(e, dt, frame, empFrozen);
  },
  onDeath: function (ev) {
    if (ev.ref && !ev.ref.detonated) {
      ev.ref.detonated = true;
      var mineDmg = scaledShot(25, 0, true).damage;
      blastAt(ev.x, ev.y, 80, mineDmg, 40, '#e0a84e');
      return true;
    }
    return false;
  }
});

registerEnemyStrategy('stormTower', {
  step: function (e, dt, frame, empFrozen, isCulled) {
    return stepNewEnemy(e, dt, frame, empFrozen);
  },
  filterDamage: function (e, amount, info) {
    if (info && (info.source === 'emp' || info.source === 'spire')) return amount * 3;
    return amount;
  }
});
