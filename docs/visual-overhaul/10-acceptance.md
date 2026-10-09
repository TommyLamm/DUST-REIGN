# 10 驗收清單

[返回索引](README.md)

## 程式與成品

- [ ] `node --check` 全部 `src/**/*.js` 通過。
- [ ] `node scripts/self-check.mjs` 全數通過（玩法數值未變）。
- [ ] `node scripts/stage-release.mjs` 通過，白名單未遺漏新檔案。
- [ ] 平台 `main` 最新工具 `game:pack` + `game:validate` 通過。

## 實際遊玩

- [ ] 真實瀏覽器於子目錄 + 跨來源 sandbox iframe 內：開始、主要玩法、升級、暫停、死亡、重新開始全部正常。
- [ ] Console 無錯誤、無缺失資源、無外部網路請求（Playroom SDK 除外）。
- [ ] Playroom 訪客 / 預覽模式仍可完整遊玩，成績流程未受影響。
- [ ] 舊存檔（最高分、音量、靜音、震動、減動效、高對比）讀取正常。

## 效能與畫質

- [ ] 桌面 HIGH 戰鬥與 Titan 波平均 60fps。
- [ ] 手機直向 MEDIUM 平均 45fps 以上。
- [ ] AUTO 降級實際觸發並生效。
- [ ] 四種畫質切換即時生效、設定重新載入後保留。

## 可讀性與無障礙

- [ ] 敵彈、迫擊砲預警、Rusher 衝刺預警在所有畫質與風暴期間都清楚可辨。
- [ ] Reduced Motion 與高對比逐項符合 [08-accessibility.md](08-accessibility.md)。

## 截圖紀錄

- [ ] 桌面與手機截圖（開始、戰鬥、風暴、Titan、升級、暫停、結算）存到 `output/playwright/v030-*.png`。

無法執行的項目必須列為未驗證，不得以推測或只成功 build 宣稱通過。自動檢查不能取代管理員在平台上的實際遊玩預覽。
