import { AudioFX } from '../audio/audio-fx.js';
import { OVERDRIVE_COOLDOWN, OVERDRIVE_DAMAGE } from '../config.js';
import { readTipsEnabled } from '../core/meta-store.js';
import { rt } from '../core/runtime.js';
import { getVisualQuality, isHapticsEnabled, isHighContrast, isReducedMotion } from '../core/settings.js';
import { getHeatModifiers } from '../data/heat.js';
import { FUSION_CHIPS, UPGRADES, findUpgrade, stackCount, toPropName } from '../data/upgrades.js';
import { triggerGameOver } from '../systems/flow.js';
import { breacherPelletCount } from '../systems/weapons.js';
import { isChinese, onLanguageChange, tCategory, tChassisDesc, tContractName, tFusionText, tFusionTitle, tMutatorName, tPassiveName, tRouteName, tUpgradeText, tUpgradeTitle, tWeaponName } from '../core/i18n.js';

var currentPauseTab = 'system';
var abandonConfirmTimer = 0;
var abandonTimerId = null;

export function resetAbandonConfirm() {
  if (abandonTimerId) {
    clearTimeout(abandonTimerId);
    abandonTimerId = null;
  }
  abandonConfirmTimer = 0;
  var btn = (rt.ui && rt.ui.pauseAbandonBtn) || (typeof document !== 'undefined' && document.getElementById('pauseAbandonBtn'));
  if (btn) {
    btn.innerHTML = (isChinese() ? '<span>放棄出擊</span>' : '<span>ABANDON RUN</span>') + '<b aria-hidden="true">⚠</b>';
    btn.classList.remove('is-confirming');
  }
}

export function handleAbandonClick() {
  var now = Date.now();
  if (abandonConfirmTimer > 0 && now < abandonConfirmTimer) {
    resetAbandonConfirm();
    if (rt.ui && rt.ui.pauseModal) rt.ui.pauseModal.hidden = true;
    if (rt.state) rt.state.paused = false;
    triggerGameOver();
  } else {
    if (abandonTimerId) clearTimeout(abandonTimerId);
    abandonConfirmTimer = now + 4000;
    abandonTimerId = setTimeout(resetAbandonConfirm, 4000);
    var btn = (rt.ui && rt.ui.pauseAbandonBtn) || (typeof document !== 'undefined' && document.getElementById('pauseAbandonBtn'));
    if (btn) {
      btn.innerHTML = (isChinese() ? '<span>確認放棄出擊？</span>' : '<span>CONFIRM ABANDON?</span>') + '<b aria-hidden="true">⚠</b>';
      btn.classList.add('is-confirming');
    }
  }
}

export function switchPauseTab(tabName) {
  currentPauseTab = tabName;
  if (!rt.ui) return;
  var tabs = [
    { name: 'system', btn: rt.ui.tabBtnSystem, panel: rt.ui.panelSystem },
    { name: 'build', btn: rt.ui.tabBtnBuild, panel: rt.ui.panelBuild },
    { name: 'controls', btn: rt.ui.tabBtnControls, panel: rt.ui.panelControls }
  ];
  tabs.forEach(function (t) {
    if (!t.btn || !t.panel) return;
    var active = t.name === tabName;
    if (active) {
      t.btn.classList.add('is-active');
      t.btn.setAttribute('aria-selected', 'true');
      t.panel.classList.add('is-active');
      t.panel.hidden = false;
    } else {
      t.btn.classList.remove('is-active');
      t.btn.setAttribute('aria-selected', 'false');
      t.panel.classList.remove('is-active');
      t.panel.hidden = true;
    }
  });
  if (tabName === 'build') renderBuildInspector();
}

export function updateAudioBtn() {
  var btn = (rt.ui && rt.ui.audioBtn) || (typeof document !== 'undefined' && document.getElementById('audioBtn'));
  var muted = AudioFX.isMuted();
  var zh = isChinese();
  if (btn) {
    btn.textContent = muted ? (zh ? '音效 [關閉]' : 'AUDIO [OFF]') : (zh ? '音效 [開啟]' : 'AUDIO [ON]');
    btn.setAttribute('aria-label', muted ? (zh ? '開啟音效' : 'Turn audio on') : (zh ? '關閉音效' : 'Turn audio off'));
  }
  var modalMuteBtn = (rt.ui && rt.ui.toggleAudioMute) || (typeof document !== 'undefined' && document.getElementById('toggleAudioMute'));
  if (modalMuteBtn) {
    modalMuteBtn.textContent = muted ? (zh ? '靜音: 開啟' : 'MUTE: ON') : (zh ? '靜音: 關閉' : 'MUTE: OFF');
    if (muted) modalMuteBtn.classList.add('is-active');
    else modalMuteBtn.classList.remove('is-active');
  }
}

export function updateSettingsUi() {
  if (!rt.ui) return;
  var zh = isChinese();
  if (rt.ui.settingMasterVolume) {
    rt.ui.settingMasterVolume.value = String(AudioFX.getMasterVolume());
  }
  if (rt.ui.volumeValue) {
    rt.ui.volumeValue.textContent = AudioFX.getMasterVolume() + '%';
  }
  updateAudioBtn();
  if (rt.ui.toggleHaptics) {
    var hOn = isHapticsEnabled();
    rt.ui.toggleHaptics.textContent = hOn ? (zh ? '觸覺回饋: 已啟用' : 'HAPTICS: ENABLED') : (zh ? '觸覺回饋: 已停用' : 'HAPTICS: DISABLED');
    if (hOn) rt.ui.toggleHaptics.classList.add('is-active');
    else rt.ui.toggleHaptics.classList.remove('is-active');
  }
  if (rt.ui.toggleMotionReduction) {
    var mReduced = isReducedMotion();
    rt.ui.toggleMotionReduction.textContent = mReduced ? (zh ? '動態效果: 已減少' : 'MOTION: REDUCED') : (zh ? '動態效果: 標準' : 'MOTION: STANDARD');
    if (mReduced) rt.ui.toggleMotionReduction.classList.add('is-active');
    else rt.ui.toggleMotionReduction.classList.remove('is-active');
  }
  if (rt.ui.toggleHighContrast) {
    var hc = isHighContrast();
    rt.ui.toggleHighContrast.textContent = hc ? (zh ? '對比度: 高' : 'CONTRAST: HIGH') : (zh ? '對比度: 標準' : 'CONTRAST: STANDARD');
    if (hc) rt.ui.toggleHighContrast.classList.add('is-active');
    else rt.ui.toggleHighContrast.classList.remove('is-active');
  }
  if (rt.ui.settingVisualQuality) {
    var q = getVisualQuality();
    var qLabel;
    if (zh) {
      qLabel = '畫質: ' + (q === 'high' ? '高' : q === 'medium' ? '中' : q === 'low' ? '低' : '自動');
    } else {
      qLabel = 'QUALITY: ' + (q === 'high' ? 'HIGH' : q === 'medium' ? 'MEDIUM' : q === 'low' ? 'LOW' : 'AUTO');
    }
    rt.ui.settingVisualQuality.textContent = qLabel;
    if (q !== 'auto') rt.ui.settingVisualQuality.classList.add('is-active');
    else rt.ui.settingVisualQuality.classList.remove('is-active');
  }
  var tipsOn = readTipsEnabled();
  if (rt.ui.toggleTips) {
    rt.ui.toggleTips.textContent = tipsOn ? (zh ? '戰場提示: 開啟' : 'TIPS: ON') : (zh ? '戰場提示: 關閉' : 'TIPS: OFF');
    if (tipsOn) rt.ui.toggleTips.classList.add('is-active');
    else rt.ui.toggleTips.classList.remove('is-active');
  }
  if (rt.ui.toggleLanguage) {
    rt.ui.toggleLanguage.textContent = zh ? '語言: 繁中' : 'LANGUAGE: ENG';
    if (zh) rt.ui.toggleLanguage.classList.add('is-active');
    else rt.ui.toggleLanguage.classList.remove('is-active');
  }
  if (rt.ui.resetTips) rt.ui.resetTips.textContent = zh ? '重設提示' : 'RESET TIPS';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.toggle('reduced-motion', isReducedMotion());
  }
  if (rt.ui.root && rt.ui.root.classList) {
    rt.ui.root.classList.toggle('is-high-contrast', isHighContrast());
  }
}

export function renderBuildInspector() {
  if (!rt.state || !rt.ui) return;
  var p = rt.state.player;
  if (!p) return;

  var mode = (p.weaponMode || 'standard').toLowerCase();

  var zh = isChinese();

  // 1. Weapon chassis selector buttons highlight & description
  if (rt.ui.chassisSelector) {
    var btns = rt.ui.chassisSelector.querySelectorAll('.chassis-btn');
    for (var bi = 0; bi < btns.length; bi += 1) {
      var btnMode = btns[bi].getAttribute('data-mode');
      var isActive = btnMode === mode;
      btns[bi].classList.toggle('is-active', isActive);
      btns[bi].disabled = true;
      btns[bi].hidden = !isActive; // dead mid-run switches: show current chassis only
      btns[bi].setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btns[bi].setAttribute('aria-disabled', 'true');
      btns[bi].title = zh ? '出擊中鎖定 — 請在出擊配置選武器' : 'Locked mid-run — pick weapon on the loadout screen';
      btns[bi].textContent = zh ? tWeaponName(btnMode) : (btnMode === 'arc-welder' ? 'ARC-WELDER' : btnMode.toUpperCase());
    }
  }
  if (rt.ui.chassisDesc) {
    if (zh) {
      rt.ui.chassisDesc.textContent = tChassisDesc(mode) + '  ·  專精 M' + (p.mastery || 0);
    } else {
      var desc = 'STANDARD PATTERN AUTO-RIFLE // BALANCED RAPID DPS';
      if (mode === 'breacher') {
        desc = 'PULSE BREACHER SHOTGUN // 5-PELLET CONE & POINT-BLANK BREACH';
      } else if (mode === 'vanguard') {
        desc = 'VANGUARD RAIL CHARGER // CHARGED BEAM & PENETRATION BLAST';
      } else if (mode === 'arc-welder') {
        desc = 'INDUCTION ARC WELDER // ULTRA HIGH-FREQUENCY VOLTAIC STREAM';
      }
      rt.ui.chassisDesc.textContent = desc + '  ·  MASTERY M' + (p.mastery || 0);
    }
  }

  // 2. Core specs telemetry according to weapon chassis
  if (rt.ui.statFireRate) {
    var surge = p.overdrive > 0 ? (zh ? ' (湧浪)' : ' (SURGE)') : '';
    if (mode === 'breacher') {
      var pellets = breacherPelletCount(p);
      rt.ui.statFireRate.textContent = pellets === 5 ? ('3.0 RPS (x5)' + surge) : ('3.0 RPS (x' + pellets + ')' + surge);
    } else if (mode === 'vanguard') {
      rt.ui.statFireRate.textContent = (zh ? '2.4 RPS (充能)' : '2.4 RPS (CHARGE)') + surge;
    } else if (mode === 'arc-welder') {
      rt.ui.statFireRate.textContent = '12.5 RPS' + surge;
    } else {
      var rps = 1 / p.fireRate;
      if (p.overdrive > 0) rps = 1 / (p.fireRate * OVERDRIVE_COOLDOWN);
      rt.ui.statFireRate.textContent = rps.toFixed(1) + ' RPS' + surge;
    }
  }
  if (rt.ui.statDamage) {
    var od = p.overdrive > 0;
    var odDmgMult = od ? OVERDRIVE_DAMAGE : 1;
    var odLabel = od ? ' (+50%)' : '';
    var dmgSuffix = zh ? ' 傷害' : ' DMG';
    if (mode === 'breacher') {
      var pelletCount = breacherPelletCount(p);
      var bDmg = Math.max(1, Math.round(p.damage * 0.58 * odDmgMult));
      rt.ui.statDamage.textContent = bDmg + 'x' + pelletCount + dmgSuffix + odLabel;
    } else if (mode === 'vanguard') {
      var vDmg = Math.round(p.damage * 4.2 * odDmgMult);
      rt.ui.statDamage.textContent = vDmg + (zh ? ' 傷害 [軌道貫穿]' : ' DMG [RAIL]') + odLabel;
    } else if (mode === 'arc-welder') {
      var aDmg = Math.max(1, Math.round(p.damage * 0.44 * odDmgMult));
      rt.ui.statDamage.textContent = aDmg + (zh ? ' 傷害 [電弧光束]' : ' DMG [BEAM]') + odLabel;
    } else {
      var dmg = p.damage;
      if (od) dmg = Math.round(dmg * OVERDRIVE_DAMAGE);
      rt.ui.statDamage.textContent = dmg + dmgSuffix + odLabel;
    }
  }
  if (rt.ui.statCrit) {
    rt.ui.statCrit.textContent = p.highCaliber
      ? (zh ? '2.2x [20% 固定暴擊]' : '2.2x [20% FLAT CRIT]')
      : (zh ? '1.75x [突襲暴擊]' : '1.75x [AMBUSH CRIT]');
  }
  if (rt.ui.statBallistics) {
    if (mode === 'vanguard') {
      rt.ui.statBallistics.textContent = (zh ? '貫穿 99+ / 彈跳 ' : 'PIERCE 99+ / RICO ') + (p.bounces || 0);
    } else {
      rt.ui.statBallistics.textContent = (zh ? '貫穿 ' : 'PIERCE ') + (p.pierce || 0) + (zh ? ' / 彈跳 ' : ' / RICO ') + (p.bounces || 0);
    }
  }
  if (rt.ui.statSpeed) {
    rt.ui.statSpeed.textContent = Math.round(p.speed) + (zh ? ' 像素/秒' : ' PX/S');
  }
  if (rt.ui.statMagnet) {
    rt.ui.statMagnet.textContent = Math.round(p.magnetRadius || 165) + (zh ? ' 像素' : ' PX');
  }

  // 3. Dynamic passive traits
  if (rt.ui.buildPassiveTags) {
    var traits = [
      { name: 'SHOCKWAVE DASH', active: Boolean(p.shockwaveDash) },
      { name: 'TESLA COIL', active: Boolean(p.teslaCoil) },
      { name: 'REACTIVE ARMOR', active: Boolean(p.reactiveArmor) },
      { name: 'HIGH CALIBER', active: Boolean(p.highCaliber) }
    ];
    var anyActive = traits.some(function (t) { return t.active; });
    rt.ui.buildPassiveTags.innerHTML = traits.map(function (t) {
      var status = t.active ? (zh ? '● 已連線' : '● ONLINE') : (zh ? '○ 已離線' : '○ OFFLINE');
      var name = zh ? tPassiveName(t.name) : t.name;
      return '<div class="passive-tag ' + (t.active ? 'is-active' : 'is-inactive') + '" aria-label="' + name + ' — ' + status + '">' +
        '<span class="tag-status">' + status + '</span>' +
        '<strong class="tag-name">' + name + '</strong>' +
        '</div>';
    }).join('') + (anyActive ? '' : ('<p class="passives-empty">' + (zh ? '尚無動態被動上線 — 透過升級卡觸發' : 'No dynamic passives online — unlock via upgrade cards') + '</p>'));
  }

  // 4. Installed mod chips
  var chips = rt.state.acquiredUpgrades || [];
  if (rt.ui.installedChipsCount) {
    rt.ui.installedChipsCount.textContent = String(chips.length);
  }
  if (rt.ui.installedChipsList) {
    if (chips.length === 0) {
      rt.ui.installedChipsList.innerHTML = zh
        ? '<div class="chips-empty" role="status"><strong>尚無改裝晶片</strong><p>戰鬥升級三選一時安裝 · 融合就緒會顯示於下方矩陣</p></div>'
        : '<div class="chips-empty" role="status"><strong>NO MOD CHIPS YET</strong><p>Install during level-up picks · ready fusions appear in the matrix below</p></div>';
    } else {
      var grouped = [];
      var seen = {};
      chips.forEach(function (c) {
        if (!c || !c.id) return;
        if (!seen[c.id]) {
          seen[c.id] = { card: c, count: 0 };
          grouped.push(seen[c.id]);
        }
        seen[c.id].count += 1;
      });
      rt.ui.installedChipsList.innerHTML = grouped.map(function (entry) {
        var c = entry.card;
        var cat = (c.category || 'OFFENSE').toUpperCase();
        var catClass = 'chip-card--offense';
        if (cat === 'DEFENSE') catClass = 'chip-card--defense';
        else if (cat === 'TACTICAL') catClass = 'chip-card--tactical';
        else if (cat === 'MOBILITY') catClass = 'chip-card--mobility';
        else if (cat === 'WEAPON') catClass = 'chip-card--weapon';
        else if (cat === 'FUSION') catClass = 'chip-card--fusion';
        var inactive = !!(c.weapon && c.weapon !== mode);
        var cap = c.maxStacks ? (' ' + entry.count + '/' + c.maxStacks) : (entry.count > 1 ? (' ×' + entry.count) : '');
        var catDisplay = zh ? tCategory(cat) : cat;
        var titleDisplay = zh ? tUpgradeTitle(c) : (c.title || '');
        var textDisplay = zh ? tUpgradeText(c) : (c.text || '');
        var inactText = zh ? '未啟用' : 'INACTIVE';
        return '<div class="chip-card ' + catClass + (inactive ? ' is-inactive' : '') + '">' +
          '<div class="chip-strip">' +
          '<span class="chip-cat">[' + catDisplay + ']</span>' +
          '<span class="chip-id">' + (c.id || '') + cap + '</span>' +
          (inactive ? '<span class="chip-inactive">' + inactText + '</span>' : '') +
          '</div>' +
          '<strong class="chip-title">' + titleDisplay + '</strong>' +
          '<p class="chip-text">' + textDisplay + '</p>' +
          '</div>';
      }).join('');
    }
  }

  // 5. Fusion Resonance Matrix
  function getUpgradeName(id) {
    return (findUpgrade(id) && findUpgrade(id).title) || id.toUpperCase();
  }

  var activeFusions = 0;
  var matrixHtml = FUSION_CHIPS.map(function (fc) {
    var isUnlocked = Boolean(p[toPropName(fc.id)]) || (fc.aliases && fc.aliases.some(function (a) { return Boolean(p[toPropName(a)]); }));
    if (isUnlocked) activeFusions += 1;
    var hasA = stackCount(rt.state, fc.required[0]) > 0;
    var hasB = stackCount(rt.state, fc.required[1]) > 0;
    var isReady = !isUnlocked && hasA && hasB;
    var nameA = zh ? tUpgradeTitle(fc.required[0]) : getUpgradeName(fc.required[0]);
    var nameB = zh ? tUpgradeTitle(fc.required[1]) : getUpgradeName(fc.required[1]);

    var cardClass = 'fusion-matrix-card ' + (isUnlocked ? 'is-unlocked' : (isReady ? 'is-ready' : 'is-locked'));
    var badgeText = isUnlocked
      ? (zh ? '● 已連線' : '● ONLINE')
      : (isReady
        ? (zh ? '★ 融合就緒' : '★ READY FOR SYNTHESIS')
        : (zh ? ('○ 未解鎖 [需要 ' + nameA + ' + ' + nameB + ']') : ('○ LOCKED [REQUIRES ' + nameA + ' + ' + nameB + ']')));
    var protoLabel = isUnlocked
      ? (zh ? '核心共鳴' : 'CORE RESONANCE')
      : (isReady ? (zh ? '共鳴就緒' : 'RESONANCE READY') : (zh ? '離線' : 'OFFLINE'));

    var reqsHtml = '<div class="fusion-reqs">' +
      '<span class="fusion-req ' + (hasA ? 'is-met' : 'is-missing') + '">' + (hasA ? '✓ ' : '○ ') + nameA + '</span>' +
      '<span class="fusion-req-join">+</span>' +
      '<span class="fusion-req ' + (hasB ? 'is-met' : 'is-missing') + '">' + (hasB ? '✓ ' : '○ ') + nameB + '</span>' +
      '</div>';

    var fTitle = tFusionTitle(fc);
    var fText = tFusionText(fc);

    return '<div class="' + cardClass + '">' +
      '<div class="fusion-card-head">' +
      '<span class="fusion-badge">' + badgeText + '</span>' +
      '<span class="fusion-proto">' + protoLabel + '</span>' +
      '</div>' +
      '<strong class="fusion-title">' + fTitle + '</strong>' +
      reqsHtml +
      '<p class="fusion-desc">' + fText + '</p>' +
      '</div>';
  }).join('');

  if (rt.ui.activeFusionsCount) {
    rt.ui.activeFusionsCount.textContent = String(activeFusions);
  }
  if (rt.ui.fusionMatrixList) {
    rt.ui.fusionMatrixList.innerHTML = matrixHtml;
  }

  renderRunSummary(p);
}

function runLabel(value) {
  if (!value) return '—';
  return typeof value === 'string' ? value : (value.title || value.name || (value.id && String(value.id).toUpperCase()) || '—');
}

function renderRunSummary(p) {
  if (typeof document === 'undefined' || !rt.ui || !rt.ui.panelBuild || !rt.ui.panelBuild.appendChild) return;
  var node = document.getElementById('buildRunSummary');
  if (!node) {
    node = document.createElement('section');
    node.id = 'buildRunSummary';
    node.className = 'build-run-summary';
    rt.ui.panelBuild.appendChild(node);
  }
  var zh = isChinese();
  var heat = getHeatModifiers(rt.state.heat || 0);
  var contract = rt.state.contract;
  var noneLabel = zh ? '無' : 'NONE';
  var contractText = noneLabel;
  if (contract) {
    contractText = zh ? (tContractName(contract.id) || runLabel(contract)) : runLabel(contract);
    if (typeof contract.progress === 'number' && typeof contract.goal === 'number') {
      contractText += ' ' + contract.progress + '/' + contract.goal;
    }
  }
  var routeVal = rt.state.route ? (zh ? tRouteName(rt.state.route.id) : runLabel(rt.state.route)) : noneLabel;
  var mutatorVal = rt.state.mutator ? (zh ? tMutatorName(rt.state.mutator.id) : runLabel(rt.state.mutator)) : noneLabel;
  var weaponVal = (zh ? tWeaponName(p.weaponMode || 'standard') : (p.weaponMode || 'standard').toUpperCase()) + ' · M' + (p.mastery || 0);
  var rows = [
    [zh ? '幕次' : 'ACT', String(rt.state.act || 1) + ' · ' + String(rt.state.sector || 'dusk').toUpperCase()],
    [zh ? '熱度' : 'HEAT', 'H' + heat.heat + ' · ' + (zh ? '分數 ' : 'SCORE ') + '×' + heat.scoreMultiplier.toFixed(2)],
    [zh ? '路線' : 'ROUTE', routeVal],
    [zh ? '變異' : 'MUTATOR', mutatorVal],
    [zh ? '合約' : 'CONTRACT', contractText],
    [zh ? '機底' : 'WEAPON', weaponVal]
  ];
  var emptyRun = !rt.state.route && !rt.state.mutator && !rt.state.contract;
  var emptyNote = emptyRun
    ? ('<p class="run-summary-empty">' + (zh ? '出擊進行中資料會顯示於此 · 路線／變異／合約尚無' : 'Live run data fills in here · route / mutator / contract pending') + '</p>')
    : '';
  node.innerHTML = '<div class="build-col-title">' + (zh ? '局次總覽' : 'RUN OVERVIEW') + '</div>' + rows.map(function (row) {
    var isNone = row[1] === noneLabel;
    return '<div class="run-summary-row' + (isNone ? ' is-empty' : '') + '"><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>';
  }).join('') + emptyNote;
}

export function getCurrentPauseTab() {
  return currentPauseTab;
}

onLanguageChange(function () {
  updateSettingsUi();
  if (currentPauseTab === 'build') renderBuildInspector();
});
