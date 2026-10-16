// The Scrapyard Workshop (廢料改裝工坊) Chassis Modules Specification
// 3 Branches: Propulsion (動力), Armor (裝甲), Tactical (戰術)
// Max Energy Loadout: 6 Wattage (6⚡)

export var MODULE_BRANCHES = ['propulsion', 'armor', 'tactical'];
export var MAX_WATTAGE = 6;

export var MODULES = [
  // =========================================================================
  // Branch A: Propulsion (動力推進)
  // =========================================================================
  {
    id: 'm_phase_bearing',
    code: 'M-01',
    branch: 'propulsion',
    name: 'Phase-Overdrive Bearing',
    nameZh: '相位超載軸承',
    wattage: 1,
    tierCosts: [80, 180, 350],
    tradeOff: {
      stat: 'moveSpeed',
      value: -0.05,
      desc: 'Base move speed -5%',
      descZh: '機體常態移動速度 -5%'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'Just Dash window +25%',
        bonusDescZh: 'Just Dash 判定視窗 +25%',
        justDashWindowBonus: 0.25,
        dashInvulnBonus: 0,
        justDashCooldownReset: false
      },
      {
        tier: 2,
        bonusDesc: 'Just Dash window +40%, invulnerability +0.10s',
        bonusDescZh: 'Just Dash 判定視窗 +40%，無敵時間 +0.10s',
        justDashWindowBonus: 0.40,
        dashInvulnBonus: 0.10,
        justDashCooldownReset: false
      },
      {
        tier: 3,
        bonusDesc: 'Just Dash window +40%, invulnerability +0.10s; Just Dash resets dash cooldown (max once per 4s)',
        bonusDescZh: 'Just Dash 判定視窗 +40%，無敵時間 +0.10s；觸發 Just Dash 立即重置衝刺冷卻 (每 4 秒最多 1 次)',
        justDashWindowBonus: 0.40,
        dashInvulnBonus: 0.10,
        justDashCooldownReset: true
      }
    ]
  },
  {
    id: 'm_vector_thruster',
    code: 'M-02',
    branch: 'propulsion',
    name: 'Vector Thruster Array',
    nameZh: '向量推力陣列',
    wattage: 2,
    tierCosts: [120, 240, 450],
    tradeOff: {
      stat: 'dashDistance',
      value: 0.15,
      desc: 'Dash distance +15% (overshoot risk in tight zones)',
      descZh: '衝刺位移距離 +15%（狹窄區域易失控撞擊彈幕）'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'Move speed +12%',
        bonusDescZh: '常規移動速度 +12%',
        moveSpeedBonus: 0.12,
        plasmaTrail: false,
        plasmaTrailSlow: false
      },
      {
        tier: 2,
        bonusDesc: 'Move speed +18%; Dash leaves a 1.5s plasma trail (40 DPS)',
        bonusDescZh: '常規移動速度 +18%；衝刺身後留下一道持續 1.5 秒的電漿烈焰 (40 DPS)',
        moveSpeedBonus: 0.18,
        plasmaTrail: true,
        plasmaTrailSlow: false
      },
      {
        tier: 3,
        bonusDesc: 'Move speed +18%; Dash plasma trail deals 40 DPS and slows enemies by 35%',
        bonusDescZh: '常規移動速度 +18%；衝刺電漿烈焰造成 40 DPS 並附加 35% 緩速力場',
        moveSpeedBonus: 0.18,
        plasmaTrail: true,
        plasmaTrailSlow: true
      }
    ]
  },
  {
    id: 'm_kinetic_turbine',
    code: 'M-03',
    branch: 'propulsion',
    name: 'Kinetic Recoil Turbine',
    nameZh: '動能反衝渦輪',
    wattage: 3,
    tierCosts: [180, 360, 650],
    tradeOff: {
      stat: 'grazeRadius',
      value: -0.10,
      desc: 'Graze danger radius -10% (requires tighter grazing)',
      descZh: '極限擦彈判定半徑 -10%（要求極致貼身擦彈）'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'Each graze generates 1 Kinetic Charge (max 10)',
        bonusDescZh: '每次極限擦彈累積 1 點動能（上限 10 點）',
        grazeKineticCharge: true,
        dashDetonateKinetic: false,
        kineticKnockbackDamage: 0
      },
      {
        tier: 2,
        bonusDesc: 'Each graze generates Kinetic Charge; Dash detonates charges to push enemies and clear bullets',
        bonusDescZh: '擦彈累積動能；衝刺引爆所有動能，擊退周圍敵兵並消除近身敵彈',
        grazeKineticCharge: true,
        dashDetonateKinetic: true,
        kineticKnockbackDamage: 0
      },
      {
        tier: 3,
        bonusDesc: 'Dash kinetic detonation pushes enemies, clears bullets, and deals 15% max HP damage to pushed hostiles',
        bonusDescZh: '衝刺引爆動能消彈並擊退敵軍，遭衝撞擊退的敵人受到其最大生命 15% 物理傷害',
        grazeKineticCharge: true,
        dashDetonateKinetic: true,
        kineticKnockbackDamage: 0.15
      }
    ]
  },

  // =========================================================================
  // Branch B: Armor (重裝防禦)
  // =========================================================================
  {
    id: 'b_reactive_plasma',
    code: 'B-01',
    branch: 'armor',
    name: 'Reactive Plasma Plating',
    nameZh: '反應式電漿裝甲',
    wattage: 2,
    tierCosts: [100, 220, 420],
    tradeOff: {
      stat: 'hitboxRadius',
      value: 0.06,
      desc: 'Player hitbox radius +6%',
      descZh: '機體受擊判定框半徑微增 6%'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'Taking >18 damage releases a 120px micro-EMP clearing bullets (18s CD)',
        bonusDescZh: '單次受傷大於 18 點時釋放微型 EMP，消除半徑 120px 內敵彈 (冷卻 18s)',
        empRadius: 120,
        empCooldown: 18,
        stunDuration: 0
      },
      {
        tier: 2,
        bonusDesc: 'Micro-EMP radius increased to 160px with 12s cooldown',
        bonusDescZh: '微型 EMP 半徑增至 160px，冷卻縮短至 12s',
        empRadius: 160,
        empCooldown: 12,
        stunDuration: 0
      },
      {
        tier: 3,
        bonusDesc: 'Micro-EMP radius 160px (12s CD) and stuns nearby medium/small enemies for 1.0s',
        bonusDescZh: '微型 EMP 半徑 160px (冷卻 12s)，並短暫眩暈周圍中小型敵兵 1.0 秒',
        empRadius: 160,
        empCooldown: 12,
        stunDuration: 1.0
      }
    ]
  },
  {
    id: 'b_scrap_bulkhead',
    code: 'B-02',
    branch: 'armor',
    name: 'Scrap Weave Bulkhead',
    nameZh: '廢料重構裝甲',
    wattage: 1,
    tierCosts: [90, 200, 380],
    tradeOff: {
      stat: 'repairRadius',
      value: -0.15,
      desc: 'Repair pack pickup radius -15%',
      descZh: '修復箱拾取半徑 -15%（須肉身冒險靠近拾取）'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'Over-repair health converts into temporary shield armor (up to 15)',
        bonusDescZh: '拾取修復廢料時，溢出生命轉化為暫時性護甲（最高 15 點）',
        tempArmorCap: 15,
        collisionDmgReduction: 0
      },
      {
        tier: 2,
        bonusDesc: 'Temporary shield armor cap increased to 30',
        bonusDescZh: '暫時性護甲上限提升至 30 點',
        tempArmorCap: 30,
        collisionDmgReduction: 0
      },
      {
        tier: 3,
        bonusDesc: 'Temporary shield cap 30; while shield holds, collision damage taken is reduced by 20%',
        bonusDescZh: '暫時護甲上限 30 點；只要護甲存在，受到的碰撞傷害 -20%',
        tempArmorCap: 30,
        collisionDmgReduction: 0.20
      }
    ]
  },
  {
    id: 'b_aegis_core',
    code: 'B-03',
    branch: 'armor',
    name: 'Aegis Protocol Core',
    nameZh: '應急耐力隔離艙',
    wattage: 3,
    tierCosts: [220, 450, 800],
    tradeOff: {
      stat: 'maxHp',
      value: -0.15,
      desc: 'Chassis base max HP -15%',
      descZh: '機體基礎最大生命值上限 -15%'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'Survive fatal damage with 1 HP and 1.5s invulnerability (once per run)',
        bonusDescZh: '受到致命傷時免死，保留 1 點生命並進入 1.5 秒無敵 (每場限 1 次)',
        invulnDuration: 1.5,
        burstSpeed: 1.0,
        refillEmp: false
      },
      {
        tier: 2,
        bonusDesc: 'Fatal blow invulnerability extended to 2.5s with +60% escape move speed',
        bonusDescZh: '免死無敵時間延長至 2.5 秒，並獲得 +60% 爆發移速逃生',
        invulnDuration: 2.5,
        burstSpeed: 1.6,
        refillEmp: false
      },
      {
        tier: 3,
        bonusDesc: 'Fatal blow 2.5s invulnerability, +60% burst speed, and instantly refills 100% EMP energy',
        bonusDescZh: '免死 2.5 秒無敵，+60% 爆發移速，並立刻補滿 100% EMP 能量',
        invulnDuration: 2.5,
        burstSpeed: 1.6,
        refillEmp: true
      }
    ]
  },

  // =========================================================================
  // Branch C: Tactical (戰術超頻)
  // =========================================================================
  {
    id: 'c_resonance_fc',
    code: 'C-01',
    branch: 'tactical',
    name: 'Resonance Fire Control',
    nameZh: '諧振引導火控',
    wattage: 2,
    tierCosts: [110, 240, 460],
    tradeOff: {
      stat: 'streakDropPenalty',
      value: 1.5,
      desc: 'Streak loss triggers 1.5s weapon cooldown penalty (overheat)',
      descZh: '連擊中斷時觸發 1.5 秒武器過熱冷卻懲罰'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'While Kill Streak >= 6, Critical Hit chance +10%',
        bonusDescZh: '連擊數 (Streak) ≥ 6 時，暴擊率 +10%',
        critChanceBonus: 0.10,
        critDmgBonus: 0,
        chainExplosion: false
      },
      {
        tier: 2,
        bonusDesc: 'Streak >= 6: Crit +10%; Streak >= 12: Critical damage +35%',
        bonusDescZh: '連擊 ≥ 6 暴擊率 +10%；連擊 ≥ 12 暴擊傷害額外 +35%',
        critChanceBonus: 0.10,
        critDmgBonus: 0.35,
        chainExplosion: false
      },
      {
        tier: 3,
        bonusDesc: 'Streak bonuses; Critical kills have 25% chance to trigger chain explosions',
        bonusDescZh: '連擊增益；暴擊擊殺敵人有 25% 機率產生連鎖爆炸',
        critChanceBonus: 0.10,
        critDmgBonus: 0.35,
        chainExplosion: true
      }
    ]
  },
  {
    id: 'c_flux_condenser',
    code: 'C-02',
    branch: 'tactical',
    name: 'Flux Chamber Condenser',
    nameZh: '磁通壓縮彈膛',
    wattage: 1,
    tierCosts: [90, 190, 370],
    tradeOff: {
      stat: 'recoil',
      value: 0.20,
      desc: 'Weapon recoil impulse +20%',
      descZh: '武器基礎射擊後座力增加 20%'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'Vanguard charge time -20%, spread angle -15%',
        bonusDescZh: 'Vanguard 充能時間 -20%，散彈擴散角 -15%',
        chargeTimeMult: 0.80,
        spreadMult: 0.85,
        bulletSpeedMult: 1.0,
        shatterArmor: false
      },
      {
        tier: 2,
        bonusDesc: 'Vanguard charge time -35%, bullet velocity +25%',
        bonusDescZh: '充能時間 -35%，子彈飛行速度 +25%',
        chargeTimeMult: 0.65,
        spreadMult: 0.85,
        bulletSpeedMult: 1.25,
        shatterArmor: false
      },
      {
        tier: 3,
        bonusDesc: 'Charge -35%, bullet speed +25%; Pierced first enemy armor shattered (+20% damage taken for 4s)',
        bonusDescZh: '充能 -35%，速度 +25%；穿透的首個敵人護甲粉碎（受到的後續傷害 +20%，持續 4s）',
        chargeTimeMult: 0.65,
        spreadMult: 0.85,
        bulletSpeedMult: 1.25,
        shatterArmor: true
      }
    ]
  },
  {
    id: 'c_surge_unit',
    code: 'C-03',
    branch: 'tactical',
    name: 'Black-Market Surge Unit',
    nameZh: '黑市調頻過載器',
    wattage: 3,
    tierCosts: [200, 420, 750],
    tradeOff: {
      stat: 'empClear',
      value: 0,
      desc: 'EMP loses bullet-clearing shockwave and enemy stun',
      descZh: '失去 EMP 原本的全場清彈幕與擊暈控制功能'
    },
    tiers: [
      {
        tier: 1,
        bonusDesc: 'EMP converts to Overload Surge: +40% weapon fire rate for 5s',
        bonusDescZh: 'EMP 轉化為【過載充能】：5 秒內武器射速提升 40%',
        fireRateBonus: 0.40,
        moveSpeedBonus: 0,
        killExtension: false
      },
      {
        tier: 2,
        bonusDesc: 'Overload Surge: +40% fire rate, +15% move speed, and zero weapon heat',
        bonusDescZh: '過載充能：射速 +40%，移動速度 +15%，射擊零過熱',
        fireRateBonus: 0.40,
        moveSpeedBonus: 0.15,
        killExtension: false
      },
      {
        tier: 3,
        bonusDesc: 'Overload Surge: +40% fire rate, +15% speed; Each kill extends duration by 0.5s (up to +3s)',
        bonusDescZh: '過載充能：射速 +40%，移速 +15%；期間每擊殺 1 個敵人延長 0.5 秒（最多延長 3 秒）',
        fireRateBonus: 0.40,
        moveSpeedBonus: 0.15,
        killExtension: true
      }
    ]
  }
];

export function getModule(id) {
  for (var i = 0; i < MODULES.length; i += 1) {
    if (MODULES[i].id === id) return MODULES[i];
  }
  return null;
}

export function getModuleCost(id, currentTier) {
  var mod = getModule(id);
  if (!mod) return 0;
  var targetTier = currentTier + 1;
  if (targetTier < 1 || targetTier > 3) return 0;
  return mod.tierCosts[targetTier - 1] || 0;
}

export function getModuleTierData(id, tier) {
  var mod = getModule(id);
  if (!mod || tier < 1 || tier > 3) return null;
  return mod.tiers[tier - 1] || null;
}
