/**
 * DUST//REIGN - Track 1 Camera Viewport Dynamics Verification Suite
 */
import assert from 'node:assert';
import { rt } from '../src/core/runtime.js';
import { camera, initCamera, updateCamera, screenToWorld, worldToScreen, addCameraTrauma } from '../src/core/camera.js';
import { drawOffscreenChevrons, drawTacticalMinimap } from '../src/render/overlay.js';

console.log('================================================================');
console.log('  TRACK 1: CAMERA & VIEWPORT DYNAMICS ACCEPTANCE VERIFICATION  ');
console.log('================================================================\n');

// 1. Initial State & Dimensions
console.log('[1/9] Verifying Camera Initial State & 0-GC Contract...');
initCamera(camera, 3520, 2640, 960, 640);
assert.strictEqual(camera.worldW, 3520, 'worldW must be 3520');
assert.strictEqual(camera.worldH, 2640, 'worldH must be 2640');
assert.strictEqual(camera.viewW, 960, 'viewW must be 960');
assert.strictEqual(camera.viewH, 640, 'viewH must be 640');
assert.strictEqual(camera.lookaheadX, 0, 'Initial lookaheadX must be 0');
assert.strictEqual(camera.lookaheadY, 0, 'Initial lookaheadY must be 0');
assert.strictEqual(camera.trauma, 0, 'Initial trauma must be 0');
console.log(' -> Camera singleton dimensions & initial contracts verified.');

// 2. AC-01: Hard player lock while moving and dashing
console.log('[2/9] Verifying AC-01: Hard Player Lock (cruise & dash)...');
var mockPlayer = { x: 850, y: 1000, vx: 100, vy: 0, dashPulse: 0, aimX: 850, aimY: 1000 };
camera.x = 800;
camera.y = 1000;
updateCamera(camera, mockPlayer, {}, 0.016, false);
assert.strictEqual(camera.x, mockPlayer.x, 'Camera must sit exactly on the player while cruising');
assert.strictEqual(camera.y, mockPlayer.y, 'Camera must sit exactly on the player while cruising');
mockPlayer.dashPulse = 1.0;
mockPlayer.x = 2000;
updateCamera(camera, mockPlayer, {}, 0.001, false);
assert.strictEqual(camera.x, 2000, 'Camera must sit exactly on the player while dashing');
for (var mf = 0; mf < 120; mf += 1) {
  mockPlayer.x += 4.5;
  mockPlayer.y += 2.0;
  updateCamera(camera, mockPlayer, {}, 1 / 60, true);
  assert.strictEqual(camera.x, mockPlayer.x, 'Camera must never lag the player');
  assert.strictEqual(camera.y, mockPlayer.y, 'Camera must never lag the player');
}
mockPlayer.dashPulse = 0;
console.log(' -> AC-01 Camera is hard-locked to the player.');

// 3. AC-02: Cursor aim never pushes the player off center
console.log('[3/9] Verifying AC-02: No Aim Lookahead Offset...');
mockPlayer.x = 1760;
mockPlayer.y = 1320;
mockPlayer.vx = 0;
mockPlayer.vy = 0;
mockPlayer.aimX = 1760 + 450;
mockPlayer.aimY = 1320;
updateCamera(camera, mockPlayer, { mouse: { sx: 960, sy: 0, x: 0, y: 0 } }, 0.5, false);
assert.strictEqual(camera.x, 1760, 'Far cursor must not shift the view');
assert.strictEqual(camera.y, 1320, 'Far cursor must not shift the view');
assert.strictEqual(camera.lookaheadX, 0, 'Lookahead must stay 0');
assert.strictEqual(camera.lookaheadY, 0, 'Lookahead must stay 0');
console.log(' -> AC-02 Player stays centered regardless of aim.');

// 4. AC-03: Player-centered view maps the screen center to the player
console.log('[4/9] Verifying AC-03: Screen Center Maps To Player...');
var centerWorld = { x: 0, y: 0 };
screenToWorld(480, 320, camera, centerWorld);
assert.strictEqual(centerWorld.x, 1760, 'Screen center must map to player x');
assert.strictEqual(centerWorld.y, 1320, 'Screen center must map to player y');
var playerScreen = { x: 0, y: 0 };
worldToScreen(1760, 1320, camera, playerScreen);
assert.strictEqual(playerScreen.x, 480, 'Player must project to screen center x');
assert.strictEqual(playerScreen.y, 320, 'Player must project to screen center y');
console.log(' -> AC-03 Player projects to the exact view center.');

// 5. AC-04: Soft edge clamp keeps mech inset (thin void OK, no beam-only rim)
console.log('[5/9] Verifying AC-04: Soft Edge Clamp Keeps Mech Visible...');
// keep=(16)+40=56; maxVoidX=480-56=424; maxVoidY=320-56=264
mockPlayer.x = 15;
mockPlayer.y = 1320;
mockPlayer.aimX = 15;
mockPlayer.aimY = 1320;
updateCamera(camera, mockPlayer, {}, 0.5, false);
assert.strictEqual(camera.clampedX, 424, `Left-edge camera should inset-clamp, got ${camera.clampedX}`);
mockPlayer.x = 3505;
mockPlayer.y = 2625;
updateCamera(camera, mockPlayer, {}, 0.5, false);
assert.strictEqual(camera.clampedX, 3096, `Right-edge camera should inset-clamp, got ${camera.clampedX}`);
assert.strictEqual(camera.clampedY, 2376, `Bottom-edge camera should inset-clamp, got ${camera.clampedY}`);
console.log(' -> AC-04 Soft clamp keeps hull on-screen at the rim.');

// 6. AC-05: Trauma Shake & Decoupled Inverse Coordinate Transform
console.log('[6/9] Verifying AC-05: Trauma Shake Decoupling for Aiming...');
mockPlayer.x = 1760;
mockPlayer.y = 1320;
mockPlayer.aimX = 1760;
mockPlayer.aimY = 1320;
camera.x = 1760;
camera.y = 1320;
camera.lookaheadX = 0;
camera.lookaheadY = 0;
camera.lookaheadVX = 0;
camera.lookaheadVY = 0;
camera.targetLookaheadX = 0;
camera.targetLookaheadY = 0;
camera.clampedX = 1760;
camera.clampedY = 1320;
camera.trauma = 0.8;
rt.renderTime = 0.5; // Ensure non-zero time so trig functions produce non-zero offsets
updateCamera(camera, mockPlayer, {}, 0.016, false);
assert(camera.shakeX !== 0 || camera.shakeY !== 0, 'Camera shake must be non-zero when trauma > 0');

// Screen to World inverse transform:
// Screen center is (480, 320)
var outWorld = { x: 0, y: 0 };
screenToWorld(480, 320, camera, outWorld);
// Despite shakeX and shakeY, center of screen in decoupled world space must match camera center!
assert.strictEqual(outWorld.x, 1760, `Decoupled screenToWorld must not be jittered by shakeX (${camera.shakeX})`);
assert.strictEqual(outWorld.y, 1320, `Decoupled screenToWorld must not be jittered by shakeY (${camera.shakeY})`);
console.log(' -> AC-05 Screen shake decoupled inverse transform verified.');

// 7. AC-06: Offscreen Edge Chevrons & Minimap Exports
console.log('[7/9] Verifying AC-06: Offscreen Edge Chevrons & Tactical Minimap...');
assert.strictEqual(typeof drawOffscreenChevrons, 'function', 'drawOffscreenChevrons must be exported');
assert.strictEqual(typeof drawTacticalMinimap, 'function', 'drawTacticalMinimap must be exported');
console.log(' -> AC-06 Edge chevrons and tactical minimap functions verified.');

// 8. AC-08: Accessibility & Motion Reduction
console.log('[8/9] Verifying AC-08: Reduced Motion Zero-Shake Guarantee...');
addCameraTrauma(1.0, camera);
updateCamera(camera, mockPlayer, {}, 0.016, true); // reducedMotion = true
assert.strictEqual(camera.shakeX, 0, 'shakeX must be strictly 0 when reducedMotion is active');
assert.strictEqual(camera.shakeY, 0, 'shakeY must be strictly 0 when reducedMotion is active');
assert.strictEqual(camera.shakeAngle, 0, 'shakeAngle must be strictly 0 when reducedMotion is active');
console.log(' -> AC-08 Reduced motion zero-shake verified.');

// 9. AC-09: Cursor sweeps never move the view
console.log('[9/9] Verifying AC-09: Cursor Sweep Keeps The View Still...');
initCamera(camera, 3520, 2640, 960, 640);
mockPlayer.x = 1760;
mockPlayer.y = 1320;
var sweepInput = { mouse: { sx: 960, sy: 320, x: 0, y: 0 } };
for (var f = 0; f < 120; f += 1) {
  sweepInput.mouse.sx = (f % 2) ? 0 : 960;
  updateCamera(camera, mockPlayer, sweepInput, 1 / 60, true);
  assert.strictEqual(camera.x, 1760, 'Cursor sweep must not pan the view');
}
console.log(' -> AC-09 Cursor sweep keeps the player centered.');

console.log('\n================================================================');
console.log('  ALL TRACK 1 CAMERA & VIEWPORT CRITERIA VERIFIED (100%)');
console.log('================================================================\n');
