import { rt } from './runtime.js';

// Flat 2D Spatial Hash Grid (55px tuned)
// Zero GC runtime memory allocation using TypedArrays for high-performance collision detection.

export var CELL_SIZE = 55;
export var GRID_COLS = 64;
export var GRID_ROWS = 48;
export var TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 3072
export var MAX_ITEMS_PER_CELL = 64;

// Pre-allocated flat typed arrays for 0 runtime allocations
export var gridCounts = new Int16Array(TOTAL_CELLS);
export var gridIndices = new Int32Array(TOTAL_CELLS * MAX_ITEMS_PER_CELL);

// Query deduplication stamp array
var queryStamps = new Int32Array(4096);
var queryStamp = 1;

// Reusable internal array for entity lookups without allocation
var entityTable = new Array(2048);
var entityTableSize = 0;

/**
 * Resets grid cell occupancy counts to 0 in O(C) native memset.
 * Zero memory allocation.
 */
export function clearSpatialGrid() {
  gridCounts.fill(0);
  for (var i = 0; i < entityTableSize; i += 1) {
    entityTable[i] = null;
  }
  entityTableSize = 0;
}

/**
 * Inserts an entity ID into all grid cells spanned by its circular bounding area.
 * Zero memory allocation.
 */
export function insertToGrid(entityId, x, y, radius) {
  var r = radius > 0 ? radius : 0;
  var minCol = Math.floor((x - r) / CELL_SIZE);
  var maxCol = Math.floor((x + r) / CELL_SIZE);
  var minRow = Math.floor((y - r) / CELL_SIZE);
  var maxRow = Math.floor((y + r) / CELL_SIZE);

  if (maxCol < 0 || minCol >= GRID_COLS || maxRow < 0 || minRow >= GRID_ROWS) return;
  if (minCol < 0) minCol = 0;
  if (maxCol >= GRID_COLS) maxCol = GRID_COLS - 1;
  if (minRow < 0) minRow = 0;
  if (maxRow >= GRID_ROWS) maxRow = GRID_ROWS - 1;

  for (var row = minRow; row <= maxRow; row += 1) {
    var rowBase = row * GRID_COLS;
    for (var col = minCol; col <= maxCol; col += 1) {
      var cellIdx = rowBase + col;
      var count = gridCounts[cellIdx];
      if (count < MAX_ITEMS_PER_CELL) {
        gridIndices[cellIdx * MAX_ITEMS_PER_CELL + count] = entityId;
        gridCounts[cellIdx] = count + 1;
      }
    }
  }
}

/**
 * Queries all entity IDs overlapping the given circular query region.
 * Writes results into caller-provided outResults array (cleared via length = 0).
 * Prevents duplicates across multiple overlapping cells using query stamps.
 * Zero memory allocation.
 */
export function queryGrid(x, y, radius, outResults) {
  outResults.length = 0;
  var r = radius > 0 ? radius : 0;
  var minCol = Math.floor((x - r) / CELL_SIZE);
  var maxCol = Math.floor((x + r) / CELL_SIZE);
  var minRow = Math.floor((y - r) / CELL_SIZE);
  var maxRow = Math.floor((y + r) / CELL_SIZE);

  if (maxCol < 0 || minCol >= GRID_COLS || maxRow < 0 || minRow >= GRID_ROWS) return outResults;
  if (minCol < 0) minCol = 0;
  if (maxCol >= GRID_COLS) maxCol = GRID_COLS - 1;
  if (minRow < 0) minRow = 0;
  if (maxRow >= GRID_ROWS) maxRow = GRID_ROWS - 1;

  queryStamp += 1;
  if (queryStamp >= 2147483640) {
    queryStamps.fill(0);
    queryStamp = 1;
  }
  var stamp = queryStamp;

  for (var row = minRow; row <= maxRow; row += 1) {
    var rowBase = row * GRID_COLS;
    for (var col = minCol; col <= maxCol; col += 1) {
      var cellIdx = rowBase + col;
      var count = gridCounts[cellIdx];
      var base = cellIdx * MAX_ITEMS_PER_CELL;
      for (var i = 0; i < count; i += 1) {
        var id = gridIndices[base + i];
        if (id >= 0 && id < queryStamps.length) {
          if (queryStamps[id] !== stamp) {
            queryStamps[id] = stamp;
            outResults.push(id);
          }
        } else if (outResults.indexOf(id) === -1) {
          outResults.push(id);
        }
      }
    }
  }
  return outResults;
}

/**
 * Queries all entity IDs overlapping circular region and invokes callback(entityId).
 * Supports early-out: if callback returns false (strictly === false), traversal aborts immediately.
 * Zero memory allocation.
 * Returns true if completed, false if aborted early.
 */
export function queryGridCallback(x, y, radius, callback) {
  var r = radius > 0 ? radius : 0;
  var minCol = Math.floor((x - r) / CELL_SIZE);
  var maxCol = Math.floor((x + r) / CELL_SIZE);
  var minRow = Math.floor((y - r) / CELL_SIZE);
  var maxRow = Math.floor((y + r) / CELL_SIZE);

  if (maxCol < 0 || minCol >= GRID_COLS || maxRow < 0 || minRow >= GRID_ROWS) return true;
  if (minCol < 0) minCol = 0;
  if (maxCol >= GRID_COLS) maxCol = GRID_COLS - 1;
  if (minRow < 0) minRow = 0;
  if (maxRow >= GRID_ROWS) maxRow = GRID_ROWS - 1;

  queryStamp += 1;
  if (queryStamp >= 2147483640) {
    queryStamps.fill(0);
    queryStamp = 1;
  }
  var stamp = queryStamp;

  for (var row = minRow; row <= maxRow; row += 1) {
    var rowBase = row * GRID_COLS;
    for (var col = minCol; col <= maxCol; col += 1) {
      var cellIdx = rowBase + col;
      var count = gridCounts[cellIdx];
      var base = cellIdx * MAX_ITEMS_PER_CELL;
      for (var i = 0; i < count; i += 1) {
        var id = gridIndices[base + i];
        if (id >= 0 && id < queryStamps.length) {
          if (queryStamps[id] === stamp) continue;
          queryStamps[id] = stamp;
          if (callback(id) === false) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

/**
 * Convenience helper to populate the grid with an array of enemies.
 * Associates each enemy's array index in entityTable.
 * Culls entities > 120px outside visible bounds.
 */
export function populateEnemyGrid(enemies) {
  clearSpatialGrid();
  if (!enemies) return;
  var boundW = (rt && rt.ui && rt.ui.width) || (rt && rt.state && rt.state.width) || 960;
  var boundH = (rt && rt.ui && rt.ui.height) || (rt && rt.state && rt.state.height) || 640;
  var len = enemies.length;
  if (len > entityTable.length) len = entityTable.length;
  entityTableSize = len;
  for (var i = 0; i < len; i += 1) {
    var e = enemies[i];
    if (e && e.hp > 0 && !e.burrowed && !e.untargetable) {
      if (e.x < -120 || e.x > boundW + 120 || e.y < -120 || e.y > boundH + 120) {
        entityTable[i] = null;
        continue;
      }
      entityTable[i] = e;
      insertToGrid(i, e.x, e.y, e.r || 12);
    } else {
      entityTable[i] = null;
    }
  }
}

/**
 * Returns the enemy entity mapped to a given entity ID.
 */
export function getEnemyById(id) {
  return entityTable[id] || null;
}

/**
 * Ensures spatial grid is populated for enemies array if not yet built or length changed.
 */
export function ensureEnemyGrid(enemies) {
  if (enemies && enemies.length > 0 && entityTableSize !== enemies.length) {
    populateEnemyGrid(enemies);
  }
}

// Flat bullet spatial hash grid for bullet vaporization checks
export var bulletGridCounts = new Int16Array(TOTAL_CELLS);
export var bulletGridIndices = new Int32Array(TOTAL_CELLS * MAX_ITEMS_PER_CELL);
var bulletQueryStamps = new Int32Array(4096);
var bulletQueryStamp = 1;
var bulletTable = new Array(2048);
var bulletTableSize = 0;

export function clearBulletGrid() {
  bulletGridCounts.fill(0);
  for (var i = 0; i < bulletTableSize; i += 1) {
    bulletTable[i] = null;
  }
  bulletTableSize = 0;
}

export function insertToBulletGrid(bulletId, x, y, radius) {
  var r = radius > 0 ? radius : 0;
  var minCol = Math.floor((x - r) / CELL_SIZE);
  var maxCol = Math.floor((x + r) / CELL_SIZE);
  var minRow = Math.floor((y - r) / CELL_SIZE);
  var maxRow = Math.floor((y + r) / CELL_SIZE);

  if (maxCol < 0 || minCol >= GRID_COLS || maxRow < 0 || minRow >= GRID_ROWS) return;
  if (minCol < 0) minCol = 0;
  if (maxCol >= GRID_COLS) maxCol = GRID_COLS - 1;
  if (minRow < 0) minRow = 0;
  if (maxRow >= GRID_ROWS) maxRow = GRID_ROWS - 1;

  for (var row = minRow; row <= maxRow; row += 1) {
    var rowBase = row * GRID_COLS;
    for (var col = minCol; col <= maxCol; col += 1) {
      var cellIdx = rowBase + col;
      var count = bulletGridCounts[cellIdx];
      if (count < MAX_ITEMS_PER_CELL) {
        bulletGridIndices[cellIdx * MAX_ITEMS_PER_CELL + count] = bulletId;
        bulletGridCounts[cellIdx] = count + 1;
      }
    }
  }
}

export function populateEnemyBulletGrid(bullets) {
  clearBulletGrid();
  if (!bullets) return;
  var len = bullets.length;
  if (len > bulletTable.length) len = bulletTable.length;
  bulletTableSize = len;
  for (var i = 0; i < len; i += 1) {
    var b = bullets[i];
    if (b && (b.life > 0 || b.life === undefined) && !b._vaporized) {
      bulletTable[i] = b;
      insertToBulletGrid(i, b.x, b.y, b.r || 4);
    } else {
      bulletTable[i] = null;
    }
  }
}

export function queryEnemyBulletGridCallback(x, y, radius, callback) {
  var r = radius > 0 ? radius : 0;
  var minCol = Math.floor((x - r) / CELL_SIZE);
  var maxCol = Math.floor((x + r) / CELL_SIZE);
  var minRow = Math.floor((y - r) / CELL_SIZE);
  var maxRow = Math.floor((y + r) / CELL_SIZE);

  if (maxCol < 0 || minCol >= GRID_COLS || maxRow < 0 || minRow >= GRID_ROWS) return true;
  if (minCol < 0) minCol = 0;
  if (maxCol >= GRID_COLS) maxCol = GRID_COLS - 1;
  if (minRow < 0) minRow = 0;
  if (maxRow >= GRID_ROWS) maxRow = GRID_ROWS - 1;

  bulletQueryStamp += 1;
  if (bulletQueryStamp >= 2147483640) {
    bulletQueryStamps.fill(0);
    bulletQueryStamp = 1;
  }
  var stamp = bulletQueryStamp;

  for (var row = minRow; row <= maxRow; row += 1) {
    var rowBase = row * GRID_COLS;
    for (var col = minCol; col <= maxCol; col += 1) {
      var cellIdx = rowBase + col;
      var count = bulletGridCounts[cellIdx];
      var base = cellIdx * MAX_ITEMS_PER_CELL;
      for (var i = 0; i < count; i += 1) {
        var id = bulletGridIndices[base + i];
        if (id >= 0 && id < bulletQueryStamps.length) {
          if (bulletQueryStamps[id] === stamp) continue;
          bulletQueryStamps[id] = stamp;
          if (callback(id) === false) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

export function getEnemyBulletById(id) {
  return bulletTable[id] || null;
}

