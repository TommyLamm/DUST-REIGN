import { AudioFX } from '../audio/audio-fx.js';
import { BOUNTY_SURGE_DURATION, COMBO_WINDOW, MAX_COMBO } from '../config.js';
import { addDecal, spawnParticles } from '../core/pools.js';
import { pushFxEvent } from '../core/fx-events.js';
import { rng } from '../core/rng.js';
import { rt } from '../core/runtime.js';
import { isReducedMotion, triggerHaptic } from '../core/settings.js';
import { addCameraTrauma } from '../core/camera.js';
import { clamp, dist2, fastUnorderedRemove } from '../core/utils.js';
import { triggerReactiveArmor } from './abilities.js';
import { onCrit, onEnemyHit, onKill, onLethal, onPlayerDamaged, onShieldBreak, onTacticalUsed, registerCardHook, unregisterCardHook, clearCardHooks, dispatchCardHook } from './card-effects.js';

export { onCrit, onShieldBreak, onTacticalUsed, registerCardHook, unregisterCardHook, clearCardHooks, dispatchCardHook };
import { noteContractEvent } from './contracts.js';
import { checkStageVictory, onBossDefeated } from './director.js';
import { rollDrops } from './drops.js';
import { filterEnemyDamage } from './sim/enemy-defense.js';
import { isStormFront, triggerGameOver } from './flow.js';
import { noteMetaEvent } from './meta.js';
import { addScore } from './scoring.js';
import { logEvent, setStatusText } from '../ui/hud.js';

function playerHitOpts(source) {
  if (source === 'molten') return { light: 1, source: source };
  return source ? { source: source } : null;
}

/** Canonical death/hit labels for balance reports and game-over. */
export function normalizeDamageSource(source) {
  var s = String(source || 'unknown');
  if (!s) return 'unknown';
  if (s === 'zone') return 'zone:hazard';
  if (s === 'bullet') return 'bullet:projectile';
  if (s === 'contact') return 'contact:enemy';
  if (s === 'acid') return 'dot:acid';
  if (s === 'molten') return 'dot:molten';
  if (s === 'meteor') return 'env:meteor';
  if (s === 'mortar') return 'bullet:mortar';
  if (s === 'core') return 'friendly:core';
  if (s === 'barrel') return 'friendly:barrel';
  if (s === 'lightning') return 'boss:lightning';
  if (s === 'storm-eye') return 'boss:storm-eye';
  if (s === 'corrosion') return 'hardcore:corrosion';
  if (s === 'backlash' || s === 'contract-backlash') return 'contract:backlash';
  if (s === 'poi-overload' || s === 'overload') return 'poi:overload';
  if (s === 'smuggler') return 'meta:smuggler';
  if (s.indexOf('contact:') === 0) return s;
  if (s.indexOf('boss:') === 0) return s;
  if (s.indexOf('bullet:') === 0) return s;
  return s;
}

var CONTACT_KIND_ZH = {
  enemy: '敵機',
  crawler: '爬行者',
  rusher: '衝鋒者',
  brute: '蠻力機',
  artillery: '砲兵',
  elite: '菁英',
  spitter: '噴吐者',
  scurrier: '疾行自爆蟲',
  warden: '衛士',
  burrower: '鑽地蟲',
  prowler: '潛行者',
  bulwark: '堡壘',
  titan: '泰坦',
  dreadnought: '無畏巨艦',
  sovereign: '風暴主宰',
  behemoth: '巨獸',
  mine: '地雷'
};

export function formatDamageSourceLabel(source, zh) {
  var s = normalizeDamageSource(source);
  if (zh) {
    if (s === 'contact:dreadnought') return '無畏衝撞';
    if (s.indexOf('contact:') === 0) {
      var kind = s.slice(8);
      return '接觸 · ' + (CONTACT_KIND_ZH[kind] || kind);
    }
    if (s === 'bullet:projectile') return '敵彈';
    if (s === 'bullet:mortar') return '迫擊砲';
    if (s === 'dot:acid') return '酸液';
    if (s === 'dot:molten') return '熔岩';
    if (s === 'env:meteor') return '隕石';
    if (s === 'zone:hazard') return '範圍爆炸';
    if (s === 'boss:lightning') return '首領雷擊';
    if (s === 'boss:storm-eye') return '風暴之眼';
    if (s === 'friendly:core') return '不穩定核心';
    if (s === 'friendly:barrel') return '友軍桶爆';
    if (s === 'hardcore:corrosion') return '硬核腐蝕';
    if (s === 'contract:backlash') return '合約反噬';
    if (s === 'poi:overload') return '據點過載';
    if (s === 'meta:smuggler') return '走私交易';
    if (s === 'boss:dreadnought' || s === 'boss:flak') return '無畏散彈';
    if (s === 'boss:titan') return '泰坦彈幕';
    if (s === 'boss:sovereign') return '主宰彈幕';
    if (s === 'boss:spiral') return '首領螺旋彈';
    if (s === 'boss:shot' || s === 'boss:basic') return '首領彈幕';
    if (s === 'bullet:elite') return '菁英彈';
    if (s === 'bullet:burrower' || s === 'bullet:spike') return '鑽地蟲尖刺';
    if (s.indexOf('bullet:') === 0) return '敵彈 · ' + s.slice(7);
    if (s === 'unknown') return '不明傷害';
    return s;
  }
  if (s === 'contact:dreadnought') return 'DREAD CHARGE';
  if (s.indexOf('contact:') === 0) return 'CONTACT · ' + s.slice(8).toUpperCase();
  if (s === 'bullet:projectile') return 'HOSTILE ROUND';
  if (s === 'bullet:mortar') return 'MORTAR';
  if (s === 'dot:acid') return 'ACID';
  if (s === 'dot:molten') return 'MOLTEN';
  if (s === 'env:meteor') return 'METEOR';
  if (s === 'zone:hazard') return 'BLAST ZONE';
  if (s === 'boss:lightning') return 'LIGHTNING';
  if (s === 'boss:storm-eye') return 'STORM EYE';
  if (s === 'friendly:core') return 'VOLATILE CORE';
  if (s === 'friendly:barrel') return 'FRIENDLY BARREL';
  if (s === 'hardcore:corrosion') return 'CORROSION';
  if (s === 'contract:backlash') return 'CONTRACT BACKLASH';
  if (s === 'poi:overload') return 'POI OVERLOAD';
  if (s === 'meta:smuggler') return 'SMUGGLER DEAL';
  if (s === 'boss:dreadnought' || s === 'boss:flak') return 'DREAD FLAK';
  if (s === 'boss:titan') return 'TITAN SHOT';
  if (s === 'boss:sovereign') return 'SOVEREIGN SHOT';
  if (s === 'boss:spiral') return 'BOSS SPIRAL';
  if (s === 'boss:shot' || s === 'boss:basic') return 'BOSS SHOT';
  if (s === 'bullet:elite') return 'ELITE ROUND';
  if (s === 'bullet:burrower' || s === 'bullet:spike') return 'BURROWER SPIKE';
  if (s.indexOf('bullet:') === 0) return 'HOSTILE · ' + s.slice(7).toUpperCase();
  if (s === 'unknown') return 'UNKNOWN';
  return s;
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

export function getComboWindow(combo) {
  var c = combo || 1;
  if (c >= 31) return 2.2;
  if (c >= 23) return 2.6;
  if (c >= 15) return 3.0;
  if (c >= 9) return 3.5;
  return 4.0;
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

export function damagePlayer(amount, source, threatX, threatY) {
  if (!rt.state || !rt.state.player || rt.state.over) return 0;
  var p = rt.state.player;
  if (p.invulnerable > 0) return 0;
  // Wave 15+: residual elite rounds must never wipe (hardcap in enemy-bullets can miss edge frames).
  // Sovereign / wave15+: elite rounds never connect (wave-14 leftovers can still tag deathWave 15).
  var _src = normalizeDamageSource(source);
  var _sovWave = (rt.state.recipe && rt.state.recipe.boss === 'sovereign') || ((rt.state.wave | 0) >= 15);
  if (_sovWave && (_src === 'bullet:elite' || _src === 'contact:elite' || /elite/i.test(String(source || '')))) {
    // Scrub sticky elite tag so a later unexplained death is not blamed on early-wave elites.
    if (rt.state.lastDamageSource === 'bullet:elite' || rt.state.lastDamageSource === 'contact:elite') {
      rt.state.lastDamageSource = '';
    }
    return 0;
  }
  var requested = Number(amount);
  if (!(requested > 0)) return 0;

  if (rt.state.stageConfig && rt.state.stageConfig.fixedDmgPercent) {
    requested = Math.round(p.maxHp * rt.state.stageConfig.fixedDmgPercent);
  } else if (rt.state.mode === 'hardcore') {
    requested = Math.round(p.maxHp * 0.32);
  }

  if (source === 'collision' && p.shieldCollisionDamageReduction && (p.shield || 0) > 0) {
    requested = Math.round(requested * (1 - p.shieldCollisionDamageReduction));
  }

  var mult = (typeof p.damageTakenMult === 'number') ? p.damageTakenMult : 1;
  if (p.convoyShield) mult *= 0.85;
  if (p.fortressProtocol && (p.energy || 0) >= 50) mult *= 0.75;
  if (p.aegisStance && typeof threatX === 'number' && typeof threatY === 'number') {
    var threatAng = Math.atan2(threatY - p.y, threatX - p.x);
    var angDiff = Math.abs(Math.atan2(Math.sin(threatAng - (p.aim || 0)), Math.cos(threatAng - (p.aim || 0))));
    if (angDiff > Math.PI * 0.5) {
      mult *= 0.65;
    }
  }
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
  var tagged = normalizeDamageSource(source);
  rt.state.lastDamageSource = tagged;
  var applied = remaining;
  var saved = false;
  if (p.phoenix && p.hp - remaining <= 0) {
    applied = Math.max(0, p.hp - 1);
    p.hp = 1;
    p.phoenix = false;
    saved = true;
  } else if (p.aegisProtocol && !p.aegisProtocol.used && p.hp - remaining <= 0) {
    p.aegisProtocol.used = true;
    applied = Math.max(0, p.hp - 1);
    p.hp = 1;
    p.invulnerable = p.aegisProtocol.invuln || 1.5;
    if (p.aegisProtocol.burstSpeed > 1) {
      p.speedBoostTimer = 2.0;
      p.speedBoostMult = p.aegisProtocol.burstSpeed;
    }
    if (p.aegisProtocol.refillEmp) {
      p.empCooldown = 0;
      p.empCharged = true;
    }
    saved = true;
    AudioFX.blast();
    triggerHaptic([60, 80, 100]);
    rt.state.shake = Math.max(rt.state.shake, 16);
    logEvent('AEGIS PROTOCOL // FATAL BLOW PREVENTED');
    setStatusText('AEGIS PROTOCOL ACTIVATED // EMERGENCY SHIELD ENGAGED');
    spawnParticles(p.x, p.y, '#00f3ff', 30, 220, 4);
  } else {
    p.hp -= remaining;
  }

  // B-01 Reactive Plasma Plating micro-EMP
  if (p.reactiveMicroEmp && (p.reactiveMicroEmp.timer || 0) <= 0) {
    p.reactiveMicroEmp.timer = p.reactiveMicroEmp.cd;
    var microR = p.reactiveMicroEmp.radius;
    if (rt.state.enemyBullets) {
      for (var mbi = rt.state.enemyBullets.length - 1; mbi >= 0; mbi -= 1) {
        var meb = rt.state.enemyBullets[mbi];
        if (dist2(meb.x, meb.y, p.x, p.y) <= microR * microR) {
          spawnParticles(meb.x, meb.y, '#5be7ff', 4, 90, 2);
          fastUnorderedRemove(rt.state.enemyBullets, mbi);
        }
      }
    }
    if (p.reactiveMicroEmp.stun > 0 && rt.state.enemies) {
      for (var mei = rt.state.enemies.length - 1; mei >= 0; mei -= 1) {
        var menemy = rt.state.enemies[mei];
        if (!menemy) continue;
        if (dist2(menemy.x, menemy.y, p.x, p.y) <= (microR + menemy.r) * (microR + menemy.r)) {
          menemy.empTimer = Math.max(menemy.empTimer || 0, p.reactiveMicroEmp.stun);
          spawnParticles(menemy.x, menemy.y, '#5be7ff', 6, 120, 2);
        }
      }
    }
    if (rt.state.shockRings) {
      rt.state.shockRings.push({ x: p.x, y: p.y, r: 8, maxR: microR, life: 0.25, maxLife: 0.25, color: '#5be7ff' });
    }
    AudioFX.emp();
    logEvent('REACTIVE PLASMA // MICRO-EMP DETONATED');
  }

  if (isStormFront()) rt.state.stormHurt = true;
  rt.state.waveDamageTaken = (rt.state.waveDamageTaken || 0) + applied;
  rt.state.damageTakenInStage = (rt.state.damageTakenInStage || 0) + applied;

  if (rt.state.mode === 'hardcore' || (rt.state.stageConfig && (rt.state.stageConfig.shortInvuln || rt.state.stageConfig.fixedDmgPercent))) {
    // Hardcore still uses short i-frames vs campaign, but 0.08s was a multi-hit oneshot.
    p.invulnerable = 0.4;
    p._capNextInvuln = 0.4;
  }

  var info = { amount: applied, requested: requested, source: source || '', saved: saved };
  if (applied > 0) {
    var nowHurt = (rt.state && typeof rt.state.waveTime === 'number') ? rt.state.waveTime : 0;
    if (!p._lastHurtTime || (nowHurt - p._lastHurtTime >= 0.18) || nowHurt < p._lastHurtTime) {
      p._lastHurtTime = nowHurt;
      AudioFX.hurt();
      rt.state.shake = Math.max(rt.state.shake || 0, 6);
    }
    if (applied >= 18) {
      if (!isReducedMotion()) {
        rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.035);
      }
      addCameraTrauma(0.32);
    }
  }
  onPlayerDamaged(p, info);
  noteContractEvent('player-damaged', info);
  noteMetaEvent('player-damaged', info);
  pushFxEvent('playerHit', p.x, p.y, playerHitOpts(tagged));
  if (saved || p.hp <= 0) onLethal(p, info);
  if (!saved && p.hp <= 0) {
    if (!rt.state.deathCause) rt.state.deathCause = tagged || normalizeDamageSource(source) || 'unknown';
    triggerGameOver();
  }
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
  // Barrel/core used to bypass the bleed window entirely, letting a stun + barrel
  // volley delete Dread in ~8s while front-only softcapped fights crawled past 3 min.
  // Keep a mild explosive bonus (60% of excess) instead of a full bypass.
  var explosive = info && (info.source === 'core' || info.source === 'barrel');
  var broken = (e.armorBreakTimer || 0) > 0 || e.mode === 'stun' || (e.empTimer || 0) > 0;
  var cap = broken ? BOSS_BLEED_FULL * 1.35 : BOSS_BLEED_FULL;
  var overflow = broken ? 0.4 : (explosive ? 0.6 : BOSS_BLEED_OVERFLOW);
  var now = rt.state.waveTime || 0;
  if (typeof e.bossBleedAt !== 'number' || now < e.bossBleedAt || now - e.bossBleedAt > BOSS_BLEED_WINDOW) {
    e.bossBleedAt = now;
    e.bossBleed = 0;
  }
  var room = cap - (e.bossBleed || 0);
  var full = 0;
  var rest = amount;
  if (room > 0) {
    full = rest < room ? rest : room;
    rest -= full;
  }
  e.bossBleed = (e.bossBleed || 0) + full;
  return full + rest * overflow;
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
  if (rt.state.player) {
    var p = rt.state.player;
    p.hitmarkerTime = rt.renderTime || 0;
    p.hitmarkerType = (info.staggerBreak || info.execution || info.source === 'execution' || info.source === 'phase-intercept' || (e.staggerTimer > 0 && info.source === 'dash')) ? 3 : (info.crit ? 2 : 1);
  }
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

function maybeBossWaveClearBounty(e) {
  if (!rt.state || !e) return;
  if (!(rt.state.boss && rt.state.boss.hp > 0)) return;
  if (e.isBoss || e.kind === 'titan' || e.kind === 'dreadnought' || e.kind === 'sovereign') return;
  var isPriority = e.kind === 'elite' || e.kind === 'artillery' || e.kind === 'warden' || e.kind === 'spitter';
  if (!isPriority) return;
  var scrap = e.kind === 'elite' ? 18 : 10;
  var style = e.kind === 'elite' ? 40 : 20;
  rt.state.totalScrapCollected = (rt.state.totalScrapCollected || 0) + scrap;
  if (rt.state.scoreBreakdown) {
    rt.state.scoreBreakdown.style = (rt.state.scoreBreakdown.style || 0) + style;
  }
  rt.state.score = (rt.state.score || 0) + style;
  logEvent('BOSS-WAVE CLEAR // +' + scrap + ' SCRAP');
}

function processEnemyDrops(e) {
  if (!canDropLoot(e)) return;
  var orbs = rt.state.orbs;
  var prevLen = orbs ? orbs.length : 0;
  rollDrops(e);
  if (rt.state && rt.state.stageConfig && rt.state.stageConfig.famine && orbs) {
    var p = rt.state.player;
    var isFullHp = p && p.hp >= p.maxHp;
    for (var i = orbs.length - 1; i >= prevLen; i -= 1) {
      if (orbs[i].kind === 'repair') {
        if (isFullHp) {
          fastUnorderedRemove(orbs, i);
        } else if (rng('loot') < 0.75) {
          fastUnorderedRemove(orbs, i);
        }
      }
    }
  }
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
  fastUnorderedRemove(rt.state.enemies, index);
  rt.state.kills += 1;
  if (isStormFront()) rt.state.stormKills = (rt.state.stormKills || 0) + 1;
  var elite = e.kind === 'elite';
  var isTitan = e.kind === 'titan';
  var baseScore = killBaseScore(e);
  var p = rt.state.player;
  rt.state.combo = rt.state.comboTimer > 0 ? Math.min(MAX_COMBO, rt.state.combo + 1) : 1;
  if (rt.state.stats && rt.state.combo > rt.state.stats.maxCombo) {
    rt.state.stats.maxCombo = rt.state.combo;
  }
  rt.state.comboTimer = getComboWindow(rt.state.combo);
  if (rt.state.combo >= 15 && p) {
    p.speedBoostTimer = Math.max(p.speedBoostTimer || 0, 1.5);
    p.speedBoostMult = Math.max(p.speedBoostMult || 1, 1.12);
  }
  rt.state._lastKillX = e.x;
  rt.state._lastKillY = e.y;
  if (baseScore > 0) addScore(Math.round(baseScore * (1 + (rt.state.combo - 1) * 0.25)), 'kill');

  if (isTitan) {
    rt.state.shake = Math.max(rt.state.shake, 16);
    rt.state.banner = 4.0;
    rt.state.bannerText = 'TITAN NEUTRALIZED // SECTOR SECURED';
    setStatusText('TITAN NEUTRALIZED // SECTOR SECURED');
    logEvent('TITAN NEUTRALIZED // SECTOR SECURED');
    AudioFX.blast();
    triggerHaptic([30, 40, 50, 60, 80]);
    if (!isReducedMotion()) {
      rt.state.hitstop = Math.max(rt.state.hitstop || 0, 0.120);
      rt.state.hitstopDilation = 0.120;
    }
    processEnemyDrops(e);
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
      setStatusText('BOUNTY CLEAR +' + rt.state.bountyReward + ' SCORE // SURGE ' + surgeDuration.toFixed(1) + 's');
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
  if (e.isVip || (rt.state.vipList && rt.state.vipList.indexOf(e) !== -1)) {
    AudioFX.blast();
    triggerHaptic([50, 60, 80]);
    rt.state.shake = Math.max(rt.state.shake, 18);
    logEvent('VIP ELIMINATED // EMP SHOCKWAVE TRIGGERED');
    setStatusText('VIP TARGET NEUTRALIZED // EMP DETONATION');
    if (rt.state.enemies) {
      for (var fIdx = rt.state.enemies.length - 1; fIdx >= 0; fIdx -= 1) {
        var foe = rt.state.enemies[fIdx];
        if (!foe) continue;
        if (foe && !foe.isBoss && foe !== e && !foe.isVip) {
          foe.empTimer = Math.max(foe.empTimer || 0, 4.0);
          foe.hp -= 80;
          if (foe.hp <= 0) killEnemy(foe, 'emp');
        }
      }
    }
  }
  if (!isTitan) processEnemyDrops(e);
  spawnParticles(e.x, e.y, e.color, elite ? 26 : (e.kind === 'brute' || e.kind === 'artillery') ? 22 : 11, elite ? 260 : (e.kind === 'brute' || e.kind === 'artillery') ? 220 : 150, elite ? 5 : (e.kind === 'brute' || e.kind === 'artillery') ? 5 : 3);
  rt.state.shake = Math.max(rt.state.shake, elite ? 10 : (e.kind === 'brute' || e.kind === 'artillery') ? 7 : 3);
  pushFxEvent('kill', e.x, e.y, { kind: e.kind, color: e.color || '', elite: elite ? 1 : 0, affix: e.affix || '', hp: e.hp });
  var killInfo = { cause: why, kind: e.kind, elite: elite, isBoss: Boolean(e.isBoss) };
  onKill(e, killInfo);
  noteContractEvent('kill', killInfo);
  noteMetaEvent('kill', killInfo);

  // C-03 Black-Market Surge Unit kill extension (+0.5s per kill, max +3s extra)
  if (p && p.surgeUnit && p.surgeUnit.active) {
    if ((p.surgeUnit.bonusTime || 0) < 3.0) {
      var addSec = Math.min(0.5, 3.0 - (p.surgeUnit.bonusTime || 0));
      p.surgeUnit.bonusTime = (p.surgeUnit.bonusTime || 0) + addSec;
      p.surgeUnit.timer += addSec;
    }
  }

  // C-01 Resonance Fire Control T3 crit kill chain explosion (60 AoE in 90px)
  if (why === 'bullet' && rt.state.lastHitWasCrit && p && p.resonanceFireControl && p.resonanceFireControl.tier >= 3) {
    var blastR = 90;
    if (rt.state.shockRings) {
      rt.state.shockRings.push({ x: e.x, y: e.y, r: 8, maxR: blastR, life: 0.25, maxLife: 0.25, color: '#ff4d2e' });
    }
    spawnParticles(e.x, e.y, '#ff4d2e', 16, 180, 3.5);
    for (var cfi = rt.state.enemies.length - 1; cfi >= 0; cfi -= 1) {
      var foe = rt.state.enemies[cfi];
      if (!foe) continue;
      if (foe && foe !== e && dist2(foe.x, foe.y, e.x, e.y) <= (blastR + foe.r) * (blastR + foe.r)) {
        damageEnemy(foe, 60, { source: 'chain-explosion', x: e.x, y: e.y });
        if (foe.hp <= 0) killEnemy(foe, 'chain-explosion');
      }
    }
  }

  if (e.isBoss) onBossDefeated(e);
  if (rt.state && (rt.state.mode === 'campaign' || rt.state.mode === 'hardcore')) {
    checkStageVictory(rt.state, 0);
  }
}

export function explodeCore(core, index) {
  if (!rt.state) return;
  if (rt.state.stats) rt.state.stats.coresDetonated += 1;
  fastUnorderedRemove(rt.state.volatileCores, index);
  var p = rt.state.player;
  var blastR = 130;
  addDecal(core.x, core.y, 18, 16, 0.42, '#1b1715');
  triggerHaptic([25, 35, 45]);
  for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
    var enemy = rt.state.enemies[ei];
    if (!enemy) continue;
    if (dist2(core.x, core.y, enemy.x, enemy.y) <= (blastR + enemy.r) * (blastR + enemy.r)) {
      if (enemy.isBoss || enemy.kind === 'titan') {
        damageEnemy(enemy, 350, { source: 'core', x: core.x, y: core.y });
        enemy.empTimer = 3.0;
        AudioFX.critHit();
        triggerHaptic([50, 40, 60, 80]);
        rt.state.shake = Math.max(rt.state.shake, 18);
        logEvent('TITAN ARMOR BREACH // CORE STRIKE');
        setStatusText('TITAN ARMOR BREACH // SYSTEM OVERHEAT STUN 3.0s');
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
    var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
    var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
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
    fastUnorderedRemove(rt.state.barrels, index);
  } else {
    var bIdx = rt.state.barrels.indexOf(barrel);
    if (bIdx !== -1) fastUnorderedRemove(rt.state.barrels, bIdx);
  }
  var p = rt.state.player;
  var blastR = isKicked ? 125 : 110;
  var blastDmg = isKicked ? 120 : 85;
  addDecal(barrel.x, barrel.y, 16, 14, 0.4, '#1b1715');
  triggerHaptic(isKicked ? [30, 40, 55] : [20, 30, 40]);

  for (var ei = rt.state.enemies.length - 1; ei >= 0; ei -= 1) {
    var enemy = rt.state.enemies[ei];
    if (!enemy) continue;
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
        logEvent('TITAN STRUCK BY KICKED BARREL // ARMOR BREACH');
        spawnParticles(enemy.x, enemy.y, '#ff4d2e', 20, 220, 4);
      }
      shoveEnemy(enemy, enemy.x - barrel.x, enemy.y - barrel.y, 40);
      spawnParticles(enemy.x, enemy.y, '#ff5522', 8, 160, 3);
      if (enemy.hp <= 0) killEnemy(enemy, 'barrel');
    }
  }

  if (p && dist2(barrel.x, barrel.y, p.x, p.y) <= (blastR + p.r) * (blastR + p.r)) {
    var boundW = (rt.state && rt.state.width) || (rt.ui && rt.ui.width) || 3520;
    var boundH = (rt.state && rt.state.height) || (rt.ui && rt.ui.height) || 2640;
    var pkdx = p.x - barrel.x;
    var pkdy = p.y - barrel.y;
    var pkd = Math.hypot(pkdx, pkdy) || 1;
    p.x = clamp(p.x + (pkdx / pkd) * 20, p.r, boundW - p.r);
    p.y = clamp(p.y + (pkdy / pkd) * 20, p.r, boundH - p.r);
    // Player-facing barrel damage is 3 (was 4), and one chain can only
    // hurt once inside the guard window (covers hardcore short invuln caps).
    var chainGuarded = (rt.state._barrelChainGuard || 0) > 0;
    if (p.invulnerable <= 0 && !chainGuarded) {
      var barrelHit = damagePlayer(3, 'barrel');
      if (barrelHit > 0) {
        rt.state._barrelChainGuard = 1.0;
        p._capNextInvuln = undefined;
        p.invulnerable = Math.max(p.invulnerable || 0, 0.55);
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
