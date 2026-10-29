import { clamp } from '../../core/utils.js';

/** Distance inside the hard clamp where soft edge pressure begins. */
export var EDGE_BAND = 72;
/** Contact / pin band: player is considered pressed into the hatch stripe. */
export var EDGE_PIN = 40;
/** Peak soft spring push back into the map (px/s). */
export var EDGE_REPEL_SPEED = 210;
/** Extra spawn clearance when the player is edge-pressed. */
export var EDGE_SPAWN_MARGIN = 140;

/**
 * Measure how hard an entity is pressed into a world edge.
 * Returns inward unit normal (nx,ny), max depth into EDGE_BAND, and pin flag.
 */
export function edgePressure(x, y, r, boundW, boundH) {
  var rad = (typeof r === 'number' && r > 0) ? r : 12;
  var left = x - rad;
  var right = boundW - rad - x;
  var top = y - rad;
  var bottom = boundH - rad - y;
  var nx = 0;
  var ny = 0;
  var depth = 0;

  if (left < EDGE_BAND) {
    nx += 1;
    depth = Math.max(depth, EDGE_BAND - Math.max(0, left));
  }
  if (right < EDGE_BAND) {
    nx -= 1;
    depth = Math.max(depth, EDGE_BAND - Math.max(0, right));
  }
  if (top < EDGE_BAND) {
    ny += 1;
    depth = Math.max(depth, EDGE_BAND - Math.max(0, top));
  }
  if (bottom < EDGE_BAND) {
    ny -= 1;
    depth = Math.max(depth, EDGE_BAND - Math.max(0, bottom));
  }

  if (nx !== 0 || ny !== 0) {
    var len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
  }

  var nearest = Math.min(left, right, top, bottom);
  return {
    nx: nx,
    ny: ny,
    depth: depth,
    nearest: nearest,
    pressed: nearest <= EDGE_PIN
  };
}

/** Soft spring that nudges the player off the hatch stripe without removing the hard wall. */
export function applyPlayerEdgeRepulsion(p, dt, boundW, boundH) {
  if (!p || !(dt > 0)) return null;
  var edge = edgePressure(p.x, p.y, p.r, boundW, boundH);
  if (!(edge.depth > 0) || (edge.nx === 0 && edge.ny === 0)) return edge;
  var t = clamp(edge.depth / EDGE_BAND, 0, 1);
  var push = t * t * EDGE_REPEL_SPEED * dt;
  p.x = clamp(p.x + edge.nx * push, p.r, boundW - p.r);
  p.y = clamp(p.y + edge.ny * push, p.r, boundH - p.r);
  return edge;
}

/**
 * Shove an enemy off the same rim the player is pinned against so contact
 * cannot keep them wedged between hull and hatch.
 */
export function shoveEnemyOffEdge(e, edge, amount, boundW, boundH, withKick) {
  if (!e || !edge || (edge.nx === 0 && edge.ny === 0)) return;
  var push = (typeof amount === 'number') ? amount : 26;
  var rad = e.r || 12;
  e.x = clamp(e.x + edge.nx * push, rad, boundW - rad);
  e.y = clamp(e.y + edge.ny * push, rad, boundH - rad);
  if (withKick && !e.knockbackImmune) {
    e.vx = (e.vx || 0) + edge.nx * 80;
    e.vy = (e.vy || 0) + edge.ny * 80;
  }
}

/** Spawn margin: keep packs off the hatch when the player is already rim-pressed. */
export function edgeAwareSpawnMargin(player, boundW, boundH, baseMargin) {
  var base = (typeof baseMargin === 'number') ? baseMargin : 32;
  if (!player) return base;
  var edge = edgePressure(player.x, player.y, player.r || 16, boundW, boundH);
  if (edge.pressed) return Math.max(base, EDGE_SPAWN_MARGIN);
  if (edge.depth > EDGE_BAND * 0.35) return Math.max(base, 72);
  return base;
}
