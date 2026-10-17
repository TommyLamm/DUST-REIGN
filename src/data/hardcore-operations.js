// Hardcore Operations definition for DUST//REIGN Hardcore Mode.
// Deterministic tactical combat puzzles with fixed loadouts, severe handicaps, and weapon-counter enemy swarms.

export var HARDCORE_OPERATIONS = [
  {
    id: 'op_01',
    code: 'OP-01',
    name: '鋼鐵斷頭台',
    title: '【剃刀之舞】',
    lockedRig: 'strider',
    lockedWeapon: 'breacher',
    maxHpCap: 35,
    fixedDmgPercent: 0.50,
    famine: true,
    flashStorm: 15,
    windSpeed: 0,
    enemyCap: 55,
    spawnInterval: 0.28,
    eliteChance: 0.25,
    counterWeights: {
      artillery: 0.35,
      scurrier: 0.35,
      spitter: 0.30
    },
    bossOverride: {
      kind: 'titan',
      name: 'Titan「鐵砧」',
      modifier: '兩側加農砲全圖覆蓋，近身釋放 360° 反衝擊震波'
    },
    badge: 'razor_edge',
    badgeTitle: '[血染雙刃合金標記]',
    briefing: 'HP 鎖定 35；戰場常駐 2 台無敵重砲轟炸；Scurrier 死亡必自爆。同屏 55 隻迫擊砲+自爆+酸液天敵群。',
    tacticalHint: '利用 Dash 撞殺不觸發自爆底層代碼，滑步貼臉破防。'
  },
  {
    id: 'op_02',
    code: 'OP-02',
    name: '折光禁區',
    title: '【破鏡者】',
    lockedRig: 'scrapper',
    lockedWeapon: 'vanguard',
    maxHpCap: 45,
    fixedDmgPercent: 0.50,
    famine: true,
    flashStorm: 15,
    windSpeed: 0,
    enemyCap: 60,
    spawnInterval: 0.25,
    eliteChance: 0.40,
    mirrorEliteChance: 0.40,
    counterWeights: {
      rusher: 0.40,
      burrower: 0.30,
      crawler: 0.30
    },
    bossOverride: {
      kind: 'dreadnought',
      name: 'Dreadnought「晶壁要塞」',
      modifier: '正側面全反射稜鏡，唯正後方散熱閥為弱點；需 EMP 斷盾後貫穿'
    },
    badge: 'light_shatterer',
    badgeTitle: '[折光稜鏡破碎之眼]',
    briefing: '40% 精英帶 mirror 反射盾（反彈 100% 殺傷）；空槍反噬扣 6 HP；HP 鎖定 45。同屏 60 隻散開怪潮。',
    tacticalHint: 'EMP 破盾聚怪，創造直線貫穿視窗；切勿盲目對鏡面射擊。'
  },
  {
    id: 'op_03',
    code: 'OP-03',
    name: '超導熔毀',
    title: '【雷霆制約者】',
    lockedRig: 'bulwark',
    lockedWeapon: 'arc-welder',
    maxHpCap: 50,
    fixedDmgPercent: 0.50,
    famine: true,
    flashStorm: 15,
    windSpeed: 0,
    enemyCap: 55,
    spawnInterval: 0.26,
    eliteChance: 0.30,
    counterWeights: {
      brute: 0.40,
      warden: 0.35,
      crawler: 0.25
    },
    bossOverride: {
      kind: 'sovereign',
      name: 'Sovereign「法拉第之怒」',
      modifier: '4 座風暴塔連成電磁死刑場，射擊本體引發反向落雷；需切角逐一熔斷尖塔'
    },
    badge: 'thunder_binder',
    badgeTitle: '[高壓紫電球形禁錮鎖]',
    briefing: 'Brute 獲 70% 電弧抗性且免疫麻痺；Warden 護盾吸收電弧；HP 鎖定 50；維修廢料為 0。同屏 55 隻。',
    tacticalHint: '切角繞後死鎖 Warden，引爆環境炸藥造成真實傷害。'
  },
  {
    id: 'op_04',
    code: 'OP-04',
    name: '暴雨殘彈',
    title: '【狂瀾獨挽】',
    lockedRig: 'salvager',
    lockedWeapon: 'standard',
    maxHpCap: 40,
    fixedDmgPercent: 0.50,
    famine: true,
    flashStorm: 15,
    windSpeed: 0,
    enemyCap: 65,
    spawnInterval: 0.22,
    eliteChance: 0.25,
    counterWeights: {
      crawler: 0.50,
      rusher: 0.30,
      brute: 0.20
    },
    bossOverride: {
      kind: 'titan',
      name: 'Titan「百臂巨神」',
      modifier: '4 門旋轉火神機槍，全圖交叉環形密集彈幕'
    },
    badge: 'tide_turner',
    badgeTitle: '[黑色雙聯彈殼交錯之印]',
    briefing: '同屏實體強制鎖定 65 隻；連續開火超過 1.8s 散布擴大 250%（強迫點射）；HP 鎖定 40。',
    tacticalHint: '嚴格 3 連發控槍點射，走長蛇陣拉扯並結合 Just Dash 衝擊波。'
  },
  {
    id: 'op_05',
    code: 'OP-05',
    name: '奇點深淵',
    title: '【奇點獵手】',
    lockedRig: 'strider',
    lockedWeapon: 'vanguard',
    maxHpCap: 30,
    fixedDmgPercent: 0.50,
    famine: true,
    flashStorm: 15,
    windSpeed: 40,
    enemyCap: 50,
    spawnInterval: 0.25,
    eliteChance: 0.35,
    counterWeights: {
      scurrier: 0.40,
      rusher: 0.35,
      brute: 0.25
    },
    bossOverride: {
      kind: 'dreadnought',
      name: 'Dreadnought「暗質主宰」',
      modifier: '發射黑洞坍縮力場彈，強吸力阻斷拉扯'
    },
    badge: 'singularity_hunter',
    badgeTitle: '[深空坍縮黑洞紫金徽印]',
    briefing: '戰場徘徊 2 個移動引力奇點（扭曲彈道）；可視半徑縮小至 280px；HP 鎖定 30（兩擊必殺）。固定 blink + volatile 瞬移自爆暗殺隊。',
    tacticalHint: '精準預判奇點引力引導彈道，優先狙殺瞬移暗殺者。'
  },
  {
    id: 'op_06',
    code: 'OP-06',
    name: '諸神黃昏風暴',
    title: '【沙海霸主】',
    lockedRig: 'bulwark',
    lockedWeapon: 'breacher',
    maxHpCap: 40,
    fixedDmgPercent: 0.50,
    famine: true,
    flashStorm: 15,
    windSpeed: 110,
    enemyCap: 65,
    spawnInterval: 0.20,
    eliteChance: 0.35,
    counterWeights: {
      artillery: 0.25,
      spitter: 0.25,
      warden: 0.25,
      scurrier: 0.25
    },
    bossOverride: {
      kind: 'sovereign',
      name: 'Sovereign「終焉風皇」',
      modifier: '4 座風暴塔連線，旋轉風刃與全屏密集天火，極致走位考驗'
    },
    badge: 'apex_conqueror',
    badgeTitle: '[終焉風暴皇冠黃金神聖徽章]',
    briefing: '永久 8 級黑風暴（風速 110px/s，散彈射程縮減 35%）；單次受擊扣 50% HP；零掉落。全天敵混編（同屏 65 隻，精英 35%）。',
    tacticalHint: '順應強風走位，利用重裝推進與 EMP 創造破局契機。'
  }
];

export function getHardcoreOperation(id) {
  var i;
  for (i = 0; i < HARDCORE_OPERATIONS.length; i += 1) {
    if (HARDCORE_OPERATIONS[i].id === id) return HARDCORE_OPERATIONS[i];
  }
  return null;
}

