import assert from 'node:assert';
import {
  getLanguage,
  setLanguage,
  toggleLanguage,
  isChinese,
  onLanguageChange,
  tUpgradeTitle,
  tUpgradeText,
  tFusionTitle,
  tFusionText,
  tCategory,
  tRarity,
  tRigName,
  tRigBlurb,
  tRigReq,
  tWeaponName,
  tWeaponPattern,
  tWeaponLine,
  tChassisDesc,
  tPassiveName,
  tContractName,
  tContractLabel,
  tRewardLabel,
  tMutatorName,
  tMutatorBlurb,
  tRouteName,
  tRouteRule,
  tRouteReward,
  tDailyTitle,
  tDailySummary,
  tAchievementTitle,
  tAchievementDetail,
  tAchievementReward,
  tEnemyName,
  tRankTitle,
  tLog,
  tStatus,
  tTip,
  tBanner,
  syncStaticHtml
} from '../src/core/i18n.js';
import { UPGRADES, FUSION_CHIPS } from '../src/data/upgrades.js';
import { RIGS } from '../src/data/rigs.js';
import { CONTRACTS } from '../src/data/contracts.js';
import { MUTATORS } from '../src/data/mutators.js';
import { ROUTES } from '../src/data/routes.js';
import { listAchievements } from '../src/systems/meta.js';

var enemyIds = ['crawler', 'rusher', 'brute', 'artillery', 'elite', 'spitter', 'scurrier', 'warden', 'burrower', 'titan', 'dreadnought', 'sovereign', 'stormTower', 'mine', 'spire'];

console.log('[1/4] Testing Language Toggling & Persistence...');

// Mock localStorage
const storage = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

setLanguage('zh');
assert.strictEqual(getLanguage(), 'zh');
assert.strictEqual(isChinese(), true);
assert.strictEqual(localStorage.getItem('dust_reign_lang'), 'zh');

let notified = null;
const unsub = onLanguageChange((l) => { notified = l; });

toggleLanguage();
assert.strictEqual(getLanguage(), 'en');
assert.strictEqual(isChinese(), false);
assert.strictEqual(localStorage.getItem('dust_reign_lang'), 'en');
assert.strictEqual(notified, 'en');

toggleLanguage();
assert.strictEqual(getLanguage(), 'zh');
assert.strictEqual(isChinese(), true);
assert.strictEqual(localStorage.getItem('dust_reign_lang'), 'zh');
assert.strictEqual(notified, 'zh');

unsub();
toggleLanguage();
assert.strictEqual(notified, 'zh', 'Unsubscribed listener should not be called');
setLanguage('zh');

console.log(' -> Language state and toggle logic passed.');

console.log('[2/4] Testing Translation Coverage...');

// Test Upgrades
for (const u of UPGRADES) {
  setLanguage('zh');
  const zhTitle = tUpgradeTitle(u);
  const zhText = tUpgradeText(u);
  assert(zhTitle && zhTitle.length > 0, `Missing zh title for upgrade ${u.id}`);
  assert(zhText && zhText.length > 0, `Missing zh text for upgrade ${u.id}`);
  assert(/[^\x00-\x7F]/.test(zhTitle), `Upgrade ${u.id} zh title does not contain non-ASCII: ${zhTitle}`);

  setLanguage('en');
  const enTitle = tUpgradeTitle(u);
  const enText = tUpgradeText(u);
  assert.strictEqual(enTitle, u.title, `Upgrade ${u.id} en title mismatch`);
  assert.strictEqual(enText, u.text, `Upgrade ${u.id} en text mismatch`);
}
console.log(` -> All ${UPGRADES.length} upgrades translated in both zh and en.`);

// Test Fusions
for (const f of FUSION_CHIPS) {
  setLanguage('zh');
  const zhTitle = tFusionTitle(f);
  const zhText = tFusionText(f);
  assert(zhTitle && zhTitle.length > 0, `Missing zh title for fusion ${f.id}`);
  assert(zhText && zhText.length > 0, `Missing zh text for fusion ${f.id}`);
  assert(!zhTitle.includes('//'), `zh fusion title contains '//': ${zhTitle}`);
  assert(/[^\x00-\x7F]/.test(zhTitle), `Fusion ${f.id} zh title does not contain Chinese: ${zhTitle}`);

  setLanguage('en');
  const enTitle = tFusionTitle(f);
  const enText = tFusionText(f);
  assert(enTitle && enTitle.length > 0, `Missing en title for fusion ${f.id}`);
  assert(!enTitle.includes('//'), `en fusion title contains '//': ${enTitle}`);
  assert.strictEqual(enText, f.text, `Fusion ${f.id} en text mismatch`);

  // Test lookup by id or original title
  assert.strictEqual(tFusionTitle(f.id), enTitle);
  assert.strictEqual(tFusionTitle(f.title), enTitle);
}
console.log(` -> All ${FUSION_CHIPS.length} fusions translated in both zh and en.`);

// Test Rigs & Weapons
for (const r of RIGS) {
  setLanguage('zh');
  assert(/[^\x00-\x7F]/.test(tRigName(r.id)), `Rig ${r.id} zh name`);
  assert(/[^\x00-\x7F]/.test(tRigBlurb(r.id)), `Rig ${r.id} zh blurb`);
}
const weaponIds = ['standard', 'breacher', 'vanguard', 'arc-welder'];
for (const wid of weaponIds) {
  setLanguage('zh');
  assert(/[^\x00-\x7F]/.test(tWeaponName(wid)), `Weapon ${wid} zh name`);
  assert(/[^\x00-\x7F]/.test(tWeaponPattern(wid)), `Weapon ${wid} zh pattern`);
  assert(/[^\x00-\x7F]/.test(tWeaponLine(wid)), `Weapon ${wid} zh weaponLine`);
  assert(/[^\x00-\x7F]/.test(tChassisDesc(wid)), `Weapon ${wid} zh chassisDesc`);
}
console.log(` -> All rigs (${RIGS.length}) and weapons (${weaponIds.length}) translated.`);

// Test Contracts, Mutators, Routes
for (const cid in CONTRACTS) {
  const c = CONTRACTS[cid];
  setLanguage('zh');
  assert(/[^\x00-\x7F]/.test(tContractName(c.id)), `Contract ${c.id} zh name`);
  assert(/[^\x00-\x7F]/.test(tContractLabel(c.id)), `Contract ${c.id} zh label`);
  assert(/[^\x00-\x7F]/.test(tRewardLabel({ type: 'reroll', amount: 1 })), 'Contract reward reroll zh');
}
for (const mid in MUTATORS) {
  const m = MUTATORS[mid];
  setLanguage('zh');
  assert(/[^\x00-\x7F]/.test(tMutatorName(m.id)), `Mutator ${m.id} zh name`);
  assert(/[^\x00-\x7F]/.test(tMutatorBlurb(m.id)), `Mutator ${m.id} zh blurb`);
}
for (const rid in ROUTES) {
  const r = ROUTES[rid];
  setLanguage('zh');
  assert(/[^\x00-\x7F]/.test(tRouteName(r.id)), `Route ${r.id} zh name`);
  assert(/[^\x00-\x7F]/.test(tRouteRule(r.id)), `Route ${r.id} zh rule`);
  assert(/[^\x00-\x7F]/.test(tRouteReward(r.id)), `Route ${r.id} zh reward`);
}
console.log(' -> All contracts, mutators, and routes translated.');

// Test Achievements & Enemies
const achs = listAchievements({ stats: { runs: 0, bestWave: 0, bosses: {} }, achievements: {} });
for (const a of achs) {
  setLanguage('zh');
  assert(/[^\x00-\x7F]/.test(tAchievementTitle(a.id)), `Achievement ${a.id} zh title`);
  assert(/[^\x00-\x7F]/.test(tAchievementDetail(a.id)), `Achievement ${a.id} zh detail`);
}
for (const eid of enemyIds) {
  setLanguage('zh');
  assert(/[^\x00-\x7F]/.test(tEnemyName(eid)), `Enemy ${eid} zh name`);
}
console.log(` -> All achievements (${achs.length}) and enemies (${enemyIds.length}) translated.`);

console.log('[3/4] Testing DOM Static HTML Sync...');
// Create a fake DOM structure matching index.html
function makeElement(tag, id = '', className = '', text = '') {
  const children = [];
  return {
    tagName: tag.toUpperCase(),
    id,
    className,
    textContent: text,
    innerHTML: text,
    children,
    querySelector(sel) {
      const parts = sel.trim().split(/\s+/);
      if (parts.length > 1) {
        const first = this.querySelector(parts[0]);
        return first ? first.querySelector(parts.slice(1).join(' ')) : null;
      }
      if (sel.startsWith('#')) {
        const targetId = sel.slice(1);
        if (this.id === targetId) return this;
        for (const c of children) {
          const res = c.querySelector && c.querySelector(sel);
          if (res) return res;
        }
        return null;
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        if (this.className.split(' ').includes(cls)) return this;
        for (const c of children) {
          const res = c.querySelector && c.querySelector(sel);
          if (res) return res;
        }
        return null;
      }
      if (sel.toLowerCase() === this.tagName.toLowerCase()) return this;
      for (const c of children) {
        const res = c.querySelector && c.querySelector(sel);
        if (res) return res;
      }
      return null;
    },
    querySelectorAll(sel) {
      const res = [];
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        if (this.className.split(' ').includes(cls)) res.push(this);
      } else if (sel === 'span') {
        if (this.tagName === 'SPAN') res.push(this);
      }
      for (const c of children) {
        if (c.querySelectorAll) res.push(...c.querySelectorAll(sel));
      }
      return res;
    },
    appendChild(child) {
      children.push(child);
      return child;
    }
  };
}

const elementsById = {};
const rootDoc = {
  getElementById: (id) => elementsById[id] || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return elementsById[sel.slice(1)] || null;
    return null;
  },
  querySelectorAll: () => []
};
globalThis.document = rootDoc;

// Setup key elements
elementsById['langBtn'] = makeElement('button', 'langBtn');
const optEn = makeElement('span', '', 'lang-opt');
optEn.textContent = 'ENG';
const optZh = makeElement('span', '', 'lang-opt');
optZh.textContent = '繁中';
elementsById['langBtn'].children.push(optEn, optZh);

elementsById['toggleLanguage'] = makeElement('button', 'toggleLanguage');
elementsById['settingLanguageLabel'] = makeElement('span', 'settingLanguageLabel');
elementsById['settingLanguageDesc'] = makeElement('span', 'settingLanguageDesc');
const startScreen = makeElement('div', 'startScreen');
elementsById['startScreen'] = startScreen;
const startBtn = makeElement('button', 'startBtn');
const startBtnSpan = makeElement('span', '', '', 'ENTER THE DUST');
startBtn.appendChild(startBtnSpan);
startScreen.appendChild(startBtn);
elementsById['startBtn'] = startBtn;

// Test syncStaticHtml in 'zh'
syncStaticHtml('zh');
assert(elementsById['langBtn'].innerHTML.includes('is-active">繁中</span>'));
assert.strictEqual(elementsById['toggleLanguage'].textContent, '語言: 繁中');
assert.strictEqual(elementsById['settingLanguageLabel'].textContent, '介面語言');
assert.strictEqual(elementsById['settingLanguageDesc'].textContent, '切換英文與繁體中文顯示');
assert.strictEqual(startBtnSpan.textContent, '踏入塵暴');

// Test syncStaticHtml in 'en'
syncStaticHtml('en');
assert(elementsById['langBtn'].innerHTML.includes('is-active">ENG</span>'));
assert.strictEqual(elementsById['toggleLanguage'].textContent, 'LANGUAGE: ENG');
assert.strictEqual(elementsById['settingLanguageLabel'].textContent, 'LANGUAGE');
assert.strictEqual(elementsById['settingLanguageDesc'].textContent, 'INTERFACE LANGUAGE / 介面語言');
assert.strictEqual(startBtnSpan.textContent, 'ENTER THE DUST');

console.log(' -> DOM static HTML sync passed for both zh and en.');

console.log('[4/4] Testing Dynamic Labels and Formats...');
setLanguage('zh');
assert.strictEqual(tCategory('OFFENSE'), '攻擊');
assert.strictEqual(tCategory('DEFENSE'), '防禦');
assert.strictEqual(tCategory('MOBILITY'), '機動');
assert.strictEqual(tCategory('TECH'), '戰術');
assert.strictEqual(tCategory('FUSION'), '融合');
assert.strictEqual(tRarity('COMMON'), '普通');
assert.strictEqual(tRarity('UNCOMMON'), '進階');
assert.strictEqual(tRarity('RARE'), '稀有');
assert.strictEqual(tRarity('EPIC'), '史詩');
assert.strictEqual(tRarity('LEGENDARY'), '傳奇');

assert.strictEqual(tRankTitle('DUST SOVEREIGN'), '沙塵主宰');
assert.strictEqual(tRankTitle('APEX SCAVENGER'), '頂級拾荒者');
assert.strictEqual(tRankTitle('VETERAN BREACHER'), '資深破障者');
assert.strictEqual(tRankTitle('IRON SCRAPPER'), '鋼鐵拆解者');
assert.strictEqual(tRankTitle('RECRUIT RECLUSE'), '隱士新兵');

setLanguage('en');
assert.strictEqual(tCategory('OFFENSE'), 'OFFENSE');
assert.strictEqual(tRarity('RARE'), 'RARE');
assert.strictEqual(tRankTitle('DUST SOVEREIGN'), 'DUST SOVEREIGN');

// Test document.title sync
syncStaticHtml('zh');
assert.strictEqual(globalThis.document.title, 'DUST//REIGN — 廢土征途');
syncStaticHtml('en');
assert.strictEqual(globalThis.document.title, 'DUST//REIGN — Wasteland Run');

// Test tBanner & tLog dynamic translations
setLanguage('zh');
assert(tBanner('SWARM TIDE // +60% HOSTILE DENSITY').includes('蟲群狂潮'));
assert(tBanner('SCORCHED FLATS // Lava lasts +1s. One extra barrel each wave.').includes('焦黑平原'));
assert(tBanner('CONTRACT SEALED // +1 REROLL').includes('合約達成'));
assert(tBanner('TITAN APPROACHING // SECTOR 09').includes('泰坦逼近'));

assert(tLog('BOUNTY SECURED // SURGE ONLINE').includes('懸賞已完成'));
assert(tLog('REPAIR SCRAP +18 HULL').includes('維修廢料'));
assert(tLog('PERFECT DASH // CHRONO DILATION').includes('精準衝刺'));

setLanguage('en');
assert.strictEqual(tBanner('SWARM TIDE // Faster spawns, thinner hulls.'), 'SWARM TIDE // Faster spawns, thinner hulls.');
assert.strictEqual(tLog('REPAIR SCRAP +18 HULL'), 'REPAIR SCRAP +18 HULL');

console.log(' -> All dynamic categories, rarities, rank evaluations, banners, and logs verified.');
console.log('ALL I18N VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
