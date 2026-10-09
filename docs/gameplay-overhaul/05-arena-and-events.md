# 05 戰場與事件

[返回索引](README.md)

## 波次突變（Mutator）

由導演在每波開始時決定，HUD 與波次橫幅顯示名稱與一句說明。

- 第 4 波必定出現第一個突變（教學）。
- 之後的非首領波：第 2 幕 60%、第 3 幕 80%、無盡 100% 出現。
- 首領波不出突變。同一突變不連續兩波。

| id | 名稱 | 效果 | 補償 |
| --- | --- | --- | --- |
| `swarm` | SWARM TIDE | 生成間隔 ×0.6；敵人 HP ×0.7；爬蟲與 Scurrier 權重 ×2 | 擊殺分數 ×1.1 |
| `elite-convoy` | ELITE CONVOY | 精英機率 ×2.5；敵人上限 ×0.7 | 精英掉補給箱機率 15% → 40% |
| `scrap-rain` | SCRAP RAIN | 每 3 秒有 1 個隕落點（0.8 秒陰影預警，r 34）：命中 12 傷，落地留下 4 顆 scrap | — |
| `barrage` | ARTILLERY BARRAGE | 每 5 秒場外砲擊：玩家附近 3 個預警圈（1.2 秒、r 46），沿用既有熔岩規則 | 每波結束 +200 分 |
| `dust-devils` | DUST DEVILS | 2 個沙捲在場上遊走（r 60），弱拉力 40 px/s 影響玩家與敵人，穿過的玩家子彈偏轉 15° | — |
| `overcharged` | OVERCHARGED | 所有敵人速度 ×1.2 | 玩家回能 ×2 |

- 突變只改導演配方與對應 sim 步驟，不改敵人資料表。
- Reduced Motion：沙捲與隕落預警改為靜態圈；高對比：預警圈使用高對比色。

## 合約（Contract）

第 3 波起的非首領波各有 1 個可選合約，波次開始時顯示在 HUD（見 [08](08-ui-ux.md#合約-hud)）。合約內容與獎勵在開波時就公開；完成時立即發放，不暫停。

| id | 條件（該波內） | 解鎖 |
| --- | --- | --- |
| `barrel-kills` | 用油桶或核心爆炸擊殺 4 名敵人 | 第 3 波 |
| `no-damage` | 連續 20 秒未受傷 | 第 3 波 |
| `graze` | 擦彈 12 次 | 第 4 波 |
| `just-dash` | Just Dash 3 次 | 第 4 波 |
| `combo` | 連殺達到 x8 | 第 6 波 |
| `elite-hunt` | 擊殺 2 名精英（僅在 `eliteChance >= 0.06` 的波次出現） | 第 6 波 |
| `spire-chain` | 一次尖塔共鳴命中 5 名以上敵人 | 第 6 波 |

獎勵（開波時以 `rng()` 從三者擇一並公開）：

- `+1` 重抽幣
- 修理 25 HP（滿血時改為 +150 分）
- `300 × 幕` 分數

統計：`state.stats.contractsCompleted` 計入結算與成就。

## 補給箱（Supply Crate）

- 一種新的掉落物（`orb.type = 'crate'`），落地即顯示內容圖示，玩家走過自動拾取。
- 內容（以 `rng()` 決定，掉落時固定）：修理 30 / 電池 +50 / 重抽幣 +1 / Overdrive 4 秒。
- 來源：精英擊殺 15%（`elite-convoy` 時 40%）、裝甲運輸車、`phoenix-core` 不掉。
- 補給箱不受磁吸（必須走過去），20 秒後消失（最後 3 秒閃爍；Reduced Motion 改為漸淡）。

## 裝甲運輸車（`convoy` 路線）

- 每波 8–14 秒之間從場地一側駛入，沿直線以 70 px/s 穿越，25 秒後駛離。
- HP `400 × hpScale`、r 26；子彈傷害 ×0.5，爆炸（桶、核心、Scurrier 敵爆）全額。不攻擊、不算敵人上限、不參與連殺。
- 擊毀：掉 1 個補給箱 + 150 分；逃走則無獎勵。

## 既有物件的調整

- **油桶連鎖**：油桶爆炸範圍內的其他油桶在 0.2 秒後連鎖爆炸（每個桶只爆一次）。既有「子彈打爆桶並殺死旁邊爬蟲」自檢不受影響。
- **核心**：每波 1 顆（不變）；`convoy` 與 `ironfield` 路線不改核心。
- **尖塔**：`static` 路線每波多 1 座；第 15 波首領戰固定 2 座，讓「EMP 尖塔暈 Sovereign」可行。
- 每波開始重刷物件的時機與現況相同（過波清空核心與桶）。

## 區段視覺

區段（`dusk` / `rust` / `night`）改由導演決定並寫入 `rt.state.sector`：第 1 幕 `dusk`；第 2、3 幕依路線對應（`scorched`、`convoy` → `rust`；`static`、`blackout`、`stormwall` → `night`；`ironfield` → `dusk`）。`palette.js` 的 `sectorForWave` 改讀 `rt.state.sector`，無此欄位時回退舊的波次循環。
