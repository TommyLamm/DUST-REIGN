# DUST//REIGN 架構與修改導航

> **文件維護限制（開發者與 Coding Agent 均須遵守）**
>
> - **收錄範圍**：只記錄目前已實作的系統結構、模組責任、執行流程、共用邊界，以及穩定的修改入口與資料契約來源。
> - **禁止作為更新日誌**：不加入日期記事、版本變更清單、實作過程、完成紀錄、測試結果或待辦事項。變更歷史放在 Git／`CHANGELOG.md`，發布說明放在 `RELEASE.md`，設計與計畫放在 `PLAN.md`、`plans/` 或 `docs/` 的專用文件。
> - **不複製實作細節**：不逐項羅列敵人、武器、升級卡、平衡數值、動畫參數、完整狀態欄位、DOM 選擇器或測試案例。以檔案路徑及必要的入口符號指向原始碼；只有理解跨模組或外部相容性所必需的契約才在此摘要。
> - **更新時機**：入口、模組責任、依賴邊界、主要執行流程、共用資料契約或契約來源改變時，同步更新對應段落。一般 bug 修正、數值／樣式調整、內容與案例增減，未影響上述事項時不更新本文件。
> - **就地維護**：修改或刪除既有說明，不在文末追加「本次新增」「已完成」等段落。同一事實只在一處說明，其他段落引用來源；不為單一功能擴寫完整規格。
> - **以現況為準**：原始碼與測試是實作現況的最終依據；發現不一致時修正文句或引用，不把規劃當成已實作，也不把文件敘述當成驗證通過的證據。平台要求與開發／發布流程依 `AGENTS.md` 及其引用的最新規格，不在此另存副本。
>
> 編輯前先確認：這段內容是否幫助讀者判斷「系統如何組成、責任在哪裡、應修改哪裡、契約以何處為準」？若只是說明「做了什麼、數值是多少、測試是否通過」，就不應收錄。

## 1. 系統概觀

DUST//REIGN 是純瀏覽器 Canvas 2D roguelike 射擊遊戲，以原生 ES Modules 組織，無編譯步驟、執行期套件或外部 CDN 依賴。遊戲本身無後端；帳號成績透過隨成品提供的 Playroom SDK 與平台父頁面溝通。

`index.html` 提供頁面結構並載入 `src/main.js` 與 `css/` 樣式。Canvas 負責戰場，HTML 負責 HUD、開始／結算畫面、暫停與升級面板。自有資源使用相對路徑，以支援靜態子目錄與平台 iframe；本機預覽須使用 HTTP 靜態伺服器。

## 2. 模組與責任

| 位置 | 責任 |
| --- | --- |
| `index.html`、`css/` | HTML 介面與樣式。CSS 疊加順序以 `index.html` 的 `<link>` 為準；`css/animations.css` 在 `css/responsive.css` 與 `css/high-contrast.css` 之前，後兩者覆寫動效與對比。 |
| `src/main.js` | 初始化、RAF 主迴圈、暫停／恢復、銷毀及公開 API。 |
| `src/config.js`、`src/data/upgrades.js` | 共用常數、武器構型識別及升級／融合卡定義。 |
| `src/core/runtime.js` | 跨模組共用的可變容器 `rt`。 |
| `src/core/state.js` | `makeState()` 建立單局狀態與玩家初始資料。 |
| `src/core/pools.js`、`src/core/utils.js` | 模擬側彈殼、焦痕與粒子池，以及共用工具與事件註冊。 |
| `src/core/settings.js` | 本機最高分、觸覺、無障礙與畫質偏好。 |
| `src/core/fx-events.js` | sim 呼叫 `pushFxEvent`、render 呼叫 `drainFxEvents` 的視覺事件環形佇列；不影響玩法。 |
| `src/input/` | 鍵盤、滑鼠、觸控事件與每幀手把輪詢。 |
| `src/systems/` | 開局／結算、生成、武器、技能、戰鬥與升級規則。 |
| `src/systems/update.js`、`src/systems/sim/` | 模擬更新協調與按順序執行的單幀步驟。 |
| `src/render/draw.js` | Canvas 繪製入口與圖層順序。 |
| `src/render/terrain.js`、`src/render/atmosphere.js`、`src/render/lighting.js`、`src/render/shadows.js` | 地表離屏快取與純視覺貼花、浮塵／霧帶／螢幕後處理、lightmap、接地陰影。 |
| `src/render/player.js`、`src/render/enemies.js`、`src/render/world.js`、`src/render/projectiles.js`、`src/render/overlay.js` | 玩家、敵人、場景物件、彈體，以及 Canvas HUD／覆蓋層。 |
| `src/render/fx.js`、`src/render/fx-rand.js` | 視覺粒子、傷害數字、螢幕閃光與視覺亂數；與 `pools.js` 的模擬粒子分開。 |
| `src/render/entity-style.js` | 受擊閃白等逐實體視覺暫存。 |
| `src/render/palette.js`、`src/render/quality.js`、`src/render/sprites.js` | 區段色調、畫質預算與自動降級、預渲染光暈／雜訊貼圖快取。 |
| `src/ui/` | DOM 對應、尺寸適配、HUD、暫停及升級面板。 |
| `src/audio/audio-fx.js` | Web Audio 程序合成音效、音訊解鎖及音量／靜音偏好。 |
| `src/platform/playroom.js`、`playroom-sdk.js` | 遊戲端成績橋接與平台訊息協定。 |
| `src/dev/self-check.js`、`scripts/self-check.mjs` | 無介面的核心邏輯自檢及 Node 執行入口。 |
| `game.json`、`cover.png` | 平台 Manifest 與封面。 |
| `scripts/stage-release.mjs`、`.github/workflows/release.yml` | 成品白名單 staging、版本核對、完整 ZIP 驗證與 Release 流程。 |

### 共用邊界

- `rt` 保存跨模組會重新賦值的資料，包括 `state`、`ui`、輸入、RAF／事件資源與帳號局次。單局資料放在 `rt.state`；只由單一模組管理的狀態留在該模組，以函式提供存取。
- `rt.renderTime` 與 `rt.renderDt` 由 `src/main.js` 的 `frame()` 每幀寫入，暫停與 hitstop 時仍前進。`rt.fxEvents` 在 `src/core/runtime.js` 初始為 `null`，由 `pushFxEvent`／`drainFxEvents` 首次使用時建立上限 64 的環形佇列（滿額覆寫最舊一筆）。事件只供視覺使用。種類與欄位以呼叫處及 `src/render/fx.js` 的處理為準：`kill`、`crit`、`core`、`barrel`、`mortar`、`emp`、`spire`、`dash`、`graze`、`playerHit`、`titanPhase`、`bounty`、`surge`。
- `entity.fx` 是掛在實體上、只由 render 讀寫的視覺暫存，由 render 惰性建立。模擬不得讀取它。render 不得改寫 `rt.state` 的玩法欄位。受擊閃白的 `lastHp` 只由 `src/render/entity-style.js` 的 `tickFlash` 維護；傷害數字的 `numHp` 只由 `src/render/fx.js` 維護。足跡等純視覺貼花走 `addVisualDecal`，不寫入 `rt.state.decals`。
- `src/main.js` 與 `src/ui/` 可以匯入 render。`src/systems/**` 不得讀取 `entity.fx`，也不得 import `src/render/**`。系統透過共用 `rt.state` 協作，並會呼叫 UI 與音效；這些目錄是責任分工，並非互相隔離的單向分層。
- 既有模組存在循環 import。跨循環依賴的匯出應在函式執行時使用，避免在模組頂層讀取尚未初始化的值或呼叫相依模組。啟動、偏好讀取、音訊物件建立及 SDK 載入的頂層初始化分別由對應模組管理。
- `selfCheck()` 會暫時替換 `rt.state`／`rt.ui`；新增邏輯須保留無 DOM 環境的自檢入口。核心遊戲程式沿用 `var`／`function` 與 ES module 的組織方式。

## 3. 執行流程與生命週期

### 啟動與每幀更新

```text
index.html → src/main.js → init()
  ├─ setupDom()／resize() → rt.ui
  ├─ makeState()          → rt.state
  ├─ bindInput()          → 輸入事件與生命週期監聽
  └─ requestAnimationFrame → frame()
       ├─ 寫入 rt.renderDt／rt.renderTime，並 sampleFrame(dt)
       ├─ pollGamepad(dt)
       ├─ update(dt) → sim 步驟 → updateDomUi()
       └─ draw()     → updateFx() 後依圖層繪製
```

`frame()` 使用以上一幀時間差計算、設有上限的 `dt`，並把同一值寫入 `rt.renderDt`、累加到 `rt.renderTime`。這兩個欄位在暫停與 hitstop 時仍前進，`sampleFrame()` 也仍會取樣；戰鬥擺動與彈道仍使用 `rt.state.waveTime`。`src/render/fx.js` 的 `updateFx` 在 `draw()` 開頭排空視覺事件，hitstop 期間暫停戰鬥視覺粒子。`update()` 先處理暫停、結算演出與 hitstop，再依原始碼順序執行模擬步驟；共用幀參數為 `{ p, boundW, boundH }`，分別代表玩家參照與場地邊界。步驟順序由 `src/systems/update.js` 統一決定，修改碰撞、生成或傷害時需核對前後步驟的狀態依賴。

疊放順序以 `src/render/draw.js` 為準。震屏變換內是世界座標第 1–11 層：地表、貼花、遠浮塵、接地陰影、場景物件、危險區、敵人與玩家、lightmap、加法光暈與玩家彈、近大氣、可讀性層（敵彈、預警、高對比標記、傷害數字）。變換外是螢幕座標：第 12 層 `drawScreenPost` 與 `drawScreenFlashes`，第 13 層 Canvas HUD 與覆蓋層。HTML HUD 由 `src/ui/hud.js` 同步。尺寸、DPR 與玩家邊界調整集中於 `src/ui/dom.js` 的 `resize()`；尺寸或 DPR 改變時呼叫 `clearSpriteCache()`。

### 單局流程

遊戲以狀態旗標與面板狀態控制流程，沒有獨立的狀態機列舉：

| 階段 | 轉換與負責入口 |
| --- | --- |
| 等待開始 | `init()` 依開始面板是否顯示設定 `paused`；`beginRun()` 開始遊玩與帳號局次。無開始面板時可直接啟動。 |
| 遊玩／手動暫停 | `src/systems/flow.js` 的 `togglePause()` 同步旗標與暫停面板；公開 API 的 `pause()`／`resume()` 控制暫停旗標與 HUD。 |
| 升級選卡 | `src/systems/progression.js` 的 `addXp()` 暫停並產生選項；`chooseUpgrade()` 套用升級，處理後續待選升級後才恢復。 |
| 結束 | `triggerGameOver()` 設定 `over`、記錄本機最高分、提交帳號成績並啟動結算演出；`update()` 控制結算面板顯示時機。 |
| 重新開始 | `restart()` 以 `makeState()` 重建單局資料，重設輸入／面板並開始新的帳號局次。 |
| 銷毀 | `destroy()` 停止 RAF、移除已註冊事件、斷開尺寸觀察，清除 runtime 參照與自動建立的 DOM。 |

## 4. 修改導航

以下路徑列出主要修改入口；細部規則、數值與完整符號以原始碼為準。

| 修改主題 | 主要入口 |
| --- | --- |
| 開始、暫停、重開、結算與評級 | `src/main.js`、`src/systems/flow.js`、`src/ui/pause-menu.js` |
| 敵人、首領、波次與生成 | `src/systems/spawning.js`、`src/systems/sim/timers-wave.js`、`src/systems/sim/enemies.js` |
| 武器、射擊、彈道與擦彈 | `src/systems/weapons.js`、`src/systems/sim/bullets.js`、`src/systems/sim/enemy-bullets.js` |
| 衝刺、EMP、傷害、擊殺與掉落生成 | `src/systems/abilities.js`、`src/systems/combat.js` |
| 環境危險與掉落物拾取 | `src/systems/sim/hazards.js`、`src/systems/sim/orbs.js` |
| 升級、融合與構築檢視 | `src/data/upgrades.js`、`src/systems/progression.js`、`src/ui/upgrade-panel.js`、`src/ui/pause-menu.js` |
| 輸入映射與玩家移動 | `src/input/keyboard-pointer.js`、`src/input/gamepad.js`、`src/systems/sim/player.js` |
| 地表、大氣與光影 | `src/render/` 的 `draw.js`、`terrain.js`、`atmosphere.js`、`lighting.js`、`shadows.js`、`palette.js` |
| 實體造型與彈體外觀 | `src/render/` 的 `player.js`、`enemies.js`、`world.js`、`projectiles.js`、`entity-style.js` |
| 戰鬥視覺特效 | `src/render/` 的 `fx.js`、`fx-rand.js`、`sprites.js`，以及 `src/core/fx-events.js`；模擬粒子與焦痕見 `src/core/pools.js`、`src/systems/sim/effects.js` |
| 畫質分級 | `src/core/settings.js`、`src/render/quality.js`、`src/ui/pause-menu.js`、`src/input/keyboard-pointer.js`、`src/ui/dom.js` |
| 頁面、HUD 與 iframe／觸控版面 | `index.html`、`src/ui/dom.js`、`src/ui/hud.js`、`css/animations.css`、`css/layout-fit.css`、`css/touch.css`、`css/responsive.css` |
| 音訊、觸覺、減動效與高對比 | `src/audio/audio-fx.js`、`src/core/settings.js`、`src/ui/pause-menu.js`、`css/high-contrast.css`、`css/animations.css` 及對應 render 模組 |
| 帳號成績與平台交付 | `src/platform/playroom.js`、`game.json`、`scripts/stage-release.mjs`、`.github/workflows/release.yml` |

## 5. 資料與外部契約

### Runtime 與單局資料

`src/core/runtime.js` 定義 runtime 容器；`renderTime`、`renderDt`、`fxEvents` 在 `rt` 上，不屬於 `makeState()`，契約見第 2 節。`src/core/state.js` 的 `makeState()` 定義單局初始形狀，涵蓋流程旗標、波次／分數、玩家、實體集合、升級選項與戰鬥統計。執行期新增或更新的欄位以各系統的寫入處為準，不能只看初始值判斷完整資料模型。

`src/config.js` 是共用常數與識別值的來源；`src/data/upgrades.js` 的 `UPGRADES`／`FUSION_CHIPS` 定義卡片、前置條件與套用行為。調整資料形狀時需一併核對讀寫它的 systems、render、UI 與自檢。

### DOM 與公開 API

- `index.html` 定義實際節點；`src/ui/dom.js` 的 `setupDom()` 定義查找規則與 `rt.ui` 對應，並在需要時建立 Canvas 與升級面板。面板與輸入模組也有直接 DOM 查找；修改 ID／class 時需核對使用處及 CSS。
- `src/main.js` 的 `api` 是完整公開介面來源。瀏覽器暴露 `window.LunaGame`，無 `window` 時暴露 `globalThis.LunaGame`，亦匯出 `api` 供模組匯入。
- 生命週期入口為 `init(options)`、`restart()`、`pause()`、`resume()`、`destroy()`；`init()` 接受 `{ root, canvas }`，已啟動時回傳既有 API。`getState()` 回傳內部狀態參照，並非快照或持久化存檔格式。

### 本機持久化

本機只保存最高分與偏好，不保存單局進度。儲存存取有例外保護，瀏覽器拒絕 storage 時遊戲仍可運作。

| 資料 | 契約來源與相容性 |
| --- | --- |
| 最高分 | `src/config.js` 的 `BEST_SCORE_KEY`／`LEGACY_BEST_SCORE_KEY` 與 `src/core/settings.js` 的讀寫函式；讀取會比較新舊 key，寫入只使用目前 key，不刪除舊值。 |
| 音量與靜音 | `src/audio/audio-fx.js` 定義 key、格式與預設值。 |
| 觸覺、減動效與高對比 | `src/core/settings.js` 定義 key、格式與回退行為。 |
| 畫質分級 | `src/core/settings.js` 的 `dust_reign_visual_quality`（`auto`、`high`、`medium`、`low`；未設定或無法辨識時為 `auto`）。有效等級、自動降級與預算由 `src/render/quality.js` 提供。 |

調整 key 或資料格式時必須處理既有儲存相容性；本機最高分與帳號成績是兩套獨立資料。

### Playroom 成績

`game.json` 是遊戲身分、版本、裝置宣告與榜單規則的來源。`src/platform/playroom.js` 動態載入根目錄 SDK，提供 `startAccountRun()`／`finishAccountRun()`；`src/systems/flow.js` 在單局開始與結束時呼叫。

局次 Promise 放在 `rt.accountRun`；結算時擷取該局 Promise 與最終分數，再非同步提交，不等待網路才推進主要玩法。SDK 不可用、回傳空結果或請求失敗時可繼續遊玩；只有 `finishRun()` 回傳 `saved: true` 才標示帳號成績已保存。局次資料留在記憶體，不寫入本機儲存。

平台訊息協定由 `playroom-sdk.js` 處理；遊戲不直接讀取平台憑證或呼叫管理 API。平台接入、預覽診斷與驗收要求以 `AGENTS.md` 引用的最新線上規格為準。

## 6. 驗證與交付入口

| 用途 | 來源／入口 |
| --- | --- |
| 核心邏輯自檢 | Node 24 執行 `node scripts/self-check.mjs`；案例與覆蓋範圍以 `src/dev/self-check.js` 為準。瀏覽器亦可呼叫 `window.LunaGame.selfCheck()`。 |
| 語法檢查與 CI 順序 | `.github/workflows/release.yml`。 |
| 成品收集 | `node scripts/stage-release.mjs`；白名單為根目錄 Manifest、入口、SDK、封面及 `src/**/*.js`、`css/**/*.css`。 |
| staging 路徑 | `output/release/<version>/game` 與 CI 使用的 `output/game`；版本目錄已存在時 staging 會拒絕覆寫。 |
| ZIP 驗證與發布 | Release workflow 取得平台 `main` 最新工具，完整打包／驗證成功後建立遊戲 Release；授權與人工驗收依 `AGENTS.md`。 |

staging 不負責編譯，也不等同 ZIP 驗證。核心自檢、完整 ZIP 驗證及真實瀏覽器／平台預覽各有不同範圍；執行結果與發布狀態記錄於專用紀錄，不寫入本文件。
