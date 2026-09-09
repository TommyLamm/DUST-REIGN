# 計畫 05：動態戰場環境與可破壞物方案（Dynamic Arena & Hazards Spec）

> **模組責任**：打破扁平無互動的靜態背景，在戰場上動態分佈可引爆廢料桶、高危輻射區，並將頂部 HUD 的 `WIND` 與 `FEED` 激活為具備物理推移與視野迷霧的沙暴天氣系統。  
> **關聯檔案**：[game.js](file:///F:/Desktop/Luna/game.js)、[index.html](file:///F:/Desktop/Luna/index.html)、[styles.css](file:///F:/Desktop/Luna/styles.css)

---

## 1. 可互動戰場物件（Interactive Obstacles）

### 1.1 廢料爆炸桶（Scrap Explosive Barrel）

- **實體規格**：半徑 16px，深鏽紅色桶身帶黃黑工業斑馬紋。
- **點燃與延遲引爆**：
  - 受到玩家子彈、敵人子彈或 Dash 脈衝傷害時，觸發 0.2 秒延遲引信。
  - 延遲期間桶身劇烈抖動（振幅 4px），急促紅白閃爍，給予玩家反應逃離的時間。
- **全屏衝擊波**：
  - 爆炸半徑 120px，造成 95 點巨額爆炸傷害（可秒殺一般怪群）。
  - 對自身半徑內的玩家造成 25 點自傷並觸發受傷無敵幀（懲罰過近站位，但鼓勵引怪）。
  - 引爆範圍內的其它爆炸桶，觸發**骨牌式連鎖大爆炸**！
  - 產生全屏震動（`shake = 16`）與 24 顆橙黃爆炸火花。

---

### 1.2 輻射廢墟（Hazard Zone / Rad Cloud）

- **生成機制**：重型 Brute 或精英 Elite 死亡時，有 40% 機率在原地留下一灘持續 10 秒的酸性輻射毒霧（半徑 72px）。
- **戰術利用**：
  - 敵我雙方踏入輻射區皆會被減速 48%（`slowFactor: 0.52`）。
  - 敵人每秒承受 12 點腐蝕傷害；玩家每秒承受 6 點輕微腐蝕。
  - 玩家可引誘大批迅猛的 Rusher 穿過輻射區，形成天然的減速泥沼陷阱。

---

## 2. 動態沙暴天氣系統（Dynamic Dust Storm）

將靜態 HTML 節點 `<strong id="windStatus">NW 18</strong>` 與 `<span id="feedText">...</span>` 全面激活為具有物理影響的動態事件：

```text
┌─────────────────────────────────────────────────────────────┐
│                       DYNAMIC ARENA                         │
│                                                             │
│       [RAD HAZARD ZONE]                                     │
│     (腐蝕減速 / 綠煙脈動)                                     │
│            ♨ ♨ ♨                                            │
│                                                             │
│                                 [EXPLOSIVE BARREL]          │
│                                    (受擊延遲0.2s)            │
│   === WIND VECTOR ===>             💥 120px 範圍連鎖         │
│   [NW 36 kts 沙塵飄移]                                      │
│                                           Enemy Group       │
│              Player                         👾 👾           │
│                🚀 ---> (Shoot Barrel!)                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 天氣狀態機與波次演進
- 第 2 波起，每波有 35% 機率進入持續 15 秒的「RED GALE / 3 級沙暴」。
- **HUD 聯動**：
  - 頂部 `#windStatus` 切換為 `SE 54 GALE` 並紅光閃爍。
  - 頂部 `#commsStatus` 顯示 `JAMMED`。
  - 底部 `#feedText` 滾動：`ALERT: SEVERE DUST STORM DETECTED // VISIBILITY REDUCED TO 25%`。
  - 寫入 SCAV RADIO：`[!] ENVIRONMENT: CAT-3 RED DUST STORM BREACH`。

### 2.2 物理推移與能見度光圈（Wind Drift & Fog of War）
- **風力向量偏移**：
  - 玩家受到微弱風力阻力，逆風微減速、順風加速。
  - 戰場掉落的 Orb（Scrap、Repair、Overdrive）受強風吹拂飄移，增加拾取預判趣味。
- **能見度光圈（Radial Fog）**：
  - 戰場四角被昏暗的紅棕色沙暴迷霧籠罩。
  - 玩家身周保留 220px（Vanguard 斥候機體為 320px）的圓形清晰視野光圈，伴隨 25 條高速掠過的狂風沙粒劃痕。

---

## 3. Canvas 繪製管線（Draw Pipeline）

嚴格保持圖層先後次序，維持 60 FPS 滿幀：

```text
1. drawBackground()       -> 網格底板 + 隨風滾動的碎石
2. drawHazardZones()      -> 輻射酸霧脈動半透明光環
3. drawExplosiveBarrels() -> 廢料桶（黃黑斑馬紋、受擊閃白）
4. drawOrbs()             -> 隨風微漂移的 Scrap / Repair
5. drawBullets()          -> 子彈光束與殘影
6. drawEnemies()          -> 敵群
7. drawParticles()        -> 火花與爆炸粒子
8. drawPlayer()           -> 玩家機體
9. drawWeatherOverlay()   -> 沙暴暗角遮罩 + 狂風沙粒飛線
10. drawHud()             -> Canvas HUD、連殺條與文字
```

---

## 4. 驗收標準

1. 子彈擊中油桶觸發 0.2 秒急閃後爆發大範圍殺傷，可連鎖引爆相鄰油桶。
2. 踏入輻射區有清晰的減速感與酸液粒子。
3. 沙暴降臨時，頂部 WIND 數值跳動，畫面暗角收窄為以機體為中心的光圈，且無幀率驟降。
