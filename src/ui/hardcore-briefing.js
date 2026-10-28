import { isChinese, onLanguageChange, tHardcoreOpField, tRigName, tWeaponName } from '../core/i18n.js';
import { getHardcoreStore, isHardcoreUnlocked, saveHardcoreStore } from '../core/meta-store.js';
import { HARDCORE_OPERATIONS, getHardcoreOperation } from '../data/hardcore-operations.js';
import { rt } from '../core/runtime.js';
import { on } from '../core/utils.js';

var selectedOpId = 'op_01';
var currentContainer = null;
var onSelectCallback = null;

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function getSelectedHardcoreOperation() {
  var store = getHardcoreStore();
  var id = store.selectedOperation || selectedOpId || 'op_01';
  return getHardcoreOperation(id) || HARDCORE_OPERATIONS[0];
}

export function selectHardcoreOperation(opId) {
  if (!isHardcoreUnlocked(opId)) return;
  selectedOpId = opId;
  var store = getHardcoreStore();
  store.selectedOperation = opId;
  saveHardcoreStore(store);

  var op = getSelectedHardcoreOperation();
  if (rt.state && rt.state.mode === 'hardcore') {
    rt.state.stageConfig = op;
  }
  if (onSelectCallback) onSelectCallback(op);
  if (currentContainer) renderHardcoreBriefing(currentContainer, onSelectCallback);
}

export function cycleHardcoreOperation(delta) {
  var currentIndex = HARDCORE_OPERATIONS.findIndex(function (op) { return op.id === selectedOpId; });
  if (currentIndex === -1) currentIndex = 0;
  var nextIndex = (currentIndex + delta + HARDCORE_OPERATIONS.length) % HARDCORE_OPERATIONS.length;
  var nextOp = HARDCORE_OPERATIONS[nextIndex];
  if (isHardcoreUnlocked(nextOp.id)) {
    selectHardcoreOperation(nextOp.id);
  }
}

export function renderHardcoreBriefing(container, onSelect) {
  if (!container) return;
  currentContainer = container;
  if (onSelect) onSelectCallback = onSelect;

  while (container.firstChild) container.removeChild(container.firstChild);

  var store = getHardcoreStore();
  var zh = isChinese();
  selectedOpId = store.selectedOperation || 'op_01';
  var op = getSelectedHardcoreOperation();

  var card = el('div', 'hardcore-briefing-card');

  // 1. Operation Switcher Nav (Pills)
  var nav = el('div', 'hardcore-op-nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', zh ? '硬核行動' : 'Hardcore Operations');

  for (var i = 0; i < HARDCORE_OPERATIONS.length; i += 1) {
    (function (item) {
      var isUnlocked = isHardcoreUnlocked(item.id);
      var record = (store.operations && store.operations[item.id]) || { cleared: false, bestTime: 0 };
      var isActive = (item.id === op.id);

      var pill = el('button', 'op-pill');
      pill.type = 'button';
      pill.setAttribute('role', 'tab');
      pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
      pill.setAttribute('data-op-id', item.id);

      if (isActive) pill.classList.add('is-active');
      if (record.cleared) pill.classList.add('is-cleared');
      if (!isUnlocked) pill.classList.add('is-locked');

      pill.textContent = item.code + (isUnlocked ? '' : ' 🔒');

      on(pill, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!isUnlocked) return;
        selectHardcoreOperation(item.id);
      });

      nav.appendChild(pill);
    })(HARDCORE_OPERATIONS[i]);
  }
  card.appendChild(nav);

  // 2. Header: Code, Name, Title, and Badge
  var header = el('div', 'hardcore-briefing-header');
  var titleBox = el('div', 'hardcore-title-box');
  var codeSpan = el('span', 'hardcore-code', op.code + ' ' + tHardcoreOpField(op.id, 'name', op.name));
  var titleH3 = el('h3', 'hardcore-name', tHardcoreOpField(op.id, 'title', op.title || ''));
  titleBox.appendChild(codeSpan);
  titleBox.appendChild(titleH3);
  header.appendChild(titleBox);

  var opRecord = (store.operations && store.operations[op.id]) || { cleared: false, bestTime: 0 };
  var badgeTag = el('span', 'hardcore-badge-tag', opRecord.cleared ? (zh ? '已攻克 ' + opRecord.bestTime.toFixed(1) + 's' : 'CLEARED ' + opRecord.bestTime.toFixed(1) + 's') : (zh ? '絕版勳章未取得' : 'BADGE LOCKED'));
  header.appendChild(badgeTag);
  card.appendChild(header);

  // 3. Locked Configuration Row
  var lockedRow = el('div', 'hardcore-locked-row');
  var rigName = zh ? tRigName(op.lockedRig) : op.lockedRig.toUpperCase();
  var weaponName = zh ? tWeaponName(op.lockedWeapon) : op.lockedWeapon.toUpperCase();

  var rigItem = el('span', 'hardcore-locked-item', '🔒 ' + (zh ? '鎖定機體: ' : 'LOCKED RIG: ') + rigName);
  var weaponItem = el('span', 'hardcore-locked-item', '🔒 ' + (zh ? '鎖定主武: ' : 'LOCKED WEAPON: ') + weaponName);
  lockedRow.appendChild(rigItem);
  lockedRow.appendChild(weaponItem);
  card.appendChild(lockedRow);

  // 4. Handicap Warning Badges
  var tagsGrid = el('div', 'handicap-tags-grid');

  var tagHp = el('div', 'handicap-tag');
  tagHp.innerHTML = '<i>⚠</i> ' + (zh ? 'HP 封頂: ' : 'HP CAP: ') + op.maxHpCap + ' HP';
  tagsGrid.appendChild(tagHp);

  var tagDmg = el('div', 'handicap-tag');
  tagDmg.innerHTML = '<i>⚠</i> ' + (zh ? '兩擊必殺 (-50% HP)' : '2-HIT THRESHOLD (-50%)');
  tagsGrid.appendChild(tagDmg);

  var tagStorm = el('div', 'handicap-tag');
  tagStorm.innerHTML = '<i>⚠</i> ' + (zh ? '極速風暴 (' + op.flashStorm + 's)' : 'FLASH STORM (' + op.flashStorm + 's)');
  tagsGrid.appendChild(tagStorm);

  if (op.famine) {
    var tagFamine = el('div', 'handicap-tag');
    tagFamine.innerHTML = '<i>⚠</i> ' + (zh ? '補給飢荒 (-75% 維修)' : 'SCRAP FAMINE (-75%)');
    tagsGrid.appendChild(tagFamine);
  }
  card.appendChild(tagsGrid);

  // 5. Threat Intel
  var intelBlock = el('div', 'hardcore-intel-block');
  var intelLabel = el('strong', '', zh ? '【天敵怪潮情資】' : '[COUNTER THREAT INTEL]');
  var intelText = el('span', '', tHardcoreOpField(op.id, 'briefing', op.briefing) || '');
  intelBlock.appendChild(intelLabel);
  intelBlock.appendChild(intelText);
  card.appendChild(intelBlock);

  // 6. Boss Mutation Intel
  if (op.bossOverride) {
    var bossBlock = el('div', 'hardcore-intel-block');
    var bossLabel = el('strong', '', (zh ? '【首領異變】' : '[BOSS MUTATION]') + ' ' + (op.bossOverride.name || ''));
    var bossText = el('span', '', op.bossOverride.modifier || '');
    bossBlock.appendChild(bossLabel);
    bossBlock.appendChild(bossText);
    card.appendChild(bossBlock);
  }

  // 7. Tactical Hint
  if (tHardcoreOpField(op.id, 'tacticalHint', op.tacticalHint)) {
    var hintBlock = el('div', 'hardcore-intel-block hardcore-hint-block');
    var hintLabel = el('strong', '', zh ? '【破題戰術建議】' : '[TACTICAL ADVISORY]');
    var hintText = el('span', '', tHardcoreOpField(op.id, 'tacticalHint', op.tacticalHint));
    hintBlock.appendChild(hintLabel);
    hintBlock.appendChild(hintText);
    card.appendChild(hintBlock);
  }

  // 8. Honor Badge Preview
  if (tHardcoreOpField(op.id, 'badgeTitle', op.badgeTitle)) {
    var badgeRow = el('div', 'hardcore-locked-item');
    badgeRow.style.borderColor = 'var(--line-strong)';
    badgeRow.style.width = '100%';
    badgeRow.style.justifyContent = 'space-between';
    badgeRow.innerHTML = '<span>' + (zh ? '榮譽徽章: ' : 'HONOR BADGE: ') + '<strong style="color: #ffd700;">' + tHardcoreOpField(op.id, 'badgeTitle', op.badgeTitle) + '</strong></span>' +
      '<small style="color: ' + (opRecord.cleared ? '#7cf0c8' : 'var(--muted)') + ';">' + (opRecord.cleared ? (zh ? '已獲取' : 'UNLOCKED') : (zh ? '待挑戰' : 'LOCKED')) + '</small>';
    card.appendChild(badgeRow);
  }

  container.appendChild(card);
}

onLanguageChange(function () {
  if (currentContainer) renderHardcoreBriefing(currentContainer, onSelectCallback);
});
