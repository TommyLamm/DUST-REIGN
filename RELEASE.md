# DUST//REIGN 0.10.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.10.0`，對應 tag 為 `v0.10.0`。

DUST//REIGN v0.10.0 全面完成了**三軌大世界廢土擴展、0-GC 中心相機動力學系統、PSRA 環形戰鬥生態與三大首領大世界重塑（Expanded Wasteland Map, Centered Tracking Camera, PSRA Perimeter Spawning & Combat Ecosystem, and Boss Big-World Reshaping）**。本版本在嚴格恪守純原生 Vanilla ES Modules + HTML5 Canvas 2D + Web Audio API 零外部 npm 依賴架構原則下，將戰場維度由固定螢幕拓展為 $3520 \times 2640$ 廣袤廢土，建構了動態平滑追蹤相機與戰術小地圖，並導入 PSRA 三環邊界生成、狼群包夾 AI、6 大戰術 POI 與大世界重塑首領戰鬥。全套 9 大自動化驗證矩陣（包含 40/40 全流程真實無頭 Chrome CDP 驗收）與 Playroom Platform 官方固定驗收工具 100% 通過。

---

## 一、版本四大支柱革新與量化技術指標

### 支柱一：大地圖維度升級、1024px 圖塊平鋪與視錐台幾何 AABB 剔除管線（Large World & Frustum Culling）
1. **$3520 \times 2640$ 大世界維度與 55px 空間網格完美對齊**：
   - 戰場空間升級為全域邊界 `WORLD_WIDTH = 3520`, `WORLD_HEIGHT = 2640`（邊界安全緩衝 `MAP_MARGIN = 160px`，中央有效戰術空間 $3200 \times 2320$）。
   - 玩家初始開局世界坐標精準置中於 $(1760, 1320)$。
   - 既有 55px 空間雜湊網格以 $64 \times 48$ 單元格（$64 \times 55 = 3520$, $48 \times 55 = 2640$）零浪費、零分配無縫覆蓋全大地圖。
2. **$1024 \times 1024$ 離屏圖塊 GPU GL_REPEAT 平鋪渲染**：
   - 徹底摒棄全地圖超大離屏 Canvas（消除 37.2MB 記憶體分配與行動裝置 OOM 隱患）。
   - 快取固定尺寸 $1024 \times 1024$ 離屏圖塊，利用 GPU `ctx.createPattern('repeat')` 結合 `terrainPattern.setTransform(DOMMatrix)` 實現亞像素級無縫滾動平鋪。
3. **世界視錐台幾何 AABB 剔除管線（Frustum Culling）**：
   - 實作平坦靜態緩衝池 `culledEnemyIndices`（`Int16Array(1024)`）與 `culledEnemyCount`，每幀 0-GC 篩選視口可見敵人。
   - 分級幾何邊界 Padding：常態敵型邊界緩衝 48px，大型首領（Titan / Dreadnought / Sovereign）給予 220px 巨型緩衝，確保肢體與彈幕在螢幕邊緣無跳變削切。
   - 實體渲染與陰影 Pass 剔除率達 75%~90%，大幅減輕 Canvas fillrate 負載。

### 支柱二：0-GC 中心相機動力學、Hermite 準星前瞻、正交震屏解耦與戰術小地圖（Camera Viewport System）
1. **0-GC 相機單例與非對稱雙階動態阻尼**：
   - 單例容器 `camera.js` 零執行期垃圾分配，即時追蹤玩家核心世界坐標。
   - 非對稱雙階動態阻尼：巡航平滑追蹤速度 $\lambda_{cruise} = 8.5\text{ s}^{-1}$，高速衝刺時動態提升至 $\lambda_{dash} = 24.0\text{ s}^{-1}$，確保高速移動時玩家不脫離中心視口。
   - 軟約束死區（Soft-Leash Deadzone）：半徑 $76.8\text{px}$（$0.12 \times \min(viewW, viewH)$），微小步進位移相機保持靜止，杜絕視線抖動。
2. **雙向 Hermite 準星前瞻（Aim Lookahead）**：
   - 準星位移前瞻導入三階 Hermite 平滑曲線（S-curve），死區閾值 $70\text{px}$，最大視口偏移 $140\text{px}$。
   - 動態阻尼響應：前推擴展速度 $\lambda_{ext} = 7.2\text{ s}^{-1}$，回彈收斂速度 $\lambda_{ret} = 14.5\text{ s}^{-1}$，支援滑鼠游標與手把右搖桿動態輸入。
3. **創傷度正交震屏與逆映射解耦**：
   - 採用 $T^2$ 能量衰減的正交質數頻率震屏演算法（X軸 31.0rad/s、Y軸 27.0rad/s、旋轉角 23.0rad/s），消滅共振雜訊。
   - 核心防干擾逆映射：`screenToWorld` 在計算螢幕坐標逆矩陣時**徹底扣除 Shake 偏移量**，確保劇烈爆炸震屏時滑鼠準星世界坐標完全穩定，杜絕爆炸準星抖動漂移。
   - 減動效模式（Reduced Motion）完全歸零震屏。
4. **戰術小地圖與視口邊緣雷達指針**：
   - 右上角 128px 圓形戰術微型小地圖（`drawTacticalMinimap`）：採 4 桶色彩分流（玩家青、POI金黃、普通敵型暗紅、首領猩紅）單 Pass 批次渲染，CPU 耗時 $< 0.05\text{ms}$。
   - 視口邊緣雷達指針（`drawOffscreenChevrons`）：採用 Ray-AABB 邊界幾何求交，精準投影視口外威脅。Boss 呈現動態呼吸雙箭頭並標註世界距離數字，POI 呈現翠綠菱形，菁英怪呈現橙色單箭頭。

### 支柱三：PSRA 環形邊界生成、速度向量預判阻截與狼群包夾戰鬥生態（Spawning & Aggro Flow）
1. **PSRA 環形邊界生成拓撲（Perimeter Spawning Ring Architecture）**：
   - 內環（視口 $+40\text{px}$）：絕對禁刷安全區，杜絕怪物突兀生成於玩家臉前。
   - 中環（$1.15 \sim 1.42\times$ 視口半徑）：活躍生成區，動態派發波次怪物。
   - 外環（$>1.85\times$ 視口半徑）：靜默回收區，當怪物落後玩家過遠時自動回收並返還波次生成代幣，防止怪群在後方死角堆積。
2. **速度向量預判扇區攔截與邊界折射**：
   - 敵方生成點不再是單純均勻隨機，而是根據玩家當前速度向量計算前進扇區：55%~65% 於前進路徑迎面阻截、25%~30% 兩側合圍包夾、10%~15% 後方施壓追趕。
   - 遇到 $3520 \times 2640$ 世界邊界時自動切線折射反彈生成坐標，消滅地圖邊界刷怪盲區。
3. **狼群包夾 AI、55px 空間雜湊分離與菁英怪地底疾行**：
   - 狼群包夾 AI：普通怪群朝玩家側翼展開扇形環繞包圍。
   - 55px 空間網格 0-GC 局部排斥分離（Separation）：利用網格鄰域判定敵人間重疊排斥，消滅怪物擠壓疊成單點的視覺穿模。
   - 菁英怪 Hyper-Catchup 地底疾行：當菁英怪落後視口外時，觸發 3.5x 移速地底潛行疾行追趕，重返視口時震地破土而出。

### 支柱四：三大首領大世界重塑、6 大戰術 POI 與全模式適配（Bosses & Tactical POIs）
1. **6 大戰術 POI 生命週期與互動機制**：
   - **提煉塔（Scrap Silo）**：靠近觸發 1.5s 引導，啟動 20s 守點防衛戰，完成後噴射 80 廢料與高能脈衝。
   - **軌道空投倉（Orbital Pod）**：靠近 1.0s 開啟，立刻獲得 200 經驗、全場磁吸範圍翻倍（450px，持續 15s）。
   - **改裝工作站（Field Rig）**：0.8s 超頻改裝，永久提升射速 +35%、受傷減免 20%、移動速度 +15%。
   - **異星母巢（Xeno Nest）**：具備 60% 護甲減傷並定時孵化蟲群，擊破後引發全圖震波擊殺周遭雜兵並掉落 40 廢料與不穩定核心。
   - **電磁尖塔（EMP Spire）**：具備電容保護罩，以子彈過載摧毀後觸發全場 3.5s 電磁癱瘓並粉碎全場敵方護盾。
   - **裝甲地堡（Bunker Cache）**：重裝防禦工事，破除後觸發全額緊急維修（回復 100% 生命）並注入 30 發 AP 穿甲高暴擊彈藥。
2. **三大首領大世界重塑**：
   - **Titan**：配備地震牽引錨（Seismic Harpoon），射出鋼索將遠程風箏的機甲拉回近戰碾壓區；履帶可碾碎場景殘骸與障礙物。
   - **Dreadnought**：呼叫軌道空投沉箱巨石（Megalith Drop），玩家引導 Dreadnought 衝撞巨石可將其撞碎並觸發首領 3.2s 破甲硬直眩暈。
   - **Storm Sovereign**：動態隨動風暴之眼，大世界高空盤旋並隨首領本體動態平移風暴中心。
3. **多模式大世界適配**：
   - 闖關模式戰役：支援移動採集車護航路線巡航與峽谷逃亡 VIP 首領刺殺。
   - 極限作戰：大世界黑風暴向心收縮毒圈機制。

---

## 二、分支合併與衝突解決

本次發布完成了三條大型核心特性分支的合流與細緻驗證：
- `feat/camera-viewport-system`（commit `babfb5a`）
- `feat/large-map-terrain-culling`（commit `bb61efe`）
- `feat/spawning-boss-aggro-flow`（commit `afb49aa`）

在合併過程中，系統針對多軌重疊檔案進行了全面檢核與精準協同：
1. `src/input/keyboard-pointer.js`：保留 Track 1 的 `screenToWorld` 震屏解耦逆映射，並為無相機情境提供大世界坐標夾持 fallback。
2. `src/main.js`：依序初始化 0-GC 相機單例與 $3520 \times 2640$ 預設大世界狀態，並完整保留 `syncCombatLayout()`、`applyLoadout()` 與 `directorStartRun()`。
3. `src/render/draw.js`：融合相機坐標與旋轉震屏矩陣變換、視錐台幾何 AABB 剔除管線（`updateFrustumCulling`）、1024px 圖塊平鋪、接地陰影批次繪製、POI 渲染、右上角微型小地圖與邊緣雷達指針。
4. `src/render/lighting.js`：統一光源收集與剪裁坐標系，相容大世界視口邊界與 `drawCone` 照射。
5. `src/render/terrain.js`：採納 $1024 \times 1024$ 離屏圖塊 GPU GL_REPEAT 平鋪渲染，並加入 48px 安全邊界 Padding 消除震屏邊緣黑邊。
6. `src/ui/dom.js`：在尺寸調整（`resize`）時保護大世界世界尺寸不被畫布尺寸覆蓋，並維持玩家邊界安全夾持。
7. `src/systems/update.js`：整合 `stepPois`、`stepCampaignMode`、`stepHardcoreMode` 與 `updateCamera`。
8. 清理 3 個 Git Worktrees（`track1-camera-viewport`、`track2-large-map-terrain`、`track3-spawning-boss-flow`）。

---

## 三、自動化驗收矩陣通過狀態（100% 通過）

在主分支環境下，全套 9 大自動化驗收測試矩陣 100% 全部通過：

| 驗收套件 | 執行指令 | 測試結果 | 關鍵驗收指標 |
| :--- | :--- | :--- | :--- |
| **核心邏輯自檢** | `node scripts/self-check.mjs` | ✅ 通過 (`ok: true`) | 26 張升級卡、8 組融合晶片、4 種動態詞綴、Titan 雙側部位破壞、2D 空間雜湊網格 0-GC 驗證 |
| **多語言本地化套件** | `node scripts/test-i18n-verification.mjs` | ✅ 通過 (4/4 階段) | 中英切換持久化、命名空間遷移驗證、26 升級 + 8 融合全量雙語對照、DOM 靜態 HTML 同步 |
| **闖關與極限模式套件** | `node scripts/test-campaign-modes.mjs` | ✅ 通過 (3 階段) | 關卡選擇器、星級進度條、作戰簡報、輪播導航、模式切換無狀態殘留 |
| **局外改裝與競速套件** | `node scripts/test-track3-metagame.mjs` | ✅ 通過 (4/4 階段) | 工坊 6⚡ 負載與插槽裝配、天梯隔離防護、星級金庫與每日懸賞、5Hz 幽靈差分壓縮 (120s 僅 2.26 KB < 3 KB) 與 Split-Timer |
| **偏好設定與 Unified Save 驗證** | `node scripts/test-cloud-save.mjs` | ✅ 通過 (4/4 階段) | 偏好命名空間平滑遷移、終局存檔大小 (5.50 KiB < 16 KiB)、樹深度 (5 階 <= 5)、智慧合併交換律、409 衝突自動解決至 rev 3、requestId 重複保護 |
| **雲端存檔與 Schema v2 驗證** | `node scripts/test-track2-cloud-save.mjs` | ✅ 通過 (5/5 階段) | Manifest Schema v2 與 cloudSave 宣告校驗、快照大小 (1.14 KiB < 64 KiB)、雙向智慧合併、SDK 1.1.0 樂觀鎖與自動檢查點保存鉤子 |
| **相機與視口動態驗收** | `node scripts/test-track1-camera.mjs` | ✅ 通過 (8/8 階段) | 雙階阻尼（$\lambda_{cruise}=8.5$, $\lambda_{dash}=24$）、軟約束死區（76.8px）、Hermite 準星前瞻（140px/70px）、震屏解耦逆映射、小地圖與雷達指針、減動效零震屏 |
| **大地圖與視錐剔除驗收** | `node scripts/test-track2-terrain-culling.mjs` | ✅ 通過 (5/5 階段) | 3520x2640 世界邊界、55px 空間網格 64x48 對齊、玩家生成置中 (1760, 1320)、AABB 視錐剔除（75%+ 剔除率）、6 大 POI 生命週期與防守互動 |
| **真實瀏覽器全流程 E2E** | `node scripts/test-browser-gameplay.mjs` | ✅ 通過 (40/40 項) | 零未捕捉異常、零控制台報錯；涵蓋開局配裝、戰鬥動能、全按鍵與戰術裝備部署、升級選卡/重抽/放逐/跳過、暫停分頁、死亡結算與 Run It Back 重開 |

---

## 四、官方固定工具雙重真實驗收

使用官方固定工具 `.playroom/tools/playroom-game-tools-1.1.0.zip` 解壓後進行真實驗收：

1. **打包驗證**：
   ```sh
   node pack-game.mjs output/game output/game.zip
   ```
   - 結果：`Packed dust-reign v0.10.0: output/game.zip (tools 1.1.0)`
2. **規格核驗**：
   ```sh
   node validate-game.mjs output/game.zip
   ```
   - 結果：`Valid: dust-reign v0.10.0 (tools 1.1.0)`
   - 雙重工具驗收 100% 通過！

---

## 五、交付物清單

- **Release 標籤**：`v0.10.0`
- **發布分支**：`master`
- **Manifest 版本**：`game.json` (version `0.10.0`, schemaVersion `2`)
- **Staging 輸出**：`output/game/`
- **發布 ZIP**：`output/game.zip`
- **更新架構**：`ARCHITECTURE.md`
- **驗證紀錄**：`RELEASE.md`
