# I18N FREEZE / HOLD

Status as of master tip after PR #315 (Asia/Hong_Kong).

## FREEZE

- **Boss numbers / combat balance**: do not retune HP, damage, phases, timers, or drop rates in i18n/chrome passes.
- **Intentional Latin kept for players**:
  - Keycaps: `WASD`, `LMB`/`RMB`, `SPACE`, `SHIFT`, `START`, `ENTER`, `ESC`, `TAB`, pad `RT`/`LT`/`A` where they name physical controls.
  - Brand: `DUST//REIGN`, language toggle `ENG` / 繁中.
  - Units: `px`, `W`, numeric `T`/`階` tier marks when they are telemetry glyphs.

## HOLD (chrome / copy)

Player-facing zh/en chrome for HUD, pause, loadout, workshop, codex, campaign/hardcore briefs, tips, banners, floaters, and GO stamps is **held** unless:

1. New content ships without twins, or
2. A locale bug is filed (raw id, EN-only when zh, missing EN twin), or
3. Accessibility requires string or motion changes (follow `html.reduced-motion` + `prefers-reduced-motion`).

No VO / narration subtitle pipeline exists in-repo (`src/audio/audio-fx.js` is SFX only). Flavor lives in i18n dictionaries + data fallbacks.

## Arc complete (reference)

Recent continuous chrome/copy arc landed through:

| PR | Focus |
|----|--------|
| #305–#313 | Playroom/passives, hardcore briefs, tips, extract/push, EMP/VIP, workshop codes, MOD/VIP/MAX |
| #314 | Campaign star criteria, fusion/upgrade EMP lore, boss HP-bar subtitles, codex 生命/半徑 |
| #315 | Reduced-motion for stamps / fusion glow / bounty pulse |

Core table: `src/core/i18n.js` (`applyLanguage` / `syncStaticHtml` / `t*` helpers). HTML first-paint seeds stay zh-default with EN roundtrip.

## Extending later

1. Add both `zh` and `en` on every dictionary entry.
2. Prefer helpers (`tLog`, `tBanner`, `tCombatFloater`, `tCampaignStageStar`, …) over inline UI ternaries for shared copy.
3. Keep data-file display fallbacks aligned with i18n zh (see `campaign-stages.js`, `hardcore-operations.js`, `modules.js`).
4. Run `node scripts/self-check.mjs` (and `node scripts/test-i18n-verification.mjs` when DOM mock allows) before merge.
5. PR body: 問題 → 調整 → 玩家 + URL.

## Self-check

`node scripts/self-check.mjs` → `ok: true` on the tip that closed this HOLD note.
