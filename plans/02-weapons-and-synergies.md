# 計畫 02：武器系統與流派構築方案（Weapons & Synergy Builds Spec）

> **模組責任**：將原本單一的點光源子彈擴展為散射、穿透、彈跳與僚機等豐富彈道體系，重構升級池為 15 張三層級矩陣卡牌，並實現三大質變連動（Synergies）。  
> **關聯檔案**：[game.js](file:///F:/Desktop/Luna/game.js)、[index.html](file:///F:/Desktop/Luna/index.html)、[styles.css](file:///F:/Desktop/Luna/styles.css)

---

## 1. 多樣化武器與彈道機制

### 1.1 散射 / 霰彈系統（Scatter Shot / Multi-shot）

- **扇形角度公式**：發射數 $N = 1 + player.multishot$
  - 總開角：$\Theta = \min(0.82, 0.14 \times (N - 1))$（弧度）
  - 第 $k$ 發子彈偏移角：$\Delta\theta_k = -\frac{\Theta}{2} + \frac{k}{N - 1}\Theta$
- **階梯傷害衰減平衡**：
  $$D_{\text{pellet}} = D_{\text{base}} \times \left(0.70 + \frac{0.30}{N}\right)$$
  - 確保多重射擊時近戰貼臉全中爆發力驚人（$N=3$ 時總傷 $240\%$），遠距自然擴散清雜，且不至於造成失衡。

---

### 1.2 穿透 / 磁軌系統（Piercing / Railgun）

- **防重複碰撞防刷演算法（Anti-Double-Hit）**：
  - 痛點：穿透子彈以 700px/s 穿過半徑 20px 的敵人時，可能連續 3~5 幀處於重疊半徑內，導致秒殺敵人。
  - 解法：生成敵人時分配整數 `e.id = ++state.nextEnemyId`；子彈具備 `b.hits = []`。碰撞時若 `b.hits.indexOf(e.id) !== -1` 則略過，命中後記下 `e.id`。
- **穿透與衰減**：每次穿透造成傷害後，$b.damage \times 0.8$，$b.pierce - 1$。$b.pierce < 0$ 時銷毀。
- **視覺表現**：穿透彈速度提升至 1050 px/s，尾跡拉長為 10 節電氣薄荷藍（`#75d1b0`）高亮軌跡。

---

### 1.3 彈跳鋸片與分裂破片（Ricochet & Shrapnel）

- **四壁鏡面反彈**：子彈碰觸螢幕邊緣時，反轉 $vx$ 或 $vy$，$b.ricochet - 1$，並爆出 5 顆反彈火花。
- **命中破片擴散**：穿透耗盡或擊殺目標時，原地炸出 4~6 枚小破片（速度 480 px/s，帶 65% 空氣阻力衰減，存活 0.38s，造成 35% 武器傷害）。

---

### 1.4 廢料僚機系統（Scrap Drone / Orbital）

- **參數化公轉運算**（零物理模擬負載）：
  $$\phi_i = state.waveTime \times 2.4 + \left(\frac{i}{player.droneCount}\right) \times 2\pi$$
  $$x_{\text{drone}} = player.x + \cos(\phi_i) \times 46, \quad y_{\text{drone}} = player.y + \sin(\phi_i) \times 46$$
- **自瞄射擊**：每 1.1 秒自動向 240px 內最近敵人發射廢料釘。
- **貼身防禦電擊**：敵人進入僚機 16px 半徑時觸發電弧，擊退 25px 並造成 40% 武器傷害。

---

## 2. 升級卡牌 15 張矩陣體系

將現有 6 張純數值升級全面升級為 **Common（基礎強化）**、**Rare（機制質變）**、**Synergy（終極連動）** 三大層次：

```text
┌──────────────────────────────────────────────────────────────┐
│                    UPGRADE TIERS & MATRIX                    │
│                                                              │
│  [COMMON] (權重 60)                                          │
│  • OVERCHARGE (傷害 +8)       • RAPID CHAMBER (射速 +22%)    │
│  • FIELD REPAIR (血量+25回40) • SCAV RADAR (XP+30% 磁吸+45)  │
│  • ROAD RUNNER (移速 +35, Dash CD -0.35s)                    │
│                                                              │
│  [RARE] (權重 30)                                            │
│  • TRIPLE BARREL (霰彈 +2 彈丸) • RAIL SLUG (穿透 +2 彈速+220)│
│  • KINETIC RICOCHET (邊界反彈2次)• SPLITTER FLAK (碎裂4枚破片) │
│  • SCRAP ORBITER (解鎖環繞僚機) • FLUX CAPACITOR (超頻+3s移速)│
│                                                              │
│  [SYNERGY] (權重 22，需前置卡牌解鎖)                           │
│  • FLAME TRAIL (Dash 留下 2.2s 烈焰軌跡)   <-- 需 ROAD RUNNER│
│  • FULL HULL SURGE (滿血拾取釋放 EMP 衝擊) <-- 需 FIELD REPAIR│
│  • COMBO TEMPEST (5連殺發射 2 枚微型飛彈)   <-- 需 RAPID/TRIPLE│
│  • DRONE PROTOCOL (僚機增至3架，射速+50%)  <-- 需 SCRAP ORBITER│
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 三大終極連動機制（Synergies）實作

### 3.1 火焰殘跡（Flame Trail）
- **觸發**：`dash()` 執行時，沿位移起點到終點均勻生成 4 處烈焰區域：`state.groundEffects.push({ x, y, r: 32, life: 2.2, tickTimer: 0, damage: p.damage * 0.42 })`。
- **傷害判定**：每 0.25 秒對處於範圍內的敵人造成燃燒傷害並噴射橙紅火花。

### 3.2 滿血超載 EMP（Full Hull Surge）
- **觸發**：玩家處於滿血狀態拾取 `repair` orb 時觸發。
- **效果**：屏幕劇震（`shake = 14`），向外擴散 340px 氧化薄荷綠電磁光環，對半徑內所有敵人造成 $3.5 \times damage$ 傷害並強力擊退 75px。

### 3.3 連殺暴風飛彈（Combo Tempest）
- **觸發**：當連殺數 `state.combo >= 5` 且射擊時觸發。
- **效果**：從機體兩側額外射出 2 枚微型尋標飛彈（速度 420 px/s，具備 `turnRate: 7.5 rad/s` 自動轉向追擊最近敵人），命中引發 42px 範圍爆轟。

---

## 4. UI 樣式與狀態結構擴充

- **`player` 結構擴充**：
  ```javascript
  player: {
    // 既有欄位保持相容...
    multishot: 0,
    spreadJitter: 0.035,
    pierce: 0,
    ricochet: 0,
    shrapnelCount: 0,
    droneCount: 0,
    droneFireCooldown: 0,
    magnetRadius: 165,
    flameTrail: false,
    fullHullEmp: false,
    comboTempest: false,
    droneOverclock: false,
    upgradesOwned: new Set()
  }
  ```
- **升級卡片 UI 視覺**：
  在 `renderUpgradePanel()` 中新增 `data-rarity="common|rare|synergy"`。
  - `common`：終端機淡灰褐色。
  - `rare`：琥珀金邊框微光。
  - `synergy`：氧化薄荷綠脈衝高亮。

---

## 5. 驗收標準

1. 升級三選一依加權正確抽取，未持有前置卡時不會提前刷出 Synergy 卡。
2. 散射彈道角度均勻、穿透彈貫穿敵群無重複扣血。
3. 連殺達到 5 層時飛彈即時呼嘯而出；滿血拾取修復碎片能引爆全場清屏衝擊。
