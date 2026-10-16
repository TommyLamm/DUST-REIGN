import assert from 'node:assert';
import {
  readMeta,
  writeMeta,
  readScrap,
  addScrap,
  spendScrap,
  getWorkshopState,
  getWorkshopLoadout,
  setWorkshopLoadout,
  equipModule,
  unequipModule,
  upgradeModule,
  getEquippedWattage,
  checkStarVaultMilestones,
  getCosmetics,
  setCosmetic,
  readDailyBounties,
  claimDailyBounty,
  claimGrandSlam,
  readGhost,
  writeGhost,
  writeModdedBestScore,
  readModdedBestScore,
  readBestScoreV2,
  writeBestScoreV2,
  MOD_SCORE_V2_KEY,
  GHOSTS_KEY,
  VAULT_MILESTONES
} from '../src/core/meta-store.js';
import { MODULES, getModule, getModuleCost, MAX_WATTAGE } from '../src/data/modules.js';
import { getBountiesForDate, GRAND_SLAM_BONUS } from '../src/data/bounties.js';
import { GhostRecorder, GhostPlaybackEngine, encodeGhostFrames, decodeGhostFrames } from '../src/systems/ghost.js';
import { applyLoadout, onRunEnd } from '../src/systems/meta.js';

console.log('=== [TRACK 3 TEST SUITE] ===');

// Mock localStorage for headless Node execution
var storage = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function (k, v) { storage[k] = String(v); },
  removeItem: function (k) { delete storage[k]; },
  clear: function () { storage = {}; }
};

// ---------------------------------------------------------------------------
// 1. Scrapyard Workshop (6⚡ Wattage & Sockets)
// ---------------------------------------------------------------------------
console.log('\n[1/4] Testing Scrapyard Workshop & 6⚡ Capacity...');

// Reset meta
localStorage.clear();
var initialScrap = readScrap();
assert.strictEqual(initialScrap, 0, 'Initial refined scrap should be 0');

addScrap(300);
assert.strictEqual(readScrap(), 300, 'Refined scrap should be 300 after adding');

var spent = spendScrap(100);
assert.strictEqual(spent, true, 'spendScrap(100) should succeed');
assert.strictEqual(readScrap(), 200, 'Refined scrap should be 200');

var spentFail = spendScrap(500);
assert.strictEqual(spentFail, false, 'spendScrap(500) should fail when insufficient');
assert.strictEqual(readScrap(), 200, 'Refined scrap should remain 200');

// Test Wattage and Sockets
// m_phase_bearing = 1⚡, b_reactive_plasma = 2⚡, c_surge_unit = 3⚡ -> Total = 6⚡
var eq1 = equipModule('m_phase_bearing'); // 1⚡
assert.strictEqual(eq1.ok, true, 'Equip m_phase_bearing should succeed');
assert.strictEqual(getEquippedWattage(), 1, 'Wattage should be 1');

var eq2 = equipModule('b_reactive_plasma'); // 2⚡
assert.strictEqual(eq2.ok, true, 'Equip b_reactive_plasma should succeed');
assert.strictEqual(getEquippedWattage(), 3, 'Wattage should be 3');

var eq3 = equipModule('c_surge_unit'); // 3⚡
assert.strictEqual(eq3.ok, true, 'Equip c_surge_unit should succeed');
assert.strictEqual(getEquippedWattage(), 6, 'Wattage should be 6');

// Trying to equip a 2⚡ module when wattage is 6 should fail
var eqOver = equipModule('m_vector_thruster'); // 2⚡ replaces m_phase_bearing (1⚡), new total = 7⚡ -> OVERLOAD
assert.strictEqual(eqOver.ok, false, 'Equipping over 6⚡ should be rejected');
assert.strictEqual(eqOver.reason, 'WATTAGE_LIMIT_EXCEEDED');
assert.strictEqual(getEquippedWattage(), 6, 'Wattage should remain 6');

// Detach module
var uneq = unequipModule('tactical');
assert.strictEqual(uneq.ok, true, 'Unequip tactical should succeed');
assert.strictEqual(getEquippedWattage(), 3, 'Wattage should drop to 3');

// Upgrade module
// Upgrade m_phase_bearing from T1 -> T2 (cost: 180)
var up1 = upgradeModule('m_phase_bearing');
assert.strictEqual(up1.ok, true, 'Upgrade m_phase_bearing should succeed');
assert.strictEqual(up1.newTier, 2, 'New tier should be 2');
assert.strictEqual(readScrap(), 20, 'Refined scrap should be 20 (200 - 180)');

// Upgrading without enough scrap should fail
var upFail = upgradeModule('m_phase_bearing');
assert.strictEqual(upFail.ok, false, 'Upgrade should fail when insufficient scrap');
assert.strictEqual(upFail.reason, 'INSUFFICIENT_SCRAP');

console.log(' -> Workshop capacity and socket management verified.');

// ---------------------------------------------------------------------------
// 2. Mode Guardrails & Leaderboard Isolation
// ---------------------------------------------------------------------------
console.log('\n[2/4] Testing Mode Guardrails & Modded Leaderboard Isolation...');

// Setup test state with equipped modules
var testStateStandard = {
  mode: 'standard',
  player: { r: 16, speed: 200, damage: 20, maxHp: 100, hp: 100 }
};
applyLoadout(testStateStandard);
assert.strictEqual(testStateStandard.isModded, true, 'Standard mode with equipped modules must tag isModded=true');

var testStateHardcore = {
  mode: 'hardcore',
  player: { r: 16, speed: 200, damage: 20, maxHp: 100, hp: 100 }
};
applyLoadout(testStateHardcore);
assert.strictEqual(testStateHardcore.isModded, false, 'Hardcore mode must never tag isModded');
assert.strictEqual(testStateHardcore.player.reactiveMicroEmp, undefined, 'Hardcore mode must strictly ignore workshop modules');

// Leaderboard isolation check:
writeBestScoreV2(50000);
assert.strictEqual(readBestScoreV2(), 50000, 'Vanilla best score is 50000');

writeModdedBestScore(75000);
assert.strictEqual(readModdedBestScore(), 75000, 'Modded score should record 75000');
assert.strictEqual(readBestScoreV2(), 50000, 'Vanilla dust-reign:best-score:v2 must remain untouched at 50000');

// Scrap economy conversion on run end:
// 195 single-run scrap collected -> floor(195 / 60) = 3 refined scrap
var runState = {
  totalScrapCollected: 195,
  isModded: false,
  score: 1000
};
var beforeScrap = readScrap();
onRunEnd(runState);
assert.strictEqual(readScrap(), beforeScrap + 3, 'floor(195 / 60) should award exactly 3 refined scrap');

console.log(' -> Guardrails and score separation verified.');

// ---------------------------------------------------------------------------
// 3. Star Vault & Daily Mercenary Contracts
// ---------------------------------------------------------------------------
console.log('\n[3/4] Testing Star Vault Milestones & Daily Bounties...');

// 15★, 30★, 45★ milestones
var unlockedCosmetics1 = checkStarVaultMilestones(15);
assert(unlockedCosmetics1.indexOf('paint_neon_dusk') !== -1, '15★ must unlock paint_neon_dusk');

var unlockedCosmetics2 = checkStarVaultMilestones(30);
assert(unlockedCosmetics2.indexOf('trail_plasma_dual') !== -1, '30★ must unlock trail_plasma_dual');

var unlockedCosmetics3 = checkStarVaultMilestones(45);
assert(unlockedCosmetics3.indexOf('paint_apex_gold') !== -1, '45★ must unlock paint_apex_gold');

var cosmetics = getCosmetics();
assert.strictEqual(cosmetics.unlockedSkins.indexOf('paint_neon_dusk') !== -1, true, 'paint_neon_dusk should be in unlockedSkins');
assert.strictEqual(cosmetics.unlockedTrails.indexOf('trail_plasma_dual') !== -1, true, 'trail_plasma_dual should be in unlockedTrails');

// Daily Bounties deterministic generation
var dateStr = '2026-10-16';
var bountiesDay1 = getBountiesForDate(dateStr);
var bountiesDay1Again = getBountiesForDate(dateStr);
assert.strictEqual(bountiesDay1.length, 3, 'Must generate exactly 3 daily bounties');
assert.strictEqual(bountiesDay1[0].id, bountiesDay1Again[0].id, 'Bounties must be deterministic for date');
assert.strictEqual(bountiesDay1[1].id, bountiesDay1Again[1].id, 'Bounties must be deterministic for date');
assert.strictEqual(bountiesDay1[2].id, bountiesDay1Again[2].id, 'Bounties must be deterministic for date');

// Claiming bounty
var dailyStore = readDailyBounties(dateStr);
var targetBounty = dailyStore.bounties[0];
targetBounty.progress = targetBounty.goal; // Fulfill requirement

var claimRes = claimDailyBounty(targetBounty.id);
assert.strictEqual(claimRes.ok, true, 'Claiming completed bounty should succeed');
assert.strictEqual(claimRes.reward, targetBounty.reward, 'Bounty reward should match');

// Grand Slam check: should fail when only 1 is claimed
var slamFail = claimGrandSlam();
assert.strictEqual(slamFail.ok, false, 'Grand Slam should fail when not all 3 are claimed');

// Complete remaining 2
dailyStore = readDailyBounties(dateStr);
dailyStore.bounties[1].progress = dailyStore.bounties[1].goal;
dailyStore.bounties[2].progress = dailyStore.bounties[2].goal;
claimDailyBounty(dailyStore.bounties[1].id);
claimDailyBounty(dailyStore.bounties[2].id);

var slamSuccess = claimGrandSlam();
assert.strictEqual(slamSuccess.ok, true, 'Grand Slam should succeed when all 3 are claimed');
assert.strictEqual(slamSuccess.reward, GRAND_SLAM_BONUS, 'Grand slam should grant 250 scrap');

console.log(' -> Star Vault and Daily Bounties mechanics verified.');

// ---------------------------------------------------------------------------
// 4. 5Hz Ghost Replay & Storage (< 3KB)
// ---------------------------------------------------------------------------
console.log('\n[4/4] Testing 5Hz Ghost Replay, Delta-Base64 (<3KB) & Split-Timer...');

var recorder = new GhostRecorder('campaign', 'stage_1_1');
var runDuration = 120.0; // 2 minute run
var simDt = 0.016; // 60 FPS
var simTime = 0;

var px = 640;
var py = 360;
var pAim = 0;

while (simTime < runDuration) {
  // Simulate mecha moving in circle and firing
  simTime += simDt;
  px += Math.cos(simTime) * 3;
  py += Math.sin(simTime) * 3;
  pAim = simTime % 6.28;
  var isDashing = (simTime % 4 < 0.2);
  var isFiring = (simTime % 0.2 < 0.05);

  recorder.step(simDt, px, py, pAim, isDashing, isFiring);
}

var ghostPayload = recorder.finalize(true, 120000, 120.0);
assert(ghostPayload, 'Ghost payload should be created on victory');
assert(ghostPayload.compressed, 'Ghost payload should have compressed string');

// Verify size budget (< 3KB)
var byteSize = Buffer.byteLength(ghostPayload.compressed, 'utf8');
console.log('    120s Run Ghost Compressed Size: ' + byteSize + ' bytes (' + (byteSize / 1024).toFixed(2) + ' KB)');
assert(byteSize < 3072, 'Compressed ghost data must be strictly under 3KB (got ' + byteSize + ' bytes)');

// Verify Encoding & Decoding
var decodedKeyframes = decodeGhostFrames(ghostPayload.compressed);
assert.strictEqual(decodedKeyframes.length, ghostPayload.frameCount, 'Decoded frame count must match');

// Verify Playback Engine & Interpolation
var engine = new GhostPlaybackEngine(ghostPayload.compressed);
assert.strictEqual(engine.hasGhost, true, 'Playback engine should initialize ghost');

// Sample at t = 10.05s
var ghostSample = engine.getGhostAtTime(10.05);
assert(ghostSample, 'Ghost sample should exist at t=10.05s');
assert(typeof ghostSample.x === 'number' && typeof ghostSample.y === 'number', 'Position should be interpolated numbers');

// Verify Split-Timer differential
// Player is at t = 20.0s, distance milestone compares against ghost time
var splitBehind = engine.getSplitDiff(20.82, 20.0);
assert.strictEqual(splitBehind.status, 'BEHIND', 'Split timer should register BEHIND');
assert(splitBehind.diff > 0.8 && splitBehind.diff < 0.85, 'Split diff should be ~ +0.82s');

var splitAhead = engine.getSplitDiff(19.65, 20.0);
assert.strictEqual(splitAhead.status, 'AHEAD', 'Split timer should register AHEAD');
assert(splitAhead.diff > 0.33 && splitAhead.diff < 0.37, 'Split diff should be ~ -0.35s');

console.log(' -> 5Hz Ghost Replay, Delta-Base64 (<3KB) & Split-Timer verified.');

console.log('\n=============================================');
console.log('  ALL TRACK 3 METAGAME VERIFICATIONS PASSED!  ');
console.log('=============================================\n');
