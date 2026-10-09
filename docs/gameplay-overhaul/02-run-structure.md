# 02 一局結構與波次導演

[返回索引](README.md)

## 三幕結構

| 幕 | 波次 | 首領 | 新內容解鎖 | 預設區段 |
| --- | --- | --- | --- | --- |
| Act I — THE DRYLINE | 1–5 | 第 5 波 Titan（既有） | 砲兵（第 2 波）、尖塔（第 3 波）、首次合約（第 3 波）、精英（第 3 波）、首次突變（第 4 波） | `dusk` |
| Act II — RUST BASIN | 6–10 | 第 10 波 Dreadnought（新） | Spitter（第 6 波）、Scurrier（第 7 波）、詞綴 volatile（第 8 波） | 依幕間路線 |
| Act III — BLACK GLASS | 11–15 | 第 15 波 Storm Sovereign（新） | Warden（第 11 波）、Burrower（第 12 波）、詞綴 splitter（第 13 波） | 依幕間路線 |
| Overtime（無盡） | 16+ | 每 5 波輪替強化首領 | Overheat 疊層 | 輪替 |

- 首領波：`waveTime >= 8` 時生成首領；首領存活時時鐘釘在 `WAVE_LENGTH - 0.1`，與現況相同。首領波期間生成間隔 ×1.6（減輕「首領 + 永久風暴 + 滿場小兵」的突兀）。
- 首領死亡後該波立即結束（不必等 30 秒），進入幕間。
- 視覺區段（`palette.js` 的 `sectorForWave`）改由導演決定，render 讀 `rt.state.sector`（見 [09](09-architecture.md)）。

## 幕間（Interlude）

首領死亡後模擬暫停，顯示幕間面板（見 [08](08-ui-ux.md#幕間面板)）。兩個步驟：

1. **路線選擇**：從 3 條路線中選 1 條，決定下一幕的區段規則（Sector Rule）與獎勵。
2. **軍械庫**：三選一 —— 換主武器（保留全部卡牌）、主武器強化一級（Weapon Mastery +1）、或修理 50% HP 並 +1 重抽。

### 區段規則（路線）

每條路線 = 1 個區段規則 + 1 個獎勵。規則持續整幕，與波次突變可疊加。

| ID | 名稱 | 規則 | 獎勵 |
| --- | --- | --- | --- |
| `scorched` | SCORCHED FLATS | 熔岩區持續 +1 秒；每波多 1 個油桶。 | 分數 ×1.10 |
| `ironfield` | IRON FIELD | 蠻牛比例 +10%；scrap XP +20%。 | 開幕 +1 重抽 |
| `static` | STATIC MIRE | 每波多 1 座尖塔；敵彈速度 +10%。 | 電池回復 +50% |
| `blackout` | BLACKOUT | 視野受限（render 端暗化，敵彈仍在可讀性層）；精英機率 +4%。 | 分數 ×1.20 |
| `convoy` | SCRAP CONVOY | 每波 1 輛裝甲運輸車（見 [05](05-arena-and-events.md#裝甲運輸車)）。 | 每輛擊毀 +1 補給箱 |
| `stormwall` | STORM WALL | 風暴持續 8 秒（原 5 秒）。 | Storm Breaker 獎勵 ×2 |

- 3 條路線從 6 條中以 `rng()` 抽出，不重複上一幕。
- 每日挑戰固定路線（種子決定）。

## 波次導演（`src/systems/director.js`）

導演在每波開始時決定該波的「配方」，取代目前散在 `spawnEnemy` 裡的線性公式。

```js
// Wave recipe produced by director.planWave(wave)
{
  wave: 7,
  act: 2,
  boss: null,               // 'titan' | 'dreadnought' | 'sovereign' | null
  mutator: 'swarm',         // see 05-arena-and-events.md, null on waves 1-3
  contract: 'barrel-kills', // see 05-arena-and-events.md, null on waves 1-2
  spawnInterval: 0.82,      // base seconds before random jitter
  cap: 33,
  weights: { crawler: 0.52, rusher: 0.2, brute: 0.1, artillery: 0.08, spitter: 0.06, scurrier: 0.04 },
  eliteChance: 0.07,
  hpScale: 1.0,
  dmgScale: 1.0,
  bulletScale: 1.0          // enemy projectile damage/speed multiplier
}
```

- `spawnEnemy()` 改為依 `weights` 抽型；屬性公式移入 `src/data/enemies.js`，用 `hpScale` / `dmgScale` 乘算。
- 精英、首領的彈幕傷害乘 `bulletScale`（修正現況彈傷不成長）。

### 難度曲線

把無上限線性成長改成「幕內成長、跨幕跳階、無盡疊層」。`w` 為幕內第幾波（1–5），`a` 為幕（1–3）。

| 參數 | 公式 | 第 1 波 | 第 5 波 | 第 10 波 | 第 15 波 |
| --- | --- | --- | --- | --- | --- |
| `hpScale` | `1 + (a-1)*0.55 + (w-1)*0.12` | 1.00 | 1.48 | 2.03 | 2.58 |
| `dmgScale` | `1 + (a-1)*0.30 + (w-1)*0.05` | 1.00 | 1.20 | 1.50 | 1.80 |
| `bulletScale` | `1 + (a-1)*0.25 + (w-1)*0.04` | 1.00 | 1.16 | 1.41 | 1.66 |
| `spawnInterval` | `max(0.32, 1.08 - (a-1)*0.18 - (w-1)*0.05)` | 1.08 | 0.88 | 0.70 | 0.52 |
| `cap` | `min(95, 9 + (a-1)*22 + (w-1)*5)` | 9 | 29 | 51 | 73 |
| `eliteChance` | 第 1–2 波 0；之後 `min(0.16, 0.04 + (a-1)*0.04 + (w-1)*0.01)` | 0 | 0.08 | 0.12 | 0.16 |

- 以上取代 `spawnEnemy` 現有的 `43+wave*7` 等線性公式；基準數值改在 `src/data/enemies.js` 以「第 1 波基準值」表示，數值表見 [10](10-balance-sheet.md)。
- 第 1–5 波的實際強度需與 v0.3.0 相近（±10%），新手體驗不變；差異主要從第 6 波開始。

### 無盡加時（Overtime）

- 第 16 波起每波疊 1 層 Overheat：`hpScale *= 1.12`、`dmgScale *= 1.06`、`bulletScale *= 1.05`，`spawnInterval` 地板 0.24，`cap` 95。
- 每 5 波（20、25、30…）首領依 Titan → Dreadnought → Sovereign 輪替，HP ×(1 + 0.35 × 輪次)。
- 無盡中每波結算額外分數 `500 × Overheat 層數`。
- 區段每 5 波隨機輪替一個規則（不出幕間面板，直接套用並顯示橫幅）。

## 撤離（通關）

- 第 15 波首領死亡後顯示撤離面板（見 [08](08-ui-ux.md#撤離面板)）：
  - **EXTRACT**：通關結算，分數加「撤離獎勵」（見 [06](06-skill-scoring-controls.md#計分)），提交成績。
  - **PUSH DEEPER**：進入無盡加時；撤離獎勵改為「延後領取」，死亡時仍可獲得 50%。
- 通關狀態寫入 `rt.state.extracted = true`，結算標題顯示 `EXTRACTED`；死亡則維持既有死亡演出。
