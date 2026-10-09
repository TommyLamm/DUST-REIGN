# 06 技巧、計分與操作

[返回索引](README.md)

## Just Dash 過熱

現況 Just Dash 冷卻 0.35 秒、無敵 0.32 秒，貼著威脅幾乎可以常駐無敵。改為：

- 第一次 Just Dash 冷卻仍是 0.35 秒（自檢不變）。
- 前一次 Just Dash 後 3 秒內再次 Just Dash，疊 1 層過熱（最多 3 層）：冷卻 = `0.35 + 0.30 × 過熱層數`（0.65 / 0.95 / 1.25）。
- 3 秒內沒有 Just Dash 時過熱歸零。普通衝刺不疊也不清過熱。
- 無敵 0.32 秒、伏擊 1.2 秒、脈衝 ×2.2、hitstop 0.22 不變。
- `dash-capacitor` 的兩段充能各自套用過熱後的冷卻。
- 狀態存 `player.dashHeat` 與 `player.dashHeatTimer`；HUD 在衝刺鈕／衝刺指示上顯示過熱層數。

## 計分

所有加分改走 `src/systems/scoring.js` 的 `addScore(amount, source)`，由它套用倍率並記錄來源。現有五處 `rt.state.score +=` 全部改成呼叫它。

```js
// final = round(amount * routeMultiplier * heatMultiplier)
addScore(20, 'kill');
```

| 來源 `source` | 數值 | 備註 |
| --- | --- | --- |
| `kill` | 既有：`round(base × (1 + (combo-1) × 0.25))` | 新敵型 base 見 [04](04-enemies-and-bosses.md) |
| `bounty` | 既有：該波 `bountyReward` | |
| `storm` | 既有：Storm Breaker 350（`stormwall` 路線 ×2） | |
| `graze` | 既有：每發 15 | |
| `repair` | 既有：滿血維修 12 | |
| `wave` | 新：每波結束 `100 × wave` | 首領波在首領死亡時結算 |
| `flawless` | 新：該波未受傷 `50 × wave` | |
| `boss` | 新：Titan 800、Dreadnought 1500、Sovereign 3000；無盡輪替 ×(1 + 0.5 × 輪次) | 取代 Titan 的擊殺 base 800（不再走 combo） |
| `style` | 新：Just Dash +40、Titan 零件破壞 +200、Dreadnought 背擊暈眩期間擊殺 +100 | |
| `contract` | 新：合約分數獎勵 | |
| `overtime` | 新：無盡每波 `500 × Overheat 層數` | |
| `extract` | 新：撤離 `5000 + 1000 × Heat` | PUSH DEEPER 後死亡只得 50% |

倍率：

- `routeMultiplier`：當前幕路線的分數獎勵（`scorched` ×1.1、`blackout` ×1.2，其餘 1）。第 1 幕固定 1。
- `heatMultiplier`：`1 + 0.15 × Heat`（Heat 0 時為 1）。
- Heat 0、第 1 幕時倍率為 1，因此既有計分自檢（爬蟲 20、連殺 45、賞金 57/82、砲兵 60、擦彈 15、溢出 12）全部維持。
- `state.scoreBreakdown` 依來源累加（倍率後），供結算畫面顯示。

## 評級

改為以分數為主，並把撤離與 Heat 納入。門檻以 [10](10-balance-sheet.md) 的校準結果為準：

| 評級 | 條件 | 稱號（沿用既有） |
| --- | --- | --- |
| `S+` | 撤離通關且 Heat ≥ 2 | `DUST SOVEREIGN`（新） |
| `S` | 撤離通關，或分數 ≥ 220000 | `APEX SCAVENGER` |
| `A` | 分數 ≥ 90000 | `VETERAN BREACHER` |
| `B` | 分數 ≥ 30000 | `IRON SCRAPPER` |
| `C` | 其餘 | `RECRUIT RECLUSE` |

- 命中率不再影響評級（穿透可讓命中率超過 100%，不適合當門檻），仍顯示在結算。
- `calculateCombatRank` 的九個自檢案例改寫成新規則；結算 DOM 的類名與印章動畫不變。

## 操作修正

### 手機

- **EMP 拖曳落點**：點按 EMP 照舊朝準星方向 85px；從 EMP 鈕拖曳時顯示落點準星（距玩家最多 220px，跟隨拖曳位移），放開施放，拖回按鈕上取消。
- **黏性鎖定**：FIRE 自動瞄準最近敵人，鎖定後 0.5 秒內除非目標死亡或距離 > 1.5 倍，否則不換目標，減少抖動。
- **首領優先**：首領戰中，若首領在 380px 內且無敵人在 120px 內，優先鎖首領（Dreadnought 鎖背面反應爐方向不做，維持中心）。
- 觸控目標維持 ≥ 44px；新增的 EMP 拖曳不可與搖桿衝突（各自追蹤 `pointerId`）。

### 手把

- 右扳機射擊時設定持續開火狀態，讓 `continuousFireTime` 累積（修正火神熔毀在手把無法啟動）。
- 遊玩中 D-pad 也可移動（暫停時維持切換分頁）。
- 武器切換鍵移除（主武器承諾）。

### 鍵盤

- `Shift` 與 `Space` 都可衝刺。
- `T` 不再切換武器。

## 新手提示

- 情境觸發的非暫停提示條（畫面上方、4 秒、同時最多 1 則、兩則間隔至少 20 秒），每則只顯示一次。
- 已看過的提示存 `dust-reign:tips:v1`（id 陣列）；暫停 SYSTEM 分頁新增 `TIPS: ON/OFF`（`dust-reign:tips-enabled:v1`）與 `RESET TIPS`。

| id | 觸發 | 文案方向 |
| --- | --- | --- |
| `move-shoot` | 開局 | 移動與射擊（依輸入方式顯示鍵位或觸控） |
| `dash` | 第一次有敵人進入 120px | 衝刺可穿越並短暫無敵 |
| `just-dash` | 第一次在威脅旁衝刺成功 | Just Dash：貼近威脅衝刺可縮短冷卻並必暴 |
| `graze` | 第一次擦彈 | 擦彈加分與充電，5 次觸發 Overdrive |
| `barrel` | 第一次看到油桶 | 射爆或衝刺踢飛油桶 |
| `emp` | 電池第一次 ≥ 50 | EMP 清彈與暈眩，打尖塔會共鳴 |
| `core-boss` | 第一次首領出現 | 核心爆炸對首領 350 傷 |
| `contract` | 第一次出現合約 | 合約可選，完成立即領獎 |
| `mutator` | 第一次出現突變 | 突變說明 |
| `fusion` | 第一次出現 `COMPLETES:` 卡 | 融合說明 |
| `route` | 第一次幕間 | 路線與軍械庫說明 |

- 提示 DOM 使用 `aria-live="polite"`；Reduced Motion 時不滑入，直接淡入。
