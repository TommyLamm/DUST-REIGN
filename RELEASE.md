# DUST//REIGN 0.1.1

遊戲 ID `dust-reign`；Desktop／Mobile UI 修正版。本次只完成本機修復與交付，尚未建立 `v0.1.1` tag、GitHub Release 或 Playroom 匯入／上架；既有 v0.1.0 保持不變。

## 改動

- 外框固定於 iframe 可用高度，flex／grid 子項可縮小，移除頁面及開始／死亡／升級面板的捲動。
- 手機戰場填滿剩餘高度，移除固定橫向比例；短畫面採精簡面板與單列控制。UHD 放大面板、HUD、字體及按鈕。
- 觸控目標至少 44px；獨立操作列不覆蓋戰場，新增 PAUSE／RESUME。
- Pointer Capture 與各射擊 pointer 的釋放獨立處理，放開移動手指不會停止 FIRE；重開清空輸入，開始／升級流程不被觸控按鈕跳過。
- ResizeObserver 同步 Canvas 的實際尺寸，避免短視窗被舊最小邏輯高度拉伸；銷毀時清理 observer。
- Manifest 宣告 desktop、mobile，補上觸控說明。保留玩法、素材、授權與最高分相容讀取格式。

## 規格與成品

規格、Schema、打包及驗證工具固定使用 [Playroom commit 3728de1c50d4b0263f9f5f279d33d5d205a385fa](https://github.com/TommyLamm/playroom-platform/tree/3728de1c50d4b0263f9f5f279d33d5d205a385fa)。

成品：`output/release/0.1.1/game.zip`；ZIP 根目錄只有 `game.json`、`index.html`、`styles.css`、`game.js`、`cover.png`。無編譯、後端、第三方服務、外部素材或前端路由；全部自有資源保持相對路徑。

## 已通過驗收

- `node --check game.js`、`node --check scripts/stage-release.mjs`、`git diff --check`；無專案 build、型別檢查或測試框架指令。
- 真實 Chromium 跨來源 sandbox iframe：父頁與遊戲使用不同 port，sandbox `allow-scripts allow-same-origin allow-pointer-lock`，allow `fullscreen; autoplay; gamepad`。版本 `/games/dust-reign/0.1.1/` 及預覽 `/preview/release-check/` 子目錄均正常載入。
- 14 種 iframe 尺寸：3840×2160、2560×1440、1920×1080、1440×900、1280×720、1024×600、900×600、768×1024、390×844、360×640、320×568、844×390、667×375、320×480。開始／死亡／升級共 42 個版面檢查，文件與面板沒有 scroll overflow，主要按鈕和觸控按鈕均在可見範圍。此項透過切換 DOM 面板驗證排版，與下列實際遊玩分開記錄。
- 桌面版本子目錄：開始、WASD 移動、滑鼠瞄準射擊、Dash、鍵盤暫停、14 次實際擊殺、scrap 收集及 1 次自然升級、自然死亡和重開。舊 key 值 43 正確讀取；新 key 保存 1062，舊值保持 43，重開後最高分保留。
- 手機預覽子目錄：Chromium 手機模式 390×844、DPR 3，透過瀏覽器觸控輸入完成開始、方向按鈕、同時移動／FIRE、自動瞄準、Dash、PAUSE／RESUME、20 次實際擊殺、scrap 收集、1 次自然升級、自然死亡及觸控重開；重開最高分 1637 保留。
- 手機旋轉至 844×390，Canvas 自動同步為 844×288；實際觸控移動、射擊及暫停可操作，文件尺寸 844×390。
- 上述最終版面與遊玩驗收無頁面例外、失敗請求或 HTTP 4xx／5xx；`LunaGame.selfCheck()` 亦通過，未用它替代實際遊玩。
- 視覺檢查 UHD、桌面、手機直向／橫向以及實際手機遊玩／死亡截圖；驗收輸出位於被 Git 忽略的 `output/playwright/`。

- 固定平台 commit 的 `npm run game:pack` 與完整 `npm run game:validate` 通過，結果 `Valid: dust-reign v0.1.1`。

## 限制與未執行項目

- 手機驗收是 Chromium 真實瀏覽器的裝置／觸控模擬，未在實體手機、Safari、Firefox 執行。CSS 使用 dynamic viewport 與 container queries，舊瀏覽器相容性未驗證。
- 無音效或遊戲內全螢幕功能，相關手勢／拒絕案例不適用。
- 最高分僅在同一瀏覽器及來源有效；不跨來源搬移，也沒有平台帳號 SDK。
- 未執行 Playroom 管理員實際預覽、匯入、發布；本機驗證不代表平台上架。

## 重現打包

使用 Node 24，執行 `node scripts/stage-release.mjs`，產生 `output/release/0.1.1/game/`（既有 staging 拒絕覆寫）。在固定 commit 的隔離平台 checkout 安裝 `npm ci --ignore-scripts`，執行：

```sh
npm run game:pack -- <repository>/output/release/0.1.1/game <repository>/output/release/0.1.1/game.zip
npm run game:validate -- <repository>/output/release/0.1.1/game.zip
```

本次完整 ZIP 驗證通過；CI 保持完整驗證通過後才建立 Release。
