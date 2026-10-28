import { isChinese } from '../core/i18n.js';
import { VAULT_MILESTONES, getCampaignStore, getCosmetics, setCosmetic } from '../core/meta-store.js';
import { on } from '../core/utils.js';

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createVaultPanel() {
  var container = el('div', 'vault-panel-container');
  container.id = 'tabPanelVault';
  container.hidden = true;
  return container;
}

export function refreshVaultPanel(container) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  var zh = isChinese();
  var campaign = getCampaignStore();
  var totalStars = (campaign.stats && campaign.stats.totalStars) || 0;

  var cosmetics = getCosmetics();
  var unlockedSkins = cosmetics.unlockedSkins || ['default'];
  var unlockedTrails = cosmetics.unlockedTrails || ['default'];
  var selectedSkin = cosmetics.selectedSkin || 'default';
  var selectedTrail = cosmetics.selectedTrail || 'default';

  // 1. Vault Header & Progress
  var header = el('div', 'vault-header');
  var titleRow = el('div', 'vault-title-row');
  titleRow.appendChild(el('h3', 'vault-title', zh ? '戰役星級寶庫' : 'CAMPAIGN STAR VAULT'));
  var starBadge = el('div', 'vault-star-badge', (zh ? '戰役星數: ' : 'TOTAL STARS: ') + totalStars + ' / 45 ★');
  titleRow.appendChild(starBadge);
  header.appendChild(titleRow);

  var pct = Math.min(100, Math.round((totalStars / 45) * 100));
  var barTrack = el('div', 'vault-progress-track');
  var barFill = el('div', 'vault-progress-fill');
  barFill.style.width = pct + '%';
  barTrack.appendChild(barFill);
  header.appendChild(barTrack);
  container.appendChild(header);

  // 2. Vault Milestones (15★ / 30★ / 45★)
  var milestonesSec = el('div', 'vault-milestones-section');
  milestonesSec.appendChild(el('h4', 'vault-section-title', zh ? '星級解鎖階梯' : 'STAR MILESTONE REWARDS'));

  var milestonesGrid = el('div', 'vault-milestones-grid');
  var mKeys = [15, 30, 45];
  mKeys.forEach(function (starReq) {
    var ms = VAULT_MILESTONES[starReq];
    if (!ms) return;
    var isUnlocked = totalStars >= starReq;
    var card = el('div', 'milestone-card' + (isUnlocked ? ' is-unlocked' : ' is-locked'));

    var top = el('div', 'milestone-top');
    top.appendChild(el('span', 'milestone-star-req', starReq + ' ★'));
    top.appendChild(el('span', 'milestone-status-tag', isUnlocked ? (zh ? '已解鎖' : 'UNLOCKED') : (zh ? '未達成' : 'LOCKED')));
    card.appendChild(top);

    card.appendChild(el('strong', 'milestone-name', zh ? ms.nameZh : ms.nameEn));
    var descText = '';
    if (starReq === 15) descText = zh ? '高對比琥珀霓虹脈衝輪廓，夜戰識別型' : 'High-contrast amber neon pulse chassis contour';
    else if (starReq === 30) descText = zh ? '雙聯高能等離子推進尾焰軌跡' : 'Dual high-energy cyan thruster beam trail';
    else if (starReq === 45) descText = zh ? '全消光黑合金裝甲佐以熔融金流刻線' : 'Matte black alloy with molten gold racing lines';
    card.appendChild(el('p', 'milestone-desc', descText));
    if (!isUnlocked) {
      var need = starReq - totalStars;
      if (need < 1) need = 1;
      card.appendChild(el('p', 'milestone-lock-reason', zh
        ? ('還需 ' + need + ' 顆戰役星解鎖')
        : ('Need ' + need + ' more campaign stars')));
    }
    card.setAttribute('aria-label', (zh ? ms.nameZh : ms.nameEn) + ' — ' + (isUnlocked ? (zh ? '已解鎖' : 'UNLOCKED') : (zh ? '未達成' : 'LOCKED')));

    milestonesGrid.appendChild(card);
  });
  milestonesSec.appendChild(milestonesGrid);
  container.appendChild(milestonesSec);

  // 3. Skins & Paintwork Picker
  var skinsSec = el('div', 'vault-cosmetics-section');
  skinsSec.appendChild(el('h4', 'vault-section-title', zh ? '機體外觀塗裝' : 'CHASSIS PAINTWORK'));

  var skins = [
    { id: 'default', name: zh ? '標準出廠塗裝' : 'Factory Standard', desc: zh ? '常規消光軍綠塗裝' : 'Standard military green coating' },
    { id: 'paint_neon_dusk', name: zh ? '霓虹薄暮' : 'Neon Dusk', desc: zh ? '15★ 寶庫解鎖 · 琥珀霓虹脈衝輪廓' : '15★ Star Vault · Amber neon pulse contour' },
    { id: 'paint_storm_surge', name: zh ? '風暴湧浪' : 'Storm Surge', desc: zh ? '極限作戰全通獎勵 · 電弧紫藍火花' : 'Hardcore Clear · Arc storm sparks' },
    { id: 'paint_apex_gold', name: zh ? '巔峰金輝' : 'Apex Gold', desc: zh ? '45★ 寶庫大師 · 熔融金流黑曜裝甲' : '45★ Star Vault · Molten gold & matte black' }
  ];

  var skinsGrid = el('div', 'cosmetics-picker-grid');
  skins.forEach(function (skin) {
    var unlockedSkin = (unlockedSkins.indexOf(skin.id) !== -1);
    var isEquipped = (selectedSkin === skin.id);
    var card = el('div', 'cosmetic-card' + (isEquipped ? ' is-equipped' : '') + (!unlockedSkin ? ' is-locked' : ''));

    card.appendChild(el('strong', 'cosmetic-name', skin.name));
    card.appendChild(el('p', 'cosmetic-desc', skin.desc));

    var btn = el('button', 'cosmetic-select-btn');
    btn.type = 'button';
    if (!unlockedSkin) {
      btn.textContent = zh ? '🔒 尚未解鎖' : '🔒 LOCKED';
      btn.disabled = true;
      btn.title = skin.desc;
      btn.setAttribute('aria-label', (zh ? '尚未解鎖' : 'LOCKED') + ' — ' + skin.name + ' — ' + skin.desc);
    } else if (isEquipped) {
      btn.textContent = zh ? '✓ 已裝備' : '✓ EQUIPPED';
      btn.disabled = true;
      btn.classList.add('is-current');
    } else {
      btn.textContent = zh ? '裝備塗裝' : 'EQUIP SKIN';
      on(btn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setCosmetic('selectedSkin', skin.id);
        refreshVaultPanel(container);
      });
    }
    card.appendChild(btn);
    skinsGrid.appendChild(card);
  });
  skinsSec.appendChild(skinsGrid);
  container.appendChild(skinsSec);

  // 4. Thruster Trails Picker
  var trailsSec = el('div', 'vault-cosmetics-section');
  trailsSec.appendChild(el('h4', 'vault-section-title', zh ? '推進尾焰軌跡' : 'THRUSTER TRAILS'));

  var trails = [
    { id: 'default', name: zh ? '標準推進煙霧' : 'Standard Exhaust', desc: zh ? '標準微型引擎排氣羽流' : 'Standard thruster vapor exhaust' },
    { id: 'trail_amber_jet', name: zh ? '琥珀噴流' : 'Amber Jet Flame', desc: zh ? '高溫燃燒琥珀火焰羽流' : 'High-temp combustion amber plume' },
    { id: 'trail_plasma_dual', name: zh ? '雙聯等離子' : 'Dual Plasma Beams', desc: zh ? '30★ 寶庫解鎖 · 雙聯高能亮青光束' : '30★ Star Vault · Twin cyan energy beams' },
    { id: 'trail_singularity', name: zh ? '奇點微渦' : 'Singularity Wake', desc: zh ? '空間重力微透鏡紫環漣漪' : 'Gravitational distortion ring wake' }
  ];

  var trailsGrid = el('div', 'cosmetics-picker-grid');
  trails.forEach(function (tr) {
    var unlockedTrail = (unlockedTrails.indexOf(tr.id) !== -1);
    var isEquipped = (selectedTrail === tr.id);
    var card = el('div', 'cosmetic-card' + (isEquipped ? ' is-equipped' : '') + (!unlockedTrail ? ' is-locked' : ''));

    card.appendChild(el('strong', 'cosmetic-name', tr.name));
    card.appendChild(el('p', 'cosmetic-desc', tr.desc));

    var btn = el('button', 'cosmetic-select-btn');
    btn.type = 'button';
    if (!unlockedTrail) {
      btn.textContent = zh ? '🔒 尚未解鎖' : '🔒 LOCKED';
      btn.disabled = true;
      btn.title = tr.desc;
      btn.setAttribute('aria-label', (zh ? '尚未解鎖' : 'LOCKED') + ' — ' + tr.name + ' — ' + tr.desc);
    } else if (isEquipped) {
      btn.textContent = zh ? '✓ 已裝備' : '✓ EQUIPPED';
      btn.disabled = true;
      btn.classList.add('is-current');
    } else {
      btn.textContent = zh ? '裝備軌跡' : 'EQUIP TRAIL';
      on(btn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setCosmetic('selectedTrail', tr.id);
        refreshVaultPanel(container);
      });
    }
    card.appendChild(btn);
    trailsGrid.appendChild(card);
  });
  trailsSec.appendChild(trailsGrid);
  container.appendChild(trailsSec);
}
