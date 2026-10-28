import { isChinese } from '../core/i18n.js';
import { equipModule, getEquippedWattage, getWorkshopLoadout, getWorkshopState, readMeta, readScrap, unequipModule, upgradeModule } from '../core/meta-store.js';
import { MAX_WATTAGE, MODULES, getModule, getModuleCost, getModuleTierData } from '../data/modules.js';
import { on } from '../core/utils.js';

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function branchLabel(branch, zh) {
  if (branch === 'propulsion') return zh ? '動力' : 'PROPULSION';
  if (branch === 'armor') return zh ? '裝甲' : 'ARMOR';
  if (branch === 'tactical') return zh ? '戰術' : 'TACTICAL';
  return String(branch || '').toUpperCase();
}

export function createWorkshopPanel() {
  var container = el('div', 'workshop-panel-container');
  container.id = 'tabPanelWorkshop';
  container.hidden = true;
  return container;
}

export function refreshWorkshopPanel(container) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  var zh = isChinese();
  var scrap = readScrap();
  var wsState = getWorkshopState();
  var loadout = wsState.loadout;
  var unlocked = wsState.unlockedModules || {};
  var tuning = wsState.tuning || {};
  var usedWattage = getEquippedWattage();
  var meta = readMeta();
  var mode = meta.selectedMode || 'standard';

  // 1. Header & Wattage Capacity Meter
  var header = el('div', 'workshop-header');
  var titleRow = el('div', 'workshop-title-row');
  titleRow.appendChild(el('h3', 'workshop-title', zh ? '廢料改裝工坊' : 'SCRAPYARD WORKSHOP'));
  var scrapBadge = el('div', 'workshop-scrap-badge', (zh ? '精煉廢料: ' : 'REFINED SCRAP: ') + scrap + ' ⚙');
  titleRow.appendChild(scrapBadge);
  header.appendChild(titleRow);

  var meterRow = el('div', 'workshop-meter-row');
  var meterLabel = el('span', 'workshop-meter-label', (zh ? '底盤負載: ' : 'CHASSIS LOAD: ') + usedWattage + ' / ' + MAX_WATTAGE + ' ⚡');
  meterRow.appendChild(meterLabel);

  var pips = el('div', 'workshop-wattage-pips');
  for (var w = 1; w <= MAX_WATTAGE; w += 1) {
    var pip = el('div', 'wattage-pip' + (w <= usedWattage ? ' is-used' : ''));
    pip.textContent = '⚡';
    pips.appendChild(pip);
  }
  meterRow.appendChild(pips);
  header.appendChild(meterRow);

  // Mode Guardrail Warning
  var noticeText = '';
  var noticeClass = 'workshop-notice';
  if (mode === 'hardcore') {
    noticeText = zh ? '🔒 極限作戰警告: 改裝模組已全面強制下線 (硬體鎖定)' : '🔒 HARDCORE NOTICE: Chassis modules are strictly OFFLINE (Hardware Lock)';
    noticeClass += ' is-hardcore';
  } else if (mode === 'standard') {
    noticeText = zh ? '⚙ 標準出擊: 安裝模組出擊將標記為 [MOD] 改裝評級 (獨立排行榜)' : '⚙ STANDARD MODE: Equipping modules tags run as [MOD] (Unranked Leaderboard)';
    noticeClass += ' is-modded';
  } else {
    noticeText = zh ? '★ 戰役闖關: 改裝模組全面運作，無限制發揮戰術潛能' : '★ CAMPAIGN MODE: Chassis modules fully operational';
    noticeClass += ' is-campaign';
  }
  header.appendChild(el('p', noticeClass, noticeText));
  container.appendChild(header);

  // 2. Chassis Sockets (Propulsion, Armor, Tactical)
  var socketsSec = el('div', 'workshop-sockets-section');
  socketsSec.appendChild(el('h4', 'workshop-section-title', zh ? '底盤安裝插槽 (3 插槽)' : 'CHASSIS SOCKETS (3 SLOTS)'));

  var socketsGrid = el('div', 'workshop-sockets-grid');
  var branches = [
    { id: 'propulsion', name: zh ? '動力插槽' : 'PROPULSION' },
    { id: 'armor', name: zh ? '裝甲插槽' : 'ARMOR' },
    { id: 'tactical', name: zh ? '戰術插槽' : 'TACTICAL' }
  ];

  branches.forEach(function (br) {
    var equippedId = loadout[br.id];
    var equippedMod = equippedId ? getModule(equippedId) : null;
    var socketCard = el('div', 'workshop-socket-card' + (equippedMod ? ' has-module' : ' is-empty'));

    var sHeader = el('div', 'socket-card-header');
    sHeader.appendChild(el('span', 'socket-branch-tag', br.name));
    if (equippedMod) {
      sHeader.appendChild(el('span', 'socket-wattage-tag', '⚡ ' + equippedMod.wattage + 'W'));
    }
    socketCard.appendChild(sHeader);

    var sBody = el('div', 'socket-card-body');
    if (equippedMod) {
      var modTier = unlocked[equippedMod.id] || 1;
      var modTuning = (tuning && tuning[equippedMod.id]) || 0;
      var tierText = 'T' + modTier + (modTuning > 0 ? ' [+' + (modTuning * 5) + '%]' : '');
      sBody.appendChild(el('strong', 'socket-mod-title', (equippedMod.code ? equippedMod.code + ' ' : '') + (zh ? equippedMod.nameZh : equippedMod.name)));
      sBody.appendChild(el('span', 'socket-tier-badge', tierText));

      var detachBtn = el('button', 'workshop-detach-btn', zh ? '卸下模組' : 'DETACH');
      detachBtn.type = 'button';
      on(detachBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        unequipModule(br.id);
        refreshWorkshopPanel(container);
      });
      socketCard.appendChild(sBody);
      socketCard.appendChild(detachBtn);
    } else {
      sBody.appendChild(el('span', 'socket-empty-text', zh ? '[ 插槽空置 ]' : '[ EMPTY SOCKET ]'));
      sBody.appendChild(el('span', 'socket-empty-hint', zh ? '從下方模組庫點選裝備' : 'Equip from the catalog below'));
      socketCard.setAttribute('aria-label', br.name + ' — ' + (zh ? '插槽空置' : 'EMPTY SOCKET'));
      socketCard.appendChild(sBody);
    }
    socketsGrid.appendChild(socketCard);
  });
  socketsSec.appendChild(socketsGrid);
  container.appendChild(socketsSec);

  // 3. Modules Catalog (9 Modules)
  var catalogSec = el('div', 'workshop-catalog-section');
  catalogSec.appendChild(el('h4', 'workshop-section-title', zh ? '改裝模組庫 (9 模組)' : 'MODULE CATALOG (9 MODULES)'));

  var catalogGrid = el('div', 'workshop-catalog-grid');
  MODULES.forEach(function (mod) {
    var currentTier = unlocked[mod.id] || 1;
    var tuningLevel = (tuning && tuning[mod.id]) || 0;
    var tuningMultiplier = 1 + 0.05 * tuningLevel;
    var isEquipped = (loadout[mod.branch] === mod.id);
    var card = el('div', 'module-card' + (isEquipped ? ' is-equipped' : ''));

    // Top Row: Code, Name, Branch, Wattage
    var topRow = el('div', 'module-card-top');
    var codeName = el('div', 'module-code-name');
    codeName.appendChild(el('span', 'module-code', mod.code));
    codeName.appendChild(el('strong', 'module-name', zh ? mod.nameZh : mod.name));
    topRow.appendChild(codeName);

    var tags = el('div', 'module-tags');
    tags.appendChild(el('span', 'module-branch-badge', branchLabel(mod.branch, zh)));
    tags.appendChild(el('span', 'module-wattage-badge', '⚡ ' + mod.wattage + 'W'));
    topRow.appendChild(tags);
    card.appendChild(topRow);

    // Tier indicator
    var tierBar = el('div', 'module-tier-bar');
    var tierLabelText = (zh ? ('階級 ' + currentTier + ' / 3') : ('TIER ' + currentTier + ' / 3')) + (tuningLevel > 0 ? (zh ? (' [超頻 Lv.' + tuningLevel + ']') : (' [OC Lv.' + tuningLevel + ']')) : '');
    tierBar.appendChild(el('span', 'module-tier-label', tierLabelText));
    card.appendChild(tierBar);

    // Stats: Bonus & Trade-off
    var statsDiv = el('div', 'module-stats-box');
    var tierData = getModuleTierData(mod.id, currentTier);
    if (tierData) {
      var bonusText = zh ? tierData.bonusDescZh : tierData.bonusDesc;
      if (tuningLevel > 0) {
        var ocBonusPct = Math.round(tuningLevel * 5);
        bonusText += ' ' + (zh ? '(超頻 +' + ocBonusPct + '% 主加成 x' + tuningMultiplier.toFixed(2) + ')' : '(OVERCLOCK +' + ocBonusPct + '% x' + tuningMultiplier.toFixed(2) + ')');
      }
      statsDiv.appendChild(el('p', 'module-bonus-text', '▲ ' + bonusText));
    }
    if (mod.tradeOff) {
      statsDiv.appendChild(el('p', 'module-penalty-text', '▼ ' + (zh ? mod.tradeOff.descZh : mod.tradeOff.desc)));
    }
    card.appendChild(statsDiv);

    // Actions: Equip / Detach & Upgrade
    var actionsRow = el('div', 'module-actions-row');

    // Equip / Detach
    var equipBtn = el('button', 'module-action-btn' + (isEquipped ? ' is-detach' : ' is-equip'));
    equipBtn.type = 'button';
    if (isEquipped) {
      equipBtn.textContent = zh ? '已安裝 (卸下)' : 'INSTALLED (DETACH)';
      on(equipBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        unequipModule(mod.branch);
        refreshWorkshopPanel(container);
      });
    } else {
      var currentInBranch = loadout[mod.branch] ? getModule(loadout[mod.branch]) : null;
      var currentBranchWattage = currentInBranch ? currentInBranch.wattage : 0;
      var canFit = (usedWattage - currentBranchWattage + mod.wattage <= MAX_WATTAGE);

      if (canFit) {
        equipBtn.textContent = (zh ? '安裝 ⚡' : 'INSTALL ⚡') + mod.wattage + 'W';
        on(equipBtn, 'click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          equipModule(mod.id);
          refreshWorkshopPanel(container);
        });
      } else {
        equipBtn.textContent = zh ? '負載過重 (>6⚡)' : 'OVERLOAD (>6⚡)';
        equipBtn.disabled = true;
        equipBtn.title = zh ? '底盤負載不足，請先卸下其他模組' : 'Chassis wattage full — detach another module first';
        equipBtn.setAttribute('aria-label', equipBtn.title);
      }
    }
    actionsRow.appendChild(equipBtn);

    // Upgrade / Overclock
    var upgradeBtn = el('button', 'module-action-btn is-upgrade');
    upgradeBtn.type = 'button';
    if (currentTier < 3) {
      var cost = getModuleCost(mod.id, currentTier);
      var canAfford = (scrap >= cost);
      upgradeBtn.textContent = (zh ? '升至 T' : 'UPGRADE T') + (currentTier + 1) + ' (' + cost + '⚙)';
      if (canAfford) {
        on(upgradeBtn, 'click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          upgradeModule(mod.id);
          refreshWorkshopPanel(container);
        });
      } else {
        upgradeBtn.disabled = true;
        upgradeBtn.classList.add('is-disabled');
        upgradeBtn.title = zh ? ('精煉廢料不足 — 需要 ' + cost + '⚙') : ('Not enough refined scrap — need ' + cost + '⚙');
        upgradeBtn.setAttribute('aria-label', upgradeBtn.title);
      }
    } else if (tuningLevel < 3) {
      var ocCost = 250;
      var canAffordOc = (scrap >= ocCost);
      upgradeBtn.textContent = (zh ? '超頻微調 +1 (250 廢料)' : 'OVERCLOCK +1 (250 SCRAP)');
      if (canAffordOc) {
        on(upgradeBtn, 'click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          upgradeModule(mod.id);
          refreshWorkshopPanel(container);
        });
      } else {
        upgradeBtn.disabled = true;
        upgradeBtn.classList.add('is-disabled');
        upgradeBtn.title = zh ? ('精煉廢料不足 — 需要 ' + ocCost + '⚙') : ('Not enough refined scrap — need ' + ocCost + '⚙');
        upgradeBtn.setAttribute('aria-label', upgradeBtn.title);
      }
    } else {
      upgradeBtn.textContent = zh ? '超頻已滿階 (MAX)' : 'MAX OVERCLOCKED';
      upgradeBtn.disabled = true;
      upgradeBtn.classList.add('is-max');
      upgradeBtn.title = zh ? '此模組已達超頻上限' : 'Module already at max overclock';
      upgradeBtn.setAttribute('aria-label', upgradeBtn.title);
    }
    actionsRow.appendChild(upgradeBtn);

    card.appendChild(actionsRow);
    catalogGrid.appendChild(card);
  });

  catalogSec.appendChild(catalogGrid);
  container.appendChild(catalogSec);
}
