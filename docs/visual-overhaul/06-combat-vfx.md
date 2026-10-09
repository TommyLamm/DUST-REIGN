# 06 戰鬥特效（`src/render/fx.js`、`src/render/projectiles.js`）

[返回索引](README.md)

## 現有 sim 粒子

`state.particles`（`spawnParticles` 推入、`stepEffects` 更新、上限 700 用 `splice` 裁切）**保留不動**，因為 sim 依賴它（約 150 處呼叫）。render 只改變繪製方式：方塊改為依速度方向拉長的火花線條，亮色粒子走加法層。

## 視覺專用粒子池

- `fx.js` 新增固定大小環形池（容量依畫質 260 / 500 / 900），在 render 端以 `rt.renderDt` 更新，不進 state，不影響 self-check。
- 粒子種類：
  - `spark`：速度對齊的亮線，帶重力與彈跳。
  - `smoke`：大而柔的煙團，緩慢擴散上升、隨風漂移。
  - `ember`：慢速飄升、閃爍的餘燼。
  - `shard`：旋轉多邊形碎片（敵人與部件殘骸）。
  - `flash`：一幀到數幀的強光盤（爆炸、命中）。
  - `ring`：細環擴散（命中、落地）。
- 統一入口 `emitFx(kind, x, y, opts)`；組合特效以 preset 定義，例如：

```js
var PRESETS = {
  explosionLarge: [
    { kind: 'flash', count: 1, radius: 90 },
    { kind: 'smoke', count: 24, speed: 60 },
    { kind: 'spark', count: 40, speed: 320 },
    { kind: 'ember', count: 12, speed: 40 },
    { kind: 'ring', count: 1, maxRadius: 140 }
  ]
};
```

## sim → render 事件佇列（`src/core/fx-events.js`）

為了讓 render 知道死亡、爆炸等瞬間事件，又不違反「sim 不 import render」：

- `pushFxEvent(kind, x, y, opts)` 寫入 `rt.fxEvents`（固定長度環形佇列，上限 64，滿了覆蓋最舊的）。
- render 每幀開頭取出所有事件、轉成對應的 `emitFx` preset 呼叫，然後清空。
- 呼叫點只有 4 處，不影響數值：
  - `src/systems/combat.js` 的 `killEnemy`（帶敵型與顏色）
  - `src/systems/combat.js` 的 `explodeCore`、`explodeBarrel`
  - `src/systems/abilities.js` 的 `triggerEmp`
- Node 環境下佇列照常寫入但無人取用，self-check 不受影響。

## 特效清單

- **玩家子彈**：保留雙層軌跡，加上加法光頭與微光尾；`vanguard` 磁軌彈改為帶螺旋能量紋的粗光束；`arc-welder` 改為抖動的電弧束。
- **命中**：小型閃光 + 3–6 條火花 + 擊中點短暫光源；暴擊時改為金色、更大閃光與「CRIT」字樣傷害數字。暴擊由 `state.stats.crits` 的增量判斷。
- **傷害數字**（可讀性層）：render 端依 `e.fx.lastHp` 差值產生，向上飄並淡出；同一敵人 0.12 秒內的傷害合併顯示，避免高射速洗版。LOW 畫質與 Reduced Motion 下改為不飄移、只淡出。
- **敵彈**（可讀性層）：脈動核心 + 外層光暈 + 短尾跡；Titan 電漿彈加旋轉外殼。
- **擊殺**：依敵型套用 small / medium / large 爆炸 preset，Elite 與 Titan 另加慢速擴散的衝擊波扭曲環。
- **爆炸**（核心、燃油桶、迫擊砲）：白色閃光 → 橙色火球（2–3 幀）→ 煙柱 → 焦痕；燃油桶多一段火焰殘留。
- **EMP**：青色球形震波 + 內圈白色衝擊環 + 範圍內電弧跳躍 + 全畫面極短的青色閃光；被瓦解的敵彈變成青色碎光。
- **避雷柱巨爆**：柱頂向全場放射 8–12 條碎形電弧 + 全畫面冷色閃光 + 柱體過熱發白。
- **電弧**（`drawLightningArcs`）：由單一中點折線改為遞迴中點位移碎形，主幹 + 分岔（層數依畫質 3 / 2 / 1），每幀重新抖動，外層加法光暈。
- **震波環**（`drawShockRings`）：雙環（亮細內環 + 寬淡外環），外環帶輕微扭曲抖動。
- **衝刺**：起點殘影改為 3–4 個漸淡的機甲剪影；落點雙色脈衝保留並加上地面塵土環；Just Dash 有時空波紋。
- **迫擊砲預警**（可讀性層）：保留虛線圈與十字，改為從外向內收縮的填色 + 中心倒數閃爍，落地前 0.2 秒圈線轉白；熔岩區（圖層 6）加上翻滾的亮斑紋理與上升熱氣。
- **黑洞**（`drawVortices`）：吸積盤 + 中心暗核 + 外圍引力透鏡暗環，被吸入的粒子拉成弧線。
- **Graze 擦彈**：敵彈掠過時的細小白色擦痕弧線 + 玩家身上短暫的金色閃光。
- **升級 / 賞金 / 風暴破曉者**：玩家位置的上升光柱 + 環形粒子噴發。
- **螢幕閃光**（圖層 12，`fx.js` 管理 `screenFlash` 顏色與強度）：
  - 受傷：紅色邊緣暗角（取代 `draw.js` 末端的全畫面淡紅填色），強度沿用 `state.hurtFlash`。
  - EMP 青、升級金、Titan P2 紅。
  - 閃光限制見 [08-accessibility.md](08-accessibility.md)。
