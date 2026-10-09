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

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      muted = window.localStorage.getItem('dust_reign_audio_muted') === 'true';
      var savedVol = window.localStorage.getItem('dust_reign_master_volume');
      if (savedVol !== null && !isNaN(Number(savedVol))) {
        masterVolume = Math.max(0, Math.min(100, Math.round(Number(savedVol))));
      }
    }
  } catch (e) {
    muted = false;
    masterVolume = 80;
  }

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
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('dust_reign_master_volume', String(masterVolume));
      }
    } catch (e) {}
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 0.35 * (masterVolume / 100), ctx.currentTime);
    }
    return masterVolume;
  }

  function setMuted(val) {
    muted = Boolean(val);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('dust_reign_audio_muted', muted ? 'true' : 'false');
      }
    } catch (e) {}
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

  function canPlay() {
    if (!ctx) initContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return Boolean(ctx && !muted && ctx.state !== 'closed');
  }

  function shoot() {
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

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'highpass';
      nFilter.frequency.setValueAtTime(1000, t);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18, t);
      nGain.exponentialRampToValueAtTime(0.001, t + 0.04);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.04);
    }
  }

  function hit() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
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

    if (noiseBuffer) {
      var nSrc = ctx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      var nFilter = ctx.createBiquadFilter();
      nFilter.type = 'lowpass';
      nFilter.frequency.setValueAtTime(360, t);
      nFilter.frequency.exponentialRampToValueAtTime(80, t + 0.18);
      var nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, t);
      nGain.exponentialRampToValueAtTime(0.001, t + 0.18);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      route(nGain);
      nSrc.start(t);
      nSrc.stop(t + 0.18);
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
    }
  }

  function playHeartbeat() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    var osc1 = ctx.createOscillator();
    var gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(56, t);
    osc1.frequency.exponentialRampToValueAtTime(36, t + 0.09);
    gain1.gain.setValueAtTime(0.36, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc1.connect(gain1);
    route(gain1);
    osc1.start(t);
    osc1.stop(t + 0.09);

    var osc2 = ctx.createOscillator();
    var gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(46, t + 0.14);
    osc2.frequency.exponentialRampToValueAtTime(30, t + 0.14 + 0.08);
    gain2.gain.setValueAtTime(0.26, t + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.14 + 0.08);
    osc2.connect(gain2);
    route(gain2);
    osc2.start(t + 0.14);
    osc2.stop(t + 0.14 + 0.08);
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
    }
  }

  function graze() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
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
  }

  return {
    unlock: unlock,
    isMuted: isMuted,
    setMuted: setMuted,
    toggleMute: toggleMute,
    setLowpass: setLowpass,
    click: click,
    shoot: shoot,
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
    setMasterVolume: setMasterVolume
  };
})();
