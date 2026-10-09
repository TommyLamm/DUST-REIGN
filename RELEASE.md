# DUST//REIGN 0.3.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.3.0`，對應 tag 應為 `v0.3.0`。

**尚未發布。** 尚未建立 tag、尚未建立 GitHub Release，也尚未在 Playroom 匯入或上架。日後的 GitHub Release 亦不代表已在平台上架。既有已發布版本不可覆寫。

## 0.3.0 視覺全面改造

玩法、數值、既有本機存檔 key、排行榜 ID `dust-reign-score` 與 `window.LunaGame` 公開 API 維持不變。新增畫質偏好 `dust_reign_visual_quality`（`auto`、`high`、`medium`、`low`；未設定時為 `auto`）。

1. **地表與大氣**：離屏地表快取，波次色調（dusk／rust／night）與風暴霧帶、浮塵、色彩分級、暗角。暫停時渲染時鐘仍前進。
2. **光照**：HIGH 為半解析度 lightmap；MEDIUM／LOW 改以加法光暈與暗角。光暈使用預渲染貼圖，不再使用 `shadowBlur`。
3. **實體**：玩家機甲、敵型、環境物件與掉落物重繪，含接地陰影、受擊閃白與出生姿態。這些暫存放在 `entity.fx`，不影響模擬。
4. **戰鬥視覺**：`src/core/fx-events.js` 把擊殺、暴擊、核心、油桶、迫擊砲、EMP、避雷柱、衝刺、擦彈、玩家受擊、泰坦階段、賞金與超頻湧流交給 `src/render/fx.js`（粒子、傷害數字、螢幕閃光）。事件不改變玩法。
5. **介面動效**：`css/animations.css` 涵蓋 HUD、開始畫面、升級選卡、結算與暫停。選卡規則不變。
6. **畫質分級**：暫停 SYSTEM 分頁循環 AUTO／HIGH／MEDIUM／LOW。`auto` 只降不升；手動等級不自動降級。各級預算以 `src/render/quality.js` 為準。
7. **無障礙**：減動效停用螢幕閃光、膠片顆粒與多數 CSS 動畫，並縮短受擊閃白；震屏與 hitstop 仍歸零。高對比停用 lightmap、色彩分級與暗角，敵我標記留在可讀性層。

## 平台接入規範與成品

- 規格與工具來源：追蹤 [Playroom Platform main 分支](https://github.com/TommyLamm/playroom-platform)。撰寫本文件時已讀取 `main` 的 Manifest Schema（2026-10-08）。打包與驗證必須再取當時的 `main`，不沿用本文件的讀取時間。
- 成品位置：`output/release/0.3.0/game` 與 `output/release/0.3.0/game.zip`。2026-10-08 已完成本機 staging 與平台 ZIP 驗證，尚未發布。版本目錄已存在時 `scripts/stage-release.mjs` 會拒絕覆寫。
- `game.json` 版本 `0.3.0`（不含 `v`）。`leaderboard` 仍為 ID `dust-reign-score`，降序，單位「分」，範圍 0 至 9007199254740991。
- ZIP 根目錄應包含 `game.json`、`index.html`、`playroom-sdk.js`、`cover.png`，以及 `src/` 與 `css/`。`css/animations.css` 與新增的 render／`fx-events` 模組由白名單 `css/**/*.css`、`src/**/*.js` 收集。
- 無編譯依賴、無後端。帳號成績仍由 `Playroom.startRun()`／`Playroom.finishRun({ runId, score })` 處理；只有 `saved: true` 才可顯示已保存。

## 驗收狀態

2026-10-08 以 Node v24.19.0 完成本機驗收。平台工具為當日 `main` `0115330e0ba3f5722e25d64a0b3c7eb6f383da30`。

| 項目 | 狀態 |
| --- | --- |
| `src/**/*.js`、`playroom-sdk.js`、`scripts/stage-release.mjs` 的 `node --check` | 通過。另已檢查 `scripts/self-check.mjs`。`src` 共 49 個 JS 檔，全部通過。 |
| `node scripts/self-check.mjs` | 通過。回傳 `ok: true`（12 張升級、6 個融合）。 |
| `node scripts/stage-release.mjs` | 通過。寫入 `output/release/0.3.0/game` 與 `output/game`，含 `game.json`、`index.html`、`cover.png`、`playroom-sdk.js`、`css/animations.css` 與 `src/render` 新模組。升級標題 CSS 修正後已重新 staging。 |
| 平台 `main` 最新工具 `npm run game:pack` 與 `npm run game:validate` | 通過。`Packed dust-reign v0.3.0`，`Valid: dust-reign v0.3.0`。ZIP `output/release/0.3.0/game.zip`，703966 bytes，SHA-256 `6c1a2b3ecadc1324ab08f0ed65c31a65f216745b5ca6e07b79fa9902e0dd95f8`。 |
| 版本子目錄載入，以及與平台相同的跨來源 sandbox iframe | 通過。遊戲在 `http://127.0.0.1:8162/0.3.0/game/index.html`，父頁在 `http://localhost:8163/parent.html`。sandbox 為 `allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen`。未跳轉頂層、未開 popup。Edge 會對 `allow-fullscreen` 這個 sandbox token 報解析錯誤；其餘 token 仍生效，全螢幕改由 `allow="fullscreen"` 表達。 |
| 桌面與手機直向：開始、主要玩法、暫停、升級、死亡、重新開始 | 通過。桌面 iframe 約 1100×650：移動、射擊、衝刺、EMP、升級選卡、暫停、死亡面板、重新開始。手機直向 390×844、`hasTouch`、`isMobile`：搖桿、FIRE、DASH、EMP 皆有作用；`#empReady` 在電量 ≥ 50 時完整可見（54×11，未超出視埠，也沒有被 overflow 裁切）。 |
| 畫質 `auto`／`high`／`medium`／`low`、減動效、高對比 | 通過。暫停選單按鈕依 AUTO → HIGH → MEDIUM → LOW → AUTO 循環，手動等級會改 `data-quality`。AUTO 的有效等級可以是 high 或 medium；桌面短局中曾由 high 降到 medium。減動效與高對比可開關。重新載入後 `dust_reign_visual_quality` 仍為 `high`。 |
| console、缺失資源、既有最高分與新增畫質 key 的存檔相容 | 通過，附兩項非遊戲資源訊息。無 page error、無外部請求、無遊戲檔 404。僅 `favicon.ico` 404，以及上述 sandbox token 警告。舊 key `dustReignBestScore`＝4242 讀成 HUD `004242`，現行 key `dust-reign:best-score:v1` 維持 100。standalone 的 `Playroom.ready()` 為 `available: false`、`mode: standalone`；本機父頁模擬 guest init 後為 `available: false`、`mode: guest`。兩種情況都可玩，結算徽章保持隱藏，沒有 SCORE SAVED。 |
| `cover.png` 是否為 0.3.0 畫面，且不超過 5 MiB | 通過。800×500 PNG，548808 bytes。HIGH 畫質、靜音、波次戰鬥，含多種敵人、彈道與光暈；HUD 可見，血量顯示正常。 |

版面修正：`css/upgrades.css` 的 `.upgrade-count` 已有 `flex-direction: column`，但桌面規則少了 `display: flex`，升級標題右側的「DECISION WINDOW」與「COMBAT PAUSED」會疊在同一行。已補上 `display: flex`（約第 59 行）。沒有改玩法或 render。修正後已重新 staging、打包、驗證，並重截升級與結算畫面。

## 限制與未執行項目

- 0.3.0 尚未發布，不能匯入或上架。
- 平台帳號排行榜需待管理員匯入並發布此版本後才會對此外觀版本生效。
- 瀏覽器本機最高分與平台排行榜獨立；本機最高分不自動匯入帳號。
- 視覺計畫中的幀率目標尚未在此記錄實測。桌面 HIGH／手機 MEDIUM 的平均幀率、以及 AUTO 降級是否在長時間戰鬥中維持目標，都未驗證。
- 未驗證：管理員在平台上的實際遊玩預覽、SDK 診斷面板，以及登入帳號 `finishRun()` 回傳 `saved: true`。本機 guest 只是父頁送出 init，不是平台上的真實訪客或預覽連線。

## 重現打包

使用 Node 24，於遊戲 repository 執行：

```sh
node scripts/stage-release.mjs
```

在平台工具 checkout（`main` 最新內容、已 `npm ci`）執行。ZIP 必須放在成品目錄之外：

```sh
npm run game:pack -- <repository>/output/release/0.3.0/game <repository>/output/release/0.3.0/game.zip
npm run game:validate -- <repository>/output/release/0.3.0/game.zip
```

上述指令已於 2026-10-08 執行。平台工具 commit 為 `0115330e0ba3f5722e25d64a0b3c7eb6f383da30`。ZIP 先產生在成品目錄之外，驗證通過後才複製到 `output/release/0.3.0/game.zip`。
