// DUST//REIGN Internationalization (i18n) module.
// Supports English ('en') and Traditional Chinese ('zh' / 'zh-Hant').

export var LANG_KEY = 'dust-reign:lang:v1';
export var LEGACY_LANG_KEY = 'dust_reign_lang';

function getStore() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch (e) {}
  return null;
}

// Default to Traditional Chinese ('zh') for localized distribution, with fallback to saved setting.
var currentLang = 'zh';

export function loadLanguage() {
  try {
    var storage = getStore();
    if (storage) {
      var savedNew = storage.getItem(LANG_KEY);
      if (savedNew === 'en' || savedNew === 'zh') {
        currentLang = savedNew;
        return currentLang;
      }
      var savedLegacy = storage.getItem(LEGACY_LANG_KEY);
      if (savedLegacy === 'en' || savedLegacy === 'zh') {
        currentLang = savedLegacy;
        // Smooth migration: write to new standard key
        storage.setItem(LANG_KEY, currentLang);
        return currentLang;
      }
    }
  } catch (e) {
    currentLang = 'zh';
  }
  return currentLang;
}

loadLanguage();

var listeners = [];

export function getLanguage() {
  return currentLang;
}

export function isChinese() {
  return currentLang === 'zh';
}

export function onLanguageChange(fn) {
  if (typeof fn === 'function' && listeners.indexOf(fn) === -1) {
    listeners.push(fn);
  }
  return function () {
    var idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function setLanguage(lang) {
  var next = lang === 'en' ? 'en' : 'zh';
  currentLang = next;
  try {
    var storage = getStore();
    if (storage) {
      storage.setItem(LANG_KEY, next);
      storage.setItem(LEGACY_LANG_KEY, next);
    }
  } catch (e) {}

  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = next === 'zh' ? 'zh-Hant' : 'en';
    }
  } catch (e) {}

  syncStaticHtml(next);

  for (var i = 0; i < listeners.length; i += 1) {
    try {
      listeners[i](next);
    } catch (err) {}
  }

  return currentLang;
}

export function toggleLanguage() {
  return setLanguage(currentLang === 'zh' ? 'en' : 'zh');
}

// =========================================================================
// TRANSLATION DICTIONARIES
// =========================================================================

var UPGRADES_I18N = {
  'rapid-fire': {
    title: { zh: '快速射擊', en: 'RAPID FIRE' },
    text: { zh: '射擊速度提升 12%', en: 'Fire 12% faster' }
  },
  'scatter-shot': {
    title: { zh: '散射重彈', en: 'SCATTER SHOT' },
    text: { zh: '武器傷害 +5', en: '+5 weapon damage' }
  },
  'heavy-plating': {
    title: { zh: '重型裝甲', en: 'HEAVY PLATING' },
    text: { zh: '最大裝甲 +25 並修復 40 點生命', en: '+25 max health and heal 40 HP' }
  },
  'overdrive-injector': {
    title: { zh: '超頻注射器', en: 'OVERDRIVE INJECTOR' },
    text: { zh: '超頻持續時間 +2.5s 並觸發 3.5s 湧浪', en: '+2.5s Overdrive length and trigger 3.5s Surge' }
  },
  'magnet-core': {
    title: { zh: '磁吸核心', en: 'MAGNET CORE' },
    text: { zh: '磁吸範圍 +65px 且廢料經驗 +25%', en: '+65px magnet reach & +25% scrap XP' }
  },
  'hot-load': {
    title: { zh: '高速裝藥', en: 'HOT LOAD' },
    text: { zh: '子彈飛行速度 +180 且體積增大', en: '+180 bullet speed and size' }
  },
  'rail-slug': {
    title: { zh: '軌道貫穿彈', en: 'RAIL SLUG' },
    text: { zh: '子彈可貫穿 1 名敵人 (保留 70% 傷害)', en: 'Bullets pierce 1 enemy (70% damage retention)' }
  },
  'ricochet': {
    title: { zh: '動能彈跳', en: 'KINETIC RICOCHET' },
    text: { zh: '子彈碰觸螢幕邊緣可彈跳 1 次 (90% 速度)', en: 'Bullets bounce off screen border 1 time (90% speed)' }
  },
  'shockwave-dash': {
    title: { zh: '衝擊波衝刺', en: 'SHOCKWAVE DASH' },
    text: { zh: '衝刺脈衝半徑擴大至 125px，擊退力翻倍', en: 'Dash pulse radius expands to 125px with 2x knockback' }
  },
  'tesla-coil': {
    title: { zh: '特斯拉線圈', en: 'TESLA COIL' },
    text: { zh: '拾取晶球時釋放電擊，最多電擊 2 名敵人造成 22 點傷害', en: 'Orb collection zaps up to 2 foes for 22 dmg' }
  },
  'reactive-armor': {
    title: { zh: '反應裝甲', en: 'REACTIVE ARMOR' },
    text: { zh: '受到傷害時釋放 360° 防衛脈衝 (75px, 30 傷害)', en: 'Taking damage releases a 360° defensive pulse (75px, 30 dmg)' }
  },
  'high-caliber': {
    title: { zh: '大口徑重彈', en: 'HIGH CALIBER' },
    text: { zh: '暴擊傷害提升至 2.2x 且固定暴擊率 +20%', en: 'Crit damage boosted to 2.2x & 20% flat crit chance' }
  },
  'servo-legs': {
    title: { zh: '伺服足肢', en: 'SERVO LEGS' },
    text: { zh: '移動速度 +8%', en: 'Move speed +8%' }
  },
  'dash-capacitor': {
    title: { zh: '衝刺電容', en: 'DASH CAPACITOR' },
    text: { zh: '衝刺可儲備 2 次充能，各自獨立冷卻', en: 'Dash stores 2 charges, each regenerating on its own cooldown' }
  },
  'ablative-mesh': {
    title: { zh: '燒蝕護網', en: 'ABLATIVE MESH' },
    text: { zh: '所受傷害 ×0.92 (最少 1 點)', en: 'Damage taken ×0.92 (minimum 1)' }
  },
  'salvage-protocol': {
    title: { zh: '回收協議', en: 'SALVAGE PROTOCOL' },
    text: { zh: '非蠻卒敵人掉落維修廢料機率 +6%', en: 'Non-brute kills drop repair scrap +6%' }
  },
  'capacitor-bank': {
    title: { zh: '電容儲能庫', en: 'CAPACITOR BANK' },
    text: { zh: '電池上限 +25 且每秒回復 +0.5', en: 'Battery +25 max and +0.5 regen per second' }
  },
  'emp-amplifier': {
    title: { zh: 'EMP 放大器', en: 'EMP AMPLIFIER' },
    text: { zh: 'EMP 半徑 +40 且消耗能量由 50 降至 40', en: 'EMP radius +40 and energy cost 50 → 40' }
  },
  'hollow-point': {
    title: { zh: '空尖空心彈', en: 'HOLLOW POINT' },
    text: { zh: '對生命低於 30% 的敵人造成 +35% 傷害', en: '+35% damage to enemies below 30% HP' }
  },
  'afterburner': {
    title: { zh: '後燃推進器', en: 'AFTERBURNER' },
    text: { zh: '衝刺後 1 秒內，射擊冷卻時間 ×0.7', en: 'For 1s after a dash, fire cooldown ×0.7' }
  },
  'tracer-rounds': {
    title: { zh: '曳光追蹤彈', en: 'TRACER ROUNDS' },
    text: { zh: '每第 5 發子彈貫穿數 +2 且必定暴擊。精通等級 +1', en: 'Every 5th round pierces +2 and always crits. Mastery +1' }
  },
  'flechette-pack': {
    title: { zh: '箭彈散布包', en: 'FLECHETTE PACK' },
    text: { zh: '彈丸數 +2 且散布角 -10%。精通等級 +1', en: '+2 pellets and -10% spread. Mastery +1' }
  },
  'capacitor-rail': {
    title: { zh: '電容軌道', en: 'CAPACITOR RAIL' },
    text: { zh: '蓄力時間 -25% 且滿蓄傷害 +20%。精通等級 +1', en: 'Charge time -25% and full-charge damage +20%. Mastery +1' }
  },
  'arc-lattice': {
    title: { zh: '電弧晶格', en: 'ARC LATTICE' },
    text: { zh: '連鎖目標 +1 且連鎖傷害由 70% 提升至 80%。精通等級 +1', en: '+1 chain target and chain damage 70% → 80%. Mastery +1' }
  },
  'superconducting-flux': {
    title: { zh: '超導通量', en: 'SUPERCONDUCTING FLUX' },
    text: { zh: '巨神傷害 +18%，蓄力速度 +15%。精通等級 +1', en: 'Colossus damage +18%, charge speed +15%. Mastery +1' }
  },
  'phoenix-core': {
    title: { zh: '鳳凰核心', en: 'PHOENIX CORE' },
    text: { zh: '首次致命傷將以 40% 生命重生，無敵 2 秒並釋放免費 EMP', en: 'First lethal hit revives at 40% HP, 2s invulnerable, free EMP' }
  },
  'scrap-singularity': {
    title: { zh: '廢料奇點', en: 'SCRAP SINGULARITY' },
    text: { zh: '每拾取 40 份廢料，在前方 120px 產生持續 1.5 秒的牽引旋渦', en: 'Every 40 scrap, a 1.5s vortex pulls foes 120px ahead' }
  },
  'superconductive-resonance': {
    title: { zh: '超導共鳴晶片', en: 'SUPERCONDUCTIVE RESONANCE' },
    text: { zh: '暴擊向周圍 2 目標引爆 45% 電弧；全蓄力暴擊回能 4 點且減戰術 CD 0.3s', en: 'Crits arc 45% damage to 2 nearby foes; fully-charged crits grant +4 energy & -0.3s tactical CD' }
  },
  'tactical-overdrive-coil': {
    title: { zh: '戰術過載線圈', en: 'TACTICAL OVERDRIVE COIL' },
    text: { zh: '開戰術裝備重置衝刺，獲 3s 移速 +20%、射速 +25% 與充能彈藥', en: 'Using tactical gear resets dash, grants 3s of +20% move speed, +25% fire rate & instant reloads' }
  },
  'concussion-breaker': {
    title: { zh: '震盪破甲協議', en: 'CONCUSSION BREAKER' },
    text: { zh: '破盾或部位破壞引發 130px 震波 (85 傷害 + 1.5s 暈眩)，波及目標 5s 內承受傷害 +35%', en: 'Shield or part break releases a 130px shockwave (85 dmg + 1.5s stun); victims take +35% damage for 5s' }
  }
};

var FUSIONS_I18N = {
  'prismatic-flak': {
    title: { zh: '稜鏡碎裂彈', en: 'PRISMATIC FLAK' },
    text: { zh: '穿透與撞牆時以 60° 爆散 2 枚次級稜鏡破片；同目標受多重稜鏡命中觸發 8% 損失血量真傷', en: 'Piercing slugs shatter into 2 prismatic shards at 60°; multiple hits trigger 8% lost HP true damage' }
  },
  'thermal-shock': {
    title: { zh: '熱能衝擊', en: 'THERMAL SHOCK' },
    text: { zh: '子彈附加過熱灼燒；EMP 觸發熱應力碎裂結算所有真傷 + 15% 最大 HP 碎冰爆震與 70% 減速', en: 'Bullets apply overheating burn; EMP triggers thermal fracture dealing all burn + 15% max HP blast & 70% slow' }
  },
  'apocalypse-thor': {
    title: { zh: '天罰雷暴陣列', en: 'APOCALYPSE THOR' },
    text: { zh: '電弧連擊 3 次召喚垂直離子天雷轟擊 180 範圍傷害，地面留下感電焦土', en: 'Every 3 arc hits summon an orbital ion thunderbolt dealing 180 AoE damage and leaving ionized ground' }
  },
  'singularity-mine': {
    title: { zh: '奇點黑洞地雷', en: 'SINGULARITY MINE' },
    text: { zh: '受創生成 180px 引力視界吸附敵兵與非首領子彈，內爆反彈 150% 吸收傷害', en: 'Taking damage generates a 180px gravity well pulling foes and absorbing bullets, collapsing into 150% reflected damage' }
  },
  'mirage-overdrive': {
    title: { zh: '幻影過載誘餌', en: 'MIRAGE OVERDRIVE' },
    text: { zh: '衝刺留下全息分身嘲諷怪群並同步朝游標開火（60% 傷害），消散時分裂追蹤飛彈', en: 'Dash deploys a holographic decoy taunting enemies and firing toward cursor (60% dmg), splitting into missiles on expiry' }
  },
  'aegis-stance': {
    title: { zh: '鋼鐵風暴壁壘', en: 'AEGIS STANCE' },
    text: { zh: '停步 0.4s 架設正面 160° 蜂巢護盾反彈敵彈為雙倍友軍彈，射速 +45%，背部獲 35% 免傷', en: 'Stationary 0.4s deploys a 160° frontal aegis reflecting enemy bullets at 2x dmg, +45% fire rate, and 35% rear damage reduction' }
  },
  'bloodhound-reaper': {
    title: { zh: '血性收割協議', en: 'BLOODHOUND REAPER' },
    text: { zh: '對低於 35% HP 敵人造成 250% 處決傷害並觸發金屬血爆；首領部位/精英處決必掉超頻球', en: 'Executes foes below 35% HP for 250% damage with metal scrap gore; executing boss parts or elites guarantees Overdrive Orbs' }
  },
  'solar-afterburner': {
    title: { zh: '日冕風暴羽翼', en: 'SOLAR AFTERBURNER' },
    text: { zh: '衝刺鋪設白熾火徑蒸發敵彈，焚燒踩踏敵軍並在風暴中扇形擴散', en: 'Dash lays an incandescent fire trench vaporizing enemy bullets, burning foes and fanning out in sandstorms' }
  },
  'event-horizon': {
    title: { zh: '事件視界', en: 'EVENT HORIZON' },
    text: { zh: '蓄滿軌道砲撕裂空間形成超大質量黑洞，撕碎目標護甲並引發強烈重力大災變', en: 'Fully-charged rail blasts tear space into a supermassive singularity, shattering armor and triggering graviton cataclysm' }
  },
  'graviton-cataclysm': {
    title: { zh: '重力大災變', en: 'GRAVITON CATACLYSM' },
    text: { zh: '蓄滿軌道砲撕裂空間形成超大質量黑洞，撕碎目標護甲並引發強烈重力大災變', en: 'Fully-charged rail blasts tear space into a supermassive singularity, shattering armor and triggering graviton cataclysm' }
  },
  'static-tempest': {
    title: { zh: '靜電風暴', en: 'STATIC TEMPEST' },
    text: { zh: '特斯拉放電使衝擊波衝刺超載為狂暴雷暴', en: 'Tesla discharge overloads shockwave dash into lightning storm' }
  },
  'kinetic-shrapnel': {
    title: { zh: '動能破片', en: 'KINETIC SHRAPNEL' },
    text: { zh: '貫穿軌道彈命中時爆裂為多重反彈破片', en: 'Piercing rail slugs shatter into ricocheting shrapnel upon impact' }
  },
  'overcharge-retaliation': {
    title: { zh: '超載反擊', en: 'OVERCHARGE RETALIATION' },
    text: { zh: '反應裝甲反擊脈衝致命超載，蒸發周遭敵人', en: 'Reactive armor counter-pulse critically overcharges and vaporizes foes' }
  },
  'vulcan-meltdown': {
    title: { zh: '火神融火', en: 'VULCAN MELTDOWN' },
    text: { zh: '高速燃燒彈幕以殘留火風暴點燃地面', en: 'High-velocity incendiary torrent ignites ground with residual firestorm' }
  },
  'graviton-bulwark': {
    title: { zh: '重力偏折', en: 'GRAVITON BULWARK' },
    text: { zh: '重型裝甲形成磁吸重力屏障，偏轉迫近威脅', en: 'Heavy armor creates a magnetic gravitational ward deflecting danger' }
  },
  'plasma-meltdown': {
    title: { zh: '電漿融核', en: 'PLASMA MELTDOWN CORE' },
    text: { zh: '超頻期間的散射爆轟引燃高密度電漿爆裂場', en: 'Scatter blasts during Overdrive ignite high-density plasma burst fields' }
  },
  'kinetic-ballet': {
    title: { zh: '動能芭蕾', en: 'KINETIC BALLET' },
    text: { zh: '每次衝刺發射 3 枚自動追蹤微型飛彈', en: 'Each dash launches 3 homing micro-missiles' }
  },
  'fortress-protocol': {
    title: { zh: '堡壘協議', en: 'FORTRESS PROTOCOL' },
    text: { zh: '電池 50+ 時減傷 25%。施放 EMP 提供 30 點護盾持續 2 秒', en: 'At 50+ battery, damage taken ×0.75. EMP grants a 30 shield for 2s' }
  },
  'executioner': {
    title: { zh: '處刑者', en: 'EXECUTIONER' },
    text: { zh: '被 EMP 擊暈的敵人承受 +50% 傷害。斬殺生命低於 15% 的非首領敵人', en: 'EMP-stunned foes take +50% damage. Non-bosses below 15% HP are executed' }
  },
  'storm-rider': {
    title: { zh: '風暴騎手', en: 'STORM RIDER' },
    text: { zh: '在沙暴中: 移速 +20%，子彈受風力影響 ×3，擊殺回復 1 點生命', en: 'In the storm: +20% move speed, bullets catch ×3 wind, kills heal 1 HP' }
  }
};

var RIGS_I18N = {
  scrapper: {
    name: { zh: '拆解者', en: 'SCRAPPER' },
    blurb: { zh: '標準裝甲。無特殊加成。', en: 'Stock hull. No tricks.' },
    req: { zh: '', en: '' }
  },
  strider: {
    name: { zh: '漫遊者', en: 'STRIDER' },
    blurb: { zh: '輕型機體。精準衝刺熱度 2 秒冷卻。', en: 'Light hull. Just Dash heat clears in 2s.' },
    req: { zh: '需求: 25 次精準衝刺', en: 'REQ: 25 JUST DASHES' }
  },
  bulwark: {
    name: { zh: '堡壘', en: 'BULWARK' },
    blurb: { zh: '重型裝甲。維修廢料回復量更高。', en: 'Heavy hull. Repair scrap heals more.' },
    req: { zh: '需求: 抵達波次 10', en: 'REQ: REACH WAVE 10' }
  },
  salvager: {
    name: { zh: '拾荒專家', en: 'SALVAGER' },
    blurb: { zh: '超廣磁吸、更多經驗、額外重骰。', en: 'Wider magnet, more XP, extra reroll.' },
    req: { zh: '需求: 完成 15 次合約', en: 'REQ: 15 CONTRACTS' }
  }
};

var WEAPONS_I18N = {
  standard: {
    name: { zh: '標準突擊步槍', en: 'STANDARD' },
    pattern: { zh: '直線連射', en: 'DIRECT' },
    line: { zh: '穩定步槍。保持機動。', en: 'Steady rifle. Stay mobile.' },
    chassis: { zh: '標準突擊步槍 // 均衡高速輸出', en: 'STANDARD PATTERN AUTO-RIFLE // BALANCED RAPID DPS' }
  },
  breacher: {
    name: { zh: '脈衝破障散彈槍', en: 'BREACHER' },
    pattern: { zh: '5發錐形', en: '5-PELLET' },
    line: { zh: '近距離散布。貼身爆破。', en: 'Close spread. Commit to the pocket.' },
    chassis: { zh: '脈衝破障散彈槍 // 5發錐形彈幕與貼身破障', en: 'PULSE BREACHER SHOTGUN // 5-PELLET CONE & POINT-BLANK BREACH' }
  },
  vanguard: {
    name: { zh: '先鋒軌道蓄力槍', en: 'VANGUARD' },
    pattern: { zh: '貫穿射線', en: 'PIERCE' },
    line: { zh: '按住蓄力發射高重穿甲彈。', en: 'Hold to fire a heavy slug.' },
    chassis: { zh: '先鋒軌道蓄力槍 // 蓄力穿透射線與貫穿爆轟', en: 'VANGUARD RAIL CHARGER // CHARGED BEAM & PENETRATION BLAST' }
  },
  'arc-welder': {
    name: { zh: '感應電弧焊接槍', en: 'ARC WELDER' },
    pattern: { zh: '高頻連鎖', en: 'CHAIN' },
    line: { zh: '在目標間跳躍的雷電弧。', en: 'Lightning that jumps targets.' },
    chassis: { zh: '感應電弧焊接槍 // 超高頻高壓電湧流', en: 'INDUCTION ARC WELDER // ULTRA HIGH-FREQUENCY VOLTAIC STREAM' }
  },
  colossus: {
    name: { zh: '巨神重型軌道砲', en: 'COLOSSUS' },
    pattern: { zh: '電漿重束', en: 'LANCE' },
    line: { zh: '二段蓄力軌道電漿束。極強後座反衝。', en: 'Dual-stage rail lance. Devastating recoil.' },
    chassis: { zh: '巨神重型軌道砲 // 二段蓄力與穿甲衝擊波', en: 'COLOSSUS HEAVY RAILGUN // DUAL-STAGE CHARGE & PIERCING LANCE' }
  }
};

var CONTRACTS_I18N = {
  'barrel-kills': {
    name: { zh: '炸藥豐收', en: 'BARREL HARVEST' },
    label: { zh: '炸藥桶', en: 'BARRELS' },
    detail: { zh: '以炸藥桶或能量核心擊殺 4 名敵人。', en: 'Kill 4 enemies with a barrel or a core.' }
  },
  'no-damage': {
    name: { zh: '完璧無瑕', en: 'UNBROKEN' },
    label: { zh: '無傷', en: 'CLEAN' },
    detail: { zh: '20 秒內未承受任何傷害。', en: 'Take no damage for 20 seconds.' }
  },
  graze: {
    name: { zh: '穿梭彈雨', en: 'THREAD THE FIRE' },
    label: { zh: '擦彈', en: 'GRAZE' },
    detail: { zh: '完成 12 次彈雨擦彈。', en: 'Graze 12 enemy shots.' }
  },
  'just-dash': {
    name: { zh: '千鈞一髮', en: 'JUST IN TIME' },
    label: { zh: '精準衝刺', en: 'JUST' },
    detail: { zh: '施展 3 次精準衝刺。', en: 'Land 3 Just Dashes.' }
  },
  combo: {
    name: { zh: '八重連擊', en: 'CHAIN EIGHT' },
    label: { zh: '連擊', en: 'COMBO' },
    detail: { zh: '達成 8 連擊。', en: 'Reach a x8 kill chain.' }
  },
  'elite-hunt': {
    name: { zh: '獵殺菁英', en: 'ELITE HUNT' },
    label: { zh: '菁英', en: 'ELITES' },
    detail: { zh: '擊殺 2 名菁英敵人。', en: 'Kill 2 elites.' }
  },
  'spire-chain': {
    name: { zh: '尖塔連鎖', en: 'SPIRE CHAIN' },
    label: { zh: '尖塔', en: 'SPIRE' },
    detail: { zh: '單次尖塔共鳴命中 5 名以上敵人。', en: 'One spire resonance hits 5 or more enemies.' }
  }
};

var MUTATORS_I18N = {
  swarm: {
    name: { zh: '蟲群狂潮', en: 'SWARM TIDE' },
    blurb: { zh: '生成加速，生命較薄。', en: 'Faster spawns, thinner hulls.' },
    detail: { zh: '生成間隔 ×0.6，敵方生命 ×0.7，爬行者與幼體權重 ×2。擊殺分數 ×1.1。', en: 'Spawn interval ×0.6, enemy HP ×0.7, crawler and scurrier weights ×2. Kills score ×1.1.' }
  },
  'elite-convoy': {
    name: { zh: '菁英護航隊', en: 'ELITE CONVOY' },
    blurb: { zh: '菁英敵怪盤據戰場。', en: 'Elites pack the lane.' },
    detail: { zh: '菁英機率 ×1.7，敵方數量上限 ×0.7。菁英物資箱掉落率由 15% 提高至 40%。', en: 'Elite chance ×1.7, enemy cap ×0.7. Elite crates rise from 15% to 40%.' }
  },
  'scrap-rain': {
    name: { zh: '廢料之雨', en: 'SCRAP RAIN' },
    blurb: { zh: '天降滾燙殘骸。', en: 'The sky drops hot salvage.' },
    detail: { zh: '每 3 秒有一顆隕石預警 1.15 秒 (半徑 34)，造成 12 傷害並留下 4 份廢料。', en: 'Every 3s a meteor warns for 1.15s (r 34), hits for 12, and leaves 4 scrap.' }
  },
  barrage: {
    name: { zh: '火砲齊射', en: 'ARTILLERY BARRAGE' },
    blurb: { zh: '場外重砲鎖定你。', en: 'Off-map guns find you.' },
    detail: { zh: '每 5 秒在身邊產生 3 處熔岩預警。波次結束額外獎勵 +200 分。', en: 'Every 5s, three lava warnings near you. Wave end pays +200.' }
  },
  'dust-devils': {
    name: { zh: '塵捲風暴', en: 'DUST DEVILS' },
    blurb: { zh: '兩股旋風橫掃盆地。', en: 'Two funnels walk the basin.' },
    detail: { zh: '旋風半徑 60，對玩家拉力 28 px/s（敵人 40）。玩家子彈穿越僅偏轉 8° 一次。', en: 'Radius 60, player pull 28 px/s (enemies 40). Player shots that cross them yaw 8° once.' }
  },
  overcharged: {
    name: { zh: '能量超載', en: 'OVERCHARGED' },
    blurb: { zh: '萬物皆處於過熱狀態。', en: 'Everything runs hot.' },
    detail: { zh: '敵人移動速度 ×1.2。玩家電池能量回復速率 ×2。', en: 'Enemy speed ×1.2. Your battery regen ×2.' }
  }
};

var ROUTES_I18N = {
  scorched: {
    name: { zh: '焦黑平原', en: 'SCORCHED FLATS' },
    rule: { zh: '熔岩持續時間 +1s。每波額外出現一個炸藥桶。', en: 'Lava lasts +1s. One extra barrel each wave.' },
    reward: { zh: '得分倍率 ×1.10', en: 'Score ×1.10' }
  },
  ironfield: {
    name: { zh: '鐵渣荒原', en: 'IRON FIELD' },
    rule: { zh: '蠻卒比重 +10%。廢料經驗 +20%。', en: 'Brute weight +10%. Scrap XP +20%.' },
    reward: { zh: '章節開始時獲得 +1 重骰', en: 'Act opens with +1 reroll' }
  },
  static: {
    name: { zh: '靜電沼澤', en: 'STATIC MIRE' },
    rule: { zh: '每波額外出現一座尖塔。敵彈速度 +10%。', en: 'One extra spire each wave. Enemy shots +10% speed.' },
    reward: { zh: '電池回復速度 +50%', en: 'Battery regen +50%' }
  },
  blackout: {
    name: { zh: '黑夜死寂', en: 'BLACKOUT' },
    rule: { zh: '視野縮限。菁英出現機率 +4%。', en: 'Vision closes in. Elite chance +4%.' },
    reward: { zh: '得分倍率 ×1.20', en: 'Score ×1.20' }
  },
  convoy: {
    name: { zh: '廢料車隊', en: 'SCRAP CONVOY' },
    rule: { zh: '每波次有一輛裝甲運輸載具橫越戰場。', en: 'An armored hauler crosses once each wave.' },
    reward: { zh: '摧毀殘骸掉落物資補給箱', en: 'Each wreck drops a supply crate' }
  },
  stormwall: {
    name: { zh: '風暴之牆', en: 'STORM WALL' },
    rule: { zh: '風暴前緣持續時間延長至 8 秒。', en: 'The storm front lasts 8 seconds.' },
    reward: { zh: '破風者分數 ×2', en: 'Storm Breaker score ×2' }
  }
};



var CAMPAIGN_MILESTONES_I18N = {
  emergency_overdrive: { zh: '戰術晶片【急救超頻】', en: 'TACTICAL CHIP [EMERGENCY OVERDRIVE]' },
  paint_dusk_camo: { zh: '機體塗裝【暮沙迷彩】', en: 'CHASSIS PAINT [DUSK CAMO]' },
  resonant_emp: { zh: '戰術晶片【共振磁暴】', en: 'TACTICAL CHIP [RESONANT EMP]' },
  paint_rust_heavy: { zh: '機體塗裝【鐵鏽重工】', en: 'CHASSIS PAINT [RUST HEAVY]' },
  heavy_pierce: { zh: '戰術晶片【重裝穿甲】', en: 'TACTICAL CHIP [HEAVY PIERCE]' },
  paint_storm_emp: { zh: '機體塗裝【暴風電磁】', en: 'CHASSIS PAINT [STORM EMP]' },
  paint_aurora_sovereign: { zh: '傳奇塗裝【極光神君】與稱號【巔峰征服者】', en: 'LEGENDARY PAINT [AURORA SOVEREIGN] + TITLE [APEX CONQUEROR]' },
  abyss_resonator: { zh: '戰術晶片【晶化共振核】', en: 'TACTICAL CHIP [ABYSS RESONATOR]' },
  paint_crystal_prismatic: { zh: '傳奇塗裝【稜鏡晶芒】與稱號【深淵支配者】', en: 'LEGENDARY PAINT [PRISMATIC CRYSTAL] + TITLE [ABYSS DOMINATOR]' }
};

var CAMPAIGN_SECTORS_I18N = {
  1: {
    name: { zh: '暮沙荒原', en: 'DUSK WASTES' },
    desc: { zh: '無垠暮色沙海，巡遊清道夫與衝鋒蟲群出沒。', en: 'Endless dusk sand seas — scavenger patrols and rusher packs.' }
  },
  2: {
    name: { zh: '鐵鏽熔坑', en: 'RUST CRATER' },
    desc: { zh: '熔岩熾熱廢土，高溫地磚、遠程曲射砲與腐蝕酸液橫行。', en: 'Molten scraplands — hot tiles, lobbing guns, and acid.' }
  },
  3: {
    name: { zh: '狂暴雷霆', en: 'STORM FRONT' },
    desc: { zh: '黑夜強風暴前線，迷霧收窄、硬光護盾與電磁尖塔肆虐。', en: 'Night storm front — fog squeeze, hardlight, and spires.' }
  },
  4: {
    name: { zh: '晶化深淵', en: 'CRYSTAL ABYSS' },
    desc: { zh: '幽邃地脈晶化裂谷，高頻共振水晶、折射屏障與自律防衛機構橫行。', en: 'Crystal ley-rifts — resonators, refraction barriers, auto-defenses.' }
  },
  5: {
    name: { zh: '極限試煉', en: 'EX TRIALS' },
    desc: { zh: '超越極限的絕望深淵，唯有精通全武裝之老兵方能踏足。', en: 'Beyond the edge — veterans only, full-kit mastery required.' }
  }
};

var CAMPAIGN_STAGES_I18N = {
  stage_1_1: {
    name: { zh: '荒漠清道夫', en: 'WASTELAND SWEEPER' },
    desc: { zh: '視野開闊，中央爆炸桶，衝刺蟲群快速突襲。', en: 'Open sightlines, center barrels, rusher packs on a fast tip.' },
    star1: { zh: '擊破 3 波敵潮', en: 'Clear 3 waves' },
    star2: { zh: '60 秒內通關', en: 'Finish under 60s' },
    star3: { zh: '剩餘 HP ≥ 80% 且完成 1 次桶殺', en: 'HP ≥ 80% and 1 barrel kill' }
  },
  stage_1_2: {
    name: { zh: '廢料爭奪戰', en: 'SCRAP RUSH' },
    desc: { zh: '高熱流星墜落，四周持續刷新爬行怪群。', en: 'Hot meteors fall while crawler packs keep respawning.' },
    star1: { zh: '收集 100 廢料', en: 'Collect 100 scrap' },
    star2: { zh: '50 秒內提前達成', en: 'Hit quota under 50s' },
    star3: { zh: '剩餘 HP ≥ 75% 且承受傷害 ≤ 25', en: 'HP ≥ 75% and damage taken ≤ 25' }
  },
  stage_1_3: {
    name: { zh: '刺穿前哨', en: 'BREACH OUTPOST' },
    desc: { zh: '2 隻高護甲精英蠻兵，小怪無限掩護推進。', en: 'Two armored elite brutes with endless fodder cover.' },
    star1: { zh: '擊殺 2 隻精英蠻兵', en: 'Kill 2 elite brutes' },
    star2: { zh: '60 秒內通關', en: 'Finish under 60s' },
    star3: { zh: '剩餘 HP ≥ 70%', en: 'HP ≥ 70%' }
  },
  stage_1_4: {
    name: { zh: '雙臂泰坦試煉', en: 'TITAN ARMS TRIAL' },
    desc: { zh: '純招式拆解，泰坦巨拳砸地與旋轉激光掃射。', en: 'Pure pattern read — Titan fists and spinning lasers.' },
    star1: { zh: '擊敗泰坦首領', en: 'Defeat the Titan' },
    star2: { zh: '90 秒內擊破', en: 'Kill under 90s' },
    star3: { zh: '達成 3 次 Just Dash 且剩餘 HP ≥ 80%', en: '3 Just Dashes and HP ≥ 80%' }
  },
  stage_2_1: {
    name: { zh: '熔渣火線', en: 'MOLTEN FIRELINE' },
    desc: { zh: '熔岩灼燒地磚，遠程曲射火砲登場封鎖路徑。', en: 'Lava tiles and lobbing artillery lock the lanes.' },
    star1: { zh: '擊破 4 波敵潮', en: 'Clear 4 waves' },
    star2: { zh: '全程未踩入熔岩池', en: 'Never step in molten pools' },
    star3: { zh: '剩餘 HP ≥ 70%', en: 'HP ≥ 70%' }
  },
  stage_2_2: {
    name: { zh: '攔截物資車', en: 'INTERCEPT CONVOY' },
    desc: { zh: '裝甲貨車橫越戰場，兩側酸液噴吐者護航。', en: 'Armored convoy crosses while spitters escort both flanks.' },
    star1: { zh: '摧毀裝甲護送車', en: 'Destroy the armored escort' },
    star2: { zh: '36 秒內擊毀', en: 'Destroy under 36s' },
    star3: { zh: '剩餘 HP ≥ 75%', en: 'HP ≥ 75%' }
  },
  stage_2_3: {
    name: { zh: '陣地堅守 90 秒', en: 'HOLD THE BEACON 90s' },
    desc: { zh: '刺尾怪與酸液群圍攻中央數據塔。', en: 'Scurriers and acid packs siege the center data tower.' },
    star1: { zh: '信號塔存活至計時結束', en: 'Beacon survives the timer' },
    star2: { zh: '信號塔剩餘耐久 ≥ 75%', en: 'Beacon HP ≥ 75%' },
    star3: { zh: '在防守光圈內累計停留 ≥ 45 秒', en: 'Stay in the defense ring ≥ 45s' }
  },
  stage_2_4: {
    name: { zh: '鋼鐵巨艦滅絕', en: 'DREADNOUGHT EXTINCTION' },
    desc: { zh: '全屏水雷陣、散彈高射砲與連續履帶撞角。', en: 'Minefields, flak volleys, and continuous ram charges.' },
    star1: { zh: '擊沉無畏巨艦', en: 'Sink the Dreadnought' },
    star2: { zh: '100 秒內完成擊殺', en: 'Kill under 100s' },
    star3: { zh: '剩餘 HP ≥ 70%', en: 'HP ≥ 70%' }
  },
  stage_3_1: {
    name: { zh: '逆風肅清', en: 'HEADWIND WIPEOUT' },
    desc: { zh: '周期性強風暴推力，彈道偏移，迷霧收窄。', en: 'Cyclic storm shove, bent shots, and tightening fog.' },
    star1: { zh: '肅清 3 波暴風敵潮', en: 'Clear 3 storm waves' },
    star2: { zh: '75 秒內通關', en: 'Finish under 75s' },
    star3: { zh: '達成 10+ Chain Combo', en: 'Reach a 10+ chain combo' }
  },
  stage_3_2: {
    name: { zh: '電磁風暴尖塔', en: 'STORM SPIRE HARVEST' },
    desc: { zh: '2 座雷電共振尖塔，觸發全屏連鎖電弧。', en: 'Two conduction spires — trigger full-field arc chains.' },
    star1: { zh: '收集 150 廢料', en: 'Collect 150 scrap' },
    star2: { zh: '觸發至少 3 次尖塔共振', en: 'Trigger ≥ 3 spire resonances' },
    star3: { zh: '未消耗過 EMP 且 HP ≥ 70%', en: 'No EMP used and HP ≥ 70%' }
  },
  stage_3_3: {
    name: { zh: '潛地破壞者', en: 'SUBTERRANEAN BREAKERS' },
    desc: { zh: '鑽地無敵鑽地蟲 + 相位硬光典獄官協同進攻。', en: 'Invuln burrowers plus phase wardens attack together.' },
    star1: { zh: '擊殺 3 隻潛地巨蟲', en: 'Kill 3 burrowers' },
    star2: { zh: '75 秒內通關', en: 'Finish under 75s' },
    star3: { zh: '剩餘 HP ≥ 80%', en: 'HP ≥ 80%' }
  },
  stage_3_4: {
    name: { zh: '暴風神君終局', en: 'STORM SOVEREIGN FINALE' },
    desc: { zh: '4 座風暴塔護盾、風眼鎖定與雷暴天火。', en: 'Tower shields, eye lock, and thunderfall.' },
    star1: { zh: '擊敗風暴主宰', en: 'Defeat the Storm Sovereign' },
    star2: { zh: '110 秒內擊破神君', en: 'Kill under 110s' },
    star3: { zh: '剩餘 HP ≥ 75%', en: 'HP ≥ 75%' }
  },
  stage_4_1: {
    name: { zh: '晶石裂隙', en: 'CRYSTAL RIFT' },
    desc: { zh: '狹長裂谷地形，高速晶化衝鋒怪包抄，考驗走位拉扯。', en: 'Narrow rift — fast crystal rushers force kiting.' },
    star1: { zh: '擊破 4 波晶化敵潮', en: 'Clear 4 crystal waves' },
    star2: { zh: '65 秒內通關', en: 'Finish under 65s' },
    star3: { zh: '剩餘 HP ≥ 80% 且達成 12+ 連擊', en: 'HP ≥ 80% and 12+ combo' }
  },
  stage_4_2: {
    name: { zh: '深淵運輸線', en: 'ABYSS CONVOY LINE' },
    desc: { zh: '物資推車護送任務，在光圈內維持載具動力，兩側高頻火砲壓制。', en: 'Escort the payload — stay in the ring while artillery pressures both sides.' },
    star1: { zh: '護送物資車抵達撤離點', en: 'Escort the payload to extract' },
    star2: { zh: '物資車剩餘耐久 ≥ 75%', en: 'Payload HP ≥ 75%' },
    star3: { zh: '在光圈內累計停留 ≥ 50 秒且承受傷害 ≤ 35', en: 'Ring time ≥ 50s and damage taken ≤ 35' }
  },
  stage_4_3: {
    name: { zh: '地脈超載防線', en: 'LEYLINE OVERLOAD LINE' },
    desc: { zh: '核心能量超載防線，消滅充能精英並在核心散熱區域冷卻熱量。', en: 'Hold the core — cull charging elites and cool heat in the vent zone.' },
    star1: { zh: '堅守核心直至計時結束且未過載熔毀', en: 'Hold the core to timer without meltdown' },
    star2: { zh: '核心超載峰值 ≤ 65% 或 70 秒內完成冷卻', en: 'Peak overload ≤ 65% or cool under 70s' },
    star3: { zh: '剩餘 HP ≥ 80% 且達成 4 次極限閃避', en: 'HP ≥ 80% and 4 Just Dashes' }
  },
  stage_4_4: {
    name: { zh: '晶化巨獸獵殺', en: 'CRYSTAL BEHEMOTH HUNT' },
    desc: { zh: '斬首 3 隻晶化變異巨獸，注意半血狂暴衝撞與酸液轟炸。', en: 'Hunt 3 crystal behemoths — watch half-HP rages and acid bombs.' },
    star1: { zh: '斬首 3 隻晶化變異巨獸', en: 'Slay 3 crystal behemoths' },
    star2: { zh: '80 秒內完成斬首', en: 'Finish under 80s' },
    star3: { zh: '剩餘 HP ≥ 75% 且承受傷害 ≤ 40', en: 'HP ≥ 75% and damage taken ≤ 40' }
  },
  stage_4_5: {
    name: { zh: '稜鏡天尊終局', en: 'PRISM SOVEREIGN FINALE' },
    desc: { zh: '晶化深淵終章對決，面對具備多重防禦部位的稜鏡天尊深淵巨獸。', en: 'Abyss finale — a multi-part prism behemoth.' },
    star1: { zh: '擊潰深淵巨獸首領', en: 'Defeat the abyss behemoth' },
    star2: { zh: '110 秒內完成擊殺', en: 'Kill under 110s' },
    star3: { zh: '達成 5 次極限閃避且剩餘 HP ≥ 75%', en: '5 Just Dashes and HP ≥ 75%' }
  },
  stage_ex_1: {
    name: { zh: '深淵生存試煉', en: 'ABYSS SURVIVAL TRIAL' },
    desc: { zh: '高密度全天敵混編敵潮，極限走位拉扯考驗。', en: 'Dense mixed counter-swarms — pure movement exam.' },
    star1: { zh: '肅清 5 波極限混編敵潮', en: 'Clear 5 extreme mixed waves' },
    star2: { zh: '100 秒內通關', en: 'Finish under 100s' },
    star3: { zh: '剩餘 HP ≥ 80% 且達成 15+ Chain', en: 'HP ≥ 80% and 15+ chain' }
  },
  stage_ex_2: {
    name: { zh: '虛空尖塔守衛', en: 'VOID SPIRE DEFENSE' },
    desc: { zh: '雙子尖塔電磁風暴，守護信號塔不被潛地蟲與硬光護盾摧毀。', en: 'Twin-spire storm — protect the beacon from burrowers and hardlight.' },
    star1: { zh: '極限信號塔防守 100 秒', en: 'Defend the beacon for 100s' },
    star2: { zh: '信號塔剩餘耐久 ≥ 80%', en: 'Beacon HP ≥ 80%' },
    star3: { zh: '在防守圈內累計停留 ≥ 60 秒且 HP ≥ 75%', en: 'Ring time ≥ 60s and HP ≥ 75%' }
  },
  stage_ex_3: {
    name: { zh: '三位一體天譴', en: 'TRINITY JUDGMENT' },
    desc: { zh: '終極首領巔峰決戰，連續高強度彈幕與雷暴洗禮。', en: 'Peak boss duel — stacked barrages and thunder baptism.' },
    star1: { zh: '擊潰終極暴風神君', en: 'Defeat the final Storm Sovereign' },
    star2: { zh: '120 秒內完成擊殺', en: 'Kill under 120s' },
    star3: { zh: '達成 5 次 Just Dash 且剩餘 HP ≥ 80%', en: '5 Just Dashes and HP ≥ 80%' }
  }
};

var CAMPAIGN_THREAT_I18N = {
  LOW: { zh: '低', en: 'LOW' },
  MEDIUM: { zh: '中', en: 'MEDIUM' },
  HIGH: { zh: '高', en: 'HIGH' },
  CRITICAL: { zh: '危急', en: 'CRITICAL' },
  APEX: { zh: '巔峰', en: 'APEX' }
};


var HARDCORE_OPS_I18N = {
  op_01: {
    name: { zh: '鋼鐵斷頭台', en: 'IRON GUILLOTINE' },
    title: { zh: '【剃刀之舞】', en: '[RAZOR WALTZ]' },
    badgeTitle: { zh: '[血染雙刃合金標記]', en: '[BLOOD-EDGED ALLOY MARK]' },
    briefing: { zh: 'HP 鎖定 35；戰場常駐 2 台無敵重砲轟炸；Scurrier 死亡必自爆。同屏 55 隻迫擊砲+自爆+酸液天敵群。', en: 'HP capped at 35; two invuln heavy guns always bombard; scurriers always pop on death. Cap 55 mortar/pop/acid counters.' },
    tacticalHint: { zh: '利用 Dash 撞殺不觸發自爆底層代碼，滑步貼臉破防。', en: 'Dash-bump kills skip the pop path — slide in close to break defense.' },
    bossName: { zh: "Titan「鐵砧」", en: "Titan “Anvil”" },
    bossModifier: { zh: "兩側加農砲全圖覆蓋，近身釋放 360° 反衝擊震波", en: "Side cannons blanket the arena; close range triggers a 360° counter-shockwave" }
  },
  op_02: {
    name: { zh: '折光禁區', en: 'REFRACTION ZONE' },
    title: { zh: '【破鏡者】', en: '[MIRROR BREAKER]' },
    badgeTitle: { zh: '[折光稜鏡破碎之眼]', en: '[SHATTERED PRISM EYE]' },
    briefing: { zh: '40% 精英帶 mirror 反射盾（反彈 100% 殺傷）；空槍反噬扣 6 HP；HP 鎖定 45。同屏 60 隻散開怪潮。', en: '40% elites carry mirror shields (100% reflect); dry-fire backlash −6 HP; HP cap 45. Cap 60 spread pack.' },
    tacticalHint: { zh: 'EMP 破盾聚怪，創造直線貫穿視窗；切勿盲目對鏡面射擊。', en: 'EMP to break mirrors, clump, then pierce — never dump into the face shield.' },
    bossName: { zh: "Dreadnought「晶壁要塞」", en: "Dreadnought “Crystal Bastion”" },
    bossModifier: { zh: "正側面全反射稜鏡，唯正後方散熱閥為弱點；需 EMP 斷盾後貫穿", en: "Front/side prism reflectors; only the rear vent is weak — EMP the shield, then pierce" }
  },
  op_03: {
    name: { zh: '超導熔毀', en: 'SUPERCONDUCT MELT' },
    title: { zh: '【雷霆制約者】', en: '[THUNDER BINDER]' },
    badgeTitle: { zh: '[高壓紫電球形禁錮鎖]', en: '[VIOLET ARC CAGE LOCK]' },
    briefing: { zh: 'Brute 獲 70% 電弧抗性且免疫麻痺；Warden 護盾吸收電弧；HP 鎖定 50；維修廢料為 0。同屏 55 隻。', en: 'Brutes resist arc 70% and ignore stun; warden bubbles eat arcs; HP cap 50; zero repair scrap. Cap 55.' },
    tacticalHint: { zh: '切角繞後死鎖 Warden，引爆環境炸藥造成真實傷害。', en: 'Flank wardens first; use barrels for true damage.' },
    bossName: { zh: "Sovereign「法拉第之怒」", en: "Sovereign “Faraday’s Wrath”" },
    bossModifier: { zh: "4 座風暴塔連成電磁死刑場，射擊本體引發反向落雷；需切角逐一熔斷尖塔", en: "Four storm spires form an EMP kill-field; shooting the body rebound-strikes — cut corners and melt towers" }
  },
  op_04: {
    name: { zh: '暴雨殘彈', en: 'HAIL OF SPENT SHELLS' },
    title: { zh: '【狂瀾獨挽】', en: '[LONE HOLD AGAINST THE SURGE]' },
    badgeTitle: { zh: '[黑色雙聯彈殼交錯之印]', en: '[CROSSED BLACK SHELL SIGIL]' },
    briefing: { zh: '同屏實體強制鎖定 65 隻；連續開火超過 1.8s 散布擴大 250%（強迫點射）；HP 鎖定 40。', en: 'Hard cap 65 on-screen; continuous fire >1.8s blooms spread +250% (tap-fire only). HP cap 40.' },
    tacticalHint: { zh: '嚴格 3 連發控槍點射，走長蛇陣拉扯並結合 Just Dash 衝擊波。', en: 'Strict 3-tap bursts, snake-kite, and Just Dash shockwaves.' },
    bossName: { zh: "Titan「百臂巨神」", en: "Titan “Hundred-Arm Colossus”" },
    bossModifier: { zh: "4 門旋轉火神機槍，全圖交叉環形密集彈幕", en: "Four rotating gatling mounts weave crossing ring barrages across the map" }
  },
  op_05: {
    name: { zh: '奇點深淵', en: 'SINGULARITY ABYSS' },
    title: { zh: '【奇點獵手】', en: '[SINGULARITY HUNTER]' },
    badgeTitle: { zh: '[深空坍縮黑洞紫金徽印]', en: '[VOID COLLAPSE SEAL]' },
    briefing: { zh: '戰場徘徊 2 個移動引力奇點（扭曲彈道）；可視半徑縮小至 280px；HP 鎖定 30（兩擊必殺）。固定 blink + volatile 瞬移自爆暗殺隊。', en: 'Two wandering gravity wells bend shots; vision 280px; HP cap 30 (two-hit). Blink + volatile assassin packs.' },
    tacticalHint: { zh: '精準預判奇點引力引導彈道，優先狙殺瞬移暗殺者。', en: 'Aim through wells; delete blink assassins first.' },
    bossName: { zh: "Dreadnought「暗質主宰」", en: "Dreadnought “Dark-Matter Sovereign”" },
    bossModifier: { zh: "發射黑洞坍縮力場彈，強吸力阻斷拉扯", en: "Fires black-hole collapse shells with hard pull that stalls kiting" }
  },
  op_06: {
    name: { zh: '諸神黃昏風暴', en: 'RAGNAROK STORM' },
    title: { zh: '【沙海霸主】', en: '[WASTELAND SOVEREIGN]' },
    badgeTitle: { zh: '[終焉風暴皇冠黃金神聖徽章]', en: '[ENDSTORM CROWN BADGE]' },
    briefing: { zh: '永久 8 級黑風暴（風速 110px/s，散彈射程縮減 35%）；單次受擊扣 50% HP；零掉落。全天敵混編（同屏 65 隻，精英 35%）。', en: 'Permanent rank-8 black storm (wind 110px/s, pellet range −35%); any hit −50% HP; zero drops. Mixed counters (cap 65, 35% elite).' },
    tacticalHint: { zh: '順應強風走位，利用重裝推進與 EMP 創造破局契機。', en: 'Ride the wind; use bulwark shove + EMP to open windows.' },
    bossName: { zh: "Sovereign「終焉風皇」", en: "Sovereign “Endstorm Emperor”" },
    bossModifier: { zh: "4 座風暴塔連線，旋轉風刃與全屏密集天火，極致走位考驗", en: "Four linked storm towers: spinning wind blades and full-screen skyfire — peak positioning test" }
  }
};

var DAILY_I18N = {
  'all-elites-early': {
    title: { zh: '菁英先行', en: 'ALL ELITES EARLY' },
    summary: { zh: '第 2 波即開始出現菁英詞綴。', en: 'Elite affixes start on wave 2.' }
  },
  'double-storm': {
    title: { zh: '雙重風暴', en: 'DOUBLE STORM' },
    summary: { zh: '沙暴持續時間延長為 10 秒。', en: 'Storms last 10 seconds.' }
  },
  'scrap-famine': {
    title: { zh: '廢料饑荒', en: 'SCRAP FAMINE' },
    summary: { zh: '廢料經驗 −25%。物資補給箱 ×2。', en: 'Scrap XP −25%. Supply crates ×2.' }
  },
  'glass-rig': {
    title: { zh: '玻璃機甲', en: 'GLASS RIG' },
    summary: { zh: '裝甲 −40%。傷害 +30%。', en: 'Hull −40%. Damage +30%.' }
  },
  'chain-reaction': {
    title: { zh: '連鎖反應', en: 'CHAIN REACTION' },
    summary: { zh: '敵人死亡時有 30% 機率爆裂。', en: 'Enemy deaths have a 30% chance to pop.' }
  }
};

var ACHIEVEMENTS_I18N = {
  'first-blood': {
    title: { zh: '第一滴血', en: 'FIRST BLOOD' },
    detail: { zh: '完成一次出擊。', en: 'Finish a run.' },
    reward: { zh: '', en: '' }
  },
  'titan-fall': {
    title: { zh: '泰坦隕落', en: 'TITAN FALL' },
    detail: { zh: '擊敗泰坦。', en: 'Defeat a Titan.' },
    reward: { zh: '', en: '' }
  },
  'dread-end': {
    title: { zh: '無畏末日', en: 'DREAD END' },
    detail: { zh: '擊敗無畏巨艦。', en: 'Defeat a Dreadnought.' },
    reward: { zh: '', en: '' }
  },
  'sovereign-down': {
    title: { zh: '主宰殞落', en: 'SOVEREIGN DOWN' },
    detail: { zh: '擊敗風暴主宰。', en: 'Defeat the Storm Sovereign.' },
    reward: { zh: '', en: '' }
  },
  extracted: {
    title: { zh: '安全撤離', en: 'EXTRACTED' },
    detail: { zh: '在熱度 0 成功撤離。', en: 'Extract on Heat 0.' },
    reward: { zh: '解鎖熱度 1', en: 'Unlocks Heat 1' }
  },
  'heat-1': {
    title: { zh: '熱度 1 征服', en: 'HEAT 1' },
    detail: { zh: '在熱度 1 成功撤離。', en: 'Extract on Heat 1.' },
    reward: { zh: '解鎖熱度 2', en: 'Unlocks Heat 2' }
  },
  'heat-2': {
    title: { zh: '熱度 2 征服', en: 'HEAT 2' },
    detail: { zh: '在熱度 2 成功撤離。', en: 'Extract on Heat 2.' },
    reward: { zh: '解鎖熱度 3', en: 'Unlocks Heat 3' }
  },
  'heat-3': {
    title: { zh: '熱度 3 征服', en: 'HEAT 3' },
    detail: { zh: '在熱度 3 成功撤離。', en: 'Extract on Heat 3.' },
    reward: { zh: '解鎖熱度 4', en: 'Unlocks Heat 4' }
  },
  'heat-4': {
    title: { zh: '熱度 4 征服', en: 'HEAT 4' },
    detail: { zh: '在熱度 4 成功撤離。', en: 'Extract on Heat 4.' },
    reward: { zh: '解鎖熱度 5', en: 'Unlocks Heat 5' }
  },
  'heat-5': {
    title: { zh: '熱度 5 征服', en: 'HEAT 5' },
    detail: { zh: '在熱度 5 成功撤離。', en: 'Extract on Heat 5.' },
    reward: { zh: '', en: '' }
  },
  'wave-10': {
    title: { zh: '波次 10', en: 'WAVE 10' },
    detail: { zh: '抵達波次 10。', en: 'Reach wave 10.' },
    reward: { zh: '解鎖堡壘機體', en: 'Unlocks Bulwark' }
  },
  dancer: {
    title: { zh: '刀尖起舞', en: 'DANCER' },
    detail: { zh: '達成 25 次精準衝刺。', en: 'Land 25 Just Dashes.' },
    reward: { zh: '解鎖漫遊者機體', en: 'Unlocks Strider' }
  },
  contractor: {
    title: { zh: '契約承包商', en: 'CONTRACTOR' },
    detail: { zh: '完成 15 次合約。', en: 'Complete 15 contracts.' },
    reward: { zh: '解鎖拾荒專家機體', en: 'Unlocks Salvager' }
  },
  synthesis: {
    title: { zh: '完美合成', en: 'SYNTHESIS' },
    detail: { zh: '單局內完成 2 項融合。', en: 'Finish 2 fusions in one run.' },
    reward: { zh: '', en: '' }
  },
  'all-fusions': {
    title: { zh: '融合全覽', en: 'ALL FUSIONS' },
    detail: { zh: '見證全部 10 種融合晶片。', en: 'See all 10 fusions.' },
    reward: { zh: '', en: '' }
  },
  'barrel-artist': {
    title: { zh: '爆破藝術家', en: 'BARREL ARTIST' },
    detail: { zh: '一次引爆連鎖 3 個炸藥桶。', en: 'Chain 3 barrels in one blast.' },
    reward: { zh: '', en: '' }
  },
  untouchable: {
    title: { zh: '毫髮無傷', en: 'UNTOUCHABLE' },
    detail: { zh: '連續 3 波次無傷生還。', en: 'Survive 3 waves in a row untouched.' },
    reward: { zh: '', en: '' }
  },
  'parts-collector': {
    title: { zh: '零件收集者', en: 'PARTS COLLECTOR' },
    detail: { zh: '單局內摧毀泰坦的兩側零件。', en: 'Destroy both Titan parts in one run.' },
    reward: { zh: '', en: '' }
  },
  'overtime-20': {
    title: { zh: '加時之巔', en: 'OVERTIME 20' },
    detail: { zh: '在加時無盡戰中抵達波次 20。', en: 'Reach wave 20 in overtime.' },
    reward: { zh: '', en: '' }
  },
  daily: {
    title: { zh: '每日行者', en: 'DAILY' },
    detail: { zh: '完成一次每日挑戰。', en: 'Finish a daily challenge.' },
    reward: { zh: '', en: '' }
  }
};

var ENEMIES_I18N = {
  crawler: { zh: '爬行者', en: 'CRAWLER', blurb: { zh: "近距蜂群單位，以數量壓迫走位", en: "Close swarm unit that crowds your kite path" } },
  rusher: { zh: '疾衝者', en: 'RUSHER', blurb: { zh: "高速直線衝撞，逼出精準閃避", en: "High-speed linear charge that forces precise dashes" } },
  brute: { zh: '蠻卒', en: 'BRUTE', blurb: { zh: "厚甲近戰壓制，威脅機體護甲", en: "Armored melee pressure that taxes hull integrity" } },
  artillery: { zh: '火砲者', en: 'ARTILLERY', blurb: { zh: "遠距拋射火力，需優先壓制", en: "Long-range lobbed fire that demands priority focus" } },
  elite: { zh: '菁英體', en: 'ELITE', blurb: { zh: "強化詞綴個體，掉落更豐", en: "Affixed elite specimen with richer drops" } },
  spitter: { zh: '噴吐者', en: 'SPITTER', blurb: { zh: "噴射酸液或投射物封鎖路徑", en: "Spits acid or projectiles to gate lanes" } },
  scurrier: { zh: '疾走幼體', en: 'SCURRIER', blurb: { zh: "輕型高速幼體，常成群纏鬥", en: "Light fastlings that swarm and cling" } },
  warden: { zh: '守衛者', en: 'WARDEN', blurb: { zh: "護盾支援單位，保護友軍", en: "Shield support that bubbles allies" } },
  burrower: { zh: '潛伏者', en: 'BURROWER', blurb: { zh: "潛地接近後突然冒出", en: "Burrows then erupts into melee range" } },
  titan: { zh: '泰坦', en: 'TITAN', blurb: { zh: "戰役級巨型首領，多階段威脅", en: "Campaign-scale titan with multi-phase threat" } },
  dreadnought: { zh: '無畏巨艦', en: 'DREADNOUGHT', blurb: { zh: "重裝要塞型首領，依賴弱點窗", en: "Fortress dreadnought that hinges on weak windows" } },
  sovereign: { zh: '風暴主宰', en: 'STORM SOVEREIGN', blurb: { zh: "風暴主宰，掌控尖塔與天火", en: "Storm sovereign commanding spires and skyfire" } },
  stormTower: { zh: '風暴尖塔', en: 'STORM TOWER', blurb: { zh: "固定風暴尖塔，構築電場", en: "Fixed storm tower that builds the kill-field" } },
  mine: { zh: '懸浮地雷', en: 'MINE', blurb: { zh: "懸浮地雷，靠近即引爆", en: "Hover mine that detonates on proximity" } },
  prowler: { zh: '潛行者', en: 'PROWLER', blurb: { zh: "側翼潛行襲擊者", en: "Flanking stalker that strikes from the side" } },
  bulwark: { zh: '堡壘體', en: 'BULWARK', blurb: { zh: "前線壁壘，阻擋彈道", en: "Frontline bulwark that blocks shot lanes" } },
  behemoth: { zh: '巨獸', en: 'BEHEMOTH', blurb: { zh: "超重型碾壓單位", en: "Ultra-heavy crushing chassis" } },
  spire: { zh: '傳導尖塔', en: 'CONDUCTION SPIRE', blurb: { zh: "傳導尖塔，連線強化怪潮", en: "Conduction spire that links and buffs the pack" } }
};

var RANKS_I18N = {
  'DUST SOVEREIGN': { zh: '沙塵主宰', en: 'DUST SOVEREIGN' },
  'APEX SCAVENGER': { zh: '頂級拾荒者', en: 'APEX SCAVENGER' },
  'VETERAN BREACHER': { zh: '資深破障者', en: 'VETERAN BREACHER' },
  'IRON SCRAPPER': { zh: '鋼鐵拆解者', en: 'IRON SCRAPPER' },
  'RECRUIT RECLUSE': { zh: '隱士新兵', en: 'RECRUIT RECLUSE' }
};

var CATEGORIES_I18N = {
  offense: { zh: '攻擊', en: 'OFFENSE' },
  defense: { zh: '防禦', en: 'DEFENSE' },
  tactical: { zh: '戰術', en: 'TACTICAL' },
  tech: { zh: '戰術', en: 'TECH' },
  mobility: { zh: '機動', en: 'MOBILITY' },
  weapon: { zh: '武器', en: 'WEAPON' },
  fusion: { zh: '融合', en: 'FUSION' }
};

var RARITIES_I18N = {
  common: { zh: '普通', en: 'COMMON' },
  uncommon: { zh: '進階', en: 'UNCOMMON' },
  rare: { zh: '稀有', en: 'RARE' },
  epic: { zh: '史詩', en: 'EPIC' },
  legendary: { zh: '傳奇', en: 'LEGENDARY' },
  prototype: { zh: '原型', en: 'PROTOTYPE' }
};

var PASSIVES_I18N = {
  'SHOCKWAVE DASH': { zh: '衝擊波衝刺', en: 'SHOCKWAVE DASH' },
  'TESLA COIL': { zh: '特斯拉線圈', en: 'TESLA COIL' },
  'REACTIVE ARMOR': { zh: '反應裝甲', en: 'REACTIVE ARMOR' },
  'HIGH CALIBER': { zh: '大口徑重彈', en: 'HIGH CALIBER' }
};

// =========================================================================
// TRANSLATION HELPER FUNCTIONS
// =========================================================================

export function tUpgradeTitle(upgradeOrId) {
  var id = typeof upgradeOrId === 'string' ? upgradeOrId : (upgradeOrId && upgradeOrId.id);
  var item = UPGRADES_I18N[id];
  if (item && item.title) return currentLang === 'zh' ? item.title.zh : item.title.en;
  return (upgradeOrId && upgradeOrId.title) || id || '';
}

export function tUpgradeText(upgradeOrId) {
  var id = typeof upgradeOrId === 'string' ? upgradeOrId : (upgradeOrId && upgradeOrId.id);
  var item = UPGRADES_I18N[id];
  if (item && item.text) return currentLang === 'zh' ? item.text.zh : item.text.en;
  return (upgradeOrId && upgradeOrId.text) || '';
}

export function tFusionTitle(fusionOrId) {
  var id = typeof fusionOrId === 'string' ? fusionOrId : (fusionOrId && fusionOrId.id);
  var item = FUSIONS_I18N[id];
  if (!item && typeof fusionOrId === 'string') {
    for (var k in FUSIONS_I18N) {
      if (Object.prototype.hasOwnProperty.call(FUSIONS_I18N, k)) {
        var fi = FUSIONS_I18N[k];
        if (fi && fi.title) {
          if (fusionOrId === fi.title.en || fusionOrId === fi.title.zh ||
              fusionOrId.indexOf(fi.title.en) !== -1 || fusionOrId.indexOf(fi.title.zh) !== -1) {
            item = fi;
            break;
          }
        }
      }
    }
  }
  if (item && item.title) return currentLang === 'zh' ? item.title.zh : item.title.en;
  return (fusionOrId && fusionOrId.title) || id || '';
}

export function tFusionText(fusionOrId) {
  var id = typeof fusionOrId === 'string' ? fusionOrId : (fusionOrId && fusionOrId.id);
  var item = FUSIONS_I18N[id];
  if (!item && typeof fusionOrId === 'string') {
    for (var k in FUSIONS_I18N) {
      if (Object.prototype.hasOwnProperty.call(FUSIONS_I18N, k)) {
        var fi = FUSIONS_I18N[k];
        if (fi && fi.title && (fusionOrId === fi.title.en || fusionOrId === fi.title.zh ||
            fusionOrId.indexOf(fi.title.en) !== -1 || fusionOrId.indexOf(fi.title.zh) !== -1)) {
          item = fi;
          break;
        }
      }
    }
  }
  if (item && item.text) return currentLang === 'zh' ? item.text.zh : item.text.en;
  return (fusionOrId && fusionOrId.text) || '';
}

export function tCategory(cat) {
  var k = String(cat || '').toLowerCase();
  var item = CATEGORIES_I18N[k];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  return String(cat || '').toUpperCase();
}

export function tRarity(rarity) {
  var k = String(rarity || '').toLowerCase();
  var item = RARITIES_I18N[k];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  return String(rarity || '').toUpperCase();
}

export function tRigName(rigId) {
  var item = RIGS_I18N[rigId];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return String(rigId || '').toUpperCase();
}

export function tRigBlurb(rigId) {
  var item = RIGS_I18N[rigId];
  if (item && item.blurb) return currentLang === 'zh' ? item.blurb.zh : item.blurb.en;
  return '';
}

export function tRigReq(rig) {
  var id = typeof rig === 'string' ? rig : (rig && rig.id);
  var item = RIGS_I18N[id];
  if (item && item.req) return currentLang === 'zh' ? item.req.zh : item.req.en;
  return (rig && rig.req) || '';
}

export function tWeaponName(weaponId) {
  var item = WEAPONS_I18N[weaponId];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return String(weaponId || '').toUpperCase();
}

export function tWeaponPattern(weaponId) {
  var item = WEAPONS_I18N[weaponId];
  if (item && item.pattern) return currentLang === 'zh' ? item.pattern.zh : item.pattern.en;
  return '';
}

export function tWeaponLine(weaponId) {
  var item = WEAPONS_I18N[weaponId];
  if (item && item.line) return currentLang === 'zh' ? item.line.zh : item.line.en;
  return '';
}

export function tChassisDesc(weaponMode) {
  var item = WEAPONS_I18N[weaponMode];
  if (item && item.chassis) return currentLang === 'zh' ? item.chassis.zh : item.chassis.en;
  return '';
}

export function tPassiveName(name) {
  var item = PASSIVES_I18N[name];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  return name;
}

export function tContractName(id) {
  var item = CONTRACTS_I18N[id];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return id || '';
}

export function tContractLabel(id) {
  var item = CONTRACTS_I18N[id];
  if (item && item.label) return currentLang === 'zh' ? item.label.zh : item.label.en;
  return id || '';
}

export function tContractDetail(id) {
  var item = CONTRACTS_I18N[id];
  if (item && item.detail) return currentLang === 'zh' ? item.detail.zh : item.detail.en;
  return '';
}


export function tDoubleDownHint(isDoubled) {
  if (currentLang === 'zh') {
    return isDoubled ? '⚡ 超頻加注 (3x 獎勵)' : '[H] 超頻加注 · 獎勵 x3';
  }
  return isDoubled ? '⚡ OVERCLOCKED (3x)' : '[H] DOUBLE-DOWN · REWARD x3';
}
export function tDoubleDownRisk() {
  if (currentLang === 'zh') return '目標 +50%、獎勵 x3；失敗扣 25% 生命';
  return 'Goal +50%, reward x3; failing costs 25% hull';
}
export function tRewardLabel(reward) {
  if (!reward) return '';
  if (currentLang === 'zh') {
    if (reward.type === 'reroll') return '+' + (reward.amount || 1) + ' 重骰';
    if (reward.type === 'repair') return '修復 ' + (reward.amount || 25);
    if (reward.type === 'score') return '+' + (reward.amount || 300) + ' 分數';
  }
  return reward.label || '';
}

export function tMutatorName(id) {
  var item = MUTATORS_I18N[id];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return id || '';
}

export function tMutatorBlurb(id) {
  var item = MUTATORS_I18N[id];
  if (item && item.blurb) return currentLang === 'zh' ? item.blurb.zh : item.blurb.en;
  return '';
}

export function tMutatorDetail(id) {
  var item = MUTATORS_I18N[id];
  if (item && item.detail) return currentLang === 'zh' ? item.detail.zh : item.detail.en;
  return '';
}

export function tRouteName(id) {
  var item = ROUTES_I18N[id];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return id || '';
}

export function tRouteRule(id) {
  var item = ROUTES_I18N[id];
  if (item && item.rule) return currentLang === 'zh' ? item.rule.zh : item.rule.en;
  return '';
}

export function tRouteReward(id) {
  var item = ROUTES_I18N[id];
  if (item && item.reward) return currentLang === 'zh' ? item.reward.zh : item.reward.en;
  return '';
}

var ACT_TITLES_I18N = {
  1: { zh: '第一幕 — 乾線邊境', en: 'ACT I — THE DRYLINE' },
  2: { zh: '第二幕 — 鐵鏽盆地', en: 'ACT II — RUST BASIN' },
  3: { zh: '第三幕 — 黑玻璃', en: 'ACT III — BLACK GLASS' }
};

var ARMORY_OPTIONS_I18N = {
  swap: {
    name: { zh: '更換主武', en: 'SWAP WEAPON' },
    detail: { zh: '更換主武器。已安裝卡片保留。', en: 'Change the main gun. Cards stay.' }
  },
  mastery: {
    name: { zh: '武器精通', en: 'WEAPON MASTERY' },
    detail: { zh: '目前持用主武精通 +1。', en: 'Mastery +1 on the gun you hold.' }
  },
  repair: {
    name: { zh: '戰場維修', en: 'FIELD REPAIR' },
    detail: { zh: '回復 50% 裝甲並獲得 +1 重骰。', en: 'Restore 50% hull and gain +1 reroll.' }
  },
  smuggler: {
    name: { zh: '黑市超頻', en: 'BLACK-MARKET OVERCLOCK' },
    detail: { zh: '犧牲 25% HP，換取精通 +1、+2 重骰、+1 放逐、6 秒超頻與 +800 分。', en: 'Sacrifice 25% HP for Mastery +1, +2 Rerolls, +1 Banish, 6s Overdrive & +800 Score.' }
  }
};

export function tActTitle(act, fallback) {
  var item = ACT_TITLES_I18N[act];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  if (fallback) return fallback;
  return currentLang === 'zh' ? ('第 ' + act + ' 幕 — 加時') : ('ACT ' + act + ' — OVERTIME');
}

export function tArmoryOptionName(id) {
  var item = ARMORY_OPTIONS_I18N[id];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return '';
}

export function tArmoryOptionDetail(id) {
  var item = ARMORY_OPTIONS_I18N[id];
  if (item && item.detail) return currentLang === 'zh' ? item.detail.zh : item.detail.en;
  return '';
}

export function tCampaignMilestoneName(id, fallback) {
  var item = CAMPAIGN_MILESTONES_I18N[id];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  return fallback || id || '';
}

export function tCampaignSectorName(id, fallback) {
  var item = CAMPAIGN_SECTORS_I18N[id];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return fallback || '';
}

export function tCampaignSectorDesc(id, fallback) {
  var item = CAMPAIGN_SECTORS_I18N[id];
  if (item && item.desc) return currentLang === 'zh' ? item.desc.zh : item.desc.en;
  return fallback || '';
}

export function tCampaignStageName(id, fallback) {
  var item = CAMPAIGN_STAGES_I18N[id];
  if (item && item.name) return currentLang === 'zh' ? item.name.zh : item.name.en;
  return fallback || id || '';
}

export function tCampaignStageDesc(id, fallback) {
  var item = CAMPAIGN_STAGES_I18N[id];
  if (item && item.desc) return currentLang === 'zh' ? item.desc.zh : item.desc.en;
  return fallback || '';
}

export function tCampaignStageStar(id, which, fallback) {
  var item = CAMPAIGN_STAGES_I18N[id];
  var key = which === 2 ? 'star2' : which === 3 ? 'star3' : 'star1';
  if (item && item[key]) return currentLang === 'zh' ? item[key].zh : item[key].en;
  return fallback || '';
}

export function tCampaignThreat(level) {
  var item = CAMPAIGN_THREAT_I18N[level];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  return level || '';
}


export function tHardcoreOpField(id, field, fallback) {
  var item = HARDCORE_OPS_I18N[id];
  if (item && item[field]) return currentLang === 'zh' ? item[field].zh : item[field].en;
  return fallback || '';
}

export function tDailyTitle(id) {
  var item = DAILY_I18N[id];
  if (item && item.title) return currentLang === 'zh' ? item.title.zh : item.title.en;
  return id || '';
}

export function tDailySummary(id) {
  var item = DAILY_I18N[id];
  if (item && item.summary) return currentLang === 'zh' ? item.summary.zh : item.summary.en;
  return '';
}

export function tAchievementTitle(id) {
  var item = ACHIEVEMENTS_I18N[id];
  if (item && item.title) return currentLang === 'zh' ? item.title.zh : item.title.en;
  return id || '';
}

export function tAchievementDetail(id) {
  var item = ACHIEVEMENTS_I18N[id];
  if (item && item.detail) return currentLang === 'zh' ? item.detail.zh : item.detail.en;
  return '';
}

export function tAchievementReward(id) {
  var item = ACHIEVEMENTS_I18N[id];
  if (item && item.reward) return currentLang === 'zh' ? item.reward.zh : item.reward.en;
  return '';
}

export function tEnemyName(id) {
  var item = ENEMIES_I18N[id];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  return String(id || '').toUpperCase();
}

export function tEnemyBlurb(id) {
  var item = ENEMIES_I18N[id];
  if (item && item.blurb) return currentLang === 'zh' ? item.blurb.zh : item.blurb.en;
  return '';
}

export function tRankTitle(title) {
  var item = RANKS_I18N[title];
  if (item) return currentLang === 'zh' ? item.zh : item.en;
  return title;
}

// =========================================================================
// LOG & STATUS & TIP & BANNER LOCALIZATIONS
// =========================================================================

export function tLog(msg) {
  if (currentLang !== 'zh' || !msg) return msg;
  if (msg.indexOf('RESONANCE ASCENSION //') === 0) {
    return msg.replace('RESONANCE ASCENSION //', '流派共鳴晉階 //').replace('KINETIC', '動能穿甲').replace('PLASMA', '熱能爆破').replace('STATIC', '電磁超載').replace('TACTICAL', '機動戰術').replace('TIER', '階級');
  }
  if (msg === 'CONTRACT OVERCLOCKED // REWARD x3 [HIGH RISK]') return '合約超頻加注 // 獎勵 x3 [高危契約]';
  if (msg === 'OVERCLOCKED CONTRACT COMPLETED // 3x REWARD + TACTICAL CRATE') return '超頻合約達成 // 3x 獎勵 + 戰術補給箱';
  if (msg === 'CONTRACT FAILED // BACKLASH -25% HP') return '合約超頻失敗 // 反噬扣除 25% 生命';
  if (msg === 'STORM CORES DETECTED // HARVEST FOR OVERDRIVE') return '偵測到風暴晶核 // 採集以獲取超頻';
  if (msg === 'STORM CORE SIPHONED // OVERDRIVE 3s + EMP SHOCKWAVE') return '風暴晶核已採集 // 3 秒超頻 + 離子震波';
  if (msg.indexOf('STORM HARVEST GRAND SLAM') === 0) return msg.replace('STORM HARVEST GRAND SLAM', '風暴採集大滿貫').replace('SCORE', '分數');
  if (msg.indexOf('GAMEPAD ONLINE') === 0) return msg.replace('GAMEPAD ONLINE', '手把已連線');
  if (msg === 'GAMEPAD OFFLINE') return '手把已斷線';
  if (msg === 'PERFECT DASH // CHRONO DILATION') return '精準衝刺 // 時間膨脹';
  if (msg === 'BARREL KICK-LAUNCHED') return '炸藥桶已踢出';
  if (msg === 'STATIC TEMPEST // 6-WAY CHAIN DISCHARGE') return '靜電風暴 // 6向連鎖放電';
  if (msg === 'EMP BLAST // SECTOR DISRUPTED') return 'EMP 衝擊 // 區段訊號干擾';
  if (msg.indexOf('CONDUCTION SPIRE // MEGA EMP DETONATED') === 0) return '傳導尖塔 // 超級 EMP 280PX 引爆';
  if (msg === 'OVERCHARGE RETALIATION // RETALIATORY SPIKE FIRED') return '超載反擊 // 復仇尖刺發射';
  if (msg === 'TITAN NEUTRALIZED // SECTOR SECURED') return '泰坦已被擊毀 // 區段安全';
  if (msg === 'BOUNTY SECURED // SURGE ONLINE') return '懸賞已完成 // 湧浪超頻上線';
  if (msg === 'TITAN ARMOR BREACH // CORE STRIKE') return '泰坦裝甲破防 // 核心重創 -350 HP';
  if (msg === 'VOLATILE CORE DETONATED') return '不穩定核心引爆';
  if (msg.indexOf('TITAN STRUCK BY KICKED BARREL') === 0) return '踢出的炸藥桶命中泰坦 // -240 HP';
  if (msg === 'BARREL DETONATED // SUPERCRIT') return '炸藥桶引爆 // 致命超暴擊';
  if (msg === 'BARREL DETONATED') return '炸藥桶引爆';
  if (msg === 'PLAYROOM // SCORE SAVED') return 'PLAYROOM // 成績已保存';
  if (msg.indexOf('WEAPON CHASSIS //') === 0) {
    var mode = msg.split('//')[1].trim().toLowerCase();
    return '武器機底 // ' + tWeaponName(mode);
  }
  if (msg === 'WIND SHIFT // INBOUND') return '風向驟變 // 暴風來襲';
  if (msg === 'SOVEREIGN STAGGERED // SPIRE FEEDBACK') return '風暴主宰踉蹌 // 尖塔反噬';
  if (msg.indexOf('TITAN COMPONENT DESTROYED // LEFT CANNON') === 0) return '泰坦組件被摧毀 // 左主砲離線';
  if (msg.indexOf('TITAN COMPONENT DESTROYED // REINFORCEMENTS') === 0) return '泰坦組件被摧毀 // 增援發射槽停用';
  if (msg === 'TITAN ENRAGED // BARRAGE PROTOCOL') return '泰坦暴怒 // 彈幕齊射協議';
  if (msg === 'GRAZE SURGE // MICRO-OVERCLOCK READY') return '擦彈湧浪 // 微型超頻就緒';
  if (msg.indexOf('SUPPLY CRATE // +') === 0 && msg.indexOf('HULL') !== -1) {
    return msg.replace('SUPPLY CRATE // +', '物資補給箱 // +').replace('HULL', '裝甲');
  }
  if (msg === 'SUPPLY CRATE // HULL FULL') return '物資補給箱 // 裝甲已滿';
  if (msg.indexOf('SUPPLY CRATE // BATTERY') === 0) {
    return msg.replace('SUPPLY CRATE // BATTERY', '物資補給箱 // 電池能量');
  }
  if (msg === 'SUPPLY CRATE // +1 REROLL') return '物資補給箱 // +1 重骰';
  if (msg.indexOf('SUPPLY CRATE // OVERDRIVE') === 0) {
    return msg.replace('SUPPLY CRATE // OVERDRIVE', '物資補給箱 // 超頻');
  }
  if (msg.indexOf('REPAIR SCRAP +') === 0) {
    return msg.replace('REPAIR SCRAP +', '維修廢料 +').replace('HULL', '裝甲');
  }
  if (msg.indexOf('REPAIR SCRAP FULL +') === 0) {
    return msg.replace('REPAIR SCRAP FULL +', '維修廢料全滿 +').replace('SCORE', '分數');
  }
  if (msg.indexOf('GRAVITON BULWARK') === 0) return '重力偏折 // 重力超載爆轟';
  if (msg.indexOf('BOUNTY RESET') !== -1) {
    return msg.replace('WAVE', '波次').replace('BOUNTY RESET', '懸賞重置');
  }
  if (msg === 'STORM BREAKER // SURGE UNLOCKED') return '風暴破除者 // 湧浪解鎖';
  if (msg.indexOf('WARNING // DREADNOUGHT') === 0) return '警告 // 無畏巨艦逼近';
  if (msg.indexOf('WARNING // STORM SOVEREIGN') === 0) return '警告 // 風暴主宰降臨';
  if (msg.indexOf('WARNING // TITAN') === 0) return '警告 // 偵測到泰坦';
  for (var mk in MUTATORS_I18N) {
    if (Object.prototype.hasOwnProperty.call(MUTATORS_I18N, mk)) {
      var mutItem = MUTATORS_I18N[mk];
      if (mutItem && mutItem.name) {
        if (msg === mutItem.name.en) return mutItem.name.zh;
        if (msg.indexOf(mutItem.name.en + ' //') === 0) {
          return mutItem.name.zh + ' // ' + (mutItem.blurb ? mutItem.blurb.zh : '');
        }
      }
    }
  }
  for (var rk in ROUTES_I18N) {
    if (Object.prototype.hasOwnProperty.call(ROUTES_I18N, rk)) {
      var rItem = ROUTES_I18N[rk];
      if (rItem && rItem.name) {
        if (msg === rItem.name.en) return rItem.name.zh;
        if (msg.indexOf(rItem.name.en + ' //') === 0) {
          var mutPart = '';
          var parts = msg.split('//');
          if (parts.length >= 3) {
            var mutEn = parts[2].trim();
            for (var m2 in MUTATORS_I18N) {
              if (MUTATORS_I18N[m2] && MUTATORS_I18N[m2].name && MUTATORS_I18N[m2].name.en === mutEn) {
                mutPart = ' // ' + MUTATORS_I18N[m2].name.zh;
                break;
              }
            }
          }
          return rItem.name.zh + ' // ' + (rItem.rule ? rItem.rule.zh : '') + mutPart;
        }
      }
    }
  }

  if (msg === 'PHASE BEARING // DASH COOLDOWN RESET') return '相位軸承 // 衝刺冷卻重置';
  if (msg === 'PHASE INTERCEPT! // VOID RIFT SHATTERED') return '相位攔截！ // 虛空裂隙粉碎';
  if (msg === 'EXECUTION! // STAGGER PUNISH') return '處決！ // 硬直懲罰';
  if (msg === 'DECOY SUPERNOVA! // PLASMA CASCADE') return '誘餌超新星！ // 電漿連鎖';
  if (msg === 'OVERCLOCK SURGE // MAXIMUM FIRE RATE') return '超頻湧浪 // 最大射速';
  if (msg === 'AEGIS PROTOCOL // FATAL BLOW PREVENTED') return '神盾協議 // 致命一擊已攔截';
  if (msg === 'REACTIVE PLASMA // MICRO-EMP DETONATED') return '反應電漿 // 微型 EMP 引爆';
  if (msg === 'VIP ELIMINATED // EMP SHOCKWAVE TRIGGERED') return 'VIP 已擊殺 // EMP 震波觸發';
  if (msg.indexOf('CRAG SHATTERED') === 0) return '岩障粉碎 // 破甲硬直 · 四面可打';
  if (msg.indexOf('DOUBLE RAM //') === 0) return '雙重衝撞 // 中段不破甲';
  if (msg === 'DOUBLE RAM // NO MID BREACH') return '雙重衝撞 // 中段不破甲';
  if (msg.indexOf('BOSS-WAVE CLEAR') === 0) return msg.replace('BOSS-WAVE CLEAR //', '首領戰清場 //');
  if (msg === 'TITAN // TUG-OF-WAR COUNTER! RADIATOR EXPOSED') return '泰坦 // 拔河反制！散熱器暴露';
  if (msg === 'TITAN // HARPOON TETHER REELED') return '泰坦 // 魚叉繫繩收回';
  if (msg === 'WARNING // SEISMIC HARPOON LOCK') return '警告 // 震盪魚叉鎖定';
  if (msg === 'WOLF PACK SURGE // CENTRIPETAL COMPRESSION') return '狼群湧浪 // 向心壓迫';
  if (msg === 'MOMENTUM SURGE // A-TIER COMBO ONLINE') return '動能湧浪 // A 級連擊上線';
  if (msg === 'PLAYROOM // CLOUD SAVE SYNCED') return 'PLAYROOM // 雲端存檔已同步';
  if (msg === 'PLAYROOM // SAVE FORMAT INCOMPATIBLE') return 'PLAYROOM // 存檔格式不相容';
  if (msg.indexOf('PLAYROOM // REVISION CONFLICT') === 0) return 'PLAYROOM // 版本衝突 → 自動合併';
  if (msg === 'SECTOR SECURED // MISSION COMPLETE') return '區段安全 // 任務完成';
  if (msg === 'BEHEMOTH ENRAGED // CORE OVERDRIVE') return '巨獸暴怒 // 核心超頻';
  if (msg === 'BOSS PHASE TRANSITION // OVERDRIVE ENGAGED') return '首領階段轉換 // 超頻啟動';
  if (msg.indexOf('BULWARK SHIELD SHATTERED') === 0) return '壁壘護盾粉碎 // 麻痺 [4.0s]';
  if (msg.indexOf('GRAVITON BULWARK') === 0) return '重力壁壘 // 重力超載爆轟';
  if (msg.indexOf('GRAVITON BURST') === 0) return '重力爆轟 // 彈幕消解';

  return msg;
  if (text.indexOf('TITAN ARMOR BREACH -350') === 0) return '泰坦裝甲破防 -350 HP // 系統過熱眩暈 3.0s';
  if (text.indexOf('SUPERNOVA COLLAPSE!') === 0) return text.replace('SUPERNOVA COLLAPSE!', '超新星坍縮！');
  if (text.indexOf('SUPPLY CRATE // OVERDRIVE') === 0) return text.replace('SUPPLY CRATE // OVERDRIVE', '補給箱 // 超頻');
  if (text.indexOf('SUPPLY CRATE // BATTERY +') === 0) return text.replace('SUPPLY CRATE // BATTERY +', '補給箱 // 電池 +');
  if (text.indexOf('STORM HARVEST GRAND SLAM // +') === 0) return text.replace('STORM HARVEST GRAND SLAM // +', '風暴採集大滿貫 // +').replace('SCORE', '分數');
  if (text.indexOf('GAMEPAD ONLINE //') === 0) return text.replace('GAMEPAD ONLINE //', '手把已連線 // ');
  if (text.indexOf('GAMEPAD OFFLINE') === 0) return '手把已離線';

}

export function tStatus(text) {
  if (currentLang !== 'zh' || !text) return text;
  if (text.indexOf('REPAIR SCRAP +') === 0) {
    return text.replace('REPAIR SCRAP +', '維修廢料 +').replace('HULL', '裝甲');
  }
  if (text.indexOf('REPAIR SCRAP FULL +') === 0) {
    return text.replace('REPAIR SCRAP FULL +', '維修廢料全滿 +').replace('SCORE', '分數');
  }
  if (text === 'SIGNAL LOCKED — PRESS ENTER TO DEPLOY') return '訊號已鎖定 — 按下 ENTER 出擊';
  if (text === 'SIGNAL LIVE — KEEP MOVING') return '訊號連線 — 保持移動';
  if (text === 'SIGNAL PAUSED — PRESS P OR ESC TO RESUME') return '戰鬥已暫停 — 按 P 或 ESC 繼續';
  if (text === 'SIGNAL LOST — PRESS R TO REDEPLOY') return '訊號中斷 — 按 R 重新部署';
  if (text === 'SELECT A RIG — PRESS START') return '選擇機體 — 按 ENTER 出擊';
  if (text === 'SELECT A RIG — PRESS ENTER TO DEPLOY') return '選擇機體 — 按 ENTER 出擊';
  if (text === 'EXTRACTION GATE // BANK OR PUSH DEEPER') return '撤離閘門 // 結算撤離或深入加時';
  if (text === 'OVERTIME // HALF EXTRACT ON DEATH · KEEP PUSHING') return '加時戰區 // 陣亡僅半獎 · 繼續推進';
  if (text.indexOf('APOCALYPSE THOR') === 0) return '天啟雷神 // 軌道離子打擊 180 傷害';
  if (text.indexOf('WEAPON CHASSIS //') === 0) return text.replace('WEAPON CHASSIS //', '武器機底 // ');
  if (text.indexOf('RESONANCE ASCENSION //') === 0) return text.replace('RESONANCE ASCENSION //', '共鳴升華 // ');
  if (text.indexOf('GRAVITON BULWARK') === 0) return '引力壁壘 // 重力過載爆發';
  if (text.indexOf('GRAVITON BURST') === 0) return '引力爆發 // 敵彈消散';
  if (text.indexOf('BULWARK SHIELD SHATTERED') === 0) return '堡壘護盾粉碎 // 癱瘓 [4.0s]';
  if (text.indexOf('VIP TARGET NEUTRALIZED') === 0) return 'VIP 目標已清除 // EMP 引爆';
  if (text.indexOf('SUPERNOVA COLLAPSE') === 0) return text.replace('SUPERNOVA COLLAPSE!', '超新星坍縮！');
  if (text.indexOf('SCRAP BULKHEAD //') === 0) return text.replace('SCRAP BULKHEAD //', '廢料隔艙 // ');
  if (text.indexOf('BARREL LAUNCHED') === 0) return '炸藥桶已踢出 // 即將撞擊';
  if (text.indexOf('EMP BLAST DISCHARGED') === 0) return 'EMP 衝擊釋放 // 區段訊號干擾';
  if (text.indexOf('CONDUCTION SPIRE RESONANCE') === 0) return '傳導尖塔共鳴 // 超級 EMP 280PX [眩暈 3.0s]';
  if (text.indexOf('AEGIS PROTOCOL ACTIVATED') === 0) return '神盾協議啟動 // 緊急護盾已展開';

  if (text.indexOf('PERFECT DASH') === 0) return '精準衝刺 // 時間膨脹 (冷卻返還)';
  if (text.indexOf('BARREL LAUNCHED') === 0) return '炸藥桶已踢出 // 即將撞擊';
  if (text.indexOf('EMP BLAST DISCHARGED') === 0) return 'EMP 衝擊釋放 // 區段訊號干擾';
  if (text.indexOf('CONDUCTION SPIRE RESONANCE') === 0) return '傳導尖塔共鳴 // 超級 EMP 280PX [眩暈 3.0s]';
  if (text.indexOf('TITAN NEUTRALIZED') === 0) return '泰坦已被擊毀 // 區段安全';
  if (text.indexOf('BOUNTY CLEAR') === 0) {
    return text.replace('BOUNTY CLEAR +', '懸賞完成 +').replace('SCORE // SURGE', '分數 // 湧浪');
  }
  if (text.indexOf('TITAN ARMOR BREACH') === 0) return '泰坦裝甲破防 -350 HP // 系統過熱眩暈 3.0s';
  if (text.indexOf('AEGIS PROTOCOL ACTIVATED') === 0) return '神盾協議啟動 // 緊急護盾已展開';
  if (text.indexOf('AEGIS PROTOCOL //') === 0) return '神盾協議 // 致命一擊已擋下';
  if (text.indexOf('SUPERNOVA COLLAPSE') === 0) return text.replace('SUPERNOVA COLLAPSE!', '超新星坍縮！');
  if (text.indexOf('SCRAP BULKHEAD //') === 0) return text.replace('SCRAP BULKHEAD //', '廢料隔艙 // ');
  if (text.indexOf('TITAN ENRAGED') === 0) return '泰坦暴怒 // 彈幕齊射協議';
  if (text.indexOf('STORM BREAKER') === 0) return '風暴破除者 // 湧浪解鎖';
  if (text.indexOf('TITAN LEFT CANNON DESTROYED') === 0) return '泰坦左主砲被摧毀 // 雙聯砲離線 [眩暈 1.8s]';
  if (text.indexOf('TITAN RIGHT POD DESTROYED') === 0) return '泰坦右發射槽被摧毀 // 護衛停用 [眩暈 1.8s]';
  if (text.indexOf('BEHEMOTH HORN SHATTERED') === 0) return '巨獸之角碎裂 // 正面減傷失效 [硬直 2.2s]';
  if (text.indexOf('BEHEMOTH GLAND RUPTURED') === 0) return '巨獸腺体破裂 // 酸液迫擊已封閉';
  if (text.indexOf('BEHEMOTH TAIL SEVERED') === 0) return '巨獸斷尾 // 機動殘廢 [-25% 速度]';
  if (text.indexOf('GRAVITON BURST') === 0) return '重力爆轟 // 消解彈幕';
  if (text.indexOf('GRAZE SURGE') === 0) return '擦彈湧浪 // 微型超頻就緒';
  if (text.indexOf('WARNING // DREADNOUGHT') === 0) return '警告 // 無畏巨艦逼近';
  if (text.indexOf('WARNING // STORM SOVEREIGN') === 0) return '警告 // 風暴主宰降臨';
  if (text.indexOf('WARNING // TITAN') === 0) return '警告 // 偵測到泰坦';
  if (text.indexOf('CLOCK RISK //') === 0) return '時鐘風險 // 首領卡住波次時鐘 — 破甲否則錯過第 15 波';

  if (text.indexOf('PHASE INTERCEPT') === 0) return '相位攔截！ // 虛空裂隙粉碎 (-25% HP)';
  if (text.indexOf('EXECUTION!') === 0) return '處決！ // 硬直懲罰 (衝刺重置)';
  if (text.indexOf('DECOY SUPERNOVA') === 0) return '誘餌超新星！ // 電漿連鎖';
  if (text.indexOf('AEGIS PROTOCOL') === 0) return '神盾協議啟動 // 緊急護盾接合';
  if (text.indexOf('VIP TARGET NEUTRALIZED') === 0) return 'VIP 目標已擊殺 // EMP 引爆';
  if (text === 'SECTOR SECURED // MISSION COMPLETE') return '區段安全 // 任務完成';
  if (text === 'EXTRACTION GATE // BANK OR PUSH DEEPER') return '撤離閘門 // 結算撤離或深入加時';
  if (text === 'OVERTIME // HALF EXTRACT ON DEATH · KEEP PUSHING') return '加時戰區 // 陣亡僅半獎 · 繼續推進';
  if (text.indexOf('BEHEMOTH ENRAGED') === 0) return '巨獸暴怒 // 核心超頻';
  if (text.indexOf('SUPERNOVA COLLAPSE') === 0) return text.replace('SUPERNOVA COLLAPSE!', '超新星坍縮！').replace('BONUS DMG', '額外傷害');
  if (text.indexOf('READY') !== -1 && text.indexOf(' // READY') !== -1) return text.replace(' // READY', ' // 就緒');
  if (text.indexOf('GRAVITON BURST') === 0) return '重力爆轟 // 彈幕消解';
  return text;
}

export function tTip(id, kind) {
  if (currentLang !== 'zh') {
    if (id === 'move-shoot') {
      if (kind === 'pad') return 'LEFT STICK MOVE · RT FIRE · A OR LT DASH';
      return 'WASD MOVE · MOUSE AIM / FIRE · SPACE OR SHIFT DASH';
    }
    if (id === 'dash') return 'DASH THROUGH A THREAT · A SHORT INVULNERABLE BURST';
    if (id === 'just-dash') return 'JUST DASH · HUG A THREAT TO REFUND COOLDOWN AND GUARANTEE CRITS';
    if (id === 'graze') return 'SLIP PAST ENEMY SHOTS TO GRAZE · SCORES + ENERGY · 5 GRAZES → OVERDRIVE';
    if (id === 'barrel') return 'SHOOT A BARREL OR DASH-KICK IT INTO THE PACK';
    if (id === 'emp') return 'Q OR RMB EMP CLEARS SHOTS AND STUNS · E/F DEPLOYS TACTICAL AUX';
    if (id === 'core-boss') return 'CORE BLASTS HIT A BOSS FOR 350';
    if (id === 'titan-parts') return 'TITAN PARTS · LEFT CANNON / RIGHT POD DROP STUN WINDOWS — HARPOON TUG IS A DPS WINDOW';
    if (id === 'contract') return 'CONTRACTS ARE OPTIONAL · THE REWARD PAYS ON COMPLETION';
    if (id === 'fusion') return 'COMPLETES A FUSION · THAT CHIP JOINS THE RIG';
    if (id === 'route') return 'PICK A ROUTE · THEN AN ARMORY UPGRADE FOR THE NEXT ACT';
    if (id === 'contrast') return 'HARD TO SEE SHOTS? PAUSE → CONTRAST: HIGH · BRIGHTENS HOSTILES';
    if (id === 'language') return 'NEED 繁中 / ENG? PAUSE → SYSTEM → LANGUAGE · SWITCHES MENUS & TIPS';
    if (id === 'first-upgrade') return 'PICK 1 CARD · KEYS 1–3 · R REROLLS · B BANISHES · X SKIPS (HEAL + SCORE)';
    if (id === 'acid') return 'GREEN SPIT LEAVES ACID POOLS · STEP OUT OR THEY MELT HULL';
    if (id === 'burrower') return 'BURROWER WARNING CIRCLE · MOVE OFF THE MARK BEFORE IT ERUPTS';
    if (id === 'warden-bubble') return 'WARDEN BUBBLES ALLIES · BREAK THE SHIELD OR KITE PAST — DO NOT DUMP INTO THE BUBBLE';
    if (id === 'artillery-lob') return 'ARTILLERY LOBS MARKED SHELLS · STEP OUT OF THE RED RING BEFORE IMPACT';
    if (id === 'mine') return 'PROXIMITY MINE ARMING · BACK OFF BEFORE THE BEEP ENDS';
    if (id === 'scurrier') return 'SCURRIER ARMING · KILL OR FLEE BEFORE THE POP — DO NOT DASH INTO THE BLAST';
    if (id === 'rusher-charge') return 'ORANGE CHARGE LANE = RUSHER BURST · SIDE-STEP OFF THE LINE BEFORE IT FIRES';
    if (id === 'brute') return 'BRUTE IS HEAVY CONTACT DAMAGE · KEEP RANGE AND STRAFE — DO NOT TRADE HULL';
    if (id === 'elite-weave') return 'ELITE ROUNDS TRACK HARD · STRAFE AND PRIORITIZE THEM BEFORE THE PACK';
    if (id === 'extract') return 'WAVE 15 GATE · EXTRACT TO BANK OR PUSH DEEPER FOR OVERTIME';
    if (id === 'molten') return 'ORANGE POOLS ARE MOLTEN SLAG · DREAD LEAVES THEM ON CHARGE — STEP OUT';
    if (id === 'meteor') return 'RED CIRCLES ARE METEORS · STEP OUT BEFORE IMPACT';
    if (id === 'overtime') return 'OVERTIME · DEATH BANKS ONLY HALF THE EXTRACT BONUS';
    if (id === 'storm-eye') return 'HOLD THE STORM EYE · STEP OUT ONLY BETWEEN PULSES';
    if (id === 'storm-tower') return 'STORM TOWERS FEED THE SOVEREIGN SHIELD · KILL TOWERS FIRST — EMP / SPIRE HIT THEM HARD';
    if (id === 'dread-break') return 'BAIT CHARGE INTO THE CRAG FOR ARMOR BREAK · NO MID-RAM BREAK · DUMP DURING THE STUN WINDOW';
    if (id === 'dread-fatigue') return 'LONG DREAD FIGHT · FORCE A CRAG BREAK — KITING FOREVER LOSES THE CLOCK';
    if (id === 'dread-clock') return 'WAVE CLOCK PAUSES WHILE THE DREAD LIVES · EXTREME KITE = TIME-CAP BEFORE WAVE 15 — FORCE A CRAG BREAK';
    if (id === 'storm-weave') return 'WEAVE ELITE + SPIRAL ROUNDS · BULLETS END MORE RUNS THAN THE EYE';
    if (id === 'boss-clear') return 'CLEAR ELITES FIRST · THEIR ROUNDS STEAL THE BOSS FIGHT';
    if (id === 'prowler-lunge') return 'PROWLER TELEGRAPHS THEN LUNGES · SIDE-STEP THE FLASH — STALK PHASE TAKES REDUCED DAMAGE';
    if (id === 'bulwark-face') return 'BULWARK FACE-SHIELD BLOCKS FRONTAL FIRE · BREAK IT OR FLANK — AURA BUFFS NEARBY FOES';
    if (id === 'behemoth-parts') return 'BEHEMOTH PARTS · HORN = FRONT DR · GLAND = ACID MORTAR · TAIL = SPEED — BREAK PARTS TO CRIPPLE';
    return '';
  }
  if (id === 'move-shoot') {
    if (kind === 'pad') return '左搖桿移動 · RT 開火 · A 或 LT 衝刺';
    return 'WASD 移動 · 滑鼠瞄準 / 開火 · 空白鍵或 SHIFT 衝刺';
  }
  if (id === 'dash') return '衝刺穿過威脅 · 獲得短暫無敵突進';
  if (id === 'just-dash') return '精準衝刺 · 緊貼威脅擦身而過可重置冷卻並必定暴擊';
  if (id === 'graze') return '貼近敵彈擦身而過即可擦彈 · 得分並回能 · 累積 5 次觸發超頻';
  if (id === 'barrel') return '射擊炸藥桶或衝刺將其踢入敵群';
  if (id === 'emp') return 'Q 或右鍵 EMP 可消彈擊暈 · E/F 部署戰術副裝備';
  if (id === 'core-boss') return '核心引爆可對首領造成 350 點重創';
  if (id === 'titan-parts') return '泰坦部位 · 左主砲／右發射槽破毀有硬直窗 — 魚叉拉扯是輸出窗';
  if (id === 'contract') return '合約為選填任務 · 完成後立即發放獎勵';
  if (id === 'fusion') return '完成晶片融合 · 核心晶片將永久融入機體';
  if (id === 'route') return '挑選行進路線 · 並為下個章節挑選軍械庫升級';
  if (id === 'contrast') return '敵彈看不清？暫停選單 → 對比度: 高 · 可加強敵方與彈體可讀性';
  if (id === 'language') return '需要切換 繁中／ENG？暫停 → 系統設定 → 語言 · 介面與 tip 同步切換';
  if (id === 'first-upgrade') return '挑選 1 張卡片 · 數字鍵 1–3 · R 重骰 · B 放逐 · X 跳過（回血＋分數）';
  if (id === 'acid') return '綠色酸液彈會留下酸池 · 快離開，否則持續腐蝕裝甲';
  if (id === 'burrower') return '鑽地蟲預警圈 · 在它鑽出前離開標記範圍';
  if (id === 'warden-bubble') return '守衛者為友軍上盾 · 先破盾或繞過 — 別把火力砸進護盾';
  if (id === 'artillery-lob') return '火砲者拋射有標記的砲彈 · 撞擊前離開紅圈';
  if (id === 'mine') return '感應地雷正在引信 · 在哔聲結束前快離開';
  if (id === 'scurrier') return '疾走幼體正在引爆 · 擊殺或逃離，別衝進爆炸';
  if (id === 'rusher-charge') return '橘色衝刺走廊＝疾衝者蓄力 · 開火前側移離開那條線';
  if (id === 'brute') return '蠻卒近戰碰撞傷害很高 · 保持距離側移風箏 — 別硬換血';
  if (id === 'elite-weave') return '菁英彈道難躲 · 側移並優先清掉菁英再打群';
  if (id === 'extract') return '第 15 波撤離閘門 · 可結算撤離或深入加時戰區';
  if (id === 'molten') return '橘色熔渣池是無畏衝刺殘留 · 快離開以免持續灼傷';
  if (id === 'meteor') return '紅色預警圈是隕石 · 撞擊前快離開落點';
  if (id === 'overtime') return '加時戰區 · 陣亡僅結算一半撤離獎勵';
  if (id === 'storm-eye') return '守住風暴之眼 · 只在脈衝間隙短暫離開';
  if (id === 'storm-tower') return '風暴尖塔餵養主宰護盾 · 先拆尖塔 — EMP／傳導尖塔對其超效';
  if (id === 'dread-break') return '把衝撞引向岩障破甲 · 雙衝中段不破甲 · 在硬直窗傾瀉';
  if (id === 'dread-fatigue') return '無畏戰拖太久 · 快逼岩障破甲 — 風箏到死會來不及清第 15 波';
  if (id === 'dread-clock') return '無畏存活時波次時鐘暫停 · 極端風箏會在第 15 波前超時 — 快逼岩障破甲';
  if (id === 'storm-weave') return '穿梭菁英彈與螺旋彈 · 敵彈比風暴之眼更能終結一局';
  if (id === 'boss-clear') return '先清菁英 · 它們的彈幕會偷走首領戰';
  if (id === 'prowler-lunge') return '潛行者先預警再突進 · 閃過閃光 — 潛行態減傷，別硬打';
  if (id === 'bulwark-face') return '堡壘體正面護盾擋彈 · 破盾或繞側 — 光環會強化附近敵軍';
  if (id === 'behemoth-parts') return '巨獸部位 · 角=正面減傷 · 腺=酸液迫擊 · 尾=機動 — 拆部位才能廢其能力';
  return '';
}

export function tCombatFloater(text) {
  if (currentLang !== 'zh' || !text) return text;
  if (text === 'THERMAL NOVA') return '熱能新星';
  if (text.indexOf('DASH OVERDRIVE') === 0) return text.replace('DASH OVERDRIVE', '衝刺超頻');
  if (text.indexOf('STATIC OVERCLOCK') === 0) return text.replace('STATIC OVERCLOCK', '靜電超頻');
  if (text.indexOf('THERMAL FRACTURE') === 0) return text.replace('THERMAL FRACTURE', '熱能裂傷');
  if (text.indexOf('EXECUTE ') === 0) return text.replace('EXECUTE ', '處決 ');
  if (text.indexOf('THERMAL EXPLODE') === 0) return text.replace('THERMAL EXPLODE', '熱能爆裂');
  if (text === 'OVERDRIVE ORB') return '超頻寶珠';
  if (text.indexOf('+CRIT ') === 0) return text.replace('+CRIT ', '+暴擊 ');
  if (text.indexOf('BOSS +') === 0) return text.replace('BOSS +', '首領 +');
  if (text.indexOf('BOUNTY +') === 0) return text.replace('BOUNTY +', '懸賞 +');
  if (text.indexOf('STYLE +') === 0) return text.replace('STYLE +', '風格 +');
  return text;
}

export function tUnlockLabel(item) {
  if (!item) return '';
  var zh = currentLang === 'zh';
  var id = item.id || '';
  var kind = item.kind || '';
  var raw = item.label || '';
  if (!zh) return raw || id;
  if (kind === 'achievement') {
    var title = tAchievementTitle(id);
    return title ? ('已解鎖 // ' + title) : (raw.indexOf('UNLOCKED // ') === 0 ? ('已解鎖 // ' + raw.slice(12)) : raw);
  }
  if (kind === 'rig') {
    var rig = tRigName(id);
    return (rig || id.toUpperCase()) + ' 已解鎖';
  }
  if (kind === 'heat') {
    var hm = id.match(/heat-(\d+)/);
    return hm ? ('熱度 ' + hm[1] + ' 已解鎖') : raw.replace('HEAT ', '熱度 ').replace(' UNLOCKED', ' 已解鎖');
  }
  if (raw.indexOf('UNLOCKED // ') === 0) return '已解鎖 // ' + raw.slice(12);
  if (raw.indexOf(' UNLOCKED') !== -1) return raw.replace(' UNLOCKED', ' 已解鎖').replace('HEAT ', '熱度 ');
  return raw;
}

export function tBanner(text) {
  if (currentLang !== 'zh' || !text) return text;
  if (text.indexOf('CLOCK RISK //') === 0) return '時鐘風險 // 首領卡住波次時鐘 — 破甲否則錯過第 15 波';
  if (text.indexOf('WAVE') === 0) {
    return text.replace('WAVE', '第') + ' 波';
  }
  if (text.indexOf('CONTRACT SEALED //') === 0) {
    var rest = text.slice('CONTRACT SEALED //'.length).trim();
    if (rest === '+1 REROLL') rest = '+1 重骰';
    else if (rest.indexOf('REPAIR') === 0) rest = rest.replace('REPAIR', '修復');
    else if (rest.indexOf('+') === 0 && rest.indexOf('SCORE') !== -1) rest = rest.replace('SCORE', '分數');
    return '合約達成 // ' + rest;
  }
  if (text === 'TITAN NEUTRALIZED // SECTOR SECURED') return '泰坦已被擊毀 // 區段安全';
  if (text === 'WIND SHIFT // INBOUND') return '風向驟變 // 暴風來襲';
  if (text === 'TITAN ENRAGED // BARRAGE PROTOCOL') return '泰坦暴怒 // 彈幕齊射協議';
  if (text === 'CONTRACT OVERCLOCKED // REWARD x3 [HIGH RISK]') return '合約超頻加注 // 獎勵 x3 [高危契約]';
  if (text === 'OVERCLOCKED CONTRACT COMPLETED // 3x REWARD + TACTICAL CRATE') return '超頻合約達成 // 3x 獎勵 + 戰術補給箱';
  if (text === 'CONTRACT FAILED // BACKLASH -25% HP') return '合約超頻失敗 // 反噬扣除 25% 生命';
  if (text.indexOf('STORM HARVEST GRAND SLAM') === 0) return text.replace('STORM HARVEST GRAND SLAM', '風暴採集大滿貫').replace('SCORE', '分數');
  if (text === 'STORM BREAKER // SURGE UNLOCKED') return '風暴破除者 // 湧浪解鎖';
  if (text.indexOf('TITAN APPROACHING') !== -1) {
    return text.replace('TITAN APPROACHING', '泰坦逼近').replace('SECTOR', '區段');
  }
  if (text.indexOf('WARNING // DREADNOUGHT') === 0) return '警告 // 無畏巨艦逼近';
  if (text.indexOf('WARNING // STORM SOVEREIGN') === 0) return '警告 // 風暴主宰降臨';
  if (text.indexOf('WARNING // TITAN') === 0) return '警告 // 偵測到泰坦';

  for (var rk in ROUTES_I18N) {
    if (Object.prototype.hasOwnProperty.call(ROUTES_I18N, rk)) {
      var rEntry = ROUTES_I18N[rk];
      if (rEntry && rEntry.name && text.indexOf(rEntry.name.en) !== -1) {
        text = text.replace(rEntry.name.en, rEntry.name.zh);
      }
      if (rEntry && rEntry.rule && text.indexOf(rEntry.rule.en) !== -1) {
        text = text.replace(rEntry.rule.en, rEntry.rule.zh);
      }
    }
  }
  for (var mk in MUTATORS_I18N) {
    if (Object.prototype.hasOwnProperty.call(MUTATORS_I18N, mk)) {
      var mEntry = MUTATORS_I18N[mk];
      if (mEntry && mEntry.name && text.indexOf(mEntry.name.en) !== -1) {
        text = text.replace(mEntry.name.en, mEntry.name.zh);
      }
      if (mEntry && mEntry.blurb && text.indexOf(mEntry.blurb.en) !== -1) {
        text = text.replace(mEntry.blurb.en, mEntry.blurb.zh);
      }
    }
  }


  if (text === 'SECTOR SECURED // MISSION COMPLETE') return '區段安全 // 任務完成';
  if (text === 'ARMOR BREAK') return '破甲輸出';
  if (text === 'CHARGE') return '衝撞';
  if (text === 'DOUBLE RAM') return '雙重衝撞';
  if (text.indexOf('DOUBLE RAM //') === 0) return '雙重衝撞 // 中段不破甲';
  if (text === 'OVERDRIVE' && text.length < 12) return '過載';
  if (text.indexOf('CHARGE TELEGRAPH') === 0) return '衝撞預兆 // 引向岩障破甲';
  if (text.indexOf('CHARGE SPENT') === 0) return '衝撞力竭 // 破甲輸出窗';
  if (text.indexOf('CRAG SHATTERED') === 0) return '岩障粉碎 // 破甲硬直 · 四面可打';
  if (text.indexOf('TUG-OF-WAR COUNTER') === 0) return '拔河反制 // 散熱器暴露 2.5S';
  if (text.indexOf('TITAN HARPOON') === 0) return '泰坦魚叉 // 已繫繩並緩速';
  if (text.indexOf('BEHEMOTH HORN SHATTERED') === 0) return '巨獸之角碎裂 // 正面減傷失效 [硬直 2.2s]';
  if (text.indexOf('BEHEMOTH GLAND RUPTURED') === 0) return '巨獸腺体破裂 // 酸液迫擊已封閉';
  if (text.indexOf('BEHEMOTH TAIL SEVERED') === 0) return '巨獸斷尾 // 機動殘廢 [-25% 速度]';
  if (text === 'WARNING // TITAN HARPOON LOCK') return '警告 // 泰坦魚叉鎖定';
  if (text.indexOf('WOLF PACK SURGE') === 0) return '狼群湧浪 // 向心壓迫';

  if (text.indexOf('SILO OVERCHARGE DEFENSE') === 0) return '發射井超載防禦：危地封鎖 20 秒！';
  if (text.indexOf('EXTRACTION COMPLETE') === 0) return '撤離完成：+80 精煉廢料 & 600px 真空吸力！';
  if (text.indexOf('ORBITAL POD OPENED') === 0) return '軌道艙開啟：全面超頻 & 電池過充！';
  if (text.indexOf('FIELD RIG OVERCLOCK') === 0) return '野戰機體超頻：射速 +35% & 強化底盤！';
  if (text.indexOf('XENO NEST DESTROYED') === 0) return '異種巢穴摧毀：衝擊波已引爆！';
  if (text.indexOf('EMP SPIRE OVERLOAD') === 0) return 'EMP 尖塔過載：全域癱瘓 3.5 秒 & 護盾粉碎！';
  if (text.indexOf('BUNKER BREACHED') === 0) return '掩體突破：緊急全修 & 30 發穿甲暴擊彈！';
  if (text.indexOf('RESONANCE PYLON DISCHARGED') === 0) return '共鳴塔放電：480px 衝擊波、+2 穿透 & 超頻！';
  if (text.indexOf('CRYSTAL SIPHON MELTDOWN') === 0) return '晶體虹吸熔毀：過熱臨界！抽出 60 廢料！';
  if (text.indexOf('CRYSTAL SIPHON: OVERHEAT ALARM') === 0) {
    var heat = text.match(/\((\d+%)\)/);
    return '晶體虹吸：過熱警報 (' + (heat ? heat[1] : '') + ')！吸引敵潮！';
  }

  return tLog(text);
}

// =========================================================================
// STATIC HTML SYNCHRONIZATION
// =========================================================================

function setTextById(id, text) {
  if (typeof document === 'undefined') return;
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHtmlById(id, html) {
  if (typeof document === 'undefined') return;
  var el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

export function syncStaticHtml(lang) {
  if (typeof document === 'undefined') return;
  var zh = lang === 'zh';

  try {
    document.title = zh ? 'DUST//REIGN — 廢土征途' : 'DUST//REIGN — Wasteland Run';
  } catch (e) {}

  // Topbar
  var topEyebrow = document.querySelector('.topbar .eyebrow');
  if (topEyebrow) topEyebrow.innerHTML = zh ? '廢土射擊 <span>/</span> 第 001 次出擊' : 'WASTELAND SHOOTER <span>/</span> RUN 001';

  var topLabels = document.querySelectorAll('.topbar .meta-label');
  if (topLabels && topLabels.length >= 3) {
    topLabels[0].textContent = zh ? '通訊' : 'COMMS';
    topLabels[1].textContent = zh ? '風向' : 'WIND';
    topLabels[2].textContent = zh ? '最高' : 'BEST';
  }

  // Language button update in topbar & settings
  var langBtn = document.getElementById('langBtn');
  if (langBtn) {
    langBtn.innerHTML = zh
      ? '<span class="lang-opt is-inactive">ENG</span> / <span class="lang-opt is-active">繁中</span>'
      : '<span class="lang-opt is-active">ENG</span> / <span class="lang-opt is-inactive">繁中</span>';
    if (typeof langBtn.setAttribute === 'function') {
      langBtn.setAttribute('aria-label', zh ? '切換為英文 (Switch to ENG)' : '切換為繁體中文 (Switch to 繁中)');
    }
  }
  var toggleLangModal = document.getElementById('toggleLanguage');
  if (toggleLangModal) {
    toggleLangModal.textContent = zh ? '語言: 繁中' : 'LANGUAGE: ENG';
  }
  var settingLangLabel = document.getElementById('settingLanguageLabel');
  if (settingLangLabel) settingLangLabel.textContent = zh ? '介面語言' : 'LANGUAGE';
  var settingLangDesc = document.getElementById('settingLanguageDesc');
  if (settingLangDesc) settingLangDesc.textContent = zh ? '切換英文與繁體中文顯示' : 'INTERFACE LANGUAGE / 介面語言';

  // Arena Header
  var arenaHeader = document.querySelector('.arena-header');
  if (arenaHeader) {
    var span1 = arenaHeader.querySelector('span:first-child');
    if (span1) span1.innerHTML = zh ? '第 09 區段 <b aria-hidden="true">//</b> 乾線邊境' : 'SECTOR 09 <b aria-hidden="true">//</b> THE DRYLINE';
  }

  // HUD Top Metric Labels
  var metricLabels = document.querySelectorAll('.hud-top .metric-label');
  if (metricLabels && metricLabels.length >= 3) {
    metricLabels[0].textContent = zh ? '波次' : 'WAVE';
    metricLabels[1].textContent = zh ? '分數' : 'SCORE';
    metricLabels[2].textContent = zh ? '機體等級' : 'RIG LVL';
  }
  setTextById('hudWaveLabel', zh ? '拾荒時刻' : 'SCAVENGER HOUR');
  var resNames = document.querySelectorAll('#hudResonances .res-name');
  if (resNames && resNames.length >= 4) {
    resNames[0].textContent = zh ? '動能' : 'KIN';
    resNames[1].textContent = zh ? '電漿' : 'PLA';
    resNames[2].textContent = zh ? '靜電' : 'STA';
    resNames[3].textContent = zh ? '戰術' : 'TAC';
  }
  var resPills = document.querySelectorAll('#hudResonances .resonance-pill');
  if (resPills && resPills.length >= 4) {
    resPills[0].title = zh ? '動能穿甲共鳴' : 'Kinetic Ballistics';
    resPills[1].title = zh ? '熱能電漿共鳴' : 'Thermal Plasma';
    resPills[2].title = zh ? '電磁靜電共鳴' : 'Electromagnetic Static';
    resPills[3].title = zh ? '機動戰術共鳴' : 'Tactical Defense';
  }
  var lvlSmall = document.querySelector('.metric--level small');
  if (lvlSmall) lvlSmall.textContent = zh ? '保持移動' : 'KEEP MOVING';

  // HUD Bottom Resources
  var resLabels = document.querySelectorAll('.hud-bottom .resource-label > span:first-child');
  if (resLabels && resLabels.length >= 3) {
    resLabels[0].textContent = zh ? '機體裝甲' : 'HULL INTEGRITY';
    resLabels[1].textContent = zh ? '廢料核心' : 'SCRAP MEMORY';
    resLabels[2].textContent = zh ? '電池能量' : 'BATTERY';
  }
  setTextById('empReady', zh ? 'EMP 就緒' : 'EMP READY');

  // Landmark / control aria labels
  function setAttrBySel(sel, attr, val) {
    var node = document.querySelector(sel);
    if (node) node.setAttribute(attr, val);
  }
  setAttrBySel('.topbar', 'aria-label', zh ? '遊戲頂欄' : 'Game header');
  setAttrBySel('.topbar-meta', 'aria-label', zh ? '通訊狀態' : 'Signal status');
  setAttrBySel('.arena-card', 'aria-label', zh ? '廢土戰場' : 'Wasteland arena');
  setAttrBySel('#gameCanvas', 'aria-label', zh ? '廢土戰鬥區' : 'Wasteland combat arena');
  setAttrBySel('#hudResonances', 'aria-label', zh ? '流派共鳴' : 'Archetype Resonances');
  setAttrBySel('#healthBar', 'aria-label', zh ? '機體裝甲' : 'Hull integrity');
  setAttrBySel('#xpBar', 'aria-label', zh ? '廢料核心' : 'Scrap memory');
  setAttrBySel('#meterEnergy', 'aria-label', zh ? '電池能量' : 'Battery energy');
  var audioBtn = document.getElementById('audioBtn');
  if (audioBtn && !audioBtn.getAttribute('data-aria-owned')) {
    // pause-menu owns live mute state; only seed if still default English
    if (/Toggle Audio/i.test(audioBtn.getAttribute('aria-label') || '')) {
      audioBtn.setAttribute('aria-label', zh ? '切換音效' : 'Toggle audio');
    }
  }


  // Start Screen
  var startScreen = document.getElementById('startScreen');
  if (startScreen) {
    var sStamp = startScreen.querySelector('.overlay-stamp');
    if (sStamp) sStamp.innerHTML = zh ? '檔案庫 09 <span>//</span> 啟用中' : 'ARCHIVE 09 <span>//</span> ACTIVE';
    var sKicker = startScreen.querySelector('.overlay-kicker');
    if (sKicker) sKicker.textContent = zh ? '廢土最後的光芒，是槍口的火光' : 'THE LAST LIGHT IS A MUZZLE FLASH';
    setHtmlById('startTitle', zh ? '自闢掩體，<br /><span>絕境求生。</span>' : 'MAKE YOUR<br /><span>OWN COVER.</span>');
    var sCopy = startScreen.querySelector('.overlay-copy');
    if (sCopy) sCopy.innerHTML = zh
      ? '甩開漫天塵暴。擊潰潛伏其中的異怪。<br />每一次出擊，都在舊世界的殘骸上刻下新的地圖。'
      : 'Outrun the dust. Outshoot the things that live in it.<br />Every run writes a new map in the bones of the old world.';
    var sBtnSpan = startScreen.querySelector('#startBtn span');
    if (sBtnSpan) sBtnSpan.textContent = zh ? '出擊' : 'DEPLOY';
    var sControls = startScreen.querySelector('.overlay-foot-controls');
    if (sControls) sControls.textContent = zh
      ? '鍵鼠: WASD + 滑鼠左鍵 / 空白鍵 · 手把: 類比搖桿 + RT / A'
      : 'DESKTOP: WASD + LMB / SPACE · GAMEPAD: ANALOG + RT / A';
    var sFootSpans = startScreen.querySelectorAll('.overlay-foot span');
    if (sFootSpans && sFootSpans.length >= 2) {
      sFootSpans[1].innerHTML = zh ? '殘命易逝 <i aria-hidden="true">/</i> 彈藥難尋' : 'RUNS ARE CHEAP <i aria-hidden="true">/</i> AMMO IS NOT';
    }
  }

  // Game Over Screen
  var gameOver = document.getElementById('gameOverScreen');
  if (gameOver) {
    var goStamp = gameOver.querySelector('.overlay-stamp');
    if (goStamp) goStamp.innerHTML = zh ? '訊號中斷 <span>//</span> 出擊結束' : 'SIGNAL LOST <span>//</span> RUN ENDED';
    var goKicker = gameOver.querySelector('.overlay-kicker');
    if (goKicker) goKicker.textContent = zh ? '乾線邊境，終將吞噬一切' : 'THE DRYLINE ALWAYS COLLECTS';
    var resSpans = gameOver.querySelectorAll('.result-grid span');
    if (resSpans && resSpans.length >= 3) {
      resSpans[0].textContent = zh ? '抵達波次' : 'WAVE REACHED';
      resSpans[1].textContent = zh ? '廢料評分' : 'SCRAP SCORE';
      resSpans[2].textContent = zh ? '歷史最佳' : 'BEST RUN';
    }
    var telSpans = gameOver.querySelectorAll('.run-telemetry-grid span');
    if (telSpans && telSpans.length >= 4) {
      telSpans[0].textContent = zh ? '命中率' : 'ACCURACY';
      telSpans[1].textContent = zh ? '最高連擊' : 'MAX COMBO';
      telSpans[2].textContent = zh ? '擦彈次數' : 'GRAZES';
      telSpans[3].textContent = zh ? '總傷害量' : 'TOTAL DMG';
    }
    var rankKicker = gameOver.querySelector('.rank-stamp-kicker');
    if (rankKicker) rankKicker.textContent = zh ? '區段評級' : 'SECTOR EVALUATION';
    var recordStamp = gameOver.querySelector('#newRecordStamp');
    if (recordStamp) recordStamp.innerHTML = zh ? '<span>新紀錄</span> <small>//</small> <span>區段之冠</span>' : '<span>NEW RECORD</span> <small>//</small> <span>SECTOR TOP</span>';
    var saveBadge = gameOver.querySelector('#accountSaveBadge span:last-child');
    if (saveBadge) saveBadge.textContent = zh ? '已記錄至 PLAYROOM' : 'RECORDED TO PLAYROOM';
    var restartBtnSpan = gameOver.querySelector('#restartBtn span');
    if (restartBtnSpan) restartBtnSpan.textContent = zh ? '再次出擊' : 'RUN IT BACK';
    var goFootSpans = gameOver.querySelectorAll('.overlay-foot span');
    if (goFootSpans && goFootSpans.length >= 2) {
      goFootSpans[0].textContent = zh ? '廢土之中，死者亦不沉眠' : 'NOTHING OUT THERE STAYS DEAD';
      goFootSpans[1].textContent = zh ? '按 R 或點擊再次出擊' : 'PRESS R OR CLICK RUN IT BACK';
    }
  }

  // Upgrade Panel
  var upgPanel = document.getElementById('upgradePanel');
  if (upgPanel) {
    var upgKicker = upgPanel.querySelector('.overlay-kicker');
    if (upgKicker) upgKicker.textContent = zh ? '搜刮貯藏箱 // 選擇一項' : 'SALVAGE CACHE / CHOOSE ONE';
    var upgTitle = document.getElementById('upgradeTitle');
    if (upgTitle) upgTitle.innerHTML = zh ? '強化機體，<span>兇悍進化。</span>' : 'MAKE THE RIG <span>MEANER.</span>';
    var upgHint = upgPanel.querySelector('.upgrade-hint');
    if (upgHint) upgHint.textContent = zh ? '戰鬥已暫停 — 按 1–3 挑選 · R 重骰 · B 放逐 · X 跳過' : 'COMBAT PAUSED — 1–3 PICK · R REROLL · B BANISH · X SKIP';
    var upgCountSpan = upgPanel.querySelector('.upgrade-count span');
    if (upgCountSpan) upgCountSpan.textContent = zh ? '決策窗口' : 'DECISION WINDOW';
    setTextById('upgradeTimer', zh ? '戰鬥已暫停 — 挑選一張' : 'COMBAT PAUSED — PICK ONE');
  }

  // Pause Modal
  var pauseModal = document.getElementById('pauseModal');
  if (pauseModal) {
    var pStamp = pauseModal.querySelector('.pause-head .overlay-stamp');
    if (pStamp) pStamp.innerHTML = zh ? '機體診斷 <span>//</span> 待命中' : 'RIG DIAGNOSTICS <span>//</span> STANDBY';
    setHtmlById('pauseTitle', zh ? '機體診斷<br /><span>// 待命中</span>' : 'RIG DIAGNOSTICS<br /><span>// STANDBY</span>');
    var pKicker = pauseModal.querySelector('.pause-head .overlay-kicker');
    if (pKicker) pKicker.textContent = zh ? '戰鬥訊號掛起 · 系統終端運作中' : 'COMBAT SIGNAL SUSPENDED · SYSTEM TERMINAL ACTIVE';

    setTextById('tabBtnSystem', zh ? '系統設定' : 'SYSTEM');
    setTextById('tabBtnBuild', zh ? '機體構築' : 'RIG BUILD');
    setTextById('tabBtnControls', zh ? '操作設定' : 'CONTROLS');

    // System Settings Rows
    var settingLabels = pauseModal.querySelectorAll('#panelSystem .setting-label');
    var settingDescs = pauseModal.querySelectorAll('#panelSystem .setting-desc');
    if (settingLabels && settingLabels.length >= 7) {
      settingLabels[0].textContent = zh ? '主音訊音量' : 'MASTER AUDIO VOLUME';
      settingDescs[0].textContent = zh ? '戰鬥／危險預警提示音、開火與介面音效' : 'COMBAT / HAZARD CUES, WEAPON FIRE & UI BEEPS';
      settingLabels[1].textContent = zh ? '音訊狀態' : 'AUDIO STATUS';
      settingDescs[1].textContent = zh ? '靜音戰鬥、危險預警提示音與介面音' : 'MUTE COMBAT, HAZARD TELEGRAPH CUES & UI';
      settingLabels[2].textContent = zh ? '觸覺回饋' : 'HAPTIC FEEDBACK';
      settingDescs[2].textContent = zh ? '衝刺、受擊與爆炸時震動' : 'DEVICE VIBRATION ON DASH, HITS & DETONATIONS';
      settingLabels[3].textContent = zh ? '減少動態效果' : 'REDUCED MOTION';
      settingDescs[3].textContent = zh ? '關閉畫面震動、受擊定格與強光閃爍' : 'DISABLE SHAKE, HITSTOP & HIGH CONTRAST FLASHES';
      settingLabels[4].textContent = zh ? '高對比度 / 敵標符號' : 'HIGH CONTRAST / GLYPHS';
      settingDescs[4].textContent = zh ? '雙層高亮輪廓與幾何識別符號' : 'DUAL-LAYER OUTLINES & GEOMETRIC HOSTILE IDENTIFIERS';
      settingLabels[5].textContent = zh ? '視覺畫質' : 'VISUAL QUALITY';
      settingDescs[5].textContent = zh ? '渲染等級、光影與特效預算' : 'RENDER TIER, LIGHTING AND EFFECT BUDGET';
      settingLabels[6].textContent = zh ? '戰場提示' : 'FIELD TIPS';
      settingDescs[6].textContent = zh ? '戰鬥中的即時情境操作提醒' : 'SITUATIONAL HINTS DURING A RUN';
    }
    setTextById('resetTips', zh ? '重設提示' : 'RESET TIPS');

    // Build Tab Columns
    var buildTitles = pauseModal.querySelectorAll('#panelBuild .build-col-title');
    if (buildTitles && buildTitles.length >= 4) {
      buildTitles[0].textContent = zh ? '武器機底（出擊中鎖定）' : 'WEAPON CHASSIS (LOCKED MID-RUN)';
      buildTitles[1].textContent = zh ? '核心規格數據' : 'CORE SPECS TELEMETRY';
      buildTitles[2].textContent = zh ? '動態被動特徵' : 'DYNAMIC PASSIVE TRAITS';
      buildTitles[3].innerHTML = zh ? '已安裝改裝晶片 (<span id="installedChipsCount">0</span>)' : 'INSTALLED MOD CHIPS (<span id="installedChipsCount">0</span>)';
      if (buildTitles.length >= 5) {
        buildTitles[4].innerHTML = zh ? '融合共鳴矩陣 (<span id="activeFusionsCount">0</span>/6 上線)' : 'FUSION RESONANCE MATRIX (<span id="activeFusionsCount">0</span>/6 ONLINE)';
      }
    }

    var statNames = pauseModal.querySelectorAll('#panelBuild .stat-name');
    if (statNames && statNames.length >= 6) {
      statNames[0].textContent = zh ? '射擊速率' : 'FIRE RATE';
      statNames[1].textContent = zh ? '子彈傷害' : 'BULLET DAMAGE';
      statNames[2].textContent = zh ? '暴擊機制' : 'CRIT PROTOCOL';
      statNames[3].textContent = zh ? '彈道特性' : 'BALLISTICS';
      statNames[4].textContent = zh ? '機體推進' : 'RIG THRUST';
      statNames[5].textContent = zh ? '磁吸範圍' : 'MAGNET REACH';
    }

    // Controls Matrix
    var matrixHead = pauseModal.querySelectorAll('.controls-matrix-head span');
    if (matrixHead && matrixHead.length >= 3) {
      matrixHead[0].textContent = zh ? '動作' : 'ACTION';
      matrixHead[1].textContent = zh ? '鍵盤 / 滑鼠' : 'KEYBOARD / MOUSE';
      matrixHead[2].textContent = zh ? '手把' : 'GAMEPAD';
    }
    var upgradeSub = pauseModal.querySelector('#controlsUpgradeSubhead span') || pauseModal.querySelector('.controls-matrix-subhead span');
    if (upgradeSub) upgradeSub.textContent = zh ? '升級選卡時' : 'DURING UPGRADE PICK';
    var matrixRows = pauseModal.querySelectorAll('.controls-matrix-row');
    if (matrixRows && matrixRows.length >= 11) {
      var r0 = matrixRows[0].querySelectorAll('span');
      if (r0.length >= 3) { r0[0].textContent = zh ? '移動機體' : 'MOVE RIG'; r0[1].textContent = zh ? 'W A S D / 方向鍵' : 'W A S D / ARROWS'; r0[2].textContent = zh ? '左搖桿 / 十字鍵' : 'L-STICK / D-PAD'; }
      var r1 = matrixRows[1].querySelectorAll('span');
      if (r1.length >= 3) { r1[0].textContent = zh ? '瞄準 / 轉向' : 'AIM / LOOK'; r1[1].textContent = zh ? '滑鼠游標' : 'MOUSE POINTER'; r1[2].textContent = zh ? '右搖桿 (360°)' : 'R-STICK (360°)'; }
      var r2 = matrixRows[2].querySelectorAll('span');
      if (r2.length >= 3) { r2[0].textContent = zh ? '開火射擊' : 'FIRE WEAPON'; r2[1].textContent = zh ? '滑鼠左鍵 (長按)' : 'LMB (HOLD)'; r2[2].textContent = 'RT / RB'; }
      var r3 = matrixRows[3].querySelectorAll('span');
      if (r3.length >= 3) { r3[0].textContent = zh ? 'EMP 衝擊' : 'EMP BLAST'; r3[1].textContent = zh ? 'Q / 滑鼠右鍵' : 'Q / RMB'; r3[2].textContent = zh ? 'B 鍵' : 'B BUTTON'; }
      var rTac = matrixRows[4].querySelectorAll('span');
      if (rTac.length >= 3) { rTac[0].textContent = zh ? '戰術副裝備' : 'TACTICAL AUX'; rTac[1].textContent = 'E / F'; rTac[2].textContent = zh ? 'X / LB' : 'X / LB'; }
      var r4 = matrixRows[5].querySelectorAll('span');
      if (r4.length >= 3) { r4[0].textContent = zh ? '推進器衝刺' : 'THRUSTER DASH'; r4[1].textContent = zh ? '空白鍵 / SHIFT' : 'SPACEBAR / SHIFT'; r4[2].textContent = zh ? 'LT / A 鍵' : 'LT / A BUTTON'; }
      var r5 = matrixRows[6].querySelectorAll('span');
      if (r5.length >= 3) { r5[0].textContent = zh ? '暫停 / 繼續' : 'PAUSE / RESUME'; r5[1].textContent = 'ESC / P'; r5[2].textContent = zh ? 'START / 選單鍵' : 'START / MENU'; }
      var r6 = matrixRows[7].querySelectorAll('span');
      if (r6.length >= 3) { r6[0].textContent = zh ? '選擇強化' : 'SELECT UPGRADE'; r6[1].textContent = zh ? '數字鍵 1, 2, 3' : 'KEYS 1, 2, 3'; r6[2].textContent = zh ? '十字鍵／搖桿 · A 確認' : 'D-PAD / STICK · A CONFIRM'; }
      var r7 = matrixRows[8].querySelectorAll('span');
      if (r7.length >= 3) { r7[0].textContent = zh ? '重骰卡片' : 'REROLL CARDS'; r7[1].textContent = 'R'; r7[2].textContent = zh ? 'X 鍵' : 'X BUTTON'; }
      var r8 = matrixRows[9].querySelectorAll('span');
      if (r8.length >= 3) { r8[0].textContent = zh ? '放逐卡片' : 'BANISH CARD'; r8[1].textContent = 'B'; r8[2].textContent = zh ? 'Y 鍵' : 'Y BUTTON'; }
      var r9 = matrixRows[10].querySelectorAll('span');
      if (r9.length >= 3) { r9[0].textContent = zh ? '跳過強化' : 'SKIP UPGRADE'; r9[1].textContent = 'X'; r9[2].textContent = zh ? 'B 鍵' : 'B BUTTON'; }
    }

    var resumeSpan = pauseModal.querySelector('#pauseResumeBtn span');
    if (resumeSpan) resumeSpan.textContent = zh ? '繼續戰鬥' : 'RESUME COMBAT';
    var abandonSpan = pauseModal.querySelector('#pauseAbandonBtn span');
    if (abandonSpan) abandonSpan.textContent = zh ? '放棄出擊' : 'ABANDON RUN';
  }

  // Mission Rail
  var rail = document.querySelector('.mission-rail');
  if (rail) {
    var rHead1 = rail.querySelector('.rail-card--objective .rail-heading span:first-child');
    if (rHead1) rHead1.textContent = zh ? '戰場筆記 01' : 'FIELD NOTE 01';
    var rTitle = rail.querySelector('.rail-title');
    if (rTitle) rTitle.innerHTML = zh ? '活下去。<br /><span>掀起風暴。</span>' : 'STAY ALIVE.<br /><span>GET LOUD.</span>';
    var rObj = document.getElementById('objectiveText');
    if (rObj) rObj.textContent = zh
      ? '在沙暴吞沒訊號前清除每一波敵軍。波次 3 後將有菁英訊號入侵。'
      : 'Clear each wave before the storm swallows the signal. Elite signals breach after wave 3.';
    var rMetaLabels = rail.querySelectorAll('.objective-meta span');
    if (rMetaLabels && rMetaLabels.length >= 2) {
      rMetaLabels[0].textContent = zh ? '威脅指數' : 'THREAT INDEX';
      rMetaLabels[1].textContent = zh ? '沙暴時鐘' : 'STORM CLOCK';
    }
    var rHead2 = rail.querySelector('.rail-card--log .rail-heading span:first-child');
    if (rHead2) rHead2.textContent = zh ? '拾荒廣播' : 'SCAV RADIO';
    var rCode2 = rail.querySelector('.rail-card--log .rail-code');
    if (rCode2) rCode2.textContent = zh ? '即時' : 'LIVE';
    var rHead3 = rail.querySelector('.controls-card .rail-heading span:first-child');
    if (rHead3) rHead3.textContent = zh ? '手動操作' : 'HAND CONTROL';
    var rCode3 = rail.querySelector('.controls-card .rail-code');
    if (rCode3) rCode3.textContent = zh ? '就緒' : 'READY';

    var keyCaps = rail.querySelectorAll('.key-caption');
    if (keyCaps && keyCaps.length >= 5) {
      keyCaps[0].textContent = zh ? '移動' : 'MOVE';
      keyCaps[1].textContent = zh ? '瞄準 / 開火' : 'AIM / FIRE';
      keyCaps[2].textContent = zh ? 'EMP 衝擊' : 'EMP BLAST';
      keyCaps[3].textContent = zh ? '戰術副裝備' : 'TACTICAL AUX';
      keyCaps[4].textContent = zh ? '衝刺' : 'DASH';
    }
    var ctrlNote = rail.querySelector('.controls-note');
    if (ctrlNote) ctrlNote.textContent = zh
      ? '提示: 紅色沙塵逼近時保持移動。'
      : 'Tip: keep moving when the red dust starts to climb.';
    var signoff = rail.querySelector('.rail-signoff');
    if (signoff) signoff.innerHTML = zh ? '<span>無神明</span><i aria-hidden="true">×</i><span>無地圖</span>' : '<span>NO GODS</span><i aria-hidden="true">×</i><span>NO MAPS</span>';
  }

  // Arena Footer & System Footer
  var feed = document.getElementById('feedText');
  if (feed) feed.textContent = zh ? '沙塵濃度: 上升中 / 能見度: 不良' : 'DUST LEVEL: RISING / VISIBILITY: POOR';
  var sysFooterSpan = document.querySelector('.system-footer span:first-child');
  if (sysFooterSpan) sysFooterSpan.textContent = zh ? '© TommyLam / 訊號未經證實' : '© TommyLam / ALL SIGNALS UNVERIFIED';
}
