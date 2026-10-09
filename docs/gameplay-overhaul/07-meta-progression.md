# 07 局外成長

[返回索引](README.md)

原則：解鎖靠「做過什麼」（成就），不靠刷局外貨幣；任何解鎖都不讓分數尺度失控。四把武器從一開始全部可用。

## 機體（Rig）

開局配裝選擇。機體以 `applyRig(player, rigId)` 在 `makeState()` 之後「增量」修改玩家（不整個覆蓋 `player`），定義在 `src/data/rigs.js`。

| id | 名稱 | 數值 | 被動 | 解鎖 |
| --- | --- | --- | --- | --- |
| `scrapper` | SCRAPPER | 與現況相同：HP 100、速 235、衝刺 140、重抽幣 1 | 無 | 預設 |
| `strider` | STRIDER | HP 80、速 265、衝刺冷卻 ×0.85、重抽幣 1 | Just Dash 過熱 2 秒就歸零（原 3 秒） | 累計 Just Dash 25 次 |
| `bulwark` | BULWARK | HP 140、速 210、衝刺距離 110、受傷 ×0.9、重抽幣 1 | 維修球回復 +6 | 抵達第 10 波 |
| `salvager` | SALVAGER | HP 100、速 230、磁吸 +80、XP ×1.1、重抽幣 2 | 補給箱掉率 ×1.5 | 累計完成 15 個合約 |

- `scrapper` 必須讓所有既有自檢在不呼叫 `applyRig` 或呼叫 `applyRig(p, 'scrapper')` 時都通過。

## Dust Heat

撤離通關後解鎖下一級（Heat 0 撤離 → 解鎖 Heat 1，以此類推，最高 5）。效果累加：

| Heat | 新增效果 |
| --- | --- |
| 1 | 敵人 HP +10% |
| 2 | 精英詞綴從第 3 波起出現；精英機率 +3% |
| 3 | 維修球回復 18 → 12 |
| 4 | 風暴持續 8 秒；敵彈速度 +15% |
| 5 | 首領階段門檻提早 10%；開局重抽幣 0 |

- 分數倍率 `1 + 0.15 × Heat`（見 [06](06-skill-scoring-controls.md#計分)）。
- 撤離獎勵 `5000 + 1000 × Heat`。

## 成就

存在本機，在圖鑑頁顯示（見 [08](08-ui-ux.md#圖鑑)）。有獎勵的成就會解鎖機體或 Heat。

| id | 條件 | 獎勵 |
| --- | --- | --- |
| `first-blood` | 完成第一局 | — |
| `titan-fall` | 擊敗 Titan | — |
| `dread-end` | 擊敗 Dreadnought | — |
| `sovereign-down` | 擊敗 Storm Sovereign | — |
| `extracted` | 撤離通關 | 解鎖 Heat 1 |
| `heat-n` | 在 Heat N 撤離（N = 1–5，各一條） | 解鎖 Heat N+1（N=5 無） |
| `wave-10` | 抵達第 10 波 | 解鎖 `bulwark` |
| `dancer` | 累計 Just Dash 25 次 | 解鎖 `strider` |
| `contractor` | 累計完成 15 個合約 | 解鎖 `salvager` |
| `synthesis` | 單局完成 2 個融合 | — |
| `all-fusions` | 累計見過全部 10 個融合 | — |
| `barrel-artist` | 單局油桶連鎖一次爆 3 個 | — |
| `untouchable` | 單局連續 3 波無傷 | — |
| `parts-collector` | 單局摧毀 Titan 兩個零件 | — |
| `overtime-20` | 在無盡中抵達第 20 波 | — |
| `daily` | 完成一次每日挑戰 | — |

成就在結算時檢查；新解鎖在結算畫面以「UNLOCKED」列出。

## 每日挑戰

- 日期鍵是玩家本地日曆的 `YYYY-MM-DD`（`localDateKey`）。種子數字把該日期組成 `YYYYMMDD` 後交給 `seedRun`。每日挑戰固定：機體、主武器、Heat 1、三幕路線、以及 1 個每日規則。
- 每日規則（依種子擇一）：`all-elites-early`（精英從第 2 波起）、`double-storm`（風暴 10 秒）、`scrap-famine`（scrap XP −25%、補給箱 ×2）、`glass-rig`（HP −40%、傷害 +30%）、`chain-reaction`（所有敵人死亡有 30% 機率小爆炸）。
- 亂數分流：`rng('cards')`、`rng('director')`、`rng('spawn')`、`rng('loot')` 各自一條種子流，讓同一天的卡牌提供序列、路線與突變不受戰鬥隨機影響（模擬 `dt` 不固定，所以戰鬥本身不保證完全重現）。
- 每日挑戰與一般模式提交到同一榜單（同一套計分規則）。本機另記每日最佳。
- 每日挑戰不推進 Heat 解鎖，但推進其他成就與累計統計。

## 累計統計

存在 meta：`runs`、`kills`、`justDashes`、`contracts`、`extractions`、`bestWave`、`bossKills`（依首領）、`fusionsSeen`（id 陣列）、`playTimeSec`。在圖鑑頁顯示，作為成就判斷依據。

## 存檔格式

| key | 格式 | 說明 |
| --- | --- | --- |
| `dust-reign:meta:v1` | JSON：`{ v:1, selectedRig, selectedWeapon, selectedHeat, heatUnlocked, unlockedRigs:[], achievements:{ id: isoTime }, stats:{...} }` | 讀取失敗或欄位錯誤時逐欄回退預設，不整個清空 |
| `dust-reign:best-score:v2` | 數字字串 | v0.4.0 起的本機最高分 |
| `dust-reign:daily:v1` | JSON：`{ date, best, runs }` | 日期不同時視為新的一天 |
| `dust-reign:tips:v1` | JSON 陣列 | 已看過的提示 |
| `dust-reign:tips-enabled:v1` | `'true'` / `'false'` | 預設 true |

- 舊最高分（`dust-reign:best-score:v1`、`dustReignBestScore`）不刪除；開始畫面以 `LEGACY BEST` 小字顯示，不與 v2 比較。
- 所有讀寫沿用 `settings.js` 的 try/catch 保護；storage 被拒時一切照常遊玩，只是不保存。
- 不保存任何單局進度或帳號局次。
