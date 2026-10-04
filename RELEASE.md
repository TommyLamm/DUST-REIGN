# DUST//REIGN 0.1.2

遊戲 ID `dust-reign`；Playroom 排行榜與成績 SDK 接入版，交付版本 `0.1.2`，對應 tag `v0.1.2`。GitHub Release 不代表已在 Playroom 匯入或上架。

## 改動

- 依 Playroom 最新規範接入 `playroom-sdk.js`，追蹤平台 `main` 分支最新規範與打包驗證工具。
- `game.json` 宣告 `leaderboard`（ID `dust-reign-score`，降序排列，單位「分」，範圍 0 至 9007199254740991）。
- 遊戲開始（點擊開始按鈕或重開）時呼叫 `Playroom.startRun()` 建立平台局次；結算死亡時呼叫 `Playroom.finishRun({ runId, score })`。
- 訪客、診斷預覽、離線或平台連線異常時不阻礙核心遊玩；僅在正式提交回傳 `saved: true` 時在結算畫面顯示「RECORDED TO PLAYROOM」標記。
- 升級 GitHub Actions Release workflow 追蹤平台 `main` 分支，由 Node 24 執行打包與完整 ZIP 驗證。

## 規格與成品

- 規格與工具來源：追蹤 [Playroom Platform main 分支](https://github.com/TommyLamm/playroom-platform)。
- 成品位置：`output/release/0.1.2/game.zip`。
- ZIP 根目錄包含 6 個檔案：`game.json`、`index.html`、`styles.css`、`game.js`、`playroom-sdk.js`、`cover.png`。
- 無編譯依賴、無後端、無外部素材，全自有資源保持相對路徑。

## 已通過驗收

- 語法與一致性檢查：`node --check game.js`、`node --check playroom-sdk.js`、`node --check scripts/stage-release.mjs`。
- 本機單元自我檢查：`LunaGame.selfCheck()` 全項通過。
- 平台打包與驗證：使用平台最新 `npm run game:pack` 與 `npm run game:validate` 完整驗證通過（`Valid: dust-reign v0.1.2`）。
- 真實 Chromium 跨來源 sandbox iframe 整合測試（Playwright 自動化）：
  - 認證模式：父頁發送 `init`，遊戲發送 `startRun` 取得 run ID；玩家死亡時自動提交 `finishRun`（score 與 runId 正確），收到 `saved: true` 後結算畫面顯示 RECORDED TO PLAYROOM 標記；點擊重開後重置並建立新局次。
  - 獨立／離線模式：直接開啟遊戲，無平台連線時核心玩法、升級、死亡與重開正常運作，不拋未捕獲例外。
  - 手機模擬視窗（390×844）：觸控按鈕、DASH 與自動瞄準 FIRE 運作正常。

## 限制與未執行項目

- 平台帳號排行榜需待管理員於 Playroom 後台匯入並發布此版本後正式生效。
- 未使用音效或遊戲內全螢幕功能。
- 瀏覽器本地最高分與平台排行榜獨立運作；本地最高分保存在 `localStorage`，不自動匯入平台歷史。

## 重現打包

使用 Node 24，執行：

```sh
node scripts/stage-release.mjs
```

在平台工具 checkout 目錄執行：

```sh
npm run game:pack -- <repository>/output/release/0.1.2/game <repository>/output/release/0.1.2/game.zip
npm run game:validate -- <repository>/output/release/0.1.2/game.zip
```
