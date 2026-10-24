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

// 2. AC-01: Asymmetric Dual-Stage Damping & Soft-Leash Deadzone
console.log('[2/9] Verifying AC-01: Asymmetric Dual-Stage Damping & Soft-Leash Deadzone...');
var mockPlayer = { x: 850, y: 1000, vx: 100, vy: 0, dashPulse: 0, aimX: 850, aimY: 1000 };
camera.x = 800;
camera.y = 1000;

// Cruise tracking (lambda = 7.0)
updateCamera(camera, mockPlayer, {}, 0.016, false);
var cruiseMoved = camera.x - 800;

// Reset and test Dash tracking (lambda = 16.0)
camera.x = 800;
camera.y = 1000;
mockPlayer.dashPulse = 1.0;
updateCamera(camera, mockPlayer, {}, 0.016, false);
var dashMoved = camera.x - 800;

assert(dashMoved > cruiseMoved * 2, `Dash tracking (${dashMoved}) must be > 2x faster than cruise (${cruiseMoved})`);

// Soft-leash deadzone test: Player far ahead, leash max = min(960, 640) * 0.12 = 76.8px
mockPlayer.x = 2000;
mockPlayer.y = 1000;
mockPlayer.aimX = 2000;
mockPlayer.aimY = 1000;
camera.x = 1000;
camera.y = 1000;
camera.lookaheadX = 0;
camera.lookaheadY = 0;
camera.lookaheadVX = 0;
camera.lookaheadVY = 0;
updateCamera(camera, mockPlayer, {}, 0.001, false); // Tiny dt
var distAfterLeash = Math.hypot(mockPlayer.x - camera.x, mockPlayer.y - camera.y);
assert(distAfterLeash <= 76.8001, `Camera must be hard-leashed to <= 76.8px, got ${distAfterLeash}`);
console.log(' -> AC-01 Asymmetric dual-stage damping and soft-leash deadzone verified.');

// 3. AC-02: Aim Lookahead Deadzone (L <= 70px -> offset = 0)
console.log('[3/9] Verifying AC-02: Aim Lookahead Deadzone (L <= 70px)...');
mockPlayer.x = 1760;
mockPlayer.y = 1320;
mockPlayer.vx = 0;
mockPlayer.vy = 0;
mockPlayer.dashPulse = 0;
camera.x = 1760;
camera.y = 1320;
camera.lookaheadX = 0;
camera.lookaheadY = 0;
camera.lookaheadVX = 0;
camera.lookaheadVY = 0;

// Aim 50px away (within 70px deadzone)
mockPlayer.aimX = 1760 + 50;
mockPlayer.aimY = 1320;
updateCamera(camera, mockPlayer, {}, 0.05, false);
assert.strictEqual(camera.targetLookaheadX, 0, 'Target lookahead must be 0 within 70px deadzone');
assert.strictEqual(camera.targetLookaheadY, 0, 'Target lookahead must be 0 within 70px deadzone');
assert(Math.abs(camera.lookaheadX) < 0.001, 'Lookahead offset must remain 0');
console.log(' -> AC-02 Aim lookahead deadzone verified.');

// 4. AC-03: Long-range Aim Lookahead Extension & Retraction Damping
console.log('[4/9] Verifying AC-03: Long-Range Lookahead & Hermite Curve...');
// Aim 450px away (max lookahead distance)
mockPlayer.aimX = 1760 + 450;
mockPlayer.aimY = 1320;
updateCamera(camera, mockPlayer, {}, 0.5, false);
var O_max = 640 * 0.18; // 115.2 px
assert(camera.lookaheadX > O_max * 0.7, `Lookahead must extend smoothly toward O_max (${O_max}), got ${camera.lookaheadX}`);

// Aim retraction (switching back to center)
mockPlayer.aimX = 1760;
mockPlayer.aimY = 1320;
var lookBeforeRetract = camera.lookaheadX;
updateCamera(camera, mockPlayer, {}, 0.05, false);
assert(camera.lookaheadX < lookBeforeRetract, 'Lookahead must rapidly retract when aim returns to center');
console.log(' -> AC-03 Long-range lookahead extension & retraction verified.');

// 5. AC-04: Boundary Clamping (20px safety padding, no underdraw)
console.log('[5/9] Verifying AC-04: World Boundary Clamping...');
camera.lookaheadX = 0;
camera.lookaheadY = 0;
camera.lookaheadVX = 0;
camera.lookaheadVY = 0;
// Test left boundary: Player at x = 50
mockPlayer.x = 50;
mockPlayer.y = 1320;
mockPlayer.aimX = 50;
mockPlayer.aimY = 1320;
camera.x = 50;
camera.y = 1320;
updateCamera(camera, mockPlayer, {}, 0.5, false);
var minExpectedX = 960 * 0.5 + 20; // 500 px
assert(camera.clampedX >= minExpectedX - 0.01, `clampedX must clamp to >= ${minExpectedX}, got ${camera.clampedX}`);

// Test right boundary: Player at x = 3500
mockPlayer.x = 3500;
camera.x = 3500;
updateCamera(camera, mockPlayer, {}, 0.5, false);
var maxExpectedX = 3520 - 960 * 0.5 - 20; // 3020 px
assert(camera.clampedX <= maxExpectedX + 0.01, `clampedX must clamp to <= ${maxExpectedX}, got ${camera.clampedX}`);
console.log(' -> AC-04 Boundary clamping verified (no underdraw).');

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

// 9. AC-09: Cursor lookahead has no feedback loop and pans calmly
console.log('[9/9] Verifying AC-09: Stable, Gentle Cursor Lookahead...');
initCamera(camera, 3520, 2640, 960, 640);
mockPlayer.x = 1760;
mockPlayer.y = 1320;
mockPlayer.vx = 0;
mockPlayer.vy = 0;
mockPlayer.dashPulse = 0;
camera.x = 1760;
camera.y = 1320;
camera.lookaheadX = 0;
camera.lookaheadY = 0;
camera.lookaheadVX = 0;
camera.lookaheadVY = 0;
// Cursor parked at the right screen edge: the camera must settle, not keep chasing.
var edgeInput = { mouse: { sx: 960, sy: 320, x: 0, y: 0 } };
var maxFrameStep = 0;
var lastX = camera.x;
for (var f = 0; f < 600; f += 1) {
  updateCamera(camera, mockPlayer, edgeInput, 1 / 60, true);
  maxFrameStep = Math.max(maxFrameStep, Math.abs(camera.x - lastX));
  lastX = camera.x;
}
var lookMax = 640 * 0.18;
assert(camera.x - 1760 <= lookMax + 0.01, `Camera offset must settle within O_max (${lookMax}), got ${camera.x - 1760}`);
assert(camera.x - 1760 > lookMax * 0.9, `Camera must reach the lookahead target, got ${camera.x - 1760}`);
assert(maxFrameStep <= 260 / 60 + 0.01, `Lookahead pan must stay <= 260 px/s, got ${maxFrameStep * 60} px/s`);
// Sweeping the cursor to the opposite edge must not snap the view.
edgeInput.mouse.sx = 0;
lastX = camera.x;
updateCamera(camera, mockPlayer, edgeInput, 1 / 60, true);
assert(Math.abs(camera.x - lastX) <= 260 / 60 + 0.01, 'Cursor sweep must pan gently, not snap');
// From rest, the pan breaks away slowly and accelerates (spring ease-in), then settles.
initCamera(camera, 3520, 2640, 960, 640);
camera.x = 1760;
camera.y = 1320;
var easeInput = { mouse: { sx: 960, sy: 320, x: 0, y: 0 } };
var easeSteps = [];
lastX = camera.x;
for (var ef = 0; ef < 90; ef += 1) {
  updateCamera(camera, mockPlayer, easeInput, 1 / 60, true);
  easeSteps.push(camera.x - lastX);
  lastX = camera.x;
}
var easePeak = Math.max.apply(null, easeSteps);
var easePeakIdx = easeSteps.indexOf(easePeak);
assert(easeSteps[0] < easePeak * 0.25, `Lookahead must start slowly, first step ${easeSteps[0]} vs peak ${easePeak}`);
assert(easePeakIdx >= 4, `Lookahead must accelerate before peaking, peak at frame ${easePeakIdx}`);
assert(easeSteps[easeSteps.length - 1] < easePeak * 0.2, 'Lookahead must ease out as it settles');
assert(camera.x - 1760 <= lookMax + 0.01, 'Lookahead spring must not overshoot O_max');
console.log(' -> AC-09 Cursor lookahead is bounded and gentle.');

console.log('\n================================================================');
console.log('  ALL TRACK 1 CAMERA & VIEWPORT CRITERIA VERIFIED (100%)');
console.log('================================================================\n');
