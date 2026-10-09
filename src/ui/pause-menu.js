import { AudioFX } from '../audio/audio-fx.js';
import { OVERDRIVE_COOLDOWN, OVERDRIVE_DAMAGE } from '../config.js';
import { rt } from '../core/runtime.js';
import { getVisualQuality, isHapticsEnabled, isHighContrast, isReducedMotion } from '../core/settings.js';
import { FUSION_CHIPS, UPGRADES, toPropName } from '../data/upgrades.js';
import { triggerGameOver } from '../systems/flow.js';

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
    btn.innerHTML = '<span>ABANDON RUN</span><b aria-hidden="true">⚠</b>';
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
      btn.innerHTML = '<span>CONFIRM ABANDON?</span><b aria-hidden="true">⚠</b>';
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
  placePauseIndicator(tabName);
}

function placePauseIndicator(tabName) {
  if (typeof document === 'undefined' || !rt.ui) return;
  var nav = rt.ui.tabBtnSystem && rt.ui.tabBtnSystem.parentElement;
  var indicator = rt.ui.pauseTabIndicator || (nav && nav.querySelector && nav.querySelector('.pause-tab-indicator'));
  if (!nav || !indicator) return;
  if (rt.ui) rt.ui.pauseTabIndicator = indicator;
  if (nav.setAttribute) nav.setAttribute('data-tab', tabName || currentPauseTab);
  var active = null;
  if (tabName === 'build') active = rt.ui.tabBtnBuild;
  else if (tabName === 'controls') active = rt.ui.tabBtnControls;
  else active = rt.ui.tabBtnSystem;
  if (!active || !indicator.style) return;
  indicator.style.width = active.offsetWidth + 'px';
  indicator.style.transform = 'translateX(' + active.offsetLeft + 'px)';
}

export function updateAudioBtn() {
  var btn = (rt.ui && rt.ui.audioBtn) || (typeof document !== 'undefined' && document.getElementById('audioBtn'));
  var muted = AudioFX.isMuted();
  if (btn) {
    btn.textContent = muted ? 'AUDIO [OFF]' : 'AUDIO [ON]';
    btn.setAttribute('aria-label', muted ? 'Turn audio on' : 'Turn audio off');
  }
  var modalMuteBtn = (rt.ui && rt.ui.toggleAudioMute) || (typeof document !== 'undefined' && document.getElementById('toggleAudioMute'));
  if (modalMuteBtn) {
    modalMuteBtn.textContent = muted ? 'MUTE: ON' : 'MUTE: OFF';
    if (muted) modalMuteBtn.classList.add('is-active');
    else modalMuteBtn.classList.remove('is-active');
  }
}

export function updateSettingsUi() {
  if (!rt.ui) return;
  if (rt.ui.settingMasterVolume) {
    rt.ui.settingMasterVolume.value = String(AudioFX.getMasterVolume());
  }
  if (rt.ui.volumeValue) {
    rt.ui.volumeValue.textContent = AudioFX.getMasterVolume() + '%';
  }
  updateAudioBtn();
  if (rt.ui.toggleHaptics) {
    var hOn = isHapticsEnabled();
    rt.ui.toggleHaptics.textContent = hOn ? 'HAPTICS: ENABLED' : 'HAPTICS: DISABLED';
    if (hOn) rt.ui.toggleHaptics.classList.add('is-active');
    else rt.ui.toggleHaptics.classList.remove('is-active');
  }
  if (rt.ui.toggleMotionReduction) {
    var mReduced = isReducedMotion();
    rt.ui.toggleMotionReduction.textContent = mReduced ? 'MOTION: REDUCED' : 'MOTION: STANDARD';
    if (mReduced) rt.ui.toggleMotionReduction.classList.add('is-active');
    else rt.ui.toggleMotionReduction.classList.remove('is-active');
  }
  if (rt.ui.toggleHighContrast) {
    var hc = isHighContrast();
    rt.ui.toggleHighContrast.textContent = hc ? 'CONTRAST: HIGH' : 'CONTRAST: STANDARD';
    if (hc) rt.ui.toggleHighContrast.classList.add('is-active');
    else rt.ui.toggleHighContrast.classList.remove('is-active');
  }
  if (rt.ui.settingVisualQuality) {
    var q = getVisualQuality();
    var qLabel = 'QUALITY: AUTO';
    if (q === 'high') qLabel = 'QUALITY: HIGH';
    else if (q === 'medium') qLabel = 'QUALITY: MEDIUM';
    else if (q === 'low') qLabel = 'QUALITY: LOW';
    rt.ui.settingVisualQuality.textContent = qLabel;
    if (q !== 'auto') rt.ui.settingVisualQuality.classList.add('is-active');
    else rt.ui.settingVisualQuality.classList.remove('is-active');
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.toggle('reduced-motion', isReducedMotion());
  }
  if (rt.ui.root && rt.ui.root.classList) {
    rt.ui.root.classList.toggle('is-high-contrast', isHighContrast());
  }
  placePauseIndicator(currentPauseTab);
}

export function renderBuildInspector() {
  if (!rt.state || !rt.ui) return;
  var p = rt.state.player;
  if (!p) return;

  var mode = (p.weaponMode || 'standard').toLowerCase();

  // 1. Weapon chassis selector buttons highlight & description
  if (rt.ui.chassisSelector) {
    var btns = rt.ui.chassisSelector.querySelectorAll('.chassis-btn');
    for (var bi = 0; bi < btns.length; bi += 1) {
      var btnMode = btns[bi].getAttribute('data-mode');
      var isActive = btnMode === mode;
      btns[bi].classList.toggle('is-active', isActive);
      btns[bi].setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }
  if (rt.ui.chassisDesc) {
    var desc = 'STANDARD PATTERN AUTO-RIFLE // BALANCED RAPID DPS';
    if (mode === 'breacher') {
      desc = 'PULSE BREACHER SHOTGUN // 5-PELLET CONE & POINT-BLANK BREACH';
    } else if (mode === 'vanguard') {
      desc = 'VANGUARD RAIL CHARGER // CHARGED BEAM & PENETRATION BLAST';
    } else if (mode === 'arc-welder') {
      desc = 'INDUCTION ARC WELDER // ULTRA HIGH-FREQUENCY VOLTAIC STREAM';
    }
    rt.ui.chassisDesc.textContent = desc;
  }

  // 2. Core specs telemetry according to weapon chassis
  if (rt.ui.statFireRate) {
    var surge = p.overdrive > 0 ? ' (SURGE)' : '';
    if (mode === 'breacher') {
      rt.ui.statFireRate.textContent = '2.3 RPS (x5)' + surge;
    } else if (mode === 'vanguard') {
      rt.ui.statFireRate.textContent = '1.8 RPS (CHARGE)' + surge;
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
    if (mode === 'breacher') {
      var bDmg = Math.max(1, Math.round(p.damage * 0.42 * odDmgMult));
      rt.ui.statDamage.textContent = bDmg + 'x5 DMG' + odLabel;
    } else if (mode === 'vanguard') {
      var vDmg = Math.round(p.damage * 3.4 * odDmgMult);
      rt.ui.statDamage.textContent = vDmg + ' DMG [RAIL]' + odLabel;
    } else if (mode === 'arc-welder') {
      var aDmg = Math.max(1, Math.round(p.damage * 0.32 * odDmgMult));
      rt.ui.statDamage.textContent = aDmg + ' DMG [BEAM]' + odLabel;
    } else {
      var dmg = p.damage;
      if (od) dmg = Math.round(dmg * OVERDRIVE_DAMAGE);
      rt.ui.statDamage.textContent = dmg + ' DMG' + odLabel;
    }
  }
  if (rt.ui.statCrit) {
    rt.ui.statCrit.textContent = p.highCaliber ? '2.2x [20% FLAT CRIT]' : '1.75x [AMBUSH CRIT]';
  }
  if (rt.ui.statBallistics) {
    if (mode === 'vanguard') {
      rt.ui.statBallistics.textContent = 'PIERCE 99+ / RICO ' + (p.bounces || 0);
    } else {
      rt.ui.statBallistics.textContent = 'PIERCE ' + (p.pierce || 0) + ' / RICO ' + (p.bounces || 0);
    }
  }
  if (rt.ui.statSpeed) {
    rt.ui.statSpeed.textContent = Math.round(p.speed) + ' PX/S';
  }
  if (rt.ui.statMagnet) {
    rt.ui.statMagnet.textContent = Math.round(p.magnetRadius || 165) + ' PX';
  }

  // 3. Dynamic passive traits
  if (rt.ui.buildPassiveTags) {
    var traits = [
      { name: 'SHOCKWAVE DASH', active: Boolean(p.shockwaveDash) },
      { name: 'TESLA COIL', active: Boolean(p.teslaCoil) },
      { name: 'REACTIVE ARMOR', active: Boolean(p.reactiveArmor) },
      { name: 'HIGH CALIBER', active: Boolean(p.highCaliber) }
    ];
    rt.ui.buildPassiveTags.innerHTML = traits.map(function (t) {
      return '<div class="passive-tag ' + (t.active ? 'is-active' : 'is-inactive') + '">' +
        '<span class="tag-status">' + (t.active ? '● ONLINE' : '○ OFFLINE') + '</span>' +
        '<strong class="tag-name">' + t.name + '</strong>' +
        '</div>';
    }).join('');
  }

  // 4. Installed mod chips
  var chips = rt.state.acquiredUpgrades || [];
  if (rt.ui.installedChipsCount) {
    rt.ui.installedChipsCount.textContent = String(chips.length);
  }
  if (rt.ui.installedChipsList) {
    if (chips.length === 0) {
      rt.ui.installedChipsList.innerHTML = '<div class="chips-empty">[ NO MOD CHIPS INSTALLED — SALVAGE REQUIRED ]</div>';
    } else {
      rt.ui.installedChipsList.innerHTML = chips.map(function (c) {
        var cat = (c.category || 'OFFENSE').toUpperCase();
        var catClass = cat === 'DEFENSE' ? 'chip-card--defense' : cat === 'TACTICAL' ? 'chip-card--tactical' : 'chip-card--offense';
        return '<div class="chip-card ' + catClass + '">' +
          '<div class="chip-strip">' +
          '<span class="chip-cat">[' + cat + ']</span>' +
          '<span class="chip-id">' + (c.id || '') + '</span>' +
          '</div>' +
          '<strong class="chip-title">' + (c.title || '') + '</strong>' +
          '<p class="chip-text">' + (c.text || '') + '</p>' +
          '</div>';
      }).join('');
    }
  }

  // 5. Fusion Resonance Matrix
  function hasCard(id) {
    return ((rt.state && rt.state.acquiredUpgrades) || []).some(function (u) {
      return u.id === id || (u.aliases && u.aliases.indexOf(id) !== -1);
    });
  }

  function getUpgradeName(id) {
    for (var k = 0; k < UPGRADES.length; k += 1) {
      if (UPGRADES[k].id === id) return UPGRADES[k].title;
    }
    return id.toUpperCase();
  }

  var activeFusions = 0;
  var matrixHtml = FUSION_CHIPS.map(function (fc) {
    var isUnlocked = Boolean(p[toPropName(fc.id)]);
    if (isUnlocked) activeFusions += 1;
    var hasA = hasCard(fc.required[0]);
    var hasB = hasCard(fc.required[1]);
    var isReady = !isUnlocked && hasA && hasB;
    var nameA = getUpgradeName(fc.required[0]);
    var nameB = getUpgradeName(fc.required[1]);

    var cardClass = 'fusion-matrix-card ' + (isUnlocked ? 'is-unlocked' : (isReady ? 'is-ready' : 'is-locked'));
    var badgeText = isUnlocked ? '● ONLINE' : (isReady ? '★ READY FOR SYNTHESIS' : ('○ LOCKED [需要 ' + nameA + ' + ' + nameB + ']'));
    var protoLabel = isUnlocked ? 'CORE RESONANCE' : (isReady ? 'RESONANCE READY' : 'OFFLINE');

    var reqsHtml = '<div class="fusion-reqs">' +
      '<span class="fusion-req ' + (hasA ? 'is-met' : 'is-missing') + '">' + (hasA ? '✓ ' : '○ ') + nameA + '</span>' +
      '<span class="fusion-req-join">+</span>' +
      '<span class="fusion-req ' + (hasB ? 'is-met' : 'is-missing') + '">' + (hasB ? '✓ ' : '○ ') + nameB + '</span>' +
      '</div>';

    return '<div class="' + cardClass + '">' +
      '<div class="fusion-card-head">' +
      '<span class="fusion-badge">' + badgeText + '</span>' +
      '<span class="fusion-proto">' + protoLabel + '</span>' +
      '</div>' +
      '<strong class="fusion-title">' + (fc.title || '') + '</strong>' +
      reqsHtml +
      '<p class="fusion-desc">' + (fc.text || '') + '</p>' +
      '</div>';
  }).join('');

  if (rt.ui.activeFusionsCount) {
    rt.ui.activeFusionsCount.textContent = String(activeFusions);
  }
  if (rt.ui.fusionMatrixList) {
    rt.ui.fusionMatrixList.innerHTML = matrixHtml;
  }
}

export function getCurrentPauseTab() {
  return currentPauseTab;
}
