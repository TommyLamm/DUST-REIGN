# 計畫 03：敵人戰術多樣化與首領戰方案（Enemy AI & Boss Encounters Spec）

> **模組責任**：打破單純「繞大圈放風箏」的單調戰術，引入遠程吐酸怪（Spitter）、自爆自走雷（Scurrier）、護盾母蟲（Warder）、敵方彈幕系統、Wave 5/10 鋼鐵巨獸（Dreadnought Boss）及波次三幕劇生成節奏。  
> **關聯檔案**：[game.js](file:///F:/Desktop/Luna/game.js)、[index.html](file:///F:/Desktop/Luna/index.html)、[styles.css](file:///F:/Desktop/Luna/styles.css)

---

## 1. 新型常規敵人行為樹與狀態機

所有敵人維持原生列舉狀態機（State-driven AI），無需引入肥大外部庫：

```text
[SPITTER 腐蝕噴吐者]
- 行為：距離 > 320px 接近；距離 < 200px 撤退；黃金距離 200~320px 橫向切向繞行。
- 射擊：冷卻就緒時停步蓄力 0.6s，拉出透明度漸增的酸綠色虛線瞄準預警（Telegraph Laser），射出酸液球。

[SCURRIER 鏽蝕自走雷]
- 行為：極高移速（135 px/s），以 S 型高頻扭動（sinusoidal wobble）衝向玩家。
- 自充能：進入 85px 半徑後停步進入 1.0s 自充能，全身紅白急促閃爍，地面投射 95px 危險紅圈。
- 殉爆反制：若玩家在 1.0s 充能期內擊殺它，觸發「殉爆」，對周圍 110px 敵人造成同等傷害而不傷及玩家。

[WARDER 織巢母蟲]
- 守護光環：每 0.1s 為身周 140px 內最多 3 名友軍建立護盾連線，減傷 50%。
- 破裂分裂：死亡時母體炸裂，朝 360 度分裂噴出 3 隻微型 Hatchling Crawler。
```

---

## 2. 輕量敵方彈幕系統（Enemy Bullets System）

- **架構**：在 `state` 物件中新增 `enemyBullets: []`。上限由生成冷卻與 Spitter 上限嚴格鎖定在 60 發以內。
- **資料結構**：
  ```javascript
  {
    x: 0, y: 0,
    vx: 0, vy: 0,
    r: 6,                 // 明顯大於玩家子彈 (r: 4)，視覺高辨識度
    damage: 18,
    life: 3.5,
    kind: 'acid',         // 'acid' | 'plasma'
    color: '#98d836',     // 螢光腐蝕綠或高對比亮紫
    trail: []             // 3 節殘影
  }
  ```
- **擦彈與 Dash 無敵幀**：
  - 檢測與玩家圓形碰撞：$(eb_x - p_x)^2 + (eb_y - p_y)^2 \le (eb_r + p_r)^2$。
  - 若 `player.invulnerable > 0`（處於 Dash 中）：子彈被虛化穿透，迸發薄荷綠擦彈火花，不扣血。
  - 若命中：玩家扣血並獲得 0.6s 受傷短暫無敵，防止被散彈瞬間秒殺。

---

## 3. 波次首領戰（Wave 5 / 10 Boss: Dreadnought 鋼鐵巨獸）

### 3.1 登場儀式感（The Breach Protocol）
- 進入 Wave 5 / 10 瞬間，雜兵停止刷新 2.5 秒。
- 畫面四周覆蓋紅色警戒斜紋濾鏡，SCAV RADIO 廣播：`[!] CRITICAL THREAT: DREADNOUGHT MK-IV DETECTED`。
- 頂部 Canvas 中央動態繪製厚重雙層裝甲血條。

### 3.2 雙階段機制（Two Phases）

```text
HP 100% ~ 50% [階段一：陣地壓制]
├─ 慢速居中旋轉巡航 (speed: 26, r: 44, HP: 1800)
├─ 招式 1：螺旋環形彈幕（Spiral Nova）：每 3.2s 朝四周發射 12 向慢速電漿彈
└─ 招式 2：空投莢艙（Drop Pod）：每 7s 拋射 2 個落點標記，生成雜兵騷擾

HP < 50% [階段二：暴怒超載]
├─ 狂暴演出：排氣管噴發黑煙與高溫火星，移速提升至 52
├─ 招式 3：直線紅毯預警衝撞（Hyper-Ram Charge）：
│   ├─ 1.3s 預警：地面鋪設長 800px、寬 90px 的紅色半透明危險投影區
│   ├─ 0.6s 衝刺：以 480 px/s 極速突進，命中造成 45 點重創
│   └─ 撞牆硬直：撞擊邊界後進入 1.8s 過熱虛弱狀態（防禦力降低 25%）
└─ 招式 4：地震踐踏脈衝（Seismic Stomp）：近身時釋放 180px 擊退震波
```

### 3.3 擊敗獎勵
- 掉落特殊八角形金色核心（Omega Core）：獲得 **12 秒 OMEGA OVERDRIVE**（射速翻倍、子彈穿透 +1）。
- 掉落 3 枚 Repair Scrap（各回復 18 HP）。
- 獎勵 `+3,500 SCORE`，大量 Scrap 廢料直接升級。

---

## 4. 波次「三幕劇」節奏控制（3-Act Wave Pacing）

每波 30 秒（`WAVE_LENGTH`）細分為三個戰術節奏階段：

| 幕次 | 時間區間 | 戰場情境 | 生成構成 | 戰術目的 |
| :--- | :--- | :--- | :--- | :--- |
| **第一幕：試探鋪墊** | 0s ~ 9s | 零星敵潮湧現 | 80% Crawler, 20% Rusher | 拾取前波戰利品、疊加 Chain Combo |
| **第二幕：戰術推進** | 9s ~ 21s | 菁英與遠程協同 | 固定編隊刷新：1 Brute/Warder + 2 Spitter | 迫使切換集火目標，打破放風箏 |
| **第三幕：極限狂潮** | 21s ~ 30s | 爆發突破衝刺 | 大量 Rusher + Scurrier 自爆怪 | 衝刺完成 Wave Bounty，高壓高潮體驗 |

---

## 5. 驗收標準

1. Spitter 在射擊前有清楚可讀的 0.6 秒蓄力虛線，玩家可側向 Dash 躲開酸液球。
2. 自爆怪靠近玩家時能成功引爆或在充能期被擊斃觸發殉爆。
3. Wave 5 準時觸發巨獸登場廣播、雙階段轉場血條與衝撞紅毯預警。
