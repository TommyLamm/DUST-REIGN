# P3 工單：系統過載的引導與可讀性

> 基準版本：v0.14.0。目標版本：v0.15.0。這是新增介面與提示的工單，不改計分算式、評級門檻、存檔格式與榜單 ID。
> 開工前依 `AGENTS.md` 重新讀取 Playroom 線上規格。`devices` 仍只宣告 `desktop`；本工單不恢復觸控。

## 1. 背景

v0.11 到 v0.13 疊加的系統，玩家在一局內必須自己理解：
- 流派共鳴：4 種流派，2/4/6 層三階
- 合約加注：H 鍵或手把 Y，只能在波次前 12 秒使用；目標 +50%、獎勵 ×3，失敗扣 25% 生命
- 工坊超頻：3 級，每級 250 scrap
- 升級面板的重抽、放逐（兩段確認）與跳過
- 連殺上限 35、無傷連波倍率、Heat、路線與突變
- COLOSSUS 蓄力：輕觸是電漿彈，長按 0.85 秒才是貫穿束，蓄力時減速 35%
- Aegis 屏障的折射增幅

目前的提示系統（`src/ui/tips.js`，`scanTriggers` 第 58–75 行）只涵蓋 10 個 v0.4 時代的主題：`move-shoot`、`dash`、`just-dash`、`graze`、`barrel`、`emp`、`core-boss`、`contract`、`mutator`、`fusion`、`route`。上面列的新系統都沒有提示。

P1 數據也支持需要引導：
- 合約加注若「每次都加注」，只有 23–30% 能完成，每次失敗扣 25% 生命，standard heat 2 的通關率從 100% 掉到 80%。「挑選加注」則有 91–99% 完成。新手很可能落入前者。
- COLOSSUS 在只輕觸時通關率 85%，只蓄力時 40%。玩家需要知道何時該蓄力。
- 共鳴幾乎都集中在 kinetic，代表玩家（和 bot）未必理解其他流派的價值。

現有可重用的東西：
- 提示佇列：`offer(id)`、`markSeen`、4 秒顯示、20 秒間隔。已看過的提示存在 `dust-reign:tips:v1`，開關存在 `dust-reign:tips-enabled:v1`，暫停選單有「重設提示」。
- 文案：`tTip(id, kind)` 在 `src/core/i18n.js` 約 1029 行，同時提供鍵盤與手把版本。
- HUD 共鳴 pill：`index.html` 94–112 行的 `.resonance-pill[data-archetype][data-tier]`，由 `src/ui/hud.js` 約 196 行同步。
- 合約追蹤器：`#contractTracker`，由 `src/ui/contracts-hud.js` 處理，含 `doubleDownCurrentContract()`。
- 結算分數明細：`src/ui/hud.js` 417 行起的 `breakdownBuckets` 已經存在，分為擊殺+賞金、波次+無傷、首領、風格、合約、撤離六格。
- 升級面板的放逐狀態：`src/ui/upgrade-panel.js`，`banishPicking`。

## 2. 目標

1. 每個 v0.11 之後加入的系統，在玩家第一次遇到時都有一則情境提示，並說明「怎麼用」和「何時值得用」。
2. 玩家在戰鬥中看得出目前分數倍率的來源。
3. 結算畫面讓玩家看懂這局分數從哪裡來，以及離下一個評級還差多少（門檻已在 v0.14.0 改為 B 75000 / A 225000 / S 550000 / SSS 700000）。
4. 不增加戰鬥畫面的遮擋。所有新元素都遵守減動效與高對比設定。

不做：互動式教學關卡、強制教學、語音；不改任何系統的數值。

## 3. 工作項目

### 3.1 新增情境提示（`src/ui/tips.js`、`src/core/i18n.js`）

在 `scanTriggers()` 加入以下觸發。每則都要在 `tTip` 中提供 EN 與繁中文案，並依 `inputKind()` 區分鍵盤和手把：

| 提示 ID | 觸發條件 | 文案重點 |
| --- | --- | --- |
| `resonance` | 玩家首次持有某流派 2 張卡（`p.resonances[arch] >= 2`） | 同流派湊 2/4/6 張會升階；HUD 左上的 pill 顯示目前層數 |
| `resonance-tier` | 首次達到任一流派第 2 階（4 張） | 第 3 階需要 6 張；告知該流派第 3 階的效果名稱 |
| `double-down` | 首次出現可加注的合約，且在波次前 12 秒窗口內 | 按 H（手把 Y）加注：目標 +50%、獎勵 ×3，失敗扣 25% 生命；生命高、合約簡單時才加注 |
| `colossus-charge` | 開局主武器是 `colossus`，開火後 3 秒 | 輕觸是電漿彈；長按蓄滿是貫穿束，適合首領和密集敵群；蓄力會減速 |
| `aegis` | 首次部署 `aegis-barrier` | 屏障擋住正面敵彈；自己的子彈穿過屏障會被增幅 |
| `banish` | 首次開啟升級面板，且本局還有放逐次數 | R 重抽、B 放逐（之後不再出現）、X 跳過 |
| `storm-core` | 首次出現 Storm Core | 簡述效果與對應操作。開工時先讀 `src/systems/` 中 storm core 的實作，以實際行為為準 |
| `flawless` | 首次以無傷完成一波 | 連續無傷會疊加波次獎勵倍率（上限 5 倍） |

**規則**：
- 沿用 `offer()` 的去重與持久化，不新增 localStorage 鍵。新 ID 會寫入既有的 `dust-reign:tips:v1` 陣列。舊存檔沒有這些 ID，所以會自然顯示一次。
- 升級面板開著時不能在戰場上顯示提示，否則會被面板遮住或干擾選卡。`banish` 提示要放在升級面板內：在面板底部顯示一行說明，而不是用 toast。
- 一波內最多顯示 2 則新提示，避免新手被資訊淹沒。需要在 `tips.js` 加每波計數，由 `onWaveStart` 時機重置。實作時用現有的波次變化偵測，不另外掛新事件。
- 自訂關卡（campaign、hardcore）的開場簡報已有說明時，不重複提示同一主題。

### 3.2 HUD 倍率來源晶片（`src/ui/hud.js`、`index.html`、`css/hud.css`）

- 在分數旁新增一個緊湊的倍率區 `#scoreMultChips`，只在倍率不等於 1 時顯示對應晶片：
  - `COMBO ×n`：目前連殺的擊殺分倍率，計算式同 `killEnemy` 的 `1 + (combo - 1) * 0.25`。從 `src/systems/combat.js` 匯出一個純函式重用，避免公式寫兩份。
  - `FLAWLESS n`：無傷連波數。
  - `HEAT ×m`、`ROUTE ×m`：讀 `src/systems/scoring.js` 既有的 route、heat 倍率函式。
  - `DOUBLE-DOWN`：本波已加注時顯示，失敗風險用警示色。
- 用既有的 `setText` 髒檢查，數值沒變就不寫 DOM。
- 晶片有 `title` 與 `aria-label`，切換語言時更新，接到 `onLanguageChange`。
- 高對比模式：晶片使用實心底與白字。減動效模式：不做數值跳動動畫。

### 3.3 結算面板：評級進度（`src/ui/hud.js`、`src/ui/game-over.js`）

- 在既有分數明細下方加一條「下一評級」進度列：顯示目前評級、下一個評級和差距分數，例如「A → S：還差 182,400」。
  - 門檻要從 `src/systems/scoring.js` 匯出常數讀取，不能在 UI 寫死數字。必要時新增 `export var RANK_THRESHOLDS`，`rankResult` 也改成讀它。
- 撤離與 S+、SSS 的條件（撤離、Heat）不是分數，用一行條件說明，例如「SSS 需撤離且 Heat ≥ 3」。
- 分數明細的六格加上 hover 或 focus 說明，指出每格包含哪些來源（對應 `breakdownBuckets` 的分組）。

### 3.4 COLOSSUS 蓄力讀數（`src/render/player.js` 或 `src/render/overlay.js`）

- 蓄力時在玩家周圍畫一圈進度弧，蓄滿時閃一次並播放提示音（`AudioFX` 既有的事件）。
- 先查有沒有現成的蓄力視覺；有的話只補「蓄滿」的明確訊號。

### 3.5 圖鑑補完（`src/ui/codex-panel.js`）

確認 CODEX 有收錄共鳴四流派各階效果、合約加注規則、工坊超頻、COLOSSUS 與 Aegis。缺的就補上，文案與提示一致，並提供雙語。

## 4. 修改檔案

- `src/ui/tips.js`、`src/core/i18n.js`（提示與文案）
- `src/ui/upgrade-panel.js`（放逐說明列）
- `src/ui/hud.js`、`src/ui/game-over.js`、`index.html`、`css/hud.css`，必要時加 `css/high-contrast.css`、`css/animations.css`
- `src/systems/scoring.js`（匯出門檻與倍率查詢，不改數值）、`src/systems/combat.js`（匯出連殺倍率純函式）
- `src/render/player.js` 或 `src/render/overlay.js`（蓄力讀數）
- `src/ui/codex-panel.js`
- `src/dev/checks/`：新增斷言，確認新提示 ID 都有雙語文案、門檻常數與 `rankResult` 一致、倍率晶片在 combo=1 時隱藏
- `scripts/test-i18n-verification.mjs`：把新文案納入檢查
- 文件：`docs/gameplay-overhaul/08-ui-ux.md` 補新 UI；`game.json` 的 `instructions` 視需要補一句提示可在暫停選單關閉（總長仍要 ≤ 2000 字）；`CHANGELOG.md` 加 V0.15.0；`game.json` 改 0.15.0。

## 5. 驗收

1. `node --check`、`node scripts/self-check.mjs` 與全部 `scripts/test-*.mjs` 通過。
2. 在瀏覽器實機清除 `dust-reign:tips:v1` 後開新局：
   - 每則新提示都在正確時機出現一次，再開一局不再出現。
   - 關閉提示後完全不出現；「重設提示」後恢復。
   - 一波最多 2 則。
3. 中英文切換時，提示、倍率晶片與結算進度列都正確更新。
4. 高對比與減動效模式下截圖檢查可讀性與遮擋。可沿用 `scripts/capture-contrast-showcase.mjs`。
5. 手把操作時提示顯示手把按鍵。
6. 計分不變：`node scripts/balance-matrix.mjs` 抽樣 skilled、heat 0、20 局，分數逐局與 v0.14.0 相同，因為本工單不碰模擬。
7. 用 tools 1.2.0 在 repo 外執行 pack 與 validate；在跨來源 sandbox iframe 實測開始、遊玩、結算、重開。
8. 不 push、不打 tag、不發布，除非使用者明確授權。

## 6. 並行界線

可以和 P2 並行。P3 不碰 `src/systems/sim/`、`src/systems/update.js`、`src/main.js`，也不動 `combat.js` 的 `killEnemy` 本體，只在檔案中新增一個匯出的純函式。若 P2 同時在改 `combat.js`，這個函式改放到 `src/systems/scoring.js`，避開衝突。
