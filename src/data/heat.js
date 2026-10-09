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
    repairHeal: h >= 3 ? 12 : 18,
    stormSeconds: h >= 4 ? 8 : 5,
    bulletSpeedScale: h >= 4 ? 1.15 : 1,
    bossPhaseEarly: h >= 5 ? 0.1 : 0,
    startingRerolls: h >= 5 ? 0 : 1,
    scoreMultiplier: 1 + 0.15 * h,
    extractBonus: 5000 + 1000 * h
  };
}
