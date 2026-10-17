# DUST//REIGN 0.9.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.9.0`，對應 tag 為 `v0.9.0`。

DUST//REIGN v0.9.0 全面完成了**三軌次世代性能大重構、0-GC 記憶體防線、Canvas 2D 繪圖管線極致批次合流、55px 空間網格調優與自適應 DPR（Next-Gen Performance Overhaul, 0-GC Memory Pipeline, Batched Canvas Rendering, 55px Spatial Grid Tuning, and Adaptive DPR）**。本版本在維持純原生 Vanilla ES Modules + HTML5 Canvas 2D + Web Audio API 零外部 npm 依賴的架構原則下，攻克了長時間高密度彈幕下的記憶體 GC 卡頓、Canvas 狀態堆疊切換瓶頸與空間物理雙重迴圈開銷，實現了極致穩定的 60 FPS 巔峰流暢度，並 100% 通過全套 7 大自動化驗證矩陣與 Playroom Platform 官方固定工具驗收。

---

## 一、版本三大核心性能軌道特性

### 軌道一：0-GC 記憶體防線、Web Audio 資源自動斷開與 DOM 髒檢查快取（Memory & Audio Foundation）
1. **P0 立即止血與 DOM 性能修復**：
   - 修復結算標題 `syncOutcomeTitle()` 無條件 `innerHTML` 覆寫的歷史隱患，改為值變更髒檢查快取。
   - 移除結算面板中的 `void el.offsetWidth` 強制同步重排（Forced Synchronous Layout）開銷。
   - DOM 操作全面快取：HUD `setText()` 僅在內容變更時寫入 DOM；血條、護盾條、能量條 `style.width` 在百分比整數未變時跳過樣式賦值，消滅無謂的 Style Recalculation。
2. **Web Audio 節點回收與分頁休眠**：
   - 音訊合成器 `cleanupVoice()` 導入主動節點斷開機制（`.disconnect()`），徹底解決 AudioBufferSourceNode 與 GainNode 懸掛導致的音訊線程記憶體洩漏。
   - 監聽 `visibilitychange` 事件，分頁不可見時自動暫停音訊上下文，重返時平滑恢復。
3. **0-GC 核心防線**：
   - 每幀模擬共用單例幀上下文 `cachedFrame`，杜絕每幀無謂分配 `{ p, boundW, boundH }`。
   - 逐實體外觀姿態計算導入單例 `POSE_SCRATCH`，每幀實體移動步進計算導入單例 `STEP_SCRATCH`，消滅所有常態移動與姿態物件分配。
   - 子彈拖尾軌跡採用平坦環形緩衝區（`Float32Array(8)`）與 `trailPool` 靜態物件池復用，實現每幀數百發子彈軌跡 0-GC 運行。
   - 全域無序實體集合（玩家彈、敵彈、模擬粒子、戰利品掉落物、傷害文字）全面改採 Swap-and-Pop（`fastUnorderedRemove`）替代 `splice()`，消除陣列元素平移複製開銷，並在移除實體時主動切斷死者懸空參照以防隱式滯留。

### 軌道二：Canvas 2D 繪圖管線極致批次合流、零成本反差描邊與自適應 DPR（Batched Rendering Pipeline）
1. **敵彈 4 桶色譜分流與單 Pass 批次渲染**：
   - 將幾十枚獨立敵彈分流至 4 個靜態色譜桶（Magenta、Orange、Lime、Violet）。
   - 第一 Pass 批次繪製所有敵彈的 Dark Halo 暗圈外殼；第二 Pass 依色譜批次填充霓虹環與白色高亮光核，消除頻繁變更 `ctx.fillStyle` 與重複繪製黑底的 Canvas 狀態抖動。
2. **接地陰影雙 Pass 全場大合流**：
   - 全場無論多少實體（玩家、各類小怪、首領、機槍塔、誘餌），所有柔影（Penumbra）合併於單一 Pass 繪製，所有硬咬合（Core AO）合併於第二 Pass 繪製。
   - 全場接地陰影每幀僅發出 2 次 `ctx.fill()`，徹底消滅 Canvas 狀態堆疊頻繁 `save()`/`restore()` 開銷。
3. **零成本反差描邊（Zero-Cost Outlines）**：
   - 實體反差雙層描邊 `drawDualOutlineZeroCost` 移除昂貴的 `ctx.save()` / `ctx.restore()` 狀態堆疊操作，改為直接記錄並手動復原 `lineWidth`、`strokeStyle`、`lineCap` 與 `lineJoin` 四個必要屬性。
4. **Lightmap 線性剪裁與傷害文字排版合流**：
   - Lightmap 光源剪裁以單遍平方距離 $O(N)$ 線性過濾替換每幀 $O(N \times K)$ 選擇排序。
   - 浮動傷害數字依字體樣式（普通黑體 / 暴擊黑體）分組批處理，先批次描邊後批次填色，消滅 Canvas 頻繁切換 `ctx.font` 導致的底層字體排版引擎佈局開銷。
5. **自適應 DPR 與指標幾何解耦**：
   - 針對低畫質檔位與行動設備將設備像素比（DPR）自動收斂至 1.0~1.25，大幅緩解高解析度螢幕下的 Canvas fillrate 像素填充負載。
   - 滑鼠與觸控座標追蹤與 Canvas 幾何邊界查詢解耦，避免頻繁呼叫 `getBoundingClientRect()` 觸發同步佈局重算。

### 軌道三：55px 空間雜湊網格調優、危害網格化、Titan 部位旋轉快取與 64-bit Bitmask（Physics & Spatial Optimization）
1. **空間雜湊網格 55px 單元格精密調優**：
   - 單元格尺寸由 75px 緊縮為 55px，廣域候選者假陽性率降低近 50%。
   - 實作 `queryGridCallback` 零分配回調機制，在首個命中目標判定成功時立即 early-out 終止查詢，徹底杜絕陣列分配。
2. **酸池、焦痕與爆炸友傷全面網格化**：
   - 修復 `stepAcidPools()` 每幀重複執行兩次的歷史 Bug。
   - 酸池侵蝕、焦痕蒸發與幼蟲自爆友傷全面接入空間網格局部查詢，以局部半徑檢索取代原本的 $O(N \times M)$ 全域雙重迴圈遍歷。
3. **平方距離常規化**：
   - 全域碰撞與距離檢測全面移除 `Math.hypot` 開根號運算，改採平方距離 $d^2 \le r^2$ 進行純乘加比較。
4. **Titan 部位矩陣單幀快取與逆向局部判定**：
   - Titan 4 大可拆解部位（左迫擊砲、右蜂巢艙、散熱鰭片、履帶裝甲）導入單幀旋轉快取 `updateTitanPartCache`。
   - 每發子彈直接在逆向局部坐標系中以局部相對位置判定碰撞，消除每發子彈反覆計算三角函數與旋轉矩陣。
5. **穿透彈 64-bit Bitmask 命中紀錄**：
   - 高貫穿武器命中紀錄以 64-bit Bitmask（`hitMask0`, `hitMask1`）取代陣列物件與 `indexOf` 線性搜尋，以常數時間暫存器位元運算完成重複命中過濾。
6. **視錐台剔除（Frustum Culling）**：
   - 剔除視窗外 120px 邊界外的敵方實體之空間網格插入，並凍結非必要射擊計時器推進。

---

## 二、分支合併與衝突解決

本次發布順利完成三大性能優化分支的合流與細緻驗證：
- `feat/perf-foundation-0gc`（commit `a84cc5d`）
- `feat/perf-render-pipeline`（commit `c9cbd8a`）
- `feat/perf-physics-spatial`（commit `9f36795`）

在合併過程中，系統針對多軌重疊檔案進行了全面檢核與協同驗收：
1. `src/render/entity-style.js`：同時保留了 Track 1 的單例 `POSE_SCRATCH` 與 Track 2 的 `drawDualOutlineZeroCost` 手動屬性復原。
2. `src/ui/dom.js`：整合了 Track 1 的 DOM 髒檢查快取與 Track 2 的自適應 DPR 收斂邏輯。
3. `src/systems/sim/bullets.js`：完整保留了平坦環形緩衝區軌跡、Swap-and-Pop 實體移除、64-bit Bitmask 穿透歷史紀錄以及 Titan 4 大部位逆向坐標碰撞判定。
4. `src/systems/sim/new-enemies.js`：無縫整合了單例 `STEP_SCRATCH` 與 55px 空間網格 hazard callback 局部查詢。
5. `ARCHITECTURE.md`：就地維護更新最新 0-GC、繪圖批次與空間網格架構契約。

---

## 三、自動化驗收矩陣通過狀態（100% 通過）

在主分支環境下，全套 7 大自動化驗收測試矩陣 100% 全部通過：

| 驗收套件 | 執行指令 | 測試結果 | 關鍵驗收指標 |
| :--- | :--- | :--- | :--- |
| **核心邏輯自檢** | `node scripts/self-check.mjs` | ✅ 通過 (`ok: true`) | 26 張升級卡、8 組融合晶片、4 種動態詞綴、Titan 雙側部位破壞、2D 空間雜湊網格 0 GC 效能驗證 |
| **多語言本地化套件** | `node scripts/test-i18n-verification.mjs` | ✅ 通過 (4/4 階段) | 中英切換持久化、命名空間遷移驗證、26 張升級卡與 8 組融合卡全量雙語對照、DOM 靜態 HTML 同步 |
| **闖關與極限模式套件** | `node scripts/test-campaign-modes.mjs` | ✅ 通過 (3 階段) | 關卡選擇器、星級進度條、作戰簡報、輪播導航、模式切換無狀態殘留 |
| **局外改裝與競速套件** | `node scripts/test-track3-metagame.mjs` | ✅ 通過 (4/4 階段) | 工坊 6⚡ 負載與插槽裝配、天梯隔離防護、星級金庫與每日懸賞、5Hz 幽靈差分壓縮 (120s 僅 2.26 KB < 3 KB) 與 Split-Timer |
| **偏好設定與 Unified Save 驗證** | `node scripts/test-cloud-save.mjs` | ✅ 通過 (4/4 階段) | 偏好命名空間平滑遷移、終局存檔大小 (5.50 KiB < 16 KiB)、樹深度 (5 階 <= 5)、智慧合併交換律、409 衝突自動解決至 rev 3、requestId 重複保護 |
| **雲端存檔與 Schema v2 驗證** | `node scripts/test-track2-cloud-save.mjs` | ✅ 通過 (5/5 階段) | Manifest Schema v2 與 cloudSave 宣告校驗、快照大小 (1.14 KiB < 64 KiB)、雙向智慧合併、SDK 1.1.0 樂觀鎖與自動檢查點保存鉤子 |
| **真實瀏覽器全流程 E2E** | `node scripts/test-browser-gameplay.mjs` | ✅ 通過 (40/40 項) | 零未捕捉異常、零控制台報錯；涵蓋開局配裝、戰鬥動能、全按鍵與戰術裝備部署、升級選卡/重抽/放逐/跳過、暫停分頁、死亡結算與 Run It Back 重開 |

---

## 四、官方固定工具雙重真實驗收

使用官方固定工具 `.playroom/tools/playroom-game-tools-1.1.0.zip` 解壓後進行真實驗收：

1. **打包驗證**：
   ```sh
   node pack-game.mjs output/game output/game.zip
   ```
   - 結果：`Packed dust-reign v0.9.0: output/game.zip (tools 1.1.0)`
2. **規則驗證**：
   ```sh
   node validate-game.mjs output/game.zip
   ```
   - 結果：`Valid: dust-reign v0.9.0 (tools 1.1.0)`

官方固定工具雙重驗收 100% 通過，完全符合 Playroom Platform 上架發布交付標準。
