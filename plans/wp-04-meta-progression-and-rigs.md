# DUST//REIGN 並行工單：Work Package 4 — 機體自選與局外成長（Meta-Progression & Rigs）

**責任模組**：3 大特色機體（Vanguard 斥候、Colossus 泰坦、Engineer 工兵）、本地持久化 `dustReignMeta` 儲存模組、開始畫面機體選單 UI 與成就里程碑。  
**基準檔案**：`game.js`、`index.html`、`styles.css`。  
**對應總體計畫**：[plans/04-meta-progression-and-rigs.md](file:///F:/Desktop/Luna/plans/04-meta-progression-and-rigs.md)

---

## 1. 【防衝突合約與介面定義（Conflict-Free Contract）】

### 1.1 儲存合約：`dustReignMeta` 雙軌存取與舊鍵向下相容
- **舊分自動遷移**：若無 `dustReignMeta`，自動遷移 `dustReignBestScore` 的數值。
- **雙寫鏡像同步**：每次最高分變更，同時寫入 `dustReignMeta` 與 `dustReignBestScore`，確保舊代碼或外部腳本讀取零損壞。
- **防禦性沙盒降級**：所有 localStorage 存取包裝於 `try/catch`，在無痕模式或限制環境下使用記憶體快取安全降級。
- **全域介面**：暴露 `window.LunaGame.meta`（`get`, `save`, `selectRig`, `isUnlocked`, `recordRunEnd`）。

### 1.2 狀態合約：`RIG_CONFIGS` 增量修補注入
- **非覆蓋式修補**：禁止 `player = { ...config }` 全量置換。
- 使用 `applyRigToPlayer(player, selectedRigId)` 僅針對基礎生命、速度、半徑、Dash 等屬性增量修補，保留 WP2 在 `player` 上擴充的自定義欄位。
- 磁吸半徑共享：`var pullRadius = player.magnetRadius || 165;`（與 WP2 完美相容）。

### 1.3 按鍵行為路由隔離（Key Event Demuxing）
- 開始畫面可見時：鍵盤 `1/2/3` 專屬於切換選擇機體。
- 升級畫面可見時：鍵盤 `1/2/3` 專屬於選擇三選一卡牌。
- 兩者完全隔離，無按鍵攔截衝突。

---

## 2. 【原子任務拆解（Atomic Tasks）】

### Task 4.1：`dustReignMeta` 儲存引擎與 5 大成就檢測
- **儲存結構**：`{ version: 1, totalRuns, totalKills, highestWave, highestCombo, bestScore, selectedRig, unlockedRigs: [], achievements: {} }`。
- **5 大成就**：
  1. `scav_initiate`：出擊 1 次（解鎖戰報記錄）。
  2. `heavy_metal`：累計 500 擊殺（**解鎖 COLOSSUS 泰坦機體**）。
  3. `storm_walker`：通關 Wave 5（**解鎖 ENGINEER 工兵機體**）。
  4. `chain_reaction`：達成 8 連殺。
  5. `salvage_hoarder`：單局收集 450 廢料。
- **結算處理**：玩家死亡時呼叫 `recordRunEnd(summary)` 結算新數據與解鎖狀態。

### Task 4.2：三種機體規格定義與 `makeState` 整合
- **VANGUARD (斥候型)**：
  - 半徑 13px, HP 80, 速度 275, 傷害 11x3 破片散彈。
  - **雙段 Dash**（充能上限 2, 充能 1.4s, 動作 CD 0.18s, 距離 120px）。
- **COLOSSUS (泰坦重裝型)**：
  - 半徑 18px, HP 160, 速度 190, 傷害 44 穿甲重砲。
  - **複合裝甲**（接觸傷害減免 20%）。
  - **震地重砸 Dash**（距離 95px, CD 3.2s, 落點 114px 重砸脈衝，擊退敵人 120px）。
- **ENGINEER (拾荒工兵型)**：
  - 半徑 15px, HP 100, 速度 220, 傷害 22。
  - **超導磁吸**（半徑 330px）。
  - **開局自帶 1 架浮游防衛僚機**。
  - **廢料提煉**（1.35x 經驗倍率）。

### Task 4.3：開始畫面機體選擇卡片 DOM / CSS
- 在 `#startScreen .overlay-inner` 注入 `#rigSelector` 卡片群組。
- 未解鎖機體顯示半透明遮罩與鎖頭（`🔒 REQ: 500 KILLS`）。
- 選中卡片顯示氧化薄荷綠光暈與邊框。
- `styles.css` 補齊 `.rig-selector`, `.rig-card`, `.is-selected` 樣式。

### Task 4.4：死亡結算畫面長期成就進度渲染
- 在 `#gameOverScreen` 注入 `#metaProgressSummary`。
- 渲染生涯累計擊殺、最高波次、已解鎖機體比例與 5 枚成就標章。

---

## 3. 【精確修改清單與驗證命令】

### 3.1 `game.js` 精確修改定位

| 代碼位置 | 修改性質 | 變更說明 |
| :--- | :--- | :--- |
| `Line 24 前後` | 常數宣告 | 定義 `META_KEY = 'dustReignMeta'`、`DEFAULT_META`、`RIG_CONFIGS`、`ACHIEVEMENTS_DEF`。 |
| `Line 72-87` | 雙寫相容 | `readBestScore` / `writeBestScore` 內部無縫委派給 Meta 引擎。 |
| `Line 89-139` | 增量修補 | `makeState` 呼叫 `applyRigToPlayer(player, getMeta().selectedRig)`。 |
| `Line 247-281` | 節點快取 | 快取 `#rigSelector`、`#rigStatusTag`、`#metaProgressSummary`。 |
| `Line 333-337` | 按鍵解耦 | 開始畫面時 1/2/3 鍵切換機體；暫停升級時 1/2/3 鍵選擇升級。 |
| `Line 450-485` | 射擊散彈 | 支援 `p.multishot` 扇形發射。 |
| `Line 487-512` | 多段衝刺 | 支援雙段 Dash 充能扣減與 Colossus 重砸衝擊波。 |
| `Line 600-604` | 局末結算 | 呼叫 `recordRunEnd(summary)` 同步生涯數據與成就檢測。 |
| `Line 681` | 磁吸半徑 | `od < (p.magnetRadius || 165)`。 |
| `Line 724-738` | 重甲減免 | 扣血前計算 `e.damage * (1 - (p.contactDamageReduction || 0))`。 |
| `Line 863-895` | 機體外型 | 依 `p.rigId` 繪製三角斥候、八角泰坦、六角工兵不同外觀。 |
| `Line 1103-1207`| 自我檢查 | 擴展 Meta 讀寫、資料遷移、機體規格獨立性與成就解鎖單元斷言。 |

---

### 3.2 驗收命令

```bash
node --check game.js
```
瀏覽器控制台執行：
```javascript
window.LunaGame.selfCheck();
```
*預期輸出*：包含 `rigs: 3`, `metaVersion: 1`, `achievements: 5`，測試 100% 通過。
