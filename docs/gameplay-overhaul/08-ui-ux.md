# 08 介面與體驗

[返回索引](README.md)

沿用 v0.3.0 的 CRT／Sodium Dusk 風格與 `css/animations.css` 的共用動畫與 Reduced Motion 規則。所有新面板：手機直向 390×844 不裁切、觸控目標 ≥ 44px、鍵盤與手把可操作、`aria` 標籤完整。既有 DOM id 不改名。

## 開局配裝（開始畫面）

在 `#startScreen` 的開始按鈕上方新增 `#loadoutPanel`：

- **機體列**：4 張機體卡（未解鎖顯示鎖與解鎖條件，例如 `REQ: 25 JUST DASHES`）。
- **主武器列**：4 把武器，顯示射速、傷害型態與一句定位。
- **Heat 選擇**：`HEAT 0–5` 的步進器，只能選已解鎖的級數；顯示分數倍率。
- **模式切換**：`STANDARD` / `DAILY`。每日模式鎖定機體、武器與 Heat，並顯示今日規則與本機每日最佳。
- 選擇存進 meta（下次開啟沿用）。
- 鍵盤：`↑/↓` 換列、`←/→` 切換該列、`Enter` 開始（焦點在配裝面板內時不直接開局，開始按鈕除外）。圖鑑以 `←/→` 換頁、`Esc` 關閉。手把：D-pad／左搖桿、A 確認。
- `LEGACY BEST` 小字顯示舊版最高分。
- 圖鑑入口按鈕 `CODEX`。

## 升級面板

在現有 `#upgradeChoices` 面板加入：

- 卡面：稀有度色條與角標、層數 `2/5`、`COMPLETES: <FUSION>` 標記、武器專屬卡顯示武器圖示。
- 面板底部控制列：`REROLL (n)`、`BANISH (n)`、`SKIP`。放逐為兩段式：按下 BANISH 進入選擇模式，再點一張卡確認，`Esc` 取消。
- 鍵盤：`1/2/3` 選卡（既有）、`R` 重抽、`B` 放逐、`X` 跳過。面板打開後約 400ms 內忽略 `R`／`B`／`X`。手把：A 選目前卡片、X 重抽、Y 放逐、B 跳過。
- 發牌動畫沿用 v0.3.0；重抽時三張一起翻面重發。

## 幕間面板

`#interludePanel`（新），首領死亡後顯示，模擬暫停：

1. **ROUTE**：3 張路線卡（區段規則 + 獎勵 + 區段色調預覽）。
2. **ARMORY**：三選一（換主武器 → 開武器選擇子面板；強化 Mastery；修理 50% + 1 重抽）。
3. 確認後顯示下一幕標題卡（`ACT II — RUST BASIN`）1.5 秒，然後恢復遊戲。

## 撤離面板

`#extractPanel`（新），第 15 波首領死亡後顯示：

- 本局分數、撤離獎勵預覽、`EXTRACT` 與 `PUSH DEEPER` 兩個大按鈕。
- `PUSH DEEPER` 下方說明「死亡時撤離獎勵只得 50%」。

## 戰鬥 HUD

- **幕與波**：波次牌改為 `ACT I · WAVE 03`；首領波顯示首領名稱。
- **突變橫幅**：開波時顯示突變名稱與一句說明 2.5 秒；HUD 角落保留小標籤。
- **合約 HUD**：`#contractTracker`（新），顯示條件、進度（例如 `GRAZE 7/12`）與獎勵圖示；完成時打勾並播放領獎動畫；失敗（例如 `no-damage` 被打斷）只重置進度不消失。
- **重抽幣與放逐**：資源列新增小計數。
- **衝刺過熱**：衝刺鈕／衝刺指示外圈 1–3 格過熱刻度。
- **首領血條**：既有 Titan 血條改為通用 `rt.state.boss`；Sovereign 護盾期間顯示 `SHIELDED` 與風暴塔小血條；Dreadnought 暈眩時顯示 `REACTOR EXPOSED`。
- **風向預警**：Sovereign 改風向前 1 秒，HUD 風向指示閃爍並顯示新方向箭頭。
- **提示條**：`#tipToast`（新），見 [06](06-skill-scoring-controls.md#新手提示)。

## 結算畫面

- 標題：撤離 `EXTRACTED`、死亡維持既有死亡標題。
- 分數明細：依 `state.scoreBreakdown` 列出 KILLS / WAVES / BOSSES / STYLE / CONTRACTS / EXTRACTION，沿用滾動計數動畫。
- 既有遙測（波次、準確率、最大連殺、擦彈、總傷害）保留。
- 評級印章：新增 `S+`。
- `UNLOCKED` 區：本局新解鎖的成就、機體、Heat。
- 帳號成績徽章規則不變（只有 `saved: true` 才顯示已保存）。

## 暫停選單

- BUILD 分頁：武器改為只讀（顯示主武器、Mastery 等級、已取得卡含 `INACTIVE` 標記與融合狀態）。
- SYSTEM 分頁：新增 `TIPS: ON/OFF`、`RESET TIPS`。
- 新增 RUN 分頁（或併入 BUILD）：目前幕、路線規則、突變、合約、Heat 與倍率。

## 圖鑑

`#codexPanel`（新），從開始畫面進入：

- **成就**：全部成就與進度（已解鎖顯示時間）。
- **敵人**：已遇過的敵型與首領（未遇過顯示剪影與 `UNKNOWN`）。遇敵紀錄存 meta `stats.seenEnemies`。
- **融合**：已見過的融合配方。
- **統計**：累計統計。

## 樣式檔

新增 `css/loadout.css`、`css/interlude.css`、`css/contracts.css`、`css/codex.css`；在 `index.html` 中放在 `animations.css` 之後、`responsive.css` 之前，讓既有 responsive 與 high-contrast 覆蓋規則仍然生效。各工作包只改自己的樣式檔。
