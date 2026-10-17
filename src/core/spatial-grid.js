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
 * Dynamically initializes or reconfigures the spatial hash grid dimensions.
 * Computes cols/rows to seamlessly cover the specified width and height.
 */
export function initSpatialGrid(width, height, cellSize) {
  var w = (typeof width === 'number' && width > 0) ? width : 3520;
  var h = (typeof height === 'number' && height > 0) ? height : 2640;
  var cs = (typeof cellSize === 'number' && cellSize > 0) ? cellSize : 55;

  CELL_SIZE = cs;
  GRID_COLS = Math.ceil(w / cs);
  GRID_ROWS = Math.ceil(h / cs);
  TOTAL_CELLS = GRID_COLS * GRID_ROWS;

  gridCounts = new Int16Array(TOTAL_CELLS);
  gridIndices = new Int32Array(TOTAL_CELLS * MAX_ITEMS_PER_CELL);
  bulletGridCounts = new Int16Array(TOTAL_CELLS);
  bulletGridIndices = new Int32Array(TOTAL_CELLS * MAX_ITEMS_PER_CELL);

  clearSpatialGrid();
  clearBulletGrid();

  return {
    cellSize: CELL_SIZE,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    totalCells: TOTAL_CELLS
  };
}

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
  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return;
  if (GRID_COLS <= 0 || GRID_ROWS <= 0 || TOTAL_CELLS <= 0) return;
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
      if (cellIdx < 0 || cellIdx >= TOTAL_CELLS) continue;
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
  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return outResults;
  if (GRID_COLS <= 0 || GRID_ROWS <= 0 || TOTAL_CELLS <= 0) return outResults;
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
      if (cellIdx < 0 || cellIdx >= TOTAL_CELLS) continue;
      var count = gridCounts[cellIdx];
      var base = cellIdx * MAX_ITEMS_PER_CELL;
      for (var i = 0; i < count; i += 1) {
        var id = gridIndices[base + i];
        if (id >= 0) {
          if (id >= queryStamps.length) {
            var newSize = Math.max(queryStamps.length * 2, id + 1024);
            var newStamps = new Int32Array(newSize);
            newStamps.set(queryStamps);
            queryStamps = newStamps;
          }
          if (queryStamps[id] !== stamp) {
            queryStamps[id] = stamp;
            outResults.push(id);
          }
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
  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return true;
  if (GRID_COLS <= 0 || GRID_ROWS <= 0 || TOTAL_CELLS <= 0) return true;
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
      if (cellIdx < 0 || cellIdx >= TOTAL_CELLS) continue;
      var count = gridCounts[cellIdx];
      var base = cellIdx * MAX_ITEMS_PER_CELL;
      for (var i = 0; i < count; i += 1) {
        var id = gridIndices[base + i];
        if (id >= 0) {
          if (id >= queryStamps.length) {
            var newSize = Math.max(queryStamps.length * 2, id + 1024);
            var newStamps = new Int32Array(newSize);
            newStamps.set(queryStamps);
            queryStamps = newStamps;
          }
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
 * Culls entities > 120px outside world bounds.
 */
export function populateEnemyGrid(enemies) {
  clearSpatialGrid();
  if (!enemies) return;
  var boundW = (rt && rt.state && rt.state.width) || (rt && rt.ui && rt.ui.width) || 3520;
  var boundH = (rt && rt.state && rt.state.height) || (rt && rt.ui && rt.ui.height) || 2640;
  var len = enemies.length;
  if (len > entityTable.length) {
    var newTable = new Array(Math.max(entityTable.length * 2, len + 512));
    for (var ti = 0; ti < entityTableSize; ti += 1) newTable[ti] = entityTable[ti];
    entityTable = newTable;
  }
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
  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return;
  if (GRID_COLS <= 0 || GRID_ROWS <= 0 || TOTAL_CELLS <= 0) return;
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
      if (cellIdx < 0 || cellIdx >= TOTAL_CELLS) continue;
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
  if (len > bulletTable.length) {
    var newBTable = new Array(Math.max(bulletTable.length * 2, len + 512));
    for (var bi = 0; bi < bulletTableSize; bi += 1) newBTable[bi] = bulletTable[bi];
    bulletTable = newBTable;
  }
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
  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return true;
  if (GRID_COLS <= 0 || GRID_ROWS <= 0 || TOTAL_CELLS <= 0) return true;
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
      if (cellIdx < 0 || cellIdx >= TOTAL_CELLS) continue;
      var count = bulletGridCounts[cellIdx];
      var base = cellIdx * MAX_ITEMS_PER_CELL;
      for (var i = 0; i < count; i += 1) {
        var id = bulletGridIndices[base + i];
        if (id >= 0) {
          if (id >= bulletQueryStamps.length) {
            var newSize = Math.max(bulletQueryStamps.length * 2, id + 1024);
            var newStamps = new Int32Array(newSize);
            newStamps.set(bulletQueryStamps);
            bulletQueryStamps = newStamps;
          }
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
