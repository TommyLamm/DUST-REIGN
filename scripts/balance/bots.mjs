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

export var SKILLED_NOTES = [
  'skilled sidesteps shots that will hit within 0.32s and dashes only if impact is under 0.12s (idle still dashes at a 60px gap; kite still does not dash). Acid lob markers and volatile blasts count as telegraphs.',
  'skilled steps out of mortar / meteor / acid / lightning / Dreadnought charge lanes and the Sovereign eye, and flees an arming Scurrier or a Burrower emerge circle.',
  'skilled orbits bosses at 280–420px instead of 160–250px, and shoots Storm Towers first while Sovereign is shielded.',
  'skilled detours to a repair orb inside 260px when hull is under 72%.',
  'skilled, under 50% hull, ranks DEFENSE above OFFENSE. Fusion stays first. idle and kite keep the original picker.'
];

export function setBotContext(name) {
  activeBot = name || 'skilled';
}

export function pickUpgradeIndex(choices, player) {
  var best = 0;
  var bestRank = 99;
  var hurt = activeBot === 'skilled' && player && player.maxHp > 0 && (player.hp / player.maxHp) < 0.5;
  if (!choices) return 0;
  for (var i = 0; i < choices.length; i += 1) {
    var cat = String((choices[i] && choices[i].category) || '').toUpperCase();
    var rank = Object.prototype.hasOwnProperty.call(CARD_RANK, cat) ? CARD_RANK[cat] : 4;
    if (hurt && cat === 'DEFENSE') rank = 0.5;
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

export function actBot(game, botName) {
  var rt = game.rt;
  var state = rt.state;
  var p = state.player;
  var width = (rt.ui && rt.ui.width) || state.width || 960;
  var height = (rt.ui && rt.ui.height) || state.height || 640;
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
    }
    if (shieldBoss && tower) aim = tower;
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
  rt.input.mouse.x = aimX;
  rt.input.mouse.y = aimY;
  rt.input.mouse.down = botName !== 'idle';
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
      var index = pickUpgradeIndex(choices, state.player);
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
