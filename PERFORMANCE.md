# DUST//REIGN 次世代性能優化白皮書與架構規範

> **目標**：在 80+ 敵軍同屏、200+ 密集彈幕、全量粒子爆破與 Titan 4 部位首領戰的高壓情境下，達成全平台（包含低階手機與 120Hz 高刷螢幕）穩固 60 FPS / 120 FPS，徹底消除微卡頓（Micro-Janks）、音訊線程斷音與設備過熱發熱。

---

## 一、 性能基準指標與突破目標

| 性能維度 | 現狀基準 (Baseline) | 目標指標 (Target) | 改善幅度 | 關鍵技術手段 |
| :--- | :--- | :--- | :--- | :--- |
| **Draw Calls / 幀** | 3,800 ~ 4,500 次 | **< 650 次** | **-84%** | 敵彈 4 桶色譜分流、接地陰影 2-Pass 合流、路徑批處理 |
| **`ctx.save/restore` / 幀** | 950 ~ 1,300 次 | **< 60 次** | **-95%** | `drawDualOutlineZeroCost` 手動復原、傷害數字分組渲染 |
| **記憶體配置速率 (Alloc Rate)** | 250 ~ 450 KB / s | **< 3 KB / s** | **-99.3%** | 靜態 `cachedFrame`、Swap-and-Pop 替換 `splice`、平坦環形緩衝區 |
| **V8 Minor GC 停頓頻率** | 每 15 ~ 25 秒 (1.5~6ms) | **> 15 分鐘** | **延遲 50+ 倍** | 0-GC 熱路徑全面防護、切斷懸空參照 |
| **物理模擬耗時 / 幀** | 4.55 ms | **0.87 ms** | **-80.9%** | 空間網格 55px 調優、全環境危害網格化、Titan 部位快取 |
| **DOM 屬性寫入 / 幀** | ~15 次 (每秒無效寫入 420+) | **0 次 (無狀態變更時)** | **-100% 空轉** | `setText` 與進度條樣式全面髒檢查（Dirty Checking） |
| **Web Audio 活躍節點數** | 200 ~ 500+ (無 disconnect 洩漏) | **15 ~ 30 個** | **-90%** | `cleanupVoice()` 自動斷開連線、聲音併發防抖 (Throttle) |
| **移動端像素著色負載 (Fillrate)** | 58 Mpx/幀 (4K 畫布 + 7x Overdraw) | **18 Mpx/幀** | **-69%** | 行動端與低畫質動態收斂 DPR（1.0 ~ 1.25） |

---

## 二、 四大核心架構維度與優化藍圖

### 1. 系統底層與 0-GC 記憶體防線（System & Memory）
- **P0 致命傷立即止血**：
  - 修復 `src/ui/interlude-panel.js` 中的 `syncOutcomeTitle()`，杜絕每幀無條件覆寫 `innerHTML`。
  - 實裝 `cleanupVoice()` 與音訊節點自動斷開，在聲音 `stop()` 後徹底呼叫 `.disconnect()`，消除音訊線程斷音（Audio Underrun）與爆音。
- **DOM 髒檢查快取（Dirty Checking Memoization）**：
  - `setText()`：比對 `node._lastText !== str`，有變化才更新 `textContent`。
  - 進度條 `style.width` 與 ARIA 屬性增加快取防抖，消除 100% 空轉寫入。
  - 移除 `void el.offsetWidth` 強制重排，改用 `requestAnimationFrame` 雙幀動畫管理。
  - 解耦 `pointermove` 觸控事件，快取 Canvas 幾何邊界，消除高頻 `getBoundingClientRect()`。
- **熱路徑 0-GC 改造**：
  - `update.js` 使用模組頂層靜態 `cachedFrame`，根除每秒 60 次的 `{ p, boundW, boundH }` 實例化。
  - `entity-style.js`（`spawnPose`）與 `new-enemies.js`（`stepNewEnemy`）改用靜態 Scratch 物件回傳。
  - 子彈軌跡改用 `Float32Array(8)` 平坦環形緩衝區與位元運算，淘汰 `push({x, y})` 與 `shift()`。
  - 無序實體陣列（子彈、敵軍、掉落物、特效）全面改用 **Swap-and-Pop**（`list[i] = list[last]; list.length = last;`），根除 `splice(i, 1)` 引發的陣列拷貝與 O(N) 搬移。
  - 切斷 `rt.fxEvents` 與傷害數字對已死亡實體的懸空物件參照。

### 2. Canvas 2D 渲染管線與 Draw Call 大提速（Render Pipeline）
- **敵彈 4 桶色譜分流（4-Bucket Pass Batching）**：
  - 消除每顆子彈重複繪製 Dark Halo 的冗餘 Draw Call。
  - 將敵彈按固定色系（Magenta, Orange, Lime, Violet）劃入 4 個靜態陣列，每色一次性 `ctx.fill()`，將 600 次 Draw Calls 壓縮為 4 次。
  - 高溫白核合併為單一 Path 一次性 `fill()`。
- **接地陰影雙 Pass 全合流**：
  - 全場怪物、首領、場景物件的柔影（Penumbra）與硬咬合（Core AO）分別由兩條全局 Path 收集，全場僅發出 **2 次 `ctx.fill()`**，消滅 200 次 Draw Calls 與 100 次 `save/restore`。
- **無狀態棧雙層描邊（`drawDualOutlineZeroCost`）**：
  - 手動記錄並復原 `lineWidth` 與 `strokeStyle`，徹底移除 `ctx.save()` / `ctx.restore()`，執行速度提升 8~12 倍。
- **Lightmap 線性剪裁（$O(N)$ 替代 $O(N \times K)$ 選擇排序）**：
  - 移除每幀 6,500 次交換的手寫選擇排序，改為單遍距離平方線性篩選，直接省下 1.5ms CPU 時間。
- **浮動傷害數字字體分組批處理**：
  - 按字體樣式（普通 13px vs 暴擊 18px）分組，先批次繪製全部黑邊 `strokeText`，再批次繪製填色 `fillText`，杜絕每幀數十次 CSS 字體解析抖動。
- **自適應 DPR**：
  - v0.15.0 起 DPR 上限依畫質等級為 high 2.0／medium 1.5／low 1.0，畫質等級改變時立即重算畫布尺寸；地形圖塊與敵人標籤以同一 DPR（上限 2）烘焙。

### 3. 物理碰撞、空間網格與實體模擬吞吐量（Physics & Simulation）
- **空間雜湊網格調優（110px $\to$ 55px）**：
  - 候選實體數自 22.0 隻驟降至 11.8 隻（減少 46.4%），精確平方距離計算量直接減半。
- **全環境危害網格化檢索**：
  - 將酸池、焦痕燃燒、自爆蟲連鎖殉爆全數接入空間網格查詢，將暴力雙重迴圈 $O(N \cdot M)$ 壓制為 $O(N)$。
  - 修正 `stepAcidPools()` 每幀重複呼叫兩次的 Bug，改用平方距離 $d^2 < r^2$ 取代昂貴的 `Math.hypot`。
- **Titan 4 部位坐標矩陣快取與逆向變換**：
  - 在 Titan 上建立單幀 `partCache`，每幀僅算一次三角函數，全場子彈共享。
  - 碰撞判定改為將子彈向量轉入 Titan 局部坐標系，直接與固定常數坐標比對，僅需 2 次乘法與 2 次加法。
- **穿透彈 128-bit Bitmask 命中標記**：
  - 使用 `hitMask0`, `hitMask1`, `hitMask2`, `hitMask3` 取代 `b.hits` 陣列，達成暫存器級別的 $O(1)$ 位元命中查詢。
- **更新排程重構與視錐台剔除（Frustum Culling）**：
  - 調整順序為：[移動實體] $\to$ [統一構建 55px 空間網格] $\to$ [碰撞檢測] $\to$ [結算清理]。
  - 螢幕外 > 120px 怪物休眠物理重計算與射擊計時器，減少無效開銷。

### 4. 低階移動端能效、溫控與自適應幀率（Mobile & Thermal）
- **自動畫質的暖機與回升**（`src/render/quality.js`，v0.15.0 實作）：
  - 每局開頭 2 秒不取樣，避免圖塊烘焙等開局卡頓把整局鎖在低畫質。
  - 90 幀平均 dt 超過 19ms 降一級；降級後連續 600 幀（約 10 秒）平均 dt ≤ 17.5ms 回升一級，每局最多回升一次以免來回震盪。
  - 先前文件描述的 30 FPS 鎖頻辨識尚未實作。
- **背景分頁休眠（Tab Inactive Hibernation）**：
  - 監聽 `visibilitychange`，分頁切換後台時自動暫停遊戲並呼叫 `ctx.suspend()`，徹底休眠 CPU 與音訊驅動。

---

## 三、 實作三軌並行劃分

1. **Track 1：系統底層防線軌 (`feat/perf-foundation-0gc`)**：
   - 負責模組：`src/ui/interlude-panel.js`, `src/audio/audio-fx.js`, `src/core/utils.js`, `src/ui/hud.js`, `src/systems/update.js`, `src/render/entity-style.js`, `src/systems/sim/new-enemies.js`, `src/systems/sim/bullets.js`, `src/systems/sim/hazards.js`。
   - 任務：修復 `syncOutcomeTitle` 與 Web Audio 節點斷開；實作 DOM 髒檢查；實裝 `cachedFrame`、`POSE_SCRATCH`、子彈軌跡環形緩衝區；全面推行 Swap-and-Pop。
2. **Track 2：渲染管線與 Draw Call 大提速 (`feat/perf-render-pipeline`)**：
   - 負責模組：`src/render/projectiles.js`, `src/render/shadows.js`, `src/render/entity-style.js`, `src/render/lighting.js`, `src/render/overlay.js`, `src/ui/dom.js`。
   - 任務：敵彈 4 桶色譜批處理；陰影雙 Pass 全合流；`drawDualOutlineZeroCost` 手動復原；Lightmap 線性剪裁；傷害數字分組批處理；行動端 DPR 收斂。
3. **Track 3：物理碰撞吞吐量與網格現代化 (`feat/perf-physics-spatial`)**：
   - 負責模組：`src/core/spatial-grid.js`, `src/systems/sim/enemies.js`, `src/systems/sim/new-enemies.js`, `src/systems/card-effects.js`, `src/systems/sim/bosses.js`, `src/systems/sim/bullets.js`。
   - 任務：55px 網格尺寸調優；酸池/焦痕/自爆友傷網格化；修正酸池重複呼叫；Titan 部位矩陣快取與逆向變換；穿透彈 Bitmask。
