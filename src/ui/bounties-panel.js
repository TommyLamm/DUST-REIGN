import { isChinese } from '../core/i18n.js';
import { claimDailyBounty, claimGrandSlam, readDailyBounties, readScrap } from '../core/meta-store.js';
import { GRAND_SLAM_BONUS } from '../data/bounties.js';
import { on } from '../core/utils.js';

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createBountiesPanel() {
  var container = el('div', 'bounties-panel-container');
  container.id = 'tabPanelBounties';
  container.hidden = true;
  return container;
}

export function refreshBountiesPanel(container) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  var zh = isChinese();
  var scrap = readScrap();
  var dailyData = readDailyBounties();
  var bounties = dailyData.bounties || [];
  var dateStr = dailyData.date || '';

  var claimedCount = 0;
  bounties.forEach(function (b) {
    if (b.claimed) claimedCount += 1;
  });

  // 1. Header
  var header = el('div', 'bounties-header');
  var titleRow = el('div', 'bounties-title-row');
  titleRow.appendChild(el('h3', 'bounties-title', zh ? '每日傭兵賞金契約' : 'DAILY MERCENARY CONTRACTS'));
  var scrapBadge = el('div', 'bounties-scrap-badge', (zh ? '精煉廢料: ' : 'REFINED SCRAP: ') + scrap + ' ⚙');
  titleRow.appendChild(scrapBadge);
  header.appendChild(titleRow);

  var metaRow = el('div', 'bounties-meta-row');
  metaRow.appendChild(el('span', 'bounties-date-badge', (zh ? '契約日期: ' : 'CONTRACT DATE: ') + dateStr));
  metaRow.appendChild(el('span', 'bounties-progress-badge', (zh ? '今日達成: ' : 'COMPLETED: ') + claimedCount + ' / 3'));
  header.appendChild(metaRow);
  container.appendChild(header);

  // 2. 3 Daily Bounties Grid
  var listSec = el('div', 'bounties-list-section');
  listSec.appendChild(el('h4', 'bounties-section-title', zh ? '今日懸賞目標 (全清解鎖大滿貫)' : 'TODAY TARGETS (CLEAR ALL FOR GRAND SLAM)'));

  var listGrid = el('div', 'bounties-grid');
  if (!bounties.length) {
    var empty = el('div', 'bounties-empty');
    empty.appendChild(el('strong', null, zh ? '今日尚無賞金契約' : 'NO DAILY CONTRACTS'));
    empty.appendChild(el('p', null, zh ? '跨日後自動刷新三項傭兵目標' : 'Three mercenary targets refresh after the calendar day rolls'));
    listGrid.appendChild(empty);
  }
  bounties.forEach(function (b) {
    var isDone = (b.progress >= b.goal);
    var isClaimed = !!b.claimed;
    var card = el('div', 'bounty-card' + (isClaimed ? ' is-claimed' : (isDone ? ' is-ready' : '')));

    var top = el('div', 'bounty-card-top');
    top.appendChild(el('span', 'bounty-category-tag', String(b.category || 'MISSION').toUpperCase()));
    top.appendChild(el('span', 'bounty-reward-tag', '+' + b.reward + ' ⚙'));
    card.appendChild(top);

    card.appendChild(el('strong', 'bounty-title', zh ? b.titleZh : b.title));
    card.appendChild(el('p', 'bounty-desc', zh ? b.descZh : b.desc));

    // Progress bar
    var progRow = el('div', 'bounty-progress-row');
    var barTrack = el('div', 'bounty-progress-track');
    var barFill = el('div', 'bounty-progress-fill');
    var pct = Math.min(100, Math.round((Math.max(0, b.progress) / Math.max(1, b.goal)) * 100));
    barFill.style.width = pct + '%';
    barTrack.appendChild(barFill);
    progRow.appendChild(barTrack);
    progRow.appendChild(el('span', 'bounty-progress-text', b.progress + ' / ' + b.goal + ' ' + (b.unit || '')));
    card.appendChild(progRow);

    // Action button
    var actionBtn = el('button', 'bounty-action-btn');
    actionBtn.type = 'button';
    if (isClaimed) {
      actionBtn.textContent = zh ? '✓ 已領取' : '✓ CLAIMED';
      actionBtn.disabled = true;
      actionBtn.classList.add('is-claimed');
    } else if (isDone) {
      actionBtn.textContent = (zh ? '領取獎勵 +' : 'CLAIM +') + b.reward + ' ⚙';
      actionBtn.classList.add('is-claimable');
      on(actionBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        claimDailyBounty(b.id);
        refreshBountiesPanel(container);
      });
    } else {
      var left = (b.goal || 0) - (b.progress || 0);
      if (left < 0) left = 0;
      actionBtn.textContent = zh
        ? ('進行中 · 還差 ' + left + (b.unit ? ' ' + b.unit : ''))
        : ('IN PROGRESS · ' + left + ' LEFT');
      actionBtn.disabled = true;
      actionBtn.classList.add('is-pending');
      actionBtn.title = (zh ? b.descZh : b.desc) || '';
    }
    card.setAttribute('aria-label', [
      zh ? b.titleZh : b.title,
      isClaimed ? (zh ? '已領取' : 'CLAIMED') : (isDone ? (zh ? '可領取' : 'CLAIMABLE') : (zh ? '進行中' : 'IN PROGRESS')),
      (b.progress || 0) + ' / ' + (b.goal || 0)
    ].join(' — '));
    card.appendChild(actionBtn);
    listGrid.appendChild(card);
  });
  listSec.appendChild(listGrid);
  container.appendChild(listSec);

  // 3. Grand Slam All-Clear Bonus Card
  var slamSec = el('div', 'bounties-grand-slam-section');
  var allClaimed = (claimedCount === 3);
  var slamClaimed = !!dailyData.grandSlamClaimed;
  var slamCard = el('div', 'grand-slam-card' + (slamClaimed ? ' is-claimed' : (allClaimed ? ' is-ready' : '')));

  var slamTop = el('div', 'grand-slam-top');
  slamTop.appendChild(el('strong', 'grand-slam-title', zh ? '★ 傭兵全清大滿貫 (GRAND SLAM)' : '★ MERCENARY GRAND SLAM'));
  slamTop.appendChild(el('span', 'grand-slam-reward-tag', '+' + GRAND_SLAM_BONUS + ' ⚙'));
  slamCard.appendChild(slamTop);

  slamCard.appendChild(el('p', 'grand-slam-desc', zh ? '在同一自然日內全數達成並領取 3 項傭兵賞金契約，即可額外領取豐厚大滿貫廢料獎勵！' : 'Fulfill and claim all 3 daily mercenary contracts within the calendar day to unlock the Grand Slam refined scrap bounty!'));

  var slamBtn = el('button', 'grand-slam-btn');
  slamBtn.type = 'button';
  if (slamClaimed) {
    slamBtn.textContent = zh ? '✓ 大滿貫已領取' : '✓ GRAND SLAM CLAIMED';
    slamBtn.disabled = true;
    slamBtn.classList.add('is-claimed');
  } else if (allClaimed) {
    slamBtn.textContent = (zh ? '領取大滿貫 +' : 'CLAIM GRAND SLAM +') + GRAND_SLAM_BONUS + ' ⚙';
    slamBtn.classList.add('is-claimable');
    on(slamBtn, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      claimGrandSlam();
      refreshBountiesPanel(container);
    });
  } else {
    var needSlam = 3 - claimedCount;
    if (needSlam < 1) needSlam = 1;
    slamBtn.textContent = zh
      ? ('🔒 還需領取 ' + needSlam + ' 項契約 (' + claimedCount + '/3)')
      : ('🔒 NEED ' + needSlam + ' MORE CLAIMS (' + claimedCount + '/3)');
    slamBtn.disabled = true;
    slamBtn.classList.add('is-pending');
    slamBtn.title = zh ? '同一自然日內領取全部 3 項賞金後解鎖' : 'Claim all 3 daily bounties the same calendar day';
    slamBtn.setAttribute('aria-label', slamBtn.textContent + ' — ' + slamBtn.title);
  }
  slamCard.appendChild(slamBtn);
  slamSec.appendChild(slamCard);
  container.appendChild(slamSec);
}
