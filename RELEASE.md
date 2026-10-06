# DUST//REIGN 0.2.0

遊戲 ID `dust-reign`；Playroom 排行榜與成績 SDK 接入版，交付版本 `0.2.0`，對應 tag `v0.2.0`。GitHub Release 不代表已在 Playroom 匯入或上架。

## 重大改動與戰術擴展

本次版本為重大功能與手感升級（v0.2.0），包含戰術深度、打擊反饋、音訊體驗與無障礙全面強化：

1. **Web Audio 程序合成音效（Procedural Sound Engine）**：
   - 零外部音效素材依賴，基於 Web Audio API 實現高精度程序化音效合成（射擊衝擊、擊中頓挫、爆炸低頻、升級卡選取、EMP 脈衝、擦彈音效與風暴環境低鳴）。
   - 支援玩家手勢啟動解鎖與自適應音量調節。
2. **Hitstop 頓幀打擊感與動態反饋**：
   - 引入微型幀凍結（Hitstop）與螢幕鏡頭震動（Screenshake），給予重型武器、精英怪受擊與擊殺紮實的回饋感。
3. **後座力與拋殼物理物件池（Recoil & Shell Casings）**：
   - 射擊時具備微後座力位移與槍口火光（Muzzle Flash），並支援高效彈殼拋出與地面彈跳物件池。
4. **12 張三分類升級卡庫與保底演算法（3-Category 12-Card Pool & Pity System）**：
   - 擴充至 12 張風格鮮明的戰術卡牌，涵蓋火力（Offensive）、機動（Tactical）、防禦／支援（Utility）。
   - 升級抽卡提供動態保底演算，避免抽卡極端偏廢，深化局內構建（Build）流派。
5. **新型敵種：迫擊砲機甲（Mortar Mech Artillery）**：
   - 新增遠程曲射迫擊砲機甲，能向玩家預判落點投射範圍高爆彈幕，打破純近戰風箏策略。
6. **Wave 5 / 10 荒原泰坦 Boss 首領戰（Wasteland Titan Boss Encounter）**：
   - 階段性首領登場，具備高血量、多階段衝刺突擊、旋轉彈幕與重型壓迫機制。
7. **EMP 震爆雷次要主動技能（EMP Shock Grenade）**：
   - 新增冷卻型戰術次要武器，引爆後清除周遭敵彈並癱瘓敵人行動，提供高危險絕境下的主動解圍手段。
8. **戰鬥遙測與擦彈系統（Combat Telemetry & Graze Mechanic）**：
   - 新增精密擦彈判定（Graze），掠過敵彈可獲得額外評分與超載計量充能；結算畫面提供命中率、擦彈數、承受傷害等戰術遙測數據。
9. **全功能暫停診斷選單（In-Game Pause & Diagnostic Menu）**：
   - 按 P 或 Esc 呼叫暫停介面，可檢視當前局次數據、SDK 連線狀態、音量設定與操作說明。
10. **浮動動態類比搖桿（Dynamic Floating Virtual Joystick）**：
    - 移動端支援動態依手指按壓位置生成的虛擬搖桿，解決固定按鈕操作手感限制。
11. **CRT 斷電光帶與破紀錄金印（CRT Collapse Animation & Record Seal）**：
    - 死亡結算呈現復古 CRT 斷電橫條光帶收縮特效；打破本機或平台個人最高分時加蓋動態「RECORD SEAL」金印。
12. **高對比無障礙模式（High Contrast Accessibility Mode）**：
    - 支援高對比色彩配置與強化敵我輪廓辨識，提供更友善的可讀性。

## 平台接入規範與成品

- 規格與工具來源：追蹤 [Playroom Platform main 分支](https://github.com/TommyLamm/playroom-platform)。
- 成品位置：`output/release/0.2.0/game.zip`。
- `game.json` 宣告 `leaderboard`（ID `dust-reign-score`，降序排列，單位「分」，範圍 0 至 9007199254740991）。
- ZIP 根目錄包含 6 個檔案：`game.json`、`index.html`、`styles.css`、`game.js`、`playroom-sdk.js`、`cover.png`。
- 無編譯依賴、無後端、無外部素材，全自有資源保持相對路徑，符合跨來源 sandbox iframe 隔離規範。
- 局次生命週期依循 Playroom SDK：開始局呼叫 `Playroom.startRun()`，死亡結算呼叫 `Playroom.finishRun({ runId, score })`；僅在 `saved: true` 時顯示已保存標記。

## 已通過驗收

- 語法與一致性檢查：`node --check game.js`、`node --check playroom-sdk.js`、`node --check scripts/stage-release.mjs`。
- 本機單元自我檢查：`LunaGame.selfCheck()` 全項通過（包含 12 張升級卡、迫擊砲砲擊判定、擦彈計量、超載湧流、波次重置等）。
- 平台打包與驗證：使用平台最新 `npm run game:pack` 與 `npm run game:validate` 完整驗證通過（`Valid: dust-reign v0.2.0`）。

## 限制與未執行項目

- 平台帳號排行榜需待管理員於 Playroom 後台匯入並發布此版本後正式生效。
- 瀏覽器本地最高分與平台排行榜獨立運作；本地最高分保存在 `localStorage`，不自動匯入平台歷史。

## 重現打包

使用 Node 24，執行：

```sh
node scripts/stage-release.mjs
```

在平台工具 checkout 目錄執行：

```sh
npm run game:pack -- <repository>/output/release/0.2.0/game <repository>/output/release/0.2.0/game.zip
npm run game:validate -- <repository>/output/release/0.2.0/game.zip
```
