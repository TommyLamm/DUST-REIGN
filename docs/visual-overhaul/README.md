# DUST//REIGN 視覺全面改造計畫（V0.3.0）

本目錄是視覺改造的工作計畫，不是現狀規格；完成後現狀以 `ARCHITECTURE.md` 為準。

- 範圍：戰場光影氛圍、敵人與玩家造型、背景地形、戰鬥特效、HUD 與介面，全部五個方向。
- 取向：大膽。允許大幅改變美術風格，接受較高效能成本，但以「畫質分級 + 自動降級」保證手機直向仍可流暢完成主要玩法。
- 預計版本：`0.2.1` → `0.3.0`（視覺大改，玩法不變）。

## 文件索引

| 檔案 | 內容 |
| --- | --- |
| [00-invariants.md](00-invariants.md) | 不可改變的契約：玩法數值、模組邊界、DOM、存檔、零依賴 |
| [01-art-direction.md](01-art-direction.md) | 美術方向「Sodium Dusk」、調色盤、區段色調 |
| [02-render-architecture.md](02-render-architecture.md) | 新模組、render clock、圖層順序、畫質分級、貼圖快取 |
| [03-terrain.md](03-terrain.md) | 背景地形離屏快取 |
| [04-lighting-atmosphere.md](04-lighting-atmosphere.md) | Lightmap、MEDIUM/LOW 替代方案、浮塵、風暴、色彩分級 |
| [05-entities.md](05-entities.md) | 敵人、玩家機甲、環境物件與掉落物造型 |
| [06-combat-vfx.md](06-combat-vfx.md) | 視覺粒子池、事件佇列、戰鬥特效清單 |
| [07-hud-ui.md](07-hud-ui.md) | HUD、開始畫面、升級面板、結算畫面、暫停與觸控 |
| [08-accessibility.md](08-accessibility.md) | Reduced Motion、高對比、閃光安全 |
| [09-phases.md](09-phases.md) | 實作階段與每階段的檢查 |
| [10-acceptance.md](10-acceptance.md) | 驗收清單 |
| [11-risks.md](11-risks.md) | 風險與對策 |

## 建議閱讀順序

先讀 [00-invariants.md](00-invariants.md) 與 [02-render-architecture.md](02-render-architecture.md)，它們決定其他所有文件的邊界；實作時依 [09-phases.md](09-phases.md) 的階段順序進行，每個階段對應的設計細節在 03–07。
