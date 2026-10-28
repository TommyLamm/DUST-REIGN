import { isChinese } from '../core/i18n.js';
import { formatDamageSourceLabel } from '../systems/combat.js';
import { getCampaignStore, isStageUnlocked, saveCampaignStore } from '../core/meta-store.js';
import { CAMPAIGN_STAGES, getCampaignStage } from '../data/campaign-stages.js';
import { beginRun, restart } from '../systems/flow.js';
import { openCampaignModal } from './campaign-modal.js';
import { on } from '../core/utils.js';

var initialized = false;
var lastOverState = false;
var lastVictoryKey = '';

var screenElement = null;
var titleElement = null;
var stampElement = null;
var kickerElement = null;
var restartBtn = null;
var dualExitGroup = null;
var nextSectorBtn = null;
var replayBtn = null;
var stageSelectBtn = null;
var victoryStarsContainer = null;

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function findNextStageId(currentStageId) {
  var idx = CAMPAIGN_STAGES.findIndex(function (s) { return s.id === currentStageId; });
  if (idx !== -1 && idx + 1 < CAMPAIGN_STAGES.length) {
    var nextStage = CAMPAIGN_STAGES[idx + 1];
    if (isStageUnlocked(nextStage.id)) {
      return nextStage.id;
    }
  }
  return null;
}

export function handleNextSector() {
  var store = getCampaignStore();
  var currentStageId = store.selectedStage || 'stage_1_1';
  var nextId = findNextStageId(currentStageId);

  if (nextId) {
    store.selectedStage = nextId;
    saveCampaignStore(store);
    restart();
    beginRun();
  } else {
    // If no next stage or next stage locked, open stage modal
    restart();
    openCampaignModal();
  }
}

function renderVictoryStars(state) {
  if (!victoryStarsContainer) return;
  while (victoryStarsContainer.firstChild) victoryStarsContainer.removeChild(victoryStarsContainer.firstChild);

  var zh = isChinese();
  var stageConfig = state.stageConfig || null;
  var stageId = (stageConfig && stageConfig.id) || (getCampaignStore().selectedStage);
  var stageObj = getCampaignStage(stageId);

  var starsEarned = state.stageStars || { star1: true, star2: false, star3: false };
  var criteria = (stageObj && stageObj.starCriteria) || {
    star1: zh ? '通關任務主要目標' : 'Primary mission objective fulfilled',
    star2: zh ? '剩餘生命值 ≥ 75%' : 'Hull integrity maintained ≥ 75%',
    star3: zh ? '戰術極限精通評級' : 'Tactical mastery evaluation'
  };

  var starDefs = [
    { num: 1, key: 'star1', label: criteria.star1, lit: !!starsEarned.star1 },
    { num: 2, key: 'star2', label: criteria.star2, lit: !!starsEarned.star2 },
    { num: 3, key: 'star3', label: criteria.star3, lit: !!starsEarned.star3 }
  ];

  for (var s = 0; s < starDefs.length; s += 1) {
    var def = starDefs[s];
    var slot = el('div', 'victory-star-slot' + (def.lit ? ' is-lit' : ''));
    slot.setAttribute('data-star', String(def.num));

    var glyph = el('div', 'victory-star-glyph', def.lit ? '★' : '☆');
    var desc = el('div', 'victory-star-desc', def.label);

    slot.appendChild(glyph);
    slot.appendChild(desc);
    victoryStarsContainer.appendChild(slot);
  }
}

export function updateGameOverUi(state) {
  if (typeof document === 'undefined') return;
  if (!initialized) initGameOverUi();
  if (!screenElement) return;

  var isOver = !!(state && state.over && (!screenElement.hidden || (state.deathSequenceTimer <= 0)));

  if (!isOver) {
    if (lastOverState) {
      lastOverState = false;
      lastVictoryKey = '';
      screenElement.classList.remove('is-victory');
      if (dualExitGroup) dualExitGroup.hidden = true;
      if (restartBtn) restartBtn.hidden = false;
      if (victoryStarsContainer) victoryStarsContainer.hidden = true;
    }
    return;
  }

  lastOverState = true;
  var isVictory = !!(state.victory || state.stageCleared);
  var zh = isChinese();
  var mode = state.mode || 'standard';

  var key = isVictory + '|' + mode + '|' + (state.wave || 0) + '|' + (zh ? 'zh' : 'en');
  if (lastVictoryKey === key) return;
  lastVictoryKey = key;

  if (isVictory && (mode === 'campaign' || mode === 'hardcore')) {
    screenElement.classList.add('is-victory');

    if (stampElement) {
      stampElement.className = 'overlay-stamp overlay-stamp--success victory-banner';
      stampElement.innerHTML = 'SECTOR SECURED <span>//</span> MISSION COMPLETE';
    }
    if (kickerElement) {
      kickerElement.textContent = zh ? '區域威脅已肅清 · 戰術指標全數平定' : 'ALL SECTOR OBJECTIVES SECURED // DRIFT TERMINATED';
    }
    if (titleElement) {
      titleElement.innerHTML = zh ? '任務達成<br /><span>全面突破</span>' : 'MISSION COMPLETE<br /><span>SECTOR CLEARED</span>';
    }

    // Render 3-Star lighting
    if (victoryStarsContainer) {
      victoryStarsContainer.hidden = false;
      renderVictoryStars(state);
    }

    // Switch to Dual-Exit Buttons
    if (restartBtn) restartBtn.hidden = true;
    if (dualExitGroup) {
      dualExitGroup.hidden = false;
      var nextStageId = findNextStageId(state.stageConfig ? state.stageConfig.id : getCampaignStore().selectedStage);
      if (nextSectorBtn) {
        var nextSpan = nextSectorBtn.querySelector('span');
        if (nextSpan) {
          nextSpan.textContent = nextStageId ? (zh ? '下一區域出擊' : 'NEXT SECTOR') : (zh ? '戰役全數通關 ⊞' : 'CAMPAIGN COMPLETE ⊞');
        }
      }
      if (replayBtn) {
        var replaySpan = replayBtn.querySelector('span');
        if (replaySpan) replaySpan.textContent = zh ? '原關重試' : 'REPLAY';
      }
      if (stageSelectBtn) {
        var selectSpan = stageSelectBtn.querySelector('span');
        if (selectSpan) selectSpan.textContent = zh ? '關卡選擇' : 'STAGE SELECT';
      }
    }
  } else {
    // Normal defeat state
    screenElement.classList.remove('is-victory');

    if (stampElement) {
      stampElement.className = 'overlay-stamp overlay-stamp--danger';
      stampElement.innerHTML = 'SIGNAL LOST <span>//</span> RUN ENDED';
    }
    if (kickerElement) {
      var cause = formatDamageSourceLabel(state.lastDamageSource, zh);
      kickerElement.textContent = zh
        ? ('死因 // ' + cause + ' · 荒原終將索取一切')
        : ('KILLED BY // ' + cause + ' · THE DRYLINE ALWAYS COLLECTS');
    }
    if (titleElement) {
      titleElement.innerHTML = zh ? '塵埃之境<br /><span>吞噬萬物</span>' : 'THE DUST<br /><span>TAKES ALL.</span>';
    }

    if (victoryStarsContainer) victoryStarsContainer.hidden = true;
    if (restartBtn) restartBtn.hidden = false;
    if (dualExitGroup) dualExitGroup.hidden = true;
  }

  var metaReward = document.getElementById('metaGameOverReward');
  if (!metaReward) {
    metaReward = el('div', 'game-over-meta-reward');
    metaReward.id = 'metaGameOverReward';
    var anchor = screenElement.querySelector('.overlay-stats') || screenElement.querySelector('.stats-table') || restartBtn || screenElement;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(metaReward, anchor.nextSibling);
    else screenElement.appendChild(metaReward);
  }
  while (metaReward.firstChild) metaReward.removeChild(metaReward.firstChild);
  var refinedEarned = state.singleRunRefinedScrapEarned || Math.floor((state.totalScrapCollected || 0) / 60);
  if (refinedEarned > 0) {
    var scrapP = el('div', 'meta-scrap-reward', (zh ? '獲得精煉廢料: +' : 'REFINED SCRAP: +') + refinedEarned + ' ⚙');
    metaReward.appendChild(scrapP);
  }
  if (state.isModded) {
    var modP = el('div', 'meta-mod-badge', zh ? '[MOD] 改裝裝備運行 (非官方榜單)' : '[MOD] MODDED RUN (UNRANKED)');
    metaReward.appendChild(modP);
  }
}

export function initGameOverUi() {
  if (initialized || typeof document === 'undefined') return;

  screenElement = document.getElementById('gameOverScreen');
  if (!screenElement) return;

  titleElement = document.getElementById('gameOverTitle');
  stampElement = screenElement.querySelector('.overlay-stamp');
  kickerElement = screenElement.querySelector('.overlay-kicker');
  restartBtn = document.getElementById('restartBtn');
  dualExitGroup = document.getElementById('dualExitGroup');
  nextSectorBtn = document.getElementById('nextSectorBtn');
  replayBtn = document.getElementById('replayBtn');
  stageSelectBtn = document.getElementById('stageSelectBtn');
  victoryStarsContainer = document.getElementById('victoryStarsContainer');

  if (nextSectorBtn) {
    on(nextSectorBtn, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handleNextSector();
    });
  }

  if (replayBtn) {
    on(replayBtn, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      restart();
      beginRun();
    });
  }

  if (stageSelectBtn) {
    on(stageSelectBtn, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      restart();
      openCampaignModal();
    });
  }

  initialized = true;
}
