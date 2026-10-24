export var AudioFX = (function () {
  if (typeof AudioParam !== 'undefined' && AudioParam.prototype &&
      typeof AudioParam.prototype.exponentialRampToValueAtTime !== 'function') {
    AudioParam.prototype.exponentialRampToValueAtTime = function (value, endTime) {
      var v = value > 0 ? value : 0.0001;
      if (typeof this.linearRampToValueAtTime === 'function') this.linearRampToValueAtTime(v, endTime);
      else if (typeof this.setValueAtTime === 'function') this.setValueAtTime(v, endTime);
      return this;
    };
  }

  var ctx = null;
  var masterGain = null;
  var lowpassFilter = null;
  var currentLowpassFreq = 20000;
  var noiseBuffer = null;
  var muted = false;
  var masterVolume = 80;
  var isSupported = false;

  var AUDIO_KEY = 'dust-reign:audio:v1';
  var LEGACY_AUDIO_MUTED_KEY = 'dust_reign_audio_muted';
  var LEGACY_AUDIO_VOLUME_KEY = 'dust_reign_master_volume';

  function getStore() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
      if (typeof localStorage !== 'undefined') return localStorage;
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    } catch (e) {}
    return null;
  }

  function saveAudioSettings() {
    try {
      var store = getStore();
      if (store) {
        store.setItem(AUDIO_KEY, JSON.stringify({ muted: muted, masterVolume: masterVolume }));
        store.setItem(LEGACY_AUDIO_MUTED_KEY, muted ? 'true' : 'false');
        store.setItem(LEGACY_AUDIO_VOLUME_KEY, String(masterVolume));
      }
    } catch (e) {}
  }

  function loadAudioSettings() {
    try {
      var store = getStore();
      if (store) {
        var raw = store.getItem(AUDIO_KEY);
        if (raw) {
          try {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              if (typeof parsed.muted === 'boolean') muted = parsed.muted;
              if (typeof parsed.masterVolume === 'number' && !isNaN(parsed.masterVolume)) {
                masterVolume = Math.max(0, Math.min(100, Math.round(parsed.masterVolume)));
              }
              return;
            }
          } catch (pe) {}
        }
        var legacyMuted = store.getItem(LEGACY_AUDIO_MUTED_KEY);
        var legacyVol = store.getItem(LEGACY_AUDIO_VOLUME_KEY);
        var hasLegacy = (legacyMuted !== null || legacyVol !== null);
        if (legacyMuted !== null) {
          muted = legacyMuted === 'true';
        }
        if (legacyVol !== null && !isNaN(Number(legacyVol))) {
          masterVolume = Math.max(0, Math.min(100, Math.round(Number(legacyVol))));
        }
        if (hasLegacy) {
          store.setItem(AUDIO_KEY, JSON.stringify({ muted: muted, masterVolume: masterVolume }));
        }
      }
    } catch (e) {
      muted = false;
      masterVolume = 80;
    }
  }

  loadAudioSettings();

  function initContext() {
    if (ctx) return;
    if (typeof window === 'undefined') return;
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      ctx = new AudioCtx();
      isSupported = true;

      lowpassFilter = ctx.createBiquadFilter();
      lowpassFilter.type = 'lowpass';
      lowpassFilter.frequency.setValueAtTime(20000, ctx.currentTime);

      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(muted ? 0 : 0.35 * (masterVolume / 100), ctx.currentTime);

      lowpassFilter.connect(masterGain);
      masterGain.connect(ctx.destination);

      var bufferSize = Math.max(22050, Math.floor(ctx.sampleRate));
      noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (err) {
      ctx = null;
      isSupported = false;
    }
  }

  function unlock() {
    initContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
  }

  function isMuted() {
    return muted;
  }

  function getMasterVolume() {
    return masterVolume;
  }

  function setMasterVolume(val) {
    var num = Number(val);
    if (isNaN(num)) num = 80;
    masterVolume = Math.max(0, Math.min(100, Math.round(num)));
    saveAudioSettings();
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 0.35 * (masterVolume / 100), ctx.currentTime);
    }
    return masterVolume;
  }

  function setMuted(val) {
    muted = Boolean(val);
    saveAudioSettings();
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 0.35 * (masterVolume / 100), ctx.currentTime);
    }
    return muted;
  }

  function toggleMute() {
    unlock();
    return setMuted(!muted);
  }

  function setLowpass(freq) {
    if (!lowpassFilter || !ctx) return;
    var target = freq > 0 ? freq : 20000;
    if (currentLowpassFreq === target) return;
    currentLowpassFreq = target;
    try {
      lowpassFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.08);
    } catch (e) {}
  }

  function route(node) {
    if (lowpassFilter) node.connect(lowpassFilter);
    else if (masterGain) node.connect(masterGain);
    else if (ctx) node.connect(ctx.destination);
  }

  function cleanupVoice(sourceNode, childNodes, stopTime) {
    var cleaned = false;
    function doClean() {
      if (cleaned) return;
      cleaned = true;
      if (sourceNode) {
        sourceNode.onended = null;
        try { sourceNode.disconnect(); } catch (e) {}
      }
      if (childNodes) {
        for (var i = 0; i < childNodes.length; i += 1) {
          var node = childNodes[i];
          if (node) {
            try {
              if (node.onended) node.onended = null;
              node.disconnect();
            } catch (e) {}
          }
        }
      }
    }

    if (sourceNode) {
      sourceNode.onended = doClean;
    }
    var delayMs = 60;
    if (ctx && typeof stopTime === 'number' && stopTime > ctx.currentTime) {
      delayMs = Math.max(20, Math.ceil((stopTime - ctx.currentTime) * 1000) + 40);
    }
    setTimeout(doClean, delayMs);
  }

  var lastHitTime = 0;
  var lastGrazeTime = 0;
  var lastRicochetTime = 0;
  var THROTTLE_HIT = 0.04;
  var THROTTLE_GRAZE = 0.05;
  var THROTTLE_RICOCHET = 0.04;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (!ctx || ctx.state === 'closed') return;
      if (document.hidden) {
        if (ctx.state === 'running') {
          ctx.suspend().catch(function () {});
        }
      } else {
        if (!muted && ctx.state === 'suspended') {
          ctx.resume().catch(function () {});
        }
      }
    });
  }

  function canPlay() {
    if (!ctx) initContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return Boolean(ctx && !muted && ctx.state !== 'closed');
  }

  var vanguardChargeOsc = null;
  var vanguardChargeGain = null;

  function shootBreacher() {
    if (!canPlay()) return;
    var t = ctx.currentTime;

    // Layer 1: Transient needle/click punch (540Hz rapidly dropping to 75Hz in 0.02s)
    var oscPunch = ctx.createOscillator();
    var gainPunch = ctx.createGain();
    oscPunch.type = 'triangle';
    oscPunch.frequency.setValueAtTime(540, t);
    oscPunch.frequency.exponentialRampToValueAtTime(75, t + 0.02);
    gainPunch.gain.setValueAtTime(0.48, t);
    gainPunch.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    oscPunch.connect(gainPunch);
    route(gainPunch);
    oscPunch.start(t);
    oscPunch.stop(t + 0.025);
    cleanupVoice(oscPunch, [gainPunch], t + 0.025);

    // Layer 2: 36Hz Sub-bass punch (110Hz sliding to 36Hz over 0.22s)
    var oscSub = ctx.createOscillator();
    var gainSub = ctx.createGain();
    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(110, t);
    oscSub.frequency.exponentialRampToValueAtTime(36, t + 0.22);
    gainSub.gain.setValueAtTime(0.55, t);
    gainSub.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    oscSub.connect(gainSub);
    route(gainSub);
    oscSub.start(t);
    oscSub.stop(t + 0.22);
    cleanupVoice(oscSub, [gainSub], t + 0.22);

    // Layer 3: Dual-peak bandpass shell eject metallic clink (1850Hz & 4100Hz, Q=9.0)
    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;

      var bp1 = ctx.createBiquadFilter();
      bp1.type = 'bandpass';
      bp1.frequency.setValueAtTime(1850, t);
      bp1.Q.setValueAtTime(9.0, t);

      var bp2 = ctx.createBiquadFilter();
      bp2.type = 'bandpass';
      bp2.frequency.setValueAtTime(4100, t);
      bp2.Q.setValueAtTime(9.0, t);

      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.38, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

      nSrc.connect(bp1);
      nSrc.connect(bp2);
      bp1.connect(nGain);
      bp2.connect(nGain);
      route(nGain);

      nSrc.start(t);
      nSrc.stop(t + 0.11);
      cleanupVoice(nSrc, [bp1, bp2, nGain], t + 0.11);
    }
  }

  function vanguardChargeStart(duration) {
    if (!canPlay()) return;
    vanguardChargeStop();
    var t = ctx.currentTime;
    var d = duration > 0 ? duration : 0.6;
    vanguardChargeOsc = ctx.createOscillator();
    vanguardChargeGain = ctx.createGain();
    vanguardChargeOsc.type = 'sawtooth';
    vanguardChargeOsc.frequency.setValueAtTime(120, t);
    vanguardChargeOsc.frequency.linearRampToValueAtTime(1180, t + d);
    vanguardChargeGain.gain.setValueAtTime(0.001, t);
    vanguardChargeGain.gain.linearRampToValueAtTime(0.22, t + 0.05);
    vanguardChargeGain.gain.linearRampToValueAtTime(0.32, t + d);
    vanguardChargeOsc.connect(vanguardChargeGain);
    route(vanguardChargeGain);
    vanguardChargeOsc.start(t);
  }

  function vanguardChargeStop() {
    if (vanguardChargeOsc && ctx) {
      try {
        var t = ctx.currentTime;
        vanguardChargeGain.gain.setValueAtTime(vanguardChargeGain.gain.value, t);
        vanguardChargeGain.gain.linearRampToValueAtTime(0.001, t + 0.03);
        vanguardChargeOsc.stop(t + 0.03);
        cleanupVoice(vanguardChargeOsc, [vanguardChargeGain], t + 0.03);
      } catch (e) {}
      vanguardChargeOsc = null;
      vanguardChargeGain = null;
    }
  }

  function shootVanguard() {
    if (!canPlay()) return;
    vanguardChargeStop();
    var t = ctx.currentTime;

    // Laser discharge: Bandpass sweep 6500Hz -> 400Hz + Sub-bass 38Hz
    var oscSub = ctx.createOscillator();
    var gainSub = ctx.createGain();
    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(95, t);
    oscSub.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    gainSub.gain.setValueAtTime(0.50, t);
    gainSub.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    oscSub.connect(gainSub);
    route(gainSub);
    oscSub.start(t);
    oscSub.stop(t + 0.35);
    cleanupVoice(oscSub, [gainSub], t + 0.35);

    var oscLaser = ctx.createOscillator();
    var filterLaser = ctx.createBiquadFilter();
    var gainLaser = ctx.createGain();
    oscLaser.type = 'sawtooth';
    oscLaser.frequency.setValueAtTime(1400, t);
    oscLaser.frequency.exponentialRampToValueAtTime(220, t + 0.28);
    filterLaser.type = 'bandpass';
    filterLaser.frequency.setValueAtTime(6500, t);
    filterLaser.frequency.exponentialRampToValueAtTime(400, t + 0.28);
    filterLaser.Q.setValueAtTime(4.0, t);
    gainLaser.gain.setValueAtTime(0.40, t);
    gainLaser.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    oscLaser.connect(filterLaser);
    filterLaser.connect(gainLaser);
    route(gainLaser);
    oscLaser.start(t);
    oscLaser.stop(t + 0.28);
    cleanupVoice(oscLaser, [filterLaser, gainLaser], t + 0.28);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(4500, t);
      nFilter.frequency.exponentialRampToValueAtTime(600, t + 0.22);
      nFilter.Q.setValueAtTime(3.5, t);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.30, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.22);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.22);
    }
  }

  function ricochet(detune) {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    if (t - lastRicochetTime < THROTTLE_RICOCHET) return;
    lastRicochetTime = t;

    var carrier = ctx.createOscillator();
    var modulator = ctx.createOscillator();
    var modGain = ctx.createGain();
    var outGain = ctx.createGain();

    var cents = (typeof detune === 'number') ? detune : (Math.random() - 0.5) * 120;
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(2380, t);
    carrier.detune.setValueAtTime(cents, t);

    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(3570, t); // 1:1.5 non-harmonic FM ratio!
    modulator.detune.setValueAtTime(cents, t);

    modGain.gain.setValueAtTime(2380 * 1.5, t);
    modGain.gain.exponentialRampToValueAtTime(0.01, t + 0.035);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    outGain.gain.setValueAtTime(0.34, t);
    outGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    carrier.connect(outGain);
    route(outGain);

    carrier.start(t);
    modulator.start(t);
    carrier.stop(t + 0.035);
    modulator.stop(t + 0.035);
    cleanupVoice(carrier, [modulator, modGain, outGain], t + 0.035);
  }

  function shieldShatter() {
    if (!canPlay()) return;
    var t = ctx.currentTime;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.08);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.08);
    cleanupVoice(osc, [gain], t + 0.08);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'highpass';
      nFilter.frequency.setValueAtTime(2400, t);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.30, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.08);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.08);
    }
  }

  function shoot(mode) {
    if (mode === 'breacher') {
      shootBreacher();
      return;
    }
    if (mode === 'vanguard') {
      shootVanguard();
      return;
    }
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.05);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.05);
    cleanupVoice(osc, [gain], t + 0.05);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'highpass';
      nFilter.frequency.setValueAtTime(1000, t);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.04);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.04);
    }
  }

  function hit() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    if (t - lastHitTime < THROTTLE_HIT) return;
    lastHitTime = t;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.025);
    gain.gain.setValueAtTime(0.26, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.025);
    cleanupVoice(osc, [gain], t + 0.025);
  }

  function kill(combo) {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var scale = [0, 3, 5, 7, 10, 12, 15, 17];
    var step = Math.min(Math.max(0, (combo || 1) - 1), 7);
    var freq = 220 * Math.pow(2, scale[step] / 12);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.04, t + 0.06);
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.12);
    cleanupVoice(osc, [gain], t + 0.12);
  }

  function dash() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    gain.gain.setValueAtTime(0.38, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.18);
    cleanupVoice(osc, [gain], t + 0.18);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'lowpass';
      nFilter.frequency.setValueAtTime(360, t);
      nFilter.frequency.exponentialRampToValueAtTime(80, t + 0.18);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.18);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.18);
    }
  }

  function hurt() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.20);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, t);
    gain.gain.setValueAtTime(0.40, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    osc.connect(filter);
    filter.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.20);
    cleanupVoice(osc, [filter, gain], t + 0.20);
  }

  function pickup(kind) {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    if (kind === 'repair') {
      var notes = [330, 495, 660];
      notes.forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.055);
        gain.gain.setValueAtTime(0.001, t + i * 0.055);
        gain.gain.linearRampToValueAtTime(0.24, t + i * 0.055 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.055 + 0.08);
        osc.connect(gain);
        route(gain);
        osc.start(t + i * 0.055);
        osc.stop(t + i * 0.055 + 0.08);
        cleanupVoice(osc, [gain], t + i * 0.055 + 0.08);
      });
    } else if (kind === 'overdrive') {
      var chord = [220, 277, 330];
      chord.forEach(function (freq) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
        osc.connect(gain);
        route(gain);
        osc.start(t);
        osc.stop(t + 0.30);
        cleanupVoice(osc, [gain], t + 0.30);
      });
    } else {
      var bell = [1046, 1318];
      bell.forEach(function (freq) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.20, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        route(gain);
        osc.start(t);
        osc.stop(t + 0.05);
        cleanupVoice(osc, [gain], t + 0.05);
      });
    }
  }

  function levelUp() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var notes = [523, 659, 784, 1046];
    notes.forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.07);
      gain.gain.setValueAtTime(0.001, t + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.28, t + i * 0.07 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.12);
      osc.connect(gain);
      route(gain);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.12);
      cleanupVoice(osc, [gain], t + i * 0.07 + 0.12);
    });
  }

  function stormSiren() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    for (var pulse = 0; pulse < 2; pulse += 1) {
      var startT = t + pulse * 0.38;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, startT);
      osc.frequency.linearRampToValueAtTime(155, startT + 0.16);
      osc.frequency.linearRampToValueAtTime(110, startT + 0.32);
      gain.gain.setValueAtTime(0.001, startT);
      gain.gain.linearRampToValueAtTime(0.22, startT + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.34);
      osc.connect(gain);
      route(gain);
      osc.start(startT);
      osc.stop(startT + 0.34);
      cleanupVoice(osc, [gain], startT + 0.34);
    }
  }

  function playHeartbeat() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc1 = ctx.createOscillator();
    var gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(45, t);
    osc1.frequency.exponentialRampToValueAtTime(28, t + 0.09);
    gain1.gain.setValueAtTime(0.42, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc1.connect(gain1);
    route(gain1);
    osc1.start(t);
    osc1.stop(t + 0.09);
    cleanupVoice(osc1, [gain1], t + 0.09);

    var osc2 = ctx.createOscillator();
    var gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(38, t + 0.14);
    osc2.frequency.exponentialRampToValueAtTime(24, t + 0.14 + 0.08);
    gain2.gain.setValueAtTime(0.32, t + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.14 + 0.08);
    osc2.connect(gain2);
    route(gain2);
    osc2.start(t + 0.14);
    osc2.stop(t + 0.14 + 0.08);
    cleanupVoice(osc2, [gain2], t + 0.14 + 0.08);
  }

  function critHit() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(1100, t + 0.04);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.06);
    cleanupVoice(osc, [gain], t + 0.06);
  }

  function blast() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.32);
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.35);
    cleanupVoice(osc, [gain], t + 0.35);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'lowpass';
      nFilter.frequency.setValueAtTime(450, t);
      nFilter.frequency.exponentialRampToValueAtTime(80, t + 0.35);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.40, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.35);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.35);
    }
  }

  function mortarLaunch() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.16);
    cleanupVoice(osc, [gain], t + 0.16);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'lowpass';
      nFilter.frequency.setValueAtTime(340, t);
      nFilter.frequency.exponentialRampToValueAtTime(90, t + 0.18);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.24, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.18);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.18);
    }
  }

  function mortarImpact() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(26, t + 0.36);
    gain.gain.setValueAtTime(0.44, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.38);
    cleanupVoice(osc, [gain], t + 0.38);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'lowpass';
      nFilter.frequency.setValueAtTime(520, t);
      nFilter.frequency.exponentialRampToValueAtTime(55, t + 0.38);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.40, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.38);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.38);
    }
  }

  function graze() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    if (t - lastGrazeTime < THROTTLE_GRAZE) return;
    lastGrazeTime = t;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(3300, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(1700, t + 0.055);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.055);
    cleanupVoice(osc, [gain], t + 0.055);
  }

  function emp() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var oscHigh = ctx.createOscillator();
    var gainHigh = ctx.createGain();
    oscHigh.type = 'sawtooth';
    oscHigh.frequency.setValueAtTime(2800, t);
    oscHigh.frequency.exponentialRampToValueAtTime(180, t + 0.28);
    gainHigh.gain.setValueAtTime(0.38, t);
    gainHigh.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    oscHigh.connect(gainHigh);
    route(gainHigh);
    oscHigh.start(t);
    oscHigh.stop(t + 0.28);
    cleanupVoice(oscHigh, [gainHigh], t + 0.28);

    var oscBoom = ctx.createOscillator();
    var gainBoom = ctx.createGain();
    oscBoom.type = 'sine';
    oscBoom.frequency.setValueAtTime(140, t);
    oscBoom.frequency.exponentialRampToValueAtTime(30, t + 0.42);
    gainBoom.gain.setValueAtTime(0.48, t);
    gainBoom.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    oscBoom.connect(gainBoom);
    route(gainBoom);
    oscBoom.start(t);
    oscBoom.stop(t + 0.45);
    cleanupVoice(oscBoom, [gainBoom], t + 0.45);

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(1800, t);
      nFilter.frequency.exponentialRampToValueAtTime(200, t + 0.35);
      nFilter.Q.setValueAtTime(3.0, t);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.35, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.35);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.35);
    }
  }

  function click() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.04);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.04);
    cleanupVoice(osc, [gain], t + 0.04);
  }

  function resonanceAscend(archetype, tier) {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var tIndex = Math.min(3, Math.max(1, tier || 1));
    var freqs = tIndex === 1 ? [440, 554] : (tIndex === 2 ? [554, 659, 880] : [659, 880, 1108, 1320]);
    var noteDur = tIndex === 3 ? 0.065 : 0.08;
    for (var i = 0; i < freqs.length; i += 1) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var noteT = t + i * noteDur;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], noteT);
      gain.gain.setValueAtTime(0.001, noteT);
      gain.gain.linearRampToValueAtTime(0.24, noteT + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, noteT + 0.16);
      osc.connect(gain);
      route(gain);
      osc.start(noteT);
      osc.stop(noteT + 0.16);
      cleanupVoice(osc, [gain], noteT + 0.16);
    }
  }

  function bossPhaseRoar() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    // 1. Low-frequency mechanical roar
    var osc = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.65);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.65);
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    osc.connect(filter);
    filter.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.65);
    cleanupVoice(osc, [filter, gain], t + 0.65);

    // 2. Steam pressure release hiss
    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(2800, t + 0.08);
      nFilter.frequency.exponentialRampToValueAtTime(650, t + 0.55);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, t + 0.08);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t + 0.08);
      nSrc.stop(t + 0.55);
      cleanupVoice(nSrc, [nFilter, nGain], t + 0.55);
    }
  }

  function staggerBreak() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    // 1. Crystal punch transient
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1600, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    gain.gain.setValueAtTime(0.38, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.08);
    cleanupVoice(osc, [gain], t + 0.08);

    // 2. High resonant metallic shatter ring
    var oscM = ctx.createOscillator();
    var gainM = ctx.createGain();
    oscM.type = 'triangle';
    oscM.frequency.setValueAtTime(2800, t);
    oscM.frequency.exponentialRampToValueAtTime(950, t + 0.16);
    gainM.gain.setValueAtTime(0.25, t);
    gainM.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    oscM.connect(gainM);
    route(gainM);
    oscM.start(t);
    oscM.stop(t + 0.16);
    cleanupVoice(oscM, [gainM], t + 0.16);
  }

  function dryFire() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.035);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.035);
    cleanupVoice(osc, [gain], t + 0.035);

    var osc2 = ctx.createOscillator();
    var gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(280, t + 0.018);
    osc2.frequency.exponentialRampToValueAtTime(90, t + 0.018 + 0.025);
    gain2.gain.setValueAtTime(0.18, t + 0.018);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.018 + 0.025);
    osc2.connect(gain2);
    route(gain2);
    osc2.start(t + 0.018);
    osc2.stop(t + 0.018 + 0.025);
    cleanupVoice(osc2, [gain2], t + 0.018 + 0.025);
  }

  function tacticalReady() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(1750, t + 0.06);
    gain.gain.setValueAtTime(0.26, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    route(gain);
    osc.start(t);
    osc.stop(t + 0.06);
    cleanupVoice(osc, [gain], t + 0.06);
  }

  return {
    cleanupVoice: cleanupVoice,
    resonanceAscend: resonanceAscend,
    bossPhaseRoar: bossPhaseRoar,
    staggerBreak: staggerBreak,
    dryFire: dryFire,
    tacticalReady: tacticalReady,
    unlock: unlock,
    isMuted: isMuted,
    setMuted: setMuted,
    toggleMute: toggleMute,
    setLowpass: setLowpass,
    click: click,
    shoot: shoot,
    shootBreacher: shootBreacher,
    shootVanguard: shootVanguard,
    vanguardChargeStart: vanguardChargeStart,
    vanguardChargeStop: vanguardChargeStop,
    ricochet: ricochet,
    shieldShatter: shieldShatter,
    hit: hit,
    critHit: critHit,
    blast: blast,
    kill: kill,
    dash: dash,
    hurt: hurt,
    pickup: pickup,
    levelUp: levelUp,
    stormSiren: stormSiren,
    playHeartbeat: playHeartbeat,
    mortarLaunch: mortarLaunch,
    mortarImpact: mortarImpact,
    graze: graze,
    emp: emp,
    getMasterVolume: getMasterVolume,
    setMasterVolume: setMasterVolume,
    loadSettings: loadAudioSettings,
    saveSettings: saveAudioSettings,
    AUDIO_KEY: AUDIO_KEY,
    LEGACY_AUDIO_MUTED_KEY: LEGACY_AUDIO_MUTED_KEY,
    LEGACY_AUDIO_VOLUME_KEY: LEGACY_AUDIO_VOLUME_KEY
  };
})();
