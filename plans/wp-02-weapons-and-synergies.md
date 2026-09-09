# DUST//REIGN 並行工單：Work Package 2 — 武器系統與流派構築（Weapons & Synergies）

**責任模組**：扇形多重射擊（Scatter）、穿透阻尼（Railgun）、反彈破片（Ricochet & Flak）、15 張三層級矩陣卡牌、三大終極連動與防衛僚機。  
**基準檔案**：`game.js`（1226 行）、`styles.css`、`index.html`。  
**對應總體計畫**：[plans/02-weapons-and-synergies.md](file:///F:/Desktop/Luna/plans/02-weapons-and-synergies.md)

---

## 1. 【防衝突合約與介面定義（Conflict-Free Contract）】

### 1.1 `state.player` 專屬欄位命名空間
```javascript
player: {
  multishot: 0,          // 額外散射彈丸數 (總發射數 N = 1 + multishot)
  spreadJitter: 0.035,   // 基礎散佈抖動弧度 (radians)
  pierce: 0,             // 穿透次數
  ricochet: 0,           // 邊界反彈次數
  shrapnelCount: 0,      // 破裂破片數
  droneCount: 0,         // 僚機架數 (0 ~ 3)
  droneFireCooldown: 0,  // 僚機射擊計時器
  droneOverclock: false, // 僚機超頻旗標
  magnetRadius: 165,     // 廢料磁吸半徑 (與 WP4 共享屬性名，天然共融)
  dashCooldownMax: 2.2,  // Dash 基礎冷卻
  overdriveBonus: 0,     // 超頻延長秒數
  flameTrail: false,     // 烈焰殘跡旗標
  fullHullEmp: false,    // 滿血 EMP 旗標
  comboTempest: false,   // 連殺暴風旗標
  upgradesOwned: new Set()
}
```

### 1.2 子彈多型標識（Bullet Polymorphism）
玩家子彈存於 `state.bullets: []`，支援 5 種彈道：
- `standard`：常規子彈
- `rail`：穿透狙擊彈（1050 px/s，10 節薄荷藍尾跡，含 `b.hits` 防重複判定）
- `missile`：自動尋標飛彈（`turnRate: 7.5 rad/s`，命中 42px AOE 爆轟）
- `shrapnel`：阻尼破片（初速 480 px/s，每幀 65% 空氣阻力衰減）
- `drone-bolt`：僚機電弧彈

### 1.3 升級矩陣解耦合約
- 替換 `UPGRADES` 陣列為 15 張三層級卡牌（Common / Rare / Synergy）。
- `renderUpgradePanel()` 遍歷卡片注入 `button.dataset.rarity = upgrade.rarity` 與 `button.dataset.upgradeIndex = index`。
- 輸入與鍵盤 `1/2/3` 監聽完全不變，維持純資料驅動。

---

## 2. 【原子任務拆解（Atomic Tasks）】

### Task 2.1：`state.player` 擴充與子彈管線重構
- **散射扇形公式**：$N = 1 + player.multishot$
  - 總開角：$\Theta = \min(0.82, 0.14 \times (N - 1))$
  - 第 $k$ 發偏移角：$\Delta\theta_k = -\frac{\Theta}{2} + \left(\frac{k}{N-1}\right)\Theta$
  - 階梯衰減傷害：$D_{\text{pellet}} = D_{\text{base}} \times (0.70 + 0.30 / N)$（貼臉 3 發全中 $240\%$ 爆發）。
- **穿透與防重複扣血（Anti-Double-Hit）**：
  - 敵人物件指派唯一 `enemy.id`。子彈具備 `b.hits = []`。
  - 碰撞時若 `b.hits.indexOf(enemy.id) !== -1` 則跳過；命中後推入 `enemy.id`，每穿透一次傷害乘 $0.80$，$b.pierce - 1$。

### Task 2.2：邊界反彈（Ricochet）與命中破片分裂（Shrapnel）
- **四壁鏡面反射**：碰觸邊界時反轉 $vx$ 或 $vy$，$b.ricochet - 1$，噴發 5 顆火花。
- **破片爆裂**：子彈銷毀時炸出 4 枚微型破片（存活 0.38s，造成 35% 傷害，每幀受空氣阻尼減速）。

### Task 2.3：15 張升級卡牌與加權隨機過濾抽卡演算法
- 15 張卡牌矩陣（Common 權重 60、Rare 權重 30、Synergy 權重 22）。
- `randomUpgradeChoices()` 演算法：未持有前置卡牌時排除相應 Synergy 卡；加權不放回抽取 3 張。
- `styles.css` 擴充 `[data-rarity="common|rare|synergy"]` 發光樣式。

### Task 2.4：三大連動與環繞防衛僚機
- **烈焰殘跡（Flame Trail）**：Dash 沿途留下 4 處燃燒節點，持續 2.2 秒，每 0.25 秒 Tick 傷害。
- **滿血超載 EMP（Full Hull Surge）**：滿血拾取 repair orb 釋放 340px EMP 震波，造成 3.5 倍傷害並強力擊退 75px。
- **連殺暴風（Combo Tempest）**：連殺 5+ 開火額外發射 2 枚微型尋標飛彈（`turnRate: 7.5 rad/s`）。
- **防衛僚機（Scrap Orbiters）**：參數化圓形軌道公轉（半徑 46px），每 1.1s 自動索敵點射，敵人貼身時觸發 25px 電弧擊退。

---

## 3. 【精確修改清單與驗證命令】

### 3.1 `game.js` 精確修改定位

| 序號 | 行號範圍 | 函式 / 區塊 | 修改操作摘要 |
| :--- | :--- | :--- | :--- |
| **M1** | `24-31` | 常數宣告 | 替換為 15 張三層級 `UPGRADES` 矩陣陣列。 |
| **M2** | `89-139` | `makeState()` | 新增 `nextEnemyId: 0`、`flameTrails: []`、`empWaves: []` 及 `player` 武器專屬欄位。 |
| **M3** | `141-148` | `randomUpgradeChoices()` | 實作加權篩選不放回抽樣（依權重 60/30/22、檢查前置與重複性）。 |
| **M4** | `406-426` | `spawnEnemy()` | 敵人物件生成時加入 `e.id = ++state.nextEnemyId`。 |
| **M5** | `450-485` | `shoot()` | 實作多重射擊扇形偏移角、階梯衰減傷害、Combo Tempest 雙聯飛彈。 |
| **M6** | `487-512` | `dash()` | 若 `p.flameTrail` 沿途推入 4 個燃燒節點。 |
| **M7** | `528-536` | `chooseUpgrade()` | 呼叫 `upgrade.apply(state)` 並記錄 `player.upgradesOwned.add(upgrade.id)`。 |
| **M8** | `538-568` | `renderUpgradePanel()` | 遍歷卡片注入 `button.dataset.rarity = upgrade.rarity`。 |
| **M9** | `655-674` | `update(dt)` 子彈迴圈 | 支援 `rail/missile/shrapnel/drone-bolt` 判定、反彈、破片、飛彈尋標。 |
| **M10**| `676-713` | `update(dt)` 掉落 | 滿血拾取 repair 觸發全屏 EMP 衝擊波。 |
| **M11**| `613-620` | `update(dt)` 僚機 | 更新僚機公轉射擊冷卻、火徑 Tick、EMP 擴散。 |
| **M12**| `1002-1028`| `draw()` 管線 | 圖層依序繪製：火徑 → 子彈 → 僚機 → EMP 光環。 |
| **M13**| `1103-1207`| `selfCheck()` | 擴展武器散射衰減、穿透防刷、加權抽卡過濾的單元斷言。 |

---

### 3.2 驗收命令

```bash
node --check game.js
```
瀏覽器控制台執行：
```javascript
window.LunaGame.selfCheck();
```
*預期輸出*：包含 `upgrades: 15`，各武器彈道與抽卡前置測試 100% 通過。
