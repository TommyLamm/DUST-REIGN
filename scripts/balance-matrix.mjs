var HELP = [
  'DUST//REIGN 平衡矩陣',
  '',
  '把 scripts/balance-sim.mjs 展開成「武器 x 機體 x 機器人 x Heat」的格子，每格一個子行程，多行程並行。',
  '每格輸出 <prefix>-<weapon>-<rig>-<bot>-h<heat>.json（+ .md），最後彙整成 <prefix>-matrix.json / .md。',
  '已存在的格子預設跳過（可續跑）；--force 重跑。',
  '',
  '用法',
  '  node scripts/balance-matrix.mjs --runs 20 --prefix output/balance/v0.13.4',
  '  node scripts/balance-matrix.mjs --weapons colossus,standard --rigs scrapper --bots skilled --heats 0 --runs 8 --time-one',
  '  node scripts/balance-matrix.mjs --prefix output/balance/v0.13.4 --aggregate-only',
  '  node scripts/balance-matrix.mjs --compare output/balance/v0.13.4-matrix.json output/balance/v0.14.0-matrix.json --out output/balance/compare-matrix.md',
  '',
  '參數',
  '  --weapons L     逗號清單（預設 standard,breacher,vanguard,arc-welder,colossus）',
  '  --rigs L        預設 scrapper,strider,bulwark,salvager',
  '  --bots L        預設 skilled,kite',
  '  --heats L       預設 0,2',
  '  --runs N        每格局數（預設 20）',
  '  --seed S        種子起點（預設 1）。各格共用同一組 <S>#<i>',
  '  --waves W       波次上限（預設 20 = 第 15 波後再撐 5 個無盡波）',
  '  --prefix P      輸出前綴（預設 output/balance/matrix）',
  '  --label NAME    彙整報表標題（預設取 prefix 結尾）',
  '  --concurrency N 同時子行程數（預設 CPU 核心數 - 2，至少 1）',
  '  --skip-kite-heat N  heat >= N 時不跑 kite（例：--skip-kite-heat 2）',
  '  --time-one      只跑第一格並印出牆鐘，用來估總時間',
  '  --aggregate-only  不跑模擬，只重新彙整已有的格子',
  '  --force         已存在的格子也重跑',
  '  --src DIR       遊戲根目錄（傳給 balance-sim）',
  '  --commit SHA    記在每格報表裡的來源 commit',
  '  --pass "ARGS"   原樣附加給每個 balance-sim 子行程（例：--pass "--tactical aegis-barrier --cards resonance --world"）',
  '  --compare A B   讀兩份 matrix.json，輸出每格差異（survival / 首領 p50 / 分數 p50 p90 / 評級）',
  '  --out PATH      --compare 的輸出（.md；同名 .json 一併寫出）'
].join('\n');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var SIM = path.join(ROOT, 'scripts', 'balance-sim.mjs');
var BOSSES = ['titan', 'dreadnought', 'sovereign'];
var TARGETS = { titan: [40, 70], dreadnought: [60, 90], sovereign: [80, 120] };

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  var out = {
    help: false,
    weapons: 'standard,breacher,vanguard,arc-welder,colossus',
    rigs: 'scrapper,strider,bulwark,salvager',
    bots: 'skilled,kite',
    heats: '0,2',
    runs: 20,
    seed: '1',
    waves: 20,
    prefix: path.join('output', 'balance', 'matrix'),
    label: '',
    concurrency: Math.max(1, Math.min(10, os.cpus().length - 2)),
    skipKiteHeat: 99,
    timeOne: false,
    aggregateOnly: false,
    force: false,
    src: '',
    commit: '',
    pass: '',
    compare: null,
    out: ''
  };
  function need(i, flag) {
    if (i + 1 >= argv.length) fail('缺少 ' + flag + ' 的值');
    return argv[i + 1];
  }
  for (var i = 0; i < argv.length; i += 1) {
    var a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--weapons') out.weapons = need(i, a), i += 1;
    else if (a === '--rigs') out.rigs = need(i, a), i += 1;
    else if (a === '--bots') out.bots = need(i, a), i += 1;
    else if (a === '--heats') out.heats = need(i, a), i += 1;
    else if (a === '--runs') out.runs = Number(need(i, a)), i += 1;
    else if (a === '--seed') out.seed = String(need(i, a)), i += 1;
    else if (a === '--waves') out.waves = Number(need(i, a)), i += 1;
    else if (a === '--prefix') out.prefix = need(i, a), i += 1;
    else if (a === '--label') out.label = need(i, a), i += 1;
    else if (a === '--concurrency') out.concurrency = Math.max(1, Number(need(i, a)) | 0), i += 1;
    else if (a === '--skip-kite-heat') out.skipKiteHeat = Number(need(i, a)), i += 1;
    else if (a === '--time-one') out.timeOne = true;
    else if (a === '--aggregate-only') out.aggregateOnly = true;
    else if (a === '--force') out.force = true;
    else if (a === '--src') out.src = need(i, a), i += 1;
    else if (a === '--commit') out.commit = need(i, a), i += 1;
    else if (a === '--pass') out.pass = need(i, a), i += 1;
    else if (a === '--out') out.out = need(i, a), i += 1;
    else if (a === '--compare') {
      out.compare = [need(i, a), need(i + 1, a)];
      i += 2;
    } else fail('未知參數：' + a + '\n\n' + HELP);
  }
  return out;
}

function list(text) {
  return String(text).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

function cellKey(c) {
  return c.weapon + '/' + c.rig + '/' + c.bot + '/h' + c.heat;
}

function cellPath(args, c) {
  return args.prefix + '-' + c.weapon + '-' + c.rig + '-' + c.bot + '-h' + c.heat + '.json';
}

function buildCells(args) {
  var cells = [];
  var w;
  var r;
  var b;
  var h;
  var weapons = list(args.weapons);
  var rigs = list(args.rigs);
  var bots = list(args.bots);
  var heats = list(args.heats).map(Number);
  for (w = 0; w < weapons.length; w += 1) {
    for (r = 0; r < rigs.length; r += 1) {
      for (h = 0; h < heats.length; h += 1) {
        for (b = 0; b < bots.length; b += 1) {
          if (bots[b] === 'kite' && heats[h] >= args.skipKiteHeat) continue;
          cells.push({ weapon: weapons[w], rig: rigs[r], bot: bots[b], heat: heats[h] });
        }
      }
    }
  }
  return cells;
}

function runCell(args, cell) {
  return new Promise(function (resolve) {
    var out = cellPath(args, cell);
    var argv = [
      SIM,
      '--runs', String(args.runs),
      '--seed', args.seed,
      '--bot', cell.bot,
      '--weapon', cell.weapon,
      '--rig', cell.rig,
      '--heat', String(cell.heat),
      '--waves', String(args.waves),
      '--label', path.basename(args.prefix) + ' ' + cellKey(cell),
      '--out', out
    ];
    if (args.src) argv.push('--src', args.src);
    if (args.commit) argv.push('--commit', args.commit);
    if (args.pass) Array.prototype.push.apply(argv, args.pass.split(/\s+/).filter(Boolean));
    var started = Date.now();
    var child = spawn(process.execPath, argv, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    var errors = 0;
    var lastErr = '';
    child.stderr.on('data', function (chunk) {
      var text = String(chunk);
      if (text.indexOf('ERROR') >= 0) errors += 1;
      lastErr = text.split('\n').filter(Boolean).pop() || lastErr;
    });
    child.on('close', function (code) {
      resolve({ cell: cell, code: code, seconds: (Date.now() - started) / 1000, errors: errors, lastErr: lastErr });
    });
  });
}

async function runAll(args, cells) {
  var pending = cells.slice();
  var results = [];
  var done = 0;
  var total = pending.length;
  var t0 = Date.now();
  async function worker() {
    while (pending.length) {
      var cell = pending.shift();
      var res = await runCell(args, cell);
      results.push(res);
      done += 1;
      var elapsed = (Date.now() - t0) / 1000;
      console.error('[' + done + '/' + total + '] ' + cellKey(cell) + ' ' + res.seconds.toFixed(1) + 's' + (res.code ? ' EXIT ' + res.code + ' ' + res.lastErr : '') + (res.errors ? ' (errors ' + res.errors + ')' : '') + '  elapsed ' + (elapsed / 60).toFixed(1) + ' min');
    }
  }
  var workers = [];
  for (var i = 0; i < Math.min(args.concurrency, total); i += 1) workers.push(worker());
  await Promise.all(workers);
  return { results: results, seconds: (Date.now() - t0) / 1000 };
}

function q(sorted, p) {
  if (!sorted.length) return null;
  var idx = (sorted.length - 1) * p;
  var lo = Math.floor(idx);
  var hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function r1(v) {
  return typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null;
}

function sortedNums(list) {
  return list.filter(function (x) { return typeof x === 'number' && isFinite(x); }).sort(function (a, b) { return a - b; });
}

function cellRow(cell, report) {
  var runs = report.runs || [];
  var bot = report.bots && report.bots[cell.bot];
  if (!bot) return null;
  var bossP50 = {};
  var bossN = {};
  BOSSES.forEach(function (kind) {
    var k = bot.bossKills && bot.bossKills.kills && bot.bossKills.kills[kind];
    bossP50[kind] = k ? k.p50 : null;
    bossN[kind] = k ? k.n : 0;
  });
  var errors = runs.filter(function (run) { return run.outcome === 'error'; }).length;
  return {
    weapon: cell.weapon,
    rig: cell.rig,
    bot: cell.bot,
    heat: cell.heat,
    n: runs.length,
    errors: errors,
    clearedWave15: bot.clearedWave15,
    deathWaveP50: bot.deathWave.p50,
    bossP50: bossP50,
    bossN: bossN,
    scoreP50: bot.score.p50,
    scoreP90: bot.score.p90,
    gateScoreP50: bot.gate && bot.gate.n ? bot.gate.score.p50 : null,
    gateRanks: bot.gate && bot.gate.n ? bot.gate.rankIfExtracted : {},
    ranks: bot.ranks,
    endlessWavesP50: bot.endless && bot.endless.n ? bot.endless.wavesReached.p50 : null,
    deathCauses: (bot.deathCauses || []).slice(0, 3).map(function (d) { return d.source + ' ' + d.count; }),
    secondsGateP50: bot.gate && bot.gate.n ? bot.gate.seconds.p50 : null,
    // raw per-run values for pooling
    _runs: runs.map(function (run) {
      var boss = {};
      (run.bossKills || []).forEach(function (b) {
        if (b.killed && b.duration != null) boss[b.kind] = b.duration;
      });
      return {
        score: run.score,
        gateScore: run.gate ? run.gate.score : null,
        cleared: Boolean(run.gate) || (run.deathWave || 0) > 15,
        deathWave: run.deathWave,
        rank: run.rank && run.rank.letter,
        boss: boss
      };
    })
  };
}

function pool(rows, keyFn) {
  var groups = {};
  rows.forEach(function (row) {
    var k = keyFn(row);
    if (!groups[k]) groups[k] = [];
    groups[k].push(row);
  });
  var out = {};
  Object.keys(groups).forEach(function (k) {
    var runs = [];
    groups[k].forEach(function (row) { Array.prototype.push.apply(runs, row._runs); });
    var scores = sortedNums(runs.map(function (x) { return x.score; }));
    var gates = sortedNums(runs.map(function (x) { return x.gateScore; }));
    var waves = sortedNums(runs.map(function (x) { return x.deathWave; }));
    var bosses = {};
    BOSSES.forEach(function (kind) {
      var xs = sortedNums(runs.map(function (x) { return x.boss[kind]; }));
      bosses[kind] = { p50: r1(q(xs, 0.5)), n: xs.length };
    });
    var ranks = {};
    runs.forEach(function (x) { ranks[x.rank || '?'] = (ranks[x.rank || '?'] || 0) + 1; });
    out[k] = {
      cells: groups[k].length,
      runs: runs.length,
      clearedWave15: r1(100 * runs.filter(function (x) { return x.cleared; }).length / (runs.length || 1)),
      deathWaveP50: r1(q(waves, 0.5)),
      scoreP50: r1(q(scores, 0.5)),
      scoreP90: r1(q(scores, 0.9)),
      gateScoreP50: r1(q(gates, 0.5)),
      boss: bosses,
      ranks: ranks
    };
  });
  return out;
}

function aggregate(args, cells) {
  var rows = [];
  var missing = [];
  cells.forEach(function (cell) {
    var file = path.resolve(ROOT, cellPath(args, cell));
    if (!fs.existsSync(file)) {
      missing.push(cellKey(cell));
      return;
    }
    var row = cellRow(cell, JSON.parse(fs.readFileSync(file, 'utf8')));
    if (row) rows.push(row);
  });
  var matrix = {
    schemaVersion: 1,
    label: args.label || path.basename(args.prefix),
    generatedAt: new Date().toISOString(),
    runsPerCell: args.runs,
    seed: args.seed,
    waves: args.waves,
    pass: args.pass || null,
    targets: TARGETS,
    missing: missing,
    cells: rows.map(function (row) {
      var copy = {};
      Object.keys(row).forEach(function (k) { if (k !== '_runs') copy[k] = row[k]; });
      return copy;
    }),
    pooled: {
      byWeapon: pool(rows, function (row) { return row.bot + ' h' + row.heat + ' / ' + row.weapon; }),
      byRig: pool(rows, function (row) { return row.bot + ' h' + row.heat + ' / ' + row.rig; }),
      byBotHeat: pool(rows, function (row) { return row.bot + ' h' + row.heat; })
    }
  };
  return matrix;
}

function f(v, suffix) {
  if (v == null) return '—';
  return String(v) + (suffix || '');
}

function ranksText(map) {
  var order = ['SSS', 'S+', 'S', 'A', 'B', 'C'];
  var parts = [];
  order.forEach(function (k) { if (map && map[k]) parts.push(k + map[k]); });
  return parts.join(' ') || '—';
}

function renderMatrix(m) {
  var lines = [];
  lines.push('# 平衡矩陣 ' + m.label);
  lines.push('');
  lines.push('- 每格 ' + m.runsPerCell + ' 局，種子起點 `' + m.seed + '`，波次上限 ' + m.waves + '（第 15 波後深入無盡），附加參數：' + (m.pass || '無'));
  lines.push('- 首領目標（秒）：Titan 40–70、Dreadnought 60–90、Sovereign 80–120。過 15 = 通過第 15 波首領、到達撤離關卡的比率。');
  if (m.missing.length) lines.push('- 缺格 ' + m.missing.length + '：' + m.missing.join('、'));
  lines.push('');
  ['byBotHeat', 'byWeapon', 'byRig'].forEach(function (key) {
    var title = key === 'byBotHeat' ? '機器人 x Heat 合併' : (key === 'byWeapon' ? '依武器合併' : '依機體合併');
    lines.push('## ' + title);
    lines.push('');
    lines.push('| 分組 | 局 | 過15% | 死亡波 p50 | Titan p50 (n) | Dread p50 (n) | Sov p50 (n) | 分數 p50 | 分數 p90 | 關卡分 p50 | 最終評級 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    Object.keys(m.pooled[key]).sort().forEach(function (k) {
      var g = m.pooled[key][k];
      lines.push('| ' + k + ' | ' + g.runs + ' | ' + f(g.clearedWave15) + ' | ' + f(g.deathWaveP50) + ' | ' +
        f(g.boss.titan.p50) + ' (' + g.boss.titan.n + ') | ' + f(g.boss.dreadnought.p50) + ' (' + g.boss.dreadnought.n + ') | ' +
        f(g.boss.sovereign.p50) + ' (' + g.boss.sovereign.n + ') | ' + f(g.scoreP50) + ' | ' + f(g.scoreP90) + ' | ' + f(g.gateScoreP50) + ' | ' + ranksText(g.ranks) + ' |');
    });
    lines.push('');
  });
  lines.push('## 全部格子');
  lines.push('');
  lines.push('| 武器 | 機體 | 機器人 | H | 局 | 過15 | 死亡波 p50 | Titan | Dread | Sov | 分數 p50 | 分數 p90 | 關卡分 p50 | 若撤離評級 | 最終評級 | 無盡波 p50 | 死因 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  m.cells.forEach(function (c) {
    lines.push('| ' + c.weapon + ' | ' + c.rig + ' | ' + c.bot + ' | ' + c.heat + ' | ' + c.n + (c.errors ? '(err ' + c.errors + ')' : '') + ' | ' +
      f(c.clearedWave15 == null ? null : Math.round(c.clearedWave15 * 100), '%') + ' | ' + f(c.deathWaveP50) + ' | ' +
      f(c.bossP50.titan) + ' | ' + f(c.bossP50.dreadnought) + ' | ' + f(c.bossP50.sovereign) + ' | ' +
      f(c.scoreP50) + ' | ' + f(c.scoreP90) + ' | ' + f(c.gateScoreP50) + ' | ' + ranksText(c.gateRanks) + ' | ' + ranksText(c.ranks) + ' | ' +
      f(c.endlessWavesP50) + ' | ' + c.deathCauses.join(', ') + ' |');
  });
  lines.push('');
  return lines.join('\n');
}

function compareMatrices(a, b) {
  var index = {};
  a.cells.forEach(function (c) { index[cellKey(c)] = c; });
  var rows = [];
  b.cells.forEach(function (c) {
    var old = index[cellKey(c)];
    if (!old) return;
    rows.push({
      key: cellKey(c),
      clearedWave15: [old.clearedWave15, c.clearedWave15],
      titan: [old.bossP50.titan, c.bossP50.titan],
      dreadnought: [old.bossP50.dreadnought, c.bossP50.dreadnought],
      sovereign: [old.bossP50.sovereign, c.bossP50.sovereign],
      scoreP50: [old.scoreP50, c.scoreP50],
      scoreP90: [old.scoreP90, c.scoreP90],
      deathWaveP50: [old.deathWaveP50, c.deathWaveP50],
      ranks: [old.ranks, c.ranks]
    });
  });
  var pooled = {};
  ['byBotHeat', 'byWeapon', 'byRig'].forEach(function (key) {
    pooled[key] = {};
    Object.keys(b.pooled[key]).forEach(function (k) {
      if (a.pooled[key] && a.pooled[key][k]) pooled[key][k] = [a.pooled[key][k], b.pooled[key][k]];
    });
  });
  return { schemaVersion: 1, baseline: a.label, current: b.label, cells: rows, pooled: pooled };
}

function renderCompare(c) {
  var lines = [];
  lines.push('# 矩陣對照 ' + c.current + ' 對 ' + c.baseline);
  lines.push('');
  ['byBotHeat', 'byWeapon', 'byRig'].forEach(function (key) {
    lines.push('## ' + (key === 'byBotHeat' ? '機器人 x Heat' : (key === 'byWeapon' ? '武器' : '機體')));
    lines.push('');
    lines.push('| 分組 | 過15% | 死亡波 p50 | Titan p50 | Dread p50 | Sov p50 | 分數 p50 | 分數 p90 | 評級 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    Object.keys(c.pooled[key]).sort().forEach(function (k) {
      var x = c.pooled[key][k][0];
      var y = c.pooled[key][k][1];
      lines.push('| ' + k + ' | ' + f(x.clearedWave15) + ' → ' + f(y.clearedWave15) + ' | ' + f(x.deathWaveP50) + ' → ' + f(y.deathWaveP50) + ' | ' +
        f(x.boss.titan.p50) + ' → ' + f(y.boss.titan.p50) + ' | ' + f(x.boss.dreadnought.p50) + ' → ' + f(y.boss.dreadnought.p50) + ' | ' +
        f(x.boss.sovereign.p50) + ' → ' + f(y.boss.sovereign.p50) + ' | ' + f(x.scoreP50) + ' → ' + f(y.scoreP50) + ' | ' + f(x.scoreP90) + ' → ' + f(y.scoreP90) + ' | ' +
        ranksText(x.ranks) + ' → ' + ranksText(y.ranks) + ' |');
    });
    lines.push('');
  });
  lines.push('## 全部格子');
  lines.push('');
  lines.push('| 格 | 過15 | 死亡波 p50 | Titan | Dread | Sov | 分數 p50 | 分數 p90 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  c.cells.forEach(function (row) {
    function pair(p, pct) {
      if (pct) return f(p[0] == null ? null : Math.round(p[0] * 100)) + ' → ' + f(p[1] == null ? null : Math.round(p[1] * 100)) + '%';
      return f(p[0]) + ' → ' + f(p[1]);
    }
    lines.push('| ' + row.key + ' | ' + pair(row.clearedWave15, true) + ' | ' + pair(row.deathWaveP50) + ' | ' + pair(row.titan) + ' | ' + pair(row.dreadnought) + ' | ' + pair(row.sovereign) + ' | ' + pair(row.scoreP50) + ' | ' + pair(row.scoreP90) + ' |');
  });
  lines.push('');
  return lines.join('\n');
}

function writeFiles(file, data, markdown) {
  var abs = path.resolve(ROOT, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  var jsonPath = abs.replace(/\.(md|json)$/i, '') + '.json';
  var mdPath = abs.replace(/\.(md|json)$/i, '') + '.md';
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  fs.writeFileSync(mdPath, markdown);
  console.log(jsonPath);
  console.log(mdPath);
}

async function main() {
  var args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    console.log(HELP);
    return;
  }
  if (args.compare) {
    var a = JSON.parse(fs.readFileSync(path.resolve(args.compare[0]), 'utf8'));
    var b = JSON.parse(fs.readFileSync(path.resolve(args.compare[1]), 'utf8'));
    var compared = compareMatrices(a, b);
    writeFiles(args.out || path.join('output', 'balance', 'compare-matrix.md'), compared, renderCompare(compared));
    return;
  }
  if (!(args.runs >= 1)) fail('--runs 必須 >= 1');
  var cells = buildCells(args);
  if (!cells.length) fail('沒有格子');
  if (!args.aggregateOnly) {
    var todo = cells.filter(function (c) {
      return args.force || !fs.existsSync(path.resolve(ROOT, cellPath(args, c)));
    });
    if (args.timeOne) todo = todo.slice(0, 1);
    console.error('格子 ' + cells.length + '，待跑 ' + todo.length + '，每格 ' + args.runs + ' 局，並行 ' + args.concurrency);
    var ran = await runAll(args, todo);
    console.error('完成 ' + todo.length + ' 格，牆鐘 ' + (ran.seconds / 60).toFixed(1) + ' 分');
    if (args.timeOne) return;
  }
  var matrix = aggregate(args, cells);
  writeFiles(args.prefix + '-matrix.json', matrix, renderMatrix(matrix));
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
