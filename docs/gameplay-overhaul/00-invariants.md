# 00 不可破壞的規則

[返回索引](README.md)

## 平台與交付

- 依 `AGENTS.md`：開始實作與發布前重新讀取平台 `main` 最新規格（開發標準、Schema、workflow 範本、SDK），並以平台 `main` 最新工具執行 `game:pack` / `game:validate`。
- 零依賴、無編譯步驟、無外部 CDN、無後端。所有資源相對路徑，可在版本子目錄與跨來源 sandbox iframe 內遊玩。
- 不跳出 iframe、不開 popup、不提交表單；音效仍需玩家手勢解鎖。
- `devices` 維持 `desktop` + `mobile`：所有新功能都必須能用觸控在手機直向完成。
- 不建立 tag、不建立 Release，除非使用者明確要求。

## 帳號成績

- `game.json` 的 `leaderboard.id` 改為 `dust-reign-score-v2`；`order`、`unit`、`minScore`、`maxScore` 與舊榜相同但 ID 不同，因為計分尺度改變。
- 開局 `Playroom.startRun()`、結束 `Playroom.finishRun({ runId, score })` 的流程與時機不變：撤離通關與死亡都算「一局結束」並提交；選擇繼續無盡時，不在撤離當下提交，而在最終死亡或放棄時提交一次。
- 分數必須是非負安全整數。不跨帳號保存局次，不把本機最高分匯入帳號。
- 每日挑戰與一般模式提交到同一榜單（同一套計分規則）；不另開榜單。

## 架構邊界

- `src/systems/**` 永遠不 import `src/render/**`。sim → render 只走 `src/core/fx-events.js`。
- render 不寫 `rt.state` 的玩法欄位；render 專用狀態放 `entity.fx`。
- 新增的模擬亂數一律走 `src/core/rng.js` 的 `rng()`。未設定種子時 `rng()` 直接回傳 `Math.random()`，所以既有 self-check 用 `Math.random = ...` 的替身仍有效。
- 共用檔案（`state.js`、`update.js`、`combat.js`、`flow.js`、`hud.js`、`index.html`、`self-check.js`）只在第 0 階段與整合階段修改；並行工作包只改自己擁有的模組（見 [11](11-phases-and-work-packages.md)）。
- 核心程式沿用 `var` / `function` 與 ES modules；循環 import 只在函式執行時使用。

## 自檢

- `node scripts/self-check.mjs` 必須通過。既有斷言只能在「規則被本計畫刻意改變」時修改，且必須同步改成新規則的斷言，不可刪除覆蓋範圍。
- 刻意改變並需要更新斷言的項目清單見 [09-architecture.md](09-architecture.md#自檢變更清單)。
- 新系統各自提供自檢案例（第 0 階段建立 `src/dev/checks/` 分檔）。

## 存檔相容

- 既有 key 全部保留讀取：`dust-reign:best-score:v1`、`dustReignBestScore`、`dust_reign_audio_muted`、`dust_reign_master_volume`、`dust_reign_haptics_enabled`、`dust_reign_motion_reduction`、`dust_reign_high_contrast`、`dust_reign_visual_quality`。
- 新 key 使用 `dust-reign:` 命名空間並帶版本號（見 [07](07-meta-progression.md#存檔格式)）。讀取失敗或格式錯誤時回到預設值，不阻擋遊玩。
- 不保存單局進度（平台沒有雲端存檔，本版也不做本機續玩）。

## 無障礙與效能

- 視覺版的 Reduced Motion、高對比與閃光上限規則全部適用於新敵人、首領與事件（見 [`../visual-overhaul/08-accessibility.md`](../visual-overhaul/08-accessibility.md)）。
- 新敵彈、預警必須畫在第 11 層可讀性層；所有預警至少 0.6 秒（首領大招至少 0.9 秒）。
- 效能目標不變：桌面 HIGH 60fps、手機直向 MEDIUM 在 4× CPU 節流下平均 45fps 以上。敵人上限仍為 95，新敵彈池需有上限。
