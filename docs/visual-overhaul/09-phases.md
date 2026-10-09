# 09 實作階段

[返回索引](README.md)

每個階段結束都要通過 `node --check`、`node scripts/self-check.mjs`，並以瀏覽器截圖與 `output/playwright/baseline-*.png` 對照。每個階段結束時遊戲都必須可以完整遊玩，可以單獨回退。

1. **準備**
   - 依 `AGENTS.md` 重新讀取平台 `main` 最新規格（開發標準、Schema、workflow 範本、SDK），列出本次適用要求。
   - 以 Playwright 記錄目前桌面與手機的 FPS 基準（戰鬥 30 秒、Titan 波），作為效能比較基準。
2. **渲染基礎建設**（[02](02-render-architecture.md)）
   - `palette.js`、`quality.js`、`sprites.js`、render clock、`draw.js` 新圖層順序。
   - 把所有 `shadowBlur` 換成光暈貼圖。此時外觀應與現況接近，但效能更好。
   - 畫質設定的讀寫與 `#settingVisualQuality` 按鈕。
3. **背景地形與大氣**（[03](03-terrain.md)、[04](04-lighting-atmosphere.md)）
   - `terrain.js` 離屏地表與色調交叉淡入。
   - `atmosphere.js` 浮塵、風暴霧帶、色彩分級、暗角、顆粒；區段色調切換。
4. **光影**（[04](04-lighting-atmosphere.md)）
   - `lighting.js` lightmap 與光源收集；MEDIUM / LOW 替代方案。
5. **實體造型**（[05](05-entities.md)）
   - `shadows.js`、玩家機甲、6 種敵型、Elite 詞綴、Titan、環境物件與掉落物。
   - 受擊閃白、出生與死亡動畫。
6. **戰鬥特效**（[06](06-combat-vfx.md)）
   - `fx.js` 粒子池與 preset、`core/fx-events.js` 事件佇列接入 `killEnemy` / 爆炸 / EMP。
   - 子彈、敵彈、電弧、震波環、EMP、爆炸、傷害數字、螢幕閃光。
7. **HUD 與介面**（[07](07-hud-ui.md)）
   - `animations.css`、HUD 動態、開始畫面、升級面板、結算畫面、暫停面板、觸控按鈕。
8. **無障礙與效能收斂**（[08](08-accessibility.md)）
   - 逐項檢查無障礙規則。
   - 手機直向 MEDIUM 以 45fps 以上為目標、桌面 HIGH 以 60fps 為目標，不達標就調整各級預算。
9. **文件與發布準備**
   - `game.json` 版本改為 `0.3.0`；`CHANGELOG.md` 新增 V0.3.0；`RELEASE.md` 更新驗收紀錄。
   - `ARCHITECTURE.md` 更新：專案結構（新模組）、`rt` 新欄位、5.1 繪製層次、新 localStorage key、`entity.fx` 視覺欄位契約、`fx-events` 事件佇列、畫質分級。
   - 以新畫面重新截取 `cover.png`（不超過 5 MiB）。
   - 執行 `node scripts/stage-release.mjs`，再以平台 `main` 最新工具 `npm run game:pack` / `npm run game:validate` 完整驗證 ZIP（ZIP 放在成品目錄之外）。
   - 不建立 tag、不建立 Release，除非使用者明確要求。

驗收項目見 [10-acceptance.md](10-acceptance.md)。
