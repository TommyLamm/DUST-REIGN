# Architecture Overview — DUST//REIGN

本文件為系統現狀規格說明書（Present-tense Specification）與開發導航地圖，旨在協助開發者與 Coding Agent 快速掌握專案架構並精準定位功能修改路徑。程式碼與執行環境為最終真相。

專案為單頁、零建置依賴、純瀏覽器 Canvas 2D roguelike 射擊遊戲。

---

## 1. 專案結構（Project Structure）

```text
.
├── index.html                # 靜態頁面結構、HUD 介面、對話框與觸控按鈕
├── styles.css                # 視覺風格、排版版面、響應式斷點與減動效規則
├── game.js                   # 遊戲 Runtime：狀態管理、輸入、碰撞、模擬與 Canvas 繪製
├── playroom-sdk.js           # Playroom 平台成績與局次 SDK（零依賴 ES 模組）
├── game.json                 # Playroom 遊戲清單（Manifest：定義 ID、版本與排行榜）
├── cover.png                 # 平台展示封面圖
├── scripts/stage-release.mjs # 發布成品白名單（上述 6 檔）與 Manifest 一致性驗證腳本
├── .github/workflows/        # CI 發布工作流程
├── AGENTS.md                 # 專案規範與 Agent 指令
└── ARCHITECTURE.md           # 本架構與導航文件
```

專案不依賴打包工具、外部套件或外部 CDN。正式發布成品為根目錄 6 個核心檔案。

---

## 2. 功能修改導航地圖（Feature Navigation Matrix）

| 核心系統 | 主要檔案 | 關鍵函式 / 選擇器 | 規格與修改定位說明 |
| --- | --- | --- | --- |
| **敵人與首領體系** | `game.js` | `spawnEnemy`, `spawnTitan`, `drawEnemy`, `fireArtillery` | 6 種敵型（crawler, rusher, brute, elite, artillery, titan）。Elite 第 3 波生成；Artillery 第 2 波起生成（HP 85+wave*12，預判玩家落點開火，1.2s 延遲引爆並留 2s 熔岩燃燒區）；Titan 於第 5/10 波第 8 秒生成（雙階段：P1 雙聯電漿彈，P2 半血狂暴釋放氣爆擊退、8 向彈幕與召喚 Rusher）。 |
| **主動技能 (EMP)** | `game.js`, `styles.css`, `index.html` | `triggerEmp`, `AudioFX.emp`, `#meterEnergy`, `#touchSpecial` | 次要戰術技能：消耗 50 電池能量（上限 100，自然回充 +2/s，拾取 Scrap +3.5，暴擊 +4.0）。引爆 140px 青藍震波，瓦解範圍內敵彈、造成 35 傷害、減速 70% 癱瘓 2.2s。支援滑鼠右鍵、Q/E 鍵、手把 LB/B 鍵與觸控按鈕 `#touchSpecial`。 |
| **戰鬥反饋與擦彈** | `game.js` | `update`, `drawEnemy`, `AudioFX.critHit`, `AudioFX.graze` | 命中觸發閃白環、定向火花與微震；Dash 伏擊 (0.6s 內) 或 High Caliber 觸發暴擊（1.75x / 2.2x 傷害、金屬撞擊音與金色火花）。Graze 擦彈機制：敵彈近身掠過玩家半徑 18px 內給予 +15 分數、噴射金黃火花與 `AudioFX.graze()`。 |
| **戰鬥遙測與儀式** | `game.js`, `styles.css` | `state.stats`, `triggerGameOver`, `drawOverlay`, `.new-record-stamp` | 全局戰鬥遙測統計（開火數、命中數、累積傷害、暴擊、核心引爆、擦彈、最大連殺）。結算時渲染 4 格工業儀表板與 0.55s CRT 斷電坍縮動畫；破紀錄時展示金框落印 `#newRecordStamp`。 |
| **擊殺與連殺** | `game.js` | `killEnemy`, `draw`, `AudioFX.kill` | 基礎分數：crawler 20 / rusher 35 / artillery 60 / brute 90 / elite 180 / titan 800。Combo 連殺上限 8 層（每層 +25% 分數，4s 有效窗口，階梯升調音效）。依敵型等級觸發 2.5~16 級震屏與 `killRing` 擴散環。 |
| **彈道與光學** | `game.js` | `draw`, `shoot`, `update` | 零 `shadowBlur` 開銷；雙層線段（外光暈與高亮內芯）繪製流體軌跡；Rail Slug 穿透衝擊環與逆向金屬火花；Ricochet 牆面彈跳扇形火花與貼壁光斑 (`opticalFlashes`)；Titan 電漿彈橙紅光暈。 |
| **衝刺與動能** | `game.js` | `dash`, `drawPlayer`, `addDecal` | Dash 賦予 0.32s 無敵位移 (CD 2.2s)；擊殺回充冷卻（每次 0.65s，上限 1.3s）；起點剪影殘影 (`dashTrail`)、落點雙色脈衝環與地面煞車貼花。 |
| **掉落物與資源** | `game.js` | `drawOrb`, `update`, `spawnOrb` | 165px 磁吸。Scrap（圓形，連殺提供 XP 加成）；Repair（方鑽加號，回復 18 HP，滿血溢出轉 12 分）；Overdrive（雙層方環，賦予 6s 爆發：冷卻 -38%、傷害 +50%）。高對比模式下中心帶幾何識別符號。 |
| **升級構築卡池** | `game.js` | `UPGRADES`, `addXp`, `renderUpgradePanel`, `chooseUpgrade` | 12 張三分類升級卡（OFFENSE / DEFENSE / TACTICAL），抽卡保底 $\ge$ 1 張 OFFENSE。升級門檻 `xpNext * 1.24 + 28`。支援鍵盤 1/2/3 與手把 X/Y/B 快捷選卡。 |
| **動態環境與核心** | `game.js`, `styles.css` | `isStormFront`, `drawBackground`, `explodeCore`, `drawDecals` | 每波最後 5s 風暴前線（生成間隔 *0.72、流體沙塵線、無傷擊殺 3 敵達成風暴破曉者獎勵）；第 8~16 秒隨機生成不穩定核心（HP 30，擊破引發 130px 爆炸，90 敵傷 / 15 誤傷）；64 個 GC-Free 地表焦痕池。 |
| **音訊與觸覺** | `game.js`, `styles.css` | `AudioFX`, `triggerHaptic`, `#audioBtn` | Web Audio API 15 種程序合成音效；M 鍵與按鈕切換靜音；低血量 (<35%) 1400Hz 低通濾波與雙跳心跳；安全封裝 Vibration API（Dash、受傷、Elite、EMP、Titan 狂暴震動；靜音與減動效自動抑制）。 |
| **手感物理** | `game.js` | `state.hitstop`, `shoot`, `drawPlayer`, `drawCasings` | Hitstop 頓幀（Titan 55ms, Elite 45ms, Brute 25ms, Combo 20ms, Dash/EMP 30~35ms）；開火產生 1.4px 逆向推力、槍管 3.5px 縮進；36 顆 GC-Free 側後方拋殼池。 |
| **輸入控制** | `game.js`, `styles.css` | `bindInput`, `pollGamepad`, `#touchJoystickZone`, `#touchSpecial` | 鍵盤 WASD/方向鍵移動、滑鼠開火、空白鍵衝刺、Q/E/右鍵施放 EMP；懸浮動態搖桿（Floating Origin 手指動態錨定、360° 映射）；Gamepad API 雙搖桿與按鈕映射。 |
| **暫停與設定** | `game.js`, `index.html`, `styles.css` | `#pauseModal`, `togglePause`, `switchPauseTab`, `updateSettingsUi` | 暫停選單（`#pauseModal`）提供 3 分頁：`SYSTEM`（音量、靜音、震動、減動效、高對比）、`RIG BUILD`（武器構築數值與晶片）、`CONTROLS`（操作鍵位表）。底部支援放棄單局與繼續戰鬥。 |
| **無障礙與視覺強化** | `game.js`, `styles.css` | `isHighContrast`, `.game-root.is-high-contrast` | 高對比模式：HUD 高飽和邊框；敵人雙層黑白高對比描邊與頭頂敵型符號（▲, ⚡, ■, ⬡, ★, ☠）；掉落物幾何標記。Reduced Motion 模式全面歸零震屏與 Hitstop，平滑弱化受擊閃爍。 |
| **構築檢視** | `game.js`, `styles.css` | `state.acquiredUpgrades`, `renderBuildInspector`, `.build-inspector` | 記錄單局已選升級；即時計算 RPS、DMG、暴擊率、穿透數、機甲速度、磁吸半徑；動態顯示被動特質標籤（Shockwave, Tesla, Reactive, High-Caliber）與已安裝晶片。 |
| **HUD 與介面** | `game.js`, `index.html`, `styles.css` | `updateDomUi`, `logEvent`, `#meterEnergy` | 即時同步生命、經驗、電池能量、等級、波次、分數、擊殺數；SCAV RADIO 最新 5 筆日誌；極窄螢幕 (<=360px) 單行 HUD 與 100dvh 無捲軸適配。 |
| **平台整合** | `playroom-sdk.js`, `game.js` | `startAccountRun`, `finishAccountRun`, `isReducedMotion` | Playroom SDK 異步載入、開局 `startRun()` 與結算 `finishRun()` 上傳排行榜；沙盒降級運行；榜單規則與局次驗證一致性保證。 |

---

## 3. 高階架構與狀態機（Architecture & State Machine）

### 3.1 系統資料流

```text
瀏覽器 / Iframe 沙盒
  ├── index.html ── 載入 HUD 結構、對話框、虛擬搖桿 DOM
  ├── styles.css  ── CRT 風格、響應式斷點、Reduced Motion 樣式
  └── game.js     ── 單一引擎 Runtime
        ├── 輸入輪詢 (Keyboard / PointerCapture / Gamepad API)
        ├── requestAnimationFrame (固定上限 dt = 0.05s)
        │     ├─ update(dt) : 位移、碰撞、風暴計時、數值模擬
        │     ├─ draw() : Canvas 2D 畫布 12 層分層繪製
        │     └─ updateDomUi() : 同步 HTML HUD 與 ARIA 狀態
        └── 外部存儲 : LocalStorage (本地最高分/偏好) & playroom-sdk.js (平台排行榜)
```

### 3.2 遊戲狀態機

```text
[ STANDBY ] ── Enter / 開始按鈕 / 觸控點擊 ──> [ LIVE ]
                                                │
             P 鍵 / Esc / 暫停按鈕 <───────────┼───────────> [ PAUSED ]
                                                │                  ▲
          升級 XP 達標（自動暫停 + 彈出面板）───┘                  │ 快捷鍵/點擊選卡
                                                │                  │
                             玩家生命歸零 ──────┴──────> [ GAME OVER ]
                                                                │
                                        R 鍵 / 重開按鈕 ────────┘
```

---

## 4. 核心狀態與資料模型（Core State & Data Model）

### 4.1 狀態物件結構（`makeState(width, height)`）

單局運行數據封裝於單一 `state` 物件：

| 模組 | 關鍵欄位 | 規格說明 |
| --- | --- | --- |
| **運作旗標** | `running`, `paused`, `over`, `bossSpawned`, `deathSequenceTimer`, `isNewRecord` | 遊戲運行/暫停/結算狀態；首領生成標記；CRT 斷電坍縮倒數 (0.55s)；歷史新高標記。 |
| **波次與分數** | `level`, `xp`, `xpNext`, `score`, `kills`, `wave`, `waveTime` | 等級與升級門檻 (`xpNext * 1.24 + 28`)；分數、擊殺數；波次計時（30s/波，第 5/10 波 8s 生成 Titan）。 |
| **賞金任務** | `bountyTarget`, `bountyKills`, `bountyReward`, `bountyClaimed` | 當波目標擊殺數 (`5 + wave * 2`)；達成獎勵 (`120 + wave * 40` 分與 3s Surge 超頻）。 |
| **反饋與打擊** | `hitstop`, `shake`, `hurtFlash`, `hurtBorder`, `levelPulse`, `statusTimer` | 頓幀凍結倒數；震屏強度；受傷淡紅遮罩與紅內框；升級光環；廣播秒數。 |
| **動態環境** | `stormAlerted`, `bannerText`, `stormKills`, `stormHurt`, `coreSpawned` | 風暴警報標記；廣播文字；風暴期擊殺與受傷追蹤；不穩定核心刷新旗標。 |
| **玩家實體 (`player`)** | `x`, `y`, `r`, `hp`, `maxHp`, `energy`, `maxEnergy`, `speed`, `invulnerable`, `damage`, `fireRate`, `recoil`, `dashCooldown`, `dashPulse`, `dashRefund`, `dashTrail`, `dashAmbushTimer`, `overdrive`, `magnetRadius` | 機甲半徑 (15px)；生命 (100)；電池能量 (50/100，+2/s 回充)；速度 (235px/s)；無敵秒數；傷害 (26)；冷卻 (0.18s)；Dash 冷卻 (2.2s) 與回充；殘影與伏擊計時；超頻秒數 (6s)；磁吸半徑 (165px)。 |
| **升級特性標記** | `pierce`, `bounces`, `shockwaveDash`, `teslaCoil`, `reactiveArmor`, `highCaliber`, `acquiredUpgrades` | 貫穿次數、跳彈次數、衝刺震波、拾取電弧、受擊反甲、重口徑暴擊；已選卡片清單陣列。 |
| **戰鬥遙測 (`stats`)** | `shotsFired`, `shotsHit`, `damageDealt`, `crits`, `coresDetonated`, `grazes`, `maxCombo` | 單局射擊數、命中數、累積傷害、暴擊次數、核心引爆、擦彈次數與最大連殺數。 |
| **實體陣列池** | `bullets`, `enemyBullets`, `enemies`, `artilleryTargets`, `opticalFlashes`, `volatileCores`, `orbs`, `particles`, `shockRings`, `lightningArcs`, `casings`, `decals` | 子彈、敵彈、敵人、迫擊砲目標區、光斑、核心、掉落物、粒子（上限 700）、震波環、電弧；36 顆彈殼池；64 個焦痕池。 |

### 4.2 核心常數與升級卡池

```javascript
const WAVE_LENGTH = 30;           // 每波長度 30 秒
const STORM_FRONT_SECONDS = 5;    // 每波末 5 秒為風暴前線
const STORM_SPAWN_FACTOR = 0.72;  // 風暴前線生成間隔乘率
const COMBO_WINDOW = 4;           // 連殺有效窗口 4 秒
const MAX_COMBO = 8;              // 連殺上限 8 層（每層 +25% 分數、+10% Scrap XP）
const OVERDRIVE_DURATION = 6;     // 精英超頻 6 秒（冷卻 -38%，傷害 +50%）
```

- **三選一升級卡池（`UPGRADES`，12 張，保底 $\ge$ 1 張 OFFENSE）**：
  - **OFFENSE**：`rapid-fire` (射速冷卻 *0.82)、`scatter-shot` (傷害 +8)、`hot-load` (子彈速度 +180、半徑 +1)、`rail-slug` (貫穿 1 敵 / 餘傷 70%)、`ricochet` (跳彈 1 次 / 速度 90%)、`high-caliber` (暴擊倍率 2.2x / 20% 平射暴擊率)。
  - **DEFENSE**：`heavy-plating` (生命上限 +25 並回復 40 HP)、`reactive-armor` (受傷釋放 75px / 30 傷害防衛脈衝)。
  - **TACTICAL**：`overdrive-injector` (Overdrive +2.5s 並觸發 3.5s Surge)、`magnet-core` (磁吸 +65px 與 Scrap XP *1.25)、`shockwave-dash` (衝刺半徑 125px / 2x 擊退)、`tesla-coil` (拾取 Orb 電弧攻擊最近 2 敵 22 傷)。

### 4.3 儲存與平台契約

- **本地 LocalStorage**（封裝於 `try-catch` 確保沙盒容錯）：
  - `dust-reign:best-score:v1`：歷史最高分。
  - `dust_reign_audio_muted`：音效靜音偏好（`"true"` / `"false"`）。
  - `dust_reign_master_volume`：主音量設定（0~100，預設 80）。
  - `dust_reign_haptics_enabled`：觸覺反饋震動開關（預設 true）。
  - `dust_reign_motion_reduction`：動態減敏開關（未設定時回退系統 `prefers-reduced-motion`）。
  - `dust_reign_high_contrast`：高對比無障礙模式開關（預設 false）。
- **Playroom 排行榜**：榜單 ID 為 `dust-reign-score`，透過 `playroom-sdk.js` 呼叫 `startRun()` 與 `finishRun({ runId, score })`。

---

## 5. 渲染管線與回饋機制（Rendering Pipeline & Feedback）

### 5.1 繪製層次順序

`draw()` 依序繪製 12 個圖層：

```text
 1. 背景層 (drawBackground)       : 滾動網格、隨機碎屑地形、風暴 35° 流體沙塵線
 2. 焦痕層 (drawDecals)           : 64 個 GC-Free 地表焦痕貼花池，12~18s 衰減
 3. 彈殼層 (drawCasings)          : 36 顆旋轉黃銅彈殼池，淡出衰減
 4. 資源層 (drawOrb)              : 掉落物幾何圖形 (Scrap 圓形 / Repair 方鑽 / Overdrive 雙環)
 5. 子彈層                        : 雙層流體光學軌跡線、Rail Slug 衝擊環、跳彈貼壁光斑 (opticalFlashes)
 6. 迫擊砲區與敵彈衝擊環          : 迫擊砲 46px 預警圈與熔岩燃燒區、精英電漿彈、EMP 衝擊環、電弧
 7. 敵人實體 (drawEnemy)          : 深色描邊、Elite 旋轉齒環、Rusher 預警殘影、Artillery 六邊形底座
 8. 不穩定核心 (drawCores)        : 能量石旋轉多邊形與血條
 9. 粒子特效                      : 命中、擊殺、爆炸、擦彈方塊粒子（重力與阻力模擬）
10. 玩家實體 (drawPlayer)         : Dash 剪影殘影、雙色脈衝環、船體後座力縮進、砲口菱形火花
11. 擊殺擴散環 (killRing)        : 8~60px 擊殺擴散光環（薄荷綠至琥珀色）
12. 遮罩與 HUD (drawHud/Overlay) : 低血量心跳紅暈、受傷紅框、橫幅廣播、暫停/結算遮罩
```

### 5.2 打擊感反饋規則

- **Hitstop 頓幀**：關鍵擊殺與多目標打擊凍結 `update`（Titan 55ms, Elite 45ms, Brute 25ms, Combo 20ms, Dash/EMP 30~35ms），保留畫面震動。
- **後座力與拋殼**：射擊時玩家逆向後退 1.4px，槍管內縮 3.5px，側後方拋出帶旋轉動態彈殼。
- **Reduced Motion 降級**：系統減動效開啟時，震屏與 Hitstop 歸零，停用 Dash 剪影，縮短受擊閃白至 0.06s，受傷紅閃平滑淡出。

---

## 6. DOM 合約與公開 API（DOM Contracts & Public API）

### 6.1 核心 DOM 節點

- **畫布**：`#gameCanvas`
- **頂部 HUD**：生命 `#health` / `#healthFill`、經驗 `#xp` / `#xpMax` / `#xpFill`、電池能量 `#hudEnergy` / `#meterEnergy` / `#energyFill`、等級 `#level`、波次 `#wave`、分數 `#score`、擊殺 `#kills`、歷史最高 `#hudBest`、廣播 `#hudStatusText`
- **任務側欄**：賞金目標 `#objectiveText`、賞金進度 `#objectiveProgress`、威脅等級 `#threatIndex`、風暴倒數 `#waveTimer`、日誌 `#runLog`
- **對話框與面板**：
  - 開始畫面 `#startScreen` (`#startBtn`)
  - 死亡畫面 `#gameOver` (`#restartButton`, `#runTelemetry`, `#newRecordStamp`)
  - 升級面板 `#upgradeOverlay` (`#upgradeChoices`)
  - 控制按鈕：音效切換 `#audioBtn`、暫停按鈕 `#pauseBtn`
  - 暫停診斷面板 `#pauseModal`：頁籤切換（`#tabBtnSystem`, `#tabBtnBuild`, `#tabBtnControls`）、設定控制項（`#settingMasterVolume`, `#toggleAudioMute`, `#toggleHaptics`, `#toggleMotionReduction`, `#toggleHighContrast`）、機體檢視（`#buildStatsGrid`, `#buildTags`, `#installedChipsList`）、按鈕（`#pauseResumeBtn`, `#pauseAbandonBtn`）
- **觸控按鍵**：懸浮動態搖桿 `#touchJoystickZone` (`#joystickBase`, `#joystickThumb`, `.joystick-guide`)、開火 `#touchShoot`、衝刺 `#touchDash`、戰術技能 `#touchSpecial`

### 6.2 公開 API（`window.LunaGame`）

```javascript
window.LunaGame = {
  init(options): api,          // 冪等初始化，可自訂 { root, canvas }
  restart(): void,             // 重置狀態並啟動新單局
  pause(): void,               // 暫停遊戲運行
  resume(): void,              // 恢復遊戲運行
  destroy(): void,             // 停止 RAF、解綁事件、釋放資源
  getState(): object,          // 取得內部單一 state 參照
  getPlayroom(): object|null,  // 取得 Playroom SDK 實例
  getAudio(): object,          // 取得 AudioFX 程序合成器
  triggerGameOver(): void,     // 手動觸發死亡結算
  selfCheck(): object          // 執行內部邏輯無介面自動檢驗
};
```

---

## 7. 開發與驗證指南（Development & Verification）

專案為純靜態架構，無須建置步驟，可直接開啟 `index.html` 或透過靜態伺服器預覽。

```bash
# 1. 語法正確性檢驗（無報錯方可提交）
node --check game.js

# 2. 內部核心邏輯自檢（Node 或瀏覽器 Console 執行）
# window.LunaGame.selfCheck() 自動驗證項目：
# - 基礎擊殺分數計算與 Combo 乘率爬音（crawler, rusher, artillery, brute, elite）
# - Brute / Elite 掉落物生成與滿血溢出分數轉換
# - 賞金達成獎勵分與 3s Surge 超頻觸發
# - 波末 5s 風暴前線狀態切換與換波重設
# - Dash 脈衝擊殺冷卻回充與上限控制
# - 連殺 Scrap XP 乘率加成
# - Rusher 衝刺段速度與冷卻觸發
# - Artillery 迫擊砲擊殺分數 (60) 與掉落判定
# - 近身彈幕擦彈 Graze 機制判定（加分 +15 與計數增加）
```
