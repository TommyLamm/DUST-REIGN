/*
 * Luna: Wasteland Run
 * DOM contract: a <canvas id="gameCanvas"> (or .game-canvas / [data-game-canvas])
 * is enough. Optional HUD nodes use #health, #xp, #level, #wave, #score,
 * #healthFill, #xpFill, #gameOver, #restart and #upgradeOverlay.
 * Entry point: window.LunaGame.init(); the script also boots on DOM ready.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var WAVE_LENGTH = 30;
  var COMBO_WINDOW = 4;
  var MAX_COMBO = 8;
  var DASH_PULSE_DURATION = 0.24;
  var DASH_PULSE_RADIUS = 88;
  var OVERDRIVE_DURATION = 6;
  var OVERDRIVE_COOLDOWN = 0.62;
  var OVERDRIVE_DAMAGE = 1.5;
  var REPAIR_HEAL = 18;
  var BOUNTY_SURGE_DURATION = 3;
  var REPAIR_OVERFLOW_SCORE = 12;
  var STORM_FRONT_SECONDS = 5;
  var STORM_SPAWN_FACTOR = 0.72;
  var BEST_SCORE_KEY = 'dust-reign:best-score:v1';
  var LEGACY_BEST_SCORE_KEY = 'dustReignBestScore';
  var UPGRADES = [
    {
      id: 'rapid-fire',
      category: 'OFFENSE',
      title: 'RAPID FIRE',
      text: 'Fire 18% faster',
      aliases: ['quick-hands'],
      apply: function (s) { s.player.fireRate *= 0.82; }
    },
    {
      id: 'scatter-shot',
      category: 'OFFENSE',
      title: 'SCATTER SHOT',
      text: '+8 weapon damage',
      aliases: ['overcharge'],
      apply: function (s) { s.player.damage += 8; }
    },
    {
      id: 'heavy-plating',
      category: 'DEFENSE',
      title: 'HEAVY PLATING',
      text: '+25 max health and heal 40 HP',
      aliases: ['field-medic'],
      apply: function (s) { s.player.maxHp += 25; s.player.hp = Math.min(s.player.maxHp, s.player.hp + 40); }
    },
    {
      id: 'overdrive-injector',
      category: 'TACTICAL',
      title: 'OVERDRIVE INJECTOR',
      text: '+2.5s Overdrive length and trigger 3.5s Surge',
      aliases: ['road-runner'],
      apply: function (s) {
        s.player.speed += 35;
        s.player.overdriveDurationBonus = (s.player.overdriveDurationBonus || 0) + 2.5;
        s.player.overdrive = Math.max(s.player.overdrive, 3.5);
      }
    },
    {
      id: 'magnet-core',
      category: 'TACTICAL',
      title: 'MAGNET CORE',
      text: '+65px magnet reach & +25% scrap XP',
      aliases: ['scavenger'],
      apply: function (s) {
        s.player.magnetRadius = (s.player.magnetRadius || 165) + 65;
        s.player.xpMult *= 1.25;
      }
    },
    {
      id: 'hot-load',
      category: 'OFFENSE',
      title: 'HOT LOAD',
      text: '+180 bullet speed and size',
      apply: function (s) { s.player.bulletSpeed += 180; s.player.bulletSize += 1; }
    },
    {
      id: 'rail-slug',
      category: 'OFFENSE',
      title: 'RAIL SLUG',
      text: 'Bullets pierce 1 enemy (70% damage retention)',
      apply: function (s) { s.player.pierce = (s.player.pierce || 0) + 1; }
    },
    {
      id: 'ricochet',
      category: 'OFFENSE',
      title: 'KINETIC RICOCHET',
      text: 'Bullets bounce off screen border 1 time (90% speed)',
      apply: function (s) { s.player.bounces = (s.player.bounces || 0) + 1; }
    },
    {
      id: 'shockwave-dash',
      category: 'TACTICAL',
      title: 'SHOCKWAVE DASH',
      text: 'Dash pulse radius expands to 125px with 2x knockback',
      apply: function (s) { s.player.shockwaveDash = true; }
    },
    {
      id: 'tesla-coil',
      category: 'TACTICAL',
      title: 'TESLA COIL',
      text: 'Orb collection zaps up to 2 foes for 22 dmg',
      apply: function (s) { s.player.teslaCoil = true; }
    },
    {
      id: 'reactive-armor',
      category: 'DEFENSE',
      title: 'REACTIVE ARMOR',
      text: 'Taking damage releases a 360° defensive pulse (75px, 30 dmg)',
      apply: function (s) { s.player.reactiveArmor = true; }
    },
    {
      id: 'high-caliber',
      category: 'OFFENSE',
      title: 'HIGH CALIBER',
      text: 'Crit damage boosted to 2.2x & 20% flat crit chance',
      apply: function (s) { s.player.highCaliber = true; }
    }
  ];

  var CASING_POOL_SIZE = 36;
  function createCasingPool() {
    var pool = new Array(CASING_POOL_SIZE);
    for (var i = 0; i < CASING_POOL_SIZE; i += 1) {
      pool[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0, life: 0, maxLife: 0.6 };
    }
    return pool;
  }

  var DECAL_POOL_SIZE = 64;
  function createDecalPool() {
    var pool = new Array(DECAL_POOL_SIZE);
    for (var i = 0; i < DECAL_POOL_SIZE; i += 1) {
      pool[i] = { active: false, x: 0, y: 0, r: 10, life: 0, maxLife: 15, alpha: 0.38, color: '#1b1715', rot: 0 };
    }
    return pool;
  }

  var AudioFX = (function () {
    var ctx = null;
    var masterGain = null;
    var lowpassFilter = null;
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

    return {
      unlock: unlock,
      isMuted: isMuted,
      setMuted: setMuted,
      toggleMute: toggleMute,
      setLowpass: setLowpass,
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

  var state = null;
  var ui = null;
  var raf = 0;
  var lastTime = 0;
  var started = false;
  var terrain = [];
  var listeners = [];
  var resizeObserver = null;
  var firePointers = new Set();
  var input = {
    keys: new Set(),
    mouse: { x: 480, y: 320, down: false },
    touchMode: false,
    gamepadX: 0,
    gamepadY: 0
  };
  var gamepadState = {
    connected: false,
    selectedUpgrade: 0,
    navDebounce: 0,
    prevButtons: {}
  };
  var Playroom = null;
  var playroomPromise = null;
  var accountRun = null;
  var accountRunSaved = false;

  if (typeof window !== 'undefined') {
    try {
      playroomPromise = import('./playroom-sdk.js')
        .then(function (mod) {
          Playroom = (mod && mod.Playroom) || null;
          return Playroom;
        })
        .catch(function () {
          Playroom = null;
          return null;
        });
    } catch (e) {
      Playroom = null;
      playroomPromise = Promise.resolve(null);
    }
  } else {
    playroomPromise = Promise.resolve(null);
  }

  function startAccountRun() {
    accountRunSaved = false;
    if (playroomPromise) {
      return playroomPromise
        .then(function (sdk) {
          if (sdk && typeof sdk.startRun === 'function') {
            return sdk.startRun().catch(function () { return null; });
          }
          return null;
        })
        .catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  function finishAccountRun() {
    if (!state || !accountRun) return;
    var currentRun = accountRun;
    accountRun = null;
    var finalScore = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(state.score || 0)));
    currentRun
      .then(function (run) {
        if (!run || !run.runId) return null;
        return playroomPromise.then(function (sdk) {
          if (!sdk || typeof sdk.finishRun !== 'function') return null;
          return sdk.finishRun({ runId: run.runId, score: finalScore });
        });
      })
      .then(function (result) {
        if (result && result.saved === true) {
          accountRunSaved = true;
          updateDomUi();
          logEvent('PLAYROOM // SCORE SAVED');
        }
      })
      .catch(function () {
        // Platform or network failure must not block gameplay
      });
  }

  function q(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function first(selectors, root) {
    for (var i = 0; i < selectors.length; i += 1) {
      var found = q(selectors[i], root);
      if (found) return found;
    }
    return null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dist2(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return dx * dx + dy * dy;
  }

  function isStormFront() {
    return !!state && state.waveTime >= WAVE_LENGTH - STORM_FRONT_SECONDS;
  }

  var hapticsEnabled = true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      hapticsEnabled = window.localStorage.getItem('dust_reign_haptics_enabled') !== 'false';
    }
  } catch (e) {
    hapticsEnabled = true;
  }

  function isHapticsEnabled() {
    return hapticsEnabled;
  }

  function setHapticsEnabled(val) {
    hapticsEnabled = Boolean(val);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('dust_reign_haptics_enabled', hapticsEnabled ? 'true' : 'false');
      }
    } catch (e) {}
    return hapticsEnabled;
  }

  function isReducedMotion() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        var saved = window.localStorage.getItem('dust_reign_motion_reduction');
        if (saved === 'true') return true;
        if (saved === 'false') return false;
      }
      return typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function setMotionReduction(val) {
    var bool = Boolean(val);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('dust_reign_motion_reduction', bool ? 'true' : 'false');
      }
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.toggle('reduced-motion', bool);
      }
    } catch (e) {}
    return bool;
  }

  var highContrastEnabled = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      highContrastEnabled = window.localStorage.getItem('dust_reign_high_contrast') === 'true';
    }
  } catch (e) {
    highContrastEnabled = false;
  }

  function isHighContrast() {
    return highContrastEnabled;
  }

  function setHighContrast(val) {
    highContrastEnabled = Boolean(val);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('dust_reign_high_contrast', highContrastEnabled ? 'true' : 'false');
      }
      if (ui && ui.root) {
        ui.root.classList.toggle('is-high-contrast', highContrastEnabled);
      } else if (typeof document !== 'undefined') {
        var r = document.querySelector('.game-root') || document.documentElement;
        if (r) r.classList.toggle('is-high-contrast', highContrastEnabled);
      }
    } catch (e) {}
    return highContrastEnabled;
  }

  function triggerHaptic(pattern) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        if (hapticsEnabled && !AudioFX.isMuted() && !isReducedMotion()) {
          navigator.vibrate(pattern);
        }
      }
    } catch (e) {}
  }

  function readBestScore() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return 0;
      // Keep the original score readable without deleting or rewriting old saves.
      var current = Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
      var legacy = Number(window.localStorage.getItem(LEGACY_BEST_SCORE_KEY)) || 0;
      return Math.max(0, isFinite(current) ? current : 0, isFinite(legacy) ? legacy : 0);
    } catch (error) {
      return 0;
    }
  }

  function writeBestScore(score) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch (error) {
      // Private browsing and file URLs can deny storage; the run still works without it.
    }
  }

  function makeState(width, height) {
    return {
      width: width || 960,
      height: height || 640,
      running: true,
      paused: false,
      over: false,
      level: 1,
      xp: 0,
      xpNext: 100,
      score: 0,
      combo: 0,
      comboTimer: 0,
      bestScore: readBestScore(),
      kills: 0,
      wave: 1,
      waveTime: 0,
      bountyTarget: 7,
      bountyKills: 0,
      bountyReward: 160,
      bountyClaimed: false,
      spawnTimer: 0.5,
      banner: 1.8,
      bannerText: '',
      shake: 0,
      hurtFlash: 0,
      hitstop: 0,
      heartbeatTimer: 0,
      stormAlerted: false,
      stormKills: 0,
      stormHurt: false,
      bossSpawned: false,
      deathSequenceTimer: 0,
      isNewRecord: false,
      coreSpawnTime: 8 + Math.random() * 8,
      coreSpawned: false,
      stats: { shotsFired: 0, shotsHit: 0, damageDealt: 0, crits: 0, coresDetonated: 0, grazes: 0, maxCombo: 0 },
      casings: createCasingPool(),
      casingIndex: 0,
      decals: createDecalPool(),
      decalIndex: 0,
      player: {
        x: (width || 960) / 2,
        y: (height || 640) / 2,
        vx: 0,
        vy: 0,
        r: 15,
        speed: 235,
        hp: 100,
        maxHp: 100,
        energy: 50,
        maxEnergy: 100,
        damage: 26,
        fireRate: 0.18,
        cooldown: 0,
        bulletSpeed: 700,
        bulletSize: 4,
        xpMult: 1,
        aim: 0,
        invulnerable: 0,
        dashCooldown: 0,
        dashPulse: 0,
        overdrive: 0,
        recoil: 0,
        pierce: 0,
        bounces: 0,
        shockwaveDash: false,
        teslaCoil: false,
        reactiveArmor: false,
        highCaliber: false,
        magnetRadius: 165,
        slowTimer: 0,
        dashAmbushTimer: 0,
        overdriveDurationBonus: 0
      },
      bullets: [],
      enemyBullets: [],
      enemies: [],
      orbs: [],
      particles: [],
      shockRings: [],
      lightningArcs: [],
      volatileCores: [],
      artilleryTargets: [],
      opticalFlashes: [],
      upgradeChoices: [],
      acquiredUpgrades: []
    };
  }

  function addDecal(x, y, r, maxLife, baseAlpha, color) {
    if (!state || !state.decals) return;
    var d = state.decals[state.decalIndex];
    state.decalIndex = (state.decalIndex + 1) % DECAL_POOL_SIZE;
    d.active = true;
    d.x = x;
    d.y = y;
    d.r = r || (8 + Math.random() * 10);
    d.maxLife = maxLife || (12 + Math.random() * 6);
    d.life = d.maxLife;
    d.alpha = baseAlpha !== undefined ? baseAlpha : 0.38;
    d.color = color || '#1b1715';
    d.rot = Math.random() * TAU;
  }

  function randomUpgradeChoices() {
    var offenses = UPGRADES.filter(function (u) { return u.category === 'OFFENSE'; });
    var guaranteedOffense = offenses[Math.floor(Math.random() * offenses.length)];
    var picks = [guaranteedOffense];
    var remaining = UPGRADES.filter(function (u) { return u.id !== guaranteedOffense.id; });
    while (picks.length < 3 && remaining.length > 0) {
      var idx = Math.floor(Math.random() * remaining.length);
      picks.push(remaining.splice(idx, 1)[0]);
    }
    for (var i = picks.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = picks[i];
      picks[i] = picks[j];
      picks[j] = temp;
    }
    return picks;
  }

  function on(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(function () { target.removeEventListener(name, handler, options); });
  }

  function setText(node, value) {
    if (node) node.textContent = String(value);
  }

  function logEvent(message) {
    if (!state || !ui || !ui.runLog || typeof document === 'undefined') return;
    var elapsed = Math.max(0, Math.floor((state.wave - 1) * WAVE_LENGTH + state.waveTime));
    var item = document.createElement('li');
    item.className = 'run-log-entry';
    var time = document.createElement('time');
    var copy = document.createElement('span');
    time.textContent = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
    copy.textContent = message;
    item.appendChild(time);
    item.appendChild(copy);
    ui.runLog.insertBefore(item, ui.runLog.firstChild);
    while (ui.runLog.children.length > 5) ui.runLog.removeChild(ui.runLog.lastElementChild);
  }

  function setupDom(options) {
    options = options || {};
    var root = options.root || first(['[data-luna-game]', '#game-root', '.game-root', '.game-container', '.game-shell']);
    var canvas = options.canvas || first(['#gameCanvas', '#game-canvas', '[data-game-canvas]', '.game-canvas', 'canvas'], root || document);
    var createdCanvas = false;

    if (!canvas) {
      root = root || document.body;
      canvas = document.createElement('canvas');
      canvas.id = 'gameCanvas';
      canvas.className = 'game-canvas';
      canvas.setAttribute('aria-label', 'Wasteland Run game arena');
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.touchAction = 'none';
      root.appendChild(canvas);
      createdCanvas = true;
    }
    root = root || canvas.closest('[data-luna-game], #game-root, .game-root, .game-container, .game-shell') || canvas.parentElement || document.body;
    canvas.style.touchAction = 'none';

    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('LunaGame needs a 2D canvas');

    var overlay = first(['#upgradeOverlay', '#upgrade-overlay', '#upgradePanel', '[data-upgrade-overlay]', '.upgrade-overlay', '.upgrade-panel', '.upgrade-modal']);
    var createdOverlay = false;
    if (!overlay) {
      overlay = document.createElement('section');
      overlay.className = 'upgrade-overlay';
      overlay.setAttribute('aria-live', 'polite');
      overlay.hidden = true;
      overlay.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(8,8,8,.78);z-index:5;padding:24px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#f4e8ce;';
      root.style.position = root.style.position || 'relative';
      root.appendChild(overlay);
      createdOverlay = true;
    }

    var optionsNode = first(['[data-upgrade-options]', '.upgrade-options', '#upgradeOptions', '#upgradeChoices', '.upgrade-choices'], overlay);
    if (!optionsNode) {
      optionsNode = document.createElement('div');
      optionsNode.className = 'upgrade-options';
      overlay.appendChild(optionsNode);
    }
    on(optionsNode, 'click', function (event) {
      var button = event.target.closest && event.target.closest('[data-upgrade-index]');
      if (button && optionsNode.contains(button)) chooseUpgrade(Number(button.dataset.upgradeIndex));
    });

    var restart = first(['#restartButton', '#restartBtn', '#restart', '[data-restart]', '.restart-button', '.restart']);
    var gameOver = first(['#gameOver', '#gameOverScreen', '#game-over', '[data-game-over]', '.game-over']);
    var startScreen = first(['#startScreen', '[data-start-screen]', '.start-screen']);
    var startButton = first(['#startBtn', '#startButton', '[data-start]', '.start-button']);
    var health = first(['#health', '#hudHealth', '[data-health]', '.health-value']);
    var xp = first(['#xp', '#hudXp', '[data-xp]', '.xp-value']);
    var xpMax = first(['#xpMax', '#hudXpMax', '[data-xp-max]', '.xp-max']);
    var level = first(['#level', '#hudLevel', '[data-level]', '.level-value']);
    var wave = first(['#wave', '#hudWave', '[data-wave]', '.wave-value']);
    var score = first(['#score', '#hudScore', '[data-score]', '.score-value']);
    var kills = first(['#kills', '#hudKills', '[data-kills]', '.kills-value']);
    var healthFill = first(['#healthFill', '#health-fill', '[data-health-fill]', '.health-fill']);
    var xpFill = first(['#xpFill', '#xp-fill', '[data-xp-fill]', '.xp-fill']);
    var runState = first(['#runState', '[data-run-state]', '.run-state']);
    var statusText = first(['#hudStatusText', '[data-status-text]', '.status-text']);
    var best = first(['#hudBest', '[data-best-score]', '.best-score']);
    var finalWave = first(['#finalWave', '[data-final-wave]']);
    var finalScore = first(['#finalScore', '[data-final-score]']);
    var finalBest = first(['#finalBest', '[data-final-best]']);
    var objectiveText = first(['#objectiveText', '[data-objective-text]', '.objective-text']);
    var objectiveProgress = first(['#objectiveProgress', '[data-objective-progress]', '.objective-progress']);
    var threatIndex = first(['#threatIndex', '[data-threat-index]', '.threat-index']);
    var waveTimer = first(['#waveTimer', '[data-wave-timer]', '.wave-timer']);
    var runLog = first(['#runLog', '[data-run-log]', '.run-log']);
    var accountSaveBadge = first(['#accountSaveBadge', '[data-account-save-badge]'], gameOver);
    var audioBtn = first(['#audioBtn', '[data-audio-btn]', '.audio-button']);
    var hudChain = first(['#hudChain', '[data-hud-chain]', '.hud-chain-badge']);
    var hudEnergy = first(['#hudEnergy', '[data-energy]']);
    var meterEnergy = first(['#meterEnergy']);
    var energyFill = first(['#energyFill', '[data-energy-fill]']);
    var touchSpecial = first(['#touchSpecial']);
    var newRecordStamp = first(['#newRecordStamp']);

    var pauseModal = first(['#pauseModal', '[data-pause-modal]'], root || document);
    var tabBtnSystem = first(['#tabBtnSystem'], pauseModal || document);
    var tabBtnBuild = first(['#tabBtnBuild'], pauseModal || document);
    var tabBtnControls = first(['#tabBtnControls'], pauseModal || document);
    var panelSystem = first(['#panelSystem'], pauseModal || document);
    var panelBuild = first(['#panelBuild'], pauseModal || document);
    var panelControls = first(['#panelControls'], pauseModal || document);
    var settingMasterVolume = first(['#settingMasterVolume'], pauseModal || document);
    var volumeValue = first(['#volumeValue'], pauseModal || document);
    var toggleAudioMute = first(['#toggleAudioMute'], pauseModal || document);
    var toggleHaptics = first(['#toggleHaptics'], pauseModal || document);
    var toggleMotionReduction = first(['#toggleMotionReduction'], pauseModal || document);
    var toggleHighContrast = first(['#toggleHighContrast'], pauseModal || document);
    var pauseResumeBtn = first(['#pauseResumeBtn'], pauseModal || document);
    var pauseAbandonBtn = first(['#pauseAbandonBtn'], pauseModal || document);
    var statFireRate = first(['#statFireRate'], pauseModal || document);
    var statDamage = first(['#statDamage'], pauseModal || document);
    var statCrit = first(['#statCrit'], pauseModal || document);
    var statBallistics = first(['#statBallistics'], pauseModal || document);
    var statSpeed = first(['#statSpeed'], pauseModal || document);
    var statMagnet = first(['#statMagnet'], pauseModal || document);
    var buildPassiveTags = first(['#buildPassiveTags'], pauseModal || document);
    var installedChipsCount = first(['#installedChipsCount'], pauseModal || document);
    var installedChipsList = first(['#installedChipsList'], pauseModal || document);
    var touchJoystickZone = first(['#touchJoystickZone'], root || document);
    var joystickBase = first(['#joystickBase'], touchJoystickZone || document);
    var joystickThumb = first(['#joystickThumb'], touchJoystickZone || document);

    return {
      root: root,
      canvas: canvas,
      ctx: ctx,
      overlay: overlay,
      optionsNode: optionsNode,
      restart: restart,
      startScreen: startScreen,
      startButton: startButton,
      gameOver: gameOver,
      health: health,
      xp: xp,
      xpMax: xpMax,
      level: level,
      wave: wave,
      score: score,
      kills: kills,
      healthFill: healthFill,
      xpFill: xpFill,
      hudEnergy: hudEnergy,
      meterEnergy: meterEnergy,
      energyFill: energyFill,
      touchSpecial: touchSpecial,
      newRecordStamp: newRecordStamp,
      runState: runState,
      statusText: statusText,
      best: best,
      finalWave: finalWave,
      finalScore: finalScore,
      finalBest: finalBest,
      objectiveText: objectiveText,
      objectiveProgress: objectiveProgress,
      threatIndex: threatIndex,
      waveTimer: waveTimer,
      runLog: runLog,
      accountSaveBadge: accountSaveBadge,
      audioBtn: audioBtn,
      hudChain: hudChain,
      pauseModal: pauseModal,
      tabBtnSystem: tabBtnSystem,
      tabBtnBuild: tabBtnBuild,
      tabBtnControls: tabBtnControls,
      panelSystem: panelSystem,
      panelBuild: panelBuild,
      panelControls: panelControls,
      settingMasterVolume: settingMasterVolume,
      volumeValue: volumeValue,
      toggleAudioMute: toggleAudioMute,
      toggleHaptics: toggleHaptics,
      toggleMotionReduction: toggleMotionReduction,
      toggleHighContrast: toggleHighContrast,
      pauseResumeBtn: pauseResumeBtn,
      pauseAbandonBtn: pauseAbandonBtn,
      statFireRate: statFireRate,
      statDamage: statDamage,
      statCrit: statCrit,
      statBallistics: statBallistics,
      statSpeed: statSpeed,
      statMagnet: statMagnet,
      buildPassiveTags: buildPassiveTags,
      installedChipsCount: installedChipsCount,
      installedChipsList: installedChipsList,
      touchJoystickZone: touchJoystickZone,
      joystickBase: joystickBase,
      joystickThumb: joystickThumb,
      createdCanvas: createdCanvas,
      createdOverlay: createdOverlay,
      width: 960,
      height: 640,
      dpr: 1
    };
  }

  var currentPauseTab = 'system';
  var abandonConfirmTimer = 0;

  function resetAbandonConfirm() {
    abandonConfirmTimer = 0;
    var btn = (ui && ui.pauseAbandonBtn) || (typeof document !== 'undefined' && document.getElementById('pauseAbandonBtn'));
    if (btn) {
      btn.innerHTML = '<span>ABANDON RUN</span><b aria-hidden="true">⚠</b>';
      btn.classList.remove('is-confirming');
    }
  }

  function handleAbandonClick() {
    var now = Date.now();
    if (abandonConfirmTimer > 0 && now < abandonConfirmTimer) {
      resetAbandonConfirm();
      if (ui && ui.pauseModal) ui.pauseModal.hidden = true;
      if (state) state.paused = false;
      triggerGameOver();
    } else {
      abandonConfirmTimer = now + 4000;
      var btn = (ui && ui.pauseAbandonBtn) || (typeof document !== 'undefined' && document.getElementById('pauseAbandonBtn'));
      if (btn) {
        btn.innerHTML = '<span>CONFIRM ABANDON?</span><b aria-hidden="true">⚠</b>';
        btn.classList.add('is-confirming');
      }
    }
  }

  function switchPauseTab(tabName) {
    currentPauseTab = tabName;
    if (!ui) return;
    var tabs = [
      { name: 'system', btn: ui.tabBtnSystem, panel: ui.panelSystem },
      { name: 'build', btn: ui.tabBtnBuild, panel: ui.panelBuild },
      { name: 'controls', btn: ui.tabBtnControls, panel: ui.panelControls }
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

  function updateAudioBtn() {
    var btn = (ui && ui.audioBtn) || (typeof document !== 'undefined' && document.getElementById('audioBtn'));
    var muted = AudioFX.isMuted();
    if (btn) {
      btn.textContent = muted ? 'AUDIO [OFF]' : 'AUDIO [ON]';
      btn.setAttribute('aria-label', muted ? 'Turn audio on' : 'Turn audio off');
    }
    var modalMuteBtn = (ui && ui.toggleAudioMute) || (typeof document !== 'undefined' && document.getElementById('toggleAudioMute'));
    if (modalMuteBtn) {
      modalMuteBtn.textContent = muted ? 'MUTE: ON' : 'MUTE: OFF';
      if (muted) modalMuteBtn.classList.add('is-active');
      else modalMuteBtn.classList.remove('is-active');
    }
  }

  function updateSettingsUi() {
    if (!ui) return;
    if (ui.settingMasterVolume) {
      ui.settingMasterVolume.value = String(AudioFX.getMasterVolume());
    }
    if (ui.volumeValue) {
      ui.volumeValue.textContent = AudioFX.getMasterVolume() + '%';
    }
    updateAudioBtn();
    if (ui.toggleHaptics) {
      var hOn = isHapticsEnabled();
      ui.toggleHaptics.textContent = hOn ? 'HAPTICS: ENABLED' : 'HAPTICS: DISABLED';
      if (hOn) ui.toggleHaptics.classList.add('is-active');
      else ui.toggleHaptics.classList.remove('is-active');
    }
    if (ui.toggleMotionReduction) {
      var mReduced = isReducedMotion();
      ui.toggleMotionReduction.textContent = mReduced ? 'MOTION: REDUCED' : 'MOTION: STANDARD';
      if (mReduced) ui.toggleMotionReduction.classList.add('is-active');
      else ui.toggleMotionReduction.classList.remove('is-active');
    }
    if (ui.toggleHighContrast) {
      var hc = isHighContrast();
      ui.toggleHighContrast.textContent = hc ? 'CONTRAST: HIGH' : 'CONTRAST: STANDARD';
      if (hc) ui.toggleHighContrast.classList.add('is-active');
      else ui.toggleHighContrast.classList.remove('is-active');
    }
    if (ui.root) {
      ui.root.classList.toggle('is-high-contrast', isHighContrast());
    }
  }

  function renderBuildInspector() {
    if (!state || !ui) return;
    var p = state.player;
    if (!p) return;

    if (ui.statFireRate) {
      var rps = 1 / p.fireRate;
      if (p.overdrive > 0) rps = 1 / (p.fireRate * OVERDRIVE_COOLDOWN);
      ui.statFireRate.textContent = rps.toFixed(1) + ' RPS' + (p.overdrive > 0 ? ' (SURGE)' : '');
    }
    if (ui.statDamage) {
      var dmg = p.damage;
      if (p.overdrive > 0) dmg = Math.round(dmg * OVERDRIVE_DAMAGE);
      ui.statDamage.textContent = dmg + ' DMG' + (p.overdrive > 0 ? ' (+50%)' : '');
    }
    if (ui.statCrit) {
      ui.statCrit.textContent = p.highCaliber ? '2.2x [20% FLAT CRIT]' : '1.75x [AMBUSH CRIT]';
    }
    if (ui.statBallistics) {
      ui.statBallistics.textContent = 'PIERCE ' + (p.pierce || 0) + ' / RICO ' + (p.bounces || 0);
    }
    if (ui.statSpeed) {
      ui.statSpeed.textContent = Math.round(p.speed) + ' PX/S';
    }
    if (ui.statMagnet) {
      ui.statMagnet.textContent = Math.round(p.magnetRadius || 165) + ' PX';
    }

    if (ui.buildPassiveTags) {
      var traits = [
        { name: 'SHOCKWAVE DASH', active: Boolean(p.shockwaveDash) },
        { name: 'TESLA COIL', active: Boolean(p.teslaCoil) },
        { name: 'REACTIVE ARMOR', active: Boolean(p.reactiveArmor) },
        { name: 'HIGH CALIBER', active: Boolean(p.highCaliber) }
      ];
      ui.buildPassiveTags.innerHTML = traits.map(function (t) {
        return '<div class="passive-tag ' + (t.active ? 'is-active' : 'is-inactive') + '">' +
          '<span class="tag-status">' + (t.active ? '● ONLINE' : '○ OFFLINE') + '</span>' +
          '<strong class="tag-name">' + t.name + '</strong>' +
          '</div>';
      }).join('');
    }

    var chips = state.acquiredUpgrades || [];
    if (ui.installedChipsCount) {
      ui.installedChipsCount.textContent = String(chips.length);
    }
    if (ui.installedChipsList) {
      if (chips.length === 0) {
        ui.installedChipsList.innerHTML = '<div class="chips-empty">[ NO MOD CHIPS INSTALLED — SALVAGE REQUIRED ]</div>';
      } else {
        ui.installedChipsList.innerHTML = chips.map(function (c) {
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
  }

  function rebuildTerrain() {
    terrain = [];
    var count = Math.max(38, Math.round((ui.width * ui.height) / 10500));
    var seed = 7919;
    function next() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    for (var i = 0; i < count; i += 1) {
      var x = next() * ui.width;
      var y = next() * ui.height;
      var size = 3 + next() * 13;
      terrain.push({ x: x, y: y, size: size, rot: next() * TAU, kind: next() > 0.72 ? 'scrap' : 'rock' });
    }
  }

  function resize() {
    var rect = ui.canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width || ui.canvas.clientWidth || ui.canvas.width || window.innerWidth || 960));
    var height = Math.max(1, Math.round(rect.height || ui.canvas.clientHeight || ui.canvas.height || window.innerHeight || 640));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var changed = width !== ui.width || height !== ui.height;
    if (!changed && dpr === ui.dpr && terrain.length) return;
    ui.width = width;
    ui.height = height;
    ui.dpr = dpr;
    ui.canvas.width = Math.round(width * dpr);
    ui.canvas.height = Math.round(height * dpr);
    ui.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (changed || !terrain.length) rebuildTerrain();
    if (!state) return;
    state.width = width;
    state.height = height;
    state.player.x = clamp(state.player.x, state.player.r, width - state.player.r);
    state.player.y = clamp(state.player.y, state.player.r, height - state.player.r);
  }

  function pointerPosition(event) {
    var rect = ui.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    input.mouse.x = (event.clientX - rect.left) * (ui.width / rect.width);
    input.mouse.y = (event.clientY - rect.top) * (ui.height / rect.height);
  }

  function bindInput() {
    on(window, 'pointerdown', AudioFX.unlock, { passive: true });
    on(window, 'keydown', AudioFX.unlock, { passive: true });
    on(window, 'keydown', function (event) {
      var key = event.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright' || key === ' ' || key === 'q' || key === 'e') event.preventDefault();
      input.keys.add(key);
      if (key === ' ' && !event.repeat) {
        if (!state || !state.paused) dash();
      }
      if ((key === 'q' || key === 'e') && !event.repeat) {
        if (!state || !state.paused) triggerEmp();
      }
      if (key === 'm' && !event.repeat) { AudioFX.toggleMute(); updateAudioBtn(); }
      if ((key === 'p' || key === 'escape') && !event.repeat) togglePause();
      if (state && state.paused && ui.startScreen && !ui.startScreen.hidden && key === 'enter') beginRun();
      if (state && state.over && key === 'r') restart();
      if (state && state.paused && (key === '1' || key === '2' || key === '3')) {
        if (state.upgradeChoices && state.upgradeChoices.length > 0) {
          chooseUpgrade(Number(key) - 1);
        }
      }
      if (state && state.paused && ui && ui.pauseModal && !ui.pauseModal.hidden) {
        if (key === 'arrowleft' || key === 'arrowright') {
          var tabOrder = ['system', 'build', 'controls'];
          var curIdx = tabOrder.indexOf(currentPauseTab);
          var nextIdx = key === 'arrowleft' ? (curIdx - 1 + tabOrder.length) % tabOrder.length : (curIdx + 1) % tabOrder.length;
          switchPauseTab(tabOrder[nextIdx]);
        }
      }
    });
    on(window, 'keyup', function (event) { input.keys.delete(event.key.toLowerCase()); });
    on(ui.canvas, 'contextmenu', function (event) { event.preventDefault(); });
    on(ui.canvas, 'pointermove', pointerPosition);
    on(ui.canvas, 'pointerdown', function (event) {
      pointerPosition(event);
      if (event.pointerType === 'touch') input.touchMode = true;
      if (ui.canvas.focus) ui.canvas.focus();
      if (state && state.over) { restart(); return; }
      if (event.button === 2) {
        event.preventDefault();
        if (!state || !state.paused) triggerEmp();
        return;
      }
      if (event.button === undefined || event.button === 0) {
        firePointers.add(event.pointerId);
        input.mouse.down = true;
      }
      if (ui.canvas.setPointerCapture && event.pointerId !== undefined) ui.canvas.setPointerCapture(event.pointerId);
    });
    function releaseFire(event) {
      firePointers.delete(event.pointerId);
      input.mouse.down = firePointers.size > 0;
    }
    on(window, 'pointerup', releaseFire);
    on(window, 'pointercancel', releaseFire);
    on(window, 'blur', function () { input.keys.clear(); firePointers.clear(); input.mouse.down = false; input.gamepadX = 0; input.gamepadY = 0; });
    on(window, 'gamepadconnected', function (e) {
      gamepadState.connected = true;
      logEvent('GAMEPAD ONLINE // ' + (e.gamepad && e.gamepad.id ? e.gamepad.id.slice(0, 20) : 'DEVICE'));
    });
    on(window, 'gamepaddisconnected', function () {
      gamepadState.connected = false;
      input.gamepadX = 0;
      input.gamepadY = 0;
      logEvent('GAMEPAD OFFLINE');
    });
    on(window, 'resize', resize);
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(ui.canvas);
    }
    var pauseButton = document.getElementById('pauseBtn');
    if (pauseButton) on(pauseButton, 'click', togglePause);
    if (ui.audioBtn) on(ui.audioBtn, 'click', function () { AudioFX.toggleMute(); updateAudioBtn(); });
    if (ui.restart) on(ui.restart, 'click', restart);
    if (ui.startButton) on(ui.startButton, 'click', beginRun);

    if (ui.tabBtnSystem) on(ui.tabBtnSystem, 'click', function () { switchPauseTab('system'); });
    if (ui.tabBtnBuild) on(ui.tabBtnBuild, 'click', function () { switchPauseTab('build'); });
    if (ui.tabBtnControls) on(ui.tabBtnControls, 'click', function () { switchPauseTab('controls'); });
    if (ui.settingMasterVolume) {
      on(ui.settingMasterVolume, 'input', function (event) {
        var val = Number(event.target.value);
        AudioFX.setMasterVolume(val);
        if (ui.volumeValue) ui.volumeValue.textContent = val + '%';
      });
    }
    if (ui.toggleAudioMute) on(ui.toggleAudioMute, 'click', function () { AudioFX.toggleMute(); updateAudioBtn(); });
    if (ui.toggleHaptics) on(ui.toggleHaptics, 'click', function () { setHapticsEnabled(!isHapticsEnabled()); updateSettingsUi(); });
    if (ui.toggleMotionReduction) on(ui.toggleMotionReduction, 'click', function () { setMotionReduction(!isReducedMotion()); updateSettingsUi(); });
    if (ui.toggleHighContrast) on(ui.toggleHighContrast, 'click', function () { setHighContrast(!isHighContrast()); updateSettingsUi(); });
    if (ui.pauseResumeBtn) on(ui.pauseResumeBtn, 'click', togglePause);
    if (ui.pauseAbandonBtn) on(ui.pauseAbandonBtn, 'click', handleAbandonClick);

    // Dynamic Floating Analog Joystick
    var joystickZone = (ui && ui.touchJoystickZone) || document.getElementById('touchJoystickZone');
    var joystickBase = (ui && ui.joystickBase) || document.getElementById('joystickBase');
    var joystickThumb = (ui && ui.joystickThumb) || document.getElementById('joystickThumb');
    if (joystickZone && joystickBase && joystickThumb) {
      var activePointerId = null;
      var originX = 0;
      var originY = 0;
      var maxRadius = 48;

      function resetJoystick() {
        activePointerId = null;
        input.gamepadX = 0;
        input.gamepadY = 0;
        joystickBase.classList.remove('is-active');
        joystickBase.style.left = '50%';
        joystickBase.style.top = '50%';
        joystickThumb.style.transform = 'translate(0px, 0px)';
      }

      on(joystickZone, 'pointerdown', function (event) {
        event.preventDefault();
        if (activePointerId !== null) return;
        activePointerId = event.pointerId;
        if (joystickZone.setPointerCapture) {
          try { joystickZone.setPointerCapture(event.pointerId); } catch (e) {}
        }
        input.touchMode = true;

        var rect = joystickZone.getBoundingClientRect();
        originX = event.clientX - rect.left;
        originY = event.clientY - rect.top;

        joystickBase.classList.add('is-active');
        joystickBase.style.left = originX + 'px';
        joystickBase.style.top = originY + 'px';
        joystickThumb.style.transform = 'translate(0px, 0px)';
      });

      on(joystickZone, 'pointermove', function (event) {
        if (event.pointerId !== activePointerId) return;
        var rect = joystickZone.getBoundingClientRect();
        var currentX = event.clientX - rect.left;
        var currentY = event.clientY - rect.top;

        var dx = currentX - originX;
        var dy = currentY - originY;
        var dist = Math.hypot(dx, dy);

        if (dist > maxRadius) {
          var excess = dist - maxRadius;
          originX += (dx / dist) * excess;
          originY += (dy / dist) * excess;
          joystickBase.style.left = originX + 'px';
          joystickBase.style.top = originY + 'px';
          dist = maxRadius;
        }

        var dirX = dist > 0 ? dx / dist : 0;
        var dirY = dist > 0 ? dy / dist : 0;
        var intensity = dist / maxRadius;

        input.gamepadX = dirX * intensity;
        input.gamepadY = dirY * intensity;

        var thumbX = dirX * dist;
        var thumbY = dirY * dist;
        joystickThumb.style.transform = 'translate(' + thumbX.toFixed(1) + 'px, ' + thumbY.toFixed(1) + 'px)';
      });

      on(joystickZone, 'pointerup', function (event) {
        if (event.pointerId === activePointerId) resetJoystick();
      });
      on(joystickZone, 'pointercancel', function (event) {
        if (event.pointerId === activePointerId) resetJoystick();
      });
      on(joystickZone, 'lostpointercapture', function () {
        resetJoystick();
      });
    }

    var touchKeys = { touchUp: 'w', touchLeft: 'a', touchDown: 's', touchRight: 'd' };
    Object.keys(touchKeys).forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      on(button, 'pointerdown', function (event) {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        input.touchMode = true;
        input.keys.add(touchKeys[id]);
      });
      on(button, 'pointerup', function () { input.keys.delete(touchKeys[id]); });
      on(button, 'pointercancel', function () { input.keys.delete(touchKeys[id]); });
      on(button, 'lostpointercapture', function () { input.keys.delete(touchKeys[id]); });
    });
    var touchShoot = document.getElementById('touchShoot');
    if (touchShoot) {
      on(touchShoot, 'pointerdown', function (event) {
        event.preventDefault();
        touchShoot.setPointerCapture(event.pointerId);
        input.touchMode = true;
        firePointers.add(event.pointerId);
        input.mouse.down = true;
      });
      on(touchShoot, 'pointerup', releaseFire);
      on(touchShoot, 'pointercancel', releaseFire);
      on(touchShoot, 'lostpointercapture', releaseFire);
    }
    var touchDash = document.getElementById('touchDash');
    if (touchDash) on(touchDash, 'pointerdown', function (event) { event.preventDefault(); input.touchMode = true; dash(); });
    var touchSpecial = (ui && ui.touchSpecial) || document.getElementById('touchSpecial');
    if (touchSpecial) on(touchSpecial, 'pointerdown', function (event) { event.preventDefault(); input.touchMode = true; triggerEmp(); });
  }

  function beginRun() {
    if (!state || state.over || (state.upgradeChoices && state.upgradeChoices.length)) return;
    AudioFX.unlock();
    AudioFX.setLowpass(0);
    state.paused = false;
    accountRun = startAccountRun();
    accountRunSaved = false;
    if (ui.startScreen) ui.startScreen.hidden = true;
    if (ui.runState) ui.runState.textContent = 'LIVE';
    if (ui.statusText) ui.statusText.textContent = 'SIGNAL LIVE — KEEP MOVING';
    if (ui.canvas && ui.canvas.focus) ui.canvas.focus();
  }

  function togglePause() {
    if (!state || state.over || (state.upgradeChoices && state.upgradeChoices.length) || (ui && ui.startScreen && !ui.startScreen.hidden)) return;
    state.paused = !state.paused;
    if (ui) {
      if (ui.runState) ui.runState.textContent = state.paused ? 'PAUSED' : 'LIVE';
      if (ui.statusText) ui.statusText.textContent = state.paused ? 'SIGNAL PAUSED — PRESS P OR ESC TO RESUME' : 'SIGNAL LIVE — KEEP MOVING';
      if (ui.pauseModal) {
        ui.pauseModal.hidden = !state.paused;
        if (state.paused) {
          updateSettingsUi();
          if (currentPauseTab === 'build') renderBuildInspector();
          resetAbandonConfirm();
        } else {
          resetAbandonConfirm();
        }
      }
    }
    updateDomUi();
  }

  function restart() {
    if (!ui) return;
    AudioFX.unlock();
    AudioFX.setLowpass(0);
    state = makeState(ui.width, ui.height);
    state.player.x = ui.width / 2;
    state.player.y = ui.height / 2;
    input.mouse.x = ui.width / 2 + 100;
    input.mouse.y = ui.height / 2;
    input.mouse.down = false;
    firePointers.clear();
    input.keys.clear();
    input.touchMode = false;
    input.gamepadX = 0;
    input.gamepadY = 0;
    accountRun = startAccountRun();
    accountRunSaved = false;
    if (ui.runLog) qa('.run-log-entry', ui.runLog).forEach(function (item) { item.parentNode.removeChild(item); });
    ui.overlay.hidden = true;
    if (ui.pauseModal) ui.pauseModal.hidden = true;
    resetAbandonConfirm();
    if (ui.startScreen) ui.startScreen.hidden = true;
    if (ui.gameOver) ui.gameOver.hidden = true;
    if (ui.newRecordStamp) ui.newRecordStamp.hidden = true;
    var tel = document.getElementById('runTelemetry');
    if (tel && tel.parentNode) tel.parentNode.removeChild(tel);
    if (ui.runState) ui.runState.textContent = 'LIVE';
    if (ui.statusText) ui.statusText.textContent = 'SIGNAL LIVE — KEEP MOVING';
    for (var i = 0; i < 3; i += 1) spawnEnemy();
    updateDomUi();
  }

  function spawnEnemy() {
    if (!state) return;
    var side = Math.floor(Math.random() * 4);
    var margin = 42;
    var x = side === 0 ? -margin : side === 1 ? ui.width + margin : Math.random() * ui.width;
    var y = side === 2 ? -margin : side === 3 ? ui.height + margin : Math.random() * ui.height;
    var roll = Math.random();
    var eliteChance = state.wave >= 3 ? Math.min(0.045 + (state.wave - 3) * 0.012, 0.14) : 0;
    var kind;
    if (Math.random() < eliteChance) {
      kind = 'elite';
    } else if (state.wave >= 2 && Math.random() < 0.15) {
      kind = 'artillery';
    } else {
      kind = roll < 0.16 + Math.min(0.1, state.wave * 0.012) ? 'rusher' : roll > 0.87 ? 'brute' : 'crawler';
    }
    var e;
    if (kind === 'elite') {
      e = { kind: kind, x: x, y: y, r: 19, hp: 190 + state.wave * 24, maxHp: 190 + state.wave * 24, speed: 43 + state.wave * 1.8, damage: 20 + state.wave * 1.3, color: '#75d1b0', touchCooldown: 0, phase: Math.random() * TAU, shootCd: 3.5, ringTriggered: false };
    } else if (kind === 'brute') {
      e = { kind: kind, x: x, y: y, r: 23, hp: 125 + state.wave * 16, maxHp: 125 + state.wave * 16, speed: 32 + state.wave * 1.4, damage: 25 + state.wave * 1.6, color: '#bd573f', touchCooldown: 0, phase: Math.random() * TAU };
    } else if (kind === 'rusher') {
      e = { kind: kind, x: x, y: y, r: 10, hp: 26 + state.wave * 5, maxHp: 26 + state.wave * 5, speed: 91 + state.wave * 3.2, damage: 9 + state.wave * 0.8, color: '#e1a644', touchCooldown: 0, phase: Math.random() * TAU, burstCd: 1.5 + Math.random() * 1.0, burstTime: 0, burstAngle: 0, trail: [] };
    } else if (kind === 'artillery') {
      e = {
        kind: kind,
        x: x,
        y: y,
        r: 16,
        hp: 85 + state.wave * 12,
        maxHp: 85 + state.wave * 12,
        speed: 28 + state.wave * 1.2,
        damage: 18 + state.wave,
        color: '#d69e2e',
        touchCooldown: 0,
        phase: Math.random() * TAU,
        timeAlive: 0,
        deployed: false,
        siegeTimer: 0,
        cooldown: 0,
        barrelAngle: 0
      };
    } else {
      e = { kind: kind, x: x, y: y, r: 14, hp: 43 + state.wave * 7, maxHp: 43 + state.wave * 7, speed: 51 + state.wave * 2.1, damage: 13 + state.wave, color: '#8d7861', touchCooldown: 0, phase: Math.random() * TAU };
    }
    state.enemies.push(e);
  }

  function spawnTitan() {
    if (!state) return;
    AudioFX.stormSiren();
    state.banner = 3.5;
    state.bannerText = 'WARNING // TITAN DETECTED';
    state.shake = Math.max(state.shake, 14);
    triggerHaptic([40, 40, 60, 40, 80]);
    logEvent('WARNING // TITAN DETECTED');
    if (ui && ui.statusText) ui.statusText.textContent = 'WARNING // TITAN DETECTED';

    var boundW = ui ? ui.width : state.width;
    var titanHp = 650 + (state.wave - 5) * 120;
    var titan = {
      kind: 'titan',
      x: boundW / 2,
      y: -40,
      r: 32,
      hp: titanHp,
      maxHp: titanHp,
      speed: 36,
      damage: 28 + state.wave * 1.5,
      color: '#e69535',
      touchCooldown: 0,
      phase: 0,
      shootCd: 2.8,
      shootAlt: false,
      phase2Triggered: false,
      spiralCd: 3.2,
      spiralAngle: 0,
      summonCd: 6.0,
      empTimer: 0
    };
    state.enemies.push(titan);
  }

  function spawnParticles(x, y, color, amount, speed, size) {
    amount = amount || 8;
    speed = speed || 130;
    size = size || 3;
    for (var i = 0; i < amount; i += 1) {
      var angle = Math.random() * TAU;
      var velocity = speed * (0.35 + Math.random() * 0.9);
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.25 + Math.random() * 0.5,
        maxLife: 0.75,
        size: size * (0.55 + Math.random() * 0.9),
        color: color,
        gravity: 24
      });
    }
    if (state.particles.length > 700) state.particles.splice(0, state.particles.length - 700);
  }

  function ejectCasing(p) {
    if (!state || !state.casings) return;
    var c = state.casings[state.casingIndex];
    state.casingIndex = (state.casingIndex + 1) % CASING_POOL_SIZE;
    c.active = true;
    c.x = p.x;
    c.y = p.y;
    var ejectAngle = p.aim - Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    var speed = 80 + Math.random() * 50;
    c.vx = Math.cos(ejectAngle) * speed;
    c.vy = Math.sin(ejectAngle) * speed;
    c.rot = Math.random() * TAU;
    c.vrot = (Math.random() - 0.5) * 18;
    c.life = 0.6;
    c.maxLife = 0.6;
  }

  function shoot() {
    var p = state.player;
    if (p.cooldown > 0) return;
    var aimX = input.mouse.x;
    var aimY = input.mouse.y;
    if (input.touchMode && state.enemies.length) {
      // ponytail: linear nearest-target scan; the enemy cap keeps it cheap, use a spatial hash only if mobile scale grows.
      var nearest = state.enemies[0];
      var nearestDistance = dist2(p.x, p.y, nearest.x, nearest.y);
      for (var ni = 1; ni < state.enemies.length; ni += 1) {
        var candidate = state.enemies[ni];
        var candidateDistance = dist2(p.x, p.y, candidate.x, candidate.y);
        if (candidateDistance < nearestDistance) { nearest = candidate; nearestDistance = candidateDistance; }
      }
      aimX = nearest.x;
      aimY = nearest.y;
    }
    var dx = aimX - p.x;
    var dy = aimY - p.y;
    var angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.035;
    p.aim = Math.atan2(dy, dx);
    var speed = p.bulletSpeed;
    if (state.stats) state.stats.shotsFired += 1;
    state.bullets.push({
      x: p.x + Math.cos(angle) * (p.r + 8),
      y: p.y + Math.sin(angle) * (p.r + 8),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: p.bulletSize,
      damage: p.damage * (p.overdrive > 0 ? OVERDRIVE_DAMAGE : 1),
      life: 1.25,
      trail: [],
      pierce: p.pierce || 0,
      bounces: p.bounces || 0,
      hits: [],
      ambush: (p.dashAmbushTimer || 0) > 0
    });
    p.cooldown = p.fireRate * (p.overdrive > 0 ? OVERDRIVE_COOLDOWN : 1);

    p.recoil = 1.0;
    p.x -= Math.cos(p.aim) * 1.4;
    p.y -= Math.sin(p.aim) * 1.4;
    var boundW = ui ? ui.width : state.width;
    var boundH = ui ? ui.height : state.height;
    p.x = clamp(p.x, p.r, boundW - p.r);
    p.y = clamp(p.y, p.r, boundH - p.r);

    ejectCasing(p);
    AudioFX.shoot();

    spawnParticles(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, '#f7d48a', 4, 90, 2);
    state.shake = Math.max(state.shake, 2.5);
  }

  function dash() {
    if (!state || state.over || state.paused || state.player.dashCooldown > 0) return;
    var p = state.player;
    var startX = p.x;
    var startY = p.y;
    addDecal(startX, startY, 5, 8, 0.35, '#141210');
    var dx = 0;
    var dy = 0;
    if (input.keys.has('w') || input.keys.has('arrowup')) dy -= 1;
    if (input.keys.has('s') || input.keys.has('arrowdown')) dy += 1;
    if (input.keys.has('a') || input.keys.has('arrowleft')) dx -= 1;
    if (input.keys.has('d') || input.keys.has('arrowright')) dx += 1;
    if (!dx && !dy && (input.gamepadX || input.gamepadY)) { dx = input.gamepadX; dy = input.gamepadY; }
    if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
    var length = Math.hypot(dx, dy) || 1;
    var boundW = ui ? ui.width : state.width;
    var boundH = ui ? ui.height : state.height;
    p.x = clamp(p.x + (dx / length) * 140, p.r, boundW - p.r);
    p.y = clamp(p.y + (dy / length) * 140, p.r, boundH - p.r);
    addDecal(p.x, p.y, 6, 8, 0.35, '#141210');
    triggerHaptic([15]);
    p.dashCooldown = 2.2;
    p.invulnerable = Math.max(p.invulnerable, 0.32);
    p.dashPulse = DASH_PULSE_DURATION;
    p.dashAmbushTimer = 0.6;
    AudioFX.dash();
    var hitCount = 0;
    var pulseRadius = p.shockwaveDash ? 125 : DASH_PULSE_RADIUS;
    var kbDistance = p.shockwaveDash ? 50 : 25;
    for (var di = state.enemies.length - 1; di >= 0; di -= 1) {
      var enemy = state.enemies[di];
      if (dist2(p.x, p.y, enemy.x, enemy.y) > pulseRadius * pulseRadius) continue;
      hitCount += 1;
      enemy.hp -= p.damage * 0.8;
      var kdx = enemy.x - p.x;
      var kdy = enemy.y - p.y;
      var kd = Math.hypot(kdx, kdy) || 1;
      enemy.x += (kdx / kd) * kbDistance;
      enemy.y += (kdy / kd) * kbDistance;
      spawnParticles(enemy.x, enemy.y, '#75d1b0', 7, 110, 2);
      if (enemy.hp <= 0) killEnemy(di);
    }
    if (hitCount >= 2 && !isReducedMotion()) {
      state.hitstop = Math.max(state.hitstop || 0, 0.035);
    }
    state.shake = Math.max(state.shake, 5);
    spawnParticles(p.x, p.y, '#75d1b0', 16, 180, 3);
  }

  function triggerEmp() {
    if (!state || state.over || state.paused) return;
    var p = state.player;
    if (p.energy < 50) return;
    p.energy -= 50;

    var boundW = ui ? ui.width : state.width;
    var boundH = ui ? ui.height : state.height;

    var empX = input.mouse.x;
    var empY = input.mouse.y;
    if (input.touchMode || !input.mouse || (input.gamepadX || input.gamepadY) || isNaN(empX) || isNaN(empY)) {
      empX = p.x + Math.cos(p.aim) * 85;
      empY = p.y + Math.sin(p.aim) * 85;
    }
    empX = clamp(empX, 20, boundW - 20);
    empY = clamp(empY, 20, boundH - 20);

    var empR = 140;

    AudioFX.emp();
    triggerHaptic([35, 20, 50]);
    state.shake = Math.max(state.shake, 10);

    state.shockRings.push({
      x: empX,
      y: empY,
      r: 12,
      maxR: empR,
      life: 0.35,
      maxLife: 0.35,
      color: '#5be7ff'
    });
    state.shockRings.push({
      x: empX,
      y: empY,
      r: 6,
      maxR: empR * 0.65,
      life: 0.22,
      maxLife: 0.22,
      color: '#ffffff'
    });

    spawnParticles(empX, empY, '#5be7ff', 24, 230, 3.5);
    spawnParticles(empX, empY, '#ffffff', 14, 160, 2);

    for (var bi = state.enemyBullets.length - 1; bi >= 0; bi -= 1) {
      var eb = state.enemyBullets[bi];
      if (dist2(eb.x, eb.y, empX, empY) <= empR * empR) {
        spawnParticles(eb.x, eb.y, '#5be7ff', 5, 95, 2);
        spawnParticles(eb.x, eb.y, '#bdf4ff', 3, 120, 1.5);
        state.enemyBullets.splice(bi, 1);
      }
    }

    var hitCount = 0;
    for (var ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
      var enemy = state.enemies[ei];
      var eDist2 = dist2(enemy.x, enemy.y, empX, empY);
      if (eDist2 <= (empR + enemy.r) * (empR + enemy.r)) {
        hitCount += 1;
        enemy.hp -= 35;
        if (state.stats) {
          state.stats.damageDealt += 35;
        }
        enemy.empTimer = 2.2;
        spawnParticles(enemy.x, enemy.y, '#5be7ff', 8, 130, 2.5);
        if (enemy.hp <= 0) {
          killEnemy(ei);
        }
      }
    }

    if (hitCount >= 2 && !isReducedMotion()) {
      state.hitstop = Math.max(state.hitstop || 0, 0.03);
    }

    logEvent('EMP BLAST // SECTOR DISRUPTED');
    if (ui && ui.statusText) ui.statusText.textContent = 'EMP BLAST DISCHARGED // SECTOR DISRUPTED';
  }

  function addXp(amount) {
    var p = state.player;
    state.xp += Math.max(1, Math.round(amount * p.xpMult));
    if (state.xp >= state.xpNext) {
      state.xp -= state.xpNext;
      state.level += 1;
      state.xpNext = Math.round(state.xpNext * 1.24 + 28);
      AudioFX.levelUp();
      state.paused = true;
      state.upgradeChoices = randomUpgradeChoices();
      renderUpgradePanel();
      spawnParticles(p.x, p.y, '#75d1b0', 18, 210, 3);
    }
  }

  function chooseUpgrade(index) {
    if (!state || !state.paused || !state.upgradeChoices[index]) return;
    var choice = state.upgradeChoices[index];
    choice.apply(state);
    if (!state.acquiredUpgrades) state.acquiredUpgrades = [];
    state.acquiredUpgrades.push(choice);
    state.upgradeChoices = [];
    state.paused = false;
    if (ui && ui.overlay) ui.overlay.hidden = true;
    spawnParticles(state.player.x, state.player.y, '#f5c76e', 14, 170, 3);
    updateDomUi();
  }

  function renderUpgradePanel() {
    var choices = state.upgradeChoices;
    var title = first(['[data-upgrade-title]', '.upgrade-title', 'h2', 'h3'], ui.overlay);
    if (title) title.textContent = 'CHOOSE YOUR EDGE';
    var existing = qa('button', ui.optionsNode);
    if (!ui.createdOverlay && existing.length >= choices.length) {
      choices.forEach(function (upgrade, index) {
        var button = existing[index];
        button.dataset.upgradeIndex = String(index);
        var strong = first(['.upgrade-copy strong', '[data-upgrade-name]', 'strong'], button);
        var small = first(['.upgrade-copy small', '[data-upgrade-text]', 'small'], button);
        if (strong) strong.textContent = upgrade.title;
        if (small) small.textContent = '[' + upgrade.category + '] ' + upgrade.text;
      });
      existing.slice(choices.length).forEach(function (button) { button.hidden = true; });
    } else {
      ui.optionsNode.innerHTML = '';
      choices.forEach(function (upgrade, index) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'upgrade-choice';
        button.dataset.upgradeIndex = String(index);
        var catColor = upgrade.category === 'OFFENSE' ? '#f0cf88' : upgrade.category === 'DEFENSE' ? '#ed6842' : '#75d1b0';
        button.innerHTML = '<span style="font-size:.72em;letter-spacing:1px;font-weight:700;color:' + catColor + ';">[' + upgrade.category + ']</span><strong>' + upgrade.title + '</strong><small>' + upgrade.text + '</small><em>' + (index + 1) + '</em>';
        var sm = button.querySelector('small');
        if (sm) sm.style.cssText = 'color:#d0c4ad;font-size:.85em;';
        var em = button.querySelector('em');
        if (em) em.style.cssText = 'position:absolute;right:10px;top:8px;color:#75d1b0;font-style:normal;font-size:.78em;';
        ui.optionsNode.appendChild(button);
      });
    }
    gamepadState.selectedUpgrade = 0;
    updateUpgradeSelectionUi();
    ui.overlay.hidden = false;
  }

  function getActiveGamepad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    var gamepads = navigator.getGamepads();
    if (!gamepads) return null;
    for (var i = 0; i < gamepads.length; i += 1) {
      var gp = gamepads[i];
      if (gp && gp.connected) return gp;
    }
    return null;
  }

  function isBtnPressed(btn) {
    if (!btn) return false;
    if (typeof btn === 'number') return btn > 0.5;
    return Boolean(btn.pressed || (typeof btn.value === 'number' && btn.value > 0.15));
  }

  function updateUpgradeSelectionUi() {
    if (!ui || !ui.optionsNode) return;
    var buttons = qa('button', ui.optionsNode);
    for (var i = 0; i < buttons.length; i += 1) {
      if (i === gamepadState.selectedUpgrade) {
        buttons[i].classList.add('is-gamepad-selected');
        if (buttons[i].focus) buttons[i].focus();
      } else {
        buttons[i].classList.remove('is-gamepad-selected');
      }
    }
  }

  function pollGamepad(dt) {
    var gp = getActiveGamepad();
    if (!gp || !state) return;

    var buttons = gp.buttons || [];
    var axes = gp.axes || [];

    function justPressed(idx) {
      var pressed = isBtnPressed(buttons[idx]);
      var wasPressed = Boolean(gamepadState.prevButtons[idx]);
      return pressed && !wasPressed;
    }

    // Upgrade Selection
    if (state.paused && state.upgradeChoices && state.upgradeChoices.length > 0) {
      if (gamepadState.navDebounce > 0) gamepadState.navDebounce -= dt;
      var upPressed = isBtnPressed(buttons[12]) || (axes.length > 1 && axes[1] < -0.5);
      var downPressed = isBtnPressed(buttons[13]) || (axes.length > 1 && axes[1] > 0.5);
      if (gamepadState.navDebounce <= 0) {
        if (upPressed) {
          gamepadState.selectedUpgrade = (gamepadState.selectedUpgrade - 1 + state.upgradeChoices.length) % state.upgradeChoices.length;
          gamepadState.navDebounce = 0.22;
          updateUpgradeSelectionUi();
        } else if (downPressed) {
          gamepadState.selectedUpgrade = (gamepadState.selectedUpgrade + 1) % state.upgradeChoices.length;
          gamepadState.navDebounce = 0.22;
          updateUpgradeSelectionUi();
        }
      }
      if (justPressed(0)) chooseUpgrade(gamepadState.selectedUpgrade);
      else if (justPressed(2)) chooseUpgrade(0);
      else if (justPressed(3)) chooseUpgrade(1);
      else if (justPressed(1)) chooseUpgrade(2);

      for (var bi = 0; bi < buttons.length; bi += 1) gamepadState.prevButtons[bi] = isBtnPressed(buttons[bi]);
      return;
    }

    // Start Screen / Game Over
    if (ui && ui.startScreen && !ui.startScreen.hidden) {
      if (justPressed(0) || justPressed(9)) beginRun();
      for (var sbi = 0; sbi < buttons.length; sbi += 1) gamepadState.prevButtons[sbi] = isBtnPressed(buttons[sbi]);
      return;
    }

    if (state.over) {
      if (justPressed(0) || justPressed(9)) restart();
      for (var obi = 0; obi < buttons.length; obi += 1) gamepadState.prevButtons[obi] = isBtnPressed(buttons[obi]);
      return;
    }

    // Pause Toggle / Navigation
    if (state.paused) {
      if (justPressed(9) || justPressed(1)) {
        togglePause();
        for (var pbi = 0; pbi < buttons.length; pbi += 1) gamepadState.prevButtons[pbi] = isBtnPressed(buttons[pbi]);
        return;
      }

      if (ui && ui.pauseModal && !ui.pauseModal.hidden) {
        if (gamepadState.navDebounce > 0) gamepadState.navDebounce -= dt;
        var leftPressed = isBtnPressed(buttons[14]) || (axes.length > 0 && axes[0] < -0.5);
        var rightPressed = isBtnPressed(buttons[15]) || (axes.length > 0 && axes[0] > 0.5);
        var upPressed = isBtnPressed(buttons[12]) || (axes.length > 1 && axes[1] < -0.5);
        var downPressed = isBtnPressed(buttons[13]) || (axes.length > 1 && axes[1] > 0.5);

        if (gamepadState.navDebounce <= 0) {
          if (leftPressed) {
            gamepadState.navDebounce = 0.22;
            var tabOrder = ['system', 'build', 'controls'];
            var curIdx = tabOrder.indexOf(currentPauseTab);
            var nextIdx = (curIdx - 1 + tabOrder.length) % tabOrder.length;
            switchPauseTab(tabOrder[nextIdx]);
          } else if (rightPressed) {
            gamepadState.navDebounce = 0.22;
            var tabOrder2 = ['system', 'build', 'controls'];
            var curIdx2 = tabOrder2.indexOf(currentPauseTab);
            var nextIdx2 = (curIdx2 + 1) % tabOrder2.length;
            switchPauseTab(tabOrder2[nextIdx2]);
          } else if (downPressed || upPressed) {
            gamepadState.navDebounce = 0.22;
            var focusables = qa('button:not([hidden]):not([disabled]), input:not([hidden]):not([disabled])', ui.pauseModal);
            if (focusables.length > 0) {
              var activeEl = document.activeElement;
              var fIdx = focusables.indexOf(activeEl);
              var nextF = downPressed ? (fIdx + 1) % focusables.length : (fIdx - 1 + focusables.length) % focusables.length;
              if (focusables[nextF] && focusables[nextF].focus) focusables[nextF].focus();
            }
          }
        }
        if (justPressed(0)) {
          var activeEl2 = document.activeElement;
          if (activeEl2 && ui.pauseModal.contains(activeEl2) && typeof activeEl2.click === 'function') {
            activeEl2.click();
          }
        }
      }
      for (var pbi2 = 0; pbi2 < buttons.length; pbi2 += 1) gamepadState.prevButtons[pbi2] = isBtnPressed(buttons[pbi2]);
      return;
    }

    // Pause Toggle: Start / Menu (buttons[9])
    if (justPressed(9)) togglePause();

    // Left stick: movement (axes[0], axes[1]) with radial deadzone 0.16
    var lx = axes.length > 0 ? axes[0] : 0;
    var ly = axes.length > 1 ? axes[1] : 0;
    if (Math.hypot(lx, ly) > 0.16) {
      input.gamepadX = lx;
      input.gamepadY = ly;
    } else {
      input.gamepadX = 0;
      input.gamepadY = 0;
    }

    // Right stick: aim (axes[2], axes[3]) with radial deadzone 0.18
    var rx = axes.length > 2 ? axes[2] : 0;
    var ry = axes.length > 3 ? axes[3] : 0;
    if (Math.hypot(rx, ry) > 0.18) {
      var rAngle = Math.atan2(ry, rx);
      state.player.aim = rAngle;
      input.mouse.x = state.player.x + Math.cos(rAngle) * 120;
      input.mouse.y = state.player.y + Math.sin(rAngle) * 120;
    }

    // Fire button: RT (buttons[7]) or RB (buttons[5])
    if (isBtnPressed(buttons[7]) || isBtnPressed(buttons[5])) shoot();

    // EMP button: LB (buttons[4]) or B (buttons[1])
    if (justPressed(4) || justPressed(1)) triggerEmp();

    // Dash button: LT (buttons[6]) or A (buttons[0])
    if (justPressed(6) || justPressed(0)) dash();

    for (var k = 0; k < buttons.length; k += 1) gamepadState.prevButtons[k] = isBtnPressed(buttons[k]);
  }

  function killEnemy(index) {
    var e = state.enemies[index];
    if (!e) return;
    state.enemies.splice(index, 1);
    state.kills += 1;
    if (isStormFront()) state.stormKills = (state.stormKills || 0) + 1;
    var elite = e.kind === 'elite';
    var isTitan = e.kind === 'titan';
    var baseScore = elite ? 180 : e.kind === 'brute' ? 90 : e.kind === 'artillery' ? 60 : e.kind === 'rusher' ? 35 : isTitan ? 0 : 20;
    state.combo = state.comboTimer > 0 ? Math.min(MAX_COMBO, state.combo + 1) : 1;
    if (state.stats && state.combo > state.stats.maxCombo) {
      state.stats.maxCombo = state.combo;
    }
    state.comboTimer = COMBO_WINDOW;
    state.score += Math.round(baseScore * (1 + (state.combo - 1) * 0.25));

    if (isTitan) {
      state.score += 800;
      state.shake = Math.max(state.shake, 16);
      state.banner = 4.0;
      state.bannerText = 'TITAN NEUTRALIZED // SECTOR SECURED';
      if (ui && ui.statusText) ui.statusText.textContent = 'TITAN NEUTRALIZED // SECTOR SECURED';
      logEvent('TITAN NEUTRALIZED // SECTOR SECURED');
      AudioFX.blast();
      triggerHaptic([30, 40, 50, 60, 80]);
      if (!isReducedMotion()) {
        state.hitstop = Math.max(state.hitstop || 0, 0.055);
      }
      state.orbs.push({ kind: 'overdrive', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 95, vy: (Math.random() - 0.5) * 95, r: 11, value: 0, life: 25 });
      state.orbs.push({ kind: 'repair', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 85, vy: (Math.random() - 0.5) * 85, r: 10, value: 0, life: 25 });
      for (var gsi = 0; gsi < 3; gsi += 1) {
        state.orbs.push({
          kind: 'scrap',
          x: e.x + (Math.random() - 0.5) * 35,
          y: e.y + (Math.random() - 0.5) * 35,
          vx: (Math.random() - 0.5) * 110,
          vy: (Math.random() - 0.5) * 110,
          r: 12,
          value: 60,
          life: 35
        });
      }
      addDecal(e.x, e.y, 28, 20, 0.45, '#1b1715');
      spawnParticles(e.x, e.y, '#e69535', 40, 260, 5);
      spawnParticles(e.x, e.y, '#ff4d2e', 25, 200, 4);
      spawnParticles(e.x, e.y, '#ffd27d', 20, 160, 3);
    } else {
      AudioFX.kill(state.combo);
      if (!isReducedMotion()) {
        var freezeDuration = elite ? 0.045 : (e.kind === 'brute' || e.kind === 'artillery') ? 0.025 : state.combo >= 6 ? 0.020 : 0;
        if (freezeDuration > 0) {
          state.hitstop = Math.max(state.hitstop || 0, freezeDuration);
        }
      }
    }
    if (!state.bountyClaimed && state.bountyTarget > 0) {
      state.bountyKills += 1;
      if (state.bountyKills >= state.bountyTarget) {
        state.bountyClaimed = true;
        state.score += state.bountyReward;
        var surgeDuration = Math.max(state.player.overdrive, BOUNTY_SURGE_DURATION);
        state.player.overdrive = surgeDuration;
        state.banner = Math.max(state.banner, 2.1);
        if (ui && ui.statusText) ui.statusText.textContent = 'BOUNTY CLEAR +' + state.bountyReward + ' SCORE // SURGE ' + surgeDuration.toFixed(1) + 's';
        logEvent('BOUNTY SECURED // SURGE ONLINE');
        spawnParticles(e.x, e.y, '#f0cf88', 12, 180, 3);
      }
    }
    var decalR = elite ? 18 : (e.kind === 'brute' || e.kind === 'artillery') ? 15 : e.kind === 'rusher' ? 10 : 8;
    var decalLife = 12 + Math.random() * 6;
    addDecal(e.x, e.y, decalR, decalLife, 0.38, '#1b1715');
    if (elite) {
      triggerHaptic([25, 35, 45]);
    }
    if (!isTitan) {
      state.orbs.push({ kind: 'scrap', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, r: elite ? 9 : e.kind === 'artillery' ? 8 : 7, value: elite ? 40 : e.kind === 'brute' ? 34 : e.kind === 'artillery' ? 24 : e.kind === 'rusher' ? 13 : 10, life: 28 });
      if (elite || e.kind === 'brute' || (e.kind === 'artillery' && Math.random() < 0.15)) state.orbs.push({ kind: 'repair', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 85, vy: (Math.random() - 0.5) * 85, r: 10, value: 0, life: 22 });
      if (elite) state.orbs.push({ kind: 'overdrive', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 95, vy: (Math.random() - 0.5) * 95, r: 11, value: 0, life: 18 });
    }
    spawnParticles(e.x, e.y, e.color, elite ? 26 : (e.kind === 'brute' || e.kind === 'artillery') ? 22 : 11, elite ? 260 : (e.kind === 'brute' || e.kind === 'artillery') ? 220 : 150, elite ? 5 : (e.kind === 'brute' || e.kind === 'artillery') ? 5 : 3);
    state.shake = Math.max(state.shake, elite ? 10 : (e.kind === 'brute' || e.kind === 'artillery') ? 7 : 3);
  }

  function recordBestScore() {
    if (!state || state.score <= state.bestScore) return;
    state.bestScore = state.score;
    writeBestScore(state.bestScore);
  }

  function triggerReactiveArmor() {
    if (!state) return;
    var p = state.player;
    var pulseR = 75;
    state.shockRings.push({ x: p.x, y: p.y, r: 8, maxR: pulseR, life: 0.22, maxLife: 0.22, color: '#f0cf88' });
    spawnParticles(p.x, p.y, '#f0cf88', 16, 160, 3);
    state.shake = Math.max(state.shake, 6);
    for (var ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
      var enemy = state.enemies[ei];
      if (dist2(p.x, p.y, enemy.x, enemy.y) <= (pulseR + enemy.r) * (pulseR + enemy.r)) {
        enemy.hp -= 30;
        var pdx = enemy.x - p.x;
        var pdy = enemy.y - p.y;
        var pd = Math.hypot(pdx, pdy) || 1;
        enemy.x += (pdx / pd) * 30;
        enemy.y += (pdy / pd) * 30;
        spawnParticles(enemy.x, enemy.y, '#f0cf88', 6, 110, 2);
        if (enemy.hp <= 0) killEnemy(ei);
      }
    }
  }

  function triggerTeslaCoil(orb) {
    if (!state || !state.enemies.length) return;
    var sorted = state.enemies.slice().sort(function (a, b) {
      return dist2(orb.x, orb.y, a.x, a.y) - dist2(orb.x, orb.y, b.x, b.y);
    });
    var targets = sorted.slice(0, 2);
    targets.forEach(function (tgt) {
      tgt.hp -= 22;
      state.lightningArcs.push({
        x1: orb.x,
        y1: orb.y,
        x2: tgt.x,
        y2: tgt.y,
        life: 0.1,
        maxLife: 0.1
      });
      spawnParticles(tgt.x, tgt.y, '#a8f5e5', 6, 110, 2);
      if (tgt.hp <= 0) {
        var idx = state.enemies.indexOf(tgt);
        if (idx !== -1) killEnemy(idx);
      }
    });
    AudioFX.hit();
  }

  function explodeCore(core, index) {
    if (!state) return;
    if (state.stats) state.stats.coresDetonated += 1;
    state.volatileCores.splice(index, 1);
    var p = state.player;
    var blastR = 130;
    addDecal(core.x, core.y, 18, 16, 0.42, '#1b1715');
    triggerHaptic([25, 35, 45]);
    for (var ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
      var enemy = state.enemies[ei];
      if (dist2(core.x, core.y, enemy.x, enemy.y) <= (blastR + enemy.r) * (blastR + enemy.r)) {
        enemy.hp -= 90;
        var kdx = enemy.x - core.x;
        var kdy = enemy.y - core.y;
        var kd = Math.hypot(kdx, kdy) || 1;
        enemy.x += (kdx / kd) * 45;
        enemy.y += (kdy / kd) * 45;
        spawnParticles(enemy.x, enemy.y, '#f5a623', 8, 160, 3);
        if (enemy.hp <= 0) killEnemy(ei);
      }
    }
    if (dist2(core.x, core.y, p.x, p.y) <= (blastR + p.r) * (blastR + p.r)) {
      if (p.invulnerable <= 0) {
        p.hp -= 15;
        p.invulnerable = 0.5;
        AudioFX.hurt();
        triggerHaptic([45]);
        state.shake = Math.max(state.shake, 8);
        state.hurtFlash = 0.45;
        spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
        if (isStormFront()) state.stormHurt = true;
        if (p.reactiveArmor) triggerReactiveArmor();
        if (p.hp <= 0) triggerGameOver();
      }
    }
    state.shake = Math.max(state.shake, 14);
    state.shockRings.push({ x: core.x, y: core.y, r: 8, maxR: blastR, life: 0.35, maxLife: 0.35, color: '#f5a623' });
    spawnParticles(core.x, core.y, '#f5a623', 28, 250, 4);
    spawnParticles(core.x, core.y, '#ffd27d', 16, 170, 3);
    AudioFX.blast();
    logEvent('VOLATILE CORE DETONATED');
  }

  function triggerGameOver() {
    if (!state || state.over) return;
    state.player.hp = 0;
    state.over = true;
    AudioFX.setLowpass(0);
    var previousBest = state.bestScore;
    recordBestScore();
    finishAccountRun();
    input.mouse.down = false;
    state.isNewRecord = (state.score > previousBest && state.score > 0);
    state.deathSequenceTimer = 0.55;
    if (ui && ui.gameOver) ui.gameOver.hidden = true;
  }

  function fireArtillery(e) {
    if (!state) return;
    var p = state.player;
    var boundW = ui ? ui.width : state.width;
    var boundH = ui ? ui.height : state.height;
    // 預測落點公式：P_target = P_player + v_player * (1.2 * 0.85) + 微隨機偏移(±15px)
    var pvx = p.vx || 0;
    var pvy = p.vy || 0;
    var offsetX = (Math.random() - 0.5) * 30;
    var offsetY = (Math.random() - 0.5) * 30;
    var targetX = clamp(p.x + pvx * (1.2 * 0.85) + offsetX, 46, boundW - 46);
    var targetY = clamp(p.y + pvy * (1.2 * 0.85) + offsetY, 46, boundH - 46);

    state.artilleryTargets.push({
      x: targetX,
      y: targetY,
      r: 46,
      timer: 1.2,
      maxTimer: 1.2,
      wave: state.wave,
      state: 'warning',
      damageTickTimer: 0
    });

    AudioFX.mortarLaunch();
    var bAngle = Math.atan2(targetY - e.y, targetX - e.x);
    e.barrelAngle = bAngle;
    var mx = e.x + Math.cos(bAngle) * (e.r + 10);
    var my = e.y + Math.sin(bAngle) * (e.r + 10);
    spawnParticles(mx, my, '#f5a623', 8, 120, 3);
    spawnParticles(mx, my, '#d69e2e', 5, 80, 2);
  }

  function update(dt) {
    if (!state || state.paused) return;
    if (state.over) {
      if (state.deathSequenceTimer > 0) {
        state.deathSequenceTimer = Math.max(0, state.deathSequenceTimer - dt);
        if (state.deathSequenceTimer === 0) {
          if (ui && ui.gameOver) ui.gameOver.hidden = false;
          if (ui && ui.newRecordStamp) ui.newRecordStamp.hidden = !state.isNewRecord;
          updateDomUi();
        }
      }
      return;
    }
    if (isReducedMotion()) state.hitstop = 0;
    if (state.hitstop > 0) {
      var freeze = Math.min(dt, state.hitstop);
      state.hitstop -= freeze;
      dt -= freeze;
    }
    if (dt <= 0) { updateDomUi(); return; }

    var p = state.player;
    var boundW = ui ? ui.width : state.width;
    var boundH = ui ? ui.height : state.height;

    p.energy = Math.min(p.maxEnergy, (p.energy || 0) + 2.0 * dt);

    state.waveTime += dt;
    state.banner = Math.max(0, state.banner - dt);
    state.shake = Math.max(0, state.shake - dt * 18);
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 3);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.recoil = Math.max(0, (p.recoil || 0) - dt * 16);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.dashPulse = Math.max(0, p.dashPulse - dt);
    p.dashAmbushTimer = Math.max(0, (p.dashAmbushTimer || 0) - dt);
    p.overdrive = Math.max(0, p.overdrive - dt);
    if (p.slowTimer > 0) p.slowTimer -= dt;
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer === 0) state.combo = 0;

    if (p.hp / p.maxHp < 0.35 && !state.over) {
      AudioFX.setLowpass(1400);
      state.heartbeatTimer = (state.heartbeatTimer || 0) - dt;
      if (state.heartbeatTimer <= 0) {
        AudioFX.playHeartbeat();
        state.heartbeatTimer = 0.95;
      }
    } else {
      AudioFX.setLowpass(0);
      state.heartbeatTimer = 0;
    }

    if (isStormFront() && !state.stormAlerted && !state.over) {
      state.stormAlerted = true;
      AudioFX.stormSiren();
    }

    // Boss spawn check for Wave 5 and 10
    if ((state.wave === 5 || state.wave === 10) && state.waveTime >= 8 && !state.bossSpawned) {
      state.bossSpawned = true;
      spawnTitan();
    }

    if (state.waveTime >= WAVE_LENGTH) {
      if (!state.stormHurt && (state.stormKills || 0) >= 3) {
        state.score += 350;
        state.player.overdrive = Math.max(state.player.overdrive, 3.5);
        state.banner = 2.8;
        state.bannerText = 'STORM BREAKER // SURGE UNLOCKED';
        if (ui && ui.statusText) ui.statusText.textContent = 'STORM BREAKER // SURGE UNLOCKED';
        logEvent('STORM BREAKER // SURGE UNLOCKED');
        AudioFX.pickup('overdrive');
        spawnParticles(p.x, p.y, '#75d1b0', 25, 240, 4);
      } else {
        state.bannerText = '';
      }
      state.stormKills = 0;
      state.stormHurt = false;
      state.coreSpawnTime = 8 + Math.random() * 8;
      state.coreSpawned = false;
      state.bossSpawned = false;

      state.waveTime -= WAVE_LENGTH;
      state.wave += 1;
      state.stormAlerted = false;
      state.bountyTarget = 5 + state.wave * 2;
      state.bountyKills = 0;
      state.bountyReward = 120 + state.wave * 40;
      state.bountyClaimed = false;
      logEvent('WAVE ' + String(state.wave).padStart(2, '0') + ' // BOUNTY RESET');
      state.banner = Math.max(state.banner, 2.3);
      spawnParticles(p.x, p.y, '#e0a84e', 24, 230, 3);
      for (var wi = 0; wi < Math.min(3, 1 + Math.floor(state.wave / 4)); wi += 1) spawnEnemy();
    }

    // Core spawn check
    if (!state.coreSpawned && state.waveTime >= state.coreSpawnTime) {
      state.coreSpawned = true;
      var cMargin = 60;
      var cx = cMargin + Math.random() * (boundW - cMargin * 2);
      var cy = cMargin + Math.random() * (boundH - cMargin * 2);
      state.volatileCores.push({ x: cx, y: cy, r: 12, hp: 30, maxHp: 30, rot: 0 });
      spawnParticles(cx, cy, '#f5a623', 8, 100, 2);
    }
    for (var vci = 0; vci < state.volatileCores.length; vci += 1) {
      state.volatileCores[vci].rot += dt * 2.5;
    }

    var mx = 0;
    var my = 0;
    if (input.keys.has('w') || input.keys.has('arrowup')) my -= 1;
    if (input.keys.has('s') || input.keys.has('arrowdown')) my += 1;
    if (input.keys.has('a') || input.keys.has('arrowleft')) mx -= 1;
    if (input.keys.has('d') || input.keys.has('arrowright')) mx += 1;
    if (input.gamepadX || input.gamepadY) {
      mx += input.gamepadX;
      my += input.gamepadY;
    }
    var moveLength = Math.hypot(mx, my);
    if (moveLength > 0) {
      var moveScale = Math.min(1, moveLength);
      var effectiveSpeed = p.speed * (p.slowTimer > 0 ? 0.55 : 1);
      p.vx = (mx / moveLength) * moveScale * effectiveSpeed;
      p.vy = (my / moveLength) * moveScale * effectiveSpeed;
      p.x = clamp(p.x + p.vx * dt, p.r, boundW - p.r);
      p.y = clamp(p.y + p.vy * dt, p.r, boundH - p.r);
    } else {
      p.vx = 0;
      p.vy = 0;
    }
    var aimDx = input.mouse.x - p.x;
    var aimDy = input.mouse.y - p.y;
    if (aimDx || aimDy) p.aim = Math.atan2(aimDy, aimDx);
    if (input.mouse.down) shoot();

    state.spawnTimer -= dt;
    var enemyCap = Math.min(95, 5 + state.wave * 4);
    if (state.spawnTimer <= 0 && state.enemies.length < enemyCap) {
      spawnEnemy();
      state.spawnTimer = Math.max(0.24, 1.08 - state.wave * 0.045) * (0.78 + Math.random() * 0.38) * (isStormFront() ? STORM_SPAWN_FACTOR : 1);
    }

    for (var bi = state.bullets.length - 1; bi >= 0; bi -= 1) {
      var b = state.bullets[bi];
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 4) b.trail.shift();
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.bounces > 0) {
        var bouncedX = false;
        var normX = 0;
        if ((b.x - b.r <= 0 && b.vx < 0)) {
          b.vx = -b.vx * 0.9;
          b.vy *= 0.9;
          b.x = clamp(b.x, b.r, boundW - b.r);
          b.bounces -= 1;
          bouncedX = true;
          normX = 1;
        } else if ((b.x + b.r >= boundW && b.vx > 0)) {
          b.vx = -b.vx * 0.9;
          b.vy *= 0.9;
          b.x = clamp(b.x, b.r, boundW - b.r);
          b.bounces -= 1;
          bouncedX = true;
          normX = -1;
        }
        if (bouncedX) {
          var normAngleX = normX > 0 ? 0 : Math.PI;
          for (var rsi = 0; rsi < 6; rsi += 1) {
            var sAngle = normAngleX + (Math.random() - 0.5) * 1.5;
            var sSpeed = 70 + Math.random() * 90;
            state.particles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(sAngle) * sSpeed,
              vy: Math.sin(sAngle) * sSpeed,
              life: 0.15 + Math.random() * 0.25,
              maxLife: 0.4,
              size: 2.4,
              color: '#ffe7a4',
              gravity: 12
            });
          }
          if (state.opticalFlashes) {
            state.opticalFlashes.push({
              x: b.x,
              y: b.y,
              nx: normX,
              ny: 0,
              r: b.r * 2.8,
              life: 0.1,
              maxLife: 0.1,
              color: '#fff4bd'
            });
          }
        }

        var bouncedY = false;
        var normY = 0;
        if ((b.y - b.r <= 0 && b.vy < 0)) {
          b.vy = -b.vy * 0.9;
          b.vx *= 0.9;
          b.y = clamp(b.y, b.r, boundH - b.r);
          b.bounces -= 1;
          bouncedY = true;
          normY = 1;
        } else if ((b.y + b.r >= boundH && b.vy > 0)) {
          b.vy = -b.vy * 0.9;
          b.vx *= 0.9;
          b.y = clamp(b.y, b.r, boundH - b.r);
          b.bounces -= 1;
          bouncedY = true;
          normY = -1;
        }
        if (bouncedY) {
          var normAngleY = normY > 0 ? Math.PI / 2 : -Math.PI / 2;
          for (var rsi2 = 0; rsi2 < 6; rsi2 += 1) {
            var sAngle2 = normAngleY + (Math.random() - 0.5) * 1.5;
            var sSpeed2 = 70 + Math.random() * 90;
            state.particles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(sAngle2) * sSpeed2,
              vy: Math.sin(sAngle2) * sSpeed2,
              life: 0.15 + Math.random() * 0.25,
              maxLife: 0.4,
              size: 2.4,
              color: '#ffe7a4',
              gravity: 12
            });
          }
          if (state.opticalFlashes) {
            state.opticalFlashes.push({
              x: b.x,
              y: b.y,
              nx: 0,
              ny: normY,
              r: b.r * 2.8,
              life: 0.1,
              maxLife: 0.1,
              color: '#fff4bd'
            });
          }
        }
      }

      var hitSomething = false;

      for (var cIdx = state.volatileCores.length - 1; cIdx >= 0; cIdx -= 1) {
        var cTarget = state.volatileCores[cIdx];
        if (dist2(b.x, b.y, cTarget.x, cTarget.y) <= (b.r + cTarget.r) * (b.r + cTarget.r)) {
          cTarget.hp -= b.damage;
          if (state.stats) {
            state.stats.shotsHit += 1;
            state.stats.damageDealt += b.damage;
          }
          spawnParticles(b.x, b.y, '#f5a623', 4, 80, 2);
          AudioFX.hit();
          if (cTarget.hp <= 0) {
            explodeCore(cTarget, cIdx);
          }
          if (b.pierce > 0) {
            b.pierce -= 1;
            b.damage *= 0.7;
          } else {
            hitSomething = true;
          }
          break;
        }
      }

      if (!hitSomething) {
        for (var ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
          var enemy = state.enemies[ei];
          if (b.hits && b.hits.indexOf(enemy) !== -1) continue;
          if (dist2(b.x, b.y, enemy.x, enemy.y) <= (b.r + enemy.r) * (b.r + enemy.r)) {
            if (!b.hits) b.hits = [];
            b.hits.push(enemy);

            var isCrit = false;
            if (b.ambush) {
              isCrit = true;
            } else if (p.highCaliber && Math.random() < 0.20) {
              isCrit = true;
            } else if (enemy.vx !== undefined && enemy.vy !== undefined) {
              var bSpeed = Math.hypot(b.vx, b.vy);
              var eSpeed = Math.hypot(enemy.vx, enemy.vy);
              if (bSpeed > 0 && eSpeed > 0) {
                var dot = (b.vx * enemy.vx + b.vy * enemy.vy) / (bSpeed * eSpeed);
                if (dot > 0.35) isCrit = true;
              }
            }

            var critMult = p.highCaliber ? 2.2 : 1.75;
            var damageDealt = isCrit ? b.damage * critMult : b.damage;
            enemy.hp -= damageDealt;

            if (state.stats) {
              state.stats.shotsHit += 1;
              state.stats.damageDealt += damageDealt;
              if (isCrit) state.stats.crits += 1;
            }

            if (isCrit) {
              p.energy = Math.min(p.maxEnergy, (p.energy || 0) + 4.0);
              var bLen = Math.hypot(b.vx, b.vy) || 1;
              enemy.x += (b.vx / bLen) * 6;
              enemy.y += (b.vy / bLen) * 6;
              spawnParticles(enemy.x, enemy.y, '#fbda8a', 8, 140, 3);
              AudioFX.critHit();
            } else {
              spawnParticles(b.x, b.y, '#f7d48a', 4, 80, 2);
              if (enemy.hp <= 0) {} else AudioFX.hit();
            }

            if (enemy.hp <= 0) {
              killEnemy(ei);
            }

            if (b.pierce > 0) {
              b.pierce -= 1;
              b.damage *= 0.7;
              state.shockRings.push({
                x: enemy.x,
                y: enemy.y,
                r: 6,
                maxR: 28,
                life: 0.16,
                maxLife: 0.16,
                color: '#a8f5e5'
              });
              var backAngle = Math.atan2(b.vy, b.vx) + Math.PI;
              for (var pji = 0; pji < 5; pji += 1) {
                var jetAngle = backAngle + (Math.random() - 0.5) * 0.45;
                var jetSpeed = 150 + Math.random() * 110;
                state.particles.push({
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(jetAngle) * jetSpeed,
                  vy: Math.sin(jetAngle) * jetSpeed,
                  life: 0.15 + Math.random() * 0.15,
                  maxLife: 0.3,
                  size: 2.5,
                  color: '#a8f5e5',
                  gravity: 6
                });
              }
            } else {
              hitSomething = true;
            }
            break;
          }
        }
      }

      if (hitSomething || b.life <= 0 || b.x < -60 || b.y < -60 || b.x > boundW + 60 || b.y > boundH + 60) {
        state.bullets.splice(bi, 1);
      }
    }

    var magnetReach = p.magnetRadius || 165;
    for (var oi = state.orbs.length - 1; oi >= 0; oi -= 1) {
      var orb = state.orbs[oi];
      var odx = p.x - orb.x;
      var ody = p.y - orb.y;
      var od = Math.hypot(odx, ody) || 1;
      if (od < magnetReach) {
        var pull = (1 - od / magnetReach) * 520;
        orb.vx += (odx / od) * pull * dt;
        orb.vy += (ody / od) * pull * dt;
      }
      orb.vx *= Math.pow(0.08, dt);
      orb.vy *= Math.pow(0.08, dt);
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      if (od < p.r + orb.r + 5) {
        if (p.teslaCoil && state.enemies.length > 0) {
          triggerTeslaCoil(orb);
        }
        if (orb.kind === 'overdrive') {
          var dur = OVERDRIVE_DURATION + (p.overdriveDurationBonus || 0);
          p.overdrive = dur;
          AudioFX.pickup('overdrive');
          spawnParticles(orb.x, orb.y, '#f0cf88', 14, 160, 3);
        } else if (orb.kind === 'repair') {
          var healed = Math.max(0, Math.min(REPAIR_HEAL, p.maxHp - p.hp));
          p.hp += healed;
          AudioFX.pickup('repair');
          if (healed > 0) {
            if (ui.statusText) ui.statusText.textContent = 'REPAIR SCRAP +' + Math.round(healed) + ' HULL';
            logEvent('REPAIR SCRAP +' + Math.round(healed) + ' HULL');
          } else {
            state.score += REPAIR_OVERFLOW_SCORE;
            if (ui.statusText) ui.statusText.textContent = 'REPAIR SCRAP FULL +' + REPAIR_OVERFLOW_SCORE + ' SCORE';
            logEvent('REPAIR SCRAP FULL +' + REPAIR_OVERFLOW_SCORE + ' SCORE');
          }
          spawnParticles(orb.x, orb.y, '#ed6842', 12, 145, 3);
        } else {
          addXp(orb.value);
          p.energy = Math.min(p.maxEnergy, (p.energy || 0) + 3.5);
          AudioFX.pickup('scrap');
          spawnParticles(orb.x, orb.y, '#75d1b0', 6, 90, 2);
        }
        state.orbs.splice(oi, 1);
      } else if (orb.life <= 0) state.orbs.splice(oi, 1);
    }

    for (var j = state.enemies.length - 1; j >= 0; j -= 1) {
      var e = state.enemies[j];
      var dx = p.x - e.x;
      var dy = p.y - e.y;
      var d = Math.hypot(dx, dy) || 1;
      var speed = e.speed * (e.kind === 'rusher' ? 1 + Math.sin(state.waveTime * 5 + e.phase) * 0.08 : e.kind === 'elite' ? 1 + Math.sin(state.waveTime * 3 + e.phase) * 0.12 : 1);

      var empFrozen = false;
      if (e.empTimer > 0) {
        e.empTimer -= dt;
        speed *= 0.3;
        empFrozen = true;
        if (Math.random() < 0.25) {
          spawnParticles(e.x, e.y, '#5be7ff', 2, 70, 1.8);
        }
      }

      if (e.kind === 'rusher') {
        if (e.burstCd === undefined) { e.burstCd = 1.5 + Math.random() * 1.0; e.burstTime = 0; }
        if (!empFrozen) {
          if (e.burstTime > 0) {
            e.burstTime -= dt;
            speed = e.speed * 1.55;
            if (e.burstAngle !== undefined) {
              dx = Math.cos(e.burstAngle);
              dy = Math.sin(e.burstAngle);
              d = 1;
            }
            if (e.burstTime <= 0) {
              e.burstCd = 2.4;
            }
          } else if (e.burstCd > 0) {
            e.burstCd -= dt;
            if (e.burstCd <= 0.35 && e.burstCd > 0) {
              speed = e.speed * 0.25;
              e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
            }
            if (e.burstCd <= 0) {
              e.burstTime = 0.35;
              e.burstAngle = Math.atan2(p.y - e.y, p.x - e.x);
            }
          }
        }
      } else if (e.kind === 'artillery') {
        e.timeAlive = (e.timeAlive || 0) + dt;
        var distToP = Math.hypot(p.x - e.x, p.y - e.y);
        e.barrelAngle = Math.atan2(p.y - e.y, p.x - e.x);
        if (!e.deployed) {
          if ((distToP >= 180 && distToP <= 340) || e.timeAlive > 4) {
            e.deployed = true;
            e.siegeTimer = 0.9;
            e.cooldown = 0;
            speed = 0;
          }
        } else {
          speed = 0;
          if (!empFrozen) {
            if (e.siegeTimer > 0) {
              e.siegeTimer -= dt;
              if (e.siegeTimer <= 0) {
                fireArtillery(e);
                e.cooldown = 3.8;
              }
            } else if (e.cooldown > 0) {
              e.cooldown -= dt;
              if (e.cooldown <= 0) {
                fireArtillery(e);
                e.cooldown = 3.8;
              }
            }
          }
        }
      }

      e.vx = speed > 0 ? (dx / d) * speed : 0;
      e.vy = speed > 0 ? (dy / d) * speed : 0;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.touchCooldown = Math.max(0, e.touchCooldown - dt);

      if (e.kind === 'elite') {
        if (!empFrozen) {
          e.shootCd = (e.shootCd || 3.5) - dt;
          if (e.shootCd <= 0) {
            e.shootCd = 3.5;
            var baseAngle = Math.atan2(p.y - e.y, p.x - e.x);
            var spread = [-0.26, 0, 0.26];
            for (var si = 0; si < spread.length; si += 1) {
              var sa = baseAngle + spread[si];
              state.enemyBullets.push({
                x: e.x + Math.cos(sa) * (e.r + 4),
                y: e.y + Math.sin(sa) * (e.r + 4),
                vx: Math.cos(sa) * 115,
                vy: Math.sin(sa) * 115,
                r: 3.5,
                damage: 14,
                life: 6
              });
            }
            spawnParticles(e.x, e.y, '#75d1b0', 5, 80, 2);
          }
        }

        if (!e.ringTriggered && e.hp < e.maxHp * 0.5) {
          e.ringTriggered = true;
          var edpDist = Math.hypot(p.x - e.x, p.y - e.y) || 1;
          if (edpDist <= 120) {
            var pushX = ((p.x - e.x) / edpDist) * 15;
            var pushY = ((p.y - e.y) / edpDist) * 15;
            p.x = clamp(p.x + pushX, p.r, boundW - p.r);
            p.y = clamp(p.y + pushY, p.r, boundH - p.r);
            p.slowTimer = Math.max(p.slowTimer || 0, 0.5);
          }
          state.shockRings.push({ x: e.x, y: e.y, r: 8, maxR: 120, life: 0.35, maxLife: 0.35, color: '#75d1b0' });
          state.shake = Math.max(state.shake, 5);
          spawnParticles(e.x, e.y, '#75d1b0', 12, 160, 3);
          AudioFX.dash();
        }
      }

      if (e.kind === 'titan') {
        if (!empFrozen) {
          e.shootCd = (e.shootCd || 2.8) - dt;
          if (e.shootCd <= 0) {
            e.shootCd = 2.8;
            var tBaseAngle = Math.atan2(p.y - e.y, p.x - e.x);
            var twinOffsets = [-0.14, 0.14];
            for (var tii = 0; tii < twinOffsets.length; tii += 1) {
              var ta = tBaseAngle + twinOffsets[tii];
              state.enemyBullets.push({
                x: e.x + Math.cos(ta) * (e.r + 8),
                y: e.y + Math.sin(ta) * (e.r + 8),
                vx: Math.cos(ta) * 140,
                vy: Math.sin(ta) * 140,
                r: 5.5,
                damage: 18,
                life: 7,
                glow: true,
                color: '#ff5533',
                glowColor: '#ff3b1a'
              });
            }
            spawnParticles(e.x, e.y, '#ff5533', 8, 120, 3);
            AudioFX.mortarLaunch();
          }
        }

        if (!e.phase2Triggered && e.hp <= e.maxHp * 0.5) {
          e.phase2Triggered = true;
          state.banner = 3.5;
          state.bannerText = 'TITAN ENRAGED // BARRAGE PROTOCOL';
          if (ui && ui.statusText) ui.statusText.textContent = 'TITAN ENRAGED // BARRAGE PROTOCOL';
          logEvent('TITAN ENRAGED // BARRAGE PROTOCOL');
          state.shake = Math.max(state.shake, 14);
          triggerHaptic([50, 40, 80, 40, 100]);
          AudioFX.blast();
          AudioFX.stormSiren();

          var tpDist = Math.hypot(p.x - e.x, p.y - e.y) || 1;
          if (tpDist <= 180) {
            p.x = clamp(p.x + ((p.x - e.x) / tpDist) * 30, p.r, boundW - p.r);
            p.y = clamp(p.y + ((p.y - e.y) / tpDist) * 30, p.r, boundH - p.r);
            p.slowTimer = Math.max(p.slowTimer || 0, 0.6);
          }
          state.shockRings.push({
            x: e.x,
            y: e.y,
            r: 14,
            maxR: 180,
            life: 0.45,
            maxLife: 0.45,
            color: '#ff4d2e'
          });
          spawnParticles(e.x, e.y, '#ff4d2e', 24, 220, 4);
          spawnParticles(e.x, e.y, '#ffd27d', 16, 170, 3);
        }

        if (e.phase2Triggered && !empFrozen) {
          e.spiralCd = (e.spiralCd || 3.2) - dt;
          if (e.spiralCd <= 0) {
            e.spiralCd = 3.2;
            e.spiralAngle = (e.spiralAngle || 0) + 0.38;
            for (var spi = 0; spi < 8; spi += 1) {
              var sAng = e.spiralAngle + (spi * TAU / 8);
              state.enemyBullets.push({
                x: e.x + Math.cos(sAng) * (e.r + 6),
                y: e.y + Math.sin(sAng) * (e.r + 6),
                vx: Math.cos(sAng) * 130,
                vy: Math.sin(sAng) * 130,
                r: 4.5,
                damage: 16,
                life: 6.5,
                glow: true,
                color: '#ff7733',
                glowColor: '#ff4d2e'
              });
            }
            spawnParticles(e.x, e.y, '#ff7733', 12, 140, 3);
            AudioFX.shoot();
          }

          e.summonCd = (e.summonCd || 6.0) - dt;
          if (e.summonCd <= 0) {
            e.summonCd = 6.0;
            for (var smi = 0; smi < 2; smi += 1) {
              var smOffset = smi === 0 ? -40 : 40;
              state.enemies.push({
                kind: 'rusher',
                x: clamp(e.x + smOffset, 24, boundW - 24),
                y: clamp(e.y + (Math.random() - 0.5) * 30, 24, boundH - 24),
                r: 10,
                hp: 26 + state.wave * 5,
                maxHp: 26 + state.wave * 5,
                speed: 91 + state.wave * 3.2,
                damage: 9 + state.wave * 0.8,
                color: '#e1a644',
                touchCooldown: 0,
                phase: Math.random() * TAU,
                burstCd: 1.2,
                burstTime: 0,
                burstAngle: 0,
                trail: []
              });
              spawnParticles(e.x + smOffset, e.y, '#e1a644', 8, 120, 2.5);
            }
            AudioFX.levelUp();
          }
        }
      }

      if (d <= p.r + e.r && e.touchCooldown <= 0 && p.invulnerable <= 0) {
        p.hp -= e.damage;
        p.invulnerable = 0.7;
        e.touchCooldown = 0.85;
        AudioFX.hurt();
        triggerHaptic([45]);
        state.shake = Math.max(state.shake, 10);
        state.hurtFlash = 0.55;
        spawnParticles(p.x, p.y, '#df6b4f', 10, 160, 3);
        if (isStormFront()) state.stormHurt = true;
        if (p.reactiveArmor) triggerReactiveArmor();
        if (p.hp <= 0) triggerGameOver();
      }
    }
    if (p.hp <= 0 && !state.over) triggerGameOver();

    for (var ebi = state.enemyBullets.length - 1; ebi >= 0; ebi -= 1) {
      var eb = state.enemyBullets[ebi];
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      eb.life -= dt;
      var ebDist2 = dist2(eb.x, eb.y, p.x, p.y);
      var hitPlayer = false;
      var ebDist = Math.sqrt(ebDist2);
      var hitRadius = p.r + eb.r;
      if (ebDist <= hitRadius) {
        hitPlayer = true;
        if (p.invulnerable <= 0) {
          p.hp -= eb.damage;
          p.invulnerable = 0.5;
          AudioFX.hurt();
          triggerHaptic([45]);
          state.shake = Math.max(state.shake, 6);
          state.hurtFlash = 0.45;
          spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
          if (isStormFront()) state.stormHurt = true;
          if (p.reactiveArmor) triggerReactiveArmor();
          if (p.hp <= 0) triggerGameOver();
        }
      } else if (ebDist <= (hitRadius + 18) && !eb.grazed) {
        eb.grazed = true;
        if (state.stats) state.stats.grazes += 1;
        state.score += 15;
        for (var gi = 0; gi < 4; gi += 1) {
          var ga = Math.random() * TAU;
          var gv = 55 + Math.random() * 55;
          state.particles.push({
            x: eb.x,
            y: eb.y,
            vx: Math.cos(ga) * gv,
            vy: Math.sin(ga) * gv,
            life: 0.16 + Math.random() * 0.14,
            maxLife: 0.3,
            size: 2,
            color: '#fbda8a',
            gravity: 10
          });
        }
        AudioFX.graze();
      }
      if (hitPlayer || eb.life <= 0 || eb.x < -40 || eb.y < -40 || eb.x > boundW + 40 || eb.y > boundH + 40) {
        state.enemyBullets.splice(ebi, 1);
      }
    }

    if (state.artilleryTargets) {
      for (var ati = state.artilleryTargets.length - 1; ati >= 0; ati -= 1) {
        var at = state.artilleryTargets[ati];
        at.timer -= dt;
        if (at.state === 'warning') {
          if (at.timer <= 0) {
            at.state = 'molten';
            at.timer = 2.0;
            at.maxTimer = 2.0;
            at.damageTickTimer = 0;
            AudioFX.mortarImpact();
            state.shake = Math.max(state.shake, 8);
            state.shockRings.push({
              x: at.x,
              y: at.y,
              r: 8,
              maxR: at.r,
              life: 0.25,
              maxLife: 0.25,
              color: '#ed6842'
            });
            spawnParticles(at.x, at.y, '#f5a623', 18, 180, 3);
            spawnParticles(at.x, at.y, '#df4028', 12, 140, 3);
            addDecal(at.x, at.y, at.r * 0.85, 14, 0.42, '#1b1715');

            var pMortarDist = Math.hypot(p.x - at.x, p.y - at.y);
            if (pMortarDist <= (at.r + p.r)) {
              var mkdx = p.x - at.x;
              var mkdy = p.y - at.y;
              var mkd = Math.hypot(mkdx, mkdy) || 1;
              p.x = clamp(p.x + (mkdx / mkd) * 15, p.r, boundW - p.r);
              p.y = clamp(p.y + (mkdy / mkd) * 15, p.r, boundH - p.r);

              if (p.invulnerable <= 0) {
                var mortarDmg = Math.round(24 + at.wave * 1.4);
                p.hp -= mortarDmg;
                p.invulnerable = 0.45;
                AudioFX.hurt();
                triggerHaptic([45]);
                state.shake = Math.max(state.shake, 7);
                state.hurtFlash = 0.45;
                spawnParticles(p.x, p.y, '#df6b4f', 8, 140, 3);
                if (isStormFront()) state.stormHurt = true;
                if (p.reactiveArmor) triggerReactiveArmor();
                if (p.hp <= 0) triggerGameOver();
              }
            }
          }
        } else if (at.state === 'molten') {
          at.damageTickTimer += dt;
          var pMoltenDist = Math.hypot(p.x - at.x, p.y - at.y);
          if (pMoltenDist <= (at.r + p.r)) {
            if (at.damageTickTimer >= 0.5) {
              at.damageTickTimer -= 0.5;
              if (p.invulnerable <= 0) {
                p.hp -= 5;
                p.invulnerable = 0.2;
                AudioFX.hurt();
                triggerHaptic([15]);
                state.shake = Math.max(state.shake, 2.5);
                state.hurtFlash = 0.25;
                spawnParticles(p.x, p.y, '#df6b4f', 4, 80, 2);
                if (isStormFront()) state.stormHurt = true;
                if (p.reactiveArmor) triggerReactiveArmor();
                if (p.hp <= 0) triggerGameOver();
              }
            }
          }
          if (at.timer <= 0) {
            state.artilleryTargets.splice(ati, 1);
          }
        }
      }
    }

    if (state.opticalFlashes) {
      for (var ofi = state.opticalFlashes.length - 1; ofi >= 0; ofi -= 1) {
        state.opticalFlashes[ofi].life -= dt;
        if (state.opticalFlashes[ofi].life <= 0) state.opticalFlashes.splice(ofi, 1);
      }
    }

    for (var sri = state.shockRings.length - 1; sri >= 0; sri -= 1) {
      state.shockRings[sri].life -= dt;
      if (state.shockRings[sri].life <= 0) state.shockRings.splice(sri, 1);
    }

    for (var lai = state.lightningArcs.length - 1; lai >= 0; lai -= 1) {
      state.lightningArcs[lai].life -= dt;
      if (state.lightningArcs[lai].life <= 0) state.lightningArcs.splice(lai, 1);
    }

    if (state.decals) {
      for (var dci = 0; dci < state.decals.length; dci += 1) {
        var dItem = state.decals[dci];
        if (!dItem.active) continue;
        dItem.life -= dt;
        if (dItem.life <= 0) dItem.active = false;
      }
    }

    if (state.casings) {
      for (var ci = 0; ci < state.casings.length; ci += 1) {
        var c = state.casings[ci];
        if (!c.active) continue;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vx *= Math.pow(0.06, dt);
        c.vy *= Math.pow(0.06, dt);
        c.rot += c.vrot * dt;
        c.vrot *= Math.pow(0.08, dt);
        c.life -= dt;
        if (c.life <= 0) c.active = false;
      }
    }

    for (var pi = state.particles.length - 1; pi >= 0; pi -= 1) {
      var part = state.particles[pi];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += part.gravity * dt;
      part.vx *= Math.pow(0.08, dt);
      part.vy *= Math.pow(0.08, dt);
      part.life -= dt;
      if (part.life <= 0) state.particles.splice(pi, 1);
    }
    updateDomUi();
  }

  function drawBackground(ctx) {
    ctx.fillStyle = '#121315';
    ctx.fillRect(0, 0, ui.width, ui.height);
    ctx.strokeStyle = 'rgba(152,126,88,.09)';
    ctx.lineWidth = 1;
    var grid = 56;
    for (var x = -((state.wave * 13) % grid); x < ui.width + grid; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ui.height); ctx.stroke();
    }
    for (var y = -((state.wave * 7) % grid); y < ui.height + grid; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ui.width, y); ctx.stroke();
    }
    terrain.forEach(function (piece) {
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rot);
      if (piece.kind === 'scrap') {
        ctx.fillStyle = 'rgba(177,144,91,.22)';
        ctx.fillRect(-piece.size, -piece.size * .35, piece.size * 2, piece.size * .7);
        ctx.fillStyle = 'rgba(213,175,106,.25)';
        ctx.fillRect(-piece.size * .5, -piece.size * .65, piece.size * .9, piece.size * .22);
      } else {
        ctx.fillStyle = 'rgba(88,82,72,.28)';
        ctx.beginPath();
        ctx.moveTo(-piece.size, piece.size * .6);
        ctx.lineTo(-piece.size * .3, -piece.size);
        ctx.lineTo(piece.size, piece.size * .3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
    if (isStormFront()) {
      ctx.save();
      var stormRad = 35 * Math.PI / 180;
      var cosS = Math.cos(stormRad);
      var sinS = Math.sin(stormRad);
      var diag = Math.hypot(ui.width, ui.height) + 400;
      var speed = 720;
      for (var si = 0; si < 7; si += 1) {
        var laneFrac = (si + 0.5) / 7;
        var perpX = -sinS * (laneFrac * ui.height * 1.6 - ui.height * 0.3);
        var perpY = cosS * (laneFrac * ui.width * 1.6 - ui.width * 0.3);
        var travel = ((state.waveTime * speed + si * 191) % diag) - 200;
        var sX = perpX + cosS * travel;
        var sY = perpY + sinS * travel;
        var sLen = 140 + (si % 3) * 60;
        var eX = sX + cosS * sLen;
        var eY = sY + sinS * sLen;
        ctx.strokeStyle = si % 2 === 0 ? 'rgba(237, 104, 66, 0.22)' : 'rgba(224, 168, 78, 0.18)';
        ctx.lineWidth = 1.8 + (si % 3) * 0.6;
        ctx.beginPath();
        ctx.moveTo(sX, sY);
        ctx.lineTo(eX, eY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 230, 180, 0.45)';
        ctx.fillRect(eX, eY, 2, 2);
        ctx.fillRect(eX - cosS * 20, eY - sinS * 20, 1.5, 1.5);
      }
      ctx.restore();
    }
  }

  function drawDecals(ctx) {
    if (!state || !state.decals) return;
    for (var di = 0; di < state.decals.length; di += 1) {
      var d = state.decals[di];
      if (!d.active) continue;
      var fade = clamp(d.life / d.maxLife, 0, 1);
      var alpha = d.alpha * fade;
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.globalAlpha = alpha * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, d.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(0, 0, d.r * 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawOrb(ctx, orb) {
    var power = orb.kind === 'overdrive';
    var repair = orb.kind === 'repair';
    var color = power ? '#f0cf88' : repair ? '#ed6842' : '#75d1b0';
    var pulse = 1 + Math.sin((orb.life * 5) + orb.x) * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r * 2.8 * pulse, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (power || repair) {
      ctx.translate(orb.x, orb.y);
      ctx.rotate(power ? orb.life * 1.8 : Math.PI / 4);
      ctx.fillStyle = color;
      ctx.fillRect(-orb.r * pulse, -orb.r * pulse, orb.r * 2 * pulse, orb.r * 2 * pulse);
      ctx.fillStyle = power ? '#fff1b5' : '#ffd2b0';
      if (repair) {
        ctx.fillRect(-2, -orb.r * 0.72, 4, orb.r * 1.44);
        ctx.fillRect(-orb.r * 0.72, -2, orb.r * 1.44, 4);
      } else {
        ctx.fillRect(-2, -2, 4, 4);
      }
    } else {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d5f4d8';
      ctx.beginPath(); ctx.arc(orb.x - 2, orb.y - 2, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();

    if (isHighContrast()) {
      ctx.save();
      ctx.font = '900 12px "Segoe UI Symbol", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var oGlyph = repair ? '+' : power ? '✦' : '●';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(oGlyph, orb.x, orb.y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(oGlyph, orb.x, orb.y);
      ctx.restore();
    }
  }

  function drawEnemy(ctx, e) {
    if (e.kind === 'rusher') {
      if (e.burstCd !== undefined && e.burstCd <= 0.35 && e.burstCd > 0) {
        var tAngle = e.burstAngle !== undefined ? e.burstAngle : Math.atan2(state.player.y - e.y, state.player.x - e.x);
        var chargeRatio = 1 - (e.burstCd / 0.35);
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(237, 104, 66, ' + (0.35 + chargeRatio * 0.45) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(tAngle) * 160, e.y + Math.sin(tAngle) * 160);
        ctx.stroke();
        ctx.restore();
      }
      if (e.burstTime !== undefined && e.burstTime > 0) {
        var bAngle = e.burstAngle !== undefined ? e.burstAngle : Math.atan2(e.vy, e.vx);
        ctx.save();
        for (var si = 1; si <= 3; si += 1) {
          var segDist = si * 14;
          var segX = e.x - Math.cos(bAngle) * segDist;
          var segY = e.y - Math.sin(bAngle) * segDist;
          var segAlpha = 0.45 - si * 0.12;
          ctx.save();
          ctx.translate(segX, segY);
          ctx.rotate(bAngle);
          ctx.strokeStyle = 'rgba(237, 104, 66, ' + segAlpha + ')';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(e.r * 1.1, 0);
          ctx.lineTo(-e.r * 0.7, e.r * 0.85);
          ctx.lineTo(-e.r * 0.3, 0);
          ctx.lineTo(-e.r * 0.7, -e.r * 0.85);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.atan2(state.player.y - e.y, state.player.x - e.x));
    var bob = Math.sin(state.waveTime * 6 + e.phase) * (e.kind === 'rusher' ? 2 : 1);
    ctx.translate(0, bob);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.kind === 'rusher' ? 10 : e.kind === 'elite' ? 15 : 5;
    ctx.fillStyle = e.color;
    if (e.kind === 'elite') {
      var breath = 0.5 + 0.5 * Math.sin(state.waveTime * 3.5 + (e.phase || 0));
      var breathAlpha = 0.2 + 0.2 * breath;
      var breathR = e.r + 9 + breath * 4;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e1a644';
      ctx.globalAlpha = breathAlpha;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, breathR, 0, TAU);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = 'rgba(210, 241, 205, .85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 7, 0, TAU); ctx.stroke();
      ctx.beginPath();
      for (var sIdx = 0; sIdx < 8; sIdx += 1) {
        var sa = (sIdx / 8) * TAU;
        var sr = sIdx % 2 ? e.r * 0.7 : e.r;
        if (!sIdx) ctx.moveTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
        else ctx.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#24433e'; ctx.beginPath(); ctx.arc(2, 0, e.r * .45, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f5d17b'; ctx.fillRect(e.r * .22, -2, 5, 4);
    } else if (e.kind === 'brute') {
      ctx.beginPath();
      ctx.moveTo(e.r, 0); ctx.lineTo(e.r * .45, e.r * .82); ctx.lineTo(-e.r * .65, e.r * .74); ctx.lineTo(-e.r, 0); ctx.lineTo(-e.r * .65, -e.r * .74); ctx.lineTo(e.r * .45, -e.r * .82); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#452d2a'; ctx.fillRect(-e.r * .55, -4, e.r * .9, 8);
      ctx.fillStyle = '#efb45b'; ctx.fillRect(e.r * .05, -2, 5, 4);
    } else if (e.kind === 'rusher') {
      ctx.beginPath(); ctx.moveTo(e.r * 1.3, 0); ctx.lineTo(-e.r * .7, e.r * .9); ctx.lineTo(-e.r * .35, 0); ctx.lineTo(-e.r * .7, -e.r * .9); ctx.closePath(); ctx.fill();
      var charging = e.burstCd !== undefined && e.burstCd <= 0.35 && e.burstCd > 0;
      var eyeFlash = charging && (Math.sin(state.waveTime * 36) > 0);
      ctx.fillStyle = eyeFlash ? '#ff2b1a' : '#4a3022';
    } else if (e.kind === 'artillery') {
      ctx.save();
      ctx.shadowBlur = 0;
      if (e.deployed) {
        var deployRatio = e.siegeTimer > 0 ? clamp(1 - e.siegeTimer / 0.9, 0, 1) : 1;
        ctx.strokeStyle = '#8c6b23';
        ctx.lineWidth = 2.5;
        for (var legI = 0; legI < 4; legI += 1) {
          var legA = (legI / 4) * TAU + Math.PI / 4;
          var legExt = 3 + deployRatio * 7;
          ctx.beginPath();
          ctx.moveTo(Math.cos(legA) * (e.r * 0.7), Math.sin(legA) * (e.r * 0.7));
          ctx.lineTo(Math.cos(legA) * (e.r + legExt), Math.sin(legA) * (e.r + legExt));
          ctx.stroke();
          ctx.fillStyle = '#4a3b1d';
          ctx.beginPath();
          ctx.arc(Math.cos(legA) * (e.r + legExt), Math.sin(legA) * (e.r + legExt), 2.2, 0, TAU);
          ctx.fill();
        }
      }
      ctx.fillStyle = e.color;
      ctx.beginPath();
      for (var hi = 0; hi < 6; hi += 1) {
        var ha = (hi / 6) * TAU;
        var hx = Math.cos(ha) * e.r;
        var hy = Math.sin(ha) * e.r;
        if (hi === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2d2417';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = '#3a2e1c';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.62, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#221b14';
      ctx.fillRect(0, -3.5, e.r * 1.35, 7);
      ctx.fillStyle = '#f5c76e';
      ctx.fillRect(e.r * 0.85, -4, 4, 8);
      ctx.fillStyle = (e.cooldown && e.cooldown > 0) ? '#8c6b23' : '#ff4d2e';
      ctx.fillRect(-e.r * 0.35, -2, 5, 4);
      ctx.restore();
    } else if (e.kind === 'titan') {
      ctx.save();
      ctx.shadowBlur = 0;
      var isEnraged = Boolean(e.phase2Triggered);

      // Twin heavy cannons
      ctx.fillStyle = '#2b231b';
      ctx.fillRect(-8, -15, e.r * 1.5, 7);
      ctx.fillRect(-8, 8, e.r * 1.5, 7);
      ctx.fillStyle = isEnraged ? '#ff4d2e' : '#d4af37';
      ctx.fillRect(e.r * 1.1, -14, 6, 5);
      ctx.fillRect(e.r * 1.1, 9, 6, 5);

      // Heavy armored octagonal hull
      ctx.beginPath();
      for (var oi = 0; oi < 8; oi += 1) {
        var oa = (oi / 8) * TAU;
        var ox = Math.cos(oa) * e.r;
        var oy = Math.sin(oa) * e.r;
        if (oi === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
      }
      ctx.closePath();
      ctx.fillStyle = isEnraged ? '#552118' : '#3d3122';
      ctx.fill();
      ctx.strokeStyle = isEnraged ? '#ff4d2e' : '#d4af37';
      ctx.lineWidth = 2.8;
      ctx.stroke();

      // Inner armored plate
      ctx.beginPath();
      for (var ii = 0; ii < 8; ii += 1) {
        var ia = (ii / 8) * TAU + Math.PI / 8;
        var ix = Math.cos(ia) * (e.r * 0.65);
        var iy = Math.sin(ia) * (e.r * 0.65);
        if (ii === 0) ctx.moveTo(ix, iy);
        else ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = '#1f1912';
      ctx.fill();
      ctx.strokeStyle = '#5a462e';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Glowing reactor core
      var corePulse = Math.sin(state.waveTime * 8) * 2;
      var coreR = Math.max(4, e.r * 0.32 + (isEnraged ? corePulse * 1.5 : corePulse));
      ctx.shadowColor = isEnraged ? '#ff2b1a' : '#f5a623';
      ctx.shadowBlur = isEnraged ? 20 : 12;
      ctx.fillStyle = isEnraged ? '#ff4d2e' : '#f5a623';
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff4bd';
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#392e29'; ctx.beginPath(); ctx.arc(e.r * .25, 0, e.r * .52, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d7b268'; ctx.fillRect(e.r * .24, -2, 4, 4);
    }
    ctx.shadowBlur = 0;
    if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-e.r, -e.r - 9, e.r * 2, 3);
      ctx.fillStyle = '#d65f48'; ctx.fillRect(-e.r, -e.r - 9, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
    ctx.restore();

    if (isHighContrast()) {
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 2, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 2, 0, TAU);
      ctx.stroke();

      var glyph = e.kind === 'crawler' ? '▲' :
                  e.kind === 'rusher' ? '⚡' :
                  e.kind === 'brute' ? '■' :
                  e.kind === 'artillery' ? '⬡' :
                  e.kind === 'elite' ? '★' :
                  e.kind === 'titan' ? '☠' : '●';
      ctx.font = '900 13px "Segoe UI Symbol", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(glyph, e.x, e.y - e.r - 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(glyph, e.x, e.y - e.r - 8);
      ctx.restore();
    }
  }

  function drawPlayer(ctx) {
    var p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.dashPulse > 0) {
      var pulseProgress = 1 - p.dashPulse / DASH_PULSE_DURATION;
      ctx.save();
      ctx.globalAlpha = clamp(p.dashPulse / DASH_PULSE_DURATION, 0, 1) * 0.85;
      ctx.strokeStyle = '#75d1b0';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#75d1b0';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 12 + pulseProgress * (p.shockwaveDash ? 125 : DASH_PULSE_RADIUS), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(p.aim);
    ctx.globalAlpha = p.invulnerable > 0 && Math.floor(p.invulnerable * 18) % 2 ? 0.45 : 1;
    ctx.shadowColor = '#75d1b0';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#75d1b0';
    ctx.beginPath();
    ctx.moveTo(p.r + 4, 0); ctx.lineTo(p.r * .35, p.r * .85); ctx.lineTo(-p.r * .82, p.r * .7); ctx.lineTo(-p.r, 0); ctx.lineTo(-p.r * .82, -p.r * .7); ctx.lineTo(p.r * .35, -p.r * .85); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#253e3b';
    ctx.beginPath(); ctx.arc(-2, 0, p.r * .55, 0, TAU); ctx.fill();
    var kick = (p.recoil || 0) * 3.5;
    ctx.fillStyle = '#e7bb69';
    ctx.fillRect(p.r * .45 - kick, -3, p.r + 11, 6);
    ctx.fillStyle = '#fbda8a';
    ctx.fillRect(p.r + 13 - kick, -2, 5, 4);
    if ((p.recoil || 0) > 0.05) {
      var flashX = p.r + 18 - kick;
      var flashSize = 4 * p.recoil;
      ctx.fillStyle = '#fff4bd';
      ctx.shadowColor = '#ffe27a';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(flashX + flashSize * 1.5, 0);
      ctx.lineTo(flashX, flashSize);
      ctx.lineTo(flashX - flashSize * 0.8, 0);
      ctx.lineTo(flashX, -flashSize);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawHud(ctx) {
    var p = state.player;
    ctx.save();
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textBaseline = 'top';
    // The full page supplies these metrics in HTML; keep Canvas metrics for fallback hosts.
    if (!ui.health || !ui.xp || !ui.wave || !ui.score) {
      ctx.fillStyle = '#e9d9b9';
      ctx.fillText('WASTELAND // RUN', 20, 18);
      ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = 'rgba(233,217,185,.72)';
      ctx.fillText('WASD MOVE   MOUSE AIM + HOLD FIRE', 20, 36);

      var barX = 20;
      var barY = 60;
      var barW = Math.min(220, ui.width * .35);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(barX, barY, barW, 8);
      ctx.fillStyle = '#df6b4f'; ctx.fillRect(barX, barY, barW * clamp(p.hp / p.maxHp, 0, 1), 8);
      ctx.fillStyle = '#e9d9b9'; ctx.fillText('HP ' + Math.ceil(p.hp) + ' / ' + Math.ceil(p.maxHp), barX, barY + 13);
      barY += 31;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(barX, barY, barW, 5);
      ctx.fillStyle = '#75d1b0'; ctx.fillRect(barX, barY, barW * clamp(state.xp / state.xpNext, 0, 1), 5);
      ctx.fillStyle = 'rgba(233,217,185,.8)'; ctx.fillText('LV ' + state.level + '   SCRAP ' + state.xp + ' / ' + state.xpNext, barX, barY + 10);

      ctx.textAlign = 'right';
      ctx.font = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = '#f0cf88';
      ctx.fillText('WAVE ' + String(state.wave).padStart(2, '0'), ui.width - 20, 20);
      ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = 'rgba(233,217,185,.75)';
      ctx.fillText('KILLS ' + state.kills + '   SCORE ' + state.score, ui.width - 20, 39);
    }
    if (state.combo > 0) {
      ctx.textAlign = 'left';
      ctx.font = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = '#75d1b0';
      ctx.fillText('CHAIN x' + state.combo, 20, 124);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(20, 145, 148, 4);
      ctx.fillStyle = '#75d1b0'; ctx.fillRect(20, 145, 148 * state.comboTimer / COMBO_WINDOW, 4);
      ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = 'rgba(233,217,185,.75)';
      ctx.fillText('KEEP THE SIGNAL HOT', 20, 155);
    }
    if (p.overdrive > 0) {
      ctx.textAlign = 'left';
      ctx.font = '700 13px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = '#f0cf88';
      ctx.fillText('OVERCLOCK ' + p.overdrive.toFixed(1) + 's', 20, 176);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(20, 197, 148, 4);
      ctx.fillStyle = '#f0cf88'; ctx.fillRect(20, 197, 148 * p.overdrive / OVERDRIVE_DURATION, 4);
      ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = 'rgba(233,217,185,.75)';
      ctx.fillText('DAMAGE +50% / COOLDOWN -38%', 20, 207);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(ui.width - 145, 58, 125, 4);
    ctx.fillStyle = '#d49a55'; ctx.fillRect(ui.width - 145, 58, 125 * clamp(state.waveTime / WAVE_LENGTH, 0, 1), 4);

    var titan = null;
    for (var tti = 0; tti < state.enemies.length; tti += 1) {
      if (state.enemies[tti].kind === 'titan') {
        titan = state.enemies[tti];
        break;
      }
    }
    if (titan) {
      var barW = Math.min(360, ui.width * 0.65);
      var barH = 12;
      var barX = (ui.width - barW) / 2;
      var barY = 20;
      var hpRatio = clamp(titan.hp / titan.maxHp, 0, 1);

      // Back plate
      ctx.fillStyle = 'rgba(14, 12, 10, 0.92)';
      ctx.fillRect(barX - 6, barY - 14, barW + 12, barH + 20);
      ctx.strokeStyle = titan.phase2Triggered ? '#ff4d2e' : '#d4af37';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(barX - 6, barY - 14, barW + 12, barH + 20);

      // Label
      ctx.font = '900 10px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = titan.phase2Triggered ? '#ff4d2e' : '#f5d58f';
      ctx.fillText(titan.phase2Triggered ? 'TITAN HULL // ENRAGED' : 'TITAN HULL // APEX THREAT', barX, barY - 11);

      // Numerical HP
      ctx.textAlign = 'right';
      ctx.fillText(Math.ceil(titan.hp) + ' / ' + titan.maxHp, barX + barW, barY - 11);

      // Groove
      ctx.fillStyle = '#1c1712';
      ctx.fillRect(barX, barY, barW, barH);

      // Fill
      ctx.fillStyle = titan.phase2Triggered ? '#ff4d2e' : '#d4af37';
      ctx.fillRect(barX, barY, barW * hpRatio, barH);

      // Sub-ticks at 25%, 50%, 75%
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX + barW * 0.25, barY, 1.5, barH);
      ctx.fillRect(barX + barW * 0.50, barY, 2, barH);
      ctx.fillRect(barX + barW * 0.75, barY, 1.5, barH);
    }

    ctx.restore();
  }

  function drawOverlay(ctx) {
    if (state.banner > 0 && !state.over) {
      ctx.save();
      ctx.globalAlpha = clamp(Math.min(state.banner, 0.8), 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = state.bannerText ? '#75d1b0' : '#f0cf88';
      ctx.font = '700 ' + (state.bannerText ? '20px' : '26px') + ' ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillText(state.bannerText || ('WAVE ' + String(state.wave).padStart(2, '0')), ui.width / 2, ui.height * .2);
      ctx.restore();
    }
    if (state.paused && !state.over && (!state.upgradeChoices || !state.upgradeChoices.length) && (!ui.startScreen || ui.startScreen.hidden)) {
      var hasPauseModal = typeof document !== 'undefined' && Boolean(document.getElementById('pauseModal'));
      if (!hasPauseModal) {
        ctx.save();
        ctx.fillStyle = 'rgba(8,7,7,.74)'; ctx.fillRect(0, 0, ui.width, ui.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f0cf88';
        ctx.font = '700 ' + Math.min(34, ui.width / 9) + 'px ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.fillText('SIGNAL PAUSED', ui.width / 2, ui.height * .42);
        ctx.fillStyle = '#75d1b0';
        ctx.font = '14px ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.fillText(document.getElementById('pauseBtn') ? 'PRESS RESUME TO CONTINUE' : 'PRESS P OR ESC TO RESUME', ui.width / 2, ui.height * .53, ui.width - 24);
        ctx.restore();
      }
    }
    if (state.over) {
      if (state.deathSequenceTimer > 0) {
        var elapsed = 0.55 - state.deathSequenceTimer;
        ctx.save();
        if (elapsed < 0.25) {
          // 0–0.25s: vertical squash into 2px bright white line
          var t1 = elapsed / 0.25;
          var curH = Math.max(2, ui.height * (1 - t1));
          var topH = (ui.height - curH) / 2;
          ctx.fillStyle = '#050404';
          ctx.fillRect(0, 0, ui.width, topH);
          ctx.fillRect(0, ui.height - topH, ui.width, topH);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#5be7ff';
          ctx.shadowBlur = 14;
          ctx.fillRect(0, ui.height / 2 - 1, ui.width, 2);
        } else if (elapsed < 0.45) {
          // 0.25–0.45s: horizontal point collapse
          var t2 = (elapsed - 0.25) / 0.20;
          var curW = Math.max(2, ui.width * (1 - t2));
          var leftW = (ui.width - curW) / 2;
          ctx.fillStyle = '#050404';
          ctx.fillRect(0, 0, ui.width, ui.height);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#5be7ff';
          ctx.shadowBlur = 16;
          ctx.fillRect(leftW, ui.height / 2 - 1, curW, 2);
        } else {
          // 0.45s+: fade black
          ctx.fillStyle = '#050404';
          ctx.fillRect(0, 0, ui.width, ui.height);
        }
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(8,7,7,.74)'; ctx.fillRect(0, 0, ui.width, ui.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#df6b4f';
      ctx.font = '700 34px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillText('RUN ENDED', ui.width / 2, ui.height * .39);
      ctx.fillStyle = '#e9d9b9';
      ctx.font = '14px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillText('WAVE ' + state.wave + '  //  SCORE ' + state.score + '  //  KILLS ' + state.kills, ui.width / 2, ui.height * .47);
      ctx.fillStyle = '#75d1b0';
      ctx.fillText('PRESS R OR CLICK TO RESTART', ui.width / 2, ui.height * .56);
      ctx.restore();
    }
  }

  function drawCasings(ctx) {
    if (!state || !state.casings) return;
    for (var i = 0; i < state.casings.length; i += 1) {
      var c = state.casings[i];
      if (!c.active) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = clamp(c.life / c.maxLife, 0, 1) * 0.85;
      ctx.fillStyle = '#d4a34b';
      ctx.fillRect(-1.5, -0.5, 3, 1);
      ctx.restore();
    }
  }

  function drawCores(ctx) {
    if (!state || !state.volatileCores) return;
    for (var i = 0; i < state.volatileCores.length; i += 1) {
      var core = state.volatileCores[i];
      ctx.save();
      ctx.translate(core.x, core.y);
      ctx.rotate(core.rot);
      ctx.shadowColor = '#f5a623';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#f5a623';
      ctx.beginPath();
      ctx.moveTo(core.r * 1.3, 0);
      ctx.lineTo(0, core.r * 1.3);
      ctx.lineTo(-core.r * 1.3, 0);
      ctx.lineTo(0, -core.r * 1.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff2b2';
      ctx.beginPath();
      ctx.moveTo(core.r * 0.65, 0);
      ctx.lineTo(0, core.r * 0.65);
      ctx.lineTo(-core.r * 0.65, 0);
      ctx.lineTo(0, -core.r * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (core.hp < core.maxHp) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(core.x - core.r, core.y - core.r - 8, core.r * 2, 3);
        ctx.fillStyle = '#f5a623';
        ctx.fillRect(core.x - core.r, core.y - core.r - 8, core.r * 2 * clamp(core.hp / core.maxHp, 0, 1), 3);
        ctx.restore();
      }
    }
  }

  function drawEnemyBullets(ctx) {
    if (!state || !state.enemyBullets) return;
    for (var i = 0; i < state.enemyBullets.length; i += 1) {
      var eb = state.enemyBullets[i];
      ctx.save();
      if (eb.glow) {
        ctx.shadowColor = eb.glowColor || '#ff4d2e';
        ctx.shadowBlur = 14;
        ctx.fillStyle = eb.color || '#ff5533';
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, eb.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff0dd';
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, eb.r * 0.45, 0, TAU);
        ctx.fill();
      } else {
        ctx.shadowColor = '#75d1b0';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#75d1b0';
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, eb.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#f5a623';
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, eb.r * 0.45, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawShockRings(ctx) {
    if (!state || !state.shockRings) return;
    for (var i = 0; i < state.shockRings.length; i += 1) {
      var ring = state.shockRings[i];
      var progress = 1 - ring.life / ring.maxLife;
      var currentR = ring.r + (ring.maxR - ring.r) * progress;
      ctx.save();
      ctx.globalAlpha = clamp(ring.life / ring.maxLife, 0, 1) * 0.85;
      ctx.strokeStyle = ring.color || '#75d1b0';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = ring.color || '#75d1b0';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, currentR, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawLightningArcs(ctx) {
    if (!state || !state.lightningArcs) return;
    for (var i = 0; i < state.lightningArcs.length; i += 1) {
      var arc = state.lightningArcs[i];
      ctx.save();
      ctx.globalAlpha = clamp(arc.life / arc.maxLife, 0, 1);
      ctx.strokeStyle = '#a8f5e5';
      ctx.shadowColor = '#75d1b0';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arc.x1, arc.y1);
      var midX = (arc.x1 + arc.x2) / 2 + (Math.random() - 0.5) * 20;
      var midY = (arc.y1 + arc.y2) / 2 + (Math.random() - 0.5) * 20;
      ctx.lineTo(midX, midY);
      ctx.lineTo(arc.x2, arc.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawArtilleryZones(ctx) {
    if (!state || !state.artilleryTargets) return;
    for (var i = 0; i < state.artilleryTargets.length; i += 1) {
      var at = state.artilleryTargets[i];
      ctx.save();
      if (at.state === 'warning') {
        var progress = clamp(1 - at.timer / at.maxTimer, 0, 1);
        ctx.beginPath();
        ctx.arc(at.x, at.y, at.r, 0, TAU);
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(237, 104, 66, ' + (0.4 + progress * 0.5) + ')';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(237, 104, 66, ' + (0.35 + progress * 0.55) + ')';
        ctx.lineWidth = 1.2;
        ctx.moveTo(at.x - 8, at.y); ctx.lineTo(at.x + 8, at.y);
        ctx.moveTo(at.x, at.y - 8); ctx.lineTo(at.x, at.y + 8);
        ctx.stroke();

        var fillR = Math.max(3, at.r * progress);
        ctx.beginPath();
        ctx.arc(at.x, at.y, fillR, 0, TAU);
        ctx.fillStyle = 'rgba(223, 64, 40, ' + (0.12 + progress * 0.42) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(240, 48, 32, ' + (0.5 + progress * 0.5) + ')';
        ctx.lineWidth = 1.5 + progress * 1.5;
        ctx.stroke();
      } else if (at.state === 'molten') {
        var fade = clamp(at.timer / at.maxTimer, 0, 1);
        ctx.beginPath();
        ctx.arc(at.x, at.y, at.r, 0, TAU);
        ctx.fillStyle = 'rgba(180, 50, 18, ' + (fade * 0.38) + ')';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(at.x, at.y, at.r * 0.65, 0, TAU);
        ctx.fillStyle = 'rgba(245, 130, 24, ' + (fade * 0.48) + ')';
        ctx.fill();

        var pulse = Math.sin(at.timer * 10) * 2;
        ctx.beginPath();
        ctx.arc(at.x, at.y, Math.max(3, at.r * 0.32 + pulse), 0, TAU);
        ctx.fillStyle = 'rgba(255, 220, 110, ' + (fade * 0.62) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(237, 85, 30, ' + (fade * 0.72) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawOpticalFlashes(ctx) {
    if (!state || !state.opticalFlashes) return;
    for (var i = 0; i < state.opticalFlashes.length; i += 1) {
      var f = state.opticalFlashes[i];
      var alpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.atan2(f.ny, f.nx));
      ctx.scale(0.35, 1.4);
      ctx.beginPath();
      ctx.arc(0, 0, f.r, 0, TAU);
      ctx.fillStyle = f.color || '#fff4bd';
      ctx.globalAlpha = alpha * 0.85;
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    if (!ui || !state) return;
    var ctx = ui.ctx;
    ctx.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
    var shakeX = state.shake ? (Math.random() - .5) * state.shake : 0;
    var shakeY = state.shake ? (Math.random() - .5) * state.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground(ctx);
    drawDecals(ctx);
    drawCasings(ctx);
    drawCores(ctx);
    state.orbs.forEach(function (orb) { drawOrb(ctx, orb); });
    drawShockRings(ctx);
    drawLightningArcs(ctx);
    drawArtilleryZones(ctx);
    drawOpticalFlashes(ctx);
    drawEnemyBullets(ctx);
    state.bullets.forEach(function (bullet) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bullet.x, bullet.y);
      for (var i = bullet.trail.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
      }
      if (bullet.trail.length === 0) {
        var bAngle = Math.atan2(bullet.vy, bullet.vx);
        ctx.lineTo(bullet.x - Math.cos(bAngle) * (bullet.r * 2), bullet.y - Math.sin(bAngle) * (bullet.r * 2));
      }
      ctx.strokeStyle = 'rgba(240, 207, 136, 0.28)';
      ctx.lineWidth = bullet.r * 2.2;
      ctx.stroke();

      ctx.strokeStyle = '#fff4bd';
      ctx.lineWidth = bullet.r * 1.1;
      ctx.stroke();
      ctx.restore();
    });
    state.enemies.forEach(function (enemy) { drawEnemy(ctx, enemy); });
    state.particles.forEach(function (part) {
      ctx.globalAlpha = clamp(part.life / part.maxLife, 0, 1);
      ctx.fillStyle = part.color;
      ctx.fillRect(part.x, part.y, part.size, part.size);
    });
    ctx.globalAlpha = 1;
    drawPlayer(ctx);
    drawHud(ctx);
    drawOverlay(ctx);
    if (state.hurtFlash > 0) { ctx.fillStyle = 'rgba(223,107,79,' + (state.hurtFlash * .18) + ')'; ctx.fillRect(0, 0, ui.width, ui.height); }
    ctx.restore();
  }

  function updateDomUi() {
    if (!state || !ui) return;
    updateAudioBtn();
    var pauseButton = typeof document !== 'undefined' ? document.getElementById('pauseBtn') : null;
    if (pauseButton) {
      pauseButton.disabled = state.over || state.upgradeChoices.length > 0 || Boolean(ui.startScreen && !ui.startScreen.hidden);
      pauseButton.textContent = state.paused && !pauseButton.disabled ? 'RESUME' : 'PAUSE';
      pauseButton.setAttribute('aria-label', state.paused && !pauseButton.disabled ? 'Resume game' : 'Pause game');
    }
    setText(ui.health, Math.ceil(state.player.hp));
    setText(ui.xp, state.xp);
    setText(ui.xpMax, state.xpNext);
    setText(ui.level, String(state.level).padStart(2, '0'));
    setText(ui.wave, String(state.wave).padStart(2, '0'));
    setText(ui.score, String(state.score).padStart(6, '0'));
    setText(ui.best, String(state.bestScore).padStart(6, '0'));
    setText(ui.kills, state.kills + ' HOSTILES');
    if (ui.objectiveText) ui.objectiveText.textContent = state.bountyClaimed ? 'BOUNTY SECURED — HOLD THE DRYLINE.' : 'DROP ' + state.bountyTarget + ' HOSTILES FOR +' + state.bountyReward + ' SCORE.';
    if (ui.objectiveProgress) ui.objectiveProgress.style.width = (state.bountyClaimed ? 100 : clamp(state.bountyKills / state.bountyTarget, 0, 1) * 100) + '%';
    if (ui.threatIndex) ui.threatIndex.textContent = state.wave >= 5 ? 'CRITICAL' : state.wave >= 3 ? 'HIGH' : 'LOW';
    if (ui.waveTimer) {
      var seconds = Math.max(0, Math.ceil(WAVE_LENGTH - state.waveTime));
      ui.waveTimer.textContent = (isStormFront() ? 'STORM FRONT ' : 'NEXT FRONT ') + String(seconds).padStart(2, '0') + 's';
    }
    if (ui.healthFill) ui.healthFill.style.width = (clamp(state.player.hp / state.player.maxHp, 0, 1) * 100) + '%';
    if (ui.xpFill) ui.xpFill.style.width = (clamp(state.xp / state.xpNext, 0, 1) * 100) + '%';
    if (ui.healthFill && ui.healthFill.parentElement) ui.healthFill.parentElement.setAttribute('aria-valuenow', String(Math.ceil(state.player.hp)));
    if (ui.xpFill && ui.xpFill.parentElement) ui.xpFill.parentElement.setAttribute('aria-valuenow', String(state.xp));
    if (ui.hudEnergy) ui.hudEnergy.textContent = Math.floor(state.player.energy || 0);
    if (ui.meterEnergy) ui.meterEnergy.setAttribute('aria-valuenow', String(Math.floor(state.player.energy || 0)));
    if (ui.energyFill) ui.energyFill.style.width = (clamp((state.player.energy || 0) / (state.player.maxEnergy || 100), 0, 1) * 100) + '%';
    if (ui.touchSpecial) {
      if ((state.player.energy || 0) >= 50) {
        ui.touchSpecial.classList.add('is-ready');
        ui.touchSpecial.classList.remove('touch-button--cooldown');
      } else {
        ui.touchSpecial.classList.remove('is-ready');
        ui.touchSpecial.classList.add('touch-button--cooldown');
      }
    }
    if (ui.gameOver) ui.gameOver.hidden = !state.over || (state.deathSequenceTimer > 0);
    if (ui.newRecordStamp) ui.newRecordStamp.hidden = !state.over || (state.deathSequenceTimer > 0) || !state.isNewRecord;
    if (ui.finalWave) ui.finalWave.textContent = String(state.wave).padStart(2, '0');
    if (ui.finalScore) ui.finalScore.textContent = String(state.score).padStart(6, '0');
    if (ui.hudChain) {
      if (state.combo > 1) {
        ui.hudChain.hidden = false;
        ui.hudChain.textContent = 'CHAIN x' + state.combo;
      } else {
        ui.hudChain.hidden = true;
      }
    }
    if (ui.finalBest) ui.finalBest.textContent = String(state.bestScore).padStart(6, '0');
    if (state.over && state.stats && ui.gameOver) {
      var tel = typeof document !== 'undefined' ? document.getElementById('runTelemetry') : null;
      if (!tel) {
        var resGrid = ui.gameOver.querySelector('.result-grid');
        if (resGrid) {
          tel = document.createElement('div');
          tel.id = 'runTelemetry';
          tel.className = 'telemetry-grid';
          resGrid.insertAdjacentElement('afterend', tel);
        }
      }
      if (tel) {
        var acc = state.stats.shotsFired > 0 ? Math.round((state.stats.shotsHit / state.stats.shotsFired) * 100) : 0;
        tel.innerHTML =
          '<div><span>ACCURACY</span><strong>' + acc + '% <small>(' + state.stats.shotsHit + '/' + state.stats.shotsFired + ')</small></strong></div>' +
          '<div><span>CRITS</span><strong>' + state.stats.crits + '</strong></div>' +
          '<div><span>GRAZES</span><strong>' + state.stats.grazes + '</strong></div>' +
          '<div><span>CORES DETONATED</span><strong>' + state.stats.coresDetonated + '</strong></div>' +
          '<div><span>MAX COMBO</span><strong>x' + state.stats.maxCombo + '</strong></div>' +
          '<div><span>DAMAGE DEALT</span><strong>' + state.stats.damageDealt + '</strong></div>';
      }
    }
    if (ui.accountSaveBadge) ui.accountSaveBadge.hidden = !state.over || !accountRunSaved;
    if (ui.runState && state.over) ui.runState.textContent = 'SIGNAL LOST';
    else if (ui.runState && !ui.startScreen) ui.runState.textContent = 'LIVE';
    if (ui.statusText && state.over) ui.statusText.textContent = 'SIGNAL LOST — PRESS R TO REDEPLOY';
  }

  function frame(timestamp) {
    if (!started) return;
    var dt = lastTime ? Math.min(0.05, (timestamp - lastTime) / 1000) : 0;
    lastTime = timestamp;
    pollGamepad(dt);
    update(dt);
    draw();
    raf = window.requestAnimationFrame(frame);
  }

  function init(options) {
    if (started) return api;
    if (typeof document === 'undefined') return api;
    ui = setupDom(options);
    state = makeState(960, 640);
    resize();
    state = makeState(ui.width, ui.height);
    state.paused = Boolean(ui.startScreen && !ui.startScreen.hidden);
    if (!state.paused) accountRun = startAccountRun();
    input.mouse.x = ui.width / 2 + 100;
    input.mouse.y = ui.height / 2;
    bindInput();
    started = true;
    for (var i = 0; i < 3; i += 1) spawnEnemy();
    updateDomUi();
    draw();
    raf = window.requestAnimationFrame(frame);
    return api;
  }

  function pause() {
    if (state && !state.over) { state.paused = true; updateDomUi(); }
  }

  function resume() {
    if (state && !state.over && !state.upgradeChoices.length) { state.paused = false; updateDomUi(); }
  }

  function destroy() {
    started = false;
    accountRun = null;
    accountRunSaved = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    listeners.splice(0).forEach(function (remove) { remove(); });
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    firePointers.clear();
    input.keys.clear();
    input.mouse.down = false;
    if (ui && ui.createdOverlay && ui.overlay.parentNode) ui.overlay.parentNode.removeChild(ui.overlay);
    if (ui && ui.createdCanvas && ui.canvas.parentNode) ui.canvas.parentNode.removeChild(ui.canvas);
    ui = null;
    state = null;
  }

  function selfCheck() {
    var test = makeState(320, 240);
    var previous = state;
    var previousUi = ui;
    var previousMouseDown = input.mouse.down;
    var previousKeys = input.keys;
    var firstScore;
    var chainScore;
    var lightDrop;
    var bruteDrop;
    var eliteDrop;
    var healed;
    var capped;
    var cappedScore;
    var overflowScore;
    var overflowStatus;
    var repairStatus;
    var bountyScore;
    var secondBountyScore;
    var bountyClaimed;
    var bountySurge;
    var retainedSurge;
    var waveReset;
    var stormClock;
    var artilleryScore;
    var grazeOk;
    state = test;
    try {
      test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
      killEnemy(0);
      firstScore = test.score;
      test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
      killEnemy(0);
      chainScore = test.score;
      test.orbs = [];
      test.enemies.push({ kind: 'rusher', x: 0, y: 0, r: 10, color: '#e1a644' });
      killEnemy(0);
      lightDrop = test.orbs.some(function (orb) { return orb.kind === 'repair'; });
      test.orbs = [];
      test.enemies.push({ kind: 'brute', x: 0, y: 0, r: 23, color: '#bd573f' });
      killEnemy(0);
      bruteDrop = test.orbs.some(function (orb) { return orb.kind === 'repair'; });
      test.orbs = [];
      test.enemies.push({ kind: 'elite', x: 0, y: 0, r: 19, color: '#75d1b0' });
      killEnemy(0);
      eliteDrop = test.orbs.some(function (orb) { return orb.kind === 'repair'; }) && test.orbs.some(function (orb) { return orb.kind === 'overdrive'; });
      ui = { width: 320, height: 240, statusText: { textContent: '' } };
      input.keys = new Set();
      input.mouse.down = false;
      test.hitstop = 0;
      test.player.hp = 50;
      test.orbs = [{ kind: 'repair', x: test.player.x, y: test.player.y, vx: 0, vy: 0, r: 10, value: 0, life: 22 }];
      update(0.016);
      healed = test.player.hp;
      repairStatus = ui.statusText.textContent;
      test.score = 0;
      test.hitstop = 0;
      test.player.hp = test.player.maxHp - 5;
      test.orbs = [{ kind: 'repair', x: test.player.x, y: test.player.y, vx: 0, vy: 0, r: 10, value: 0, life: 22 }];
      update(0.016);
      capped = test.player.hp;
      cappedScore = test.score;
      test.hitstop = 0;
      test.player.hp = test.player.maxHp;
      test.orbs = [{ kind: 'repair', x: test.player.x, y: test.player.y, vx: 0, vy: 0, r: 10, value: 0, life: 22 }];
      update(0.016);
      overflowScore = test.score;
      overflowStatus = ui.statusText.textContent;
      test.score = 0;
      test.combo = 0;
      test.comboTimer = 0;
      test.bountyTarget = 1;
      test.bountyKills = 0;
      test.bountyReward = 37;
      test.bountyClaimed = false;
      test.enemies = [];
      test.orbs = [];
      test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
      killEnemy(0);
      bountyScore = test.score;
      bountySurge = test.player.overdrive;
      bountyClaimed = test.bountyClaimed;
      test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
      killEnemy(0);
      secondBountyScore = test.score;
      test.player.overdrive = 5;
      test.bountyTarget = 1;
      test.bountyKills = 0;
      test.bountyReward = 0;
      test.bountyClaimed = false;
      test.enemies.push({ kind: 'crawler', x: 0, y: 0, r: 14, color: '#8d7861' });
      killEnemy(0);
      retainedSurge = test.player.overdrive;
      test.hitstop = 0;
      test.waveTime = WAVE_LENGTH - STORM_FRONT_SECONDS - 0.01;
      stormClock = !isStormFront();
      test.waveTime = WAVE_LENGTH - STORM_FRONT_SECONDS;
      stormClock = stormClock && isStormFront();
      test.wave = 1;
      test.waveTime = WAVE_LENGTH;
      test.spawnTimer = 999;
      test.bountyTarget = 1;
      test.bountyKills = 1;
      test.bountyReward = 37;
      test.bountyClaimed = true;
      update(0.016);
      waveReset = test.wave === 2 && test.bountyTarget === 9 && test.bountyKills === 0 && test.bountyReward === 200 && !test.bountyClaimed;
      test.score = 0;
      test.combo = 0;
      test.comboTimer = 0;
      test.enemies = [{ kind: 'artillery', x: 0, y: 0, r: 16, color: '#d69e2e' }];
      killEnemy(0);
      artilleryScore = test.score;
      test.score = 0;
      if (test.stats) test.stats.grazes = 0;
      test.hitstop = 0;
      test.player.x = 100;
      test.player.y = 100;
      test.player.r = 15;
      test.enemyBullets = [{ x: 125, y: 100, vx: 0, vy: 0, r: 3.5, damage: 10, life: 5 }];
      update(0.016);
      grazeOk = Boolean(test.enemyBullets[0] && test.enemyBullets[0].grazed && test.stats && test.stats.grazes === 1 && test.score === 15);
    } finally {
      state = previous;
      ui = previousUi;
      input.mouse.down = previousMouseDown;
      input.keys = previousKeys;
    }
    if (firstScore !== 20 || chainScore !== 45 || lightDrop || !bruteDrop || !eliteDrop || healed !== 68 || capped !== 100 || cappedScore !== 0 || overflowScore !== REPAIR_OVERFLOW_SCORE || overflowStatus.indexOf('REPAIR SCRAP FULL +12 SCORE') !== 0 || repairStatus.indexOf('REPAIR SCRAP +18 HULL') !== 0 || bountyScore !== 57 || secondBountyScore !== 82 || !bountyClaimed || bountySurge !== BOUNTY_SURGE_DURATION || retainedSurge !== 5 || !stormClock || !waveReset || artilleryScore !== 60 || !grazeOk) throw new Error('LunaGame self-check failed');
    return { ok: true, upgrades: UPGRADES.length, controls: 'WASD/arrows + mouse hold', combo: '4s chain window', overdrive: '6s elite core', repair: '18 hp brute/elite scrap', bounty: 'one-shot wave reward', surge: '3s bounty overdrive', overflow: '12 score full repair', storm: '5s front pressure' };
  }


  var api = {
    init: init,
    restart: restart,
    pause: pause,
    resume: resume,
    destroy: destroy,
    getState: function () { return state; },
    getPlayroom: function () { return Playroom; },
    getAudio: function () { return AudioFX; },
    triggerGameOver: triggerGameOver,
    selfCheck: selfCheck
  };

  if (typeof window !== 'undefined') {
    window.LunaGame = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); }, { once: true });
    else window.setTimeout(function () { init(); }, 0);
  } else if (typeof global !== 'undefined') {
    global.LunaGame = api;
  }
}());
