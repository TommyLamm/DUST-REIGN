# DUST//REIGN 版本紀錄

## V0.1.2 — 2026-10-05

Playroom 平台排行榜與成績 SDK 接入：

- 依平台最新規格引入 `playroom-sdk.js`，追蹤平台 `main` 分支最新規範與驗證工具。
- `game.json` 宣告 `leaderboard`（ID `dust-reign-score`，以整數分數降序排序）。
- 遊戲開始時呼叫 `Playroom.startRun()` 建立平台局次；結算死亡時呼叫 `Playroom.finishRun({ runId, score })`。
- 訪客、診斷預覽、離線或平台連線異常時不阻礙核心遊玩；僅在正式提交成功後顯示已保存標記。
- 升級 GitHub Actions Release workflow 追蹤平台 `main` 分支打包與完整 ZIP 驗證工具。

## V0.1.1 — 2026-10-04

- 修復頁面與開始／死亡／升級面板捲軸；版面依 iframe 寬高配置，不再靠最小高度或手機固定橫向比例撐開。
- UHD 放大面板、HUD 與文字；桌面短視窗、手機直向／橫向採不同密度，所有主要按鈕直接可見。
- 觸控按鈕至少 44px，加入 PAUSE／RESUME；修復多點觸控釋放與 pointer capture，避免操作卡住或放開移動時停止射擊。
- Canvas 透過 ResizeObserver 同步實際可用尺寸，重開及銷毀清理輸入；保留玩法、素材與舊最高分相容性。
- 本次未建立發布 tag 或 GitHub Release；驗收及成品見 `RELEASE.md`。

## V0.1.0 — 2026-10-04

首次 Playroom 靜態成品交付：

- 固定遊戲 ID `dust-reign`，建立完整 manifest 與實際遊玩封面。
- 建立白名單 staging、版本一致性檢查和 GitHub Release workflow。
- 使用平台 commit `3728de1c50d4b0263f9f5f279d33d5d205a385fa` 打包並完整驗證 ZIP；CI 驗證通過才建立 Release。
- 最高分寫入 `dust-reign:best-score:v1`，相容讀取舊 `dustReignBestScore`，保留既有玩法與資料。
- 支援裝置宣告為 `desktop`；詳細驗收及限制見 `RELEASE.md`。

## V0.0.1 — 2026-09-09

首個可玩的 MVP 垂直切片：

- 建立零依賴 Canvas 廢土戰場與終端機風格 HUD。
- 加入 WASD／方向鍵移動、滑鼠按住射擊、三種敵型、波次與分數。
- 擊殺掉落 scrap，升級時三選一；支援死亡、重開與觸控控制。
- 補上 Space／觸控 DASH：沿移動或瞄準方向位移約 140px、0.32 秒無敵、2.2 秒冷卻。
- 完成初始版響應式排版與可見鍵盤焦點。

畫面：`screenshots/v0.0.1-mvp.png`

## V0.0.2 — 2026-09-09

觸控可玩性增量：

- 手機／平板按下 FIRE 時，會自動選最近敵人作為瞄準點。
- 沒有敵人時保留原本的瞄準方向；桌面滑鼠瞄準不受影響。
- 控制提示補上自動導引說明，並保留線性掃描上限以維持零依賴。

畫面：`screenshots/v0.0.2-touch-aim.png`

## V0.0.3 — 2026-09-09

重玩動機增量：

- 每次死亡時以瀏覽器原生 `localStorage` 保存本機最高分。
- 頂欄顯示 BEST，結算畫面新增 BEST RUN；新分數較低時不覆蓋。
- 儲存不可用時安全回退為 0，不影響遊戲流程。

畫面：`screenshots/v0.0.3-high-score.png`

## V0.0.4 — 2026-09-09

戰場變化增量：

- 第 3 波起低機率出現精英訊號，擁有更高生命／接觸傷害與護環外觀。
- 精英擊殺給 180 分與 40 scrap，保留高風險高回報的 roguelike 決策。
- 沿用既有追擊、碰撞、粒子與敵人上限，不增加新依賴。

畫面：`screenshots/v0.0.4-elite-signal.png`

## V0.0.5 — 2026-09-09

連殺訊號增量：

- 連續 4 秒內擊殺會疊加 CHAIN，最多 8 層；每層讓該次擊殺分數提高 25%。
- Canvas HUD 顯示目前連殺層數與剩餘窗口，逾時自動歸零。
- 不改敵人生命、掉落、輸入或敵人上限；補上 selfCheck 的連殺計分驗證。

畫面：screenshots/v0.0.5-chain-signal.png

## V0.0.6 — 2026-09-09

脈衝衝刺增量：

- DASH 落點新增 0.24 秒氧化薄荷脈衝，對 88px 內敵人造成 80% 武器傷害。
- 脈衝沿用既有擊殺、掉落與連殺計分，沒有新增敵型或碰撞系統。
- 玩家周圍加入擴散護環，讓無敵與攻擊窗口更容易讀取。

畫面：screenshots/v0.0.6-dash-pulse.png
## V0.0.7 — 2026-09-09

安全暫停增量：

- 已開始的戰鬥可用 P 或 Esc 暫停／恢復，暫停期間停止敵人、子彈與計時更新。
- Canvas 顯示 SIGNAL PAUSED 與恢復提示，頂部狀態同步顯示 PAUSED。
- 開始、升級與死亡畫面不會被暫停快捷鍵誤切換。

畫面：screenshots/v0.0.7-safe-pause.png
## V0.0.8 — 2026-09-09

精英超頻核心增量：

- 精英擊殺額外掉落金色超頻核心；普通敵人不掉落。
- 拾取後啟動 6 秒 OVERDRIVE，射速縮短至 62%、子彈傷害提高 50%，時間到自動恢復。
- 新核心沿用既有 orb 吸附／拾取流程，HUD 顯示倒數與增幅內容。

畫面：screenshots/v0.0.8-overclock-core.png

## V0.0.9 — 2026-09-09

REPAIR SCRAP 生存增量：

- brute／elite 擊殺額外掉落紅橙修復碎片；crawler／rusher 維持原有 scrap 掉落。
- 拾取修復碎片最多回復 18 點 Hull，不提供 XP，滿血也會消耗掉落物。
- Canvas 以十字修復 orb 呈現，HUD 狀態回饋實際修復量；補強 selfCheck 驗證掉落與回血封頂。
- 更新架構資料契約，維持零依賴與既有 orb 吸附流程。

畫面：screenshots/v0.0.9-repair-scrap.png

## V0.0.10 — 2026-09-09

WAVE BOUNTY 增量：

- 每波建立擊殺目標與一次性分數賞金；達標後只結算一次，下一波重新計算。
- Mission rail 同步顯示目標、進度、賞金與 LOW／HIGH／CRITICAL 威脅級別。
- 不新增敵型、碰撞或資源系統；賞金不改 XP、掉落、連殺或敵人上限。
- `selfCheck()` 驗證一次性派獎與換波重置；完成畫面截圖保留 mission rail 的實際進度。

畫面：screenshots/v0.0.10-wave-bounty.png

## V0.0.11 — 2026-09-09

BOUNTY SURGE 增量：

- bounty 達標除一次性分數外啟動 3 秒 OVERDRIVE；已有更長超頻時保留原倒數。
- HUD 沿用 OVERCLOCK 進度條，狀態文字追加 SURGE 秒數，讓完成賞金有即時火力回報。
- selfCheck 補上 3 秒啟動與較長超頻保留驗證；不改 XP、掉落、敵型或依賴。

畫面：screenshots/v0.0.11-bounty-surge.png

## V0.0.12 — 2026-09-09

SALVAGE OVERFLOW 增量：

- 滿 Hull 撿到 repair scrap 時不再只是浪費，改為固定 +12 SCORE；受傷時仍按原規則回血。
- 狀態文字顯示 `REPAIR SCRAP FULL +12 SCORE`，不增加 XP、不改最大生命與掉落生命周期。
- selfCheck 補上滿血轉分與受傷零 overflow 分驗證。

畫面：screenshots/v0.0.12-salvage-overflow.png

## V0.0.13 — 2026-09-09

SCAV RADIO 增量：

- bounty 達標、波次推進、repair 回復與滿血 overflow 會寫入右側事件欄。
- 最新事件插到頂端並限制 5 筆，含當局時間戳；重開只清除動態事件，找不到 run log 時遊戲仍可運作。
- 沿用既有 DOM／CSS，不新增後端、儲存或事件匯流排。

畫面：screenshots/v0.0.13-scav-radio.png

## V0.0.14 — 2026-09-09

STORM CLOCK 增量：

- 每波最後 5 秒進入 STORM FRONT，敵人生成間隔乘以 0.72，提升波末壓力峰值。
- mission rail 新增 STORM CLOCK 倒數（`STORM FRONT 05s` / `NEXT FRONT 30s`）。
- 換波後倒數重置為 30s；selfCheck 擴充 storm clock 與波末壓力驗證。
- 不改波次長度、敵人生命、掉落或升級；維持零依賴與純前端架構。

畫面：screenshots/v0.0.14-storm-clock.png
