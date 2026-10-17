# DUST//REIGN 0.8.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.8.0`，對應 tag 為 `v0.8.0`。

DUST//REIGN v0.8.0 全面完成了**三軌標準合流、Playroom Platform 1.1.0 官方標準對齊、Manifest Schema v2 宣告、雲端存檔樂觀鎖同步與偏好設定標準命名空間平滑遷移（Playroom Platform Standard Alignment, Cloud Save Meta Sync, and Settings Namespace Migration）**。本版本確保遊戲在完全符合官方固定工具鏈驗證要求的前提下，提供跨設備進度同步、衝突自動恢復與穩健離線降級，並維持純原生 0-GC 60 FPS 巔峰流暢度。

---

## 一、版本三大核心軌道特性

### 軌道一：官方固定工具鏈 1.1.0 與發布工作流程對齊（Platform Tools 1.1.0 & Workflow Alignment）
1. **官方固定工具 ZIP 與 Lockfile 鎖定**：
   - 導入官方固定驗證工具 `.playroom/tools/playroom-game-tools-1.1.0.zip` 與 `.playroom/game-tools.lock.json`。
   - 鎖定版本 `1.1.0`，SHA-256 校驗碼為 `34443213344f373b6a76c0cc16ba4f4b631421f361cbbc3321e0fa7c8a28d9d1`。
2. **官方 Playroom SDK 1.1.0 整合**：
   - 支援雙向能力協商（`capabilities`：`scoring`、`progress`、`diagnostics`、`saveFormats`、`machineErrors`）。
   - 支援平台結構化錯誤碼 `machineCode`（`SAVE_REVISION_CONFLICT`、`SAVE_FORMAT_INCOMPATIBLE`、`REQUEST_IN_FLIGHT`、`REQUEST_TIMEOUT`）。
   - 提供完整型別定義檔案 `playroom-sdk.d.ts` 與標準化匯出介面（`loadProgress`、`saveProgress`、`startRun`、`finishRun`）。
3. **GitHub Actions release.yml 嚴格對齊官方範本**：
   - 包含工具壓縮檔 SHA-256 驗證、解壓逐檔雜湊校驗、`--prerelease` 標記判定與 GitHub Step Summary 紀錄。
   - 零動態 clone 依賴，所有發布工具均由本機鎖定包自給自足。
4. **Staging 安全隔離**：
   - `scripts/stage-release.mjs` 防護阻斷 `.playroom`、`.git`、`.github` 內部工具與元資料混入發布成品目錄。

### 軌道二：Manifest Schema v2、帳號雲端存檔同步與樂觀鎖控制（Cloud Save Meta Sync）
1. **Manifest Schema v2 升級**：
   - `game.json` 升級為 `"schemaVersion": 2`。
   - 宣告雲端存檔格式支援：`"cloudSave": { "readableFormats": [1], "writeFormat": 1 }`。
2. **Playroom 平台雲端存檔服務**：
   - `src/platform/playroom.js` 實作 `loadAccountProgress()`、`saveAccountProgress()` 與 `saveAccountCheckpoint()`。
   - 採用樂觀鎖版本控制（`revision`）；遇 409 `SAVE_REVISION_CONFLICT` 自動重新讀取伺服器最新進度、執行雙向智慧合併並重試；同快照重試嚴格沿用同一 `requestId` 防止版本空跳。
   - 遇 `SAVE_FORMAT_INCOMPATIBLE` 時安全停止寫入並記錄警告，防止破壞未相容之新版存檔。
   - 離線與訪客模式無縫降級，存檔失敗絕不阻塞主要遊戲玩法。
3. **全進度快照序列化與雙向最大化智慧合併**：
   - `src/core/meta-store.js` 實作 `exportUnifiedSaveData()` 與 `importUnifiedSaveData()`。
   - 序列化快照體積限制 < 64 KiB、深度 < 32（實測僅 1.14 KiB、深度 5 層），涵蓋 meta、campaign、hardcore、workshop、vault、bounties 與 bestScore。
   - 雙向智慧合併演算法：星級、最高分、廢料、改裝模組等級取最大值；解鎖關卡、勳章、外觀取聯集；每日懸賞進度取最佳並保留已領取標記。
4. **關鍵檢查點自動保存**：
   - 串接開局同步載入，以及闖關通關、極限作戰通關、結算面板展示、改裝工坊配裝調整等關鍵檢查點自動背景觸發存檔。

### 軌道三：偏好設定標準命名空間平滑遷移與 Unified Save 模組（Settings Namespace Migration）
1. **偏好設定 LocalStorage 標準化平滑遷移**：
   - 音效偏好：遷移至 `dust-reign:audio:v1`（儲存 `{ muted, masterVolume }`），相容舊鍵 `dust_reign_audio_muted`、`dust_reign_master_volume`。
   - 語系偏好：遷移至 `dust-reign:lang:v1`（儲存 `'zh'`／`'en'`），相容舊鍵 `dust_reign_lang`。
   - 遊戲設定：遷移至 `dust-reign:settings:v1`（儲存 `{ hapticsEnabled, motionReduction, highContrast, visualQuality }`），相容舊鍵 `dust_reign_haptics_enabled`、`dust_reign_motion_reduction`、`dust_reign_high_contrast`、`dust_reign_visual_quality`。
   - 讀取優先新標準鍵，自動回退讀取舊鍵並在寫入時自動遷移平滑過渡。
2. **Unified Save 獨立輔助模組**：
   - `src/core/cloud-save.js` 封裝獨立的 Unified Save 結構、驗證（< 16 KiB、深度 <= 5）、智慧合併交換律與衝突重試邏輯。

---

## 二、分支合併與衝突解決

本次發布順利合流三個功能分支：
- `feat/platform-tools-workflow`（commit `c65044f`）
- `feat/cloud-save-meta-sync`（commit `81d87f8`）
- `feat/settings-namespace-migration`（commit `6d089a5`）

合併過程細心解決了 `src/core/meta-store.js` 的衝突，100% 完整保留了兩側的快照導出／智慧合併實作、檢查點保存鉤子以及 `src/core/cloud-save.js` 的完整 re-export 介面；同時確認 `ARCHITECTURE.md` 與 `src/dev/checks/meta.js` 協調一致，零功能遺漏。

---

## 三、驗收矩陣通過狀態（100% 通過）

於 Node v24.19.0 環境下執行完整自動化驗收矩陣，全部測試 100% 通過：

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
   - 結果：`Packed dust-reign v0.8.0: output/game.zip (tools 1.1.0)`
2. **規則驗證**：
   ```sh
   node validate-game.mjs output/game.zip
   ```
   - 結果：`Valid: dust-reign v0.8.0 (tools 1.1.0)`

官方工具雙重驗收 100% 通過，完全符合 Playroom Platform 上架發布交付標準。
