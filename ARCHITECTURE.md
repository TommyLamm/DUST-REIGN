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
| `src/config.js`、`src/core/constants.js`、`src/data/` | 共用常數、大世界地圖邊界（`WORLD_WIDTH = 3520`, `WORLD_HEIGHT = 2640`，邊界緩衝 160px，有效戰術空間 $3200 \times 2320$）與初始生成坐標（1760, 1320），以及升級、敵人、路線、合約、突變、機體、熱度、每日規則資料，闖關關卡（`campaign-stages.js`）、極限作戰（`hardcore-operations.js`）、改裝工坊模組（`modules.js`）與每日懸賞（`bounties.js`）。 |
| `src/core/runtime.js` | 跨模組共用的可變容器 `rt`。 |
| `src/core/camera.js` | 0-GC 單例相機容器、非對稱雙階動態追蹤阻尼、準星動態前瞻（Hermite 曲線）、創傷度正交震屏與震屏解耦雙向坐標轉換（`screenToWorld`／`worldToScreen`）。 |
| `src/core/state.js` | `makeState()` 建立單局狀態與玩家初始資料，預設對齊 3520x2640 大世界並配置 6 大戰術 POI，支援 standard、campaign、hardcore、daily 模式與關卡計數。 |
| `src/core/rng.js` | 具名亂數流。未設種子時回傳 `Math.random()`。 |
| `src/core/spatial-grid.js` | 55px 單元格 2D 空間雜湊網格（Spatial Hash Grid，以 $64 \times 48$ 單元格零分配無縫覆蓋 $3520 \times 2640$ 大世界），以 TypedArray 達成 0-GC 執行期廣域碰撞篩選，提供 zero-allocation 提前終止回調（`queryGridCallback`）供酸池、焦痕與爆炸危害查詢。 |
| `src/core/pools.js`、`src/core/utils.js` | 模擬側彈殼、焦痕與粒子池，Swap-and-Pop 實體快速移除（`fastUnorderedRemove`），平方距離計算（`dist2`），以及共用工具與事件註冊。 |
| `src/core/settings.js` | 觸覺、無障礙與畫質偏好，以及舊版最高分的唯讀相容。 |
| `src/core/i18n.js` | 多語言本地化（英文與繁體中文）、靜態 DOM 文本同步、字典與動態字串轉換。 |
| `src/core/meta-store.js`、`src/core/cloud-save.js` | 局外存檔、v2 最高分、每日成績、提示紀錄、闖關模式（`dust-reign:campaign:v1`）與極限作戰（`dust-reign:hardcore:v1`）的 `localStorage` 入口，以及全進度 Unified Save 與雲端存檔智慧合併。 |
| `src/core/fx-events.js` | sim 呼叫 `pushFxEvent`、render 呼叫 `drainFxEvents` 的視覺事件環形佇列；不影響玩法。 |
| `src/input/` | 鍵盤、滑鼠、觸控事件、解耦座標追蹤（避免同步 layout 查詢）與每幀手把輪詢。 |
| `src/systems/` | 開局與結算（`flow.js`）、計分與評級（`scoring.js`）、波次導演（`director.js`）、幕間與撤離（`interlude.js`）、PSRA 環形生成（`spawning.js`）、武器、技能、戰鬥、升級，以及局外規則（`meta.js`）。 |
| `src/systems/sim/poi.js` | 6 大戰術 POI（提煉塔 Silo、軌道空投倉 Orbital Pod、改裝工作站 Field Rig、母巢 Xeno Nest、電磁尖塔 EMP Spire、裝甲地堡 Bunker Cache）之生命週期、防守互動與全場戰術增益。 |
| `src/systems/modes/` | 闖關模式戰役護航/刺殺任務邏輯（`campaign.js`）與極限作戰黑風暴動態縮圈（`hardcore.js`）。 |
| `src/systems/tactical.js` | 戰術輔助槽位裝備（定點機槍塔、熱誘餌、微型奇點手雷）之冷卻、部署、AI 行為與實體渲染。 |
| `src/systems/mutators.js`、`contracts.js`、`drops.js`、`card-effects.js` | 波次突變、合約、掉落，以及不改卡片資料表的持續效果與融合協同。 |
| `src/systems/ghost.js`、`src/render/ghost.js` | 5Hz 輕量幽靈殘影競速引擎（Delta 差分與 Base64 壓縮快照、Split-Timer 即時時間差比對、半透明殘影渲染）。 |
| `src/systems/update.js`、`src/systems/sim/` | 模擬更新協調與按順序執行的單幀步驟。首領重塑在 `sim/bosses.js`，狼群包夾與空間分離在 `sim/enemies.js`，新敵型在 `sim/new-enemies.js`，敵方減傷與護盾在 `sim/enemy-defense.js`，玩家物理後座力在 `sim/player.js`。 |
| `src/render/draw.js` | Canvas 繪製入口、相機世界矩陣注入、視錐台幾何 AABB 剔除管線（`culledEnemyIndices` Int16Array 靜態池，常態 48px / 首領 220px 雙階邊界，剔除 75%~90% 螢幕外實體）與世界／螢幕圖層分流順序。 |
| `src/render/terrain.js`、`src/render/atmosphere.js`、`src/render/lighting.js`、`src/render/shadows.js` | $1024 \times 1024$ 離屏圖塊 GPU GL_REPEAT 平鋪渲染（`terrainPattern.setTransform`，消除 37.2MB OOM）、地表離屏快取與純視覺貼花、浮塵／霧帶／螢幕後處理、lightmap（0.74 照度抬升門檻，單遍距離平方線性剪裁 $O(N)$）、雙 Pass 全合流接地陰影（全場僅發出 2 次 `ctx.fill()` 繪製所有實體之 Penumbra 柔影與 Core AO 硬咬合）。 |
| `src/render/player.js`、`src/render/enemies.js`、`src/render/world.js`、`src/render/projectiles.js`、`src/render/overlay.js` | 玩家四錨點、敵型雙層反差描邊、街機立體戰利品、敵我色譜隔離與三層三明治彈體及斑馬預警軌道、敵彈 4 桶色譜分流（Magenta/Orange/Lime/Violet）與單 Pass 批次渲染、字體排版分組批處理 Canvas HUD／覆蓋層（4.5px 雙層黑邊傷害數字、0.22s 受擊滯後 Ghost Bar 血條）、視口邊緣雷達指針（`drawOffscreenChevrons`，Ray-AABB 邊界求交）與右上角 128px 戰術小地圖（`drawTacticalMinimap`，4 桶批次繪製）。 |
| `src/render/fx.js`、`src/render/fx-rand.js` | 視覺粒子（3-Tier 優先級架構與玩家 120px 徑向視線保護圈 Alpha Culling）、傷害數字、螢幕閃光與視覺亂數；與 `pools.js` 的模擬粒子分開。 |
| `src/render/entity-style.js` | 受擊閃白、單例 `POSE_SCRATCH` 姿態暫存、以及 `drawDualOutlineZeroCost` 手動屬性復原（消除 `save`/`restore` 堆疊開銷）等逐實體視覺暫存。 |
| `src/render/palette.js`、`src/render/quality.js`、`src/render/sprites.js` | 區段負空間地表色調（$L^* \in [4.6\%, 13.5\%]$）、畫質預算（粒子池 HIGH 600 / MEDIUM 350 / LOW 180）與自動降級、自適應 DPR 收斂（1.0~1.25）以緩解 Canvas fillrate 負載、預渲染光暈／雜訊貼圖快取。 |
| `src/ui/` | DOM 對應、尺寸適配、DOM 髒檢查快取（`setText`、`style.width`，消除強制同步重排）、HUD、暫停、升級、配裝（`loadout-panel.js`）、圖鑑（`codex-panel.js`）、關卡選單（`campaign-modal.js`）、極限簡報（`hardcore-briefing.js`）、改裝工坊（`workshop-panel.js`）、星級金庫（`vault-panel.js`）、每日懸賞（`bounties-panel.js`）、結算（`game-over.js`）、幕間（`interlude-panel.js`）、合約（`contracts-hud.js`）與提示（`tips.js`）。 |
| `src/audio/audio-fx.js` | Web Audio API 節點自動斷開回收（`cleanupVoice()` / `.disconnect()`）、分頁可見度休眠（`visibilitychange`）與狀態持久化。 |
| `src/platform/playroom.js`、`playroom-sdk.js` | 遊戲端成績與雲端存檔樂觀鎖同步橋接（Playroom SDK 1.1.0）、能力協商、錯誤碼處理與平台訊息協定。 |
| `src/dev/self-check.js`、`src/dev/checks/`、`scripts/self-check.mjs` | 無介面的核心邏輯自檢、分檔案例及 Node 執行入口。 |
| `scripts/balance-sim.mjs` | 無頭長流程模擬。 |
| `game.json`、`cover.png` | 平台 Manifest（Schema v2）與封面。 |
| `scripts/stage-release.mjs`、`.playroom/`、`.github/workflows/release.yml` | 成品白名單 staging（阻斷內部工具混入）、官方固定驗證工具（Playroom Game Tools 1.1.0）、SHA-256 鎖定、版本核對、完整 ZIP 驗證與 Release 發布流程。 |

### 共用邊界

- `rt` 保存跨模組會重新賦值的資料，包括 `state`、`ui`、輸入、RAF／事件資源與帳號局次。單局資料放在 `rt.state`；只由單一模組管理的狀態留在該模組，以函式提供存取。
- `rt.renderTime` 與 `rt.renderDt` 由 `src/main.js` 的 `frame()` 每幀寫入，暫停與 hitstop 時仍前進。`rt.fxEvents` 在 `src/core/runtime.js` 初始為 `null`，由 `pushFxEvent`／`drainFxEvents` 首次使用時建立上限 64 的環形佇列（滿額覆寫最舊一筆）。事件只供視覺使用。種類與欄位以呼叫處及 `src/render/fx.js` 的處理為準：`kill`、`crit`、`core`、`barrel`、`mortar`、`emp`、`spire`、`dash`、`graze`、`playerHit`、`titanPhase`、`bounty`、`surge`、`burst`。
- `entity.fx` 是掛在實體上、只由 render 讀寫的視覺暫存，由 render 惰性建立。模擬不得讀取它。render 不得改寫 `rt.state` 的玩法欄位。受擊閃白的 `lastHp` 與雙層描邊快取只由 `src/render/entity-style.js` 的 `tickFlash` 維護；怪物血條滯後白條（`ghostHp`、`ghostTimer`）與傷害數字的 `numHp` 只由 render 維護。足跡等純視覺貼花走 `addVisualDecal`，不寫入 `rt.state.decals`。
- 0-GC 記憶體防線：子彈軌跡使用平坦環形緩衝區（`Float32Array(8)`）與靜態 `trailPool` 復用物件；逐實體姿態與每幀位移步進以單例物件 `POSE_SCRATCH` 與 `STEP_SCRATCH` 傳遞；貫穿彈命中歷史採用 64-bit Bitmask（`hitMask0`, `hitMask1`）紀錄取代陣列物件；全域無序實體陣列（子彈、敵彈、粒子、掉落物等）全面採用 Swap-and-Pop（`fastUnorderedRemove`）替代 `splice`，移除時切斷死者懸空參照避免隱式記憶體洩漏。
- 物理空間加速：空間雜湊網格單元格鎖定 55px，以 $64 \times 48$ 單元格精確對齊覆蓋 $3520 \times 2640$ 大世界地圖，提供零分配回調 `queryGridCallback` 供酸池、焦痕、自爆友傷與碰撞查詢；全域幾何判定以平方距離 $d^2 \le r^2$ 替代 `Math.hypot`；Titan 4 大可拆解部位以單幀快取旋轉矩陣（`updateTitanPartCache`）與逆向局部坐標判定；視錐台幾何 AABB 剔除管線（`culledEnemyIndices` Int16Array 靜態池）以雙階邊界（常態 48px、首領 220px）避免螢幕外實體之網格插入、渲染與射擊計時器推進。
- 大世界廢土與中心相機動力學：地圖邊界為 $3520 \times 2640$（邊界緩衝 160px，有效戰術空間 $3200 \times 2320$），玩家初始置中於 $(1760, 1320)$。相機單例 `rt.camera` 具備非對稱雙階動態阻尼（$\lambda_{cruise}=8.5$, $\lambda_{dash}=24$）、76.8px 軟約束死區、Hermite 雙向準星前瞻（最大 140px，死區 70px）與 20px 邊界防出界夾持；創傷度正交震屏（$T^2$ 質數頻率）於 `screenToWorld` 逆映射中徹底扣除 Shake 雜訊，消滅震屏準星抖動。視口邊緣雷達指針（Ray-AABB 邊界求交）與右上角 128px 微型小地圖（4 桶分流單 Pass 繪製）提供廣域態勢感知。地表渲染採用 $1024 \times 1024$ 離屏圖塊經 GPU GL_REPEAT 矩陣平鋪（`terrainPattern.setTransform`），消除全圖分配之 37.2MB 記憶體負擔。
- PSRA 環形生成架構：內環（視口 $+40\text{px}$）絕對禁刷防暴怪臉貼；中環（$1.15 \sim 1.42\times$ 視口半徑）維持活躍生成；外環（$>1.85\times$）執行靜默回收並退回波次代幣。生成依玩家速度向量預判扇區（$55\% \sim 65\%$ 迎面阻截、$25\% \sim 30\%$ 兩側包夾、$10\% \sim 15\%$ 後方壓迫）與世界邊界切線折射。怪群 AI 支援狼群包夾、55px 空間雜湊局部排斥分離（Separation）與菁英怪 Hyper-Catchup 地底疾行（3.5x 移速）。
- 6 大戰術 POI（提煉塔 Silo、軌道空投倉 Orbital Pod、改裝工作站 Field Rig、母巢 Xeno Nest、電磁尖塔 EMP Spire、裝甲地堡 Bunker Cache）具備獨立互動半徑、防守計時與破壞回饋，提供戰地超頻、全圖過載脈衝、空投戰備與防守獎勵。三大首領大世界重塑：Titan 導入地震牽引錨拉扯遠程機甲與履帶障礙碾壓；Dreadnought 具備巨石空投撞擊暈眩（3.2s 破甲硬直）；Sovereign 隨動動態風暴之眼。
- 繪圖管線合流：敵彈採 4 桶色譜分流（Magenta/Orange/Lime/Violet）與單 Pass 批次渲染，消除重複 Dark Halo 狀態切換；接地陰影以雙 Pass 全合流繪製（全場僅發出 2 次 `ctx.fill()`）；`drawDualOutlineZeroCost` 手動復原繪圖屬性替代 `save/restore` 堆疊開銷；傷害數字採字體分組批處理，消滅 CSS 字體抖動。
- `src/main.js` 與 `src/ui/` 可以匯入 render。`src/systems/**` 不得讀取 `entity.fx`，也不得 import `src/render/**`。系統透過共用 `rt.state` 協作，並會呼叫 UI 與音效；這些目錄是責任分工，並非互相隔離的單向分層。
- 玩家扣血走 `damagePlayer`，敵人扣血走 `damageEnemy`，移除敵人走 `killEnemy`。加分走 `addScore`。模擬亂數走 `rng(stream)`。`localStorage` 的局外資料、v2 最高分、闖關星級與極限作戰徽章只經 `src/core/meta-store.js`；音訊與無障礙偏好仍由各自模組讀寫。帳號成績僅在 standard 或 daily 模式由 `src/platform/playroom.js` 提交，闖關與極限模式不提交以保護主榜公平。
- 戰術輔助槽位以 `p.tacticalSlot` 與 `rt.state.tacticalEntities` 運作，綁定獨立鍵位 `[E]`／`[F]`（手把 `[X]`／`[LB]`，觸控 `#touchAux`），冷卻由 `#hudTacticalCdMask` SVG 遮罩即時同步。
- 晶片融合系統收錄 8 組專屬雙卡融合矩陣（`FUSION_CHIPS`），選卡面板以金黃串流光暈（`.is-fusion-chip`）突顯並保證升級第一槽位優先遞送。
- 首領身份是 `isBoss`。Titan 拆解部位（左迫擊砲 `left_cannon`、右蜂巢召喚艙 `right_pod`、後散熱鰭片 `radiator`、下履帶裝甲 `treads`）以旋轉局部坐標計算碰撞，支援鰭片閉合減傷（85%）與過熱曝露弱點（250% 暴擊）、部位破壞 0.08s hitstop 及履帶破壞 -40% 減速。擊殺分讀敵人的 `score`；首領本體的分數由導演的首領結算記入，不在擊殺分再計一次。
- 廢料改裝工坊（Scrapyard Workshop）以 6⚡ 負載上限與 3 大改裝插槽運作，模組雙面刃數值在開局前注入玩家屬性；安裝改裝模組進行競速時自動標記為 Mod 模式，與純粹無改裝幽靈競速榜分流隔離。
- 幽靈殘影競速以 5Hz 取樣、Delta 差分及 Base64 壓縮儲存於 localStorage（< 3KB），由 Split-Timer 於戰鬥中即時比對檢核點秒差。
- `isStormFront()` 在波末風暴窗或場上仍存活的 Storm Sovereign 時為真。位移用 `stormWind()`：有首領風向時用該風向，否則用固定風暴方向。
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

`frame()` 使用以上一幀時間差計算、設有上限的 `dt`，並把同一值寫入 `rt.renderDt`、累加到 `rt.renderTime`。這兩個欄位在暫停與 hitstop 時仍前進，`sampleFrame()` 也仍會取樣；戰鬥擺動與彈道仍使用 `rt.state.waveTime`。`src/render/fx.js` 的 `updateFx` 在 `draw()` 開頭排空視覺事件，hitstop 期間暫停戰鬥視覺粒子。`update()` 先處理暫停、結算演出、幕間與 hitstop，再依原始碼順序執行模擬步驟；共用幀參數為 `{ p, boundW, boundH }`，分別代表玩家參照與場地邊界。步驟順序由 `src/systems/update.js` 統一決定：波次時鐘、突變、危險區、玩家、生成、玩家彈、掉落物、敵人、敵彈、砲擊落點、效果、合約。修改碰撞、生成或傷害時需核對前後步驟的狀態依賴。

疊放順序以 `src/render/draw.js` 為準。震屏變換內是世界座標第 1–11 層：地表、貼花、遠浮塵、接地陰影、場景物件、危險區、敵人與玩家、lightmap、加法光暈與玩家彈、近大氣、可讀性層（敵彈、預警、戰場可讀性標記、高對比標記、傷害數字）。變換外是螢幕座標：第 12 層 `drawScreenPost` 與 `drawScreenFlashes`，第 13 層 Canvas HUD 與覆蓋層。HTML HUD 由 `src/ui/hud.js` 同步。尺寸、DPR、戰鬥側欄自動隱藏（`syncCombatLayout()` 於戰鬥中切換 `.is-in-combat` 全寬並隱藏任務側欄）與玩家邊界調整集中於 `src/ui/dom.js` 的 `resize()`；尺寸或 DPR 改變時呼叫 `clearSpriteCache()`。

### 單局流程

遊戲以狀態旗標與面板狀態控制流程，沒有獨立的狀態機列舉：

| 階段 | 轉換與負責入口 |
| --- | --- |
| 等待開始 | `init()` 依開始面板是否顯示設定 `paused`。`beginRun()` 套用配裝、開始遊玩與帳號局次。無開始面板時可直接啟動。 |
| 遊玩／手動暫停 | `src/systems/flow.js` 的 `togglePause()` 同步旗標與暫停面板；公開 API 的 `pause()`／`resume()` 控制暫停旗標與 HUD。 |
| 升級選卡 | `src/systems/progression.js` 的 `addXp()` 暫停並產生選項；`chooseUpgrade()` 套用升級，處理後續待選升級後才恢復。`rt.ui` 為空時不建立面板。 |
| 幕間 | 首領清除後由 `src/systems/interlude.js` 暫停戰鬥，處理路線、軍械庫與第 15 波的撤離或深入。 |
| 結束 | `triggerGameOver()` 先結算延後的撤離分，再設定 `over`。若為 standard/daily 模式則記錄 v2 最高分並提交帳號成績一次；若為 campaign 或 hardcore 模式則記錄星級評級與徽章，結算面板支援下一關（NEXT SECTOR）與重試雙重出口。`update()` 控制結算面板顯示時機。 |
| 重新開始 | `restart()` 以 `makeState()` 重建單局資料並回到開始／配裝畫面，不開始帳號局次。下一局由 `beginRun()` 開始。 |
| 無盡 | 選擇深入後戰鬥繼續；帳號成績留到最終 `triggerGameOver()` 才提交。 |
| 銷毀 | `destroy()` 停止 RAF、移除已註冊事件、斷開尺寸觀察，清除 runtime 參照與自動建立的 DOM。 |

## 4. 修改導航

以下路徑列出主要修改入口；細部規則、數值與完整符號以原始碼為準。

| 修改主題 | 主要入口 |
| --- | --- |
| 開始、暫停、重開、結算與評級 | `src/main.js`、`src/systems/flow.js`、`src/systems/scoring.js`、`src/ui/pause-menu.js`、`src/ui/hud.js` |
| 幕間、路線、撤離與無盡 | `src/systems/interlude.js`、`src/systems/director.js`、`src/ui/interlude-panel.js` |
| 大世界邊界與戰術 POI | `src/core/constants.js`、`src/systems/sim/poi.js`、`src/render/world.js` |
| 敵人、首領、波次與生成 | `src/systems/director.js`、`src/systems/spawning.js`、`src/systems/sim/timers-wave.js`、`src/systems/sim/enemies.js`、`src/systems/sim/bosses.js`、`src/systems/sim/new-enemies.js`、`src/systems/sim/enemy-defense.js` |
| 突變、合約、掉落與持續效果 | `src/systems/mutators.js`、`src/systems/contracts.js`、`src/systems/drops.js`、`src/systems/card-effects.js`、`src/ui/contracts-hud.js` |
| 配裝、改裝工坊、金庫、懸賞、熱度、每日與成就 | `src/systems/meta.js`、`src/data/modules.js`、`src/data/bounties.js`、`src/core/meta-store.js`、`src/ui/loadout-panel.js`、`src/ui/workshop-panel.js`、`src/ui/vault-panel.js`、`src/ui/bounties-panel.js`、`src/ui/codex-panel.js` |
| 幽靈殘影競速與分段計時 | `src/systems/ghost.js`、`src/render/ghost.js`、`src/ui/hud.js` |
| 武器、射擊、彈道與擦彈 | `src/systems/weapons.js`、`src/systems/sim/bullets.js`、`src/systems/sim/enemy-bullets.js` |
| 戰術輔助槽位與裝備實體 | `src/systems/tactical.js`、`src/ui/hud.js`、`src/input/keyboard-pointer.js`、`src/input/gamepad.js`、`css/hud.css`、`css/touch.css` |
| 衝刺、EMP、傷害、擊殺與掉落生成 | `src/systems/abilities.js`、`src/systems/combat.js` |
| 環境危險與掉落物拾取 | `src/systems/sim/hazards.js`、`src/systems/sim/orbs.js` |
| 升級、融合與構築檢視 | `src/data/upgrades.js`、`src/systems/progression.js`、`src/systems/card-effects.js`、`src/ui/upgrade-panel.js`、`src/ui/pause-menu.js` |
| 輸入映射與玩家移動 | `src/input/keyboard-pointer.js`、`src/input/gamepad.js`、`src/systems/sim/player.js` |
| 相機動力學、準星前瞻與戰術雷達 | `src/core/camera.js`、`src/render/draw.js`、`src/render/overlay.js`、`src/input/keyboard-pointer.js`、`src/input/gamepad.js` |
| 地表、大氣與光影 | `src/render/` 的 `draw.js`、`terrain.js`、`atmosphere.js`、`lighting.js`、`shadows.js`、`palette.js` |
| 實體造型、彈體與戰利品 | `src/render/` 的 `player.js`、`enemies.js`、`world.js`、`projectiles.js`、`entity-style.js` |
| 戰鬥視覺特效與覆蓋層 | `src/render/` 的 `fx.js`、`fx-rand.js`、`sprites.js`、`overlay.js`，以及 `src/core/fx-events.js`；模擬粒子與焦痕見 `src/core/pools.js`、`src/systems/sim/effects.js` |
| 畫質分級 | `src/core/settings.js`、`src/render/quality.js`、`src/ui/pause-menu.js`、`src/input/keyboard-pointer.js`、`src/ui/dom.js` |
| 頁面、HUD 與 iframe／觸控版面 | `index.html`、`src/ui/dom.js`、`src/ui/hud.js`、`css/animations.css`、`css/layout-fit.css`、`css/touch.css`、`css/responsive.css`、`css/loadout.css`、`css/codex.css`、`css/interlude.css`、`css/contracts.css` |
| 音訊、觸覺、減動效與高對比 | `src/audio/audio-fx.js`、`src/core/settings.js`、`src/ui/pause-menu.js`、`css/high-contrast.css`、`css/animations.css` 及對應 render 模組 |
| 介面語言與多語言本地化 | `src/core/i18n.js`、`src/ui/dom.js`、`src/ui/pause-menu.js`、`src/input/keyboard-pointer.js`、`index.html` |
| 帳號成績與平台交付 | `src/platform/playroom.js`、`game.json`、`scripts/stage-release.mjs`、`.github/workflows/release.yml` |

## 5. 資料與外部契約

### Runtime 與單局資料

`src/core/runtime.js` 定義 runtime 容器；`renderTime`、`renderDt`、`fxEvents` 在 `rt` 上，不屬於 `makeState()`，契約見第 2 節。`src/core/state.js` 的 `makeState()` 定義單局初始形狀，涵蓋流程旗標、波次／分數、玩家、實體集合、升級選項與戰鬥統計。執行期新增或更新的欄位以各系統的寫入處為準，不能只看初始值判斷完整資料模型。

`src/config.js` 是共用常數與識別值的來源。`src/data/upgrades.js` 的 `UPGRADES`／`FUSION_CHIPS` 定義卡片、前置條件與套用行為；同目錄的 `enemies.js`、`routes.js`、`contracts.js`、`mutators.js`、`rigs.js`、`heat.js`、`daily.js` 分別是敵人與首領基準、路線、合約、突變、機體、熱度與每日規則的來源。調整資料形狀時需一併核對讀寫它的 systems、render、UI 與自檢。

### DOM 與公開 API

- `index.html` 定義實際節點；`src/ui/dom.js` 的 `setupDom()` 定義查找規則與 `rt.ui` 對應，並在需要時建立 Canvas 與升級面板。面板與輸入模組也有直接 DOM 查找；修改 ID／class 時需核對使用處及 CSS。
- `src/main.js` 的 `api` 是完整公開介面來源。瀏覽器暴露 `window.LunaGame`，無 `window` 時暴露 `globalThis.LunaGame`，亦匯出 `api` 供模組匯入。
- 生命週期入口為 `init(options)`、`restart()`、`pause()`、`resume()`、`destroy()`；`init()` 接受 `{ root, canvas }`，已啟動時回傳既有 API。`getState()` 回傳內部狀態參照，並非快照或持久化存檔格式。

### 本機持久化

本機保存最高分、局外進度與偏好，不保存單局進度。儲存存取有例外保護，瀏覽器拒絕 storage 時遊戲仍可運作。

| 資料 | 契約來源與相容性 |
| --- | --- |
| 最高分 | HUD 與單局 `bestScore` 讀寫 `src/core/meta-store.js` 的 v2 key。`src/config.js` 的 v1 key 與 `dustReignBestScore` 仍可讀、不再由單局寫入。 |
| 局外進度 | `src/core/meta-store.js` 的 meta、每日、提示、改裝工坊（`dust-reign:workshop:v1`）、金庫（`dust-reign:vault:v1`）、懸賞（`dust-reign:bounties:v1`）與幽靈競速（`dust-reign:ghost:v1:<stageId>`）key。格式與預設值以該模組為準。 |
| 音量與靜音 | `src/audio/audio-fx.js` 的 `dust-reign:audio:v1`（儲存 JSON `{ muted, masterVolume }`；讀取優先新鍵，回退相容舊鍵 `dust_reign_audio_muted`、`dust_reign_master_volume` 並自動遷移）。 |
| 偏好設定與畫質分級 | `src/core/settings.js` 的 `dust-reign:settings:v1`（儲存 JSON `{ hapticsEnabled, motionReduction, highContrast, visualQuality }`；讀取優先新鍵，回退相容舊鍵 `dust_reign_haptics_enabled`、`dust_reign_motion_reduction`、`dust_reign_high_contrast`、`dust_reign_visual_quality` 並自動遷移）。畫質有效等級、自動降級與預算由 `src/render/quality.js` 提供。 |
| 介面語言 | `src/core/i18n.js` 的 `dust-reign:lang:v1`（`'zh'`、`'en'`；預設為 `'zh'`，讀取優先新鍵，回退相容舊鍵 `dust_reign_lang` 並自動遷移）。 |
| 雲端存檔與 Unified Save | `src/core/cloud-save.js` 提供全進度 Unified Save 序列化結構（< 16 KiB，層級 <= 5）、跨設備進度聯集取大值智慧合併（Smart Merge）演算法及樂觀鎖衝突重試（`SAVE_REVISION_CONFLICT`／`REQUEST_ID_REUSED`）。 |

調整 key 或資料格式時必須處理既有儲存相容性；本機最高分與帳號成績是兩套獨立資料。

### Playroom 成績與雲端存檔

`game.json` 是遊戲身分、版本、裝置宣告、榜單規則與雲端存檔相容性（Manifest Schema v2；`cloudSave: { readableFormats: [1], writeFormat: 1 }`）的來源。`src/platform/playroom.js` 動態載入根目錄 SDK 1.1.0，提供局次成績（`startAccountRun()`／`finishAccountRun()`）與帳號雲端進度（`loadAccountProgress()`／`saveAccountProgress()`／`saveAccountCheckpoint()`）。`beginRun()` 開始局次；`triggerGameOver()` 在計入延後撤離分之後結束局次。同一局只提交一次。

雲端存檔採用樂觀鎖版本控制（`revision`），由 `src/core/meta-store.js` 的 `exportUnifiedSaveData()` 打包乾淨 JSON 快照（$\le 64\text{ KiB}$，深度 $\le 32$，涵蓋 meta、campaign、hardcore、workshop、vault、bounties 與 bestScore），並由 `importUnifiedSaveData()` 執行跨設備最大化智慧合併（取最高星級、最佳分數、解鎖並集與最大廢料）。同快照重試嚴格沿用同一 `requestId`；遇 `SAVE_REVISION_CONFLICT`（409）自動重讀伺服器最新進度合併後重試；遇 `SAVE_FORMAT_INCOMPATIBLE` 停止寫入並警告。離線與訪客模式無縫降級，不阻塞玩法。

平台訊息協定由 `playroom-sdk.js` 處理；遊戲不直接讀取平台憑證或呼叫管理 API。平台接入、預覽診斷與驗收要求以 `AGENTS.md` 引用的最新線上規格為準。

## 6. 驗證與交付入口

| 用途 | 來源／入口 |
| --- | --- |
| 核心邏輯自檢 | Node 24 執行 `node scripts/self-check.mjs`；案例與覆蓋範圍以 `src/dev/self-check.js` 為準。瀏覽器亦可呼叫 `window.LunaGame.selfCheck()`。 |
| 相機動力學與視口驗證 | Node 24 執行 `node scripts/test-track1-camera.mjs`，驗證非對稱雙階阻尼、軟約束死區、Hermite 準星前瞻、震屏解耦逆映射與邊界夾持。 |
| 大地圖與視錐剔除驗證 | Node 24 執行 `node scripts/test-track2-terrain-culling.mjs`，驗證 3520x2640 空間網格對齊、視錐幾何 AABB 剔除率與 6 大 POI 生命週期。 |
| 偏好設定與雲端存檔驗證 | Node 24 執行 `node scripts/test-cloud-save.mjs` 與 `node scripts/test-track2-cloud-save.mjs`，驗證命名空間平滑遷移、快照限制、智慧合併與樂觀鎖衝突重試。 |
| 闖關與局外驗證 | Node 24 執行 `node scripts/test-i18n-verification.mjs`、`node scripts/test-campaign-modes.mjs` 與 `node scripts/test-track3-metagame.mjs`。 |
| 真實瀏覽器驗收 | Node 24 執行 `node scripts/test-browser-gameplay.mjs`，驗證 40 項端到端操作與無例外。 |
| 語法檢查與 CI 順序 | `.github/workflows/release.yml`。 |
| 成品收集 | `node scripts/stage-release.mjs`；白名單為根目錄 Manifest、入口、SDK、封面及 `src/**/*.js`、`css/**/*.css`，嚴格阻斷 `.playroom` 與版本控制元資料。 |
| staging 路徑 | `output/release/<version>/game` 與 CI 使用的 `output/game`；版本目錄已存在時 staging 會拒絕覆寫。 |
| 官方固定工具與 ZIP 驗收 | `.playroom/tools/playroom-game-tools-1.1.0.zip` 與 `.playroom/game-tools.lock.json`。解壓後由 `node pack-game.mjs output/game output/game.zip` 打包並由 `node validate-game.mjs output/game.zip` 驗收。Release workflow 逐檔校驗 SHA-256 並以 `--prerelease` 發布。 |

staging 不負責編譯，也不等同 ZIP 驗證。核心自檢、完整 ZIP 驗證及真實瀏覽器／平台預覽各有不同範圍；執行結果與發布狀態記錄於專用紀錄，不寫入本文件。
