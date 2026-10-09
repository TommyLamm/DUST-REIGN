# 01 美術方向：「Sodium Dusk」

[返回索引](README.md)

## 現況

深灰平面背景 + 低對比網格 + 灰三角形碎屑，實體以單色填色加 `shadowBlur` 發光，整體偏平、偏暗、缺乏前後層次。

## 新方向

黃昏鈉燈下的廢土鹽原。暖色沙地為基底，冷色陰影拉出層次，所有能量體（子彈、EMP、核心、反應爐）以加法混色發光，畫面像被光源「照亮」而不是單純「塗色」。

## 調色盤（新增 `src/render/palette.js`）

```js
export var PALETTE = {
  ground:   { base: '#2a241c', light: '#4a3d2a', dark: '#15120e', crack: '#0e0c09' },
  shadow:   'rgba(6, 10, 14, 0.55)',
  ambient:  { dusk: '#3a2a1e', storm: '#3b1712', night: '#0d1420' },
  emissive: { player: '#7cf0c8', hostile: '#ff6a3d', tech: '#5be7ff', gold: '#ffd36b', void: '#b55fe6' },
  hud:      { bone: '#e8e0c6', rust: '#ed6842', amber: '#e8b94e', mint: '#96baa0' }
};
```

HUD 色票沿用 `css/base.css` 現有 token（`--bone`、`--rust`、`--amber`、`--mint`），Canvas 與 CSS 兩邊保持一致。

## 區段色調（依波次切換，純視覺）

- 第 1–2 波 `DUSK`：琥珀黃昏，環境光較亮。
- 第 3–4 波 `RUST`：鏽紅，風沙更濃。
- 第 5 波起每逢 Titan 波 `NIGHT`：藍黑夜色，鈉燈與反應爐光源成為主要照明。
- 之後循環。風暴前線（每波最後 5 秒）在任何色調上疊加紅橙風暴色與能見度下降。
- 換波時色調以 1.5 秒插值過渡，不瞬切。
- 色調只由 `rt.state.wave` 與 `isStormFront()` 推導，不新增 state 欄位。
