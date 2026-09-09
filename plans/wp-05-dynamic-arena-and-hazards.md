# DUST//REIGN 並行工單：Work Package 5 — 動態戰場環境與可破壞物（Dynamic Arena & Hazards）

**責任模組**：可引爆廢料桶、10 秒酸性輻射廢墟、沙暴天氣與風力物理推移、Canvas 視野暗角迷霧圖層。  
**基準檔案**：`game.js`、`index.html`、`styles.css`。  
**對應總體計畫**：[plans/05-dynamic-arena-and-hazards.md](file:///F:/Desktop/Luna/plans/05-dynamic-arena-and-hazards.md)

---

## 1. 【防衝突合約與介面定義（Conflict-Free Contract）】

### 1.1 專屬環境狀態容器（Zero Scope Contamination）
- **獨立集合**：在 `makeState` 建立 `state.barrels = []`、`state.hazardZones = []`、`state.weather = { ... }`、`state.sandParticles = []`。
- 嚴禁將油桶或酸霧放入 `state.enemies`，保證不污染怪物數量上限、Bounty 擊殺計數與自瞄判定。

### 1.2 子彈命中油桶插槽（Bullet Collision Slot）
- 在子彈更新迴圈中，先檢測 `state.barrels`，再檢測 `state.enemies`。
- 支援 WP2 的 `b.hits` 防重複判定與 `b.pierce` 穿透扣減，保證穿透子彈不重複引爆同一油桶。
- 在 `dash()` 中獨立檢測脈衝引燃油桶，不干擾敵人物理擊退。

### 1.3 HUD 協商與非阻塞更新
- 天氣系統活躍時，強制頂部 `#commsStatus` 顯示 `JAMMED`。
- 平息時平滑交還給 WP1 的靜音狀態（`OPEN` / `MUTED`）。
- 頂部 `#windStatus` 與底部 `#feedText` 透過既有節點安全更新，無阻塞。

---

## 2. 【原子任務拆解（Atomic Tasks）】

### Task 5.1：廢料爆炸桶實體（Scrap Explosive Barrel）
- **實體規格**：半徑 16px，深鏽紅桶身帶黃黑斑馬紋。每波保持場上 3~5 個。
- **0.2s 延遲急閃引信**：受擊後觸發 `igniteBarrel(bar)`，0.2 秒內高頻抖動（振幅 4px）且急促紅白閃爍。
- **120px 巨額爆炸與自傷防護**：
  - 倒數結束引爆：對 120px 內敵人造成 95 點巨額殺傷。
  - 對範圍內玩家造成 25 點自傷，並**立即賦予 0.8s 受傷無敵幀**，徹底防止連鎖油桶重疊秒殺玩家。
  - 連鎖引爆：120px 內的相鄰油桶立即被引燃（0.08s 快速引信），形成骨牌式連鎖大爆炸！

### Task 5.2：精英/重裝怪物死亡留下 10 秒輻射廢墟（Rad Cloud）
- **生成**：Brute 或 Elite 死亡時有 40% 機率在原位留下持續 10 秒的酸性毒霧（半徑 72px）。
- **雙向減速與腐蝕**：
  - 敵我雙方踏入皆減速 48%（`slowFactor: 0.52`）。
  - 敵人每秒受到 12 點腐蝕扣血，可用作引怪減速陷阱；玩家每秒受到 6 點腐蝕輕傷。

### Task 5.3：沙暴天氣系統（Dynamic Dust Storm）
- **觸發**：Wave 2 起每波有 35% 機率觸發 15 秒沙暴。
- **風力物理推移（Wind Drift）**：
  - 機體受風阻微推移；戰場未拾取的 Scrap/Repair 碎塊隨風朝右下方飄滾。
  - 頂部 `#windStatus` 變更為 `SE 54 GALE`（紅字閃爍）。

### Task 5.4：Canvas 沙暴暗角光圈與狂風沙粒劃痕
- **圖層插槽**：於實體上方、HUD 下方繪製 `drawWeatherOverlay(ctx)`。
- **視野光圈**：全場覆蓋沙暴暗角迷霧，以機體為中心保留 220px（Vanguard 斥候為 320px）清晰光圈。
- **沙紋劃痕**：固定 25 條沙紋粒子高速掠過螢幕，單次批量繪製，CPU 開銷 $< 0.1\text{ms}$。

---

## 3. 【精確修改清單與驗證命令】

### 3.1 檔案與行號精確定位

| 檔案 | 位置 | 修改性質 | 摘要 |
| :--- | :--- | :--- | :--- |
| `styles.css` | 240~275 行附近 | 樣式擴充 | 新增 `.signal-readout strong.status-alert` 警報紅光動畫。 |
| `game.js` | 23~32 行 | 常數定義 | 新增 `BARREL_RADIUS = 16`, `BARREL_BLAST_RADIUS = 120`, `BARREL_DAMAGE = 95` 等。 |
| `game.js` | 89~138 行 | `makeState` | 初始化 `state.barrels`, `state.hazardZones`, `state.weather`。 |
| `game.js` | 220~280 行 | `setupDom` | 快取 `ui.windStatus`, `ui.commsStatus`, `ui.feedText`。 |
| `game.js` | 387~404 行 | `restart` | 補足 3 個初始廢料桶。 |
| `game.js` | 487~512 行 | `dash` | 插入 Dash 脈衝點燃周圍油桶插槽。 |
| `game.js` | 570~599 行 | `killEnemy` | Brute/Elite 陣亡 40% 機率留下輻射廢墟。 |
| `game.js` | 606~654 行 | `update` 開頭 | 更新沙暴強度過渡與風力物理推移。 |
| `game.js` | 655~674 行 | `update` 子彈 | 插入子彈命中油桶邏輯（支援穿透扣減與防刷）。 |
| `game.js` | 715~750 行 | `update` 結尾 | 更新油桶延遲引信爆炸與輻射區減速腐蝕。 |
| `game.js` | 992~1028 行 | `draw` 管線 | 插入 `drawHazardZones`, `drawExplosiveBarrels`, `drawWeatherOverlay`。 |
| `game.js` | 1103~1207 行 | `selfCheck` | 擴展油桶連鎖爆炸、輻射雙向減速、沙暴強度插值的單元斷言。 |

---

### 3.2 驗收命令

```bash
node --check game.js
```
瀏覽器控制台執行：
```javascript
window.LunaGame.selfCheck();
```
*預期輸出*：包含 `arena: "barrels + hazard zones + dust storm verified"`，各項邏輯自檢 100% 通過。
