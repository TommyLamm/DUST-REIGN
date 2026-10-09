var HELP = [
  'DUST//REIGN 平衡模擬器',
  '',
  '在 Node 裡無頭載入遊戲，以 dt = 1/60 反覆呼叫 update(dt)，不渲染。',
  '每局種子可重現。有 src/core/rng.js 時呼叫 seedRun(seed)；v0.3.0 沒有 seedRun，',
  '只在這個行程裡把 Math.random 換成可種子化的替身（報表會註明）。',
  'coreSpawnTime 與模擬粒子／彈殼／焦痕走 rng()。未設種子時 rng 仍呼叫 Math.random。',
  '',
  '用法',
  '  node scripts/balance-sim.mjs --help',
  '  node scripts/balance-sim.mjs --runs 20 --seed 1 --bot skilled --out output/balance/skilled.json',
  '  node scripts/balance-sim.mjs --runs 20 --seed 1 --bot idle,kite,skilled --waves 15 --seconds 600 --heat 0 --out output/balance/p0-current.json',
  '  node scripts/balance-sim.mjs --src $env:TEMP\\dust-reign-v030 --runs 20 --seed 1 --bot idle,kite,skilled --commit ed2fcf6 --label v0.3.0 --out output/balance/baseline-v0.3.0.json',
  '  node scripts/balance-sim.mjs --compare output/balance/baseline-v0.3.0.json output/balance/p0-current.json --out output/balance/compare-p0-vs-v030.json',
  '',
  '參數',
  '  --runs N        每個機器人的局數（預設 1）',
  '  --seed S        種子起點。第 i 局（從 0 起）使用字串 "<S>#<i>"，各機器人共用，開局亂數對齊，之後因操作分叉',
  '  --waves W       活過 W 波就停（0 = 直到死亡）。預設 0',
  '  --seconds T     模擬時間上限，秒（0 = 不另設，內部安全閥 1200 秒）。升級面板暫停不計入',
  '  --bot NAME      idle、kite、skilled，或逗號分隔，或 all（預設 skilled）',
  '  --heat H        寫入 state.heat（預設 0），並在 beginRun 之後重跑 onWaveStart',
  '  --start-wave N  從第 N 波開局（N>1）。清掉開場小兵，套上該波配方，',
  '                  依「1 + round((N-1)*0.8)」注入等級並用機器人選卡。',
  '                  第 6 波起若沒給 --route，套用 ironfield',
  '  --route ID      開局路線（scorched, ironfield, static, blackout, convoy, stormwall）',
  '  --rig ID        開局機體（scrapper, strider, bulwark, salvager）',
  '  --weapon ID     主武器（standard, breacher, vanguard, arc-welder）',
  '  --out PATH      JSON 路徑。同名 .md 為短摘要。預設 output/balance/<label>.json',
  '  --src DIR       遊戲根目錄（其下要有 src/main.js），或直接指向 src 目錄。預設為本 repository',
  '  --label NAME    報表標題',
  '  --commit SHA    記在報表裡的來源 commit，不影響載入',
  '  --compare A B   讀兩份 JSON，寫 P0 對 v0.3.0 的差異',
  '',
  '機器人',
  '  idle     只躲避（含 60px 內衝刺），不射擊、不放 EMP。生存下限',
  '  kite     以約 160–250px 間隙繞圈風箏，自動瞄準最近敵人並連射。不衝刺、不放 EMP',
  '  skilled  風箏、60px 接觸衝刺、EMP，再加上：預判 0.22 秒內會命中的敵彈並側移、',
  '           0.16 秒內才衝刺；離開砲擊／隕石／酸池／雷槍／衝撞線與風暴之眼；',
  '           遠離上膛的 Scurrier 與 Burrower 破土圈；首領戰保持 280–420px；',
  '           血量低於 72% 時去撿維修；血量低於 50% 時防禦卡優先於攻擊卡',
  '  三種機器人選卡順序相同：融合 > 攻擊（含 WEAPON）> 防禦 > 其他，讓升級面板不會把對局卡住',
  '  幕間若出現，會呼叫遊戲既有的 chooseRoute / chooseRepair（或同義函式），選第一個路線索引。沒有函式時清掉 state.interlude，不加血',
  '',
  '輸出',
  '  每局：存活波次、死亡原因、各波秒數、分數與 scoreBreakdown、評級、等級與 XP 曲線、',
  '  敵型生成數與擊殺數、首領擊殺秒數、牆鐘耗時。',
  '  彙總：平均與 p10/p50/p90，並對照 docs/gameplay-overhaul/10-balance-sheet.md 的首領時間與 B/A/S 分數百分位。',
  '',
  '限制',
  '  不修改 src。不渲染。v0.3.0 的致死來源是由 fx 事件推測，不是傷害入口的 source 欄位。',
  '  --heat 在導演接上 getHeatModifiers 之前不會改變戰鬥。'
].join('\n');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomStub } from './balance/dom-stub.mjs';
import { loadGameWithRetry } from './balance/load-game.mjs';
import { DT, SAFETY_SECONDS, runOne } from './balance/simulate.mjs';
import { SKILLED_NOTES } from './balance/bots.mjs';
import { buildReport, compareReports, renderCompareMarkdown, renderMarkdown } from './balance/report.mjs';

var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var BOTS = ['idle', 'kite', 'skilled'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function take(argv, i, flag) {
  if (i + 1 >= argv.length) fail('缺少 ' + flag + ' 的值');
  return argv[i + 1];
}

function parseArgs(argv) {
  var out = {
    help: false,
    runs: 1,
    seed: '1',
    waves: 0,
    seconds: 0,
    bot: 'skilled',
    heat: 0,
    startWave: 1,
    route: '',
    rig: '',
    weapon: '',
    out: '',
    src: '',
    label: '',
    commit: '',
    compare: null
  };
  for (var i = 0; i < argv.length; i += 1) {
    var arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--runs') out.runs = Number(take(argv, i, arg)), i += 1;
    else if (arg === '--seed') out.seed = String(take(argv, i, arg)), i += 1;
    else if (arg === '--waves') out.waves = Number(take(argv, i, arg)), i += 1;
    else if (arg === '--seconds') out.seconds = Number(take(argv, i, arg)), i += 1;
    else if (arg === '--bot') out.bot = String(take(argv, i, arg)), i += 1;
    else if (arg === '--heat') out.heat = Number(take(argv, i, arg)), i += 1;
    else if (arg === '--start-wave') out.startWave = Number(take(argv, i, arg)), i += 1;
    else if (arg === '--route') out.route = String(take(argv, i, arg)), i += 1;
    else if (arg === '--rig') out.rig = String(take(argv, i, arg)), i += 1;
    else if (arg === '--weapon') out.weapon = String(take(argv, i, arg)), i += 1;
    else if (arg === '--out') out.out = take(argv, i, arg), i += 1;
    else if (arg === '--src') out.src = take(argv, i, arg), i += 1;
    else if (arg === '--label') out.label = take(argv, i, arg), i += 1;
    else if (arg === '--commit') out.commit = take(argv, i, arg), i += 1;
    else if (arg === '--compare') {
      out.compare = [take(argv, i, arg), take(argv, i + 1, arg)];
      i += 2;
    } else fail('未知參數：' + arg + '\n\n' + HELP);
  }
  return out;
}

function botsFrom(text) {
  if (!text || text === 'all') return BOTS.slice();
  var parts = String(text).split(',');
  var out = [];
  for (var i = 0; i < parts.length; i += 1) {
    var name = parts[i].trim();
    if (!name) continue;
    if (BOTS.indexOf(name) < 0) fail('未知機器人：' + name + '（可用 idle, kite, skilled, all）');
    out.push(name);
  }
  if (!out.length) fail('至少要一個機器人');
  return out;
}

function resolveSrc(dir) {
  if (!dir) return ROOT;
  var abs = path.resolve(dir);
  if (fs.existsSync(path.join(abs, 'src', 'main.js'))) return abs;
  if (path.basename(abs).toLowerCase() === 'src' && fs.existsSync(path.join(abs, 'main.js'))) return path.dirname(abs);
  fail('找不到 src/main.js：' + abs);
  return abs;
}

function readJson(file) {
  var abs = path.resolve(file);
  if (!fs.existsSync(abs)) fail('找不到報表：' + abs);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function writePair(jsonPath, data, markdown) {
  var abs = path.resolve(jsonPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data, null, 2));
  var md = abs.replace(/\.json$/i, '') + '.md';
  if (md === abs) md = abs + '.md';
  fs.writeFileSync(md, markdown);
  return { json: abs, md: md };
}

function rngMeta(game) {
  if (game.seedRun) {
    return {
      mode: 'seedRun+math-random-shim',
      note: 'seedRun(seed) 驅動 rng() 分流，含 coreSpawnTime 與模擬粒子。Math.random 替身只覆蓋仍直接呼叫 Math.random 的繪製亂數。'
    };
  }
  return {
    mode: 'math-random-shim',
    note: '此原始碼沒有 src/core/rng.js 與 seedRun。模擬器只在本行程內把 Math.random 換成 mulberry32；與 P0 的 seedRun 分流不是同一條亂數流。'
  };
}

async function runSuite(args) {
  var src = resolveSrc(args.src);
  var bots = botsFrom(args.bot);
  if (!(args.runs >= 1) || args.runs !== (args.runs | 0)) fail('--runs 必須是正整數');
  if (args.waves < 0 || args.waves !== args.waves) fail('--waves 必須是 >= 0 的數字');
  if (args.seconds < 0 || args.seconds !== args.seconds) fail('--seconds 必須是 >= 0 的數字');
  if (args.heat !== args.heat) fail('--heat 必須是數字');
  if (!(args.startWave >= 1) || args.startWave !== (args.startWave | 0)) fail('--start-wave 必須是 >= 1 的整數');
  installDomStub();
  console.error('載入 ' + src);
  var game = await loadGameWithRetry(src, 12);
  var label = args.label || (game.seedRun ? 'p0-current' : 'v0.3.0');
  var outPath = args.out || path.join(ROOT, 'output', 'balance', label + '.json');
  var runs = [];
  var failures = 0;
  for (var b = 0; b < bots.length; b += 1) {
    for (var i = 0; i < args.runs; i += 1) {
      var seed = String(args.seed) + '#' + String(i);
      var record;
      try {
        record = runOne(game, {
          seed: seed,
          bot: bots[b],
          heat: args.heat,
          waves: args.waves,
          seconds: args.seconds,
          startWave: args.startWave,
          route: args.route,
          rig: args.rig,
          weapon: args.weapon
        });
      } catch (error) {
        record = {
          seed: seed,
          bot: bots[b],
          heat: args.heat,
          outcome: 'error',
          error: error && error.stack ? error.stack : String(error),
          deathWave: 0,
          wavesCleared: 0,
          censored: true,
          deathCause: 'error',
          damageBySource: {},
          waveTimes: [],
          score: 0,
          scoreBreakdown: {},
          rank: { letter: '', title: '' },
          level: 1,
          xp: 0,
          xpNext: 0,
          xpCurve: [],
          spawns: {},
          kills: {},
          bossKills: [],
          upgrades: [],
          simSeconds: 0,
          frames: 0,
          wallMs: 0,
          notes: []
        };
      }
      runs.push(record);
      if (record.outcome === 'error' || record.error) {
        failures += 1;
        console.error(bots[b] + ' ' + (i + 1) + '/' + args.runs + ' ERROR ' + String(record.error).split('\n')[0]);
        if (failures >= 3) fail('連續失敗，停止。最後錯誤：\n' + record.error);
      } else {
        failures = 0;
        console.error(bots[b] + ' ' + (i + 1) + '/' + args.runs + ' wave ' + record.deathWave + ' score ' + record.score + ' ' + record.deathCause + ' ' + record.wallMs + 'ms');
      }
    }
  }
  var report = buildReport({
    label: label,
    generatedAt: new Date().toISOString(),
    src: src,
    commit: args.commit || null,
    rng: rngMeta(game),
    seed: String(args.seed),
    seedPattern: '<seed>#<index>，各機器人共用同一個 index',
    runsPerBot: args.runs,
    bots: bots,
    waves: args.waves || null,
    seconds: args.seconds || null,
    safetySeconds: SAFETY_SECONDS,
    heat: args.heat,
    startWave: args.startWave,
    route: args.route || null,
    rig: args.rig || null,
    weapon: args.weapon || null,
    botNotes: SKILLED_NOTES,
    dt: DT,
    arena: { width: 960, height: 640 },
    node: process.version
  }, runs);
  var written = writePair(outPath, report, renderMarkdown(report));
  console.log(written.json);
  console.log(written.md);
}

function runCompare(args) {
  var baseline = readJson(args.compare[0]);
  var current = readJson(args.compare[1]);
  var compared = compareReports(baseline, current);
  var outPath = args.out || path.join(ROOT, 'output', 'balance', 'compare-p0-vs-v030.json');
  var written = writePair(outPath, compared, renderCompareMarkdown(compared));
  console.log(written.json);
  console.log(written.md);
}

async function main() {
  var args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.slice(2).length === 0) {
    console.log(HELP);
    return;
  }
  if (args.compare) {
    runCompare(args);
    return;
  }
  await runSuite(args);
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
