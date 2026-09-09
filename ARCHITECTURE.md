# Architecture Overview — DUST//REIGN

這份文件是給開發者與 coding agent 使用的活架構說明；程式碼與瀏覽器實際行為是最終真相。格式參考 [ARCHITECTURE.md template](https://architecture.md/)。目前專案是一個零依賴、單頁、純瀏覽器 Canvas roguelike 射擊遊戲，沒有後端或建置流程。

## 1. 專案結構（Project Structure）

```text
.
├── index.html          # 靜態頁面外殼、HUD、開始／死亡／升級畫面、觸控按鈕
├── styles.css          # 視覺系統、版面、響應式斷點、焦點與 reduced-motion 規則
├── game.js             # 遊戲 runtime：狀態、輸入、模擬、碰撞、Canvas 繪製、DOM 同步
├── PLAN.md             # 目標、增量計畫與驗收條件
├── CHANGELOG.md        # 版本與畫面留痕
├── screenshots/        # 版本截圖；僅供文件／驗收，不是 runtime 素材
├── AGENTS.md           # repository-level agent 規範
└── ARCHITECTURE.md     # 本文件
```

沒有 `package.json`、`node_modules`、bundler、外部素材目錄或伺服器程式。`.codegraph/` 若存在，是本地程式索引工具的產物，不是遊戲執行依賴。

## 2. 高階系統圖（High-Level System Diagram）

```text
┌────────────────────────────────────────────────────────────┐
│ Browser                                                    │
│                                                            │
│  index.html ── loads ── styles.css                         │
│      │                    (layout / visual presentation)   │
│      └─────────────── loads ── game.js                    │
│                                  │                         │
│   keyboard / pointer / touch ────┼──> input buffer         │
│                                  │                         │
│   requestAnimationFrame ─────────┼──> update(dt)            │
│                                  │       │                  │
│                                  │       ├─ state mutation  │
│                                  │       ├─ collisions      │
│                                  │       ├─ waves / XP      │
│                                  │       └─ game-over       │
│                                  │                          │
│                                  ├──> draw() ──> Canvas 2D  │
│                                  └──> updateDomUi() ─> HUD  │
│                                                            │
│   localStorage <──── read/write best score only             │
└────────────────────────────────────────────────────────────┘
```

所有資料都在同一個頁面記憶體內流動。`game.js` 是唯一的遊戲狀態擁有者；`index.html` 提供可選的 DOM 節點，`styles.css` 不參與遊戲規則。

## 3. 核心元件（Core Components）

### 3.1 靜態頁面與呈現層

- **`index.html`**：宣告 `#gameCanvas`、HUD 數值／進度條、開始畫面、死亡畫面、升級選項、任務側欄與觸控控制。
- **`styles.css`**：提供 DUST//REIGN 的鏽橙／琥珀／薄荷綠終端機風格；處理 `720px`、`900px` 等響應式版面，以及 `prefers-reduced-motion`。
- **技術**：原生 HTML、CSS、Canvas 2D；只引用同目錄的 `styles.css` 與 `game.js`。

### 3.2 遊戲 runtime（`game.js`）

檔案使用嚴格模式 IIFE，並將少量公開操作掛到 `window.LunaGame`。內部函式依責任分成幾組：

| 區域 | 主要函式 | 責任 |
| --- | --- | --- |
| DOM／尺寸 | `setupDom`, `resize`, `updateDomUi`, `logEvent` | 找到或建立 Canvas／overlay，處理 DPR、尺寸、HUD／ARIA 與 SCAV RADIO 更新 |
| 輸入 | `bindInput`, `pointerPosition`, `beginRun`, `togglePause` | 鍵盤、滑鼠／指標、觸控按鈕與焦點生命週期 |
| 模擬 | `update`, `spawnEnemy`, `spawnParticles` | 時間、移動、生成、子彈、敵人、粒子與限制 |
| 戰鬥／進程 | `shoot`, `dash`, `killEnemy`, `addXp`, `chooseUpgrade` | 傷害、接觸碰撞、衝刺脈衝、scrap／repair／overdrive 掉落、連殺、升級與死亡 |
| 繪製 | `drawBackground`, `drawOrb`, `drawEnemy`, `drawPlayer`, `drawHud`, `drawOverlay`, `draw` | 以 Canvas 2D 繪出戰場、實體、HUD 與狀態提示 |
| 生命週期／診斷 | `init`, `restart`, `pause`, `resume`, `destroy`, `selfCheck` | 啟動、重開、外部暫停／恢復、清理與最小自我檢查 |

### 3.3 狀態與資料模型

`makeState(width, height)` 建立單一可變 `state` 物件。主要欄位如下：

- **回合狀態**：`paused`、`over`、`level`、`xp`／`xpNext`、`score`、`bestScore`、`kills`、`wave`、`waveTime`、`bountyTarget`、`bountyKills`、`bountyReward`、`bountyClaimed`。
- **效果計時**：`spawnTimer`、`banner`、`shake`、`hurtFlash`、`combo`／`comboTimer`。
- **玩家**：位置／半徑、速度、生命、傷害、射速、子彈速度／大小、經驗倍率、瞄準角度、無敵、Dash 冷卻／脈衝、Overdrive 倒數。
- **集合**：`bullets`、`enemies`、`orbs`、`particles`、`upgradeChoices`。
- **外部輸入**另存於 `input`：按下的鍵集合、滑鼠座標／按住狀態、`touchMode`。

實體規則集中在 `game.js`：

- 敵人：`crawler`、`rusher`、`brute`；第 3 波起才有封頂 14% 機率的 `elite`。
- 擊殺：普通敵人依種類給 20／35／90 分，精英給 180 分；4 秒內連殺每層提高該次擊殺分數 25%，最多 8 層。
- **掉落**：`scrap` orb 提供 XP；`brute` 與 `elite` 額外掉落 `repair` orb，拾取最多回復 18 HP，滿 Hull 時轉為 12 分且不提供 XP；精英另額外掉落 `overdrive` orb。Orb 在 165px 內被玩家吸附。
- **賞金**：每波目標為 `5 + wave * 2` 名敵人，賞金為 `120 + wave * 40` 分；`killEnemy` 達標只結算一次，並以 `Math.max(player.overdrive, BOUNTY_SURGE_DURATION)` 啟動短暫 surge，換波重設 bounty。
- 升級：從 6 個固定升級中隨機選 3 個，選取後直接 mutates 玩家欄位。
- 效能上限：敵人數量上限為 `min(95, 5 + wave * 4)`，粒子最多 700 個。

主要平衡常數：`WAVE_LENGTH = 30s`、`COMBO_WINDOW = 4s`、`DASH_PULSE_DURATION = 0.24s`、`DASH_PULSE_RADIUS = 88px`、`OVERDRIVE_DURATION = 6s`、`BOUNTY_SURGE_DURATION = 3s`、`REPAIR_HEAL = 18 HP`、`REPAIR_OVERFLOW_SCORE = 12`。

### 3.4 更新／繪製流程與狀態轉移

```text
DOM ready / LunaGame.init()
        │ 建立 state、綁定 listeners、先生成 3 個敵人
        ▼
STANDBY ── Enter／開始按鈕／觸控操作 ──> LIVE
                                            │
                         P／Esc <───────────┴───────────> PAUSED
                                            │                 ▲
                 XP 達標：暫停 + 三選一 ────┘                 │ 選取升級
                                            │                 │
                         生命歸零 ──────────┴──────> GAME OVER
                                                        │
                                      R／點擊／重開按鈕 ──┘
```

每個 animation frame：

1. `frame(timestamp)` 將時間差 `dt` 限制在最多 `0.05s`，呼叫 `update(dt)`。
2. `update` 在 `paused` 或 `over` 時直接返回；否則更新波次計時、玩家輸入／瞄準／射擊、敵人生成、子彈碰撞、Orb 吸附／拾取、敵人追擊／接觸傷害與粒子。
3. `killEnemy` 統一處理分數、連殺、每波 bounty 一次性結算、surge overdrive、scrap／repair／overdrive 掉落與特效，並把 bounty 事件寫入 SCAV RADIO；生命歸零時記錄最高分並顯示死亡畫面。
4. `updateDomUi` 同步 HTML HUD 與 progressbar 的 `aria-valuenow`，並同步 mission rail 的 bounty 文字、進度條與威脅等級；`logEvent` 將 wave／bounty／repair 事件插入既有 run log，`restart()` 清掉動態事件，bounty claim 顯示 surge 狀態。
5. `draw` 依背景 → Orb → 子彈 → 敵人 → 粒子 → 玩家 → Canvas HUD → overlay 的順序繪製，再排程下一幀。

### 3.5 DOM 合約與公開 API

`setupDom(options)` 優先尋找現有節點；至少需要可取得 2D context 的 Canvas。缺少 Canvas 或升級 overlay 時會建立 fallback。正式頁面使用以下節點：

- Canvas：`#gameCanvas`。
- HUD：`#hudHealth`、`#hudXp`、`#hudXpMax`、`#hudLevel`、`#hudWave`、`#hudScore`、`#hudKills`、`#healthFill`、`#xpFill`、`#hudBest`。
- 狀態／畫面：`#runState`、`#hudStatusText`、`#startScreen`、`#startBtn`、`#gameOverScreen`、`#finalWave`、`#finalScore`、`#finalBest`、`#restartBtn`。
- 任務側欄：`#objectiveText`、`#objectiveProgress`、`#threatIndex`、`#runLog`；由 `updateDomUi()` 顯示當波 bounty／威脅，`logEvent()` 保留最新 5 筆事件。
- 升級：`#upgradePanel`、`#upgradeChoices`；按鈕使用 `data-upgrade-index` 供事件委派。
- 觸控：`#touchUp`、`#touchLeft`、`#touchDown`、`#touchRight`、`#touchShoot`、`#touchDash`。

```javascript
window.LunaGame.init(options) // idempotent；options 可含 root、canvas
window.LunaGame.restart()
window.LunaGame.pause()
window.LunaGame.resume()       // 升級選擇或死亡時不恢復
window.LunaGame.destroy()      // 取消 RAF、移除 listeners 與 runtime 建立的節點
window.LunaGame.getState()
window.LunaGame.selfCheck()
```

頁面載入完成時會自動 `init()`；重複呼叫不會建立第二個 animation loop。`destroy()` 不會刪除原本由頁面提供的 DOM，只清理 runtime 自己建立的元素。

## 4. 資料儲存（Data Stores）

| 名稱 | 類型 | 用途 | 邊界 |
| --- | --- | --- | --- |
| `dustReignBestScore` | Browser `localStorage` number-as-string | 保存本機最高分，於死亡時計算並在 HUD／結算畫面顯示 | 只在目前瀏覽器／來源有效；讀寫例外會回退為 0，不阻塞遊戲 |
| 其餘遊戲狀態 | JavaScript 記憶體物件 | 單局玩家、敵人、子彈、掉落、粒子與升級 | 重整或 `restart()` 後不保留；沒有帳號同步 |

沒有資料庫、快取、訊息佇列、檔案儲存或伺服器 session。

## 5. 外部整合／API（External Integrations / APIs）

沒有第三方 API、網路請求、登入、付款、分析 SDK 或外部素材服務。`game.js` 只使用瀏覽器原生能力：

- Canvas 2D context、`requestAnimationFrame`／`cancelAnimationFrame`。
- DOM query／事件、Keyboard／Pointer Events、`devicePixelRatio` 與 `resize`。
- `localStorage`（僅本機最高分）。

## 6. 部署與基礎設施（Deployment & Infrastructure）

- **入口**：`index.html`；同目錄的 `styles.css` 與 `game.js` 必須一併提供。
- **部署模型**：任一靜態檔案伺服器或靜態 hosting；目前未指定雲端供應商、CI/CD、監控或 logging 平台。
- **本地啟動**：可直接雙擊 `index.html`；也可從專案根目錄啟動任一靜態伺服器。HTTP(S) 來源對瀏覽器儲存與快取行為較一致。
- **建置**：無編譯、打包、環境變數或 runtime service；發布內容就是這些靜態檔案。

## 7. 安全與可及性考量（Security Considerations）

- 沒有遠端信任邊界、帳號或敏感資料；localStorage 的分數可被使用者自行修改，不能當作排行榜或安全憑證。
- 升級文字目前來自程式內固定常數；若未來改成外部／使用者輸入，應移除未消毒的 `innerHTML` 路徑並改用安全文字節點／白名單。
- Canvas 有 `aria-label`，HUD 使用 `aria-live`，生命／XP meter 使用 progressbar 語意；開始、死亡、升級畫面使用 dialog 標記。
- Canvas 可聚焦，支援鍵盤、滑鼠／指標與觸控控制；CSS 提供 `:focus-visible` 與 `prefers-reduced-motion`。
- 目前沒有 focus trap、完整螢幕閱讀器遊戲狀態描述或 CSP／安全標頭；若遊戲成為公開服務，再由 hosting 層補上 headers 與更完整的非 Canvas 狀態出口。

## 8. 開發與測試環境（Development & Testing Environment）

### 啟動

不需安裝依賴：直接開啟 `index.html`，或使用任一靜態伺服器預覽。

### 最小檢查

```text
node --check game.js
```

在瀏覽器載入頁面後，於 DevTools 執行：

```javascript
window.LunaGame.selfCheck()
// { ok: true, upgrades: 6, controls: ..., combo: ..., overdrive: ..., repair: ..., bounty: ..., surge: ..., overflow: ... }
```

`selfCheck()` 覆蓋基本擊殺、連殺分數、升級清單與初始效果；目前沒有 Jest、Playwright 或其他測試框架。手動 smoke test 應至少確認：開始／重開、WASD／方向鍵移動、滑鼠按住射擊、Space／觸控 Dash、升級三選一、P／Esc 暫停、死亡結算、高分保留與窄螢幕觸控操作。

## 9. 未來考量／路線圖（Future Considerations / Roadmap）

目前 `PLAN.md` 的原則是先維持核心循環與零依賴：

- 沒有明確效能問題前，不拆分 `game.js`、不引入框架／建置工具，也不新增事件匯流排或狀態管理套件。
- 若敵人上限或粒子上限提高後碰撞成本成為瓶頸，再考慮空間索引；目前子彈碰撞與觸控最近目標都是小上限下的線性掃描。
- 若 UI 狀態消費者增加，再抽出更明確的 view-model／事件邊界；現在由 `updateDomUi()` 集中同步已足夠。
- 只有在留存或營運需求被驗證後，才評估帳號、雲端排行榜、分析、多人、完整地圖／劇情或後端服務。

## 10. 專案識別（Project Identification）

- **Project name**：DUST//REIGN — Wasteland Run
- **Runtime module**：`LunaGame`（`game.js`）
- **Repository URL**：未設定（目前為本地 Git 專案）
- **Primary contact/team**：未指定
- **Current changelog baseline**：V0.0.13（2026-09-09）
- **Page build label**：`BUILD 0.1.0`（`index.html` 目前顯示值）
- **Date of last architecture update**：2026-09-09

## 11. 詞彙／縮寫（Glossary / Acronyms）

- **Run**：一次從開始到死亡／重開的單局。
- **Wave**：每 30 秒推進一次的敵人難度與生成階段。
- **Scrap / XP**：敵人掉落的經驗資源；達標會觸發升級選擇。
- **Orb**：戰場掉落物；`scrap` 給 XP，`repair` 最多回復 18 HP，`overdrive` 啟動精英超頻效果。
- **Chain**：4 秒連殺窗口內的連殺層數，最多 8 層。
- **Bounty / Wave Bounty**：每波的擊殺目標與一次性分數賞金；達標後鎖定 `bountyClaimed`，換波重設。
- **Bounty Surge**：賞金達標時沿用 `player.overdrive` 的 3 秒短暫火力提升；已有更長超頻時只保留較長值。
- **SCAV RADIO / run log**：沿用 `#runLog` 顯示 wave、bounty、repair 事件，最新在頂端且最多保留 5 筆，不做跨局保存。
- **Repair Scrap / Hull**：重型或精英額外掉落的 `repair` orb；拾取最多回復 18 HP，滿 Hull 時改給 12 分，且不超過玩家 `maxHp`、不增加 XP。
- **Overdrive / Overclock**：拾取精英核心後持續 6 秒；射擊冷卻乘以 0.62、傷害乘以 1.5。
- **HUD**（Heads-Up Display）：畫面上的生命、XP、波次、分數與效果提示。
- **DPR**（Device Pixel Ratio）：用來讓 Canvas 在高密度螢幕保持清晰的縮放比例。
- **DOM**（Document Object Model）：`index.html` 提供、由 `updateDomUi()` 同步的 HTML 節點。
- **IIFE**（Immediately Invoked Function Expression）：`game.js` 的封裝方式，避免污染全域；僅公開 `window.LunaGame`。
