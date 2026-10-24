# 《DUST//REIGN》大世界相機動力學、準星前瞻與視口追蹤工程策劃案
## Camera Dynamics, Aim Lookahead & Viewport Tracking System Specification

> **版本**：v1.0-RC1  
> **系統負責**：相機動力學、準星前瞻與視口追蹤策劃專家 (Camera Dynamics, Aim Lookahead & Viewport Lead)  
> **目標讀者**：Lead Designer, System Architect, Core Gameplay Engineers, QA Test Engineers  
> **技術基底**：Canvas 2D / 0-GC ES Modules / High-DPR Responsive Viewport  
>
> **現行行為（取代本文的阻尼、前瞻與邊界夾持章節）**：相機改為每幀硬鎖定玩家座標，移除追蹤阻尼、軟約束死區與準星前瞻；世界邊界不再夾持相機，玩家由模擬層夾持在地圖內，界外視野由 `src/render/boundary.js` 繪製虛空、警示條與能量屏障。震屏與震屏解耦逆映射維持不變。驗收見 `scripts/test-track1-camera.mjs`。  

---

## 1. 總覽與架構願景 (Executive Vision & Architectural Invariants)

在《DUST//REIGN》由「固定單屏戰場 (Bounded Arena)」過渡至「荒原大世界 (Expanded Wasteland Map)」的架構演進中，相機系統不再是簡單的靜態畫布容器，而是決定整體戰鬥手感（Game Juice）、空間沉浸感、射擊精度與防眩暈體驗的心臟樞紐。

本策劃案為工程實施制定以下**四大系統級不變量 (Core Invariants)**：

1. **零眩暈流暢追隨 (Zero-Nausea Tracking)**：放棄生硬的 1:1 鎖定或低頻滯後，採用幀率無關的非對稱雙階阻尼（Asymmetric Dual-Stage Damping），衝刺時鎖定視覺焦點，打滑與後座時賦予機械慣性。
2. **射擊視界智能前瞻 (Bi-directional Aim Lookahead)**：建立具備前瞻死區、平滑過渡（Smoothstep）與邊界防溢出的準星前瞻向量，賦予玩家延伸 20%~25% 戰術縱深，同時在近戰微調時保持絕對平穩。
3. **視口與大世界剛性夾緊 (Strict Boundary Clamping & No Under-draw)**：世界邊界外絕對不可見，相機中心到達限制區時平滑減速，機甲從正中平順過渡至邊界，徹底隔絕黑邊漏底。
4. **雙向坐標零誤差逆映射 (Shake-Compensated Invertible Transform)**：滑鼠、觸控、EMP 落點與世界坐標完全解耦且無縫雙向變換；輸入逆映射精準剔除高頻震屏雜訊，杜絕瞄準抖動；世界層與螢幕層嚴格分離。
5. **立體戰術邊界雷達 (Offscreen Edge Chevron & Tactical Minimap)**：透過射線與邊界求交（Ray-AABB）、優先級色彩分流、距感標記與 0-GC 掃描雷達，提供 360 度無死角的大世界目標指引。

---

## 2. 相機狀態模型與資料契約 (Camera State & Runtime Contract)

在 `src/core/runtime.js` 或 `rt.state` 中擴充專屬單例相機狀態物件 `camera`，所有數值計算嚴格維持 0-GC 分配：

```javascript
/**
 * Camera State Container (Zero-Allocation Singleton)
 */
export var camera = {
  // 世界坐標中心點 (World Space Focus)
  x: 480,
  y: 320,
  targetX: 480,
  targetY: 320,
  
  // 準星動態前瞻偏移 (Aim Lookahead Offset)
  lookaheadX: 0,
  lookaheadY: 0,
  targetLookaheadX: 0,
  targetLookaheadY: 0,
  
  // 震屏正交合成量 (Screen Shake State)
  trauma: 0,          // 創傷值 [0.0 ~ 1.0]
  shakeX: 0,           // 當前幀橫向震屏偏移 (px)
  shakeY: 0,           // 當前幀縱向震屏偏移 (px)
  shakeAngle: 0,       // 當前幀微小視角旋轉 (rad)
  
  // 大世界邊界 (World Boundary Dimensions)
  worldW: 2880,        // 大世界寬度 (預設 3x 螢幕寬度)
  worldH: 1920,        // 大世界高度 (預設 3x 螢幕高度)
  
  // 視口尺寸 (Cached Viewport Size)
  viewW: 960,
  viewH: 640,
  dpr: 1.0,
  
  // 矩陣快取 (Cached Transform Coefficients for Zero-Cost Inversion)
  viewOriginX: 0,      // (viewW / 2) + shakeX
  viewOriginY: 0       // (viewH / 2) + shakeY
};
```

---

## 3. 模組一：相機追蹤動力學 (Camera Tracking & Damping Dynamics)

### 3.1 剛性鎖定 vs 彈性阻尼的致命痛點與解法

| 方案 | 優點 | 缺陷 | 裁定 |
|---|---|---|---|
| **純剛性鎖定 (Rigid Center)** | 玩家永在螢幕正中，定位絕對可靠。 | 在 Dash（700+ px/s）或 Skid 時背景高頻劇烈撕裂，玩家極易產生動態眩暈；缺乏機械重工厚重感。 | **否決** |
| **簡單線性插值 (Simple Lerp)** | 代碼極短 (`lerp(cam, p, 0.1)`)。 | 幀率不穩定時位移不均勻；Dash 瞬間機甲飛出視窗，撞入未知敵彈或酸池，手感嚴重滯後脫節。 | **否決** |
| **非對稱雙階動態阻尼 (Asymmetric Dual-Stage Damping)** | 巡航時平滑優雅，高速衝刺時自適應緊跟，死區約束保證機甲不脫離核心視野圈。 | 需維護自適應衰減係數與軟邊死區。 | **唯一選定方案** |

### 3.2 幀率無關的動態阻尼數學模型 (Framerate-Independent Exponential Decay)

相機追蹤採用指數衰減微分方程：
$$P_{cam}(t + \Delta t) = P_{target}(t) + \left( P_{cam}(t) - P_{target}(t) \right) \cdot e^{-\lambda \cdot \Delta t}$$

#### 自適應阻尼係數 $\lambda$ 狀態矩陣：
1. **常態巡航 (Cruise Tracking)**：
   $$\lambda_{cruise} = 8.5 \text{ s}^{-1} \quad (\text{半衰期 } t_{1/2} = \frac{\ln 2}{8.5} \approx 81.5 \text{ ms})$$
   給予輕微推背感，過濾機甲細微走位抖動。
2. **高速衝刺 (Dash / High Speed Mode)**：
   當機甲速度 $V_{player} > 380\text{ px/s}$ 或正在衝刺（`p.dashPulse > 0`）時：
   $$\lambda_{dash} = 24.0 \text{ s}^{-1} \quad (\text{半衰期 } t_{1/2} \approx 28.8 \text{ ms})$$
   相機瞬間收緊，幾乎與機甲同步位移，確保玩家看清衝刺突進路線上的威脅。
3. **軟邊約束死區 (Soft-Leash Deadzone)**：
   機甲在螢幕正中心的容許漂移半徑設定為：
   $$R_{leash\_max} = \min(W_{view}, H_{view}) \times 0.12 \approx 76.8\text{ px}$$
   若機甲與相機的幾何偏差大於 $R_{leash\_max}$，強行進行硬約束限制：
   $$\vec{C}_{cam} = \vec{P}_{player} - \frac{\vec{P}_{player} - \vec{C}_{cam}}{\|\vec{P}_{player} - \vec{C}_{cam}\|} \cdot R_{leash\_max}$$
   徹底杜絕機甲在任何極限加速度下甩出視窗的可能。

### 3.3 急停打滑 (Skid Drift) 與武器後座力 (Recoil Kickback) 相機反饋

1. **急停打滑慣性過衝 (Skid Overshoot)**：
   當機體觸發急轉打滑（`p.isSkidding === true`）時，相機沿打滑切線速度方向注入一個微幅慣性前衝向量 $\vec{I}_{skid} = \vec{V}_{skid} \times 0.06$，持續 $0.12\text{s}$ 後平滑衰減，強化重型機甲於荒漠沙地上急停漂移的機械重量反饋。
2. **向量後座力衝量 (Vector Recoil Impulse)**：
   機甲主武器開火時，會賦予機體後座速度向量 $(p.recoilVx, p.recoilVy)$。相機以 $10\%$ 的權重同向注入相機微晃動量：
   $$\vec{C}_{target} = \vec{P}_{player} + \vec{V}_{recoil} \cdot 0.08$$
   並以極高衰減率 $\lambda_{recoil} = 30.0\text{ s}^{-1}$ 快速吸附回位，使大口徑穿甲彈開火具備重砲出膛的衝擊震盪手感。

---

### 3.4 準星動態前瞻 (Aim Lookahead Offset)

#### 設計宗旨
機甲手持長射程武器（例如軌道狙擊槍 800px 射程、加特林機槍）。若視口始終鎖死機甲，朝屏幕外射擊時有 $50\%$ 的屏幕視野被身後無用空間浪費。前瞻系統使相機沿瞄準軸線動態前推，拓展射擊視野。

#### 核心公式與曲線設計
令機甲世界坐標為 $\vec{P}_{world}$，瞄準點世界坐標為 $\vec{M}_{world}$。
瞄準方向向量：
$$\vec{D}_{aim} = \vec{M}_{world} - \vec{P}_{world}, \quad L = \|\vec{D}_{aim}\|$$

1. **前瞻死區 (Deadzone Filter)**：
   當 $L \le R_{dead} = 70\text{ px}$ 時，前瞻偏移量為 $0$。避免在近身防身、貼臉清怪或微調射角時引發鏡頭無謂搖擺。
2. **最大前瞻極限 (Max Offset Window)**：
   $$O_{max} = \min(W_{view}, H_{view}) \times 0.22 \approx 140\text{ px}$$
   前瞻距離不超過視口短邊的 $22\%$，保證身後保留至少 $280\text{px}$ 預警視野，防止被後方偷襲。
3. **Smoothstep 平滑增益曲線**：
   有效區間 $L \in [R_{dead}, R_{max}]$（其中 $R_{max} = 450\text{ px}$）：
   $$t = \text{clamp}\left(\frac{L - R_{dead}}{R_{max} - R_{dead}}, 0, 1\right)$$
   $$w(t) = 3t^2 - 2t^3 \quad (\text{Hermite 曲線})$$
   前瞻目標偏移量：
   $$\vec{O}_{target} = \frac{\vec{D}_{aim}}{L} \cdot \left( O_{max} \cdot w(t) \right)$$
4. **非對稱前進/回縮阻尼 (Asymmetric Lookahead Smoothing)**：
   - 當準星向外延伸時：採用緩進阻尼 $\lambda_{look\_extend} = 5.5\text{ s}^{-1}$（約 126ms 半衰期），鏡頭隨視線舒緩前推。
   - 當準星收回或玩家急轉向時：採用快退阻尼 $\lambda_{look\_retract} = 12.0\text{ s}^{-1}$（約 57ms 半衰期），鏡頭迅速歸中，避免玩家感到鏡頭失控。
5. **手把 (Gamepad) 專屬前瞻適配**：
   手把右搖桿輸入軸 $(rx, ry)$，模長 $M_{stick} = \sqrt{rx^2 + ry^2}$。
   死區設為 $0.18$。當 $M_{stick} > 0.18$ 時：
   $$\vec{O}_{target} = \frac{(rx, ry)}{M_{stick}} \cdot O_{max} \cdot \left( \frac{M_{stick} - 0.18}{0.82} \right)^{1.4}$$

---

### 3.5 創傷度震屏架構 (Trauma-based Screen Shake)

#### 3.5.1 傳統隨機抖動 vs 創傷度系統
原版 `(Math.random() - 0.5) * activeShake` 存在白噪聲高頻刺眼、無法表達方向性與爆炸強度的缺點。
升級為**基於創傷度 (Trauma-based)** 的非線性震屏系統：

1. **創傷值 $T \in [0.0, 1.0]$**：
   - 受擊扣血：$T \mathrel{+}= 0.25 \times (\text{dmg} / 25)$
   - 近距爆炸 (Barrel / Meteor)：$T \mathrel{+}= 0.45$
   - Titan 首領踐踏/雷擊衝擊：$T \mathrel{+}= 0.70$
   - 衰減規律：$T(t + \Delta t) = \max(0, T(t) - 1.35 \cdot \Delta t)$
2. **指數能量震幅 (Quadratic Amplitude)**：
   $$\text{ShakeAmplitude} = T^2 \quad (\text{使微小打擊細膩，重大爆炸極具破壞力})$$
3. **正交合成 (Orthogonal Decomposition)**：
   - 橫向平移：$\Delta X_{shake} = \text{ShakeAmplitude} \cdot \text{MaxOffset}_X \cdot \sin(t \cdot \omega_1)$
   - 縱向平移：$\Delta Y_{shake} = \text{ShakeAmplitude} \cdot \text{MaxOffset}_Y \cdot \cos(t \cdot \omega_2)$
   - 視角微旋轉：$\Delta \theta_{shake} = \text{ShakeAmplitude} \cdot \text{MaxAngle} \cdot \sin(t \cdot \omega_3)$
   其中 $\text{MaxOffset} = 18\text{ px}$，$\text{MaxAngle} = 0.022\text{ rad} \approx 1.25^\circ$。
   頻率取不共振質數比：$\omega_1 = 31\text{ rad/s}, \omega_2 = 27\text{ rad/s}, \omega_3 = 23\text{ rad/s}$，生成絲滑、劇烈而不刺眼的真實機械晃動。
4. **無障礙模式防護 (Accessibility & Motion Reduction)**：
   當 `isReducedMotion()` 為真時：
   $$\Delta \theta_{shake} \equiv 0, \quad \Delta X_{shake} \equiv 0, \quad \Delta Y_{shake} \equiv 0$$
   所有受擊震度 $100\%$ 轉化為邊緣色調閃光（`drawHurt` / `hurtFlash`），零眩暈保障。

---

## 4. 模組二：大地圖邊界阻尼與視窗夾緊 (World Boundary Clamping)

### 4.1 大地圖維度規範 (Map Dimensions)
- 標準廢土區域：寬度 $W_{world} = 2880\text{ px}$，高度 $H_{world} = 1920\text{ px}$（約 $3 \times 3$ 螢幕視窗）。
- 特大極限作戰地圖：可達 $3840 \times 2560\text{ px}$。

### 4.2 視口夾緊窗口 (Viewport Clamping Window)
為徹底消除黑邊漏底（Under-draw），相機中心坐標 $(C_x, C_y)$ 包含前瞻偏移後，其最終取值範圍嚴格約束於：
$$C_{x\_clamped} = \text{clamp}\left(C_x + O_x, \frac{W_{view}}{2}, W_{world} - \frac{W_{view}}{2}\right)$$
$$C_{y\_clamped} = \text{clamp}\left(C_y + O_y, \frac{H_{view}}{2}, H_{world} - \frac{H_{view}}{2}\right)$$

### 4.3 機體游移與邊界軟彈簧阻尼 (Soft Spring Border Deceleration)
1. **中心游移機制**：
   當機甲向地圖邊緣逼近（例如接近西側 $x = 0$）：
   - 相機中心 $C_{x\_clamped}$ 在到達 $W_{view} / 2$ 時停止向西滾動。
   - 機甲將順理成章從螢幕中心平滑游移至螢幕西側邊緣。
   - 玩家始終能清晰掌握自己「已經被逼入死角」的戰術絕境感。
2. **邊界物理斥力與沙暴逆風 (Boundary Elastic Repulsion)**：
   地圖四邊設有高危輻射電網/風暴牆。
   - 邊界安全留白：$M_{edge} = 45\text{ px}$（機體最大碰撞半徑 $15\text{px} + 30\text{px}$ 緩衝）。
   - 當機體世界坐標 $P_x < M_{edge} + 60\text{ px}$ 時，環境沙暴施加向內推力：
     $$F_{repulsion} = \left(1 - \frac{P_x - M_{edge}}{60}\right)^2 \cdot 180\text{ px/s}$$
     給予玩家方向盤阻尼感，提醒邊界危險。
3. **震屏防黑邊外溢 (Shake Bleed Protection)**：
   由於震屏最大振幅可達 $18\text{px}$，為防止夾緊狀態下震屏露出黑邊：
   - 夾緊安全窗口向內預收縮：
     $$X_{min} = \frac{W_{view}}{2} + \text{MaxShakePad} \quad (\text{MaxShakePad} = 20\text{ px})$$
     $$X_{max} = W_{world} - \frac{W_{view}}{2} - \text{MaxShakePad}$$
   - 背景地形渲染向外超額繪製（Over-draw Margin）$48\text{ px}$，確保在任何震級下均無縫覆蓋。

---

## 5. 模組三：螢幕坐標與世界坐標的雙向映射矩陣 (Coordinate Transformations)

### 5.1 數學矩陣推導

#### 1. 正向映射：World-to-Screen Matrix ($M_{w \to s}$)
將世界實體坐標 $(X_w, Y_w)$ 投影至螢幕像素 $(X_s, Y_s)$：
$$\begin{bmatrix} X_s \\ Y_s \end{bmatrix} = \begin{bmatrix} \cos\theta_s & -\sin\theta_s \\ \sin\theta_s & \cos\theta_s \end{bmatrix} \begin{bmatrix} X_w - C_{x\_final} \\ Y_w - C_{y\_final} \end{bmatrix} + \begin{bmatrix} \frac{W_{view}}{2} + \Delta X_{shake} \\ \frac{H_{view}}{2} + \Delta Y_{shake} \end{bmatrix}$$

其中 $C_{x\_final} = C_{x\_clamped}$，$C_{y\_final} = C_{y\_clamped}$。
在 Canvas 2D 渲染管線中，此變換透過單次 `ctx.translate` 與 `ctx.rotate` 直接生效。

#### 2. 逆向映射：Screen-to-World Matrix ($M_{s \to w}$)
將瀏覽器輸入點（滑鼠瞄準、觸控點擊、EMP 拖曳、戰術輔助空投落點）轉為世界真實坐標：
設事件坐標為 $(E_x, E_y)$，Canvas 邊界矩形為 `rect`：
$$X_s = (E_x - \text{rect.left}) \cdot \frac{W_{view}}{\text{rect.width}}$$
$$Y_s = (E_y - \text{rect.top}) \cdot \frac{H_{view}}{\text{rect.height}}$$

逆向轉換公式：
$$\begin{bmatrix} X_w \\ Y_w \end{bmatrix} = \begin{bmatrix} \cos\theta_s & \sin\theta_s \\ -\sin\theta_s & \cos\theta_s \end{bmatrix} \begin{bmatrix} X_s - \left(\frac{W_{view}}{2} + \Delta X_{shake}\right) \\ Y_s - \left(\frac{H_{view}}{2} + \Delta Y_{shake}\right) \end{bmatrix} + \begin{bmatrix} C_{x\_final} \\ C_{y\_final} \end{bmatrix}$$

#### 3. 關鍵策劃決策：輸入逆映射必須消除震屏雜訊 (Shake Decoupling)
> [!IMPORTANT]
> **策劃決策**：在計算滑鼠世界瞄準點時，**嚴格扣除 $\Delta X_{shake}$ 與 $\Delta Y_{shake}$**！  
> **原因**：震屏是攝影機鏡頭的物理微晃，並非世界實體的空間震位。若逆映射不扣除震屏，當發生劇烈爆炸時，滑鼠指向的世界坐標會跟隨震屏高頻抖動，玩家將無法在爆炸中準確點射泰坦散熱鰭片或自爆蛛。扣除震屏後，玩家準星穩如泰山。

### 5.2 渲染管線圖層分工 (Layer Partitioning Matrix)

```
[Canvas Begin] (ctx.setTransform(dpr, 0, 0, dpr, 0, 0))
  │
  ├── 【世界變換層 (World Space Transform)】
  │     ctx.save();
  │     ctx.translate(W_view/2 + shakeX, H_view/2 + shakeY);
  │     ctx.rotate(shakeAngle);
  │     ctx.translate(-CamX, -CamY);
  │     │
  │     ├─ Layer 1: 地表地貌 (drawGround - Dunes, Noise)
  │     ├─ Layer 2: 永久貼花 (drawDecals - Skids, Scars, Scraps)
  │     ├─ Layer 3: 遠景微粒 (drawFarMotes)
  │     ├─ Layer 4: 接地陰影 (drawContactShadows - 雙 Pass 合流)
  │     ├─ Layer 5: 地面戰術物件 (drawCasings, Cores, Barrels, Spires)
  │     ├─ Layer 6: 掉落經驗球 (drawOrbs)
  │     ├─ Layer 7: 危險地形區域 (drawMoltenZones, PlasmaZones, Vortices)
  │     ├─ Layer 8: 戰術裝備 (drawTacticalEntities - Turrets, Decoys)
  │     ├─ Layer 9: 敵人與首領 (drawEnemy - Walkers, Rushers, Titan)
  │     ├─ Layer 10: 幽靈殘影與玩家機體 (drawGhostMecha, drawPlayer)
  │     ├─ Layer 11: 光照暗相乘層 (drawLightmap - Multiply)
  │     ├─ Layer 12: 高能加法發光 (drawPlayerBullets, LightningArcs, OpticalFlashes - Lighter)
  │     ├─ Layer 13: 近景大氣沙暴 (drawNearAtmosphere)
  │     ├─ Layer 14: 敵彈與危險預警 (drawEnemyBullets, ArtilleryTelegraphs, RusherTelegraphs)
  │     ├─ Layer 15: 戰場可讀性層 (drawFieldReadability, HighContrastMarkers)
  │     └─ Layer 16: 世界浮動標記 (drawDamageNumbers, 實體血條 GhostBar)
  │     ctx.restore();
  │
  └── 【螢幕固定層 (Screen Space Layer - 0 Camera Offset)】
        ├─ Layer 17: 全屏後處理 (drawScreenPost - Vignette, Grain, HurtFlash)
        ├─ Layer 18: 全屏白光/閃光 (drawScreenFlashes)
        ├─ Layer 19: 戰術雷達小地圖 (drawTacticalMinimap)
        ├─ Layer 20: 螢幕邊緣離屏指標 (drawOffscreenChevrons)
        ├─ Layer 21: 戰術 HUD (drawHud - HP, Energy, BossBar, Combos)
        ├─ Layer 22: 競速幽靈分段計時 (drawGhostSplitTimer)
        └─ Layer 23: 流程覆蓋層 (drawWaveBanner, PauseModal, GameOver)
[Canvas End]
```

---

## 6. 模組四：戰術小地圖與雷達邊界指引 (Tactical Radar & Edge Indicators)

### 6.1 螢幕邊緣雷達指針 (Offscreen Edge Chevron System)

在大世界中，威脅往往來自視野之外。當首領、菁英、自爆群或關鍵戰利品脫離主螢幕可見範圍時，動態吸附於螢幕邊緣的 Chevron 指針提供關鍵的 360 度威脅感知。

```
+-------------------------------------------------------------+
| [HP / AMMO]                                    [MINIMAP]    |
|                                                             |
|   ▲ [TITAN // 142m]                                         |
|  (P0 烈焰紅雙尖角)                                          |
|                                                             |
|                                                             |
|                         [ 機甲中心 ]                        |
|                                                             |
|                                            ► [CORE // 58m]  |
|                                           (P2 琥珀金光芒)   |
|                                                             |
|                                                             |
|          ▼ [SPIRE // 85m]                                   |
|         (P1 電弧青六角)                                     |
+-------------------------------------------------------------+
```

#### 6.1.1 射線與視口邊界求交算法 (Ray-AABB Clamping Algorithm)
設螢幕可視區內縮邊距 $P_{margin} = 32\text{ px}$（避開邊界 HUD）：
- 邊界窗口：$X \in [P_{margin}, W_{view} - P_{margin}]$，$Y \in [P_{margin}, H_{view} - P_{margin}]$。
- 視口中心到目標視口點的方向向量：
  $$\vec{V} = \vec{T}_{screen} - \vec{Center}_{screen}$$
- 求交係數：
  $$t_x = \frac{\text{border}_x - \text{Center}_x}{V_x}, \quad t_y = \frac{\text{border}_y - \text{Center}_y}{V_y}$$
  取最小正交點 $t = \min(t_x, t_y)$。
  指針邊緣坐標：
  $$\vec{P}_{chevron} = \vec{Center}_{screen} + \vec{V} \cdot t$$
- 指針旋轉角：$\alpha = \text{atan2}(V_y, V_x)$。

#### 6.1.2 目標優先級分流矩陣 (Priority & Color Matrix)

| 目標類型 (Target Type) | 優先級 | 標誌色彩 | 幾何外型 (Shape) | 距離顯示 | 脈衝動效 (Pulse Effect) |
|---|---|---|---|---|---|
| **首領泰坦 (Boss Titan)** | **P0** | `#ff4d2e` (主機警報紅) | 雙層大號尖角 $\gg$ (長 16px) | 強制常駐 (m) | 0.8s 呼吸脈衝 + 咆哮波紋 |
| **撤離穿梭機 (Extraction)** | **P0** | `#ffd36b` (安全金黃) | 菱形雷達天線 $\diamond$ (寬 14px) | 強制常駐 (m) | 金色流光內斂循環 |
| **菁英怪 (Elite / Warden)** | **P1** | `#b55fe6` (異星紫) | 實心倒三角 $\blacktriangledown$ (高 12px) | $\le 80\text{m}$ 顯示 | 恆定微光，殘血時閃爍 |
| **共振尖塔 (Resonance Spire)** | **P1** | `#00e5ff` (電弧青) | 六角芒星 $\ast$ (直徑 12px) | $\le 100\text{m}$ 顯示 | 蓄能超過 75% 急促暴閃 |
| **高價值戰利品 (Volatile Core)**| **P2** | `#f5a623` (琥珀澄) | 圓環同心圓 $\odot$ (直徑 10px) | $\le 60\text{m}$ 顯示 | 緩慢旋轉光芒 |
| **大型自爆蟲群 (Swarm)** | **P2** | `#e06b53` (危險橙) | 密集小點三聯頭 $>$ | 僅距離提醒 | 快速逼近時頻率加快 |

#### 6.1.3 距離感知與縮放透明度映射 (Distance Scale & Alpha Lacing)
世界距離 $D_{world} = \|\vec{T}_{world} - \vec{P}_{world}\|$：
- $D_{world} \le 800\text{ px}$：Scale $= 1.15$, Alpha $= 1.0$（高度威脅，視覺強烈醒目）。
- $800\text{ px} < D_{world} \le 1800\text{ px}$：Scale $= 1.00$, Alpha $= 0.85$。
- $D_{world} > 1800\text{ px}$：Scale $= 0.80$, Alpha $= 0.55$（遠距目標，不干擾近身視野）。

---

### 6.2 戰術掃描雷達 HUD (Tactical Minimap Specification)

#### 6.2.1 外觀規格與版面定位
- **位置**：右上角 $(W_{view} - 165\text{ px}, 16\text{ px})$。
- **維度**：圓形軍規雷達，半徑 $R_{radar} = 64\text{ px}$（直徑 $128\text{ px}$）。
- **底色與框線**：深褐半透明磨砂黑 `rgba(12, 10, 8, 0.82)`，邊框為 $1.5\text{px}$ 琥珀金 `rgba(212, 175, 55, 0.45)`。
- **戰術網格**：
  - 內圈標尺：$R_{inner} = 32\text{ px}$（代表半徑 $40\text{m}$ 戰術警戒圈）。
  - 外圈標尺：$R_{outer} = 64\text{ px}$（代表半徑 $80\text{m}$ 偵測極限）。
  - 經緯十字刻度線（N/S/E/W 軸線）。

#### 6.2.2 0-GC 極限性能繪製管線 (Zero-GC Render Loop)
為維持 60~120fps，雷達在每幀繪製中嚴禁建立任何臨時物件或陣列：

1. **坐標投影比率 (Radar Scale Ratio)**：
   $$S_{radar} = \frac{R_{radar}}{\text{RadarMaxRangeWorld}} = \frac{64\text{ px}}{960\text{ px}} \approx 0.0667$$
2. **扇形視錐台指示器 (Camera Frustum Cone)**：
   在雷達中心繪製一個覆蓋當前主螢幕視野的半透明錐形扇面（Alpha $= 0.12$），使玩家一眼洞悉目前螢幕對準荒原的哪個方向。
3. **電子雷達掃描線 (Phosphor Sweep Line)**：
   掃描線以週期 $T_{sweep} = 1.8\text{ s}$ 繞中心順時針旋轉。掃描線經過的實體點亮度 $+40\%$ 並維持 $0.3\text{s}$ 磷光餘輝衰減。
4. **實體單遍遍歷繪製 (Single-Pass Point Draw)**：
   直接遍歷 `rt.state.enemies`, `rt.state.orbs`, `rt.state.spires`：
   - 計算與玩家機甲的相對坐標 $(\Delta X, \Delta Y) = (E_x - P_x, E_y - P_y)$。
   - 平方距離比對 $\Delta X^2 + \Delta Y^2 \le 960^2$。
   - 投影雷達坐標：
     $$r_x = \text{RadarCenterX} + \Delta X \cdot S_{radar}$$
     $$r_y = \text{RadarCenterY} + \Delta Y \cdot S_{radar}$$
   - 按類別使用純色 `ctx.fillRect(rx - 1, ry - 1, 2, 2)`，批次合流繪製。

---

## 7. 核心代碼架構與模組實施範本 (Reference Implementation)

### 7.1 新增模組：`src/core/camera.js` (核心相機控制器)

```javascript
/**
 * DUST//REIGN - Camera Controller Engine
 * Core System: Motion Damping, Lookahead, Clamping & Coordinate Matrices
 */
import { rt } from './runtime.js';
import { clamp } from './utils.js';
import { isReducedMotion } from './settings.js';

// 單例快取容器 (0-GC)
export var camera = {
  x: 480,
  y: 320,
  lookaheadX: 0,
  lookaheadY: 0,
  trauma: 0,
  shakeX: 0,
  shakeY: 0,
  shakeAngle: 0,
  worldW: 2880,
  worldH: 1920
};

var SHAKE_MAX_OFFSET = 16.0;
var SHAKE_MAX_ANGLE = 0.020; // ~1.15 deg

export function initCamera(worldW, worldH) {
  camera.worldW = worldW || 2880;
  camera.worldH = worldH || 1920;
  var p = rt.state && rt.state.player;
  camera.x = p ? p.x : camera.worldW * 0.5;
  camera.y = p ? p.y : camera.worldH * 0.5;
  camera.lookaheadX = 0;
  camera.lookaheadY = 0;
  camera.trauma = 0;
}

export function addCameraTrauma(amount) {
  if (isReducedMotion()) return;
  camera.trauma = clamp(camera.trauma + amount, 0, 1.0);
}

export function updateCamera(dt) {
  if (!rt.state || !rt.ui) return;
  var p = rt.state.player;
  if (!p) return;

  var viewW = rt.ui.width || 960;
  var viewH = rt.ui.height || 640;

  // 1. 自適應跟隨阻尼係數 (Dash 衝刺時收緊，巡航時平滑)
  var isDashing = (p.dashPulse > 0) || (Math.hypot(p.vx || 0, p.vy || 0) > 380);
  var lambdaFollow = isDashing ? 24.0 : 8.5;
  var decayFollow = Math.exp(-lambdaFollow * dt);

  camera.x = p.x + (camera.x - p.x) * decayFollow;
  camera.y = p.y + (camera.y - p.y) * decayFollow;

  // 軟邊約束死區：機體偏差絕不超過視口半徑 12%
  var maxLeash = Math.min(viewW, viewH) * 0.12;
  var dx = p.x - camera.x;
  var dy = p.y - camera.y;
  var dist = Math.hypot(dx, dy);
  if (dist > maxLeash && dist > 0.001) {
    camera.x = p.x - (dx / dist) * maxLeash;
    camera.y = p.y - (dy / dist) * maxLeash;
  }

  // 2. 準星動態前瞻 (Aim Lookahead)
  var aimDx = 0;
  var aimDy = 0;
  if (rt.input.gamepadX || rt.input.gamepadY) {
    var stickMag = Math.hypot(rt.input.gamepadX, rt.input.gamepadY);
    if (stickMag > 0.18) {
      aimDx = (rt.input.gamepadX / stickMag) * ((stickMag - 0.18) / 0.82) * 350;
      aimDy = (rt.input.gamepadY / stickMag) * ((stickMag - 0.18) / 0.82) * 350;
    }
  } else {
    // 滑鼠瞄準方向 (相對於機甲自身)
    var mouseWorld = screenToWorld(rt.input.mouse.x, rt.input.mouse.y);
    aimDx = mouseWorld.x - p.x;
    aimDy = mouseWorld.y - p.y;
  }

  var aimDist = Math.hypot(aimDx, aimDy);
  var targetLookX = 0;
  var targetLookY = 0;
  var deadzone = 70;
  var maxAimDist = 420;
  var maxLookahead = Math.min(viewW, viewH) * 0.22; // ~140px

  if (aimDist > deadzone) {
    var t = clamp((aimDist - deadzone) / (maxAimDist - deadzone), 0, 1);
    var smoothT = t * t * (3 - 2 * t);
    var scale = (maxLookahead * smoothT) / aimDist;
    targetLookX = aimDx * scale;
    targetLookY = aimDy * scale;
  }

  var isRetracting = Math.hypot(targetLookX, targetLookY) < Math.hypot(camera.lookaheadX, camera.lookaheadY);
  var lambdaLook = isRetracting ? 12.0 : 5.5;
  var decayLook = Math.exp(-lambdaLook * dt);
  camera.lookaheadX = targetLookX + (camera.lookaheadX - targetLookX) * decayLook;
  camera.lookaheadY = targetLookY + (camera.lookaheadY - targetLookY) * decayLook;

  // 3. 視口邊界夾緊 (World Boundary Clamping)
  var halfW = viewW * 0.5;
  var halfH = viewH * 0.5;
  var shakePad = 22.0;

  var desiredCenterX = camera.x + camera.lookaheadX;
  var desiredCenterY = camera.y + camera.lookaheadY;

  camera.clampedX = clamp(desiredCenterX, halfW + shakePad, camera.worldW - halfW - shakePad);
  camera.clampedY = clamp(desiredCenterY, halfH + shakePad, camera.worldH - halfH - shakePad);

  // 4. 創傷度震屏計算 (Trauma Orthogonal Shake)
  if (!isReducedMotion() && camera.trauma > 0) {
    camera.trauma = Math.max(0, camera.trauma - dt * 1.35);
    var amp = camera.trauma * camera.trauma; // 平方能量衰減
    var time = (rt.renderTime || 0);
    camera.shakeX = amp * SHAKE_MAX_OFFSET * Math.sin(time * 31.0);
    camera.shakeY = amp * SHAKE_MAX_OFFSET * Math.cos(time * 27.0);
    camera.shakeAngle = amp * SHAKE_MAX_ANGLE * Math.sin(time * 23.0);
  } else {
    camera.trauma = 0;
    camera.shakeX = 0;
    camera.shakeY = 0;
    camera.shakeAngle = 0;
  }
}

// 0-GC 快速坐標轉換容器
var _SCRATCH_COORD = { x: 0, y: 0 };

export function screenToWorld(sx, sy) {
  var viewW = (rt.ui && rt.ui.width) || 960;
  var viewH = (rt.ui && rt.ui.height) || 640;
  var originX = viewW * 0.5;
  var originY = viewH * 0.5;

  // 扣除視口原點偏差與相機坐標
  var relX = sx - originX;
  var relY = sy - originY;

  // 若存在震角旋轉則進行逆旋轉
  if (camera.shakeAngle !== 0) {
    var cos = Math.cos(-camera.shakeAngle);
    var sin = Math.sin(-camera.shakeAngle);
    var rx = relX * cos - relY * sin;
    var ry = relX * sin + relY * cos;
    relX = rx;
    relY = ry;
  }

  _SCRATCH_COORD.x = relX + (camera.clampedX || camera.x);
  _SCRATCH_COORD.y = relY + (camera.clampedY || camera.y);
  return _SCRATCH_COORD;
}

export function worldToScreen(wx, wy) {
  var viewW = (rt.ui && rt.ui.width) || 960;
  var viewH = (rt.ui && rt.ui.height) || 640;
  var relX = wx - (camera.clampedX || camera.x);
  var relY = wy - (camera.clampedY || camera.y);

  if (camera.shakeAngle !== 0) {
    var cos = Math.cos(camera.shakeAngle);
    var sin = Math.sin(camera.shakeAngle);
    var rx = relX * cos - relY * sin;
    var ry = relX * sin + relY * cos;
    relX = rx;
    relY = ry;
  }

  _SCRATCH_COORD.x = relX + (viewW * 0.5) + camera.shakeX;
  _SCRATCH_COORD.y = relY + (viewH * 0.5) + camera.shakeY;
  return _SCRATCH_COORD;
}
```

---

## 8. 驗收標準與測試矩陣 (Verification & Acceptance Criteria)

| 驗收條目 (Item) | 驗收場景與操作 (Test Scenario) | 預期表現 (Acceptance Criterion) |
|---|---|---|
| **AC-01: 衝刺無眩暈跟隨** | 玩家連續觸發 3 次 Dash 衝刺 | 機甲位移平滑，相機自適應緊隨，機甲中心偏離視口不超過 12% 軟界限，背景無卡頓撕裂。 |
| **AC-02: 準星前瞻死區** | 滑鼠在機甲身邊 50px 範圍內小幅度圓周晃動 | 相機前瞻偏移保持為 0，視窗無任何晃動或暈眩反饋。 |
| **AC-03: 遠距射擊視野擴展** | 將滑鼠瞄準至螢幕外緣 | 相機沿瞄準軸向前推 $120\sim 140\text{px}$，射擊彈道下游可見度提升 $35\%$ 以上；滑鼠收回時 100ms 內平滑歸中。 |
| **AC-04: 邊界無漏底夾緊** | 機甲全速撞向大地圖西側邊界 ($x = 0$) | 相機平滑減速並精確停留在 $W_{view}/2$ 處，機甲游移至螢幕西側，四周絕無黑邊漏底。 |
| **AC-05: 震屏輸入逆解耦** | 首領泰坦引發特大震屏（Trauma = 1.0）期間進行點射 | 滑鼠瞄準之世界坐標不受相機震屏抖動影響，準星與地面目標鎖定極度穩定。 |
| **AC-06: 離屏指針邊界吸附** | 首領泰坦在螢幕外 600px 處 | 螢幕邊界顯示 P0 烈焰紅雙尖角 Chevron，距離數字隨走位即時更新，箭頭精準指向首領方向。 |
| **AC-07: 0-GC 記憶體與幀率** | 大世界滿載（80+ 敵人，雷達啟動，連續開火）執行 120 秒 | Profiler 中 `updateCamera` 與 `drawHud/drawRadar` 的記憶體分配為 0 B/frame，幀率穩定 60 FPS。 |
| **AC-08: 無障礙減動效** | 在設置中開啟「減少動效 (Reduced Motion)」 | 震屏角度與位移徹底關閉，自動切換為平滑邊緣受擊漸層紅光。 |

---
**DUST//REIGN Development Working Group**  
*Lead Camera & Viewport Architect: 頂級遊戲策劃師 1 號*
