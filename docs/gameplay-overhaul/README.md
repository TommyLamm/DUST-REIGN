# DUST//REIGN 玩法增強計畫（v0.4.0）

本目錄是 v0.4.0 玩法增強的完整設計與實作計畫。視覺改版（v0.3.0）見 [`../visual-overhaul/`](../visual-overhaul/README.md)。

## 目標

把「同一套 30 秒波次一直疊血量」改成有結構、有承諾、有理由重玩的一局：

1. **一局有形狀**：三幕（Act）各 5 波，每幕以首領收尾；第 15 波撤離算通關，可選擇繼續無盡加時。
2. **構築要承諾**：開局選機體與主武器；升級卡有稀有度、疊層上限、重抽與放逐；融合更早成形；武器專屬卡。
3. **每 5 波有新問題**：4 種新敵型、2 名新首領、2 個新精英詞綴、波次突變（Mutator）與可選合約。
4. **技巧有代價也有回報**：Just Dash 加入過熱、評級改看分數與風格、計分加入過波與無傷獎勵。
5. **有理由回來**：機體與武器解鎖、成就、Dust Heat 難度階梯、每日種子挑戰；首次遊玩的情境提示。

## 閱讀順序

| 檔案 | 內容 |
| --- | --- |
| [00-invariants.md](00-invariants.md) | 不可破壞的規則、相容性與平台限制 |
| [01-design-pillars.md](01-design-pillars.md) | 現況問題、設計支柱、目標一局節奏 |
| [02-run-structure.md](02-run-structure.md) | 三幕結構、波次導演、難度曲線、幕間選擇、通關與無盡 |
| [03-builds-and-weapons.md](03-builds-and-weapons.md) | 主武器承諾、卡牌稀有度與疊層、重抽／放逐、新卡與新融合 |
| [04-enemies-and-bosses.md](04-enemies-and-bosses.md) | 4 種新敵型、2 名新首領、新精英詞綴、彈幕成長 |
| [05-arena-and-events.md](05-arena-and-events.md) | 波次突變、合約、補給箱、場地互動物 |
| [06-skill-scoring-controls.md](06-skill-scoring-controls.md) | Just Dash 過熱、新計分、評級、手機與手把、新手提示 |
| [07-meta-progression.md](07-meta-progression.md) | 機體、解鎖、成就、Dust Heat、每日種子、存檔格式 |
| [08-ui-ux.md](08-ui-ux.md) | 開局配裝、升級面板、幕間面板、合約 HUD、結算、圖鑑 |
| [09-architecture.md](09-architecture.md) | 新模組、資料契約、共用檔案的掛鉤、`rt.state` 新欄位 |
| [10-balance-sheet.md](10-balance-sheet.md) | 所有新數值的初始表與調整方法 |
| [11-phases-and-work-packages.md](11-phases-and-work-packages.md) | 分階段與子代理並行工作包、檔案所有權 |
| [12-acceptance.md](12-acceptance.md) | 驗收清單 |
| [13-risks.md](13-risks.md) | 風險與對策 |
| [14-p0-hook-contract.md](14-p0-hook-contract.md) | P0 完成後的實際掛鉤契約（P1 工作包依此實作） |

## 關鍵決策

- 版本：`0.4.0`。
- 排行榜：計分與難度改變，依平台規則改用新榜單 ID `dust-reign-score-v2`（`desc`、`分`、`0`–`9007199254740991`）。舊榜 `dust-reign-score` 由平台保留，遊戲不再提交到舊榜。
- 本機最高分：新增 v2 key，舊最高分只作「舊版紀錄」顯示，不與新分數比較（見 [07](07-meta-progression.md)）。
- 所有新內容沿用零依賴、純 Canvas 2D／ES modules、相對路徑與 sandbox iframe 相容。
