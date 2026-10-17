// Campaign stages definition and sector configuration for DUST//REIGN Campaign Mode.
// 12 Core Sector stages + 3 Sector EX Trials = 15 total stages.

export var CAMPAIGN_SECTORS = [
  {
    id: 1,
    name: '暮沙荒原 (Sector 01: Dusk)',
    code: 'SEC-01',
    biome: 'dusk',
    reqStars: 0,
    desc: '無垠暮色沙海，巡遊清道夫與衝鋒蟲群出沒。',
    stages: ['stage_1_1', 'stage_1_2', 'stage_1_3', 'stage_1_4']
  },
  {
    id: 2,
    name: '鐵鏽熔坑 (Sector 02: Rust)',
    code: 'SEC-02',
    biome: 'rust',
    reqStars: 8,
    desc: '熔岩熾熱廢土，高溫地磚、遠程曲射砲與腐蝕酸液橫行。',
    stages: ['stage_2_1', 'stage_2_2', 'stage_2_3', 'stage_2_4']
  },
  {
    id: 3,
    name: '狂暴雷霆 (Sector 03: Storm)',
    code: 'SEC-03',
    biome: 'night',
    reqStars: 18,
    desc: '黑夜強風暴前線，迷霧收窄、硬光護盾與電磁尖塔肆虐。',
    stages: ['stage_3_1', 'stage_3_2', 'stage_3_3', 'stage_3_4']
  },
  {
    id: 4,
    name: '極限試煉 (Sector EX: Trials)',
    code: 'SEC-EX',
    biome: 'night',
    reqStars: 28,
    desc: '超越極限的絕望深淵，唯有精通全武裝之老兵方能踏足。',
    stages: ['stage_ex_1', 'stage_ex_2', 'stage_ex_3']
  }
];

export var CAMPAIGN_MILESTONES = [
  { stars: 5, reward: 'booster', id: 'emergency_overdrive', name: '戰術晶片【急救超頻】' },
  { stars: 10, reward: 'paint', id: 'paint_dusk_camo', name: '機體塗裝【暮沙迷彩】' },
  { stars: 15, reward: 'booster', id: 'resonant_emp', name: '戰術晶片【共振磁暴】' },
  { stars: 20, reward: 'paint', id: 'paint_rust_heavy', name: '機體塗裝【鐵鏽重工】' },
  { stars: 25, reward: 'booster', id: 'heavy_pierce', name: '戰術晶片【重裝穿甲】' },
  { stars: 30, reward: 'paint', id: 'paint_storm_emp', name: '機體塗裝【暴風電磁】' },
  { stars: 36, reward: 'mastery', id: 'paint_aurora_sovereign', name: '傳奇塗裝【極光神君】與稱號【APEX CONQUEROR】' }
];

export var CAMPAIGN_STAGES = [
  // ================= Sector 01: Dusk (暮沙) =================
  {
    id: 'stage_1_1',
    code: 'STAGE 1-1',
    name: '荒漠清道夫',
    sector: 1,
    sectorName: '暮沙荒原',
    biome: 'dusk',
    type: 'wave_wipeout',
    targetWaves: 3,
    targetQuota: 0,
    targetTime: 60,
    threat: 'LOW',
    desc: '視野開闊，中央爆炸桶，Rusher 衝刺群快速突襲。',
    recommended: { rig: 'scrapper', weapon: 'standard' },
    starCriteria: {
      star1: '擊破 3 波敵潮',
      star2: '60 秒內通關',
      star3: '剩餘 HP ≥ 80% 且完成 1 次桶殺'
    },
    enemyWeights: { rusher: 0.6, crawler: 0.4 },
    boss: null
  },
  {
    id: 'stage_1_2',
    code: 'STAGE 1-2',
    name: '廢料爭奪戰',
    sector: 1,
    sectorName: '暮沙荒原',
    biome: 'dusk',
    type: 'scrap_rush',
    targetWaves: 0,
    targetQuota: 100,
    targetTime: 75,
    threat: 'LOW',
    desc: '高熱流星墜落，四周持續刷新 Crawler 爬行怪群。',
    recommended: { rig: 'strider', weapon: 'arc-welder' },
    starCriteria: {
      star1: '收集 100 廢料',
      star2: '50 秒內提前達成',
      star3: '未被流星命中且 HP ≥ 75%'
    },
    enemyWeights: { crawler: 0.7, rusher: 0.3 },
    boss: null
  },
  {
    id: 'stage_1_3',
    code: 'STAGE 1-3',
    name: '刺穿前哨',
    sector: 1,
    sectorName: '暮沙荒原',
    biome: 'dusk',
    type: 'vip_hunt',
    targetWaves: 1,
    targetQuota: 2,
    targetTime: 90,
    threat: 'MEDIUM',
    desc: '2 隻高護甲精英 Brute，小怪無限掩護推進。',
    recommended: { rig: 'bulwark', weapon: 'vanguard' },
    starCriteria: {
      star1: '擊殺 2 隻精英 Brute',
      star2: '剩餘時間 ≥ 30 秒',
      star3: '重砲一擊同時命中兩隻目標'
    },
    enemyWeights: { brute: 0.3, rusher: 0.4, crawler: 0.3 },
    boss: null
  },
  {
    id: 'stage_1_4',
    code: 'STAGE 1-4',
    name: '雙臂泰坦試煉',
    sector: 1,
    sectorName: '暮沙荒原',
    biome: 'dusk',
    type: 'boss_duel',
    targetWaves: 1,
    targetQuota: 0,
    targetTime: 120,
    threat: 'HIGH',
    desc: '純招式拆解，Titan 巨拳砸地與旋轉激光掃射。',
    recommended: { rig: 'strider', weapon: 'breacher' },
    starCriteria: {
      star1: '擊敗 Titan 首領',
      star2: '90 秒內擊破',
      star3: '達成 3 次 Just Dash 且 P3 無傷'
    },
    enemyWeights: {},
    boss: 'titan'
  },

  // ================= Sector 02: Rust (鐵鏽) =================
  {
    id: 'stage_2_1',
    code: 'STAGE 2-1',
    name: '熔渣火線',
    sector: 2,
    sectorName: '鐵鏽熔坑',
    biome: 'rust',
    type: 'wave_wipeout',
    targetWaves: 4,
    targetQuota: 0,
    targetTime: 90,
    threat: 'MEDIUM',
    desc: '熔岩灼燒地磚，遠程曲射 Artillery 火砲登場封鎖路徑。',
    recommended: { rig: 'bulwark', weapon: 'vanguard' },
    starCriteria: {
      star1: '擊破 4 波敵潮',
      star2: '全程未踩入熔岩池',
      star3: '剩餘 HP ≥ 70% 且全殲火砲蟲'
    },
    enemyWeights: { artillery: 0.35, crawler: 0.35, rusher: 0.3 },
    boss: null
  },
  {
    id: 'stage_2_2',
    code: 'STAGE 2-2',
    name: '攔截物資車',
    sector: 2,
    sectorName: '鐵鏽熔坑',
    biome: 'rust',
    type: 'vip_hunt',
    targetWaves: 1,
    targetQuota: 1,
    targetTime: 60,
    threat: 'MEDIUM',
    desc: '裝甲貨車橫越戰場，兩側 Spitter 酸液護航。',
    recommended: { rig: 'salvager', weapon: 'breacher' },
    starCriteria: {
      star1: '摧毀裝甲護送車',
      star2: '車輛行駛過半前擊毀',
      star3: '收集車輛掉落的全數物資箱'
    },
    enemyWeights: { spitter: 0.4, crawler: 0.4, rusher: 0.2 },
    boss: null
  },
  {
    id: 'stage_2_3',
    code: 'STAGE 2-3',
    name: '陣地堅守 90 秒',
    sector: 2,
    sectorName: '鐵鏽熔坑',
    biome: 'rust',
    type: 'beacon_defense',
    targetWaves: 0,
    targetQuota: 0,
    targetTime: 90,
    threat: 'HIGH',
    desc: 'Scurrier 刺尾怪與酸液群圍攻中央數據塔。',
    recommended: { rig: 'bulwark', weapon: 'arc-welder' },
    starCriteria: {
      star1: '信號塔存活至計時結束',
      star2: '信號塔剩餘耐久 ≥ 75%',
      star3: '在防守光圈內累計停留 ≥ 45 秒'
    },
    enemyWeights: { scurrier: 0.45, spitter: 0.35, crawler: 0.2 },
    boss: null
  },
  {
    id: 'stage_2_4',
    code: 'STAGE 2-4',
    name: '鋼鐵巨艦滅絕',
    sector: 2,
    sectorName: '鐵鏽熔坑',
    biome: 'rust',
    type: 'boss_duel',
    targetWaves: 1,
    targetQuota: 0,
    targetTime: 140,
    threat: 'HIGH',
    desc: '全屏水雷陣、散彈高射砲與連續履帶撞角。',
    recommended: { rig: 'strider', weapon: 'standard' },
    starCriteria: {
      star1: '擊沉 Dreadnought',
      star2: '100 秒內完成擊殺',
      star3: '全程未受到水雷傷害'
    },
    enemyWeights: {},
    boss: 'dreadnought'
  },

  // ================= Sector 03: Storm (暴風) =================
  {
    id: 'stage_3_1',
    code: 'STAGE 3-1',
    name: '逆風肅清',
    sector: 3,
    sectorName: '狂暴雷霆',
    biome: 'night',
    type: 'wave_wipeout',
    targetWaves: 3,
    targetQuota: 0,
    targetTime: 75,
    threat: 'HIGH',
    desc: '周期性強風暴推力，彈道偏移，迷霧收窄。',
    recommended: { rig: 'scrapper', weapon: 'vanguard' },
    starCriteria: {
      star1: '肅清 3 波暴風敵潮',
      star2: '75 秒內通關',
      star3: '達成 10+ Chain Combo'
    },
    enemyWeights: { warden: 0.25, rusher: 0.35, brute: 0.2, scurrier: 0.2 },
    boss: null
  },
  {
    id: 'stage_3_2',
    code: 'STAGE 3-2',
    name: '電磁風暴尖塔',
    sector: 3,
    sectorName: '狂暴雷霆',
    biome: 'night',
    type: 'scrap_rush',
    targetWaves: 0,
    targetQuota: 150,
    targetTime: 90,
    threat: 'HIGH',
    desc: '2 座雷電共振尖塔，觸發全屏連鎖電弧。',
    recommended: { rig: 'salvager', weapon: 'arc-welder' },
    starCriteria: {
      star1: '收集 150 廢料',
      star2: '觸發至少 3 次尖塔共振',
      star3: '未消耗過 EMP 且 HP ≥ 70%'
    },
    enemyWeights: { crawler: 0.4, scurrier: 0.3, warden: 0.3 },
    boss: null
  },
  {
    id: 'stage_3_3',
    code: 'STAGE 3-3',
    name: '潛地破壞者',
    sector: 3,
    sectorName: '狂暴雷霆',
    biome: 'night',
    type: 'vip_hunt',
    targetWaves: 1,
    targetQuota: 3,
    targetTime: 100,
    threat: 'CRITICAL',
    desc: '鑽地無敵 Burrower + 相位硬光 Warden 協同進攻。',
    recommended: { rig: 'bulwark', weapon: 'breacher' },
    starCriteria: {
      star1: '擊殺 3 隻潛地巨蟲',
      star2: '破盾後 3 秒內擊斃守衛',
      star3: '剩餘 HP ≥ 80% 且 P2 無傷'
    },
    enemyWeights: { burrower: 0.35, warden: 0.35, brute: 0.3 },
    boss: null
  },
  {
    id: 'stage_3_4',
    code: 'STAGE 3-4',
    name: '暴風神君終局',
    sector: 3,
    sectorName: '狂暴雷霆',
    biome: 'night',
    type: 'boss_duel',
    targetWaves: 1,
    targetQuota: 0,
    targetTime: 150,
    threat: 'CRITICAL',
    desc: '4 座風暴塔護盾、風眼鎖定與雷暴天火。',
    recommended: { rig: 'strider', weapon: 'vanguard' },
    starCriteria: {
      star1: '擊敗 Storm Sovereign',
      star2: '110 秒內擊破神君',
      star3: '神君護盾無敵期間無傷'
    },
    enemyWeights: {},
    boss: 'sovereign'
  },

  // ================= Sector EX: Extreme Trials (極限試煉) =================
  {
    id: 'stage_ex_1',
    code: 'STAGE EX-1',
    name: '深淵生存試煉',
    sector: 4,
    sectorName: '極限試煉',
    biome: 'night',
    type: 'wave_wipeout',
    targetWaves: 5,
    targetQuota: 0,
    targetTime: 120,
    threat: 'CRITICAL',
    desc: '高密度全天敵混編敵潮，極限走位拉扯考驗。',
    recommended: { rig: 'bulwark', weapon: 'breacher' },
    starCriteria: {
      star1: '肅清 5 波極限混編敵潮',
      star2: '100 秒內通關',
      star3: '剩餘 HP ≥ 80% 且達成 15+ Chain'
    },
    enemyWeights: { brute: 0.25, warden: 0.25, spitter: 0.25, scurrier: 0.25 },
    boss: null
  },
  {
    id: 'stage_ex_2',
    code: 'STAGE EX-2',
    name: '虛空尖塔守衛',
    sector: 4,
    sectorName: '極限試煉',
    biome: 'night',
    type: 'beacon_defense',
    targetWaves: 0,
    targetQuota: 0,
    targetTime: 100,
    threat: 'CRITICAL',
    desc: '雙子尖塔電磁風暴，守護信號塔不被潛地蟲與硬光護盾摧毀。',
    recommended: { rig: 'salvager', weapon: 'arc-welder' },
    starCriteria: {
      star1: '極限信號塔防守 100 秒',
      star2: '信號塔剩餘耐久 ≥ 80%',
      star3: '在防守圈內累計停留 ≥ 60 秒且 HP ≥ 75%'
    },
    enemyWeights: { burrower: 0.3, warden: 0.3, scurrier: 0.2, brute: 0.2 },
    boss: null
  },
  {
    id: 'stage_ex_3',
    code: 'STAGE EX-3',
    name: '三位一體天譴',
    sector: 4,
    sectorName: '極限試煉',
    biome: 'night',
    type: 'boss_duel',
    targetWaves: 1,
    targetQuota: 0,
    targetTime: 180,
    threat: 'CRITICAL',
    desc: '終極首領巔峰決戰，連續高強度彈幕與雷暴洗禮。',
    recommended: { rig: 'strider', weapon: 'vanguard' },
    starCriteria: {
      star1: '擊潰終極暴風神君',
      star2: '120 秒內完成擊殺',
      star3: '神君狂暴階段無傷且達成 5 次 Just Dash'
    },
    enemyWeights: {},
    boss: 'sovereign'
  }
];

export function getCampaignStage(id) {
  var i;
  for (i = 0; i < CAMPAIGN_STAGES.length; i += 1) {
    if (CAMPAIGN_STAGES[i].id === id) return CAMPAIGN_STAGES[i];
  }
  return null;
}

