import { AudioFX } from '../../audio/audio-fx.js';
import { TAU } from '../../config.js';
import { spawnParticles } from '../../core/pools.js';
import { rng } from '../../core/rng.js';
import { rt } from '../../core/runtime.js';
import { clamp } from '../../core/utils.js';
import { damageEnemy } from '../combat.js';
import { spawnEnemy } from '../spawning.js';

export function spawnScrapBurst(cx, cy, count) {
  if (!rt.state || !rt.state.orbs) return;
  var n = Math.min(count || 60, 100);
  for (var i = 0; i < n; i += 1) {
    var ang = rng('spawn') * TAU;
    var speed = 80 + rng('spawn') * 160;
    rt.state.orbs.push({
      x: cx + Math.cos(ang) * 15,
      y: cy + Math.sin(ang) * 15,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: 4.5,
      val: 1,
      kind: 'scrap'
    });
  }
}

export var POI_REGISTRY = {
  // 1. Scrap Extraction Silo
  scrap_silo: {
    kind: 'scrap_silo',
    step: function (poi, dt, frame, inRange) {
      var p = (frame && frame.p) || (rt.state ? rt.state.player : null);
      var enemies = (rt.state && rt.state.enemies) || [];

      if (poi.status === 'idle') {
        if (inRange) {
          poi.interactTimer += dt;
          poi.progress = Math.min(1, poi.interactTimer / 1.5);
          if (poi.interactTimer >= 1.5) {
            poi.status = 'active';
            poi.activeTimer = poi.targetTime || 20.0;
            poi.progress = 0;
            poi.shockTimer = 0;
            if (AudioFX && typeof AudioFX.bountyClaim === 'function') AudioFX.bountyClaim();
            if (rt.state) {
              rt.state.banner = 2.0;
              rt.state.bannerText = 'SILO OVERCHARGE DEFENSE: 20s HAZARD LOCKDOWN!';
            }
            // Spawn initial guard wave
            for (var si = 0; si < 5; si += 1) spawnEnemy();
          }
        } else {
          poi.interactTimer = Math.max(0, poi.interactTimer - dt * 1.5);
          poi.progress = poi.interactTimer / 1.5;
        }
      } else if (poi.status === 'active') {
        poi.activeTimer -= dt;
        poi.progress = Math.min(1, 1 - (poi.activeTimer / (poi.targetTime || 20.0)));
        poi.shockTimer += dt;

        // Seismic shockwave every 5 seconds
        if (poi.shockTimer >= 5.0) {
          poi.shockTimer = 0;
          if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
          if (rt.state.shockRings) {
            rt.state.shockRings.push({ x: poi.x, y: poi.y, r: 10, maxR: 180, life: 0.45, maxLife: 0.45, color: '#f5a623' });
          }
          // Pushback and stun nearby enemies
          for (var ei = 0; ei < enemies.length; ei += 1) {
            var e = enemies[ei];
            if (!e || e.hp <= 0) continue;
            var edx = e.x - poi.x;
            var edy = e.y - poi.y;
            var eDist = Math.hypot(edx, edy) || 1;
            if (eDist <= 180) {
              e.stun = Math.max(e.stun || 0, 2.0);
              e.vx = (edx / eDist) * 250;
              e.vy = (edy / eDist) * 250;
            }
          }
        }

        // Completion
        if (poi.activeTimer <= 0) {
          poi.status = 'completed';
          poi.progress = 1.0;
          spawnScrapBurst(poi.x, poi.y, 80);
          if (p) {
            p.magnetRadius = Math.max(p.magnetRadius || 165, 600);
            p.magnetBonusTimer = 5.0;
          }
          if (rt.state) {
            rt.state.banner = 2.5;
            rt.state.bannerText = 'EXTRACTION COMPLETE: +80 REFINED SCRAP & 600px VACUUM!';
          }
        }
      }
    },
    draw: function (ctx, poi, pulse, rTime, reduced) {
      var px = poi.x;
      var py = poi.y;
      var pr = poi.r || 80;
      var isActive = poi.status === 'active';
      var isDone = poi.status === 'completed';

      // Ground hazard warning circle
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = isActive ? (reduced ? '#ff4028' : (Math.sin(rTime * 12) > 0 ? '#ff4028' : '#ffd43b')) : (isDone ? '#38d9a9' : 'rgba(255, 212, 59, 0.55)');
      ctx.lineWidth = isActive ? 3.5 : 2.0;
      ctx.setLineDash(isActive ? [8, 6] : [6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Progress Arc
      if (poi.progress > 0 && poi.progress < 1) {
        ctx.beginPath();
        ctx.arc(px, py, pr + 4, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * poi.progress);
        ctx.strokeStyle = isActive ? '#ff4028' : '#ffd43b';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // Base Platform
      ctx.fillStyle = '#212529';
      ctx.fillRect(px - 32, py - 32, 64, 64);
      ctx.strokeStyle = '#495057';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px - 32, py - 32, 64, 64);

      // Drill Towers
      ctx.fillStyle = isActive ? '#f59f00' : '#868e96';
      ctx.fillRect(px - 22, py - 24, 16, 48);
      ctx.fillRect(px + 6, py - 24, 16, 48);

      // Hazard Stripes on Silo
      ctx.fillStyle = '#111';
      ctx.fillRect(px - 22, py - 6, 16, 6);
      ctx.fillRect(px + 6, py - 6, 16, 6);

      // Center Core
      ctx.beginPath();
      ctx.arc(px, py, 14 * pulse, 0, TAU);
      ctx.fillStyle = isDone ? '#38d9a9' : (isActive ? '#ff6b6b' : '#ffd43b');
      ctx.fill();

      // Top Beacon
      ctx.beginPath();
      ctx.arc(px, py - 36, 6, 0, TAU);
      ctx.fillStyle = isActive ? (Math.sin(rTime * 14) > 0 ? '#ff0000' : '#ffffff') : (isDone ? '#38d9a9' : '#ffd43b');
      ctx.fill();
    },
    getLight: function (poi) {
      if (poi.status === 'active') {
        return { radius: 140, color: '#ffd43b', intensity: 0.65 };
      }
      return null;
    }
  },

  // 2. Orbital Drop Pod
  orbital_pod: {
    kind: 'orbital_pod',
    step: function (poi, dt, frame, inRange) {
      var p = (frame && frame.p) || (rt.state ? rt.state.player : null);

      if (poi.status === 'idle') {
        if (inRange) {
          poi.interactTimer += dt;
          poi.progress = Math.min(1, poi.interactTimer / 1.0);
          if (poi.interactTimer >= 1.0) {
            poi.status = 'completed';
            poi.progress = 1.0;
            if (p) {
              p.energy = p.maxEnergy || 100;
              p.hp = Math.min(p.maxHp || 100, p.hp + 50);
              p.overdrive = Math.max(p.overdrive || 0, 6.0);
            }
            spawnParticles(poi.x, poi.y, '#38d9a9', 24, 160, 3);
            if (AudioFX && typeof AudioFX.overdriveStart === 'function') AudioFX.overdriveStart();
            if (rt.state) {
              rt.state.banner = 2.2;
              rt.state.bannerText = 'ORBITAL POD OPENED: FULL OVERDRIVE & BATTERY OVERCHARGE!';
            }
          }
        } else {
          poi.interactTimer = Math.max(0, poi.interactTimer - dt * 2);
          poi.progress = poi.interactTimer / 1.0;
        }
      }
    },
    draw: function (ctx, poi, pulse, rTime, reduced) {
      var px = poi.x;
      var py = poi.y;
      var pr = poi.r || 80;
      var podDone = poi.status === 'completed';

      // Landing Scorch & Beam
      if (!podDone) {
        var grad = ctx.createLinearGradient(px, py, px, py - 160);
        grad.addColorStop(0, 'rgba(56, 217, 169, 0.45)');
        grad.addColorStop(1, 'rgba(56, 217, 169, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - 14, py - 160, 28, 160);
      }

      // Ground Ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = podDone ? 'rgba(56, 217, 169, 0.3)' : 'rgba(56, 217, 169, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (poi.progress > 0 && poi.progress < 1) {
        ctx.beginPath();
        ctx.arc(px, py, pr + 4, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * poi.progress);
        ctx.strokeStyle = '#38d9a9';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }

      // Pod Octagonal Hull
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      for (var pi = 0; pi < 8; pi += 1) {
        var ang = (pi / 8) * TAU + Math.PI / 8;
        var hx = Math.cos(ang) * 26;
        var hy = Math.sin(ang) * 26;
        if (pi === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = podDone ? '#343a40' : '#495057';
      ctx.fill();
      ctx.strokeStyle = podDone ? '#212529' : '#20c997';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Vent ports
      ctx.fillStyle = podDone ? '#111' : '#63e6be';
      ctx.fillRect(-10, -10, 20, 20);
      ctx.restore();
    },
    getLight: function (poi) {
      if (poi.status !== 'completed') {
        return { radius: 120, color: '#38d9a9', intensity: 0.7 };
      }
      return null;
    }
  },

  // 3. Field Modification Rig
  field_rig: {
    kind: 'field_rig',
    step: function (poi, dt, frame, inRange) {
      var p = (frame && frame.p) || (rt.state ? rt.state.player : null);

      if (poi.status === 'idle') {
        if (inRange) {
          poi.interactTimer += dt;
          poi.progress = Math.min(1, poi.interactTimer / 0.8);
          if (poi.interactTimer >= 0.8) {
            poi.status = 'completed';
            poi.progress = 1.0;
            if (p) {
              p.fireRate = Math.max(0.08, p.fireRate * 0.75);
              p.damageTakenMult = (p.damageTakenMult || 1) * 0.80;
              p.speed = Math.round(p.speed * 1.15);
            }
            spawnParticles(poi.x, poi.y, '#4dabf7', 20, 140, 2.8);
            if (AudioFX && typeof AudioFX.upgrade === 'function') AudioFX.upgrade();
            if (rt.state) {
              rt.state.banner = 2.5;
              rt.state.bannerText = 'FIELD RIG OVERCLOCK: +35% CYCLIC RATE & HARDENED CHASSIS!';
            }
          }
        } else {
          poi.interactTimer = Math.max(0, poi.interactTimer - dt * 2);
          poi.progress = poi.interactTimer / 0.8;
        }
      }
    },
    draw: function (ctx, poi, pulse, rTime, reduced) {
      var px = poi.x;
      var py = poi.y;
      var pr = poi.r || 80;
      var rigDone = poi.status === 'completed';

      // Holographic workbench ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = rigDone ? 'rgba(77, 171, 247, 0.25)' : 'rgba(77, 171, 247, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (poi.progress > 0 && poi.progress < 1) {
        ctx.beginPath();
        ctx.arc(px, py, pr + 4, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * poi.progress);
        ctx.strokeStyle = '#4dabf7';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }

      // Tracked Vehicle Chassis
      ctx.fillStyle = '#343a40';
      ctx.fillRect(px - 36, py - 20, 72, 40);
      // Treads
      ctx.fillStyle = '#1a1d20';
      ctx.fillRect(px - 38, py - 24, 76, 7);
      ctx.fillRect(px - 38, py + 17, 76, 7);

      // Holographic bench projector
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, TAU);
      ctx.fillStyle = rigDone ? '#212529' : '#1864ab';
      ctx.fill();
      ctx.strokeStyle = rigDone ? '#495057' : '#74c0fc';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crane arm
      ctx.strokeStyle = '#868e96';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px - 10, py);
      ctx.lineTo(px + 18, py - 22);
      ctx.stroke();
    },
    getLight: function (poi) {
      return null;
    }
  },

  // 4. Xeno Nest Fissure
  xeno_nest: {
    kind: 'xeno_nest',
    step: function (poi, dt, frame, inRange) {
      var bullets = (rt.state && rt.state.bullets) || [];
      var enemies = (rt.state && rt.state.enemies) || [];

      if (poi.status !== 'destroyed') {
        poi.spawnTimer += dt;
        // Spawns an enemy every 6.5s
        if (poi.spawnTimer >= 6.5) {
          poi.spawnTimer = 0;
          var spawned = spawnEnemy();
          if (spawned) {
            spawned.x = poi.x + (rng('spawn') - 0.5) * 40;
            spawned.y = poi.y + (rng('spawn') - 0.5) * 40;
          }
        }

        // Bullet collision with nest
        for (var bi = 0; bi < bullets.length; bi += 1) {
          var b = bullets[bi];
          if (!b || b.life <= 0) continue;
          var bDist = Math.hypot(b.x - poi.x, b.y - poi.y);
          if (bDist <= poi.r * 0.75) {
            var dmg = (b.damage || 20) * 0.40; // 60% armor reduction
            poi.hp -= dmg;
            b.life = 0;
            spawnParticles(b.x, b.y, '#b197fc', 4, 80, 2);
            if (poi.hp <= 0) {
              poi.hp = 0;
              poi.status = 'destroyed';
              if (AudioFX && typeof AudioFX.eliteDeath === 'function') AudioFX.eliteDeath();
              spawnParticles(poi.x, poi.y, '#9775fa', 36, 220, 4);
              if (rt.state.shockRings) {
                rt.state.shockRings.push({ x: poi.x, y: poi.y, r: 10, maxR: 200, life: 0.5, maxLife: 0.5, color: '#b197fc' });
              }
              // Kill surrounding trash
              for (var cEi = 0; cEi < enemies.length; cEi += 1) {
                var ce = enemies[cEi];
                if (ce && ce.hp > 0 && Math.hypot(ce.x - poi.x, ce.y - poi.y) <= 200) {
                  damageEnemy(ce, 400);
                }
              }
              spawnScrapBurst(poi.x, poi.y, 40);
              if (rt.state.volatileCores) {
                rt.state.volatileCores.push({ x: poi.x, y: poi.y, r: 14, hp: 40, maxHp: 40, rot: 0 });
              }
              if (rt.state) {
                rt.state.banner = 2.5;
                rt.state.bannerText = 'XENO NEST DESTROYED: SHOCKWAVE DETONATED!';
              }
              break;
            }
          }
        }
      }
    },
    draw: function (ctx, poi, pulse, rTime, reduced) {
      var px = poi.x;
      var py = poi.y;
      var pr = poi.r || 80;
      var nestDead = poi.status === 'destroyed';

      // Chitinous Tendril Rings
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = nestDead ? 'rgba(73, 80, 87, 0.4)' : 'rgba(177, 151, 252, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Organic fleshy mound
      ctx.beginPath();
      ctx.arc(px, py, 34 * (nestDead ? 0.8 : pulse), 0, TAU);
      ctx.fillStyle = nestDead ? '#1a1024' : '#3b1854';
      ctx.fill();
      ctx.strokeStyle = nestDead ? '#495057' : '#9775fa';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Pulsating egg sacs
      if (!nestDead) {
        for (var ni = 0; ni < 3; ni += 1) {
          var nAng = (ni / 3) * TAU + rTime * 1.5;
          var nx = px + Math.cos(nAng) * 16;
          var ny = py + Math.sin(nAng) * 16;
          ctx.beginPath();
          ctx.arc(nx, ny, 7, 0, TAU);
          ctx.fillStyle = '#da77f2';
          ctx.fill();
        }

        // Nest HP Bar
        var hpPct = poi.maxHp > 0 ? clamp(poi.hp / poi.maxHp, 0, 1) : 0;
        ctx.fillStyle = '#111';
        ctx.fillRect(px - 30, py - 46, 60, 6);
        ctx.fillStyle = '#b197fc';
        ctx.fillRect(px - 30, py - 46, 60 * hpPct, 6);
      }
    },
    getLight: function (poi) {
      return null;
    }
  },

  // 5. EMP Resonance Spire
  emp_spire: {
    kind: 'emp_spire',
    step: function (poi, dt, frame, inRange) {
      var bullets = (rt.state && rt.state.bullets) || [];
      var enemies = (rt.state && rt.state.enemies) || [];

      if (poi.status !== 'completed') {
        for (var spBi = 0; spBi < bullets.length; spBi += 1) {
          var spB = bullets[spBi];
          if (!spB || spB.life <= 0) continue;
          var spDist = Math.hypot(spB.x - poi.x, spB.y - poi.y);
          if (spDist <= poi.r * 0.8) {
            poi.hp -= spB.damage || 25;
            spB.life = 0;
            poi.capacitors = Math.max(0, Math.ceil(poi.hp / 80));
            spawnParticles(spB.x, spB.y, '#7950f2', 5, 110, 2);

            if (poi.hp <= 0) {
              poi.hp = 0;
              poi.capacitors = 0;
              poi.status = 'completed';
              if (AudioFX && typeof AudioFX.emp === 'function') AudioFX.emp();
              // Screenwide EMP wave
              for (var sei = 0; sei < enemies.length; sei += 1) {
                var se = enemies[sei];
                if (!se || se.hp <= 0) continue;
                se.stun = Math.max(se.stun || 0, 3.5);
                se.shield = 0;
              }
              if (rt.state.shockRings) {
                rt.state.shockRings.push({ x: poi.x, y: poi.y, r: 10, maxR: 350, life: 0.6, maxLife: 0.6, color: '#7950f2' });
              }
              if (rt.state.lightningArcs) {
                for (var lai = 0; lai < 3; lai += 1) {
                  rt.state.lightningArcs.push({
                    x0: poi.x,
                    y0: poi.y,
                    x1: poi.x + (rng('visual') - 0.5) * 500,
                    y1: poi.y + (rng('visual') - 0.5) * 500,
                    life: 0.35,
                    maxLife: 0.35,
                    color: '#e599f7'
                  });
                }
              }
              if (rt.state) {
                rt.state.banner = 2.5;
                rt.state.bannerText = 'EMP SPIRE OVERLOAD: 3.5s TOTAL FIELD STUN & SHIELDS SHATTERED!';
              }
              break;
            }
          }
        }
      }
    },
    draw: function (ctx, poi, pulse, rTime, reduced) {
      var px = poi.x;
      var py = poi.y;
      var pr = poi.r || 80;
      var spireDone = poi.status === 'completed';

      // Ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = spireDone ? 'rgba(100, 100, 120, 0.3)' : 'rgba(121, 80, 242, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Triangular Base
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      for (var ti = 0; ti < 3; ti += 1) {
        var tAng = (ti / 3) * TAU - Math.PI / 2;
        var tx = Math.cos(tAng) * 28;
        var ty = Math.sin(tAng) * 28;
        if (ti === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.closePath();
      ctx.fillStyle = spireDone ? '#212529' : '#343a40';
      ctx.fill();
      ctx.strokeStyle = spireDone ? '#495057' : '#7950f2';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Capacitors at vertices
      if (!spireDone) {
        for (var ci = 0; ci < poi.capacitors; ci += 1) {
          var cAng = (ci / 3) * TAU - Math.PI / 2;
          var cx = Math.cos(cAng) * 28;
          var cy = Math.sin(cAng) * 28;
          ctx.beginPath();
          ctx.arc(cx, cy, 7 * pulse, 0, TAU);
          ctx.fillStyle = '#e599f7';
          ctx.fill();
        }
      }

      // Central Spire Core
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fillStyle = spireDone ? '#495057' : '#7950f2';
      ctx.fill();
      ctx.restore();
    },
    getLight: function (poi) {
      if (poi.status !== 'completed') {
        return { radius: 130, color: '#7950f2', intensity: 0.7 };
      }
      return null;
    }
  },

  // 6. Bunker Cache
  bunker_cache: {
    kind: 'bunker_cache',
    step: function (poi, dt, frame, inRange) {
      var p = (frame && frame.p) || (rt.state ? rt.state.player : null);
      var bullets = (rt.state && rt.state.bullets) || [];
      var barrels = (rt.state && rt.state.barrels) || [];

      if (poi.status !== 'completed') {
        // Check bullet damage
        for (var bki = 0; bki < bullets.length; bki += 1) {
          var bkB = bullets[bki];
          if (!bkB || bkB.life <= 0) continue;
          var bkDist = Math.hypot(bkB.x - poi.x, bkB.y - poi.y);
          if (bkDist <= poi.r * 0.75) {
            poi.hp -= (bkB.damage || 20);
            bkB.life = 0;
            spawnParticles(bkB.x, bkB.y, '#ffd43b', 4, 90, 2);
          }
        }
        // Check explosive barrel proximity detonations
        for (var barI = 0; barI < barrels.length; barI += 1) {
          var bar = barrels[barI];
          if (bar && bar.state === 'exploding' && Math.hypot(bar.x - poi.x, bar.y - poi.y) <= 120) {
            poi.hp -= 90; // explosive vulnerability
          }
        }

        if (poi.hp <= 0) {
          poi.hp = 0;
          poi.status = 'completed';
          if (p) {
            p.hp = p.maxHp || 100;
            p.guaranteedCrits = (p.guaranteedCrits || 0) + 30;
          }
          spawnParticles(poi.x, poi.y, '#ffd43b', 28, 170, 3.5);
          if (AudioFX && typeof AudioFX.upgrade === 'function') AudioFX.upgrade();
          if (rt.state) {
            rt.state.banner = 2.5;
            rt.state.bannerText = 'BUNKER BREACHED: FULL EMERGENCY REPAIR & 30 AP CRITICAL ROUNDS!';
          }
        }
      }
    },
    draw: function (ctx, poi, pulse, rTime, reduced) {
      var px = poi.x;
      var py = poi.y;
      var pr = poi.r || 80;
      var bunkerDone = poi.status === 'completed';

      // Outer fortified ring
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.strokeStyle = bunkerDone ? 'rgba(255, 212, 59, 0.3)' : 'rgba(255, 212, 59, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Hexagonal Armor Door
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      for (var bi = 0; bi < 6; bi += 1) {
        var bAng = (bi / 6) * TAU;
        var bx = Math.cos(bAng) * 28;
        var by = Math.sin(bAng) * 28;
        if (bi === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.fillStyle = bunkerDone ? '#1a1a1a' : '#2b2b2b';
      ctx.fill();
      ctx.strokeStyle = bunkerDone ? '#495057' : '#ffd43b';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Hazard Warning Bar
      if (!bunkerDone) {
        ctx.fillStyle = '#ffd43b';
        ctx.fillRect(-16, -6, 32, 12);
        ctx.fillStyle = '#111';
        ctx.fillRect(-10, -6, 6, 12);
        ctx.fillRect(4, -6, 6, 12);

        // HP bar if damaged
        if (poi.hp < poi.maxHp) {
          var bHp = clamp(poi.hp / poi.maxHp, 0, 1);
          ctx.fillStyle = '#111';
          ctx.fillRect(-24, -38, 48, 5);
          ctx.fillStyle = '#ffd43b';
          ctx.fillRect(-24, -38, 48 * bHp, 5);
        }
      } else {
        // Blown open interior
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, TAU);
        ctx.fillStyle = '#38d9a9';
        ctx.fill();
      }
      ctx.restore();
    },
    getLight: function (poi) {
      return null;
    }
  }
};

export function registerPoiType(kind, def) {
  POI_REGISTRY[kind] = def;
}

export function getPoiType(kind) {
  return POI_REGISTRY[kind] || null;
}
