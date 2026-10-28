export var HEAT_MAX = 5;

export function getHeatModifiers(heat) {
  var h = heat | 0;
  if (h < 0) h = 0;
  if (h > HEAT_MAX) h = HEAT_MAX;
  return {
    heat: h,
    enemyHpScale: 1 + 0.1 * h,
    enemyDmgScale: 1 + 0.05 * h,
    eliteAffixMinWave: h >= 2 ? 3 : 4,
    eliteChanceBonus: h >= 2 ? 0.03 : 0,
    // Keep scrap heal at 18 for all Heat. Cutting to 12 at Heat≥3 stacked with
    // enemyHpScale/enemyDmgScale and created a scissors (less heal, tougher foes).
    // Overflow-to-score stays REPAIR_OVERFLOW_SCORE (12) in config — not heat-gated.
    repairHeal: 18,
    stormSeconds: h >= 4 ? 8 : 5,
    bulletSpeedScale: h >= 4 ? 1.15 : 1,
    bossPhaseEarly: h >= 5 ? 0.1 : 0,
    startingRerolls: h >= 5 ? 0 : 1,
    scoreMultiplier: 1 + 0.15 * h,
    extractBonus: 5000 + 1000 * h
  };
}
