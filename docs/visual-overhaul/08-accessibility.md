# 08 無障礙與降級規則

[返回索引](README.md)

## Reduced Motion（`isReducedMotion()` 為真）

- 關閉：螢幕閃光、遠方閃電、膠片顆粒、glitch、卡片傾斜、數字滾動、出生浮出動畫、傷害數字飄移、時空凝滯去飽和、掃描亮帶移動。
- 保留：所有靜態光影與造型改進、受擊閃白（縮短至 0.06 秒，沿用現有規則）、必要的預警動畫（改為不閃爍的漸變）。
- 震屏與 Hitstop 歸零維持現有規則。
- CSS 端由 `responsive.css` 的 `prefers-reduced-motion` 與 `html.reduced-motion` 統一停用 `animations.css` 的動畫。

## 高對比（`isHighContrast()` 為真）

- lightmap 與暗角停用（全畫面不暗化）、色彩分級停用、浮塵與霧帶透明度降到最低。
- 敵人雙層黑白描邊與頭頂符號、掉落物符號全部保留，並畫在所有特效之上（可讀性層最上方）。
- 敵彈加白色外框。
- `css/high-contrast.css` 覆寫新加的 HUD 動態樣式，維持高飽和邊框。

## 閃光安全

- 任何全畫面閃光的頻率不超過每秒 3 次、最大不透明度 0.35。
- `fx.js` 的 `screenFlash` 統一節流：上次閃光後 0.33 秒內的新請求只取較強者，不重新觸發。
