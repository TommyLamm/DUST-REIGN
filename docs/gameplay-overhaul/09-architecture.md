# 09 架構與資料契約

[返回索引](README.md)

## 新模組

| 模組 | 責任 | 建立者 → 擁有者 |
| --- | --- | --- |
| `src/core/rng.js` | `rng(stream?)`、`seedRun(seed)`、`clearSeed()`；未設種子時回傳 `Math.random()` | P0 |
| `src/core/meta-store.js` | meta / best v2 / daily / tips 的 localStorage 讀寫與欄位回退 | P0 骨架 → WP-D |
| `src/data/enemies.js` | 敵型基準數值表（含既有 5 型 + Titan） | P0 抽出 → WP-B |
| `src/data/routes.js`、`src/data/mutators.js`、`src/data/contracts.js` | 路線、突變、合約定義 | WP-C |
| `src/data/rigs.js` | 機體定義與 `applyRig` | WP-D |
| `src/data/heat.js` | Heat 表與 `getHeatModifiers(heat)` | P0（完整） |
| `src/data/daily.js` | 每日規則表與 `getDailyRule(dateKey)` | P0 骨架（回傳 `null`）→ WP-D |
| `src/systems/card-effects.js` | 卡牌事件掛鉤：`onDash`、`onEmp`、`onPlayerDamaged`、`onLethal`、`onEnemyHit`、`onKill`、`onPickup` | P0 空函式 → WP-A |
| `src/data/upgrades.js` | 卡牌、稀有度、上限、融合（既有檔） | WP-A |
| `src/systems/director.js` | `startRun`、`planWave`、`onWaveStart`、`onWaveEnd`、`onBossDefeated`、首領排程、幕間觸發、無盡 | P0 骨架（回傳 v0.3 等價配方）→ WP-C |
| `src/systems/scoring.js` | `addScore(amount, source)`、倍率、`scoreBreakdown`、`calculateCombatRank` | P0 → WP-E |
| `src/systems/contracts.js` | 合約狀態與 `noteContractEvent(kind, data)` | P0 空函式 → WP-C |
| `src/systems/mutators.js` | `stepMutators(frame)` 與突變效果 | P0 空函式 → WP-C |
| `src/systems/drops.js` | 擊殺掉落（維修、Overdrive、補給箱） | P0 從 `killEnemy` 抽出 → WP-C |
| `src/systems/interlude.js` | 幕間與撤離流程（路線、軍械庫、EXTRACT / PUSH DEEPER） | WP-C |
| `src/systems/meta.js` | `applyLoadout(state)`、`noteMetaEvent(kind, data)`、`onRunEnd(state)`（成就、統計、解鎖） | P0 空函式 → WP-D |
| `src/systems/sim/enemy-defense.js` | `filterEnemyDamage(e, amount, info)`：護盾、鑽地無敵、Sovereign 護盾、Dreadnought 背擊倍率 | P0（直通）→ WP-B |
| `src/systems/sim/new-enemies.js` | Spitter / Scurrier / Warden / Burrower 行為 | WP-B |
| `src/systems/sim/bosses.js` | Dreadnought / Sovereign 行為與生成 | WP-B |
| `src/ui/loadout-panel.js`、`src/ui/codex-panel.js` | 開局配裝、圖鑑 | WP-D |
| `src/ui/interlude-panel.js`、`src/ui/contracts-hud.js` | 幕間／撤離面板、合約 HUD、突變橫幅 | WP-C |
| `src/ui/tips.js` | 新手提示佇列與顯示 | WP-E |
| `src/dev/checks/*.js` | 分領域自檢：`build.js`（A）、`enemies.js`（B）、`director.js`（C）、`meta.js`（D）、`scoring.js`（E） | P0 建立空檔 |

## 共用檔案的掛鉤（第 0 階段一次建立）

並行工作包不改這些共用檔案；它們只呼叫上表模組的函式。

| 共用檔 | 第 0 階段改動 |
| --- | --- |
| `src/core/state.js` | 加入下方所有新欄位與預設值 |
| `src/systems/update.js` | 在 `stepWaveClock` 之後呼叫 `stepMutators(frame)`；在 `stepEffects` 之後呼叫 `stepContracts(frame)`；幕間／撤離面板開啟時與升級選卡一樣不推進戰鬥 |
| `src/systems/combat.js` | 新增 `damagePlayer(amount, source)` 與 `damageEnemy(e, amount, info)`；`killEnemy(e, cause)` 加 `cause` 參數；擊殺分數改呼叫 `addScore`；掉落改呼叫 `rollDrops(e)`；擊殺後呼叫 `noteContractEvent('kill', …)`、`noteMetaEvent('kill', …)`，首領死亡呼叫 `onBossDefeated(e)` |
| sim 檔（`enemies.js`、`enemy-bullets.js`、`hazards.js`、`abilities.js` 等） | 所有直接扣玩家 HP 的地方改呼叫 `damagePlayer`（約 22 處）；所有直接扣敵人 HP 的地方改呼叫 `damageEnemy`；所有 `Math.random()` 改為 `rng('spawn')` 或適當的流 |
| `src/systems/flow.js` | `beginRun` / `restart` 呼叫 `applyLoadout(state)` 與 `directorStartRun(state)`；`restart` 改為重設到所選主武器（不再固定 `standard`）；新增 `extractRun()`；`triggerGameOver` 呼叫 `onRunEnd(state)`；評級改呼叫 `scoring.calculateCombatRank` |
| `src/systems/spawning.js` | `spawnEnemy` 改讀 `state.recipe` 的權重與 `src/data/enemies.js`；首領生成交給導演排程；行為與 v0.3 等價 |
| `src/systems/sim/timers-wave.js` | 過波時呼叫 `onWaveEnd` / `onWaveStart`（導演決定配方、突變、合約）；首領死亡即結束首領波 |
| `src/input/keyboard-pointer.js`、`src/input/gamepad.js` | 移除武器切換輸入；保留函式 |
| `src/ui/hud.js` | `updateDomUi` 呼叫 `updateContractsHud()`、`updateTips()`；波次牌顯示 `ACT · WAVE` |
| `src/render/overlay.js` | Titan 血條改為通用 `rt.state.boss` |
| `src/render/palette.js` | `sectorForWave` 優先讀 `rt.state.sector` |
| `index.html` | 新增空容器 `#loadoutPanel`、`#interludePanel`、`#extractPanel`、`#contractTracker`、`#tipToast`、`#codexPanel` 與升級面板控制列容器；連結 `css/loadout.css`、`interlude.css`、`contracts.css`、`codex.css`（空檔） |
| `src/dev/self-check.js` | 匯入並執行 `src/dev/checks/*.js` |

第 0 階段完成時，遊戲行為必須與 v0.3.0 等價（除了移除武器切換輸入），自檢全部通過。

## `rt.state` 新欄位

```js
// added by makeState(); defaults keep v0.3 behavior
act: 1, sector: 'dusk', recipe: null, mutator: null, route: null, routeHistory: [],
contract: null,            // { id, progress, goal, reward, done, failed }
boss: null,                // reference to the live boss enemy
bossesDefeated: [], extracted: false, overtime: false, overheat: 0,
interlude: null,           // null | { step: 'route' | 'armory' | 'extract', options: [] }
rerolls: 1, banishes: 1, banished: [],
heat: 0, rigId: 'scrapper', weaponId: 'standard', daily: null, // { date, rule }
scoreBreakdown: { kill: 0, bounty: 0, storm: 0, graze: 0, repair: 0, wave: 0, flawless: 0, boss: 0, style: 0, contract: 0, overtime: 0, extract: 0 },
waveDamageTaken: 0, flawlessStreak: 0,
// stats additions: contractsCompleted, justDashes, partsDestroyed, flawlessWaves, barrelChainMax, fusionsUnlocked
// player additions:
// mastery: 0, dashCharges: 1, dashChargesMax: 1, dashHeat: 0, dashHeatTimer: 0,
// damageTakenMult: 1, moveSpeedMult: 1, empCost: 50, empRadiusBonus: 0,
// repairBonus: 0, batteryMax: 100, batteryRegen: 2, phoenix: false, shield: 0
```

- `batteryMax` / `batteryRegen` / `empCost` 取代現在寫死的 100 / 2 / 50；預設值保持現況。
- 卡牌（WP-A）、機體（WP-D）、Heat（WP-D）、技巧（WP-E）都只改這些欄位，讀取端由第 0 階段接好。

## 傷害入口

```js
// combat.js
damagePlayer(amount, source)   // returns applied damage; handles invuln, damageTakenMult, shield,
                               // phoenix, stormHurt, waveDamageTaken, contract/meta notes, fx 'playerHit'
damageEnemy(e, amount, info)   // info: { source, crit, bullet, x, y }; calls filterEnemyDamage,
                               // updates stats.damageDealt, returns applied damage
killEnemy(e, cause)            // cause: 'bullet' | 'dash' | 'barrel' | 'core' | 'emp' | 'spire' | 'zone' | 'other'
```

- 既有的無敵時間、`hurtFlash`、音效與觸覺仍由呼叫端或 `damagePlayer` 依原本數值處理；第 0 階段要逐處比對，確保自檢裡的 HP 數字不變。

## 視覺事件

- 第 0 階段在 `src/render/fx.js` 加入通用事件 `burst`：`pushFxEvent('burst', x, y, { preset, tint, scale })`，`preset` 可用 fx.js 既有 preset 名稱。
- 新事件種類只在整合階段加入 fx.js；並行工作包只能用 `burst` 與既有種類。

## 自檢變更清單

刻意改變規則、必須同步改寫的既有斷言：

| 斷言 | 新規則 | 文件 |
| --- | --- | --- |
| 評級九個案例 | 分數門檻 + 撤離 + `S+` | [06](06-skill-scoring-controls.md#評級) |
| 融合正好 6 張 | 正好 10 張，前置兩兩不重疊 | [03](03-builds-and-weapons.md#新融合4-個) |
| 「保證 1 張 OFFENSE」 | OFFENSE 或 WEAPON | [03](03-builds-and-weapons.md#抽牌規則取代-randomupgradechoices) |
| Titan 彈傷（若有斷言） | 乘 `bulletScale` | [04](04-enemies-and-bosses.md#titan第-5-波既有) |
| `restart` 武器回到 `standard` | 回到所選主武器（預設仍是 `standard`） | [03](03-builds-and-weapons.md#主武器承諾) |

必須維持不變的既有斷言：擊殺與連殺分數、賞金、維修與溢出、擦彈、風暴時間與位移、普通／Just Dash 第一次的冷卻與伏擊、踢桶、核心與踢桶打 Titan、武器循環函式、破城／先鋒／電弧數值、六個既有融合的效果、詞綴、Titan 零件、尖塔、結算 DOM。

## 架構文件

整合階段更新 `ARCHITECTURE.md`：模組表、共用邊界（傷害入口、導演、`rng`）、單局流程（幕間、撤離、無盡）、持久化表（新 key）、修改導航。依其維護規則，不寫數值與完成紀錄。
