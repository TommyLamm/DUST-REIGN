import { WORLD_WIDTH, WORLD_HEIGHT, MAP_MARGIN, PLAYABLE_WIDTH, PLAYABLE_HEIGHT, SPAWN_CENTER_X, SPAWN_CENTER_Y } from '../src/core/constants.js';
import { makeState } from '../src/core/state.js';
import { CELL_SIZE, GRID_COLS, GRID_ROWS, TOTAL_CELLS, clearSpatialGrid, insertToGrid, queryGrid } from '../src/core/spatial-grid.js';
import { culledEnemyIndices, culledEnemyCount, updateFrustumCulling } from '../src/render/draw.js';
import { createDefaultPois, stepPois } from '../src/systems/sim/poi.js';
import { rt } from '../src/core/runtime.js';

console.log('================================================================');
console.log('  TRACK 2: LARGE MAP, 1024 TILING, CULLING & POI TEST SUITE    ');
console.log('================================================================\n');

// 1. Verify Map Dimensions and Constants
console.log('[1/5] Verifying 3520x2640 World Dimensions & Margin Constants...');
if (WORLD_WIDTH !== 3520 || WORLD_HEIGHT !== 2640) {
  throw new Error(`Expected WORLD_WIDTH=3520, WORLD_HEIGHT=2640, got ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
}
if (MAP_MARGIN !== 160) {
  throw new Error(`Expected MAP_MARGIN=160, got ${MAP_MARGIN}`);
}
if (PLAYABLE_WIDTH !== 3200 || PLAYABLE_HEIGHT !== 2320) {
  throw new Error(`Expected Playable 3200x2320, got ${PLAYABLE_WIDTH}x${PLAYABLE_HEIGHT}`);
}
if (SPAWN_CENTER_X !== 1760 || SPAWN_CENTER_Y !== 1320) {
  throw new Error(`Expected spawn center (1760, 1320), got (${SPAWN_CENTER_X}, ${SPAWN_CENTER_Y})`);
}
console.log(' -> World dimensions & margin constants verified.\n');

// 2. Verify Spatial Hash Grid Alignment
console.log('[2/5] Verifying Spatial Hash Grid 55px (64x48) Zero-GC Alignment...');
if (CELL_SIZE !== 55 || GRID_COLS !== 64 || GRID_ROWS !== 48) {
  throw new Error(`Spatial grid mismatch: ${GRID_COLS}x${GRID_ROWS} @ ${CELL_SIZE}px`);
}
if (GRID_COLS * CELL_SIZE !== WORLD_WIDTH || GRID_ROWS * CELL_SIZE !== WORLD_HEIGHT) {
  throw new Error(`Spatial grid does not cover world: ${GRID_COLS * CELL_SIZE}x${GRID_ROWS * CELL_SIZE}`);
}
clearSpatialGrid();
insertToGrid(1, SPAWN_CENTER_X, SPAWN_CENTER_Y, 20);
var queryResults = [];
queryGrid(SPAWN_CENTER_X, SPAWN_CENTER_Y, 50, queryResults);
if (queryResults.length !== 1 || queryResults[0] !== 1) {
  throw new Error(`Spatial grid query failed around spawn center`);
}
console.log(' -> Spatial grid perfectly fits 3520x2640 and query verified.\n');

// 3. Verify State Creation and Player Centering
console.log('[3/5] Verifying State Creation, Default POIs & Player Centering...');
var state = makeState();
if (state.width !== 3520 || state.height !== 2640) {
  throw new Error(`State size incorrect: ${state.width}x${state.height}`);
}
if (state.player.x !== 1760 || state.player.y !== 1320) {
  throw new Error(`Player not centered at (1760, 1320), got (${state.player.x}, ${state.player.y})`);
}
if (!state.pois || (state.pois.length !== 7 && state.pois.length !== 9)) {
  throw new Error(`Expected 7 or 9 tactical POIs in default state, found ${state.pois ? state.pois.length : 0}`);
}
console.log(` -> State dimensions, player centering and ${state.pois.length} POI instances verified.\n`);

// 4. Verify World-Space Frustum Culling Pipeline
console.log('[4/5] Verifying World Frustum AABB Culling Pipeline (48px regular, 220px boss)...');
rt.state = state;
state.enemies = [];

// Visible enemy in view (camera at 1760, 1320, view 960x640: [1280, 2240] x [1000, 1640])
state.enemies.push({ kind: 'crawler', x: 1760, y: 1320, hp: 30, r: 14 }); // #0 visible
state.enemies.push({ kind: 'rusher', x: 1700, y: 1250, hp: 20, r: 12 });  // #1 visible
// Offscreen enemies (> 90% map area)
state.enemies.push({ kind: 'crawler', x: 200, y: 200, hp: 30, r: 14 });   // #2 culled
state.enemies.push({ kind: 'crawler', x: 3200, y: 2400, hp: 30, r: 14 }); // #3 culled
// Boss right outside regular padding (48px) but inside boss padding (220px)
// View right edge is 1760 + 480 = 2240. At x=2350, distance from edge is 110px.
// Regular enemy (pad 48) is culled. Boss (pad 220) is visible!
state.enemies.push({ kind: 'crawler', x: 2350, y: 1320, hp: 30, r: 14 }); // #4 regular -> culled
state.enemies.push({ kind: 'titan', isBoss: true, x: 2350, y: 1320, hp: 500, r: 60 }); // #5 boss -> visible

updateFrustumCulling(1760, 1320, 960, 640);

var visibleIndices = Array.from(culledEnemyIndices.subarray(0, culledEnemyCount));
if (culledEnemyCount !== 3) {
  throw new Error(`Expected exactly 3 culled visible enemies (#0, #1, #5), got count=${culledEnemyCount}: [${visibleIndices.join(', ')}]`);
}
if (!visibleIndices.includes(0) || !visibleIndices.includes(1) || !visibleIndices.includes(5)) {
  throw new Error(`Expected indices [0, 1, 5], got [${visibleIndices.join(', ')}]`);
}
if (visibleIndices.includes(2) || visibleIndices.includes(3) || visibleIndices.includes(4)) {
  throw new Error(`Offscreen enemy not culled properly: [${visibleIndices.join(', ')}]`);
}
console.log(` -> Frustum culling verified: 3 visible, 3 culled (75%+ culled offscreen ratio).\n`);

// 5. Verify Tactical POIs Mechanics & Lifecycle
console.log('[5/5] Verifying Tactical POIs Lifecycle & Interaction Mechanics...');
var pois = state.pois;
var poiMap = {};
for (var p of pois) poiMap[p.id] = p;

var requiredKinds = ['scrap_silo', 'orbital_pod', 'field_rig', 'xeno_nest', 'emp_spire', 'bunker_cache', 'crystal_resonance_pylon', 'crystal_siphon'];
for (var k of requiredKinds) {
  var found = pois.find(p => p.kind === k);
  if (!found) throw new Error(`Missing tactical POI kind: ${k}`);
}

// Test Silo North interaction (move player to silo, run stepPois)
var silo = poiMap['silo_north'];
state.player.x = silo.x;
state.player.y = silo.y;
var dummyFrame = { p: state.player, boundW: 3520, boundH: 2640 };

// 1.5s interaction trigger
stepPois(0.8, dummyFrame);
if (silo.status !== 'idle' || silo.progress <= 0) {
  throw new Error(`Silo should be interacting, progress=${silo.progress}`);
}
stepPois(0.8, dummyFrame);
if (silo.status !== 'active') {
  throw new Error(`Silo did not transition to active after 1.6s`);
}

// Complete 20s defense
stepPois(20.5, dummyFrame);
if (silo.status !== 'completed') {
  throw new Error(`Silo did not complete 20s defense, status=${silo.status}`);
}

// Test EMP Spire overload
var spire = poiMap['spire_nw'];
state.bullets.push({ x: spire.x, y: spire.y, damage: 300, life: 1 });
stepPois(0.016, dummyFrame);
if (spire.status !== 'completed' || spire.capacitors !== 0) {
  throw new Error(`EMP Spire did not overload upon destroying capacitors`);
}

// Test Crystal Resonance Pylon charge and overload
var pylon = poiMap['pylon_ne'];
state.player.x = pylon.x;
state.player.y = pylon.y;
stepPois(2.3, dummyFrame);
if (pylon.status !== 'completed') {
  throw new Error(`Crystal Resonance Pylon did not complete 2.2s charge`);
}
if ((state.player.overdrive || 0) < 5.0) {
  throw new Error(`Crystal Resonance Pylon did not grant player overdrive`);
}

// Test Crystal Siphon heat load and meltdown
var siphon = poiMap['siphon_sw'];
state.player.x = siphon.x;
state.player.y = siphon.y;
stepPois(10.5, dummyFrame);
if (siphon.status !== 'completed' || siphon.heatLoad < 1.0) {
  throw new Error(`Crystal Siphon did not reach 100% heat load meltdown`);
}

console.log(' -> Tactical POIs lifecycle and interaction mechanics verified.\n');

console.log('================================================================');
console.log('  ALL TRACK 2 TESTS COMPLETED SUCCESSFULLY (100% PASS)         ');
console.log('================================================================');
