// Daily Mercenary Contracts (每日黑市懸賞合約)
// Deterministic selection of 3 daily bounties based on date string

export var BOUNTY_TEMPLATES = [
  // =========================================================================
  // Category 1: Agility & Maneuvers (身法與技巧)
  // =========================================================================
  {
    id: 'bounty_clean_streak',
    category: 'agility',
    title: 'Phantom Stride',
    titleZh: '絕影漫步',
    desc: 'Maintain a 10+ kill streak without taking hull damage for at least 20 seconds.',
    descZh: '在單場戰鬥中維持 10+ 連擊且無傷持續至少 20 秒。',
    goal: 20,
    unit: 's',
    scrapReward: 150
  },
  {
    id: 'bounty_just_master',
    category: 'agility',
    title: 'Edge Dancer',
    titleZh: '刀尖起舞',
    desc: 'Perform 8 successful Just Dashes in combat.',
    descZh: '在單局內成功觸發 8 次極限閃避 (Just Dash)。',
    goal: 8,
    unit: 'times',
    scrapReward: 160
  },
  {
    id: 'bounty_graze_king',
    category: 'agility',
    title: 'Graze Tempest',
    titleZh: '擦彈風暴',
    desc: 'Perform 20 danger grazes against enemy projectiles in combat.',
    descZh: '在單局內成功擦過敵方彈幕 20 次 (Graze)。',
    goal: 20,
    unit: 'grazes',
    scrapReward: 150
  },

  // =========================================================================
  // Category 2: Armory & Weapons (武器與特種殲滅)
  // =========================================================================
  {
    id: 'bounty_breacher_pointblank',
    category: 'weapon',
    title: 'Point-Blank Breach',
    titleZh: '貼臉破陣',
    desc: 'Kill 25 hostiles within 90px close range using the Breacher shotgun.',
    descZh: '使用 Breacher 散彈槍在距離敵方 90px 內貼臉消滅 25 隻敵人。',
    goal: 25,
    unit: 'kills',
    scrapReward: 180
  },
  {
    id: 'bounty_vanguard_pierce',
    category: 'weapon',
    title: 'Linear Annihilation',
    titleZh: '穿透射線',
    desc: 'Achieve 3 multi-kills (>= 3 hostiles destroyed in a single shot) with Vanguard.',
    descZh: '使用 Vanguard 充能穿透彈，完成 3 次單發貫穿擊殺 ≥ 3 隻敵人。',
    goal: 3,
    unit: 'pierces',
    scrapReward: 200
  },
  {
    id: 'bounty_arc_conductor',
    category: 'weapon',
    title: 'Grid Overload',
    titleZh: '連鎖電弧',
    desc: 'Neutralize 50 hostiles using Arc Welder lightning chain discharges.',
    descZh: '使用 Arc Welder 連鎖電弧擊潰累計 50 隻中小型敵人。',
    goal: 50,
    unit: 'kills',
    scrapReward: 170
  },

  // =========================================================================
  // Category 3: Hazard & Limits (極限契約與高風險)
  // =========================================================================
  {
    id: 'bounty_high_heat_rush',
    category: 'hazard',
    title: 'Scorched Protocol',
    titleZh: '高熱清道',
    desc: 'Survive to Wave 5 on Heat >= 1 without picking up any repair boxes.',
    descZh: '在熱度 Heat ≥ 1 難度下生存至第 5 波，期間不拾取任何維修修理箱。',
    goal: 5,
    unit: 'waves',
    scrapReward: 260
  },
  {
    id: 'bounty_titan_breaker',
    category: 'hazard',
    title: 'Colossus Disassembly',
    titleZh: '拆解巨像',
    desc: 'Destroy both left and right components of a Titan boss in combat.',
    descZh: '在戰場上成功摧毀 Titan 巨像的左右兩具反應裝甲附屬部件。',
    goal: 2,
    unit: 'parts',
    scrapReward: 300
  },
  {
    id: 'bounty_speed_sector',
    category: 'hazard',
    title: 'Blitz Protocol',
    titleZh: '疾速奇襲',
    desc: 'Achieve victory in any Campaign stage in under 60 seconds.',
    descZh: '在 60 秒以內極速通關任意戰役關卡。',
    goal: 1,
    unit: 'clears',
    scrapReward: 220
  }
];

export var GRAND_SLAM_BONUS = 250;

function hashString(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getBountiesForDate(dateStr) {
  var key = (typeof dateStr === 'string' && dateStr) ? dateStr : new Date().toISOString().slice(0, 10);
  var seed = hashString(key);

  var agilityPool = BOUNTY_TEMPLATES.filter(function (b) { return b.category === 'agility'; });
  var weaponPool = BOUNTY_TEMPLATES.filter(function (b) { return b.category === 'weapon'; });
  var hazardPool = BOUNTY_TEMPLATES.filter(function (b) { return b.category === 'hazard'; });

  var b1 = agilityPool[seed % agilityPool.length];
  var b2 = weaponPool[(Math.floor(seed / 3)) % weaponPool.length];
  var b3 = hazardPool[(Math.floor(seed / 7)) % hazardPool.length];

  return [
    { id: b1.id, progress: 0, goal: b1.goal, claimed: false, reward: b1.scrapReward },
    { id: b2.id, progress: 0, goal: b2.goal, claimed: false, reward: b2.scrapReward },
    { id: b3.id, progress: 0, goal: b3.goal, claimed: false, reward: b3.scrapReward }
  ];
}

export function getBountyTemplate(id) {
  for (var i = 0; i < BOUNTY_TEMPLATES.length; i += 1) {
    if (BOUNTY_TEMPLATES[i].id === id) return BOUNTY_TEMPLATES[i];
  }
  return null;
}
