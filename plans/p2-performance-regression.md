# P2 工單：後期效能回歸防線與實體移除安全化

> 基準版本：v0.14.0（平衡與計分校準之後）。目標版本：v0.14.1。這是修正與效能工單，不改玩法數值、計分、存檔格式與榜單 ID。
> 開工前依 `AGENTS.md` 重新讀取 Playroom 線上規格。本文件只描述本專案的實作計畫，不重複平台規格。

## 1. 背景

- `PERFORMANCE.md` 的大多數項目已實作，例如 `cachedFrame`、`POSE_SCRATCH`、128-bit hitmask、Titan `partCache`、`cleanupVoice`、`setText` 髒檢查。
  - 例外是 `drawDualOutlineZeroCost`：全專案找不到。
  - `src/render/` 仍有約 160 處 `ctx.save()`，最多的是 `enemies.js` 43、`world.js` 30、`player.js` 21、`overlay.js` 20。
- 專案沒有任何效能量測腳本。v0.11 到 v0.13 加入 Behemoth、Aegis 折射彈、COLOSSUS 貫穿束、流派共鳴特效與 Storm Core，但沒有人在後期高壓場景量過 frame time。
- P1 模擬期間找到一個真實崩潰：
  - 原因：`killEnemy`（`src/systems/combat.js:270`）用 `fastUnorderedRemove` 做 swap-and-pop。連鎖擊殺（爆炸桶、volatile、Spire 共鳴、domino、chain explosion）在倒序迴圈內會讓清單縮短不只一格，游標下一次讀到 `undefined`。
  - 現況：v0.14.0 用 20 處 `if (!enemy) continue;` 止血。這些防護散在 `abilities.js`、`combat.js`、`card-effects.js`、`sim/bullets.js`、`sim/effects.js`、`sim/hazards.js`、`tactical.js`。
  - 問題：止血只防崩潰，不保證每個敵人只被處理一次。被換進來的末端敵人可能被跳過，順序迴圈也可能漏掉。新增連鎖效果時很容易再漏一處。
- 熱路徑仍有 `splice`：
  - `sim/bullets.js:710/929`、`sim/enemy-bullets.js:44`
  - `sim/new-enemies.js:190/270/280/309`
  - `tactical.js:336/352/474/529`
  - `abilities.js:255/533/631/763`

## 2. 目標

1. 建立可重現、可比較的後期壓力量測，讓效能退化在發布前被抓到。
2. 從結構上消除「迴圈中移除敵人」這類錯誤，不再依賴逐點防護。
3. 補完 PERFORMANCE.md 剩餘的高收益項目，並以量測數據證明收益；沒有收益的就不做。

不做：WebGL 或 OffscreenCanvas 改寫、Worker 化模擬、改動畫質預算數值（`src/render/quality.js` 的 budget 只在量測證明必要時才調）。

## 3. 工作項目

### 3.1 效能壓力腳本 `scripts/test-perf-stress.mjs`（新增）

**架構**：沿用 `scripts/test-browser-gameplay.mjs` 的組件，包括靜態伺服器 `createStaticServer`、`CDPClient`、headless Chrome 啟動與 `Runtime.evaluate`。
- 建議先把三者抽到 `scripts/lib/browser-harness.mjs`，兩支腳本共用。
- 抽出時不能改變 `test-browser-gameplay.mjs` 的行為與輸出。
- Chrome 路徑同既有寫法（`C:\Program Files\Google\Chrome\Application\chrome.exe`）。可用環境變數 `CHROME_PATH` 覆寫，雲端環境可改用 `/opt/pw-browsers/chromium`。

**進入場景**：瀏覽器原生 ES module 以 URL 共用實例。頁面載入後在 `Runtime.evaluate` 內 `await import('/src/systems/spawning.js')`、`'/src/systems/director.js'` 等，拿到的就是遊戲正在用的同一份模組。
- 透過 `window.LunaGame.getState()` 設定 `state.wave`。
- 呼叫 `onWaveStart(state)`、`spawnBoss(kind)`、`spawnEnemy()`，直接建出場景，不必真的打 15 波。
- 開局流程參考 `scripts/balance/simulate.mjs` 的 `--start-wave` 實作（約 337–445 行）：清掉開場小兵、套用波次配方、注入等級與選卡。

**固定場景**（每個場景先暖機 3 秒，再量測 20 秒）：

| ID | 內容 | 壓力來源 |
| --- | --- | --- |
| `S1-endless-20` | 無盡第 20 波，敵人補滿上限，skilled 風格自動移動與射擊 | 敵人數、敵彈、粒子 |
| `S2-behemoth` | Behemoth 戰（三部位全在），玩家使用 COLOSSUS 持續蓄力 | 多部位碰撞、貫穿束、酸液迫擊砲 |
| `S3-aegis-refraction` | Aegis 屏障展開，前方敵彈群加友方折射彈，Storm Core 存在 | 子彈對子彈、屏障判定、光暈 |
| `S4-chain-kill` | 密集敵群加爆炸桶與 volatile 精英，觸發連鎖擊殺 | 連鎖移除（同時是 3.2 的回歸測試） |
| `S5-world-open` | `world` 大地圖模式，視口邊緣大量敵人 | 視錐剔除、地形快取、小地圖 |

**輸入模擬**：用 CDP `Input.dispatchMouseEvent` 與 `Input.dispatchKeyEvent` 送出按住射擊與 WASD 繞圈。也可以在頁面內直接寫 `rt.input`，看哪種較穩定，但必須和真人輸入走同一條路徑。

**量測**：
- 在 `requestAnimationFrame` 回呼收集幀間隔，計算 p50、p95、p99、最大值，以及超過 33.4ms 的幀數。
- 用 `performance.mark` 分別量 `update()` 與 `draw()` 的耗時。在 `src/main.js` 的 `frame()` 裡用一個預設關閉的旗標包住，例如 `rt.perfProbe`。關閉時零成本：不分配物件，只多一個布林判斷。
- 用 CDP `HeapProfiler.collectGarbage` 加 `Runtime.getHeapUsage` 記錄量測前後的堆積大小；用 `Performance.getMetrics` 取 `JSHeapUsedSize` 與 `TaskDuration`。
- 每個場景固定 `quality=high`（`setVisualQuality('high')`），排除 auto 降級干擾。另跑一輪 `low` 作對照。
- 固定視窗 1280×720、`deviceScaleFactor=1`，並記錄 CPU 型號。headless 結果只能用來和同一台機器比較，不是絕對指標。

**輸出**：
- `output/perf/<version>-<scenario>.json` 與彙總 `output/perf/<version>-summary.md`。
- 提供 `--compare A B`，輸出各場景 p95 與 update/draw 的差異百分比。

**門檻**：寫在腳本內的 `BUDGET` 常數，數值以首次量測為基準：
- 任一場景的 `update` p95 比基準退化超過 20%，判定失敗。
- `draw` p95 退化超過 20%，判定失敗。
- 任何未處理例外或 console error，判定失敗。
- 堆積淨增加超過 5 MiB 只發警告，不判失敗。

**CI**：先不放進 release workflow，因為 headless 的 GPU 與 CPU 差異太大。把它列入 `RELEASE.md` 的發布前手動驗收清單。

### 3.2 敵人移除安全化（延遲移除）

**做法**：
- `killEnemy` 不再立即 `fastUnorderedRemove`。改成標記 `e.dead = true`，並推入 `rt.state.pendingEnemyRemovals`。這個佇列在 `makeState()` 建立並重用，不在每幀分配新陣列。
- 新增 `flushEnemyRemovals()`，放在 `src/systems/combat.js` 或 `src/core/pools.js`。它對佇列裡每個敵人以 `indexOf` 加 swap-and-pop 移除，然後清空佇列（`length = 0`）。
- `src/systems/update.js` 每個 `step*` 呼叫後執行一次 `flushEnemyRemovals()`；至少要在 `stepBullets`、`stepTactical`、`stepHazards`、`stepEffects` 之後。
- 所有遍歷 `rt.state.enemies` 的地方把 `if (!enemy) continue;` 改成 `if (!enemy || enemy.dead) continue;`。用 codegraph 查 `killEnemy` 與 `rt.state.enemies` 的所有呼叫者，逐一確認。
- `killEnemy` 對已經 `dead` 的敵人直接 return，防止重複計分、重複掉落與重複觸發 hook。這是目前止血版沒有保證的事。

**風險**：
- 繪製、空間網格、索敵（最近敵人、鎖定）都要跳過 `dead`。
- `spatial-grid.js` 是每幀重建，要確認它在 flush 之後才建，或建網格時跳過 `dead`。
- 首領：`rt.state.boss` 參照與 `isBoss` 的勝利判定要在 flush 前就認得 `dead`。

**驗證**：
- `src/dev/checks/enemies.js` 新增斷言：建 30 個敵人與 4 個相鄰爆炸桶，引爆後 `kills` 的增量等於實際移除數，且沒有敵人被計分兩次。
- `S4-chain-kill` 跑 20 秒，沒有例外。
- 用 P1 的 `node scripts/balance-matrix.mjs` 跑一輪 skilled、heat 0、20 局。通關率、首領秒數與分數 p50 對 v0.14.0 的差距應在誤差內（±8 點）。延遲移除會改變處理順序，數字不會逐位相同，但分布不應移動。

### 3.3 熱路徑 `splice` 改為 swap-and-pop

- 對第 1 節列出的位置逐一判斷清單是否需要保序：
  - 敵彈、tactical entities、酸池等無序集合：改用既有的 `fastUnorderedRemove`（`src/core/pools.js`）。
  - `new-enemies.js:309` 的 `marks.splice(0, n)` 是保序裁頭：改成環形緩衝區，或保留 splice 並以量測決定。
- 倒序迴圈內 swap-and-pop 是安全的，換進來的元素已經處理過。順序迴圈要先改成倒序。

### 3.4 渲染：`drawDualOutlineZeroCost` 與 `save/restore` 削減

- 先用 3.1 的 `draw` 分段量測，找出 `save/restore` 最密的熱點，從 `render/enemies.js`、`render/world.js` 開始。
- 實作 `drawDualOutlineZeroCost(ctx, pathFn, outerColor, outerWidth, innerColor, innerWidth)`，放在 `src/render/entity-style.js`。它手動記錄並還原 `lineWidth` 與 `strokeStyle`，不用 `save/restore`。只替換「只改描邊狀態」的呼叫點。有改 transform、clip 或 globalAlpha 的呼叫點保留 `save/restore`。
- 每批替換後重跑 S1、S2、S3。`draw` p95 沒有改善超過 5% 的批次就回退，避免沒有收益的改寫。
- 視覺不能變：用 `scripts/capture-contrast-showcase.mjs` 在替換前後各截一次圖，人工比對高對比模式與一般模式。

## 4. 修改檔案

- 新增：`scripts/test-perf-stress.mjs`、`scripts/lib/browser-harness.mjs`
- 修改：`scripts/test-browser-gameplay.mjs`（只改為引用共用 harness）
- 修改：`src/main.js`（perf probe 旗標）
- 修改：`src/systems/combat.js`、`src/systems/update.js`、`src/core/state.js`（延遲移除）
- 修改：所有遍歷 `rt.state.enemies` 並可能觸發擊殺的模組，以第 1 節列出的 7 個檔案為主
- 修改：第 1 節列出的 `splice` 位置
- 修改：`src/render/entity-style.js`、`src/render/enemies.js`、`src/render/world.js`（3.4，依量測結果決定範圍）
- 修改：`src/dev/checks/enemies.js`（新斷言）
- 文件：`PERFORMANCE.md` 的基準表改為實測數字，並標註量測環境；`ARCHITECTURE.md` 補上延遲移除契約，寫在模擬管線段落；`CHANGELOG.md` 加 V0.14.1；`game.json` 改 0.14.1。

## 5. 驗收

1. `node --check` 所有修改檔，`node scripts/self-check.mjs` 通過，全部 `scripts/test-*.mjs` exit 0。
2. `scripts/test-perf-stress.mjs` 五個場景都通過，並附 v0.14.0 對 v0.14.1 的 compare 報表。任一場景 p95 不得退化。
3. balance-matrix 抽樣的分布與 v0.14.0 一致（第 3.2 節）。
4. 用 Playroom tools 1.2.0 在 repo 外的暫存目錄執行 pack 與 validate。
5. 真人實機至少玩一局到第 10 波，刻意引爆桶群並使用 COLOSSUS；用 DevTools Performance 錄 30 秒，確認沒有長任務超過 50ms。
6. 不 push、不打 tag、不發布，除非使用者明確授權。

## 6. 並行界線

可以和 P3 並行。P2 不碰 `src/ui/`、`css/`、`src/core/i18n.js`。唯一可能的交集是 `src/main.js`，P3 不需要改它。若兩邊都要改 `game.json` 或 `CHANGELOG.md`，由最後合併的一方統一處理版本號。
