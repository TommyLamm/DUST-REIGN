# 07 HUD 與介面（CSS + `src/ui/**`）

[返回索引](README.md)

保留現有工業 CRT 版面結構與所有 DOM id，提升動態與質感。

## 全域

- `css/base.css`：調色盤 token 擴充（`--glow-*`、`--sector-tint`）。
- 新增 `css/animations.css` 集中所有新的 `@keyframes`，在 `index.html` 插入於 `responsive.css` 之前，使 `responsive.css` 的 `prefers-reduced-motion` 覆寫與 `.reduced-motion` class 仍有效。
- 頂欄 `DUST//REIGN` 標題加上週期性的輕微 glitch（RGB 錯位 2 幀）；`COMMS` / `WIND` 數值以打字機方式更新。
- 戰場容器 `.canvas-stage` 加上 `data-sector="dusk|rust|night"` 與 `data-storm` 屬性，讓 CSS 外框與 canvas 色調一致（由 `src/ui/hud.js` 的 `updateDomUi` 設定，只在值改變時寫入 DOM）。

## 戰鬥 HUD（`css/hud.css`、`src/ui/hud.js`）

- 數值變化動畫：分數以短暫滾動計數上升，加分時跳出 `+N` 小字；波次切換時數字翻牌。
- 生命條：受傷時條身震動 + 失去的部分先變白再縮短（延遲殘影條，`#healthFill` 旁新增一個 span）；低血量時整條脈動。
- 能量條：滿 50 可施放 EMP 時亮起並出現「EMP READY」標記，與 `#touchSpecial` 同步發光。
- Combo（`#hudChain`）：放大為傾斜的大字標章，層數越高顏色越熱，計時以下方細條顯示，斷連時碎裂淡出。
- 風暴時 HUD 卡片邊框轉紅並出現沙塵干擾紋（延伸現有 `.metric--wave.is-storm`）。

## 開始畫面（`#startScreen`）

- 背景戰場在待機時持續有浮塵與光影（render clock 驅動），不再是靜止畫面。
- 標題 `MAKE YOUR OWN COVER.` 逐行打出、副標閃爍游標；`ENTER THE DUST` 按鈕有掃光與按下的機械下沉。
- 頂部警示條紋（`.overlay::before`）持續緩慢平移。

## 升級面板（`css/upgrades.css`、`src/ui/upgrade-panel.js`）

- 三張卡以 60ms 間隔依序翻入（發牌動畫）。
- 每張卡依類別（OFFENSE / DEFENSE / TACTICAL / FUSION）有 inline SVG 圖示與色條，取代純文字分類標籤。
- 把目前 `renderUpgradePanel` 裡的 inline style（類別顏色、`small`、`em` 樣式）搬到 CSS class，例如 `.upgrade-choice--offense`。
- 滑鼠 hover / 手把選取（`.is-gamepad-selected`）時卡片微傾斜（`perspective` + `rotateX/Y`）與邊緣掃光。
- Fusion 卡：金色全息流光邊框、背景緩慢流動的紋路，保留現有 `fusion-chip-pulse`。
- 選定時被選卡放大閃白、其餘兩張下沉淡出，約 220ms 後再關閉面板；`chooseUpgrade` 的邏輯時機不變，動畫只在 DOM 層播放。

## 結算畫面（`#gameOverScreen`）

- 4 格遙測數字（`#telAccuracy`、`#telMaxCombo`、`#telGrazes`、`#telDamage`）依序從 0 滾到最終值。
- 評級鋼印落下時加上畫面輕震與墨跡飛濺（CSS 偽元素）；S 級另有金色光芒旋轉。
- 破紀錄金印與評級鋼印的落下時間錯開 0.25 秒，避免同時出現。
- 死亡 CRT 坍縮（`src/render/overlay.js`）加上色差分離與殘影噪點，時長維持 0.55 秒。

## 暫停面板與觸控

- 暫停開啟時戰場畫面去飽和、模糊（CSS `filter` 作用在 `#gameCanvas`，關閉時移除）。
- 分頁切換（`#tabBtnSystem` / `#tabBtnBuild` / `#tabBtnControls`）有底線滑動指示。
- SYSTEM 分頁新增畫質按鈕 `#settingVisualQuality`（見 [02-render-architecture.md](02-render-architecture.md)）。
- 觸控搖桿：底座加上方向刻度，拇指按下時發光。
- `#touchShoot` / `#touchDash` / `#touchSpecial` 有冷卻環（CSS `conic-gradient`，以 CSS 變數 `--cd` 由 `updateDomUi` 更新）。
- 觸控按鈕維持至少 44px（V0.1.1 規範）。
