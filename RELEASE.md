# DUST//REIGN 0.11.0

遊戲 ID `dust-reign`；本文件描述的交付版本為 `0.11.0`，對應 tag 為 `v0.11.0`。

DUST//REIGN v0.11.0 全面完成了**第四戰區「晶化深淵」戰役擴展、COLOSSUS 巨神重砲與戰術硬光屏障、深淵晶獸三部位破壞史詩首領、crystal 晶化生態系 0-GC 渲染管線與兩款戰術 POI（Crystalline Abyss Sector 04, Colossus Railgun, Aegis Barrier, Abyssal Behemoth Multi-Part Boss, Crystal Biome & Tactical POIs）**。本版本在嚴格恪守純原生 Vanilla ES Modules + HTML5 Canvas 2D + Web Audio API 零外部 npm 依賴與 0-GC 記憶體合約架構下，將戰役關卡擴展至 20 關，導入物資推車護送與地脈超載防線兩大遊戲模式適配器，並透過完全解耦的註冊表架構為遊戲注入了極具打擊感與手感的重砲武器、戰術掩體、具備部位破壞的二階段狂暴 Boss 與全新流派構築卡牌。全套 11 大自動化驗證矩陣（包含 40/40 全流程真實無頭 Chrome CDP 驗收）與 Playroom Platform 官方固定驗收工具 100% 通過。

---

## 一、版本四大支柱革新與量化技術指標

### 支柱一：第四戰區「晶化深淵」與雙模式適配器（Campaign Sector 04 & Mode Adapters）
1. **Sector 04 晶化深淵（Crystalline Abyss）**：
   - 戰區代號 `SEC-04`，生態代碼 `crystal`，解鎖門檻 `reqStars: 32`。
   - 擴充 Stage 16 至 Stage 20（`stage_4_1` ~ `stage_4_5`）共 5 個完整關卡，戰役總關卡數達到 20 關。
2. **全新物資推車護送模式適配器（`PayloadEscortSubsystem`）**：
   - 採集車具備 160px 動力光圈，玩家處於光圈內時驅動載具前進並獲得 15% 友方減傷力場護盾；
   - 玩家離開光圈動力在 3.5s 內平滑衰減停煞，載具血量為 0 判定失敗，抵達終點判定勝利。
3. **全新地脈超載防線模式適配器（`CoreOverloadSubsystem`）**：
   - 模擬高壓地脈核心熱量演算（每隻 Warden 精英怪加速充能）；玩家駐留核心區域散熱降溫；
   - 動態追蹤 `peakRatio` 最高峰值過載比例以判定星級；超載達 100% 判定失敗，堅持至時間結束判定勝利。
4. **宣告式星級條件引擎（Declarative Star Criteria AST）**：
   - 支援 `all`, `any`, `waves_cleared`, `time_under`, `hp_ratio`, `combo`, `beacon_hp_ratio`, `beacon_stay_time`, `overload_peak_under`, `just_dashes`, `damage_taken_under` 等原子規則。

### 支柱二：COLOSSUS 巨神重砲、硬光屏障與 Card Hook 總線（Arsenal & Tactics Expansion）
1. **第 5 把主武器：COLOSSUS 巨神重型粒子軌道砲 (`colossus`)**：
   - 二段蓄力機制：0.85s 蓄壓，輕觸發射等離子彈，長按完全蓄力釋放貫穿全場的粒子重軌道束（穿透力 99，直擊傷害 125+）；
   - 強力力學反衝：`Impulse: 620, Lambda: 7.0`，反向推擠機體坐標，可作為後衝位移機動手段；
   - 三階精通：`superconducting`（蓄力 -20% / 反衝 +25%）、`disintegration`（穿透破片衝擊波）、`graviton`（引力坍縮奇點）。
2. **第 4 款戰術裝備：HARD-LIGHT AEGIS BARRIER 戰術硬光屏障 (`aegis-barrier`)**：
   - CD 15s，持續 5.0s，基礎耐久 240 HP；
   - 正面 130° 弧形攔截所有敵方常規子彈；友軍子彈穿透獲得 **折射增幅（傷害 +30%、速度 +200 px/s、穿透 +1、青藍光暈）**；屏障碎裂時釋放 90px 震波。
3. **Card Hook Bus 擴展與 3 張全新聯動卡牌**：
   - 擴充 `onCrit`、`onShieldBreak`、`onTacticalUsed` 核心事件通道；
   - 新增 3 張卡牌：`superconductive-resonance`（暴擊連鎖電弧）、`tactical-overdrive-coil`（戰術重置衝刺超頻）、`concussion-breaker`（破盾破部位大暈眩），升級卡牌庫總量擴展至 29 張。

### 支柱三：深淵晶獸三部位破壞史詩 Boss 與戰術特種兵（Bestiary & Boss Reshaping）
1. **史詩首領：深淵晶獸 ABYSSAL BEHEMOTH (`behemoth`)**：
   - 基礎 8,800 HP，由 `boss-parts.js` 託管 3 個獨立破壞部位：
     - `behemoth_horn`（晶化角盾）：1800 HP，正面 60% 減傷；破壞後引發 2.2s EMP 大硬直並永久失去減傷；
     - `behemoth_gland`（腐蝕酸腺）：1400 HP，噴射蓄力時弱點暴露（2.5x 暴擊）；破壞後封印酸液迫擊砲並引發 10% 反噬傷害；
     - `behemoth_tail`（震盪晶尾）：1200 HP，動態擺尾防禦；破壞後封印甩尾晶刺，轉向角速度 -35%，移速 -25%；
   - **Phase 2 狂暴**：50% HP 觸發 0.1s hitstop、全屏震動、紫光衝擊環擊退玩家、胸腹心核常駐 1.6x 弱點暴露、每 2.4s 釋放 16 向螺旋穿甲晶彈。
2. **兩款全新戰術兵種**：
   - `prowler`（虛空伏擊者）：相位巡弋（70% 減傷）-> 0.35s 紫斑馬預警線 -> 瞬移突刺 -> 0.6s 力竭停頓虛弱窗口；
   - `bulwark`（重裝禦衛）：正面 140° 護盾 100% 偏折常規子彈；每 3s 釋放 130px 團隊 35% 減傷光環；承傷 350 點或 EMP 破盾癱瘓 4s。

### 支柱四：crystal 晶化地貌渲染管線與戰術 POI（World & Biome Expansion）
1. **新生態系：crystal（晶化地帶）**：
   - 0-GC 離線烘焙管線：`paintCrystalCracks`（60°/120° 解理裂縫與微晶節點）、`paintCrystalLattice`（菱角拓撲導引線）、`paintCrystalGlints`（十字反光星芒）；
   - 大氣微粒與離子流：冷光青藍微晶粒子與紫紅暴風粒子，大氣深冷晶霧與折射能量條帶。
2. **兩款全新戰術 POI**：
   - `crystal_resonance_pylon`（晶能共鳴超載柱）：2.2s 充能，480px 晶化超載衝擊環，400 傷害破盾暈眩 3.5s，汽化 400px 內敵彈，+2 穿透超頻，45 廢料；
   - `crystal_siphon`（晶化精煉站）：射速 +35%、移速 +20%、5 廢料/s，熱載荷每秒 +10% 招潮，滿載熔毀爆發 60 廢料。

---

## 二、架構與 0-GC 契約保證

1. **空間網格無延遲檢索**：
   - 新增 POI 範圍衝擊與光環作用完全介接 `spatial-grid.js` 之 `queryGridCallback` 與 `queryEnemyBulletGridCallback`，消除 $O(N)$ 遍歷。
2. **部位碰撞單幀三角快取**：
   - `boss-parts.js` 的 `updateEnemyPartCache` 每幀只計算一次三角變換矩陣，所有子彈共享快取，避免百顆子彈引發重複三角函數運算。
3. **離線烘焙紋理平鋪**：
   - 晶化地貌紋理一次性烘焙至 1024px 圖塊，執行期透過 `createPattern` 渲染，零動態記憶體浪費。

---

## 三、自動化驗收矩陣通過狀態（11/11 100% 通過）

在主分支環境下，全套 11 大自動化驗收測試矩陣 100% 全部通過：

| 驗收套件 | 執行指令 | 測試結果 | 關鍵驗收指標 |
| :--- | :--- | :--- | :--- |
| **核心邏輯自檢** | `node scripts/self-check.mjs` | ✅ 通過 (`ok: true`) | 29 張升級卡、8 組融合晶片、5 武器原型、4 種動態詞綴、Titan/Behemoth 部位破壞、2D 空間雜湊網格 0-GC 驗證 |
| **多語言本地化套件** | `node scripts/test-i18n-verification.mjs` | ✅ 通過 (4/4 階段) | 中英切換持久化、命名空間遷移驗證、29 升級 + 8 融合 + 5 武器全量雙語對照、DOM 靜態 HTML 同步 |
| **闖關與極限模式套件** | `node scripts/test-campaign-modes.mjs` | ✅ 通過 (3 階段) | 關卡選擇器、星級進度條、作戰簡報、輪播導航、模式切換無狀態殘留 |
| **關卡與模式擴展套件** | `node scripts/test-extensibility-levels.mjs` | ✅ 通過 (4/4 階段) | 20 關卡動態鏈結、Sector 04 32★ 解鎖門檻、宣告式星級引擎求值、推車與超載子系統週期 |
| **首領與敵群擴展套件** | `node scripts/test-enemies-expansion.mjs` | ✅ 通過 (6/6 階段) | Behemoth 3 部位破壞生命連動與狂暴弱點、Prowler 相位突刺 AI、Bulwark 護盾偏折與破盾癱瘓 |
| **局外改裝與競速套件** | `node scripts/test-track3-metagame.mjs` | ✅ 通過 (4/4 階段) | 工坊 6⚡ 負載與插槽裝配、天梯隔離防護、星級金庫與每日懸賞、5Hz 幽靈差分壓縮 (< 3 KB) 與 Split-Timer |
| **偏好設定與 Unified Save 驗證** | `node scripts/test-cloud-save.mjs` | ✅ 通過 (4/4 階段) | 偏好命名空間平滑遷移、終局存檔大小 (< 16 KiB)、樹深度 (<= 5)、智慧合併交換律、409 衝突自動解決至 rev 3、requestId 重複保護 |
| **雲端存檔與 Schema v2 驗證** | `node scripts/test-track2-cloud-save.mjs` | ✅ 通過 (5/5 階段) | Manifest Schema v2 與 cloudSave 宣告校驗、快照大小 (< 64 KiB)、雙向智慧合併、SDK 1.1.0 樂觀鎖與自動檢查點保存鉤子 |
| **相機與視口動態驗收** | `node scripts/test-track1-camera.mjs` | ✅ 通過 (8/8 階段) | 雙階阻尼、軟約束死區、Hermite 準星前瞻、震屏解耦逆映射、小地圖與雷達指針、減動效零震屏 |
| **大地圖與視錐剔除驗收** | `node scripts/test-track2-terrain-culling.mjs` | ✅ 通過 (5/5 階段) | 3520x2640 世界邊界、55px 空間網格 64x48 對齊、AABB 視錐剔除（75%+ 剔除率）、9 大 POI 生命週期與防守互動 |
| **真實瀏覽器全流程 E2E** | `node scripts/test-browser-gameplay.mjs` | ✅ 通過 (40/40 項) | 零未捕捉異常、零控制台報錯；涵蓋開局配裝、戰鬥動能、全按鍵與戰術裝備部署、升級選卡/重抽/放逐/跳過、暫停分頁、死亡結算與 Run It Back 重開 |

---

## 四、官方固定工具雙重真實驗收

使用官方固定工具 `.playroom/tools/playroom-game-tools-1.1.0.zip` 解壓後進行真實驗收：

1. **打包驗證**：
   ```sh
   node pack-game.mjs output/game output/game.zip
   ```
   - 結果：`Packed dust-reign v0.11.0: output/game.zip (tools 1.1.0)`
2. **規格核驗**：
   ```sh
   node validate-game.mjs output/game.zip
   ```
   - 結果：`Valid: dust-reign v0.11.0 (tools 1.1.0)`
   - 雙重工具驗收 100% 通過！

---

## 五、交付物清單

- **Release 標籤**：`v0.11.0`
- **發布分支**：`master`
- **Manifest 版本**：`game.json` (version `0.11.0`, schemaVersion `2`)
- **Staging 輸出**：`output/game/`
- **發布 ZIP**：`output/game.zip`
- **更新架構**：`ARCHITECTURE.md`
- **驗證紀錄**：`RELEASE.md`
