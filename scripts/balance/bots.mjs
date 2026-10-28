// Bot policies.
// idle / kite stay the lower-bound policies from the balance sheet.
// skilled (P3): still fusion > offense > defense, but ducks bullets and
// telegraphs, backs off an arming Scurrier, keeps boss range, and grabs
// repair scrap when hurt. Below half hull it prefers a defense card over
// another offense card so the picker is not pure damage.

var CARD_RANK = {
  FUSION: 0,
  OFFENSE: 1,
  WEAPON: 1,
  DEFENSE: 2,
  TACTICAL: 3
};

var ORBIT_NEAR = 160;
var ORBIT_FAR = 250;
var BOSS_NEAR = 280;
var BOSS_FAR = 420;
var DASH_GAP = 60;
var EMP_RANGE = 140;
var EMP_MIN = 5;
var BOSS_KIND = { titan: true, dreadnought: true, sovereign: true };

var activeBot = 'skilled';

// Per-run bot options (set by setBotContext, read by the pickers and actBot).
//   cards         default | resonance   card picker (see pickUpgradeIndex)
//   chargePolicy  auto | hold | tap     charge weapons (colossus); auto = hold on bosses / dense packs, tap otherwise
//   tactical      auto | none           skilled uses the equipped tactical gear
//   doubleDown    off | always | smart  accept the contract double-down while the 12s window is open
//   gate          push | extract        what the bot picks at the wave-15 gate
var ctx = {
  cards: 'default',
  chargePolicy: 'auto',
  tactical: 'auto',
  doubleDown: 'off',
  gate: 'push'
};
var botCounters = null;

export var ARCHETYPES = ['kinetic', 'plasma', 'static', 'tactical'];

export var SKILLED_NOTES = [
  'skilled sidesteps shots that will hit within 0.32s and dashes only if impact is under 0.12s (idle still dashes at a 60px gap; kite still does not dash). Acid lob markers and volatile blasts count as telegraphs.',
  'skilled steps out of mortar / meteor / acid / lightning / Dreadnought charge lanes and the Sovereign eye, and flees an arming Scurrier or a Burrower emerge circle.',
  'skilled orbits bosses at 280–420px instead of 160–250px, and shoots Storm Towers first while Sovereign is shielded.',
  'skilled detours to a repair orb inside 260px when hull is under 72%.',
  'skilled, under 50% hull, ranks DEFENSE above OFFENSE. Fusion stays first. idle and kite keep the original picker.',
  'v0.14.0: --cards resonance keeps FUSION first, then prefers the archetype with the most stacks so far (kinetic / plasma / static / tactical) so the 2 / 4 / 6 resonance tiers are reachable; ties and non-matching hands fall back to the category order.',
  'v0.14.0: colossus (charge railgun) fires by policy. auto = hold to a full charge while a boss is alive or 5+ enemies are within 380px, otherwise tap-release for plasma orbs. --charge-policy hold|tap forces one. Applies to kite as well as skilled.',
  'v0.14.0: skilled deploys the equipped tactical gear by rule (sentry turret / flares / singularity grenade / aegis barrier each have a trigger; unknown gear falls back to a 3+ enemy rule). idle and kite never deploy one.',
  'v0.14.0: --double-down always|smart presses H while the 12s window is open (smart: only above 75% hull and only on combo / elite-hunt contracts, the two this bot actually completes). Backlash and 3x payouts come from the game; the report counts them.'
];

export function setBotContext(name, options) {
  activeBot = name || 'skilled';
  ctx.cards = 'default';
  ctx.chargePolicy = 'auto';
  ctx.tactical = 'auto';
  ctx.doubleDown = 'off';
  ctx.gate = 'push';
  if (options) {
    if (options.cards) ctx.cards = options.cards;
    if (options.chargePolicy) ctx.chargePolicy = options.chargePolicy;
    if (options.tactical) ctx.tactical = options.tactical;
    if (options.doubleDown) ctx.doubleDown = options.doubleDown;
    if (options.gate) ctx.gate = options.gate;
  }
  botCounters = { tacticalUses: 0, doubleDowns: 0, orbShots: 0, chargeHolds: 0 };
}

export function getBotCounters() {
  return botCounters || { tacticalUses: 0, doubleDowns: 0, orbShots: 0, chargeHolds: 0 };
}

function archetypeOf(card) {
  var arch = card && card.archetype;
  return typeof arch === 'string' ? arch : '';
}

// Archetype with the most acquired stacks so far; earliest acquired wins a tie. '' while nothing is held.
export function focusArchetype(state) {
  var list = (state && state.acquiredUpgrades) || [];
  var counts = {};
  var order = [];
  var i;
  for (i = 0; i < list.length; i += 1) {
    var arch = archetypeOf(list[i]);
    if (!arch) continue;
    if (!counts[arch]) {
      counts[arch] = 0;
      order.push(arch);
    }
    counts[arch] += 1;
  }
  var best = '';
  var bestCount = 0;
  for (i = 0; i < order.length; i += 1) {
    if (counts[order[i]] > bestCount) {
      bestCount = counts[order[i]];
      best = order[i];
    }
  }
  return best;
}

export function pickUpgradeIndex(choices, player, state) {
  var best = 0;
  var bestRank = 99;
  var hurt = activeBot === 'skilled' && player && player.maxHp > 0 && (player.hp / player.maxHp) < 0.5;
  var focus = ctx.cards === 'resonance' ? focusArchetype(state) : '';
  if (!choices) return 0;
  for (var i = 0; i < choices.length; i += 1) {
    var cat = String((choices[i] && choices[i].category) || '').toUpperCase();
    var rank = Object.prototype.hasOwnProperty.call(CARD_RANK, cat) ? CARD_RANK[cat] : 4;
    if (hurt && cat === 'DEFENSE') rank = 0.5;
    // Resonance: stay on the leading archetype. Matching non-fusion cards slot in just behind
    // FUSION (rank 0) and ahead of every ordinary category rank; the category rank still orders them.
    if (focus && cat !== 'FUSION' && !(hurt && cat === 'DEFENSE') && archetypeOf(choices[i]) === focus) {
      rank = 0.8 + rank * 0.01;
    }
    if (rank < bestRank) {
      bestRank = rank;
      best = i;
    }
  }
  return best;
}

function hypot(x, y) {
  return Math.hypot(x, y);
}

function gapOf(p, x, y, r) {
  return hypot(p.x - x, p.y - y) - (p.r || 0) - (r || 0);
}

function consider(best, p, x, y, r, kind) {
  var gap = gapOf(p, x, y, r);
  if (!best || gap < best.gap) {
    return { x: x, y: y, r: r || 0, gap: gap, dist: hypot(p.x - x, p.y - y), kind: kind || '' };
  }
  return best;
}

function scan(state, p) {
  var nearest = null;
  var nearestEnemy = null;
  var nearestBullet = null;
  var sx = 0;
  var sy = 0;
  var enemies = state.enemies || [];
  for (var i = 0; i < enemies.length; i += 1) {
    var e = enemies[i];
    if (!e || (typeof e.hp === 'number' && e.hp <= 0)) continue;
    var dx = p.x - e.x;
    var dy = p.y - e.y;
    var dist = hypot(dx, dy) || 0.001;
    var gap = dist - (p.r || 0) - (e.r || 10);
    nearest = consider(nearest, p, e.x, e.y, e.r || 10, 'enemy');
    if (!nearestEnemy || gap < nearestEnemy.gap) {
      nearestEnemy = { x: e.x, y: e.y, r: e.r || 10, gap: gap, dist: dist, ref: e };
    }
    if (gap < 320) {
      var weight = (e.isBoss || e.kind === 'titan') ? 2.4 : 1;
      sx += (dx / dist) * weight / (gap * gap + 80);
      sy += (dy / dist) * weight / (gap * gap + 80);
    }
  }
  var bullets = state.enemyBullets || [];
  for (var b = 0; b < bullets.length; b += 1) {
    var bullet = bullets[b];
    if (!bullet) continue;
    var bdx = p.x - bullet.x;
    var bdy = p.y - bullet.y;
    var bdist = hypot(bdx, bdy) || 0.001;
    var bgap = bdist - (p.r || 0) - (bullet.r || 4);
    nearest = consider(nearest, p, bullet.x, bullet.y, bullet.r || 4, 'bullet');
    if (!nearestBullet || bgap < nearestBullet.gap) {
      nearestBullet = { x: bullet.x, y: bullet.y, r: bullet.r || 4, gap: bgap };
    }
    if (bgap < 160) {
      sx += (bdx / bdist) * 1.6 / (bgap * bgap + 40);
      sy += (bdy / bdist) * 1.6 / (bgap * bgap + 40);
    }
  }
  var zones = state.artilleryTargets || [];
  for (var z = 0; z < zones.length; z += 1) {
    var zone = zones[z];
    if (!zone) continue;
    nearest = consider(nearest, p, zone.x, zone.y, zone.r || 20, zone.state === 'molten' ? 'molten' : 'mortar');
    if (zone.state === 'molten') {
      var zdx = p.x - zone.x;
      var zdy = p.y - zone.y;
      var zdist = hypot(zdx, zdy) || 0.001;
      var zgap = zdist - (p.r || 0) - (zone.r || 20);
      if (zgap < 180) {
        sx += (zdx / zdist) * 1.3 / (zgap * zgap + 60);
        sy += (zdy / zdist) * 1.3 / (zgap * zgap + 60);
      }
    }
  }
  return {
    nearest: nearest,
    nearestEnemy: nearestEnemy,
    nearestBullet: nearestBullet,
    sx: sx,
    sy: sy
  };
}

function enemiesWithin(state, p, range) {
  var out = [];
  var list = state.enemies || [];
  var r2 = range * range;
  for (var i = 0; i < list.length; i += 1) {
    var e = list[i];
    if (!e || (typeof e.hp === 'number' && e.hp <= 0)) continue;
    var dx = e.x - p.x;
    var dy = e.y - p.y;
    if (dx * dx + dy * dy <= r2) out.push(e);
  }
  return out;
}

function centroid(list) {
  var x = 0;
  var y = 0;
  for (var i = 0; i < list.length; i += 1) {
    x += list[i].x;
    y += list[i].y;
  }
  return { x: x / list.length, y: y / list.length };
}

function wallPush(p, width, height) {
  var margin = 110;
  var x = 0;
  var y = 0;
  if (p.x < margin) x += (margin - p.x) / margin;
  if (p.x > width - margin) x -= (p.x - (width - margin)) / margin;
  if (p.y < margin) y += (margin - p.y) / margin;
  if (p.y > height - margin) y -= (p.y - (height - margin)) / margin;
  return { x: x, y: y };
}

function normalize(x, y) {
  var len = hypot(x, y);
  if (!(len > 0.001)) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function isBossEnemy(enemy) {
  if (!enemy) return false;
  if (enemy.isBoss) return true;
  return Boolean(BOSS_KIND[enemy.kind]);
}

function desiredMove(botName, p, threats, width, height) {
  var wall = wallPush(p, width, height);
  if (botName === 'idle') {
    if (threats.sx || threats.sy) {
      return normalize(threats.sx + wall.x * 1.2, threats.sy + wall.y * 1.2);
    }
    return normalize((width / 2) - p.x, (height / 2) - p.y);
  }
  var aim = threats.nearestEnemy;
  if (!aim) return normalize((width / 2) - p.x + wall.x, (height / 2) - p.y + wall.y);
  var near = ORBIT_NEAR;
  var far = ORBIT_FAR;
  if (botName === 'skilled' && isBossEnemy(aim.ref)) {
    near = BOSS_NEAR;
    far = BOSS_FAR;
  }
  var dx = p.x - aim.x;
  var dy = p.y - aim.y;
  var len = hypot(dx, dy) || 1;
  var ux = dx / len;
  var uy = dy / len;
  var mx;
  var my;
  if (aim.gap < near) {
    mx = ux;
    my = uy;
  } else if (aim.gap > far) {
    mx = -ux;
    my = -uy;
  } else {
    mx = -uy;
    my = ux;
  }
  if (botName !== 'skilled' && threats.nearestBullet && threats.nearestBullet.gap < 90) {
    mx = mx * 0.35 + (p.x - threats.nearestBullet.x);
    my = my * 0.35 + (p.y - threats.nearestBullet.y);
  }
  mx += wall.x * 1.5;
  my += wall.y * 1.5;
  return normalize(mx, my);
}

function addAvoid(acc, x, y, weight) {
  var len = hypot(x, y);
  if (!(len > 0.001) || !(weight > 0)) return;
  acc.x += (x / len) * weight;
  acc.y += (y / len) * weight;
}

function lineDist(px, py, x1, y1, x2, y2) {
  var vx = x2 - x1;
  var vy = y2 - y1;
  var len2 = vx * vx + vy * vy || 1;
  var t = ((px - x1) * vx + (py - y1) * vy) / len2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  var cx = x1 + vx * t;
  var cy = y1 + vy * t;
  return { dist: hypot(px - cx, py - cy), x: px - cx, y: py - cy };
}

function bulletImpact(p, bullet) {
  var vx = bullet.vx || 0;
  var vy = bullet.vy || 0;
  var speed2 = vx * vx + vy * vy;
  if (speed2 < 80) return null;
  var dx = p.x - bullet.x;
  var dy = p.y - bullet.y;
  var t = (dx * vx + dy * vy) / speed2;
  if (t < 0 || t > 0.32) return null;
  var miss = hypot(p.x - (bullet.x + vx * t), p.y - (bullet.y + vy * t));
  var hitR = (p.r || 12) + (bullet.r || 4) + 10;
  if (miss > hitR) return null;
  return { t: t, vx: vx, vy: vy, x: bullet.x, y: bullet.y };
}

function circlePush(acc, p, x, y, r, pad, weight) {
  var dx = p.x - x;
  var dy = p.y - y;
  var dist = hypot(dx, dy) || 0.001;
  var limit = (r || 0) + (p.r || 0) + pad;
  if (dist >= limit) return false;
  addAvoid(acc, dx, dy, weight * (1 + (limit - dist) / limit));
  return true;
}

function skilledAvoid(state, p) {
  var acc = { x: 0, y: 0 };
  var dash = null;
  var dashRank = 99;
  function wantDash(dirX, dirY, rank) {
    if (rank >= dashRank) return;
    var n = normalize(dirX, dirY);
    if (!n.x && !n.y) return;
    dash = n;
    dashRank = rank;
  }
  var bullets = state.enemyBullets || [];
  var b;
  for (b = 0; b < bullets.length; b += 1) {
    var shot = bullets[b];
    if (!shot) continue;
    if (shot.type === 'acid' && shot.targetX != null) {
      var left = (shot.flight || 0.7) - (shot.age || 0);
      if (circlePush(acc, p, shot.targetX, shot.targetY, 38, 18, 2.2) && left < 0.4) {
        wantDash(p.x - shot.targetX, p.y - shot.targetY, 0.06);
      }
    }
    var hit = bulletImpact(p, shot);
    if (!hit) continue;
    var sideX = -hit.vy;
    var sideY = hit.vx;
    var relX = p.x - hit.x;
    var relY = p.y - hit.y;
    if (relX * sideX + relY * sideY < 0) {
      sideX = -sideX;
      sideY = -sideY;
    }
    addAvoid(acc, sideX, sideY, 1.15 / (hit.t + 0.08));
    if (hit.t < 0.12) wantDash(sideX, sideY, hit.t);
  }
  var zones = state.artilleryTargets || [];
  var z;
  for (z = 0; z < zones.length; z += 1) {
    var zone = zones[z];
    if (!zone) continue;
    var hot = zone.state === 'molten' || zone.state === 'warning';
    if (!hot) continue;
    var inside = circlePush(acc, p, zone.x, zone.y, zone.r || 28, 16, zone.state === 'warning' ? 2.2 : 1.4);
    if (inside && zone.state === 'warning' && (zone.timer || 1) < 0.4) {
      wantDash(p.x - zone.x, p.y - zone.y, 0.12);
    }
  }
  var meteors = state.meteors || [];
  var m;
  for (m = 0; m < meteors.length; m += 1) {
    var meteor = meteors[m];
    if (!meteor) continue;
    if (circlePush(acc, p, meteor.x, meteor.y, meteor.r || 34, 18, 2.4) && (meteor.timer || 1) < 0.4) {
      wantDash(p.x - meteor.x, p.y - meteor.y, 0.1);
    }
  }
  var blasts = state.pendingBlasts || [];
  var blast;
  for (blast = 0; blast < blasts.length; blast += 1) {
    var boom = blasts[blast];
    if (!boom) continue;
    if (circlePush(acc, p, boom.x, boom.y, boom.r || 110, 12, 2.5) && (boom.timer || 1) < 0.45) {
      wantDash(p.x - boom.x, p.y - boom.y, 0.08);
    }
  }
  var pools = state.acidPools || [];
  var a;
  for (a = 0; a < pools.length; a += 1) {
    var pool = pools[a];
    if (pool) circlePush(acc, p, pool.x, pool.y, pool.r || 38, 8, 1.6);
  }
  var bolts = state.lightningStrikes || [];
  var s;
  for (s = 0; s < bolts.length; s += 1) {
    var bolt = bolts[s];
    if (!bolt || !bolt.warning) continue;
    var line = lineDist(p.x, p.y, bolt.x1, bolt.y1, bolt.x2, bolt.y2);
    var half = (bolt.width || 26) * 0.5 + (p.r || 0) + 14;
    if (line.dist < half) {
      addAvoid(acc, line.x, line.y, 2.8);
      if ((bolt.timer || 1) < 0.45) wantDash(line.x, line.y, 0.08);
    }
  }
  var enemies = state.enemies || [];
  var i;
  for (i = 0; i < enemies.length; i += 1) {
    var enemy = enemies[i];
    if (!enemy || (typeof enemy.hp === 'number' && enemy.hp <= 0)) continue;
    if (enemy.kind === 'scurrier' && enemy.arming) {
      var gap = gapOf(p, enemy.x, enemy.y, 70);
      if (gap < 110) {
        addAvoid(acc, p.x - enemy.x, p.y - enemy.y, 3.2);
        if (gap < 78) wantDash(p.x - enemy.x, p.y - enemy.y, 0.05);
      }
    }
    if (enemy.kind === 'burrower' && enemy.state === 'warn' && enemy.warnX != null && enemy.warnY != null) {
      if (circlePush(acc, p, enemy.warnX, enemy.warnY, 50, 16, 2.6)) {
        wantDash(p.x - enemy.warnX, p.y - enemy.warnY, 0.09);
      }
    }
    if (enemy.kind === 'dreadnought' && (enemy.mode === 'telegraph' || enemy.mode === 'charge')) {
      var reach = (enemy.mode === 'charge' ? 280 : 220);
      var x2 = enemy.x + Math.cos(enemy.aim || 0) * reach;
      var y2 = enemy.y + Math.sin(enemy.aim || 0) * reach;
      var lane = lineDist(p.x, p.y, enemy.x, enemy.y, x2, y2);
      if (lane.dist < 70) {
        addAvoid(acc, lane.x, lane.y, enemy.mode === 'charge' ? 3.4 : 2.2);
        if (enemy.mode === 'telegraph' && (enemy.telegraphT || 1) < 0.35) wantDash(lane.x, lane.y, 0.07);
      }
    }
    if (enemy.kind === 'sovereign' && enemy.eyeRadius > 0 && !(enemy.eyeWarn > 0)) {
      var ex = enemy.eyeX != null ? enemy.eyeX : enemy.x;
      var ey = enemy.eyeY != null ? enemy.eyeY : enemy.y;
      var ed = hypot(p.x - ex, p.y - ey);
      var safe = enemy.eyeRadius - (p.r || 0) - 24;
      if (ed > safe) addAvoid(acc, ex - p.x, ey - p.y, 3);
    }
  }
  var seek = null;
  if (p.maxHp > 0 && p.hp / p.maxHp < 0.72) {
    var orbs = state.orbs || [];
    var bestD = 260;
    var o;
    for (o = 0; o < orbs.length; o += 1) {
      var orb = orbs[o];
      if (!orb || orb.kind !== 'repair') continue;
      var od = hypot(p.x - orb.x, p.y - orb.y);
      if (od < bestD) {
        bestD = od;
        seek = normalize(orb.x - p.x, orb.y - p.y);
      }
    }
  }
  return { x: acc.x, y: acc.y, dash: dash, seek: seek };
}

function setKeys(rt, x, y) {
  var keys = rt.input.keys;
  keys.clear();
  if (y < -0.28) keys.add('w');
  if (y > 0.28) keys.add('s');
  if (x < -0.28) keys.add('a');
  if (x > 0.28) keys.add('d');
}

function bossAlive(state) {
  var list = state.enemies || [];
  for (var i = 0; i < list.length; i += 1) {
    var e = list[i];
    if (e && e.hp > 0 && isBossEnemy(e)) return e;
  }
  return null;
}

// Colossus: holding the trigger charges to a full-power lance (auto-fires at chargeNeed);
// releasing early fires a weak plasma orb. Returns the mouse.down value for this frame.
function chargeTrigger(state, p) {
  var policy = ctx.chargePolicy;
  var mode = p.weaponMode || 'standard';
  if (mode !== 'colossus') return true;
  var hold = policy === 'hold';
  if (policy === 'auto') {
    hold = Boolean(bossAlive(state)) || enemiesWithin(state, p, 380).length >= 5;
  }
  if (hold) {
    if (botCounters) botCounters.chargeHolds += 1;
    return true;
  }
  // tap: press on a ready, idle gun, release next frame
  if ((p.cooldown || 0) > 0) return false;
  if (p.isCharging) {
    if (botCounters) botCounters.orbShots += 1;
    return false;
  }
  return true;
}

function nearestOf(list, p) {
  var best = null;
  var bestD = Infinity;
  for (var i = 0; i < list.length; i += 1) {
    var d = hypot(list[i].x - p.x, list[i].y - p.y);
    if (d < bestD) {
      bestD = d;
      best = list[i];
    }
  }
  return best;
}

function bulletsWithin(state, p, range) {
  var list = state.enemyBullets || [];
  var r2 = range * range;
  var n = 0;
  for (var i = 0; i < list.length; i += 1) {
    var b = list[i];
    if (!b) continue;
    var dx = b.x - p.x;
    var dy = b.y - p.y;
    if (dx * dx + dy * dy <= r2) n += 1;
  }
  return n;
}

// Rule-based tactical deployment. Returns a world-space target { x, y } or null to hold.
function tacticalTarget(state, p, gearId) {
  var near = enemiesWithin(state, p, 420);
  var boss = bossAlive(state);
  var bossNear = boss && hypot(boss.x - p.x, boss.y - p.y) < 700;
  var closest = near.length ? nearestOf(near, p) : (bossNear ? boss : null);
  if (gearId === 'sentry-turret') {
    if (near.length < 3 && !bossNear) return null;
    var to = closest || { x: p.x + 80, y: p.y };
    var dx = to.x - p.x;
    var dy = to.y - p.y;
    var len = hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * 70, y: p.y + (dy / len) * 70 };
  }
  if (gearId === 'thermal-decoy') {
    var arming = false;
    var all = state.enemies || [];
    for (var i = 0; i < all.length; i += 1) {
      if (all[i] && all[i].kind === 'scurrier' && all[i].arming && hypot(all[i].x - p.x, all[i].y - p.y) < 220) arming = true;
    }
    if (!arming && bulletsWithin(state, p, 260) < 4) return null;
    return { x: p.x + 1, y: p.y };
  }
  if (gearId === 'singularity-grenade') {
    var pack = enemiesWithin(state, p, 300);
    if (boss && bossNear && pack.length < 4) return { x: boss.x, y: boss.y };
    if (pack.length < 4) return null;
    return centroid(pack);
  }
  if (gearId === 'aegis-barrier') {
    var incoming = bulletsWithin(state, p, 320);
    if (incoming < 2 && !bossNear && near.length < 4) return null;
    if (!closest) return null;
    return { x: closest.x, y: closest.y };
  }
  // Unknown gear: deploy into a pack of 3+.
  var crowd = enemiesWithin(state, p, 300);
  if (crowd.length < 3) return null;
  return centroid(crowd);
}

function maybeTactical(game, state, p) {
  if (ctx.tactical === 'none' || typeof game.triggerTactical !== 'function') return;
  var slot = p.tacticalSlot;
  if (!slot || (slot.cooldown || 0) > 0) return;
  var target = tacticalTarget(state, p, slot.id);
  if (!target) return;
  game.rt.input.mouse.x = target.x;
  game.rt.input.mouse.y = target.y;
  if (game.triggerTactical() && botCounters) botCounters.tacticalUses += 1;
}

function maybeDoubleDown(game, state, p) {
  if (ctx.doubleDown === 'off' || typeof game.doubleDown !== 'function') return;
  var c = state.contract;
  if (!c || c.done || c.doubled || (state.waveTime || 0) > 12) return;
  if (ctx.doubleDown === 'smart') {
    // The bot only reliably finishes kill-driven contracts (combo, elite hunt); the rest it fails and eats the -25% hull backlash.
    if (!(p.maxHp > 0 && p.hp / p.maxHp >= 0.75)) return;
    if (c.id !== 'combo' && c.id !== 'elite-hunt') return;
  }
  if (game.doubleDown() && botCounters) botCounters.doubleDowns += 1;
}

export function actBot(game, botName) {
  var rt = game.rt;
  var state = rt.state;
  var p = state.player;
  // state.width is the playfield (960x640 arena, or the 3520x2640 world with --world); rt.ui is only the viewport.
  var width = state.width || (rt.ui && rt.ui.width) || 960;
  var height = state.height || (rt.ui && rt.ui.height) || 640;
  var threats = scan(state, p);
  var avoid = botName === 'skilled' ? skilledAvoid(state, p) : null;
  var move = desiredMove(botName, p, threats, width, height);
  if (avoid && (avoid.x || avoid.y)) {
    move = normalize(move.x * 0.45 + avoid.x, move.y * 0.45 + avoid.y);
  }
  if (avoid && avoid.seek && !(avoid.dash)) {
    move = normalize(move.x * 0.35 + avoid.seek.x, move.y * 0.35 + avoid.seek.y);
  }
  setKeys(rt, move.x, move.y);
  var canDash = (p.invulnerable || 0) <= 0.05;
  if (canDash && avoid && avoid.dash) {
    setKeys(rt, avoid.dash.x, avoid.dash.y);
    game.dash();
    setKeys(rt, move.x, move.y);
  } else if (canDash && botName === 'idle' && threats.nearest && threats.nearest.gap <= DASH_GAP) {
    setKeys(rt, p.x - threats.nearest.x, p.y - threats.nearest.y);
    game.dash();
    setKeys(rt, move.x, move.y);
  } else if (canDash && botName === 'skilled' && threats.nearest && threats.nearest.kind !== 'bullet' && threats.nearest.gap <= DASH_GAP) {
    setKeys(rt, p.x - threats.nearest.x, p.y - threats.nearest.y);
    game.dash();
    setKeys(rt, move.x, move.y);
  }
  var aim = threats.nearestEnemy;
  if (botName === 'skilled') {
    var shieldBoss = null;
    var tower = null;
    var elite = null;
    var bossLive = state.boss && state.boss.hp > 0;
    var list = state.enemies || [];
    var ei;
    for (ei = 0; ei < list.length; ei += 1) {
      var foe = list[ei];
      if (!foe || (typeof foe.hp === 'number' && foe.hp <= 0)) continue;
      if (foe.kind === 'sovereign' && foe.shielded) shieldBoss = foe;
      if (foe.kind === 'stormTower') {
        var td = hypot(p.x - foe.x, p.y - foe.y);
        if (!tower || td < tower.dist) tower = { x: foe.x, y: foe.y, dist: td, ref: foe };
      }
      if (bossLive && (foe.kind === 'elite' || foe.kind === 'artillery' || foe.kind === 'warden')) {
        var ed = hypot(p.x - foe.x, p.y - foe.y);
        if (ed < 520 && (!elite || ed < elite.dist)) elite = { x: foe.x, y: foe.y, dist: ed, ref: foe };
      }
    }
    if (shieldBoss && tower) aim = tower;
    else if (elite) aim = elite;
  }
  var aimX = aim ? aim.x : p.x + 100;
  var aimY = aim ? aim.y : p.y;
  if (botName === 'skilled') {
    var cluster = enemiesWithin(state, p, EMP_RANGE);
    var cost = (typeof p.empCost === 'number') ? p.empCost : 50;
    if (cluster.length >= EMP_MIN && (p.energy || 0) >= cost) {
      var center = centroid(cluster);
      rt.input.mouse.x = center.x;
      rt.input.mouse.y = center.y;
      game.triggerEmp();
    }
  }
  if (botName === 'skilled') maybeTactical(game, state, p);
  if (botName !== 'idle') maybeDoubleDown(game, state, p);
  rt.input.mouse.x = aimX;
  rt.input.mouse.y = aimY;
  rt.input.mouse.down = botName !== 'idle' && chargeTrigger(state, p);
  rt.input.gamepadX = 0;
  rt.input.gamepadY = 0;
  rt.input.touchMode = false;
}

var ROUTE_FNS = ['chooseRoute', 'chooseInterlude', 'pickRoute', 'selectRoute', 'confirmInterlude'];
var REPAIR_FNS = ['chooseRepair', 'repair', 'chooseArmory', 'selectRepair'];

function callFirst(mod, names, arg) {
  if (!mod) return false;
  for (var i = 0; i < names.length; i += 1) {
    if (typeof mod[names[i]] === 'function') {
      if (arg === undefined) mod[names[i]]();
      else mod[names[i]](arg);
      return true;
    }
  }
  return false;
}

export function resolveBlockers(game) {
  var notes = [];
  var state = game.rt.state;
  var guard = 0;
  while (state && !state.over && guard < 12) {
    var choices = state.upgradeChoices;
    if (choices && choices.length) {
      var index = pickUpgradeIndex(choices, state.player, state);
      var before = choices.length;
      try {
        game.chooseUpgrade(index);
      } catch (error) {
        notes.push('chooseUpgrade failed: ' + (error && error.message ? error.message : String(error)));
        return { stuck: true, notes: notes };
      }
      if (state.upgradeChoices === choices) {
        notes.push('chooseUpgrade did not consume index ' + index + ' (len ' + before + ')');
        return { stuck: true, notes: notes };
      }
      guard += 1;
      continue;
    }
    if (state.interlude && state.interlude.step === 'extract' && ctx.gate === 'extract' && game.interlude && typeof game.interlude.confirmExtract === 'function') {
      game.interlude.confirmExtract();
      notes.push('wave-15 gate: extracted');
      guard += 1;
      continue;
    }
    if (state.interlude) {
      var calledRoute = callFirst(game.interlude, ROUTE_FNS, 0);
      var calledRepair = callFirst(game.interlude, REPAIR_FNS, undefined);
      if (state.interlude) {
        var options = state.interlude.options || [];
        var first = options.length ? options[0] : null;
        var id = first && (first.id || first.key) ? (first.id || first.key) : (typeof first === 'string' ? first : '');
        if (id && (state.interlude.step === 'route' || !state.interlude.step)) {
          state.route = id;
          if (!state.routeHistory) state.routeHistory = [];
          state.routeHistory.push(id);
        }
        notes.push((calledRoute || calledRepair)
          ? 'interlude API left state.interlude set; cleared so the sim can continue'
          : 'no interlude API; cleared state.interlude so the sim can continue');
        state.interlude = null;
        if (state.paused) state.paused = false;
      }
      guard += 1;
      continue;
    }
    if (state.paused) {
      state.paused = false;
      notes.push('cleared unexpected pause');
    }
    break;
  }
  if (guard >= 12 && state && ((state.upgradeChoices && state.upgradeChoices.length) || state.interlude)) {
    return { stuck: true, notes: notes };
  }
  return { stuck: false, notes: notes };
}
