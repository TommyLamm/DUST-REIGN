# 03 構築與武器

[返回索引](README.md)

## 主武器承諾

- 開局配裝選一把主武器（`standard` / `breacher` / `vanguard` / `arc-welder`）。四把從第一次遊玩就全部可選，不做武器解鎖，避免拿走既有內容。
- 局內不再能隨時切換：移除 `T` 鍵循環與暫停 BUILD 頁的切換按鈕（BUILD 頁改為只讀）。手把對應按鍵同步移除。
- 只有幕間「軍械庫」可以換主武器，換槍時保留全部卡牌與 Mastery 等級歸零。
- `cycleWeaponMode` / 指定模式的函式保留（軍械庫與自檢使用）；只是輸入不再呼叫它。

### Weapon Mastery

每把武器 0–3 級，來源：幕間軍械庫「強化」、武器專屬卡的附帶效果（見下）。等級存在 `player.mastery`（數字），換槍歸零。

| 武器 | M1 | M2 | M3 |
| --- | --- | --- | --- |
| `standard` | 每第 4 發穿透 +1 | 雙管：每次射擊 2 發平行彈，各 70% 傷害 | 暴擊彈命中後反彈一次到 160px 內最近敵人 |
| `breacher` | 彈丸 5 → 7 | 120px 內命中 +40% 傷害 | 彈丸命中附 0.4 秒緩速（×0.7） |
| `vanguard` | 蓄力 0.6 → 0.45 秒 | 彈道留下 1 秒焦痕線，每 0.25 秒 20% 傷害 | 滿蓄射擊在彈道終點 90px 爆炸（60% 傷害） |
| `arc-welder` | 連鎖目標 2 → 3 | 連鎖距離 110 → 150 | 每 30 次命中釋放 70px 小型 EMP（不耗電、暈 0.6 秒） |

## 卡牌系統

### 稀有度

| 稀有度 | 顏色 | 基礎權重 | 說明 |
| --- | --- | --- | --- |
| `common` | 骨白 | 70 | 可疊數值卡 |
| `rare` | 冷藍 | 25 | 單次機制卡、武器專屬卡 |
| `prototype` | 金 | 5 | 規則改變型 |

- 每過一幕：`rare +5`、`prototype +2`（從 `common` 扣）。
- 融合卡不參與稀有度抽取，維持「可合成時保證出現 1 張」的既有規則。

### 疊層上限

可疊卡加上限，達上限後離開牌池（目前 8 張可疊卡無上限，牌池永遠被它們稀釋）。

| 卡 | 上限 |
| --- | --- |
| `rapid-fire` | 5 |
| `scatter-shot` | 6 |
| `heavy-plating` | 4 |
| `overdrive-injector` | 3 |
| `magnet-core` | 3 |
| `hot-load` | 4 |
| `rail-slug` | 3 |
| `ricochet` | 3 |

卡面顯示目前層數（例如 `2/5`）。

### 重抽、放逐、跳過

| 動作 | 來源 | 效果 |
| --- | --- | --- |
| REROLL | 重抽幣：開局 1 枚（機體可加）；擊殺首領 +1；合約獎勵可選；軍械庫「修理」附 +1 | 消耗 1 枚，3 張全部重抽（仍保證融合規則） |
| BANISH | 每幕 1 次，進入幕間時重置為 1（不累積） | 本局把 1 張卡移出牌池，並立刻補 1 張新卡 |
| SKIP | 永遠可用 | 不拿卡，回 10 HP 並 +100 分 |

重抽幣存在 `rt.state.rerolls`，放逐次數 `rt.state.banishes`，被放逐的卡 id 存 `rt.state.banished`（陣列）。

### 抽牌規則（取代 `randomUpgradeChoices`）

1. 可合成融合時保證 1 張融合（既有規則）。
2. 其餘依稀有度權重抽，排除已達上限、已拿過的單次卡、被放逐的卡、與目前武器不符的武器專屬卡。
3. 保證至少 1 張「攻擊性」卡（`OFFENSE` 或 `WEAPON`）；牌池不足時才放寬。
4. 同一輪不重複。
5. 若某張卡會完成融合配方，卡面顯示 `COMPLETES: <FUSION NAME>`。

### XP 曲線

讓構築更早成形：初始門檻 100 → 80；成長 `round(xpNext*1.24+28)` → `round(xpNext*1.22+24)`。拿到第 6 張卡所需 XP 由約 1677 降到約 1324（約 −21%），第一次 Titan 前通常可以有 1 個融合。

## 新卡（14 張）

類別新增 `MOBILITY` 與 `WEAPON`。

| id | 類別 | 稀有度 | 上限 | 效果 |
| --- | --- | --- | --- | --- |
| `servo-legs` | MOBILITY | common | 3 | 移速 +8% |
| `dash-capacitor` | MOBILITY | rare | 1 | 衝刺 2 段充能（每段獨立冷卻） |
| `ablative-mesh` | DEFENSE | common | 3 | 受到傷害 ×0.92（乘算，最少 1） |
| `salvage-protocol` | DEFENSE | common | 2 | 非蠻牛擊殺掉維修機率 +6% |
| `capacitor-bank` | TACTICAL | common | 2 | 電池上限 +25，回能 +0.5/秒 |
| `emp-amplifier` | TACTICAL | rare | 1 | EMP 半徑 +40，耗能 50 → 40 |
| `hollow-point` | OFFENSE | rare | 1 | 對 HP < 30% 的敵人 +35% 傷害 |
| `afterburner` | MOBILITY | rare | 1 | 衝刺後 1 秒內射擊冷卻 ×0.7 |
| `tracer-rounds` | WEAPON（standard） | rare | 1 | 每第 5 發穿透 +2 且必暴；並 Mastery +1 |
| `flechette-pack` | WEAPON（breacher） | rare | 1 | 彈丸 +2、散布 −10%；並 Mastery +1 |
| `capacitor-rail` | WEAPON（vanguard） | rare | 1 | 蓄力時間 −25%、滿蓄傷害 +20%；並 Mastery +1 |
| `arc-lattice` | WEAPON（arc-welder） | rare | 1 | 連鎖 +1 目標、連鎖傷害 70% → 80%；並 Mastery +1 |
| `phoenix-core` | DEFENSE | prototype | 1 | 第一次致命傷改為以 40% HP 復活、2 秒無敵、原地 EMP（不耗電）；用完移除 |
| `scrap-singularity` | TACTICAL | prototype | 1 | 每收集 40 顆 scrap，在玩家前方 120px 生成 1.5 秒小渦流（拉敵人，不拉首領） |

- 武器專屬卡附帶的 Mastery +1 不超過 3。
- 換槍後，舊武器的專屬卡效果失效但保留在已取得清單（構築頁顯示 `INACTIVE`）；新武器的專屬卡進入牌池。

## 新融合（4 個）

既有 6 個融合的前置互不重疊；新融合也只用新卡，彼此不重疊。

| id | 前置 | 效果 |
| --- | --- | --- |
| `kinetic-ballet` | `dash-capacitor` + `afterburner` | 每次衝刺落點朝最近 3 名敵人發射追蹤微型飛彈（各 `damage*0.9`） |
| `fortress-protocol` | `ablative-mesh` + `capacitor-bank` | 電池 ≥ 50 時受傷 ×0.75；放 EMP 時獲得 2 秒、可吸收 30 傷的護盾 |
| `executioner` | `hollow-point` + `emp-amplifier` | 被 EMP 暈住的敵人受傷 +50%；非首領 HP < 15% 時被命中即處決 |
| `storm-rider` | `servo-legs` + `salvage-protocol` | 風暴中移速 +20%、玩家彈吃風 ×3；風暴中每次擊殺回 1 HP |

融合總數 6 → 10；構築頁的融合計數與 `is-locked` / `is-ready` / `is-unlocked` 狀態沿用。

## 需要同步更新的自檢

- 「沒有前置時 3 張都不是 FUSION」「有特斯拉 + 衝擊波時必含 `static-tempest` 與 1 張 OFFENSE」：保留，OFFENSE 判斷改為 OFFENSE 或 WEAPON。
- 「融合正好 6 張」→「融合正好 10 張，每張 2 個存在於 `UPGRADES` 的前置，前置兩兩不重疊」。
- 武器循環自檢保留（函式仍存在）；新增「局內輸入 `T` 不改變武器」。
- 構築頁文案（破城 `2.3 RPS (x5)` 等）在 Mastery 0 時維持原字串。
