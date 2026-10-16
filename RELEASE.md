# DUST//REIGN 0.7.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.7.0`，對應 tag 為 `v0.7.0`。

DUST//REIGN v0.7.0 實施了全方位的**視覺清晰度、防保護色偽裝與戰鬥高辨識度重構（Visual Clarity, Anti-Camouflage, and Combat Readability Overhaul）**。本版本透過負空間地表色彩法則、雙層反差實體描邊、敵我隔離三明治彈道、粒子視線保護圈、街機立體戰利品與滯後血條等三大支柱，徹底解決高波次百隻敵軍混戰中視覺過載與敵我混淆難題，並維持純原生 0-GC 60 FPS 巔峰流暢度。

---

## 一、視覺清晰度三大支柱

### 支柱一：負空間地表色彩法則、地表減噪與三階咬合接地陰影（Negative-Space Floor, Denoising & 3-Tier Contact Shadows）
1. **負空間地表色彩法則（Negative-Space Floor Palette）**：
   - 重塑黃昏（Dusk）、赤鏽（Rust）與夜幕（Night）三大廢土地形生物群系的地表色彩階梯。
   - 將地面明度嚴格限縮於低明度暗區（$L^* \in [4.6\%, 13.5\%]$），根除原先高波次亮土黃色漂白問題，保證實體與特效明暗反差階差 $\ge 70\%$。
2. **地表減噪手術（Terrain Denoising）**：
   - 抹除 50% 全幅漂白混合層，確保背景完全退居負空間。
   - 沙丘條紋頻率優化（12px 跨距、0.18 不透明度），消除橫向高對比視覺干擾。
   - 裝飾性碎石與金屬廢料數量減量 60% 並全面去除刺眼高光，杜絕誤判為爆蟲（Swarmer）或地雷之假警報。
   - 戰術座標網格線弱化為暗色輔助標線，提供方位參照而不搶奪注意力。
3. **三階咬合接地接觸陰影（3-Tier Contact Shadows）**：
   - **Tier 1 Core AO**：70% 深度高密度核心環境光遮蔽咬合，精確鎖定實體接地面接觸點。
   - **Tier 2 Penumbra**：135% 柔邊擴散半影柔光，營造自然厚重景深。
   - **Tier 3 Z-Elevation**：隨實體垂直高度動態縮放半徑與 X/Y 位移投影，實現立體浮空反饋。
4. **照度抬升門檻保護（Lift Floor Hardening）**：
   - Lightmap 照度抬升門檻提高至 0.74，防止在乘法混合階段壓碎未照明暗區中實體的金屬反光與輪廓。

### 支柱二：實體雙層反差描邊、玩家四大防迷失錨點與三層三明治敵彈（Dual Silhouettes, Player Anchors & Sandwich Projectiles）
1. **全敵型雙層反差描邊（Dual-Outline Silhouettes）**：
   - 覆蓋全部 15 種常規敵型與 Titan 4 大獨立部位，實裝「外層 3.8px 純黑阻光護盾＋內層 1.6px 鏡面輪廓高光」。
   - 在任何生物群系地形、光影照度與密集特效中均能一眼秒辨識剪影，徹底消除背景保護色偽裝。
2. **玩家四大防迷失錨點（Player Grounding & Heading Anchors）**：
   - **接地微型導航基座環（Nav Ring）**：高對比度底座，於千軍萬馬中瞬間定位玩家機體位置。
   - **開火朝向引導鏢（Aim Chevron）**：清晰標記開火向量與面朝方位，盲操更精準。
   - **雙層座艙反應核（Dual Optical Core）**：中央核心常駐高亮度視覺焦點。
   - **砲管高光脊線（Barrel Highlight Ridge）**：武器指向一目了然。
3. **敵我色譜嚴格隔離與三層三明治敵彈（Faction Isolation & 3-Tier Visibility Sandwich）**：
   - 徹底剷除敵彈回退青綠色（`#75d1b0`）之歷史漏洞；色譜嚴格隔離：玩家專用冷青藍（`#38ef7d`／`#00f5d4`）與升級金色，敵軍陣營專用高警戒洋紅（Magenta）、橙紅（Red-Orange）、檸檬綠（Toxic Lime）與暗紫。
   - 敵彈構造採用外層純黑阻光護盾（Occlusion Halo）＋中層霓虹警戒光環（Neon Shell）＋內層純白光核（Incandescent Core），形成 92% 灰度階差。
   - 特殊預警線路：Rusher 跑馬燈衝撞導軌（Animated Zebra Vector Rail）、迫擊砲黑白斑馬反相預警圈（收縮透光度 $\le 0.22$，最後 0.2s 觸發 20Hz 雙色暴閃）。

### 支柱三：粒子消音保護圈、街機立體戰利品與 0.22s 受擊滯後血條（Particle Alpha Culling, 3D Arcade Loot & Ghost HP Bars）
1. **粒子消音保護圈（120px Radial Sight Protection & Priority Architecture）**：
   - 以玩家機甲為核心建立 120px 徑向視線保護圈，煙霧、破片與火花粒子依距離進行平滑漸層 Alpha Culling，杜絕近身黑煙貼臉致盲。
   - 爆炸煙霧壽命減半（0.9s $\to$ 0.45s），快速釋放戰場可視度。
   - 3-Tier 粒子資訊優先級架構與分級粒子池預算（HIGH 600 / MEDIUM 350 / LOW 180），確保百隻敵軍混戰中持續穩定 60 FPS。
2. **街機立體戰利品（3D Arcade Loot Presentation）**：
   - **Scrap 廢料**：接地陰影＋3.8px 垂直正弦浮空（Sine Bobbing）＋12px 脈衝全息光環與週期性十字星芒閃爍。
   - **Repair 急救箱**：32px 垂直通天救命光柱（Emergency Beacon Beam）＋純白急救十字圖示，瀕血時一眼索驥。
   - **Overclock 核心**：升騰金黃能量柱，辨識度無可匹敵。
3. **4.5px 雙層黑邊傷害數字與滯後血條（Combat Readability & Ghost Bars）**：
   - 傷害數字：4.5px 雙層純黑防漂白描邊，暴擊金色大字帶 Pop-in 縮放回彈動效。
   - 怪物血條：升級至 6px 深黑底襯與 25/50/75% 四分位刻度線，實裝 0.22 秒受擊滯後白條（Damage Ghost Bar），直觀反饋瞬間爆發傷害量。
   - 首領部位破壞狀態膠囊：標記被破壞部位刪除線，過熱散熱器弱點鎖定瞄準光環。

---

## 二、存檔相容性（Save Compatibility）

系統全面採用向下相容與防禦性容錯架構：

1. **視覺專用狀態隔離**：
   - 所有實體視覺暫存（包括雙層描邊快取、Ghost Bar 滯後秒數、受擊閃白等）嚴格收錄於 `entity.fx` 惰性容器，完全不污染 `rt.state` 玩法邏輯與單局資料。
2. **既有存檔金鑰完全相容**：
   - `dust-reign:workshop:v1`、`dust-reign:vault:v1`、`dust-reign:bounties:v1`、`dust-reign:ghost:v1:<stageId>`、`dust-reign:campaign:v1`、`dust-reign:hardcore:v1`、`dust-reign:meta:v1`、`dust-reign:best-score:v2`、`dust-reign:daily:v1`、`dust-reign:tips:v1` 等所有儲存鍵維持 100% 格式無縫相容。
   - 舊版 `dust-reign:best-score:v1` 與 `dustReignBestScore` 維持唯讀相容。

---

## 三、天梯與排行榜規範

- **排行榜 ID**：`dust-reign-score-v2`
- **排序方式**：降序（`desc`）
- **單位**：分
- **有效範圍**：0 至 9007199254740991
- **提交邊界**：成績僅限標準模式（Standard）與每日挑戰（Daily Challenge）在無改裝模組（Unmodded）環境下由 Playroom SDK 提交。闖關、極限作戰及 Mod 競速皆受到隔離保護。

---

## 四、全套驗收套件通過狀態

2026-10-16 於 Node v24.19.0 環境下完成全部 5 大驗收套件之完整檢驗：

| 驗收套件 | 執行指令 | 測試結果 | 關鍵驗收指標 |
| :--- | :--- | :--- | :--- |
| **無 DOM 核心自檢** | `node scripts/self-check.mjs` | ✅ 通過 (`ok: true`) | 26 張升級卡、8 組融合晶片、4 種動態詞綴、Titan 雙側部位破壞、2D 空間雜湊網格 0 GC 效能驗證 |
| **多語言本地化套件** | `node scripts/test-i18n-verification.mjs` | ✅ 通過 (4/4 階段) | 中英切換持久化、26 張升級卡與 8 組融合卡全量雙語對照、DOM 靜態 HTML 同步、動態文字與評級格式 |
| **闖關與極限模式套件** | `node scripts/test-campaign-modes.mjs` | ✅ 通過 (全 3 階段) | 關卡選擇器、星級進度條、作戰簡報、輪播導航、模式切換無狀態殘留 |
| **局外改裝與競速套件** | `node scripts/test-track3-metagame.mjs` | ✅ 通過 (4/4 階段) | 工坊 6⚡ 負載與插槽裝配、天梯隔離防護、星級金庫與每日懸賞、5Hz 幽靈差分壓縮 (120s 僅 2.26 KB < 3 KB 限制) 與 Split-Timer |
| **真實瀏覽器全流程 E2E** | `node scripts/test-browser-gameplay.mjs` | ✅ 通過 (40/40 項) | 零未捕捉異常、零控制台報錯；涵蓋開局配裝、戰鬥動能、全按鍵與戰術裝備部署、升級選卡/重抽/放逐/跳過、暫停分頁、死亡結算與 Run It Back 重開 |
| **語法嚴格校驗** | `node --check` | ✅ 通過 (全量模組) | `src/**/*.js`（79+ 個檔案）、`playroom-sdk.js`、`scripts/*.mjs` 全部通過語法檢驗 |
| **發布 Staging 檢驗** | `node scripts/stage-release.mjs` | ✅ 通過 | 產出 `output/release/0.7.0/game` 與 `output/game` 白名單成品，嚴格隔離非發布檔案 |

---

## 五、平台交付規範與成品結構

- **規格標準**：嚴格遵循 [Playroom Platform main 分支](https://github.com/TommyLamm/playroom-platform) 開發標準與 Manifest Schema。
- **Manifest 版本**：`game.json` 版本號標示為 `0.7.0`。
- **發布 ZIP 結構**：根目錄收錄 `game.json`、`index.html`、`playroom-sdk.js`、`cover.png`，以及完整 `src/` 與 `css/`；嚴格排除 `scripts/`、`docs/`、`output/`、`.playwright-cli/` 等開發相依資源。
- **純原生架構**：零外部 npm 依賴、無編譯打包步驟、純原生 ES Modules 與 Canvas 2D。

---

## 六、重現打包與發布流程

於遊戲專案根目錄執行 Staging 收集：

```sh
node scripts/stage-release.mjs
```

發布工作流程（`.github/workflows/release.yml`）於推播 `v*` tag 時自動啟動，依序完成語法檢查、自檢、版本一致性驗證、拉取最新 Playroom 工具鏈打包驗證 ZIP，並自動發布正式 GitHub Release：

```sh
gh release create "$RELEASE_TAG" "$GAME_ZIP" --repo "$RELEASE_REPO" --verify-tag --title "DUST//REIGN $RELEASE_TAG" --notes-file RELEASE.md
```
