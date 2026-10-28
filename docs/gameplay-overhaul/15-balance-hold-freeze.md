# 15 — Balance HOLD / FREEZE (post-#251)

Living note for future balance work. **Do not reopen falsified levers** without a dual-verify plan that protects clear15 and Dread near-band.

Verified baseline (skilled×12×seeds `{41,77,131}` · `--world`):

| Metric | HOLD | Notes |
|--------|------|--------|
| Titan p50 | ~40.5s | Target band 40–70 |
| Titan under40 / inBand / over70 | 18 / 14 / 4 | under40 treated as **debt**, not absorb chase |
| Dread p50 | ~57.6s | **Accept near-band ~55–60** |
| Dread fast / slow / ext | ~11% / ~47% / 16 | Long kite → clear15 time-cap |
| Sovereign n / p50 | ~25 / ~76–87 | Variance OK; no hull thrash |
| clear15 (gate reach) | ~69.4% | Failures = long Dread clock, not early deaths |

Active dampeners to **keep**:

- Boss-alive scrap XP × **0.55**
- Titan `coreAbsorption` **0.72**
- Dread unbroken plating × **0.85**
- Dread kite-fatigue vuln @ fightT **180 / 300** (×1.15 / ×1.30)

## Falsified forever (this arc)

Do **not** retune these for Dread p50 or Titan left-tail without explicit dual-verify (Dread ≥~55, clear15 ~69):

| Lever | Evidence |
|-------|----------|
| Dread break bleed | Reverted / rejected earlier in arc |
| Dread idle mult | Falsified |
| Dread telegraph DR churn | Falsified |
| Dread charge DR / chargeMaxDist | Falsified |
| Late-cycle / lane-bait spam | Falsified |
| Dread hull HP spam | Falsified |
| Dread stun window trim | Reverted (#230 family) |
| Titan mild left-tail absorb **0.76** + harpoon **1.2s** | **#238** → clear15 69→58, Dread p50→173; full revert **#239** |

Also closed:

- Weapons balance thrash
- Sovereign hull thrash

## UX / teaching (safe continuous lane)

Tips and i18n only — no HP/DR/scrap/absorb/stun/cd/spawn:

- Mid/late: scurrier, burrower, warden, mine, artillery, elite, storm-tower, titan-parts, dread-clock, OT prowler/bulwark/behemoth
- Campaign EN twins + threat/types (#252–#253)
- Hardcore EN twins (#254)
- Clock-fail GO kicker when long Dread warned (#246)
- Telegraph / hazard **visual** contrast only (#260–#261): stroke/alpha/color — never timing/duration/cd/spawn/HP/DR

## Dual-verify rule (if numbers ever change)

1. skilled×12×`{41,77,131}` `--world`
2. Must **not** dump Dread out of ~55+ near-band
3. Must **not** dump clear15 much below ~69
4. Prefer tiny absorb/parts/tele nudges over big swings; **revert** if bands break

## Code anchors

- Titan absorb: `src/systems/spawning.js` (`coreAbsorption: 0.72`, LEFT-TAIL FALSIFIED comment)
- Dread plating / fatigue: `src/systems/sim/enemy-registry.js`
- Scrap dampen: `src/systems/.../orbs` / boss-alive XP path (scrap×0.55)
- Tips: `src/ui/tips.js` + `src/core/i18n.js` `tTip`

Master at writeup: post-#254. Update this table when a verified skilled suite lands.
