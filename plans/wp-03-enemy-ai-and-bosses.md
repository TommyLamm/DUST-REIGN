# DUST//REIGN 並行工單：Work Package 3 — 敵人戰術與首領戰（Enemy AI & Bosses）

**責任領域**：敵方彈幕系統（Enemy Bullets）、新型戰術敵怪（Spitter, Scurrier, Warder）、Wave 5/10 Dreadnought 巨獸首領戰、波次三幕劇編隊導演（Wave Director）。  
**基準檔案**：`game.js` (1226 行)、`index.html`、`styles.css`。  
**對應總體計畫**：[plans/03-enemy-ai-and-bosses.md](file:///F:/Desktop/Luna/plans/03-enemy-ai-and-bosses.md)

---

## 1. 【防衝突合約與介面定義（Conflict-Free Contract）】

### 1.1 獨立彈幕與首領容器
- **`state.enemyBullets: []`**：專門存儲敵方投射物（上限 60 發）。與玩家子彈迴圈完全獨立，互不干擾。
- **`state.boss: null`**：首領存活指針，同時首領推入 `state.enemies`，使玩家子彈自然命中。

### 1.2 敵人生命週期 100% 解耦合約
- 新敵型定義 `scoreValue`, `scrapValue`, `onDeath` 屬性。
- 在 `killEnemy(index)` 中通用結算：`state.kills += 1`、`bountyKills += 1`，不破壞既有任務與連殺統計。

### 1.3 渲染圖層專屬插槽
- 地面預警投影：`drawTelegraphs(ctx)`（Scurrier 紅圈、Spitter 瞄準虛線、Boss 衝撞紅毯）。
- 敵方彈幕繪製：`drawEnemyBullets(ctx)`。
- 首領雙層裝甲血條：`drawBossBar(ctx)`。

---

## 2. 【原子任務拆解（Atomic Tasks）】

### Task 3.1：敵方子彈數據結構、更新循環、擦彈與 Dash 無敵幀碰撞檢測
- **子彈規格**：`r: 6`, `damage: 18`, `life: 3.5s`, `color: '#98d836'`。
- **Dash 擦彈（Graze）判定**：
  - 若 `player.invulnerable > 0`：子彈消解，爆發薄荷綠火花，獎勵 `state.score += 5`，不扣血。
  - 若無敵幀已過：扣除生命並賦予 0.6s 受傷短暫無敵，防止被散彈同幀秒殺。

### Task 3.2：Spitter 遠程風箏狀態機與瞄準虛線預警
- **數值**：HP `55 + wave * 8`, 移速 65, 螢光腐蝕綠。
- **狀態機**：
  - 距離 > 320px 逼近；距離 < 190px 撤退；190~320px 橫向切向繞行。
  - 冷卻完成時停步蓄力 0.6s，拉出長度 450px 的酸綠色瞄準虛線（Telegraph Laser），隨後射出酸液彈。

### Task 3.3：Scurrier 自爆怪狀態機、自充能危險紅圈與擊殺殉爆機制
- **數值**：HP 28（極脆弱），移速 135（極高速）。
- **S型蛇行衝刺**：追擊時疊加正弦波擺動，防止直線被輕易點殺。
- **自充能與殉爆**：靠近玩家 85px 停步進入 1.0s 自充能，地面投射 95px 急促紅白閃爍危險圈。充能結束自爆造成 38 點傷害；若充能期被擊斃，觸發「殉爆」，對周圍 110px 敵群造成 65 點爆炸傷害而不傷及玩家。

### Task 3.4：Wave 5/10 Dreadnought 巨獸首領雙階段機制與掉落
- **登場儀式**：全場雜兵暫停刷新 2.5 秒，紅紋警戒濾鏡，SCAV RADIO 播報 `CRITICAL THREAT`。
- **階段一（HP 100%~50%）**：慢速盤旋，每 3.2s 發射 12 向螺旋環形彈幕，每 7s 空投雜兵莢艙。
- **階段二（HP < 50%）**：超載暴怒（移速 52），直線紅毯蓄力預警（1.3s），480 px/s 極速突進衝撞。撞牆後陷入 1.8s 過熱硬直破綻（受傷增加 25%）。
- **首領血條 HUD**：頂部中央繪製雙層裝甲血條。
- **擊敗掉落**：金色八角核心（12 秒 OMEGA OVERDRIVE）+ 3 枚 Repair Scrap + 8 大額 Scrap + 3500 分。

### Task 3.5：波次三幕劇編隊生成導演
- **第一幕（0~9s）**：80% Crawler, 20% Rusher 暖機。
- **第二幕（9~21s）**：每 3.8s 空投戰術編隊（1 Brute/Warder + 2 Spitter）。Warder 為身周友軍提供 50% 護盾連線，死後分裂 3 隻幼蟲。
- **第三幕（21~30s）**：狂潮突破（45% Rusher + 40% Scurrier 自爆怪）。

---

## 3. 【精確修改清單與驗證命令】

### 3.1 程式碼位置與修改對照表（`game.js`）

| 序號 | 行號範圍 | 修改具體細節 |
| :--- | :--- | :--- |
| 1 | `L11-24` | 常數區新增 `MAX_ENEMY_BULLETS = 60`, `OMEGA_OVERDRIVE_DURATION = 12`。 |
| 2 | `L89-139` | `makeState()` 新增 `enemyBullets: []`, `boss: null`, `bossWarning: 0`。 |
| 3 | `L406-427` | `spawnEnemy(forcedKind, customX, customY)` 支援指定兵種與專屬 AI 欄位。 |
| 4 | `L654 旁` | 新增 `updateEnemyBullets(dt)` 獨立更新與擦彈判定。 |
| 5 | `L715 內` | 新增 `updateEnemyAI(dt)` 狀態機分流。 |
| 6 | `L570-599` | `killEnemy(index)` 加入 Scurrier 殉爆、Warder 分裂、Boss 掉落。 |
| 7 | `L691-712` | 拾取擴充支援 `omega_core` 觸發 12s OMEGA OVERDRIVE。 |
| 8 | `L818 旁` | 新增 `drawTelegraphs(ctx)` 繪製 Spitter 虛線、Scurrier 紅圈、Boss 紅毯。 |
| 9 | `L953 旁` | 新增 `drawBossBar(ctx)` 首領專屬血條。 |
| 10 | `L992-1028`| `draw()` 圖層插槽接入。 |
| 11 | `L1103-1207`| `selfCheck()` 擴充敵方彈幕擦彈、Scurrier 殉爆、Boss 掉落斷言。 |

---

### 3.2 驗收命令

```bash
node --check game.js
```
瀏覽器控制台執行：
```javascript
window.LunaGame.selfCheck();
```
*預期輸出*：`{ ok: true, enemyBullets: "60 max pooled & graze-ready", boss: "Wave 5/10 Dreadnought Mk-IV", waveDirector: "3-Act squad-pacing director", ... }`。
