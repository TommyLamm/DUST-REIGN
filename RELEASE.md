# DUST//REIGN 0.1.0

首次 Playroom 成品交付；遊戲 ID 固定為 `dust-reign`，版本 `0.1.0`，tag 為 `v0.1.0`。

## 改動

- 建立完整 `game.json`、實際遊玩封面與五檔靜態成品，保留既有 Canvas roguelike 玩法。
- 新增白名單打包流程與 GitHub Actions；平台完整 ZIP 驗證通過才建立 Release，唯一附件為 `game.zip`。
- 最高分使用 `dust-reign:best-score:v1`，相容讀取舊 `dustReignBestScore` 並保留舊資料。
- 修正正式頁面 Canvas／HTML 基本 HUD 重複繪製的文字重疊；保留連殺、超頻及 fallback Canvas HUD。

## 接入版本與成品

規格、schema 及驗證工具固定使用 [Playroom commit 3728de1c50d4b0263f9f5f279d33d5d205a385fa](https://github.com/TommyLamm/playroom-platform/tree/3728de1c50d4b0263f9f5f279d33d5d205a385fa)。

ZIP 根目錄直接包含 `game.json`、`index.html`、`styles.css`、`game.js`、`cover.png`，不包含原始文件、測試輸出、依賴或 repository metadata。無編譯、後端、第三方服務、外部素材及前端路由；所有執行資源使用相對路徑。

## 已通過驗證

- `node --check game.js`、`node --check scripts/stage-release.mjs` 及 `git diff --check`。
- 固定平台 checkout 安裝依賴後，執行 `npm run game:pack -- <成品目錄> <外部 ZIP 路徑>` 及 `npm run game:validate -- <ZIP 路徑>`；回報 `Valid: dust-reign v0.1.0`。
- 真實 Chromium 桌面瀏覽器，在跨來源 sandbox iframe 的版本子目錄完成開始、鍵盤移動、滑鼠射擊、實際擊殺、scrap 收集、升級選擇、Dash、暫停／恢復、自然死亡及按鈕重開。
- `LunaGame.selfCheck()` 通過；實際遊玩中完成 15 次擊殺、1 次升級。舊最高分 43 正確讀取，新最高分 1065 寫入新 key，舊值保留，重開後最高分保留。
- 該次完整遊玩無頁面例外、失敗請求或 HTTP 4xx／5xx。
- 成品預覽子目錄亦在相同 sandbox 內完成實際射擊（14 次擊殺）、自然死亡及重開，沒有頁面例外或資源載入失敗。桌面畫面檢查尺寸為 1440 × 900 及 1280 × 800；預覽來源正確共享同一來源最高分。

## 相容性限制與未執行項目

- 本版只宣告 `desktop`。手機直向／觸控完整玩法、實體手機、Safari 及 Firefox 尚未驗證。
- 已檢查 390 × 844 手機尺寸的初始畫面，但未完成觸控流程；既有窄畫面的 overlay 需要內部捲動，不將這項畫面檢查視為 mobile 遊玩驗收。
- 無音效或全螢幕功能，相關玩家手勢／拒絕案例不適用。沒有 package build、型別檢查或測試框架指令。
- 分數僅存在同一瀏覽器及來源；本機來源與 Playroom 來源之間不會自動搬移分數。
- 本地 iframe 驗收使用兩個不同 port，sandbox 與固定平台程式相同：`allow-scripts allow-same-origin allow-pointer-lock`，allow 為 `fullscreen; autoplay; gamepad`。
- 尚未執行 Playroom 管理員實際預覽、匯入或上架。本 GitHub Release 不代表遊戲已在平台上架。

## 本機重現打包

使用 Node 24；在新的 staging 目錄執行 `node scripts/stage-release.mjs`。其輸出為 `output/release/0.1.0/game/`，已有 staging 時會拒絕覆寫。

在隔離平台 checkout 切到上述 commit、執行 `npm ci --ignore-scripts`，再依序執行 `game:pack` 與 `game:validate`，ZIP 輸出放在 `output/release/0.1.0/game.zip`。平台工具只用於打包及驗證，不作為遊戲執行依賴。
