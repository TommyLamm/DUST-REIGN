# 14 P0 掛鉤契約（實作現況）

[返回索引](README.md)

P0 已完成並經審核。本頁記錄當時的掛鉤；P1 之後的模組責任以 `ARCHITECTURE.md` 與原始碼為準。首領血量、Heat 敵傷與每日種子已改成現況，數值表見 [10](10-balance-sheet.md)。其餘段落若與原始碼不同，以原始碼為準。

## 不變條件

- 跨模組呼叫都在函式內。`src/systems/**` 不 import `src/render/**`。
- `src/systems/**` 不直接使用 `Math.random`，一律 `rng(stream)`。未設種子時 `rng()` 每次正好呼叫一次 `Math.random()`。
- 直接扣 HP 的例外只有油桶本體、核心本體、Titan 左右零件 HP；其他一律走傷害入口。

## `src/core/rng.js`

- `seedRun(seed)`：種子設為 `String(seed)`，清空所有流。
- `clearSeed()`：回到未設種子。
- `rng(stream?)`：未設種子回傳 `Math.random()`；已設種子時每個流名一條 mulberry32，種子為 `hash32(seed + '\0' + stream)`，缺省流名 `'default'`。

| 流 | 使用處 |
| --- | --- |
| `spawn` | `spawning.js`；`timers-wave.js` 生成間隔與 `coreSpawnTime`；`enemies.js` 召喚座標、phase、`burstCd` 初值；`hazards.js` 核心生成座標 |
| `loot` | `drops.js`；`bullets.js` Titan 零件維修與 Overdrive 球 |
| `cards` | `progression.js` |
| `director` | 保留給 WP-C（P0 的 `planWave` 不消耗亂數） |
| `combat` | 槍口散布、暴擊、破片、敵方 AI、擦彈與模擬粒子、焦痕壽命 |

## `src/core/meta-store.js`

Key：`dust-reign:meta:v1`、`dust-reign:best-score:v2`、`dust-reign:daily:v1`、`dust-reign:tips:v1`、`dust-reign:tips-enabled:v1`。storage 失敗不拋錯。

- `readMeta()` / `writeMeta(partial)`：逐欄回退。預設 `{ v:1, selectedRig:'scrapper', selectedWeapon:'standard', selectedHeat:0, heatUnlocked:0, unlockedRigs:['scrapper'], achievements:{}, stats }`；`stats` 含 `runs, kills, justDashes, contracts, extractions, bestWave, bossKills, fusionsSeen, playTimeSec, seenEnemies`。
- `readBestScoreV2()` / `writeBestScoreV2(score)`
- `readDaily()` / `writeDaily(partial)`：`{ date:'', best:0, runs:0 }`
- `readTipsEnabled()`（預設 true）/ `writeTipsEnabled(bool)`；`readTipsSeen()` / `writeTipsSeen(list)` / `resetTipsSeen()`
- 暫停 SYSTEM 的 `#toggleTips`、`#resetTips` 由 `keyboard-pointer.js` `bindInput` 綁定，`pause-menu.js` `updateSettingsUi` 更新文字。

## `src/data/enemies.js`

`enemyProfile(kind, wave, scales)`；`scales.hpScale` / `dmgScale` 缺省 1，只乘 HP 與接觸傷，不乘速度。P0 數值等於 v0.3：

- crawler：hp `43+7w`、speed `51+2.1w`、damage `13+w`、r 14
- rusher：`26+5w`、`91+3.2w`、`9+0.8w`、r 10
- brute：`125+16w`、`32+1.4w`、`25+1.6w`、r 23
- artillery：`85+12w`、`28+1.2w`、`18+w`、r 16
- elite：`190+24w`、`43+1.8w`、`20+1.3w`、r 19
- titan：第 5 波 4200，第 20 波前每波 +780；無盡從 4200 乘 `(1 + 0.35 × 輪次)`。speed 36、接觸傷 `28+1.5w`、r 32

呼叫者：`spawning.js` 的 `spawnEnemy` / `spawnTitan`、`enemies.js` 的 Titan 召喚。

## `src/data/heat.js`

`getHeatModifiers(heat)`（夾 0–5，累加）回傳 `{ heat, enemyHpScale, enemyDmgScale, eliteAffixMinWave, eliteChanceBonus, repairHeal, stormSeconds, bulletSpeedScale, bossPhaseEarly, startingRerolls, scoreMultiplier, extractBonus }`。敵血 `1 + 0.10 × Heat`，敵傷 `1 + 0.05 × Heat`。`state.heat` 預設 0。

## `src/data/daily.js`

`getDailyRule(dateKey)` 接受玩家本地日期 `YYYY-MM-DD`。有效日期回傳當日規則；種子數字是該日期的 `YYYYMMDD`。缺鍵或非法日期回傳 `null`。

## `src/systems/director.js`

- `planWave(wave)`：純函式，回傳配方，不寫 state。
- `onWaveStart(state)`：`state.recipe = planWave(state.wave)`，並寫 `act`、`sector`、`mutator`、`contract`。
- `onWaveEnd(state)`：`noteMetaEvent('wave', { wave })`。
- `startRun(state)`（別名 `directorStartRun`）：清 `boss`、`bossesDefeated`、`extracted`、`overtime`、`interlude`、`mutator`、`route`、`routeHistory`、`contract`、`waveDamageTaken`，再 `onWaveStart`。
- `onBossDefeated(enemy)`：`bossesDefeated.push(kind)`；`state.boss === enemy` 時清空；`noteMetaEvent('boss', { kind, wave })`。目前不提前結束波次。

呼叫時機：`main.js` `init`、`flow.js` `beginRun` / `restart` 先 `applyLoadout` 再 `directorStartRun`；`timers-wave.js` `stepWaveClock` 在結算風暴獎勵後、`wave += 1` 前呼叫 `onWaveEnd`，之後呼叫 `onWaveStart`；`combat.js` `killEnemy` 在 `e.isBoss` 時呼叫 `onBossDefeated`。

配方欄位：`wave, act, sector, boss('titan' 於第 5、10 波), mutator:null, contract:null, spawnInterval, cap, weights{crawler,rusher,brute,artillery}, eliteChance, artilleryChance, rusherCut, bruteCut, affixMinWave, hpScale, dmgScale, bulletScale`。

`spawnEnemy` 仍用舊分支抽種類（`eliteChance` → `artilleryChance` → `rusherCut` / `bruteCut`）以保持亂數順序；`weights` 只供讀取。`bulletScale` 尚未乘入彈傷。

`sectorForWave(wave)`：只有 `wave === rt.state.wave` 且 `state.sector` 有值時採用 `state.sector`。

## `src/systems/scoring.js`

- `addScore(amount, source)`：`final = round(amount * routeMultiplier * heatMultiplier)`（P0 兩者皆 1）；`amount <= 0` 回傳 0；否則加到 `state.score` 與 `state.scoreBreakdown[source]`（未知來源新建欄位）。現有來源：`kill`、`bounty`、`storm`、`graze`、`repair`。
- `calculateCombatRank(wave, score, stats)`：與舊版相同，`flow.js` 再匯出；`hud.js`、`main.js`、`self-check.js` 仍從 `flow.js` 匯入。

## 空掛鉤

- `contracts.js`：`noteContractEvent(kind, data)`、`stepContracts(frame)`（`update.js` 在 `stepEffects` 後呼叫）。
- `mutators.js`：`stepMutators(frame)`（`update.js` 在 `stepWaveClock` 後呼叫）。
- `meta.js`：`applyLoadout(state)` 目前只設 `player.weaponMode = state.weaponId || 'standard'`；`noteMetaEvent(kind, data)`、`onRunEnd(state)` 為空。`triggerGameOver` 設 `over = true` 後呼叫一次 `onRunEnd`。
- `enemy-defense.js`：`filterEnemyDamage(e, amount, info)` 回傳 `amount`。
- `card-effects.js`：`onDash(player, { just, x, y, startX, startY })`（`dash()` 結尾）、`onEmp(player, { x, y, r })`（`triggerEmp()` 結尾）、`onPlayerDamaged(player, info)`、`onLethal(player, info)`、`onEnemyHit(enemy, { amount, source, crit, bullet, x, y })`（`damageEnemy` 內）、`onKill(enemy, info)`、`onPickup(orb, player)`（`orbs.js` 拾取成功、`splice` 前）。

| 事件 kind | data | 呼叫點 |
| --- | --- | --- |
| `kill` | `{ cause, kind, elite, isBoss }` | `killEnemy`：`onKill`、`noteContractEvent`、`noteMetaEvent` |
| `player-damaged` | `{ amount, requested, source, saved }` | `damagePlayer`：`onPlayerDamaged`、`noteContractEvent`、`noteMetaEvent` |
| `graze` | `{ x, y }` | `enemy-bullets.js`：`noteContractEvent` |
| `wave` | `{ wave }` | `onWaveEnd`：`noteMetaEvent` |
| `boss` | `{ kind, wave }` | `onBossDefeated`：`noteMetaEvent` |
| `just-dash` | `{ x, y }` | `abilities.js` `dash`：`noteMetaEvent`（尚未呼叫 `noteContractEvent`，屬 WP-E） |

## 傷害入口（`src/systems/combat.js`）

`damagePlayer(amount, source)` 回傳實際扣血量：

1. `state.over`、`invulnerable > 0` 或數值 ≤ 0 → 0。
2. 乘 `damageTakenMult`；`shield > 0` 先吸收，吸完回傳 0 且不呼叫掛鉤。
3. `phoenix` 且將致死 → HP 1、`phoenix = false`、`saved: true`，不結束。
4. 扣 HP；風暴中設 `stormHurt`；累加 `waveDamageTaken`。
5. 掛鉤與事件（見上表）；`pushFxEvent('playerHit', ...)`（`molten` 帶 `{ light: 1, source: 'molten' }`）。
6. 救下或 HP ≤ 0 時 `onLethal`；未救下且 HP ≤ 0 時 `triggerGameOver`。

無敵時間、`hurtFlash`、音效、觸覺、擊退、反應裝甲由呼叫端在回傳值 > 0 後處理。

`damageEnemy(e, amount, { source, crit, bullet, x, y })`：先 `filterEnemyDamage`，扣 `e.hp`，`stats.damageDealt` 加實際值（含溢出），再 `onEnemyHit`。不自動擊殺。

`killEnemy(enemyOrIndex, cause)`：物件用 `indexOf`，數字當索引。`cause` ∈ `'bullet' | 'dash' | 'barrel' | 'core' | 'emp' | 'spire' | 'zone' | 'other'`，缺省 `'other'`。

玩家扣血點 6 處：`enemies.js` 接觸 `contact`、`enemy-bullets.js` `bullet` / `mortar` / `molten`、`combat.js` `core` / `barrel`。

## `src/systems/flow.js`

- `extractRun()`：未結束且未撤離時設 `extracted = true` 並呼叫一次 `triggerGameOver`。尚無 EXTRACT 按鈕、結算標題未區分。
- `state.interlude` 有值時，`update` 在 hitstop 與戰鬥步驟前返回，只呼叫 `updateDomUi`。

## 玩家欄位預設

`dashCharges / dashChargesMax 1`、`dashHeat / dashHeatTimer 0`、`damageTakenMult / moveSpeedMult 1`、`empCost 50`、`empRadiusBonus 0`、`repairBonus 0`、`batteryMax 100`、`batteryRegen 2`、`phoenix false`、`shield 0`、`mastery 0`。

`dash()`：冷卻歸零且充能未滿先補 1 層再消耗；用盡才設 `dashCooldown`（Just 0.35、一般 2.2）。`stepWaveClock` 在冷卻歸零時補 1 層。`stepPlayer` 速度乘 `moveSpeedMult`。EMP 花費 `empCost`、半徑 `140 + empRadiusBonus`；回能上限 `batteryMax`、每秒 `batteryRegen`；維修量 `18 + repairBonus`。`restart()` 以 `weaponId` 還原武器。`cycleWeaponMode` 保留但無輸入綁定；暫停 BUILD 的底盤按鈕為 `disabled`。

## State 其他預設

`act 1`、`sector 'dusk'`、`recipe / mutator / route / contract / boss / interlude / daily: null`、`routeHistory / bossesDefeated / banished: []`、`extracted / overtime: false`、`overheat 0`、`rerolls / banishes 1`、`heat 0`、`rigId 'scrapper'`、`weaponId 'standard'`、`waveDamageTaken / flawlessStreak 0`。`scoreBreakdown` 十二個來源皆 0。`stats` 另有 `contractsCompleted, justDashes, partsDestroyed, flawlessWaves, barrelChainMax, fusionsUnlocked`（P0 不累加）。

Titan 生成時 `isBoss: true` 並寫入 `state.boss`。`overlay.js` 首領血條讀 `rt.state.boss`（HP > 0 才畫）。

## UI 與 DOM

`setupDom` 呼叫 `initLoadoutPanel`、`initInterludePanel`、`initCodexPanel`；`updateDomUi` 呼叫 `updateContractsHud`、`updateTips`、`updateLoadoutPanel`、`updateInterludePanel`、`updateCodexPanel`（皆為空）。DOM id：`#loadoutPanel`、`#interludePanel`、`#extractPanel`、`#contractTracker`、`#tipToast`、`#codexPanel`、`#upgradeControlRow`、`#toggleTips`、`#resetTips`（容器為 `hidden` 空節點，可由擁有者的 JS 填入內容）。波次牌格式 `ACT I · WAVE 01`。

`pushFxEvent('burst', x, y, { preset, tint, scale })`：`preset` 必須是 `fx.js` 既有 preset（缺省 `'deathSmall'`），未知 preset 不畫。

## 自檢

`selfCheck` 依序呼叫 `src/dev/checks/{build,enemies,director,meta,scoring}.js` 的 `run()`，`finally` 呼叫 `clearSeed()`。
