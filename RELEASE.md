# DUST//REIGN 0.4.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.4.0`，對應 tag 應為 `v0.4.0`。

**尚未發布。** 尚未 commit 本次改動，尚未建立 tag、尚未建立 GitHub Release，也尚未在 Playroom 匯入或上架。日後的 GitHub Release 亦不代表已在平台上架。既有已發布版本不可覆寫。

## 0.4.0 玩法改造

計分規則已改變，因此榜單換成新 ID。舊榜 `dust-reign-score` 不再提交，由平台保留。

1. **一局結構**：三幕各 5 波。第 5、10、15 波分別是 Titan、Dreadnought、Storm Sovereign。幕間可選路線與軍械庫。第 15 波可 EXTRACT，或 PUSH DEEPER 進入無盡；帳號成績只在最終結束時提交一次。
2. **戰場**：新增 Spitter、Scurrier、Warden、Burrower，以及 volatile、splitter 詞綴。波次含突變、合約與補給。
3. **構築**：開局選機體與主武器。局內不再換槍。升級有稀有度、層數上限、重抽、放逐、跳過、新卡、融合與精通。
4. **局外**：機體、Dust Heat、成就、每日挑戰與圖鑑。每日種子用玩家本地日期。
5. **計分與評級**：分數集中經 `addScore`。結算有分數明細。B 30000、A 90000、S 220000 或撤離；S+ 為撤離且 Heat ≥ 2。
6. **操作**：Shift 或 Space 衝刺。Q、E 或右鍵 EMP。升級為 1／2／3、R、B、X。手機 EMP 可拖曳落點，FIRE 黏性鎖定。手把遊玩中可用 D-pad，並能累積火神持續開火。
7. **提示**：首次情境提示可關閉與重設。

## 存檔相容

新增 `dust-reign:meta:v1`、`dust-reign:best-score:v2`、`dust-reign:daily:v1`、`dust-reign:tips:v1`、`dust-reign:tips-enabled:v1`。

`dust-reign:best-score:v1` 與 `dustReignBestScore` 只讀、不刪、不再被新分數覆寫。開始畫面以 LEGACY BEST 顯示兩者中較高的舊紀錄。`dust_reign_visual_quality` 維持原格式。壞掉的 meta JSON 讀取時逐欄回退預設；該局正常結束後會寫回一份合法 meta，不會沿用壞字串。不保存單局進度。本機最高分不匯入帳號。

## 新榜

`leaderboard.id` 為 `dust-reign-score-v2`。降序，單位「分」，範圍 0 至 9007199254740991。換榜是因為擊殺、過波、無傷、首領、風格、合約與撤離的計分方式已不同，不能沿用舊榜規則。

## 平衡紀錄

校準日 2026-10-09。使用者已接受 P3 數值。細節見 `output/balance/p3-summary.md` 與 `docs/gameplay-overhaul/10-balance-sheet.md`。下列數字已與程式核對，沒有發現文件應寫、但程式不同的項目。

| 指標 | 結果 |
| --- | --- |
| skilled 存活 p10／p50／p90 | 6.9／10／20（Heat 0，30 局） |
| skilled Titan／Dreadnought／Sovereign | 約 66／66／87 秒，落在 40–70、60–90、80–120 |
| skilled 分數 p10／p50／p90 | 34916／87054／287670 |
| 評級 | B 30000、A 90000、S 220000；S+ 仍是撤離且 Heat ≥ 2 |
| 效能 | 無頭 1280×720、約 98 敵、200–260 發首領彈：HIGH 平均 4.78 ms，60fps 預算 16.67 ms |

已知風險：平衡是以會躲彈的完美瞄準機器人校準，真人首領戰可能較長。Kite 幾乎打不完 Titan。Heat 0–2 的死亡中位數都在第 10 波，階梯到 Heat 3 才明顯。Sovereign 的 87 秒是注入第 15 波的樣本。首領普攻每 0.4 秒只有前 55 點全額，其餘 ×0.25；核心 350 與踢桶 240 不打折。沒有真人遊玩，也沒有手機 4 倍節流的幀率實測。

## 平台接入規範與成品

- 規格與工具來源：追蹤 [Playroom Platform main 分支](https://github.com/TommyLamm/playroom-platform)。2026-10-09 已重新讀取 `main` 的開發標準、Manifest Schema、Release workflow 範本與 `playroom-sdk.js`。倉庫內 SDK 與當時 main 一致，沒有改寫。打包前再次 `fetch`／`pull`，平台 commit 仍為 `0115330e0ba3f5722e25d64a0b3c7eb6f383da30`。
- `.github/workflows/release.yml` 已與最新範本核對。`GAME_DIR` 維持 `output/game`。版本檢查前的語法檢查、自檢與 staging 保留。Node 24、暫存目錄 clone `main`、`npm ci`、`game:pack`／`game:validate`、token 只進發布步驟，且沒有 `continue-on-error`。發布步驟仍用遊戲的標題與 `RELEASE.md`，沒有改成範本的 `--generate-notes`。
- 成品位置：`output/release/0.4.0/game` 與 `output/release/0.4.0/game.zip`。版本目錄已存在時 `scripts/stage-release.mjs` 會拒絕覆寫。
- `game.json` 版本 `0.4.0`（不含 `v`）。
- ZIP 根目錄包含 `game.json`、`index.html`、`playroom-sdk.js`、`cover.png`，以及 `src/` 79 個 JS 與 `css/` 15 個 CSS。不含 `scripts/`、`docs/`、`output/`、`.playwright-cli/`。
- 無編譯依賴、無後端。只有 `finishRun()` 回傳 `saved: true` 才可顯示已保存。

## 驗收狀態

2026-10-09 以 Node v24.19.0 完成本機驗收。平台工具為當日 `main` `0115330e0ba3f5722e25d64a0b3c7eb6f383da30`。

| 項目 | 狀態 |
| --- | --- |
| `node --check`：`src/**/*.js`、`playroom-sdk.js`、`scripts/*.mjs`、`scripts/balance/*.mjs` | 通過。共 88 個檔案。音效修正後已再檢查 `src/audio/audio-fx.js`。 |
| `node scripts/self-check.mjs` | 通過。回傳 `ok: true`（26 張升級、10 個融合）。音效修正後重跑仍為 `ok: true`。 |
| `node scripts/stage-release.mjs` | 通過。`output/release/0.4.0/game` 含 manifest、入口、封面、SDK、79 個 `src` JS、15 個 CSS。不含 `scripts/`、`docs/`、`output/`。 |
| 平台 `main` `npm run game:pack` 與 `npm run game:validate` | 通過。`Packed dust-reign v0.4.0`，`Valid: dust-reign v0.4.0`。ZIP `output/release/0.4.0/game.zip`，814875 bytes，SHA-256 `f91203d0ced8974268aefb7941dcbcbd9648becd597c47da40d3cae738482dfd`。98 個 entries。 |
| 版本子目錄載入，以及與平台相同的跨來源 sandbox iframe | 通過。遊戲在 `http://127.0.0.1:8262/0.4.0/game/index.html`，父頁在 `http://localhost:8263/parent.html`。sandbox 為 `allow-scripts allow-same-origin allow-pointer-lock`，`allow="fullscreen"`。未跳轉頂層。 |
| 桌面約 1100×650：配裝、開局、移動、射擊、衝刺、EMP、升級、暫停、幕間、撤離面板、死亡、回到配裝重開 | 通過。iframe 1100×650。配裝含機體、武器、Heat、每日與圖鑑。WASD 的 W 讓玩家上移。射擊產生彈體。Shift 衝刺位移約 140。E 消耗 EMP 能量。升級以 R 重抽、B 放逐並確認、X 跳過。Esc 暫停與恢復。注入幕間可見 CHOOSE A ROAD，注入撤離面板可見 EXTRACT 與 PUSH DEEPER。死亡評級 B／IRON SCRAPPER，明細含 KILLS／WAVES／BOSSES／STYLE／CONTRACTS／EXTRACTION。RUN IT BACK 回到配裝，可再開始。 |
| 手機直向 390×844、`hasTouch`、`isMobile` | 通過。觸控列為 flex。搖桿、EMP、DASH、FIRE 皆至少 56px，落在視埠內，根節點沒有橫向溢出。搖桿上移、FIRE 增加射擊、DASH 進入冷卻。EMP 拖回按鈕不扣 50 能量；拖離後出現落點準星並扣能量。 |
| console、缺失資源、外部請求 | 通過，附非遊戲資源訊息。無 page error、無外部請求、無遊戲檔 404。父頁與遊戲來源的 `favicon.ico` 404。 |
| SDK standalone 與模擬 guest | 通過。standalone 的 `ready()` 為 `available: false`、`mode: standalone`。父頁模擬 guest init 後為 `available: false`、`mode: guest`。兩種都可遊玩，結算徽章保持隱藏，沒有 SCORE SAVED。 |
| 存檔相容 | 通過。預置 `dustReignBestScore`＝4242、`dust-reign:best-score:v1`＝100、`dust_reign_visual_quality`＝high。開始畫面 LEGACY BEST 為 004242，v2 BEST 為 000000，`data-quality` 為 high。壞 JSON 的 `dust-reign:meta:v1` 讀成 SCRAPPER／Heat 0。跑完一局後這三個舊 key 仍是原值。meta key 在結算時被寫成合法 JSON，沒有留著壞字串。 |
| `cover.png` | 通過。800×500 PNG，549066 bytes。第 15 波 Storm Sovereign、風暴塔與新敵型，HUD 可見，音效關閉，沒有除錯或暫停面板。 |

驗收中發現並已做最小修正：射擊與衝刺的噪音增益對 `GainNode` 呼叫了 `exponentialRampToValueAtTime`，會變成未捕捉例外。已改為對 `nGain.gain` 呼叫。修正後已重新 staging、打包與驗證，並重跑瀏覽器驗收。沒有改玩法數值。

## 限制與未執行項目

- 0.4.0 尚未 commit、尚未發布，不能匯入或上架。
- 未驗證：管理員在平台上的實際遊玩預覽、SDK 診斷面板，以及登入帳號 `finishRun()` 回傳 `saved: true`。本機 guest 只是父頁送出 init。
- 未驗證：平台上新榜 `dust-reign-score-v2` 的排序、單位與範圍是否與 manifest 一致。本機 ZIP 驗證通過不代表榜單已在平台建立。
- 未驗證：實體手把、減動效與高對比對全部新內容的實機巡覽、桌面 HIGH／手機 MEDIUM 的長時間幀率，以及手機 4 倍節流。
- 未驗證：真人從第 1 波打完三幕。平衡數字來自機器人，真人首領戰可能較長。
- 瀏覽器本機最高分與平台排行榜獨立；本機最高分不自動匯入帳號。

## 重現打包

使用 Node 24，於遊戲 repository 執行：

```sh
node scripts/stage-release.mjs
```

在平台工具 checkout（`main` 最新內容、已 `npm ci`）執行。ZIP 必須放在成品目錄之外：

```sh
npm run game:pack -- <repository>/output/release/0.4.0/game <repository>/output/release/0.4.0/game.zip
npm run game:validate -- <repository>/output/release/0.4.0/game.zip
```

上述指令已於 2026-10-09 執行。平台工具 commit 為 `0115330e0ba3f5722e25d64a0b3c7eb6f383da30`。
