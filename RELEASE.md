# DUST//REIGN 0.6.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.6.0`，對應 tag 為 `v0.6.0`。

DUST//REIGN v0.6.0 迎來次世代戰鬥動能、晶片融合、戰術副裝備、首領獨立部位破壞，以及改裝工坊與幽靈殘影競速等三大主軸系統演進。

---

## 一、三大系統演進軌道

### 軌道一：次世代戰鬥動能與程序音效合成（Combat Kinetics & Procedural Audio）
1. **2D 空間雜湊網格（Spatial Hash Grid）**：
   - 採用高效 TypedArray 實作 0 GC（Zero Garbage Collection）的執行期 2D 廣域碰撞篩選架構。
   - 大幅降低高波次蜂擁敵軍與密集彈道之雙重迴圈碰撞檢測開銷，確保百隻敵軍混戰中持續穩定 60 FPS。
2. **物理動態反饋與貼花**：
   - 主武器開火實作真實物理後座力衝量（Physical Recoil Impulses），射擊時機體伴隨微幅慣性後移。
   - 衝刺與急轉彎即時生成動態剎車拖痕（Dynamic Skid Decals / 接地印記），強化廢土機甲沉浸操縱感。
3. **Web Audio API 4 大程序音效合成**：
   - 全面移除外部音檔依賴，基於瀏覽器原生 Web Audio API 即時程序化計算音訊：
     - **FM 頻率調變跳彈（Ricochet）**：金屬擦彈產生高頻泛音衰減。
     - **雙峰帶通破片殼擊（Shell Casing）**：重裝破片擊中金屬裝甲之清脆鏗鏘聲。
     - **指數衰減低通爆破（Explosion Thud）**：巨幅砲擊與部位爆破震撼重低音。
     - **全域動態殘響（Ambient Reverb）**：配合廢土風暴模擬空間混響。

### 軌道二：8 組融合晶片、戰術輔助槽與 Titan 部位破壞（Augment Fusions, Tactical Slot & Titan Destruction）
1. **8 組轉化級晶片融合矩陣（Augment Fusions）**：
   - 新增 8 組專屬雙卡前置融合矩陣（`FUSION_CHIPS`）：微型集群彈頭（Cluster Micromissiles）、超導感應線圈（Superconductor）、動能震盪環（Kinetic Shockwave）、高溫電漿噴流（Plasma Jet）、奈米維修蟲巢（Nanite Hive）、聚變奇點核心（Singularity Core）、極限過載超頻（Overdrive Matrix）、護盾偏轉偏壓（Shield Deflection）。
   - 升級選卡介面以專屬金黃串流光暈（`.is-fusion-chip`）突顯呈現；滿足前置條件時，優先於升級第一槽位保證遞送。
2. **戰術輔助槽位（Tactical Auxiliary Equipment Slot）**：
   - 引入全新戰術輔助裝備：
     - **定點自控機槍塔（Automated Turret）**：具備自主索敵、追蹤旋轉與定點射擊 AI。
     - **熱誘餌（Decoy）**：發射高熱信標，引誘吸引周遭敵軍仇恨與砲火集中。
     - **微型奇點手雷（Micro-singularity Grenade）**：引爆後產生引力奇異點渦流，牽引並聚集附近敵群。
   - 多端全面適配：桌面鍵盤支援 `[E]` 或 `[F]` 鍵、手把控制器支援 `[X]` 或 `[LB]` 鍵、行動端觸控提供專屬 `#touchAux` 按鈕，並由 `#hudTacticalCdMask` SVG 環形遮罩即時同步冷卻時間。
3. **Titan 泰坦首領 4 大獨立部位破壞（4-Part Destructible Boss Components）**：
   - Titan 巨型首領結構重構為 4 個獨立可破壞部位：左迫擊砲（`left_cannon`）、右蜂巢召喚艙（`right_pod`）、後散熱鰭片（`radiator`）、下履帶裝甲（`treads`）。
   - 以局部旋轉坐標即時映射碰撞判定與部位血量；支援散熱鰭片閉合高額減傷（85%）與過熱敞開弱點（250% 暴擊傷害）機制。
   - 擊破部位觸發 0.08 秒打擊停頓（Hitstop）與金屬破片殉爆；破壞履帶使泰坦移動速度永久下降 40%。

### 軌道三：廢料改裝工坊、星級金庫、每日懸賞與 5Hz 幽靈殘影競速（Scrapyard Workshop & 5Hz Ghost Replay Metagame）
1. **廢料改裝工坊（Scrapyard Workshop）**：
   - 提供 6⚡ 電量負載上限與 3 大改裝插槽，允許玩家於局外配置雙面刃模組（如犧牲機動性提升全裝甲防禦、提升超溫極限換取極致射速）。
   - 消耗局內擊殺精英怪收集之精煉廢料解鎖與升級改裝模組。
2. **星級金庫（Star Vault）與每日懸賞（Daily Bounties）**：
   - 累積闖關星級解鎖金庫里程碑與機體榮譽塗裝徽章。
   - 基於玩家本地日期之 Date-Hash 演算法，每日生成 3 項懸賞作戰合約，完成後提供局內即時 Overdrive 爆發效果與結算加成。
3. **5Hz 輕量幽靈殘影競速引擎（Ghost Replay Engine）**：
   - 競速關卡採用 5Hz 採樣、Delta 差分與 Base64 高效壓縮（120 秒完整戰鬥軌跡僅佔用 2.26 KB，遠低於 3 KB 限制）。
   - Split-Timer 檢核點系統：戰鬥介面即時比對歷史最佳紀錄之分段秒差（綠色領先／紅色落後）。
   - 戰場直接渲染半透明動態幽靈機體，完美重現最速競速路線。
4. **天梯防護邊界（Leaderboard Integrity & Isolation）**：
   - 安裝改裝工坊模組出戰時，系統自動將該局標記為 Mod 模式，競速幽靈與純粹無改裝天梯嚴格分流。
   - 闖關模式（Campaign）與極限作戰（Hardcore）獨立於主榜單之外，不向主天梯 `dust-reign-score-v2` 提交成績，維護競爭公正性。

---

## 二、存檔相容性（Save Compatibility）

系統全面採用向下相容與防禦性容錯架構：

1. **新增儲存鍵**：
   - `dust-reign:workshop:v1`：儲存改裝工坊插槽、已解鎖模組與廢料儲存量。
   - `dust-reign:vault:v1`：儲存星級金庫已解鎖里程碑與徽章紀錄。
   - `dust-reign:bounties:v1`：儲存每日懸賞完成進度與領取狀態。
   - `dust-reign:ghost:v1:<stageId>`：儲存各關卡最佳幽靈殘影差分快照。
   - `dust-reign:campaign:v1`：儲存闖關模式章節與星級達成進度。
   - `dust-reign:hardcore:v1`：儲存極限作戰勛章與完成狀態。
2. **既有鍵相容性**：
   - `dust-reign:meta:v1`、`dust-reign:best-score:v2`、`dust-reign:daily:v1`、`dust-reign:tips:v1`、`dust_reign_lang` 結構保持不變。
   - 舊版 `dust-reign:best-score:v1` 與 `dustReignBestScore` 維持唯讀相容，開局畫面仍能正確解析 LEGACY BEST。
   - 若本機儲存包含損毀之 JSON 字串，解析層自動回退預設值並安全重寫，絕不阻斷遊戲執行。

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
| **發布 Staging 檢驗** | `node scripts/stage-release.mjs` | ✅ 通過 | 產出 `output/release/0.6.0/game` 與 `output/game` 白名單成品，嚴格隔離非發布檔案 |

---

## 五、平台交付規範與成品結構

- **規格標準**：嚴格遵循 [Playroom Platform main 分支](https://github.com/TommyLamm/playroom-platform) 開發標準與 Manifest Schema。
- **Manifest 版本**：`game.json` 版本號標示為 `0.6.0`。
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
