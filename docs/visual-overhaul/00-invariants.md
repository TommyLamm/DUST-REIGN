# 00 不可改變的契約（Invariants）

[返回索引](README.md)

改造只動「看起來的樣子」，以下全部維持原樣：

1. **玩法數值**：碰撞半徑、傷害、冷卻、波次時間、生成規則、分數公式、Hitstop 時長全部不變。`node scripts/self-check.mjs` 必須照舊全數通過。
2. **sim 不讀 render**：`src/systems/**` 不 import `src/render/**`。render 可以在實體上寫入**純視覺欄位**（統一放在 `entity.fx` 物件內），sim 不得讀取 `fx`。sim 需要通知 render 的事件只能透過 `src/core/fx-events.js`（見 [06-combat-vfx.md](06-combat-vfx.md)）。
3. **DOM 合約**：`ARCHITECTURE.md` 6.1 列出的所有 id 保留；可以新增元素與 class，不得改名或移除。
4. **存檔相容**：既有 localStorage key 不變；只新增 `dust_reign_visual_quality`。
5. **零建置、零依賴**：不引入框架、打包工具、外部 CDN 或外部字型。所有新視覺都是程序生成（Canvas 2D / CSS / inline SVG），不新增二進位素材，因此 `scripts/stage-release.mjs` 白名單不需修改。
6. **無障礙**：Reduced Motion 與高對比模式的既有行為必須保留，並擴展到所有新特效（見 [08-accessibility.md](08-accessibility.md)）。
7. **平台規範**：sandbox iframe 可玩、相對路徑、Playroom SDK 流程不變。
8. **程式風格**：沿用 ES5 風格（`var`、`function`），只以 `import` / `export` 串接模組；模組頂層不得呼叫其他模組的函式（`ARCHITECTURE.md` 1.1）。
