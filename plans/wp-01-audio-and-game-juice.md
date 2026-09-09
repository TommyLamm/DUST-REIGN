# DUST//REIGN 並行工單：Work Package 1 — 音訊與極致打擊感（Audio & Game Juice）

**責任模組**：原生 Web Audio 零依賴合成音效引擎、Hit-stop 微凍結、Trauma 屏幕震動、池化浮動傷害字（FCT）與雙離屏焦痕印章。  
**基準檔案**：`game.js`（1226 行）、`index.html`（232 行）、`styles.css`。  
**架構原則**：零外部素材、零 npm 依賴、60 FPS 效能預算、絕對防衝突安全合約。

---

## 1. 【防衝突合約與介面定義（Conflict-Free Contract）】

為支援 5 個 Subagent 在 `game.js` 中同時並行開發，WP1 提供以下高隔離度防衝突保證：

### 1.1 AudioEngine 模組獨立封裝設計
- **純閉包封裝**：在 `game.js` IIFE 內定義單例工廠 `createAudioEngine()`，內部完全封裝 `AudioContext`、節點拓撲、噪聲緩衝區及解鎖生命週期，不依賴任何全域狀態或外部變數。
- **環境自適應降級**：在非瀏覽器環境（如 `node --check game.js`）或不支援 Web Audio 的環境下，回傳完全等價的 Mock 物件（全方法為空函式），杜絕任何執行階段拋錯。

### 1.2 全域安全代理介面（Safe Audio Proxy Contract）
其他並行 agent（如武器子彈、敵人 AI、地圖爆炸桶）在觸發音效時，**嚴禁直接操作音訊節點**，統一透過全域代理介面呼叫：

```javascript
// 全域公開代理（掛載至 window.LunaGame.audio）
window.LunaGame.audio = {
  play: function (event, args) { /* safe dispatch */ },
  toggleMute: function () { /* returns boolean */ },
  isMuted: function () { /* returns boolean */ },
  unlock: function () { /* resume AudioContext */ }
};
```

**內部快捷函式**：在 `game.js` 內部提供輕量呼叫 `playSound(event, args)`：
```javascript
function playSound(event, args) {
  try {
    if (audio && typeof audio.play === 'function') {
      audio.play(event, args);
    }
  } catch (e) {
    // 防禦性靜默，絕不中斷遊戲主循環
  }
}
```

#### 事件呼叫合約矩陣（Event Contract Matrix）
| 事件名稱 `event` | 參數 `args` 結構 | 呼叫來源 Subagent | 安全回退行為 |
| :--- | :--- | :--- | :--- |
| `'shoot'` | `{ overdrive: boolean }` | WP2 (武器)、WP4 (機體) | 缺省為一般雷射音效 |
| `'hit'` | `{ crit: boolean }` | WP2 (子彈碰撞) | 缺省為一般撞擊音 |
| `'kill'` | `{ kind: 'crawler'\|'rusher'\|'brute'\|'elite'\|'boss'\|'barrel' }` | WP3 (敵人死亡)、WP5 (爆炸桶) | 缺省為一般爆炸音 |
| `'hurt'` | `{ hpRatio: number }` | WP3 (受擊)、WP5 (環境傷害) | 缺省為一般受傷電雜音 |
| `'dash'` | `{}` | WP4 (機體衝刺) | 氣流噴射音 |
| `'upgrade'`| `{}` | WP2 (升級卡牌選擇) | 科技琶音 |
| `'surge'`  | `{}` | 核心戰鬥 (賞金超頻) | 引擎渦輪增壓音 |
| `'death'`  | `{}` | 核心戰鬥 (玩家生命歸零) | 廣播信號斷崖雜訊 |
| *未知事件* | *任意* | 未來擴充事件 | 靜默忽略（No-op），零副作用 |

---

### 1.3 最小侵入式 Hit-stop 與 Trauma 震動管線

#### A. Hit-stop（微凍結）整合合約
- **狀態欄位宣告**：在 `makeState()`（第 89-139 行）中僅新增單一欄位：
  ```javascript
  hitStop: 0, // 秒數，非 0 時凍結實體模擬
  ```
- **公共觸發介面**：
  ```javascript
  function triggerHitStop(seconds) {
    if (!state) return;
    state.hitStop = Math.max(state.hitStop || 0, seconds || 0);
  }
  window.LunaGame.triggerHitStop = triggerHitStop;
  ```
- **主循環切入點**（`frame(timestamp)`，第 1056-1063 行）：
  ```javascript
  function frame(timestamp) {
    if (!started) return;
    var dt = lastTime ? Math.min(0.05, (timestamp - lastTime) / 1000) : 0;
    lastTime = timestamp;
    if (state && state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      draw(); // 保持繪製（維持畫面與殘留抖動），但跳過 update(dt)
      raf = window.requestAnimationFrame(frame);
      return;
    }
    update(dt);
    draw();
    raf = window.requestAnimationFrame(frame);
  }
  ```

#### B. Trauma 非線性震動管線（向後相容相加模型）
- **狀態欄位宣告**：在 `makeState()` 中新增 `trauma: 0`。
- **公共觸發介面**：
  ```javascript
  function addTrauma(amount) {
    if (!state) return;
    state.trauma = clamp((state.trauma || 0) + (amount || 0), 0, 1);
  }
  window.LunaGame.addTrauma = addTrauma;
  ```
- **數學模型與雙向相容繪製**（`draw()`，第 992-1028 行）：
  ```javascript
  var traumaShake = state.trauma ? (state.trauma * state.trauma) : 0;
  var totalShake = (traumaShake * 22) + (state.shake || 0);
  var shakeX = totalShake ? (Math.random() - 0.5) * 2 * totalShake : 0;
  var shakeY = totalShake ? (Math.random() - 0.5) * 2 * totalShake : 0;
  var shakeAngle = traumaShake ? (Math.random() - 0.5) * 2 * (traumaShake * 0.035) : 0;

  ctx.save();
  ctx.translate(ui.width / 2 + shakeX, ui.height / 2 + shakeY);
  if (shakeAngle) ctx.rotate(shakeAngle);
  ctx.translate(-ui.width / 2, -ui.height / 2);
  ```

---

## 2. 【原子任務拆解（Atomic Tasks）】

### Task 1.1：AudioContext 生命週期、手勢解鎖與白噪聲生成器
- **責任**：實現原生音訊管線骨幹與瀏覽器 Autoplay 規範解鎖。
- **壓縮器核心參數**：`threshold: -12 dB`, `knee: 10 dB`, `ratio: 8`, `attack: 0.003s`, `release: 0.15s`。
- **預烘焙白噪聲**：在初始化時建立 1 秒循環單聲道 Buffer：`ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)`，填充 `(Math.random() * 2 - 1)`。
- **靜音聯動**：綁定頂部 DOM `#commsStatus`（點擊切換 `OPEN` / `MUTED`），支援按鍵 `M` 快速靜音。

### Task 1.2：8 大核心程序合成音效函式實作
- **8 大音效**：Laser Shot (`playLaser`), Punchy Hit (`playHit`), Enemy Death (`playExplosion`), Player Hurt/Heartbeat (`playHurt`), Dash Impulse (`playDash`), Upgrade Arpeggio (`playUpgrade`), Overdrive Surge (`playSurge`), Signal Lost Death (`playDeath`)。

### Task 1.3：Hit-stop 微凍結與 Trauma 震動管線接入
- 開火、命中、衝刺、擊殺 Crawler/Brute/Elite、受創、陣亡各事件注入相應的 `triggerHitStop()` 與 `addTrauma()`。

### Task 1.4：FCT 傷害跳字池化物件與 Canvas 雙離屏印章殘骸
- **FCT 靜態物件池（Fixed 50 Pool）**：預分配 50 筆靜態物件池，0 垃圾回收壓力。
- **雙離屏焦痕印章**：`ui.scorchCanvas` 烙印殘骸，背景單次 `drawImage`，維持 $O(1)$ 滿幀渲染。

---

## 3. 【精確修改清單與驗證命令】

### 3.1 `game.js` 精確修改行號清單

| 目標區域 | 目前行號 | 修改內容與接入細節 |
| :--- | :--- | :--- |
| **模組變數區** | 第 33-45 行 | 宣告 `var audio = null;`、`var fctPool = [];`、`var scorchWashTimer = 0;`。 |
| **狀態建構 `makeState`** | 第 89-139 行 | 狀態物件新增 `hitStop: 0, trauma: 0,`。 |
| **DOM 整合 `setupDom`** | 第 174-282 行 | 建立離屏畫布：`var scorchCanvas = document.createElement('canvas');` 並掛入 `ui`。 |
| **畫面縮放 `resize`** | 第 300-318 行 | 同步縮放 `scorchCanvas` 寬高與設定 DPR 轉換矩陣。 |
| **輸入綁定 `bindInput`** | 第 327-370 行 | 在手勢中加入 `if (audio) audio.unlock();`；監聽鍵盤 `M` 切換靜音。 |
| **射擊邏輯 `shoot`** | 第 450-485 行 | 呼叫 `playSound('shoot', ...); addTrauma(...);`。 |
| **衝刺邏輯 `dash`** | 第 487-512 行 | 呼叫 `playSound('dash'); addTrauma(0.18);`。 |
| **擊殺敵軍 `killEnemy`** | 第 570-598 行 | 觸發死亡音效、`stampCorpse(...)`、`triggerHitStop(...)`。 |
| **主更新迴圈 `update`** | 第 606-752 行 | 衰減 trauma、子彈命中呼叫 `playSound('hit')` 與 `spawnFct`、更新 FCT 池。 |
| **主繪製流程 `draw`** | 第 992-1028 行| 替換為 Trauma 平方 + 旋轉多軸管線；繪製 FCT。 |
| **幀循環 `frame`** | 第 1056-1063 行| 插入 `hitStop` 微凍結檢查。 |
| **自我檢查 `selfCheck`** | 第 1103-1207 行| 擴展 hitStop、trauma、FCT 池以及 safe audio proxy 的綠燈斷言。 |

---

### 3.2 驗收命令

```bash
node --check game.js
```
瀏覽器控制台執行：
```javascript
window.LunaGame.selfCheck();
```
*預期輸出*：`{ ok: true, audio: 'procedural synth + safe proxy', juice: 'hitStop + trauma + fct + scorch', ... }`。
