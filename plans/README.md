# DUST//REIGN 系統演進與改進規劃總覽（Master Roadmap & Execution System）

> **專案定位**：零依賴（Zero-Dependency）、單頁原生（Pure Vanilla JS + Canvas 2D + Web Audio API）、純前端硬核廢土 roguelike 射擊遊戲。  
> **基準架構參考**：[ARCHITECTURE.md](file:///F:/Desktop/Luna/ARCHITECTURE.md) ｜ **當前版本**：V0.0.13 (BUILD 0.1.0) ｜ **執行檔案**：[game.js](file:///F:/Desktop/Luna/game.js)、[index.html](file:///F:/Desktop/Luna/index.html)、[styles.css](file:///F:/Desktop/Luna/styles.css)

---

## 規劃系統架構：總體設計 vs 並行工單

本規劃庫分為**兩層結構**：
1. **系統設計規格（High-Level Design Specs）**：宏觀遊戲機制、數值模型與架構設計。
2. **多 Agent 並行工單（Parallel Work Packages）**：精確到行號、變數名、合約防衝突邊界與單元測試的極致細化實作藍圖，專為 4~5 個 Subagent 同步並行開發設計。

```text
plans/
├── README.md                           # 本索引文件
├── PARALLEL_EXECUTION_MATRIX.md        # ★五大 Agent 並行調度矩陣與防衝突合約
│
├── 01-audio-and-game-juice.md          # 系統設計：視聽回饋與打擊感
├── wp-01-audio-and-game-juice.md       # ★並行工單：WP1 音訊引擎與打擊感落地
│
├── 02-weapons-and-synergies.md         # 系統設計：武器流派與 15 張卡牌矩陣
├── wp-02-weapons-and-synergies.md      # ★並行工單：WP2 彈道防刷與連動實作
│
├── 03-enemy-ai-and-bosses.md           # 系統設計：戰術敵怪與巨獸首領
├── wp-03-enemy-ai-and-bosses.md        # ★並行工單：WP3 敵方彈幕與三幕劇導演
│
├── 04-meta-progression-and-rigs.md     # 系統設計：3 種機體與本地成就存儲
├── wp-04-meta-progression-and-rigs.md  # ★並行工單：WP4 機體選單與 Meta 儲存引擎
│
├── 05-dynamic-arena-and-hazards.md     # 系統設計：動態戰場環境與可破壞物
└── wp-05-dynamic-arena-and-hazards.md  # ★並行工單：WP5 廢料桶連鎖與沙暴迷霧
```

---

## 規劃模組索引（Plan Modules Index）

| 領域 | 總體設計規格 | 專屬並行執行工單 | 核心交付成果 |
| :--- | :--- | :--- | :--- |
| **01 視聽打擊感** | [01-audio-and-game-juice.md](file:///F:/Desktop/Luna/plans/01-audio-and-game-juice.md) | [wp-01-audio-and-game-juice.md](file:///F:/Desktop/Luna/plans/wp-01-audio-and-game-juice.md) | 原生 Web Audio 8 大合成音效、Hit-stop 微凍結、Trauma 震動、FCT 傷害跳字池化、離屏殘骸印章 |
| **02 武器與流派** | [02-weapons-and-synergies.md](file:///F:/Desktop/Luna/plans/02-weapons-and-synergies.md) | [wp-02-weapons-and-synergies.md](file:///F:/Desktop/Luna/plans/wp-02-weapons-and-synergies.md) | 散射（Scatter）、穿透（Railgun 防重複扣血）、反彈破片、15 張矩陣卡牌、火路徑/滿血EMP/連殺飛彈三大連動、防衛僚機 |
| **03 敵人與首領** | [03-enemy-ai-and-bosses.md](file:///F:/Desktop/Luna/plans/03-enemy-ai-and-bosses.md) | [wp-03-enemy-ai-and-bosses.md](file:///F:/Desktop/Luna/plans/wp-03-enemy-ai-and-bosses.md) | 敵方彈幕系統（Dash 擦彈）、Spitter 虛線預警吐酸、Scurrier 充能殉爆、Wave 5/10 巨獸 Dreadnought 雙階段衝撞、三幕劇編隊導演 |
| **04 機體與成長** | [04-meta-progression-and-rigs.md](file:///F:/Desktop/Luna/plans/04-meta-progression-and-rigs.md) | [wp-04-meta-progression-and-rigs.md](file:///F:/Desktop/Luna/plans/wp-04-meta-progression-and-rigs.md) | 3 種機體（Vanguard 雙段衝刺/散彈、Colossus 減傷重砲、Engineer 僚機/超導磁吸）、開始畫面 `#rigSelector` UI、`dustReignMeta` 儲存引擎 |
| **05 動態環境** | [05-dynamic-arena-and-hazards.md](file:///F:/Desktop/Luna/plans/05-dynamic-arena-and-hazards.md) | [wp-05-dynamic-arena-and-hazards.md](file:///F:/Desktop/Luna/plans/wp-05-dynamic-arena-and-hazards.md) | 廢料爆炸桶（0.2s 延遲抖動急閃 + 120px 骨牌式連鎖）、10s 輻射毒霧泥沼、沙暴動態風力推移、暗角視野迷霧光圈 |

---

## 4~5 個 Subagent 並行開發防衝突準則

詳細防衝突規範請參閱 [PARALLEL_EXECUTION_MATRIX.md](file:///F:/Desktop/Luna/plans/PARALLEL_EXECUTION_MATRIX.md)。核心準則摘要如下：

1. **安全代理與解耦調用**：WP1 提供 `window.LunaGame.audio.play()`，其他 Agent 呼叫音效時自動防禦性回退，不阻斷執行。
2. **子彈與實體隔離**：玩家子彈（`state.bullets`）與敵方子彈（`state.enemyBullets`）完全分流；環境物件（`state.barrels`, `state.hazardZones`）不塞入 `state.enemies`。
3. **機體增量修補**：WP4 使用 `applyRigToPlayer()` 增量賦值，禁止全量覆蓋 `player`，保證 WP2 的武器屬性安全疊加。
4. **渲染圖層 15 插槽順序**：嚴格按照 `PARALLEL_EXECUTION_MATRIX.md` 中的圖層順序在 `draw()` 中掛接繪製，互不侵入。
5. **語法與自測檢驗**：每次變更均需維持 `node --check game.js` 通過，且 `window.LunaGame.selfCheck()` 全斷言綠燈。
6. **標準交付閉環**：每個功能點在驗證通過後，必須依序完成「實作 → 截圖存入 `screenshots/v0.0.X-*.png` → 更新 `CHANGELOG.md` → 本地 Git 語意化提交」，確保版本清晰留痕與可回滾。

