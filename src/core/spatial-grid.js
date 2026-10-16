// Flat 2D Spatial Hash Grid
// Zero GC runtime memory allocation using TypedArrays for high-performance collision detection.

export var CELL_SIZE = 110;
export var GRID_COLS = 32;
export var GRID_ROWS = 24;
export var TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 768
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
 * Convenience helper to populate the grid with an array of enemies.
 * Associates each enemy's array index or sequential ID in entityTable.
 */
export function populateEnemyGrid(enemies) {
  clearSpatialGrid();
  if (!enemies) return;
  var len = enemies.length;
  if (len > entityTable.length) len = entityTable.length;
  entityTableSize = len;
  for (var i = 0; i < len; i += 1) {
    var e = enemies[i];
    if (e && e.hp > 0 && !e.burrowed && !e.untargetable) {
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
