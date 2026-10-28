# 《DUST//REIGN》大世界戰鬥節奏、怪潮生成與動態壓迫感總監策劃案
**Combat Pacing, Spawning & Aggro Flow Design Specification**

---

## 一、 核心設計綱領與大世界變革挑戰 (Design Manifesto & Big-World Transition)

在《DUST//REIGN》由單屏固定戰場（$960 \times 640$）擴張至 3~4 倍大世界開放地圖（例：$3200 \times 2400$），且相機平滑鎖定玩家為中心後，戰鬥體驗面臨**根本性的空間維度顛覆**。

### 1. 舊版單屏模型在擴張地圖下的四大崩潰現象（Critical Failure Modes）

```text
[舊版單屏模型]                             [大世界擴張後的崩潰]
+-------------------------------+         +-----------------------------------------------+
| 固定地圖邊緣刷新 (margin 42px) |   ==>   | 玩家處於地圖中央，怪在地圖 3000px 外邊緣刷新  |
| 怪物全速直衝螢幕中心           |         | 怪物需跑 15~20 秒才進入視野 -> "地圖極度空曠" |
| 敵人被地圖邊界反彈自然聚攏     |         | 玩家往單一方向風箏拉扯 -> "一字長蛇陣" 毫無壓力 |
| 首領撞擊固定螢幕邊界暈眩       |         | 首領衝撞找不到邊界 -> 撞到無限遠處消失/無硬直 |
+-------------------------------+         +-----------------------------------------------+
```

1. **空間稀釋與空洞感（Spatial Dilution & Desolation）**：若維持固定世界邊界生成，玩家在地圖中央將面臨長達 10~15 秒的無怪真空期；若盲目提高怪物總量填滿大地圖，同屏/全圖實體破數百，Canvas 2D 與碰撞檢測將直接卡死。
2. **一字長蛇陣風箏（Conga Line Kiting Anti-Pattern）**：若怪物僅使用純向心追蹤（$\vec{v} \propto \vec{P} - \vec{E}$），在大世界無限後退空間下，怪物將被拉成單列直線，玩家只需倒退射擊，割草包夾的壓迫感徹底喪失。
3. **視野穿幫與突臉死（Frustum Pop-in & Cheap Death）**：若隨機在大世界玩家附近刷新，怪物常直接空降於視野邊緣甚至視野內，引發玩家「被突臉暴斃」的極度挫折感。
4. **首領機制失效（Boss Boundary Breakdown）**：Dreadnought 的核心破綻來自「撞牆硬直（Wall-bash stun）」；Sovereign 的風暴塔與安全區依賴邊界約束。無邊界或超大邊界會直接癱瘓首領戰鬥邏輯。

### 2. 解決方案四大核心支柱（The 4 Core Pillars）

1. **環形視口邊界生成架構（Perimeter Spawn Ring Architecture - PSRA）**：視口（Camera Viewport）即移動戰場。生成點始終依附於相機視野外緣的動態雙環，且根據玩家位移向量進行「預判攔截分佈」。
2. **動態狼群與扇形包夾 AI（Swarm Flocking & Multi-Role Pincer Dynamics）**：利用 55px Spatial Hash Grid 實現 0-GC 局部排斥分離（Separation），各兵種分配「阻截鉗角（Pincer Flank）」、「遠程架炮（Siege Ring）」與「正面鐵壁（Brute Shield）」，杜絕長蛇陣。
3. **首領大世界場景重塑（Mobile Epicenter & Crag Collapse Arena）**：Titan 轉型為「大世界履帶要塞與地震牽引」、Dreadnought 伴隨「軌道空投離子沉箱巨石（撞碎暈眩）」、Sovereign 演變為「隨主體動態位移的風暴之眼（Mobile Eye of the Storm）」。
4. **同屏密度守恆與機動性補償（Density Conservation & Mobility Compensation）**：嚴格鎖定**活躍戰鬥池 50~75 隻**，動態代償怪物奔跑移速與衝刺前搖，保障 60 FPS 絲滑割草體驗與極致壓迫感。

---

## 二、 環形視口邊界生成模型 (Perimeter Spawn Ring Architecture)

```
                              [ 外環 R_outer > 1.8x Viewport ]
                              超遠端回收 / 疾行追趕 (Catchup)
                     -------------------------------------------------
                    /                                                 \
                   /     [ 中環 R_mid : 1.1x ~ 1.4x Viewport ]         \
                  /      動態生成活躍帶 (Active Spawn Ring)              \
                 /      ---------------------------------------         \
                /      /                                       \         \
               |      |      [ 內環 R_inner: Viewport + 40px ]  |         |
               |      |      ★ 嚴格禁刷區 (Frustum Safe Zone)  |         |
               |      |                                         |         |
               |      |               ( 玩家 P )                |         |
               |      |                    \---> 速度向量 V_p    |         |
               |      |                      (60% 預判攔截帶)   |         |
               |      |                                         |         |
                \      \                                       /         /
                 \      ---------------------------------------         /
                  \                                                    /
                   \                                                  /
                     -------------------------------------------------
```

### 1. 幾何三環拓撲分區（Tri-Ring Viewport Topology）

令玩家相機中心為 $(C_x, C_y)$，視口可視寬高為 $W_{vp}, H_{vp}$（基準 $960 \times 640$，視螢幕適配）。定義長短半軸 $a = W_{vp} / 2, b = H_{vp} / 2$：

| 分區層級 | 範圍定義（相對於相機中心） | 系統職責與約束 | 物理半徑 / 距離閾值 (px) |
| :--- | :--- | :--- | :--- |
| **Zone 0: 內環<br>(視野安全禁刷區)** | $\left(\frac{x - C_x}{a + 40}\right)^2 + \left(\frac{y - C_y}{b + 40}\right)^2 < 1$ | **絕對禁止任何實體空降生成**。<br>杜絕轉頭即死、子彈突臉與可見邊緣突兀刷怪。 | 距視野邊界內側至外側 $0 \sim 40\text{px}$ 絕對遮蔽 |
| **Zone 1: 中環<br>(生成活躍帶)** | $1.15 \times \text{Viewport} \le R_{mid} \le 1.42 \times \text{Viewport}$ | **主要怪潮生成帶**。<br>怪物於視口邊緣外 $80 \sim 160\text{px}$ 生成，並立即獲得初速突入視野。 | 距相機中心徑向 $620 \sim 780\text{px}$ (動態橢圓) |
| **Zone 2: 緩衝環<br>(戰術活動帶)** | $1.42 \times \text{Viewport} < R_{buff} \le 1.80 \times \text{Viewport}$ | 怪物正常執行 AI 導航與戰術包夾。<br>Spitter/Artillery 尋找外圍射擊陣位。 | 距相機中心徑向 $780 \sim 1150\text{px}$ |
| **Zone 3: 外環<br>(休眠回收防丟失帶)** | $R_{outer} > 1.80 \times \text{Viewport}$ | **超出戰鬥聚焦圈**。<br>觸發「無感瞬時回收」或「超載過載追擊（Catch-up）」。 | 距相機中心徑向 $> 1150\text{px}$ |

### 2. 運動向量預測投射演算法 (Predictive Interception Spawn)

傳統向心刷新會導致玩家向前狂奔時「前方無怪、身後拉成火車」。本系統採用**玩家速度向量偏置演算法（Velocity-Biased Sector Allocation）**：

1. **採樣玩家瞬時與加權平滑速度**：$\vec{V}_p = (v_x, v_y)$，速率 $S_p = |\vec{V}_p|$，航向角 $\theta_p = \text{atan2}(v_y, v_x)$。
2. **三向扇區權重分配**：
   - **迎面阻截扇區（Frontal Intercept Arc）**：$\theta \in [\theta_p - 45^\circ, \theta_p + 45^\circ]$，分配 **$55\% \sim 65\%$** 的生成權重。生成怪物直接擋在玩家逃跑路徑前方，形成正面圍堵牆！
   - **兩側合圍扇區（Flanking Pincer Arcs）**：$\theta \in [\theta_p \pm 45^\circ, \theta_p \pm 110^\circ]$，分配 **$25\% \sim 30\%$** 的生成權重。配置 Rusher 與 Scurrier 準備夾擊。
   - **後方壓迫扇區（Rear Pursuit Arc）**：剩餘後方角度，分配 **$10\% \sim 15\%$** 的權重。維持背後騷擾，防止玩家完全無腦向後滑行。
3. **靜止/低速狀態回退（Idle Fallback）**：若 $S_p < 30\text{px/s}$，自動平滑回退為 $360^\circ$ 全向等機率均勻環形分佈（Uniform Ring）。

### 3. 大地圖世界邊界裁剪與切線折射 (Boundary Clamping & Tangent Folding)

當玩家接近世界邊界（如地圖邊界 $W_{world} \times H_{world}$，例如 $3200 \times 2400$）時，生成環可能切出大地圖外部：

```javascript
// 生成點世界座標計算與邊界折射虛擬碼
function sampleRingSpawnPoint(player, camera, worldW, worldH) {
  var angle = sampleBiasedAngle(player.vx, player.vy);
  // 中環橢圓半徑
  var radX = (camera.w * 0.5) * (1.18 + rng('spawn') * 0.22);
  var radY = (camera.h * 0.5) * (1.18 + rng('spawn') * 0.22);
  var rawX = camera.x + Math.cos(angle) * radX;
  var rawY = camera.y + Math.sin(angle) * radY;
  
  var margin = 32;
  // 若超出地圖邊界，沿著地圖邊緣切線折射投影 (Tangent Sliding)
  var clampedX = Math.max(margin, Math.min(worldW - margin, rawX));
  var clampedY = Math.max(margin, Math.min(worldH - margin, rawY));
  
  // 若投影點落入玩家視口內 (角落地形壓縮)，則沿邊界向兩側反向推至視野外 60px
  if (isInViewport(clampedX, clampedY, camera, 40)) {
    return slideAlongBorderOutsideView(clampedX, clampedY, camera, worldW, worldH);
  }
  return { x: clampedX, y: clampedY };
}
```

### 4. 超遠端怪物生命週期與調度機制 (Recycle & Hyper-Aggro Catchup System)

防止大世界遺落怪獸佔用總配額，分為兩套調度機制：

1. **普通雜兵（Crawler / Rusher / Scurrier）— 瞬時無感回收（Silent Despawn & Token Refund）**：
   - 判定條件：怪物處於 $R_{outer} > 1.85 \times \text{Viewport}$ 且持續時間 $t_{cull} > 3.0\text{s}$。
   - 處置動作：直接將該怪物從實體陣列 `rt.state.enemies` 透過 `fastUnorderedRemove` 移除（**不計玩家擊殺、不給經驗、不掉落**）。
   - **生成額度無損補償**：被回收的怪轉化為 `rt.state.recycledTokens += 1`，立即在下一幀於前方 $R_{mid}$ 重新刷出，保證玩家前進時「戰鬥怪潮永遠充沛」！
2. **高威脅/菁英怪（Elite / Warden / Titan 部件）— 地底疾行追擊（Burrow Glide Hyper-Catchup）**：
   - 菁英怪絕不輕易銷毀回收！
   - 當距離玩家 $> 1.85 \times \text{Viewport}$ 超過 2.5 秒時，菁英怪獲得 `e.hyperCatchup = true`：
     - 移動速度提升至 **$2.2 \times \text{BaseSpeed}$**（不與遠距 $1.35\times$ 同時疊加）。
     - 暫時關閉與普通怪物的阻擋碰撞，以流線型沙塵殘影（Burrowing Trail）高速縮短距離。
     - 一旦重新進入 $R_{mid}$（視野邊緣外 100px），解除追趕模式，恢復正常速度與戰術姿態。

---

## 三、 怪潮集結與包夾 AI 動力學 (Swarm Flocking & Multi-Role Pincer Tactics)

```
                              [ Pincer Flank 左翼切線包抄 ]
                                    Rusher 隊列
                                   /
                                  /  (目標：玩家預測點左側 120px)
                                 v
        [ 正面鐵壁衝擊 Frontal ]  ===> ( 玩家 P ) <===  [ Pincer Flank 右翼包抄 ]
         Brute 帶領 Crawler 浪潮       |                Rusher 隊列
                                       |
                                       v
                             [ 後方地陷阻斷 Burrower ]
```

### 1. 0-GC 輕量分群動力學 (Boids-lite Spatial Hash Grid Flocking)

在 `src/core/spatial-grid.js`（55px 單元格）的廣域碰撞基礎上，為敵人加入極簡、0-GC 的每幀排斥向量，徹底消滅怪物同軸重疊：

$$\vec{F}_{sep} = \sum_{j \in \text{Neighbors}, j \ne i} \frac{\vec{r}_i - \vec{r}_j}{\max(|\vec{r}_i - \vec{r}_j|^2, 16)} \cdot K_{repulsion}$$

- $K_{repulsion} = 420$（排斥常數）。
- 檢索半徑限制在 $d \le 38\text{px}$（僅查詢當前單元格與相鄰單元格，單隻計算平均耗時 $< 0.002\text{ms}$）。
- 效果：怪物群在移動時會自然散開形成寬達數百像素的「包夾正面」，而非排成一條細線。

### 2. 全兵種立體化戰術角色定位矩陣 (Tactical Multi-Role Envelope)

| 敵型代號 | 戰術角色 | 尋路目標向量計算公式 $\vec{T}_{target}$ | 行為動態特徵與壓迫感製造 |
| :--- | :--- | :--- | :--- |
| **Crawler** (爬行者) | **陣線填塞與消耗肉盾**<br>(Swarm Anchor) | $\vec{T} = \vec{P} + \vec{R}_{jitter}(20\text{px})$ | 正面直撲，受排斥力自然鋪開，形成基礎包圍面。 |
| **Brute** (蠻牛裝甲) | **正面破陣與動量衝撞**<br>(Frontal Line Breaker) | $\vec{T} = \vec{P}$ | 直奔玩家當前座標。免疫輕型擊退，作為移動掩體吸收子彈，逼迫玩家走位。 |
| **Rusher** (疾行突刺者) | **側翼雙鉗阻截**<br>(Pincer Flank Cut-Off) | $\vec{T} = \vec{P} + \vec{V}_p \cdot 0.8\text{s} + \text{Sign} \cdot \vec{V}_p^\perp \cdot 130\text{px}$ | 生成時分配極性 $\text{Sign} \in \{+1, -1\}$（左翼/右翼）。繞行至玩家斜後方，CD 結束時呈 $90^\circ$ 橫向突刺，切斷滑行退路！ |
| **Scurrier** (自爆跳蚤) | **扇形突擊與連鎖破防**<br>(Swarm Cluster Bomb) | $\vec{T} = \vec{P} + \text{FanOffset}(\text{index}, 45^\circ)$ | 2 隻一組（權重一抽扣 2 個生成時槽）。呈扇形撲擊，在距玩家 75px 處急停自爆。 |
| **Spitter** (酸液噴射者) | **視口邊緣火力壓制**<br>(Perimeter Siege Artillery) | 保持距離 $d \in [240, 320\text{px}]$；若太近以 $0.85\times$ 倒退 | 絕不深入內環。於螢幕邊緣架炮，向玩家逃生路徑投擲大範圍酸池（減速 25% + 傷害），封鎖活動空間。 |
| **Warden** (護盾督軍) | **後方指揮與陣型強化**<br>(Rear Vanguard Buffer) | 保持在最近 2 隻 Brute/Crawler 後方 $120\text{px}$，距玩家 $\ge 280\text{px}$ | 徘徊於二線。每 4s 為前鋒套上金黃護盾（40% 最大 HP，免疫擊退），使正面突破難度成倍上升。 |
| **Burrower** (沙海潛伏者) | **縱深穿插與落點奇襲**<br>(Subterranean Interceptor) | 鑽地朝 $\vec{P} + \vec{V}_p \cdot 1.2\text{s}$ 潜行，破土攔截 | 潛伏地下無視子彈，精準預判玩家奔馳方向破土衝擊，放射尖刺彈，迫使玩家中斷長距離單向衝刺。 |

### 3. 戰術狼群集結脈衝 (Pack Convergence Pulse)

為打破枯燥的常規拉扯，波次導演在約 **10s** 觸發持續 3.5 秒的「**狼群合圍號角（WOLF PACK SURGE）**」。後期波次（Wave≥3 且 Heat≤3）可再於風暴前緣前 ≥4s 觸發第二次；Heat≥4 或早期低 Heat 開場（Wave 1–2）僅保留單次：
1. **音訊與視覺先導**：低頻沙鳴（Siren Stinger），場景地表揚起向心性塵暴粒子。
2. **全軍向心絞殺向量（Centripetal Compression）**：所有非遠程怪物（Crawler/Rusher/Brute）臨時將目標錨點鎖定在「以玩家為中心、半徑 80px 的等分環（Angular Slots）」上：
   $$\text{SlotAngle}_k = \frac{2\pi \cdot k}{N_{swarm}} + \theta_{offset}$$
3. **衝鋒增益**：移動速度暫時提高 15%，完全形成 360 度收緊的「鐵桶包圍圈」，強制玩家使用 Dash 或戰術武器（EMP / 旋風 / 奇點）完成破局，心流體驗達到峰值！

---

## 四、 巨型首領的大世界戰鬥場景重塑 (Epic Boss Arena Overhaul)

在大世界擴張後，針對三大首領的戰鬥體驗進行深度場景化重構：

```
+-----------------------------------------------------------------------------------+
| 方案比選結論：                                                                    |
| 否定 方案 A (純封閉死鬥場 1200x1200)：割裂大世界探索感，讓擴充地圖變得毫無意義。    |
| 否定 方案 B (純全圖無限制追獵)：首領毫無邊界約束，玩家無限風箏，Boss 沦為遠程靶子。  |
|                                                                                   |
| ★ 最終採納：【動態角鬥場與移動風暴要塞 (Mobile Epicenter & Destructible Arena)】  |
+-----------------------------------------------------------------------------------+
```

### 1. Titan (第 5 波·陸上巨型要塞) — 大世界碾壓與地震牽引

```
                             [ Titan 履帶移動要塞 ]
                       ==================================
                      [  左迫擊砲  ][ 本體散熱核心 ][ 右蜂巢艙 ]
                       ==================================
                                    ||     ||
                                    \/ 履帶碾壓帶 (Lava Trench)
                         
                         [ 牽引重力錨 Seismic Harpoon ]
                                    ||
                                    \/  (拖曳鎖鏈)
                               ( 玩家 P )
```

- **定位與場景重構**：全圖自由移動的巨型履帶戰艦。
- **大世界特色機制**：
  1. **地形摧毀與焦土軌跡（Terrain Crushing & Trench Trail）**：Titan 橫衝直撞時，沿途碾碎所有碎石、障礙物，並直接引爆接觸到的油桶（造成大範圍爆炸友傷）；履帶後方留下持續 6 秒的寬幅高溫熔岩履痕（踩入受到灼燒傷害）。
  2. **地震牽引重力錨（Seismic Harpoon Hook）**：
     - 為防止玩家拉開 1000px 遠程「洗血」，Titan 腹部每 9 秒向玩家發射一枚高速地震錨鏈（預警線 0.75s，速度 720px/s）。
     - 命中後不直接致死，而是**將玩家向 Titan 正面拖曳 350px**，並觸發 1.2s 減速 40%，逼迫玩家正面應對迫擊砲與副砲覆蓋區！
  3. **超載防衛矩陣（Phase 2 Overheat Lockdown）**：
     - 當 Titan 血量降至 50% 或散熱鰭片破壞過熱時，Titan 向四周錨定 4 根「高壓等離子電極樁」，就地鎖定直徑 $1300\text{px}$ 的動態焦痕區，玩家必須在該區域內完成部位拆解。

### 2. Dreadnought (第 10 波·狂暴破壁者) — 軌道沉箱巨石與撞碎暈眩

```
                  [ 軌道空投沉箱巨石 Monolith Crag ]
                                 [  石  ]
                                    ^
                                    |  (高速衝撞 560px/s)
    [ 玩家 P ] <==== 誘導衝撞方向 ==== [ Dreadnought 首領 ]
                                    |
                                    v
                                 [  石  ]
```

- **痛點破解**：Dreadnought 最精妙的機制是「衝撞撞牆後露出後方弱點反應爐（200% 傷害）」。大世界無牆可撞會徹底毀滅該機制！
- **大世界全新機制 — 離子沉箱巨石（Monolithic Orbital Crags）**：
  1. **伴生降臨空投**：Dreadnought 進場時，伴隨 4~6 座巨大的「離子沉箱巨石（Monoliths，半徑 45px，帶高對比警告標記）」從軌道轟擊墜落於戰場周遭（分佈於直徑 900~1200px 圓周）。
  2. **誘導撞石破甲（Lure-and-Shatter Mechanics）**：
     - Dreadnought 鎖定玩家發起極速衝撞（560px/s）。
     - 玩家必須利用機動性與 Dash，**將 Dreadnought 誘導撞上沉箱巨石**！
     - 撞擊時：巨石徹底粉碎，炸出大量石塊破片傷害周圍小怪，Dreadnought 觸發 **2.0 秒強制大硬直（Wall-bash Stun）**，後方反應爐冒煙過熱，露出金色弱點！
  3. **巨石重生**：進入階段 2（雙重衝撞）與階段 3（超頻召喚）時，Dreadnought 咆哮重新召喚軌道空投補充電極巨石，始終保持場上有撞擊點可用。

### 3. Storm Sovereign (第 15 波·風暴主宰) — 移動風暴之眼 (Mobile Eye of the Storm)

```
       [ 圈外：大世界致死沙暴區 Lethal Gale Zone (每 0.5s 扣 8 HP + 逆風阻力) ]
    -------------------------------------------------------------------------
   |                                                                         |
   |              [ 移動風暴之眼 Mobile Eye of the Storm (直徑 1100px) ]       |
   |             +---------------------------------------------+             |
   |             |            (風暴塔 A)                       |             |
   |             |                  \                          |             |
   |             |                   v                         |             |
   |             |            [ Storm Sovereign ] <--- 隨主體平移             |
   |             |                   ^                         |             |
   |             |                  /                          |             |
   |             |            (風暴塔 B)                       |             |
   |             |                       ( 玩家 P )            |             |
   |             +---------------------------------------------+             |
   |                                                                         |
    -------------------------------------------------------------------------
```

- **定位與場景重構**：風暴之主即是大世界的天災風暴核心。
- **全新大世界機制**：
  1. **動態移動風暴之眼（Mobile Eye of the Storm）**：
     - Sovereign 現身時，不再封閉整張大地圖，而是**以 Sovereign 本體為中心建立直徑 $1100\text{px}$ 的移動安全區（Eye Circle）**。
     - 安全區邊界由呼嘯的青藍色離子沙暴氣旋動態渲染。
     - **圈外極度致命**：玩家若離開風暴之眼，每 0.5 秒受到 8 點護盾/生命侵蝕傷害，且遭受朝向圈外的強烈逆風推力！
  2. **伴隨平移的微型戰場**：
     - Sovereign 在大地圖上以 24~40px/s 緩慢巡遊漂移，風暴之眼隨之平滑移動。玩家必須一邊走位輸出、一邊跟隨風暴之眼在大地圖上遷移，體驗絕無僅有的「風暴追逐戰」！
  3. **軌道風暴雙塔（Orbiting Storm Towers）**：
     - 階段 2 召喚的 2 座風暴塔錨定在風暴之眼內部（相對於 Sovereign 保持特定角速度公轉）。
     - 兩塔未破前 Sovereign 處於無敵護盾狀態。玩家需在移動的風暴圓圈內逐一拆除風暴塔，完成破盾斬首！

---

## 五、 數值節奏、生成預算與密度調控 (Pacing, Budget & Density Math)

### 1. 機體機動性提升後的怪速補償代償公式 (Mobility Compensation Matrix)

大世界中玩家獲得了更開闊的走位半徑與加速能力，若敵人維持原速將淪為靜止木靶。根據數值平衡演算，對怪物基準速度與衝刺加速度進行精準代償提升：

$$V_{world\_enemy} = V_{base} \times (1 + \alpha_{large\_world}) \times M_{aggro\_boost}$$

其中 $\alpha_{large\_world} \approx 0.08$，當距離玩家 $d > 550\text{px}$ 且**未**進入 hyper-catchup 時 $M_{aggro\_boost} = 1.35$（遠距縮圈加速）；hyper-catchup 啟用時改乘 $2.2$，兩者互斥以免瞬移貼臉：

| 敵型代號 | 舊版基準速度 | 大世界代償後基準速度 | 突進/狂暴瞬時極速 | 數值代償設計意圖 |
| :--- | :--- | :--- | :--- | :--- |
| **Crawler** | $65\text{ px/s}$ | **$85\text{ px/s}$** | $110\text{ px/s}$ (Command buff) | 基礎爬行速度提升 30%，維持前線壓迫感。 |
| **Rusher** | $140\text{ px/s}$ | **$175\text{ px/s}$** | **$290\text{ px/s}$** (突刺 Burst) | 突刺爆發力大幅增強，能在一瞬間切入玩家內圈。 |
| **Brute** | $45\text{ px/s}$ | **$60\text{ px/s}$** | $80\text{ px/s}$ (近身 150px 衝刺) | 略微提速，確保在中距離不被無腦放風箏。 |
| **Scurrier** | $150\text{ px/s}$ | **$190\text{ px/s}$** | $220\text{ px/s}$ (合圍衝刺) | 極高機動自爆威脅，逼迫玩家必須優先轉火或 Dash。 |
| **Spitter** | $60\text{ px/s}$ | **$78\text{ px/s}$** | $95\text{ px/s}$ (後退撤離) | 確保能跟隨玩家的走位保持在視口邊界。 |
| **Burrower** | 地下 $140$ / 地面 $40$ | **地下 $185$ / 地面 $55$** | 地下 $240\text{ px/s}$ (追截) | 地底潛行速度超越玩家步行速度，實現精準前向攔截。 |
| **Warden** | $55\text{ px/s}$ | **$70\text{ px/s}$** | $85\text{ px/s}$ | 確保及時跟進前鋒隊列並維持後排身位。 |

### 2. 同屏上限與空間密度守恆 (Density Conservation & Hard Performance Envelope)

為在原生 Canvas 2D 下維持 60 FPS 且記憶體 0-GC，同屏實體嚴格設防：

1. **嚴格同屏活躍敵軍上限（Active Pool Cap）**：
   $$\text{ActiveEnemiesMax} = \min(70, 18 + \text{Wave} \times 3)$$
   - 第 1 波：21 隻
   - 第 5 波（首領）：33 隻（雜兵上限受限，讓位於首領）
   - 第 10 波：48 隻
   - 第 15 波及無盡：鎖定 **65 ~ 70 隻**（最佳割草手感與渲染開銷平衡點）。
2. **空間密度常數守恆（Spatial Density Invariant）**：
   - 視口內理想敵軍數量維持在 **$18 \sim 32$ 隻**。
   - 視口外活躍環維持在 **$25 \sim 38$ 隻**。
   - 任何時刻，視口核心區域的敵軍密度均等價於舊版單屏的高壓狀態，大世界並未稀釋「臉上的壓迫感」！

### 3. 生成預算信用點系統 (Wave Budget & Credit System)

波次生成器由定時單純計數，升級為**信用點動態調節系統（Spawn Credit Controller）**：

- 各兵種生成點數成本（Spawn Cost）：
  - `Crawler`: 1 點
  - `Scurrier`: 2 點（2隻群體 = 2 生成時槽）
  - `Rusher`: 2.5 點
  - `Spitter`: 3.5 點
  - `Brute`: 5 點
  - `Burrower`: 5.5 點
  - `Warden`: 6 點
  - `Elite 詞綴精英`: 10 點
- 每秒點數注入速率：
  $$\text{IncomeRate} = (4.0 + \text{Wave} \times 0.65) \times \text{PacingMultiplier}$$
  導演依據當前波次心流階段釋放對應兵種組合。

### 4. 波次 30 秒心流呼吸律動 (The 4-Phase Wave Flow Cycle)

單波次 30 秒戰鬥遵循「緊張—釋放—高潮—爆發」的四幕節奏：

```text
波次時鐘: 0s ------------- 6s ------------------------ 20s ------------ 25s --------- 30s
心流階段: [ 滲透先遣期 ]    [     戰術包夾壓迫期     ]    [ 菁英巔峰期 ]  [ 風暴收割崩潰期 ]
怪潮特徵: 輕裝 Rusher 探路   Brute正面 + Spitter架炮      雙詞綴菁英降臨  全場狂暴 / 終局爆發
生成倍率: 0.8x              1.2x (狼群合圍脈衝 12s)       1.0x (高危精英)  1.4x (沙暴加速)
```

1. **Phase 1: 滲透先遣期 (0~6s)**：
   - 剛進波次，玩家整理戰利品與規劃走位。
   - 生成 3~5 隻 Rusher 與少數 Crawler，從前向扇區進行第一波試探性交火。
2. **Phase 2: 戰術包夾壓迫期 (6~20s)**：
   - 戰鬥核心期。Brute 作為錨點登場，Spitter 於外圍佈設酸池，兩翼 Rusher 展開 Pincer 包抄。
   - **第 12 秒觸發「狼群合圍脈衝」**，怪潮密度達到首個波峰。
3. **Phase 3: 菁英破陣期 (20~25s)**：
   - 帶有特殊詞綴（Volatile / Splitter / Command）的高階精英突入戰場，周圍生成 Warden 護盾援護，考驗玩家的集火與戰術道具決策。
4. **Phase 4: 風暴收割崩潰期 (25~30s)**：
   - `frontActive()` 啟動，風暴警報響起，風向突變。
   - 剩餘怪潮進入嗜血衝鋒狀態（移速 +20%），掉落率提升，玩家進入清場與準備過波的極致爽感高潮！

---

## 六、 系統工程架構與落地契約 (Engineering Blueprint & Architecture Contract)

### 1. 模組責任與修改入口指引

遵循《DUST//REIGN》`ARCHITECTURE.md` 嚴格規範，各功能無縫對接至既有程式碼結構：

| 模組檔案路徑 | 責任擴展與新增函式 | 跨模組資料契約 |
| :--- | :--- | :--- |
| `src/systems/spawning.js` | 實作 `sampleRingSpawnPoint()`、`pickTacticalFlankSide()`，淘汰原四邊固定刷新邏輯。 | 讀取 `rt.state.camera` 與玩家瞬時向量，輸出合法的大世界實體座標。 |
| `src/systems/sim/enemies.js` | 引入 Boids-lite 排斥力計算；實作 Rusher 側翼阻截向量與超遠端回收判定（`checkCullAndRecycle`）。 | 保持 0-GC，使用 `fastUnorderedRemove` 移除被回收怪物，累加 `recycledTokens`。 |
| `src/systems/sim/bosses.js` | 擴展 Titan 地震牽引錨（`stepTitanHarpoon`）；實作 Dreadnought 巨石空投與粉碎（`stepDreadnoughtCrags`）；改寫 Sovereign 移動風暴之眼邏輯。 | 在 `rt.state.monolithCrags` 與 `rt.state.stormEye` 註冊首領場景物件。 |
| `src/systems/sim/timers-wave.js` | 實作 4 階段心流波次節奏調控與信用點注入計時器（`stepEnemySpawner` 升級）。 | 寫入 `rt.state.pacingPhase` 與合圍脈衝旗標。 |

### 2. 0-GC 記憶體與算力開銷防線（Performance Invariants）

1. **避免在 RAF 中分配物件**：
   - 複用全局單例 `SPAWN_VEC_SCRATCH = { x: 0, y: 0 }` 計算生成座標與預測向量。
   - 敵軍排斥力計算嚴格複用單例 `STEP_SCRATCH`。
2. **空間網格無縫對接**：
   - 繼續維持 55px 單元格的 `spatial-grid.js`，大世界尺寸擴充至 $3200 \times 2400$ 時，網格陣列平坦長度僅為 $\lceil 3200/55 \rceil \times \lceil 2400/55 \rceil \approx 59 \times 44 = 2596$ 個單元格，TypedArray 記憶體開銷 $< 32\text{ KB}$，完全零壓力。
3. **視錐台剔除（Frustum Culling）極致化**：
   - 超出視口外 $1.2\times$ 的怪物，跳過精細多邊形渲染與發光計算，僅執行輕量物理位移更新。

---

## 七、 驗收指標與測試矩陣 (Acceptance Criteria & Test Matrix)

1. **無感生成驗收（Zero Pop-in Test）**：
   - 在高移速衝刺（Dash + Overdrive）狀態下，相機視野內 $1.0\times$ 範圍內生成怪物次數為 **0 次**。
2. **防長蛇陣包圍感驗收（Pincer Ratio Test）**：
   - 玩家沿單一方向奔跑 10 秒，前方與側方切入的怪物數量佔比 $\ge 65\%$，無單向火車拖尾現象。
3. **效能硬體指標（60 FPS Guarantee）**：
   - 在同屏 70 隻怪物、200 發子彈與首領全技能釋放下，低階設備 CPU 單幀模擬時間 $< 4.5\text{ms}$，Canvas 繪製時間 $< 8.0\text{ms}$，幀率穩定維持 60 FPS。
4. **首領大世界機制驗收（Boss Stun & Arena Integrity）**：
   - Dreadnought 在大世界任何位置發動衝撞，均能於 2 次衝撞內成功引導其撞碎巨石並進入過載硬直；
   - Sovereign 移動風暴之眼平滑跟隨首領，圈外傷害判定精準無延遲。

---
*DUST//REIGN 戰鬥節奏、怪潮生成與動態壓迫感總監*  
*Document Version: 1.0.0 // Ready for Implementation*
