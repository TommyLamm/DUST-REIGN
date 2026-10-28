import { isChinese, onLanguageChange, tCampaignMilestoneName, tCampaignSectorName, tCampaignSectorDesc, tCampaignStageName, tCampaignStageDesc, tCampaignStageStar, tCampaignThreat } from '../core/i18n.js';
import { getCampaignStore, isStageUnlocked, saveCampaignStore } from '../core/meta-store.js';
import { CAMPAIGN_MILESTONES, CAMPAIGN_SECTORS, CAMPAIGN_STAGES, getCampaignStage } from '../data/campaign-stages.js';
import { rt } from '../core/runtime.js';
import { on } from '../core/utils.js';

var modalElement = null;
var stageGridElement = null;
var sectorTabsElement = null;
var totalStarsElement = null;
var milestoneHintElement = null;
var closeBtnElement = null;
var confirmBtnElement = null;

var activeSector = 1;
var selectedStageId = 'stage_1_1';
var focusedCardIndex = 0;
var isOpen = false;
var selectCallback = null;
var currentSectorStageIds = [];

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function getStageTypeLabel(type, zh) {
  switch (type) {
    case 'wave_wipeout': return zh ? '波次肅清' : 'WIPEOUT';
    case 'scrap_rush': return zh ? '廢料爭奪' : 'SCRAP RUSH';
    case 'vip_hunt': return zh ? 'VIP 斬首' : 'VIP HUNT';
    case 'beacon_defense': return zh ? '陣地堅守' : 'DEFENSE';
    case 'boss_duel': return zh ? '首領單挑' : 'BOSS DUEL';
    case 'payload_escort': return zh ? '物資護送' : 'ESCORT';
    case 'core_overload': return zh ? '核心超載' : 'OVERLOAD';
    default: return type ? type.toUpperCase() : (zh ? '任務' : 'MISSION');
  }
}

function getNextMilestone(totalStars, zh) {
  if (!CAMPAIGN_MILESTONES || !CAMPAIGN_MILESTONES.length) return '';
  for (var i = 0; i < CAMPAIGN_MILESTONES.length; i += 1) {
    var m = CAMPAIGN_MILESTONES[i];
    if (totalStars < m.stars) {
      return (zh ? '下一目標: ' : 'NEXT REWARD: ') + m.stars + '★ ' + tCampaignMilestoneName(m.id, m.name);
    }
  }
  return zh ? '已解鎖全部戰役里程碑！' : 'ALL MILESTONES UNLOCKED!';
}

export function isCampaignModalOpen() {
  return isOpen;
}

export function openCampaignModal(onSelect) {
  if (typeof document === 'undefined') return;
  initCampaignModal();
  if (!modalElement) return;

  selectCallback = onSelect || null;
  var store = getCampaignStore();
  selectedStageId = store.selectedStage || 'stage_1_1';

  // Find which sector the selected stage belongs to
  var stage = null;
  for (var i = 0; i < CAMPAIGN_STAGES.length; i += 1) {
    if (CAMPAIGN_STAGES[i].id === selectedStageId) {
      stage = CAMPAIGN_STAGES[i];
      break;
    }
  }
  if (stage && stage.sector) {
    activeSector = stage.sector;
  }

  isOpen = true;
  modalElement.hidden = false;
  renderModal();

  // Focus the selected stage card or first card
  setTimeout(function () {
    var activeCard = stageGridElement ? stageGridElement.querySelector('.stage-card.is-selected') || stageGridElement.querySelector('.stage-card') : null;
    if (activeCard && activeCard.focus) activeCard.focus();
  }, 50);
}

export function closeCampaignModal() {
  if (!modalElement) return;
  isOpen = false;
  modalElement.hidden = true;
  if (selectCallback) {
    selectCallback(selectedStageId);
  }
}

function selectStage(stageId) {
  if (!isStageUnlocked(stageId)) return;
  selectedStageId = stageId;
  var store = getCampaignStore();
  store.selectedStage = stageId;
  saveCampaignStore(store);
  if (rt.state && rt.state.mode === 'campaign') {
    rt.state.stageConfig = getCampaignStage(stageId);
  }
  closeCampaignModal();
}

export function renderModal() {
  if (!modalElement || !stageGridElement) return;
  var store = getCampaignStore();
  var zh = isChinese();
  var totalStars = (store.stats && typeof store.stats.totalStars === 'number') ? store.stats.totalStars : 0;

  // 1. Update summary bar
  if (totalStarsElement) {
    totalStarsElement.textContent = String(totalStars);
  }
  if (milestoneHintElement) {
    milestoneHintElement.textContent = getNextMilestone(totalStars, zh);
  }

  // 2. Render sector tabs
  if (sectorTabsElement) {
    while (sectorTabsElement.firstChild) sectorTabsElement.removeChild(sectorTabsElement.firstChild);
    for (var s = 0; s < CAMPAIGN_SECTORS.length; s += 1) {
      (function (sector) {
        var tab = el('button', 'sector-tab');
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-sector', String(sector.id));

        var isSecActive = (sector.id === activeSector);
        var isLocked = totalStars < sector.reqStars;

        if (isSecActive) tab.classList.add('is-active');
        if (isLocked) tab.classList.add('is-locked');
        tab.setAttribute('aria-selected', isSecActive ? 'true' : 'false');
        tab.setAttribute('aria-disabled', isLocked ? 'true' : 'false');

        var titleSpan = el('span', '', tCampaignSectorName(sector.id, zh ? sector.name.split(' (')[0] : sector.code));
        tab.setAttribute('title', tCampaignSectorDesc(sector.id, sector.desc || ''));
        tab.setAttribute('aria-label', tCampaignSectorName(sector.id, sector.code) + ' — ' + tCampaignSectorDesc(sector.id, sector.desc || ''));
        var reqSmall = el('small', '', isLocked ? (sector.reqStars + '★ ' + (zh ? '解鎖' : 'REQ')) : (zh ? '已開放' : 'SECURED'));
        tab.appendChild(titleSpan);
        tab.appendChild(reqSmall);

        on(tab, 'click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (isLocked) return;
          activeSector = sector.id;
          focusedCardIndex = 0;
          renderModal();
        });

        sectorTabsElement.appendChild(tab);
      })(CAMPAIGN_SECTORS[s]);
    }
  }

  // Sector description for active sector
  var sectorDescEl = document.getElementById('campaignSectorDesc');
  if (!sectorDescEl && stageGridElement && stageGridElement.parentNode) {
    sectorDescEl = el('p', 'campaign-sector-desc');
    sectorDescEl.id = 'campaignSectorDesc';
    stageGridElement.parentNode.insertBefore(sectorDescEl, stageGridElement);
  }
  if (sectorDescEl) {
    var activeSec = null;
    for (var si = 0; si < CAMPAIGN_SECTORS.length; si += 1) {
      if (CAMPAIGN_SECTORS[si].id === activeSector) { activeSec = CAMPAIGN_SECTORS[si]; break; }
    }
    sectorDescEl.textContent = activeSec ? tCampaignSectorDesc(activeSec.id, activeSec.desc || '') : '';
    sectorDescEl.hidden = !activeSec;
  }

  // 3. Render stage cards for active sector
  while (stageGridElement.firstChild) stageGridElement.removeChild(stageGridElement.firstChild);
  currentSectorStageIds = [];

  var stagesInSector = CAMPAIGN_STAGES.filter(function (stg) {
    return stg.sector === activeSector;
  });

  for (var i = 0; i < stagesInSector.length; i += 1) {
    (function (stg, idx) {
      currentSectorStageIds.push(stg.id);
      var unlocked = isStageUnlocked(stg.id);
      var record = (store.stages && store.stages[stg.id]) || { stars: 0, highScore: 0, bestTime: 0, starDetails: {} };
      var isSelected = (stg.id === selectedStageId);

      var card = el('button', 'stage-card');
      card.type = 'button';
      card.setAttribute('data-stage-id', stg.id);
      card.setAttribute('tabindex', '0');

      if (isSelected) card.classList.add('is-selected');
      if (!unlocked) card.classList.add('is-locked');

      // Head: Code & Type
      var head = el('div', 'stage-card-head');
      var codeSpan = el('span', 'stage-code', stg.code);
      var typeBadge = el('span', 'stage-type-badge', getStageTypeLabel(stg.type, zh));
      head.appendChild(codeSpan);
      head.appendChild(typeBadge);
      card.appendChild(head);

      // Stage Name
      var nameH3 = el('h3', 'stage-name', tCampaignStageName(stg.id, stg.name));
      card.appendChild(nameH3);
      var descP = el('p', 'stage-desc', tCampaignStageDesc(stg.id, stg.desc || ''));
      card.appendChild(descP);

      // Stars Row
      var starsRow = el('div', 'stage-stars-row');
      var starCount = record.stars || 0;
      for (var starIdx = 1; starIdx <= 3; starIdx += 1) {
        var isEarned = starIdx <= starCount;
        var starIcon = el('span', 'star-icon' + (isEarned ? ' is-earned' : ''), isEarned ? '★' : '☆');
        starsRow.appendChild(starIcon);
      }
      card.appendChild(starsRow);

      // Criteria bullet list
      var criteriaList = el('div', 'stage-criteria-list');
      if (stg.starCriteria) {
        var c1 = el('div', 'stage-criteria-item' + (record.starDetails && record.starDetails.star1 ? ' is-met' : ''));
        c1.innerHTML = '<span class="star-bullet">★</span> <span>' + tCampaignStageStar(stg.id, 1, stg.starCriteria.star1 || '') + '</span>';
        var c2 = el('div', 'stage-criteria-item' + (record.starDetails && record.starDetails.star2 ? ' is-met' : ''));
        c2.innerHTML = '<span class="star-bullet">★★</span> <span>' + tCampaignStageStar(stg.id, 2, stg.starCriteria.star2 || '') + '</span>';
        var c3 = el('div', 'stage-criteria-item' + (record.starDetails && record.starDetails.star3 ? ' is-met' : ''));
        c3.innerHTML = '<span class="star-bullet">★★★</span> <span>' + tCampaignStageStar(stg.id, 3, stg.starCriteria.star3 || '') + '</span>';
        criteriaList.appendChild(c1);
        criteriaList.appendChild(c2);
        criteriaList.appendChild(c3);
      }
      card.appendChild(criteriaList);

      // Card Foot: Best Records & Threat
      var foot = el('div', 'stage-card-foot');
      var records = el('span', 'stage-records');
      if (record.highScore > 0 || record.bestTime > 0) {
        var timeStr = record.bestTime > 0 ? (record.bestTime.toFixed(1) + 's') : '--';
        records.innerHTML = (zh ? '最佳: ' : 'BEST: ') + '<strong>' + record.highScore + '</strong> · ' + timeStr;
      } else {
        records.textContent = unlocked ? (zh ? '未通關' : 'NOT CLEARED') : (zh ? '前置關卡未達成' : 'LOCKED');
      }
      var threatSpan = el('span', 'stage-threat', (zh ? '威脅: ' : 'THREAT: ') + tCampaignThreat(stg.threat));
      foot.appendChild(records);
      foot.appendChild(threatSpan);
      card.appendChild(foot);

      // Click event
      on(card, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!unlocked) return;
        selectStage(stg.id);
      });

      stageGridElement.appendChild(card);
    })(stagesInSector[i], i);
  }
}

export function campaignModalCommand(command) {
  if (!isOpen) return false;

  if (command === 'cancel') {
    closeCampaignModal();
    return true;
  }

  var cards = stageGridElement ? stageGridElement.querySelectorAll('.stage-card') : [];
  if (!cards.length) return false;

  if (command === 'left') {
    focusedCardIndex = (focusedCardIndex - 1 + cards.length) % cards.length;
    if (cards[focusedCardIndex] && cards[focusedCardIndex].focus) cards[focusedCardIndex].focus();
    return true;
  }
  if (command === 'right') {
    focusedCardIndex = (focusedCardIndex + 1) % cards.length;
    if (cards[focusedCardIndex] && cards[focusedCardIndex].focus) cards[focusedCardIndex].focus();
    return true;
  }
  if (command === 'up' || command === 'down') {
    var delta = command === 'down' ? 2 : -2;
    var nextIdx = focusedCardIndex + delta;
    if (nextIdx >= 0 && nextIdx < cards.length) {
      focusedCardIndex = nextIdx;
      if (cards[focusedCardIndex] && cards[focusedCardIndex].focus) cards[focusedCardIndex].focus();
      return true;
    }
  }
  if (command === 'confirm') {
    if (cards[focusedCardIndex]) {
      cards[focusedCardIndex].click();
      return true;
    }
  }

  return false;
}

function onKeyDown(e) {
  if (!isOpen) return;
  var key = String(e.key || '').toLowerCase();
  if (key === 'escape') {
    e.preventDefault();
    e.stopPropagation();
    closeCampaignModal();
  } else if (key === 'arrowleft') {
    e.preventDefault();
    campaignModalCommand('left');
  } else if (key === 'arrowright') {
    e.preventDefault();
    campaignModalCommand('right');
  } else if (key === 'arrowup') {
    e.preventDefault();
    campaignModalCommand('up');
  } else if (key === 'arrowdown') {
    e.preventDefault();
    campaignModalCommand('down');
  } else if (key === 'enter') {
    e.preventDefault();
    campaignModalCommand('confirm');
  }
}

export function initCampaignModal() {
  if (modalElement || typeof document === 'undefined') return;

  modalElement = document.getElementById('campaignModal');
  if (!modalElement) return;

  stageGridElement = document.getElementById('stageGrid');
  sectorTabsElement = document.getElementById('sectorTabs');
  totalStarsElement = document.getElementById('campaignTotalStars');
  milestoneHintElement = document.getElementById('campaignMilestoneHint');
  closeBtnElement = document.getElementById('campaignCloseBtn');
  confirmBtnElement = document.getElementById('campaignConfirmBtn');

  if (closeBtnElement) {
    on(closeBtnElement, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeCampaignModal();
    });
  }

  if (confirmBtnElement) {
    on(confirmBtnElement, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeCampaignModal();
    });
  }

  on(window, 'keydown', onKeyDown, true);
}

onLanguageChange(function () {
  if (isOpen) renderModal();
});
