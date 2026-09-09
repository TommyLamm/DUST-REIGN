# DUST//REIGN 版本紀錄

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
