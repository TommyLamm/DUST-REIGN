export var TARGETS = {
  waveMedianDeltaMax: 1,
  bossKillSeconds: {
    titan: [40, 70],
    dreadnought: [60, 90],
    sovereign: [80, 120]
  },
  rankScore: { B: 75000, A: 225000, S: 550000, SSS: 700000 },
  rankPercentiles: { B: 0.6, A: 0.85, S: 0.97 }
};

export var HOOKS = [
  {
    id: 'timestep',
    need: '固定 dt 推進正式 update。',
    status: '已有 update(dt)，模擬器直接呼叫，不需要新鉤子。'
  },
  {
    id: 'headless-ui',
    need: 'rt.ui = null 或 headless 旗標時，renderUpgradePanel / beginRun 不可碰 document。平衡表寫 rt.ui = null，但升級當下會呼叫 renderUpgradePanel。',
    status: 'renderUpgradePanel 與 beginRun 在 rt.ui 為空時跳過 DOM。模擬器仍可自備 stub。'
  },
  {
    id: 'seed-core-spawn',
    need: 'makeState 的 coreSpawnTime，以及 pools.js 的粒子、彈殼、焦痕，仍呼叫 Math.random，不走 rng()。',
    status: 'coreSpawnTime 與 pools 的焦痕、粒子、彈殼已改走 rng()。未設種子時 rng 仍呼叫 Math.random。'
  },
  {
    id: 'damage-source',
    need: '致死時把正規化 source 寫進 state.lastDamageSource（contact:kind / bullet:* / boss:* / env:* / friendly:*）。',
    status: 'damagePlayer 在實際扣血時寫入 state.lastDamageSource。'
  },
  {
    id: 'heat-apply',
    need: 'director 的 startRun / planWave 套用 getHeatModifiers(state.heat)。',
    status: '模擬器在 beginRun 之後把 heat 寫回，並呼叫 onWaveStart，配方會乘上 getHeatModifiers。'
  },
  {
    id: 'interlude-api',
    need: '匯出 chooseInterlude(index) 與 chooseRepair()，選第一條路線與修理並清掉 state.interlude。',
    status: 'P0 不會進入幕間。若幕間被設上又沒有上述函式，模擬器會清掉 interlude 讓波次繼續，不自行加血。'
  }
];

function round(value, digits) {
  if (typeof value !== 'number' || value !== value || !isFinite(value)) return null;
  var m = Math.pow(10, digits == null ? 2 : digits);
  return Math.round(value * m) / m;
}

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  var idx = (sorted.length - 1) * p;
  var lo = Math.floor(idx);
  var hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  var w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function numbers(runs, pick) {
  var out = [];
  for (var i = 0; i < runs.length; i += 1) {
    var value = pick(runs[i]);
    if (typeof value === 'number' && isFinite(value)) out.push(value);
  }
  out.sort(function (a, b) { return a - b; });
  return out;
}

function dist(sorted) {
  if (!sorted.length) {
    return { n: 0, mean: null, min: null, max: null, p10: null, p50: null, p90: null };
  }
  var sum = 0;
  for (var i = 0; i < sorted.length; i += 1) sum += sorted[i];
  return {
    n: sorted.length,
    mean: round(sum / sorted.length, 2),
    min: round(sorted[0], 2),
    max: round(sorted[sorted.length - 1], 2),
    p10: round(quantile(sorted, 0.1), 2),
    p50: round(quantile(sorted, 0.5), 2),
    p90: round(quantile(sorted, 0.9), 2)
  };
}

function scoreDist(sorted) {
  var base = dist(sorted);
  base.p60 = round(quantile(sorted, 0.6), 1);
  base.p85 = round(quantile(sorted, 0.85), 1);
  base.p97 = round(quantile(sorted, 0.97), 1);
  return base;
}

function tally(runs, pick) {
  var counts = {};
  for (var i = 0; i < runs.length; i += 1) {
    var key = pick(runs[i]) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  var rows = [];
  var keys = Object.keys(counts);
  for (var k = 0; k < keys.length; k += 1) {
    rows.push({
      source: keys[k],
      count: counts[keys[k]],
      share: round(counts[keys[k]] / (runs.length || 1), 3)
    });
  }
  rows.sort(function (a, b) { return b.count - a.count; });
  return rows;
}

function meanMap(runs, pick) {
  var acc = {};
  var n = runs.length || 1;
  for (var i = 0; i < runs.length; i += 1) {
    var map = pick(runs[i]) || {};
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k += 1) acc[keys[k]] = (acc[keys[k]] || 0) + (map[keys[k]] || 0);
  }
  var out = {};
  var names = Object.keys(acc);
  for (var j = 0; j < names.length; j += 1) out[names[j]] = round(acc[names[j]] / n, 2);
  return out;
}

function meanBreakdown(runs) {
  var totals = {};
  var n = runs.length || 1;
  for (var i = 0; i < runs.length; i += 1) {
    var map = runs[i].scoreBreakdown || {};
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k += 1) totals[keys[k]] = (totals[keys[k]] || 0) + map[keys[k]];
  }
  var mean = {};
  var names = Object.keys(totals);
  var sum = 0;
  for (var j = 0; j < names.length; j += 1) {
    mean[names[j]] = round(totals[names[j]] / n, 1);
    sum += mean[names[j]];
  }
  var share = {};
  for (var s = 0; s < names.length; s += 1) {
    share[names[s]] = sum > 0 ? round(mean[names[s]] / sum, 3) : 0;
  }
  return { mean: mean, share: share };
}

function pushBucket(buckets, kind, value) {
  if (!buckets[kind]) buckets[kind] = [];
  buckets[kind].push(value);
}

function distMap(buckets) {
  var out = {};
  var kinds = Object.keys(buckets);
  for (var k = 0; k < kinds.length; k += 1) {
    buckets[kinds[k]].sort(function (a, b) { return a - b; });
    out[kinds[k]] = dist(buckets[kinds[k]]);
  }
  return out;
}

function bossStats(runs) {
  var kills = {};
  var wipes = {};
  for (var i = 0; i < runs.length; i += 1) {
    var list = runs[i].bossKills || [];
    for (var b = 0; b < list.length; b += 1) {
      var row = list[b];
      if (row.killed && row.duration != null) pushBucket(kills, row.kind, row.duration);
      else if (row.foughtSeconds != null) pushBucket(wipes, row.kind, row.foughtSeconds);
    }
  }
  return { kills: distMap(kills), wipes: distMap(wipes) };
}

function meanWaveTimes(runs) {
  var acc = {};
  var n = {};
  for (var i = 0; i < runs.length; i += 1) {
    var rows = runs[i].waveTimes || [];
    for (var w = 0; w < rows.length; w += 1) {
      var key = String(rows[w].wave);
      acc[key] = (acc[key] || 0) + rows[w].seconds;
      n[key] = (n[key] || 0) + 1;
    }
  }
  var out = {};
  var keys = Object.keys(acc);
  for (var k = 0; k < keys.length; k += 1) out[keys[k]] = round(acc[keys[k]] / n[keys[k]], 2);
  return out;
}

function letterCounts(runs) {
  var counts = {};
  for (var i = 0; i < runs.length; i += 1) {
    var letter = (runs[i].rank && runs[i].rank.letter) || '?';
    counts[letter] = (counts[letter] || 0) + 1;
  }
  return counts;
}

function bossDeviations(bosses) {
  var out = [];
  var kills = (bosses && bosses.kills) || {};
  var wipes = (bosses && bosses.wipes) || {};
  var kinds = Object.keys(TARGETS.bossKillSeconds);
  for (var i = 0; i < kinds.length; i += 1) {
    var kind = kinds[i];
    var target = TARGETS.bossKillSeconds[kind];
    var stats = kills[kind];
    var wipe = wipes[kind] || null;
    if (!stats || !stats.n) {
      out.push({
        kind: kind,
        status: 'no-sample',
        target: target,
        p50: null,
        n: 0,
        diedDuringFight: wipe ? wipe.n : 0,
        diedAfterSecondsP50: wipe ? wipe.p50 : null
      });
      continue;
    }
    var inside = stats.p50 >= target[0] && stats.p50 <= target[1];
    out.push({
      kind: kind,
      status: inside ? 'inside' : 'outside',
      target: target,
      p50: stats.p50,
      mean: stats.mean,
      n: stats.n,
      diedDuringFight: wipe ? wipe.n : 0,
      diedAfterSecondsP50: wipe ? wipe.p50 : null
    });
  }
  return out;
}

function scoreDeviations(score) {
  return [
    { percentile: 'p60', actual: score.p60, target: TARGETS.rankScore.B, rank: 'B', delta: round((score.p60 || 0) - TARGETS.rankScore.B, 1) },
    { percentile: 'p85', actual: score.p85, target: TARGETS.rankScore.A, rank: 'A', delta: round((score.p85 || 0) - TARGETS.rankScore.A, 1) },
    { percentile: 'p97', actual: score.p97, target: TARGETS.rankScore.S, rank: 'S', delta: round((score.p97 || 0) - TARGETS.rankScore.S, 1) }
  ];
}

function clearedWave15(run) {
  if (run.gate) return true;
  return (run.deathWave || 0) > 15;
}

function rate(count, total) {
  return total > 0 ? round(count / total, 3) : null;
}

// Wave-15 gate: the extract-or-push decision point. Every run that clears the Sovereign passes it.
function gateSummary(runs) {
  var gated = [];
  for (var i = 0; i < runs.length; i += 1) if (runs[i].gate) gated.push(runs[i]);
  var ranks = {};
  for (var g = 0; g < gated.length; g += 1) {
    var letter = (gated[g].gate.rankIfExtracted && gated[g].gate.rankIfExtracted.letter) || '?';
    ranks[letter] = (ranks[letter] || 0) + 1;
  }
  return {
    n: gated.length,
    clearRate: rate(gated.length, runs.length),
    seconds: dist(numbers(gated, function (run) { return run.gate.simSeconds; })),
    score: scoreDist(numbers(gated, function (run) { return run.gate.score; })),
    scoreIfExtracted: scoreDist(numbers(gated, function (run) { return run.gate.scoreIfExtracted; })),
    rankIfExtracted: ranks,
    hpRatio: dist(numbers(gated, function (run) { return run.gate.hpRatio; })),
    breakdown: meanBreakdown(gated.map(function (run) { return { scoreBreakdown: run.gate.breakdown }; }))
  };
}

// Endless (overtime past wave 15): how far the survivors get and what each extra wave pays.
function endlessSummary(runs) {
  var pushers = [];
  for (var i = 0; i < runs.length; i += 1) if (runs[i].gate && runs[i].overtime !== false) pushers.push(runs[i]);
  var perWave = {};
  var shares = [];
  for (var p = 0; p < pushers.length; p += 1) {
    var run = pushers[p];
    var rows = run.waveTimes || [];
    var prev = run.gate.score;
    for (var r = 0; r < rows.length; r += 1) {
      var row = rows[r];
      if (!row.completed || row.wave <= 15 || typeof row.score !== 'number') continue;
      var key = String(row.wave);
      if (!perWave[key]) perWave[key] = { gain: [], cum: [], seconds: [] };
      perWave[key].gain.push(row.score - prev);
      perWave[key].cum.push(row.score);
      perWave[key].seconds.push(row.seconds);
      prev = row.score;
    }
    if (run.score > 0) shares.push((run.score - run.gate.score) / run.score);
  }
  var out = {};
  var keys = Object.keys(perWave);
  keys.sort(function (a, b) { return Number(a) - Number(b); });
  for (var k = 0; k < keys.length; k += 1) {
    var bucket = perWave[keys[k]];
    bucket.gain.sort(function (a, b) { return a - b; });
    bucket.cum.sort(function (a, b) { return a - b; });
    bucket.seconds.sort(function (a, b) { return a - b; });
    out[keys[k]] = {
      n: bucket.gain.length,
      gainP50: round(quantile(bucket.gain, 0.5), 0),
      gainP90: round(quantile(bucket.gain, 0.9), 0),
      cumP50: round(quantile(bucket.cum, 0.5), 0),
      secondsP50: round(quantile(bucket.seconds, 0.5), 1)
    };
  }
  shares.sort(function (a, b) { return a - b; });
  return {
    n: pushers.length,
    wavesReached: dist(numbers(pushers, function (run) { return run.endlessWaves; })),
    perWave: out,
    scoreShareFromEndless: dist(shares)
  };
}

function resonanceSummary(runs) {
  var tiers = { 0: 0, 1: 0, 2: 0, 3: 0 };
  var counted = 0;
  var sums = { kinetic: 0, plasma: 0, static: 0, tactical: 0 };
  for (var i = 0; i < runs.length; i += 1) {
    var res = runs[i].gate ? runs[i].gate.resonance : runs[i].resonance;
    if (!res) continue;
    counted += 1;
    tiers[res.bestTier] = (tiers[res.bestTier] || 0) + 1;
    var keys = Object.keys(sums);
    for (var k = 0; k < keys.length; k += 1) sums[keys[k]] += (res.counts && res.counts[keys[k]]) || 0;
  }
  var mean = {};
  var names = Object.keys(sums);
  for (var n = 0; n < names.length; n += 1) mean[names[n]] = counted ? round(sums[names[n]] / counted, 2) : null;
  return { n: counted, bestTier: tiers, meanStacks: mean };
}

function contractSummary(runs) {
  var offered = 0;
  var completed = 0;
  var doubled = 0;
  var doubledCompleted = 0;
  var doubledFailed = 0;
  for (var i = 0; i < runs.length; i += 1) {
    var c = runs[i].contracts;
    if (!c) continue;
    offered += c.offered || 0;
    completed += c.completed || 0;
    doubled += c.doubled || 0;
    doubledCompleted += c.doubledCompleted || 0;
    doubledFailed += c.doubledFailed || 0;
  }
  return {
    offered: offered,
    completeRate: rate(completed, offered),
    doubled: doubled,
    doubledCompleteRate: rate(doubledCompleted, doubledCompleted + doubledFailed),
    doubledFailed: doubledFailed
  };
}

export function summarizeBot(runs) {
  var waves = numbers(runs, function (run) { return run.deathWave; });
  var scores = numbers(runs, function (run) { return run.score; });
  var levels = numbers(runs, function (run) { return run.level; });
  var walls = numbers(runs, function (run) { return run.wallMs; });
  var sims = numbers(runs, function (run) { return run.simSeconds; });
  var bosses = bossStats(runs);
  var censored = 0;
  for (var i = 0; i < runs.length; i += 1) if (runs[i].censored) censored += 1;
  return {
    runs: runs.length,
    censored: censored,
    deathWave: dist(waves),
    score: scoreDist(scores),
    level: dist(levels),
    wallMs: dist(walls),
    simSeconds: dist(sims),
    deathCauses: tally(runs, function (run) { return run.deathCause; }),
    outcomes: tally(runs, function (run) { return run.outcome; }),
    ranks: letterCounts(runs),
    clearedWave15: rate(runs.filter(clearedWave15).length, runs.length),
    gate: gateSummary(runs),
    endless: endlessSummary(runs),
    resonance: resonanceSummary(runs),
    contracts: contractSummary(runs),
    maxCombo: dist(numbers(runs, function (run) { return run.stats && run.stats.maxCombo; })),
    flawlessWaves: dist(numbers(runs, function (run) { return run.stats && run.stats.flawlessWaves; })),
    spawnsMean: meanMap(runs, function (run) { return run.spawns; }),
    killsMean: meanMap(runs, function (run) { return run.kills; }),
    scoreBreakdown: meanBreakdown(runs),
    bossKills: bosses,
    waveSecondsMean: meanWaveTimes(runs),
    deviations: {
      bosses: bossDeviations(bosses),
      rankScore: scoreDeviations(scoreDist(scores)),
      note: 'B/A/S 對齊首領分數斷層：沒打下 Titan 多半是 C，打下 Titan 是 B，打下 Dreadnought 是 A，打下 Sovereign 或更深是 S。S+ 仍是撤離且 Heat ≥ 2。'
    }
  };
}

export function buildReport(meta, runs) {
  var groups = {};
  for (var i = 0; i < runs.length; i += 1) {
    var bot = runs[i].bot || 'skilled';
    if (!groups[bot]) groups[bot] = [];
    groups[bot].push(runs[i]);
  }
  var bots = {};
  var order = Object.keys(groups);
  for (var b = 0; b < order.length; b += 1) bots[order[b]] = summarizeBot(groups[order[b]]);
  return {
    schemaVersion: 1,
    meta: meta,
    targets: TARGETS,
    hooks: HOOKS,
    bots: bots,
    runs: runs
  };
}

function fmt(value) {
  if (value == null || value === '') return '—';
  return String(value);
}

function topCauses(rows, n) {
  var out = [];
  var list = rows || [];
  for (var i = 0; i < list.length && i < n; i += 1) {
    out.push(list[i].source + ' ' + list[i].count);
  }
  return out.length ? out.join('、') : '—';
}

export function renderMarkdown(report) {
  var meta = report.meta || {};
  var lines = [];
  lines.push('# 平衡模擬 ' + (meta.label || ''));
  lines.push('');
  lines.push('- 原始碼：`' + (meta.src || '') + '`');
  lines.push('- 亂數：' + ((meta.rng && meta.rng.mode) || '') + '。' + ((meta.rng && meta.rng.note) || ''));
  if (meta.commit) lines.push('- 對照 commit：`' + meta.commit + '`');
  lines.push('- 種子：`' + (meta.seedPattern || '') + '`，起點 `' + fmt(meta.seed) + '`，每機器人 ' + fmt(meta.runsPerBot) + ' 局');
  lines.push('- 步長：1/60 秒。波次上限 ' + fmt(meta.waves || '直到死亡') + '，時間上限 ' + fmt(meta.seconds || ('安全閥 ' + SAFETY_LABEL(meta))) + ' 秒');
  lines.push('- Heat：' + fmt(meta.heat) + '（beginRun 後重跑 onWaveStart）');
  if (meta.startWave > 1) lines.push('- 起始波次：' + fmt(meta.startWave) + '，路線 ' + fmt(meta.route || 'ironfield（第 6 波起）') + '，等級注入 1+round((wave-1)*0.8)');
  if (meta.rig) lines.push('- 機體：' + meta.rig);
  if (meta.weapon) lines.push('- 武器：' + meta.weapon);
  if (meta.tactical) lines.push('- 戰術裝備：' + meta.tactical);
  if (meta.cards && meta.cards !== 'default') lines.push('- 選卡：' + meta.cards);
  if (meta.chargePolicy && meta.chargePolicy !== 'auto') lines.push('- 蓄力策略：' + meta.chargePolicy);
  if (meta.doubleDown && meta.doubleDown !== 'off') lines.push('- 合約加注：' + meta.doubleDown);
  if (meta.gate && meta.gate !== 'push') lines.push('- 第 15 波關卡：' + meta.gate);
  if (meta.world) lines.push('- 場地：3520x2640 大世界，視口 1280x720');
  if (meta.botNotes && meta.botNotes.length) {
    lines.push('- 機器人：idle / kite 維持下限。skilled 改動：');
    var note;
    for (note = 0; note < meta.botNotes.length; note += 1) lines.push('  - ' + meta.botNotes[note]);
  }
  lines.push('');
  var names = Object.keys(report.bots || {});
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    var bot = report.bots[name];
    lines.push('## ' + name);
    lines.push('');
    lines.push('- 存活／死亡波次 p10 / p50 / p90：' + fmt(bot.deathWave.p10) + ' / ' + fmt(bot.deathWave.p50) + ' / ' + fmt(bot.deathWave.p90) + '（平均 ' + fmt(bot.deathWave.mean) + '，右刪 ' + bot.censored + '）');
    lines.push('- 分數 p10 / p50 / p90：' + fmt(bot.score.p10) + ' / ' + fmt(bot.score.p50) + ' / ' + fmt(bot.score.p90) + '（平均 ' + fmt(bot.score.mean) + '）');
    lines.push('- 分數 p60 / p85 / p97：' + fmt(bot.score.p60) + ' / ' + fmt(bot.score.p85) + ' / ' + fmt(bot.score.p97) + '；0.14.0 起 B/A/S/SSS 為 75000 / 225000 / 550000 / 700000');
    if (bot.clearedWave15 != null) lines.push('- 過第 15 波（到達撤離關卡）：' + Math.round(bot.clearedWave15 * 1000) / 10 + '%');
    if (bot.gate && bot.gate.n) {
      lines.push('- 關卡分數 p10 / p50 / p90：' + fmt(bot.gate.score.p10) + ' / ' + fmt(bot.gate.score.p50) + ' / ' + fmt(bot.gate.score.p90) + '；若撤離 p50 / p90：' + fmt(bot.gate.scoreIfExtracted.p50) + ' / ' + fmt(bot.gate.scoreIfExtracted.p90) + '；若撤離評級 ' + JSON.stringify(bot.gate.rankIfExtracted) + '；到達秒數 p50 ' + fmt(bot.gate.seconds.p50));
    }
    if (bot.endless && bot.endless.n) {
      var pw = bot.endless.perWave || {};
      var pwKeys = Object.keys(pw);
      var pwText = [];
      for (var pk = 0; pk < pwKeys.length; pk += 1) pwText.push('W' + pwKeys[pk] + ' +' + pw[pwKeys[pk]].gainP50 + '（n=' + pw[pwKeys[pk]].n + '）');
      lines.push('- 無盡：深入 ' + bot.endless.n + ' 局，多撐波數 p50 / p90 ' + fmt(bot.endless.wavesReached.p50) + ' / ' + fmt(bot.endless.wavesReached.p90) + '；每波分數增量 p50：' + (pwText.join('、') || '—') + '；無盡佔最終分數比 p50 ' + fmt(bot.endless.scoreShareFromEndless.p50));
    }
    if (bot.resonance && bot.resonance.n) lines.push('- 共鳴（第 15 波關卡或結束時）最高階分布：' + JSON.stringify(bot.resonance.bestTier) + '，平均疊層 ' + JSON.stringify(bot.resonance.meanStacks));
    if (bot.contracts && bot.contracts.offered) lines.push('- 合約：出現 ' + bot.contracts.offered + '，完成率 ' + fmt(bot.contracts.completeRate) + '；加注 ' + bot.contracts.doubled + ' 次，成功率 ' + fmt(bot.contracts.doubledCompleteRate));
    lines.push('- 最高連擊 p50 / p90：' + fmt(bot.maxCombo.p50) + ' / ' + fmt(bot.maxCombo.p90) + '；無傷波數平均 ' + fmt(bot.flawlessWaves.mean));
    lines.push('- 死亡原因前三：' + topCauses(bot.deathCauses, 3));
    lines.push('- 評級字母：' + JSON.stringify(bot.ranks));
    lines.push('- 等級 p50：' + fmt(bot.level.p50) + '，每局牆鐘平均 ' + fmt(bot.wallMs.mean) + ' ms，模擬時間平均 ' + fmt(bot.simSeconds.mean) + ' 秒');
    lines.push('- 首領：' + bossLine(bot.deviations.bosses));
    lines.push('- 平均生成：' + JSON.stringify(bot.spawnsMean));
    lines.push('- 平均擊殺：' + JSON.stringify(bot.killsMean));
    var shareKeys = Object.keys((bot.scoreBreakdown && bot.scoreBreakdown.share) || {});
    if (!shareKeys.length) lines.push('- scoreBreakdown：這批對局沒有分數來源欄位');
    else lines.push('- 分數來源佔比：' + JSON.stringify(bot.scoreBreakdown.share));
    lines.push('');
  }
  lines.push('## 與數值表的偏離');
  lines.push('');
  lines.push(TARGETS_NOTE);
  lines.push('');
  for (var n = 0; n < names.length; n += 1) {
    var item = report.bots[names[n]];
    lines.push('### ' + names[n]);
    lines.push('');
    var bosses = item.deviations.bosses;
    for (var b = 0; b < bosses.length; b += 1) {
      var row = bosses[b];
      if (row.status === 'no-sample') {
        lines.push('- ' + row.kind + '：無擊殺樣本（目標 ' + row.target[0] + '–' + row.target[1] + ' 秒）' + (row.diedDuringFight ? '；交戰中死亡 ' + row.diedDuringFight + ' 次，死亡前交戰 p50 ' + row.diedAfterSecondsP50 + ' 秒' : ''));
      } else lines.push('- ' + row.kind + '：擊殺 p50 ' + row.p50 + ' 秒，目標 ' + row.target[0] + '–' + row.target[1] + ' 秒，' + (row.status === 'inside' ? '落在區間內' : '偏離區間') + '（n=' + row.n + '）');
    }
    var ranks = item.deviations.rankScore;
    for (var r = 0; r < ranks.length; r += 1) {
      lines.push('- 分數 ' + ranks[r].percentile + ' = ' + fmt(ranks[r].actual) + '，對應 ' + ranks[r].rank + ' 目標 ' + ranks[r].target + '，差 ' + fmt(ranks[r].delta));
    }
    lines.push('');
  }
  lines.push('## 跨檔需求');
  lines.push('');
  var hooks = report.hooks || [];
  for (var h = 0; h < hooks.length; h += 1) {
    lines.push('- **' + hooks[h].id + '**：' + hooks[h].need + ' ' + hooks[h].status);
  }
  lines.push('');
  return lines.join('\n');
}

var TARGETS_NOTE = '第 1–5 波與 v0.3.0 的中位死亡波次要對兩份報表。首領時間目標是 Titan 40–70 秒、Dreadnought 60–90 秒、Sovereign 80–120 秒。B/A/S 用 0.14.0 的 75000 / 225000 / 550000（SSS 700000），對齊沒打首領、Titan、Dreadnought、Sovereign 的分數斷層；原始百分位見報表。';

function SAFETY_LABEL(meta) {
  return meta.safetySeconds || 1200;
}

function bossLine(rows) {
  if (!rows || !rows.length) return '—';
  var parts = [];
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].status === 'no-sample') {
      parts.push(rows[i].kind + ' 無擊殺' + (rows[i].diedDuringFight ? '（交戰死亡 ' + rows[i].diedDuringFight + '，p50 ' + rows[i].diedAfterSecondsP50 + 's）' : ''));
    } else parts.push(rows[i].kind + ' 擊殺 p50 ' + rows[i].p50 + 's（n=' + rows[i].n + '）');
  }
  return parts.join('、');
}

function bossP50Map(left, right) {
  var out = {};
  var kinds = Object.keys(TARGETS.bossKillSeconds);
  for (var i = 0; i < kinds.length; i += 1) {
    var a = left.bossKills && left.bossKills.kills && left.bossKills.kills[kinds[i]];
    var b = right.bossKills && right.bossKills.kills && right.bossKills.kills[kinds[i]];
    out[kinds[i]] = {
      baseline: a ? a.p50 : null,
      current: b ? b.p50 : null,
      baselineN: a ? a.n : 0,
      currentN: b ? b.n : 0
    };
  }
  return out;
}

export function compareReports(baseline, current) {
  var names = Object.keys(current.bots || {});
  var bots = {};
  var anySignificant = false;
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    var left = baseline.bots && baseline.bots[name];
    var right = current.bots[name];
    if (!left || !right) continue;
    var delta = (right.deathWave.p50 == null || left.deathWave.p50 == null) ? null : round(right.deathWave.p50 - left.deathWave.p50, 2);
    var ratio = (left.score.p50 > 0 && right.score.p50 != null) ? round(right.score.p50 / left.score.p50, 3) : null;
    var significant = delta != null && Math.abs(delta) > TARGETS.waveMedianDeltaMax;
    if (significant) anySignificant = true;
    var causes = [];
    var oldLabel = String((baseline.meta && baseline.meta.label) || '');
    if (oldLabel.indexOf('0.3') >= 0) {
      causes.push('亂數流不同：v0.3.0 的生成、掉落與粒子共用一條 Math.random；目前玩法走 seedRun 分流，coreSpawnTime 與模擬粒子也走 rng()。相同 --seed 不會走出 v0.3.0 的敵人序列。');
      causes.push('武器切換已從輸入移除。兩邊機器人都固定 standard 開局，這項本身不應移動死亡波次中位數。');
    } else {
      causes.push('兩份報表使用同一組種子，開局亂數對齊；改動數值後機器人的操作會分叉，局間差距仍有抽樣噪音，局數少時請看 p50 之外的分布。');
    }
    if (significant) {
      causes.push('死亡波次中位數相差超過 1。20 局的抽樣噪音可能夠大；若加大局數仍超過 1，再核對導演配方的生成率、精英機率，以及傷害入口是否改到了 v0.3 的扣血數字。');
    } else {
      causes.push('死亡波次中位數差距在 1 波以內，以這次樣本來看 P0 與 v0.3.0 大致等價。');
    }
    if (left.score.p50 != null && right.score.p50 != null && left.score.p50 < 500 && right.score.p50 < 500) {
      causes.push('兩邊分數中位數都低於 500。死亡波次已經對上時，比值只是地板分數（含進行中的 style 加分），不能當成戰鬥強度差。');
    } else if (ratio != null && (ratio < 0.75 || ratio > 1.33)) {
      causes.push('分數中位數比值偏離 1 較多。P0 的 addScore 倍率目前是 1，分數應跟著擊殺與存活走；若波次接近但分數差很多，再查 scoreBreakdown。');
    }
    bots[name] = {
      deathWave: {
        baseline: left.deathWave,
        current: right.deathWave,
        deltaP50: delta,
        withinOneWave: delta != null && Math.abs(delta) <= TARGETS.waveMedianDeltaMax
      },
      score: {
        baselineP50: left.score.p50,
        currentP50: right.score.p50,
        baselineP90: left.score.p90,
        currentP90: right.score.p90,
        ratioP50: ratio
      },
      clearedWave15: {
        baseline: left.clearedWave15 == null ? null : left.clearedWave15,
        current: right.clearedWave15 == null ? null : right.clearedWave15
      },
      bossKillP50: bossP50Map(left, right),
      ranks: { baseline: left.ranks, current: right.ranks },
      gateRanks: {
        baseline: left.gate ? left.gate.rankIfExtracted : null,
        current: right.gate ? right.gate.rankIfExtracted : null
      },
      endlessWavesP50: {
        baseline: left.endless && left.endless.n ? left.endless.wavesReached.p50 : null,
        current: right.endless && right.endless.n ? right.endless.wavesReached.p50 : null
      },
      deathCauses: {
        baseline: (left.deathCauses || []).slice(0, 3),
        current: (right.deathCauses || []).slice(0, 3)
      },
      wallMsMean: {
        baseline: left.wallMs.mean,
        current: right.wallMs.mean
      },
      significant: significant,
      possibleCauses: causes
    };
  }
  return {
    schemaVersion: 1,
    baselineLabel: baseline.meta && baseline.meta.label,
    currentLabel: current.meta && current.meta.label,
    target: String((baseline.meta && baseline.meta.label) || '').indexOf('0.3') >= 0
      ? '校準目標是機器人中位死亡波次與 v0.3.0 相差 ≤ 1。這次用目前工作目錄對 v0.3.0；v0.4.0 的新敵、新首領與新計分還沒齊。'
      : '改動前後對照：同一組種子、同一組參數。看存活率、首領擊殺秒數與分數 p50 / p90 是否朝目標移動，死亡波次中位數相差 ≤ 1 視為無顯著差異。',
    significant: anySignificant,
    bots: bots
  };
}

export function renderCompareMarkdown(compared) {
  var lines = [];
  lines.push('# ' + (compared.currentLabel || '目前') + ' 對 ' + (compared.baselineLabel || '基準'));
  lines.push('');
  lines.push(compared.target);
  lines.push('');
  lines.push(compared.significant ? '至少一個機器人的死亡波次中位數相差超過 1 波。' : '這次樣本裡，各機器人的死亡波次中位數都落在 1 波以內。');
  lines.push('');
  var names = Object.keys(compared.bots || {});
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    var bot = compared.bots[name];
    lines.push('## ' + name);
    lines.push('');
    var A = compared.baselineLabel || '基準';
    var B = compared.currentLabel || '目前';
    lines.push('- 死亡波次 p10 / p50 / p90：' + A + ' ' + fmt(bot.deathWave.baseline.p10) + ' / ' + fmt(bot.deathWave.baseline.p50) + ' / ' + fmt(bot.deathWave.baseline.p90) + '；' + B + ' ' + fmt(bot.deathWave.current.p10) + ' / ' + fmt(bot.deathWave.current.p50) + ' / ' + fmt(bot.deathWave.current.p90) + '；p50 差 ' + fmt(bot.deathWave.deltaP50));
    lines.push('- 分數 p50：' + A + ' ' + fmt(bot.score.baselineP50) + '，' + B + ' ' + fmt(bot.score.currentP50) + '，比值 ' + fmt(bot.score.ratioP50) + '；p90：' + fmt(bot.score.baselineP90) + ' → ' + fmt(bot.score.currentP90));
    if (bot.clearedWave15 && (bot.clearedWave15.baseline != null || bot.clearedWave15.current != null)) {
      lines.push('- 過第 15 波比率：' + fmt(bot.clearedWave15.baseline) + ' → ' + fmt(bot.clearedWave15.current));
    }
    if (bot.bossKillP50) {
      var bk = Object.keys(bot.bossKillP50);
      var bkText = [];
      for (var bi = 0; bi < bk.length; bi += 1) {
        var bv = bot.bossKillP50[bk[bi]];
        bkText.push(bk[bi] + ' ' + fmt(bv.baseline) + ' → ' + fmt(bv.current) + ' 秒（n ' + bv.baselineN + ' → ' + bv.currentN + '）');
      }
      lines.push('- 首領擊殺 p50：' + bkText.join('、'));
    }
    if (bot.ranks) lines.push('- 評級分布：' + JSON.stringify(bot.ranks.baseline) + ' → ' + JSON.stringify(bot.ranks.current));
    lines.push('- 死亡原因前三 ' + A + '：' + topCauses(bot.deathCauses.baseline, 3));
    lines.push('- 死亡原因前三 ' + B + '：' + topCauses(bot.deathCauses.current, 3));
    lines.push('- 每局牆鐘平均：' + A + ' ' + fmt(bot.wallMsMean.baseline) + ' ms，' + B + ' ' + fmt(bot.wallMsMean.current) + ' ms');
    lines.push('- 可能原因：');
    for (var c = 0; c < bot.possibleCauses.length; c += 1) lines.push('  - ' + bot.possibleCauses[c]);
    lines.push('');
  }
  return lines.join('\n');
}
