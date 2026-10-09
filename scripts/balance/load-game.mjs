import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function importIfPresent(file) {
  if (!fs.existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}

export async function loadGame(root) {
  var src = path.join(root, 'src');
  var mainFile = path.join(src, 'main.js');
  if (!fs.existsSync(mainFile)) {
    throw new Error('找不到遊戲入口：' + mainFile);
  }
  function file(rel) {
    return path.join(src, rel);
  }
  var rtMod = await import(pathToFileURL(file('core/runtime.js')).href);
  var stateMod = await import(pathToFileURL(file('core/state.js')).href);
  var updateMod = await import(pathToFileURL(file('systems/update.js')).href);
  var flowMod = await import(pathToFileURL(file('systems/flow.js')).href);
  var progMod = await import(pathToFileURL(file('systems/progression.js')).href);
  var abiMod = await import(pathToFileURL(file('systems/abilities.js')).href);
  var spawnMod = await import(pathToFileURL(file('systems/spawning.js')).href);
  var fxMod = await import(pathToFileURL(file('core/fx-events.js')).href);
  var configMod = await import(pathToFileURL(file('config.js')).href);
  var rngMod = await importIfPresent(file('core/rng.js'));
  var metaMod = await importIfPresent(file('systems/meta.js'));
  var directorMod = await importIfPresent(file('systems/director.js'));
  var heatMod = await importIfPresent(file('data/heat.js'));
  var interludeMod = await importIfPresent(file('systems/interlude.js'));
  var scoringMod = await importIfPresent(file('systems/scoring.js'));
  var rigMod = await importIfPresent(file('data/rigs.js'));
  var weaponMod = await importIfPresent(file('systems/weapons.js'));
  return {
    root: root,
    src: src,
    rt: rtMod.rt,
    makeState: stateMod.makeState,
    update: updateMod.update,
    beginRun: flowMod.beginRun,
    calculateCombatRank: flowMod.calculateCombatRank || (scoringMod && scoringMod.calculateCombatRank) || null,
    chooseUpgrade: progMod.chooseUpgrade,
    dash: abiMod.dash,
    triggerEmp: abiMod.triggerEmp,
    spawnEnemy: spawnMod.spawnEnemy,
    spawnBarrels: spawnMod.spawnBarrels,
    spawnSpires: spawnMod.spawnSpires,
    drainFxEvents: fxMod.drainFxEvents,
    waveLength: configMod.WAVE_LENGTH || 30,
    seedRun: rngMod && rngMod.seedRun ? rngMod.seedRun : null,
    clearSeed: rngMod && rngMod.clearSeed ? rngMod.clearSeed : null,
    applyLoadout: metaMod && metaMod.applyLoadout ? metaMod.applyLoadout : null,
    directorStartRun: directorMod && (directorMod.directorStartRun || directorMod.startRun) || null,
    onWaveStart: directorMod && directorMod.onWaveStart ? directorMod.onWaveStart : null,
    getHeatModifiers: heatMod && heatMod.getHeatModifiers ? heatMod.getHeatModifiers : null,
    interlude: interludeMod,
    addXp: progMod.addXp || null,
    applyRig: rigMod && rigMod.applyRig ? rigMod.applyRig : null,
    cycleWeaponMode: weaponMod && weaponMod.cycleWeaponMode ? weaponMod.cycleWeaponMode : null
  };
}

export async function loadGameWithRetry(root, attempts) {
  var tries = attempts || 4;
  var last = null;
  for (var i = 0; i < tries; i += 1) {
    try {
      return await loadGame(root);
    } catch (error) {
      last = error;
      if (i + 1 < tries) await delay(600 * (i + 1));
    }
  }
  throw last;
}
