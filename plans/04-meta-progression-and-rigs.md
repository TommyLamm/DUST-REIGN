# 計畫 04：機體自選與局外成長系統（Meta-Progression & Rig Classes Spec）

> **模組責任**：實現 3 種差異化作戰機體（Vanguard 斥候、Colossus 泰坦、Engineer 工兵），在開始畫面嵌入終端機風格機體選單，並構建本地 `dustReignMeta` 持久化儲存與長線成就解鎖體系。  
> **關聯檔案**：[game.js](file:///F:/Desktop/Luna/game.js)、[index.html](file:///F:/Desktop/Luna/index.html)、[styles.css](file:///F:/Desktop/Luna/styles.css)

---

## 1. 三大機體規格矩陣（Rig Archetypes）

```text
                    ┌────────────────────────┐
                    │      CHASSIS ROSTER    │
                    └───────────┬────────────┘
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   VANGUARD RIG   │  │   COLOSSUS RIG   │  │  ENGINEER RIG    │
│  [斥候機動／近接爆發] │  │  [泰坦重裝／陣線擊退] │  │  [廢料回收／自動僚機] │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│• 雙段快速短 CD Dash│  │• 160 超高 Hull/裝甲│  │• 330px 雙倍磁吸半徑│
│• 擴散傳感器 (寬視野)│  │• 重砸擊退 (Slam Dash)│ │• 自帶 1 架環繞防衛僚機│
│• 3連微型破片霰彈   │  │• 重砲動能擊退 (Knock) │  │• 1.35x XP + 滿溢翻倍│
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### 1.1 數值對比表

| 屬性項目 | VANGUARD RIG (斥候型) | COLOSSUS RIG (泰坦重裝型) | ENGINEER RIG (拾荒工兵型) |
| :--- | :--- | :--- | :--- |
| **機體識別代號** | `vanguard`（預設解鎖） | `colossus`（解鎖：500 擊殺） | `engineer`（解鎖：存活至第 5 波） |
| **碰撞半徑 `r`** | 13 px（靈巧小受擊面） | 18 px（重甲受擊面） | 15 px |
| **基礎生命 `maxHp`** | 80 HP | 160 HP（+60% 裝甲） | 100 HP |
| **巡航速度 `speed`** | 275 px/s（+17% 荒漠巡航） | 190 px/s（-19% 緩速履帶） | 220 px/s |
| **主武器射速 / 傷害** | 0.25s 冷卻 / 11 × 3 發破片霰彈 | 0.34s 冷卻 / 44 點重砲動能彈 | 0.20s 冷卻 / 22 點微型電弧槍 |
| **Dash 機制** | **2 段儲能 / 1.4s 充能 / 120px** | **單段 / 3.2s CD / 95px / 震地重砸** | 1 段 / 2.0s CD / 135px |
| **磁吸半徑 `magnetRadius`** | 150 px | 150 px | **330 px（超導電磁力）** |
| **經驗倍率 `xpMult`** | 1.0x | 0.95x | **1.35x（廢料提煉專長）** |
| **專屬被動特性** | 寬視角傳感器（沙暴迷霧光圈 +30%） | 複合裝甲（接觸傷害減免 20% + 擊退敵人） | 開局自帶 1 架浮游防衛僚機 |

---

## 2. 開始畫面 UI 整合（Chassis Selection Matrix）

在 `#startScreen .overlay-inner` 內部、開始按鈕上方嵌入符合鏽橙/終端機風格的機體選擇卡片：

```html
<div class="rig-selector" aria-label="Select Combat Rig">
  <div class="rig-selector-header">
    <span class="overlay-kicker">SELECT COMBAT CHASSIS</span>
    <span class="rig-status-tag" id="rigStatusTag">CHASSIS: READY</span>
  </div>
  <div class="rig-grid" role="radiogroup">
    <!-- 3 張可點選切換的機體卡片，支援鍵盤 1, 2, 3 或 A/D 快速切換 -->
  </div>
</div>
```

- **未解鎖狀態**：覆蓋半透明灰暗遮罩 `background: rgba(16, 17, 14, 0.85)`，顯示鎖頭 `🔒` 與 `REQ: 500 TOTAL KILLS`。
- **選中狀態**：邊框高亮為氧化薄荷綠（`#75d1b0`）實線，並帶有終端機掃描線流光。

---

## 3. 本地 localStorage 資料架構（`dustReignMeta`）

採用單一聚合 Key 管理，避免資料零碎化，並無損兼容舊鍵 `dustReignBestScore`：

```typescript
interface DustReignMeta {
  version: 1;
  totalRuns: number;          // 累計出擊次數
  totalKills: number;         // 累計擊殺數
  highestWave: number;        // 歷史最高波次
  highestCombo: number;       // 歷史最高連殺
  bestScore: number;          // 歷史最高得分
  selectedRig: string;        // 當前裝配機體 ('vanguard' | 'colossus' | 'engineer')
  unlockedRigs: string[];     // 已解鎖機體清單
  achievements: {             // 成就完成狀態
    [key: string]: { unlocked: boolean; unlockedAt: number };
  };
}
```

### 3.1 成就解鎖階梯表

| 成就代碼 | 名稱 | 解鎖條件 | 獎勵回報 |
| :--- | :--- | :--- | :--- |
| `scav_initiate` | **初次沾血** | 累計完成 1 場出擊 | 解鎖 SCAV LOG 檔案查看器 |
| `heavy_metal` | **鋼鐵意志** | **累計擊殺 500 隻敵人** | **解鎖 COLOSSUS RIG (泰坦重裝機體)** |
| `storm_walker` | **風暴穿越者** | **通關 Wave 5** | **解鎖 ENGINEER RIG (拾荒工兵機體)** |
| `chain_reaction`| **過載連擊** | **達成 8 層連殺 (CHAIN x8)** | 連殺窗口提升至 5.5 秒 |
| `salvage_hoarder`| **廢土巨賈** | 單局拾取超過 450 顆 Scrap | 解鎖純金色機體鍍層塗裝 |

---

## 4. 驗收標準

1. 首次進入遊戲預設裝配 Vanguard 斥候機體，具有流暢的雙段 Dash 與破片散彈。
2. 累計擊殺數達標後，重新整理頁面能持久保存解鎖進度，Colossus 成功解鎖。
3. 隱私無痕模式或阻擋 localStorage 時，遊戲不會崩潰，平滑降級遊玩。
