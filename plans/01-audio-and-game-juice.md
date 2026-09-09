# 計畫 01：視聽回饋與打擊感系統設計（Audio & Game Juice Technical Spec）

> **模組責任**：為 DUST//REIGN 提供零依賴原生 Web Audio 合成音效引擎、Hit-stop 打擊微凍結、Trauma 非線性屏幕震動模型、池化浮動傷害文字（FCT）與雙離屏畫布殘骸印章系統。  
> **關聯檔案**：[game.js](file:///F:/Desktop/Luna/game.js)、[index.html](file:///F:/Desktop/Luna/index.html)、[styles.css](file:///F:/Desktop/Luna/styles.css)

---

## 1. 原生 Web Audio 零依賴程序音效引擎

### 1.1 音效管線拓撲圖（Audio Bus Topology）

整個音效架構採用單一 `AudioContext` 驅動，後端串接非線性動態壓縮器（`DynamicsCompressorNode`），防止多重爆炸或急速連射時破音，並形成大爆炸時微弱抽吸背景音的側鏈衝擊感：

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Procedural Sound Sources                                               │
│                                                                        │
│  OscillatorNode ──┐                                                    │
│  (Saw/Square/Sin) ├──> BiquadFilterNode ──> GainNode (ADSR Envelope)   │
│                   │    (Lowpass/Bandpass)        │                     │
│  NoiseBufferNode ─┘                              │                     │
│  (1s Pre-baked White Noise)                      ▼                     │
│                                           ┌──────────────┐             │
│                                           │  SFX Master  │             │
│                                           │  Gain Node   │             │
│                                           └──────┬───────┘             │
│                                                  │                     │
│                                                  ▼                     │
│                                           ┌──────────────┐             │
│                                           │ Dynamics     │ (Soft-knee  │
│                                           │ Compressor   │  Limiter)   │
│                                           └──────┬───────┘             │
│                                                  │                     │
│                                                  ▼                     │
│                                            AudioContext                │
│                                            .destination (Hardware Out) │
└────────────────────────────────────────────────────────────────────────┘
```

- **DynamicsCompressor 參數**：
  - `threshold = -12 dB`
  - `knee = 10 dB`
  - `ratio = 8`
  - `attack = 0.003s`
  - `release = 0.15s`

---

### 1.2 用戶手勢解鎖與安全容錯

現代瀏覽器限制音訊自動播放。本系統在使用者首次點擊或按鍵（`pointerdown`, `keydown`, `beginRun()`）時無感喚醒：
1. **靜音聯動**：提供 `isMuted` 旗標，可與 HUD 頂部 `COMMS: OPEN / MUTED` 互動。
2. **防禦性降級**：所有發聲函式均具備防護檢查 `if (!ctx || ctx.state !== 'running' || muted) return;`。在 Node.js 語法檢查（`node --check game.js`）或純無聲環境中完全無副作用，零拋錯。

---

### 1.3 核心音效參數配方表

| 音效標籤 | 核心波形與源 | 濾波器（Filter） | 頻率包絡（Freq Pitch Curve） | 振幅包絡（Gain ADSR） | 廢土打擊特色調優 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. 射擊 (Laser / Pew)** | Sawtooth (鋸齒波) | Lowpass 2800Hz, Q=3 | 0.00s: 880Hz → 指數驟降至 0.08s: 110Hz | A: 0.001s (瞬態)<br>D: 0.08s (衰減)<br>S: 0, R: 0.01s | 尖銳機械雷射感；Overdrive 狀態下頻率提升為 1350Hz → 180Hz。 |
| **2. 命中敵人 (Punchy Hit)** | Sine (正弦) + 3ms Noise Click | Bandpass 450Hz, Q=1.5 | 0.00s: 260Hz → 0.04s: 55Hz (低頻金屬頓擊) | A: 0.001s<br>D: 0.05s | 噪聲 Click 提供子彈擊穿外殼的咬合瞬態，隨後的下潛波產生打擊肉感。 |
| **3. 敵人死亡/爆炸** | White Noise Buffer + Sub-Bass Sine | Lowpass 動態掃頻: 1200Hz → 0.4s: 60Hz | Sub-Sine: 0.00s: 90Hz → 0.35s: 30Hz | Noise Gain: A: 0.005s, D: 0.45s<br>Sub-Sine Gain: A: 0.002s, D: 0.35s | 分級縮放：Crawler (0.25s), Brute (0.5s), Elite (0.8s, 帶次低音雙重震顫)。 |
| **4. 玩家受傷 / 心跳** | 受傷: Sawtooth<br>心跳: Low-sine (45Hz) | 受傷: Bandpass 600Hz<br>心跳: Lowpass 90Hz | 受傷: 320Hz → 160Hz 快速下行<br>心跳: 雙峰脈衝 "lub-dub" (55Hz / 45Hz) | 受傷: A: 0.002s, D: 0.15s<br>心跳: 兩段式脈衝 (間隔 0.12s) | 故障電子雜音；血量低於 30% 時，心跳音效隨失血加劇提高頻率。 |
| **5. Dash 衝刺脈衝** | White Noise + Low Sine | Bandpass 掃頻: 220Hz → 1900Hz → 300Hz | Sub-drop: 140Hz → 40Hz | Noise: A: 0.03s, D: 0.22s<br>Sub: 落點觸發 A: 0.002s, D: 0.24s | 推進氣流呼嘯（Whoosh）接落點能量環炸開的次低音（Sub-drop）。 |
| **6. 升級三選一** | Sine (複音琶音) | Lowpass 3500Hz | 科技大三和弦連續四音階：<br>C5 (523Hz) → E5 (659Hz) → G5 (784Hz) → C6 (1046Hz) | 音符間隔 0.045s；每個音符 A: 0.002s, D: 0.14s | 復古終端機啟動與高科技組件解鎖的清脆琶音。 |
| **7. Overdrive / Surge** | 雙鋸齒波 (85Hz & 88Hz) | Peaking EQ 1200Hz (+6dB) | 頻率向上爬升：<br>0.00s: 85Hz → 0.5s 升至 220Hz | A: 0.05s, 穩態維持 0.5s | 引擎渦輪增壓啟動，雙波微失調產生 3Hz 的 Phasing 拍頻。 |
| **8. 死亡信號中斷** | White Noise + 440Hz 載波驟降 | Highpass 500Hz + 驟降斷崖 | 440Hz 驟降至 0Hz，伴隨間歇性噪聲雜訊 | A: 0.001s, 0.45s 內徹底斷音 | 舊世界老式軍用無線電被突然切斷電源的靜電收尾。 |

---

## 2. 打擊感增強（Game Juice）技術細節

### 2.1 Hit-stop（打擊微凍結）機制

- **原理**：當重型敵人（`brute`）或精英（`elite`）被擊殺時，凍結模擬世界 20~70 毫秒，此時略過 `update(dt)` 物理前進，但保持 `draw()`，大腦會將短暫的感官停頓解讀為「物體具有極高質量與堅固阻力」。
- **事件凍結矩陣**：
  - 普通暴擊 / Overdrive 命中：`20 ms` (~1 幀)
  - Brute 擊殺 / Dash 重創敵群：`45 ms` (~2~3 幀)
  - Elite 擊殺 / Bounty 達標：`65 ms` (~4 幀)
- **代碼插槽**：
  ```javascript
  // 在 state 物件中新增 state.hitStop = 0
  function triggerHitStop(seconds) {
    if (!state) return;
    state.hitStop = Math.max(state.hitStop, seconds);
  }
  // 在 frame() 循環中：
  if (state && state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - dt);
    draw(); // 保持繪製，甚至允許極高頻微抖動
    raf = window.requestAnimationFrame(frame);
    return;
  }
  ```

---

### 2.2 浮動傷害數字（Floating Combat Text / FCT）

- **物件池預分配**：固定 50 筆靜態物件池（`createFctPool()`），杜絕垃圾回收微卡頓。
- **物理與渲染**：
  - 初速度：`vy = -80 ~ -110 px/s`（向上彈跳），`gravity = 140 px/s²`。
  - 存活時間：0.65 秒。前 0.1 秒彈跳放大（`scale = 1.3 -> 1.0`），後 0.25 秒平滑淡出。
  - 配色：常規傷害 `#e9d9b9`（11px）、暴擊/Overdrive `#f5c76e`（14px 帶 `!` 標記）、回血 `#75d1b0`（顯示 `+18 HP`）。

---

### 2.3 雙離屏畫布殘骸印章系統（Offscreen Scorch Stamp）

- **效能問題**：若每隻陣亡敵人都在記憶體中保留殘骸物件並逐幀遍歷，擊殺數百隻後會造成嚴重掉幀。
- **解決方案**：
  1. 建立尺寸相同的不可見離屏畫布 `scorchCanvas`。
  2. 敵人死亡瞬間，**只烙印一次（Stamp）** 彈坑焦痕與 2~4 片金屬碎片到離屏畫布上。
  3. 主渲染迴圈 `drawBackground()` 僅需呼叫單次 `ctx.drawImage(scorchCanvas, 0, 0)`，渲染成本永恆保持為 $O(1)$！
  4. 每隔 15 秒在離屏畫布上鋪一層極微弱的透明底色（`rgba(18, 19, 21, 0.04)`），使老舊彈坑如被紅黃風沙覆蓋般緩慢掩埋淡化。

---

### 2.4 非線性 Trauma 屏幕震動模型

- **數學公式**：$Shake = Trauma^2$。
  - 普通射擊加小量 $Trauma = 0.06 \to Shake = 0.0036$（極細膩微震，完全不晃眼）。
  - 精英爆炸加大量 $Trauma = 0.8 \to Shake = 0.64$（強烈地動山搖）。
- **多軸偏移 + 微旋轉**：
  $$\Delta X = \text{maxOffset} \times Shake \times (\text{rand} - 0.5) \times 2$$
  $$\Delta Y = \text{maxOffset} \times Shake \times (\text{rand} - 0.5) \times 2$$
  $$\text{Angle} = \text{maxAngle} \times Shake \times (\text{rand} - 0.5) \times 2 \quad (\text{約 } 1.3^\circ)$$

---

## 3. 整合與驗收清單

1. **語法與相容性**：
   - 執行 `node --check game.js` 零語法錯誤。
   - `window.LunaGame.selfCheck()` 返回完整通過，無未定義參照。
2. **手勢解鎖驗收**：
   - 進入頁面在未操作前不拋出 AudioContext 警告。
   - 點擊「ENTER THE DUST」或按下 WASD/Space 時無縫播放聲音。
3. **戰鬥打擊手感**：
   - 開火有俐落的機械音與微後座力；
   - 擊殺 Brute/Elite 時有清晰的 40~65ms 阻滯感（Hit-stop）與巨型爆炸次低音；
   - 傷害數字清晰彈出且 60 FPS 滿幀無掉幀。
