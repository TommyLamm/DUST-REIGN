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
  var UPGRADES = [
    { id: 'overcharge', title: 'OVERCHARGE', text: '+8 weapon damage', apply: function (s) { s.player.damage += 8; } },
    { id: 'quick-hands', title: 'QUICK HANDS', text: 'Fire 18% faster', apply: function (s) { s.player.fireRate *= 0.82; } },
    { id: 'field-medic', title: 'FIELD MEDIC', text: '+25 max health and heal', apply: function (s) { s.player.maxHp += 25; s.player.hp = Math.min(s.player.maxHp, s.player.hp + 40); } },
    { id: 'scavenger', title: 'SCAVENGER', text: '+25% experience from scraps', apply: function (s) { s.player.xpMult *= 1.25; } },
    { id: 'road-runner', title: 'ROAD RUNNER', text: '+35 move speed', apply: function (s) { s.player.speed += 35; } },
    { id: 'hot-load', title: 'HOT LOAD', text: '+180 bullet speed and size', apply: function (s) { s.player.bulletSpeed += 180; s.player.bulletSize += 1; } }
  ];

  var state = null;
  var ui = null;
  var raf = 0;
  var lastTime = 0;
  var started = false;
  var terrain = [];
  var listeners = [];
  var input = {
    keys: new Set(),
    mouse: { x: 480, y: 320, down: false }
  };

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
      kills: 0,
      wave: 1,
      waveTime: 0,
      spawnTimer: 0.5,
      banner: 1.8,
      shake: 0,
      hurtFlash: 0,
      player: {
        x: (width || 960) / 2,
        y: (height || 640) / 2,
        r: 15,
        speed: 235,
        hp: 100,
        maxHp: 100,
        damage: 26,
        fireRate: 0.18,
        cooldown: 0,
        bulletSpeed: 700,
        bulletSize: 4,
        xpMult: 1,
        aim: 0,
        invulnerable: 0,
        dashCooldown: 0
      },
      bullets: [],
      enemies: [],
      orbs: [],
      particles: [],
      upgradeChoices: []
    };
  }

  function randomUpgradeChoices() {
    var bag = UPGRADES.slice();
    var picks = [];
    while (picks.length < 3 && bag.length) {
      picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
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
    var finalWave = first(['#finalWave', '[data-final-wave]']);
    var finalScore = first(['#finalScore', '[data-final-score]']);

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
      runState: runState,
      statusText: statusText,
      finalWave: finalWave,
      finalScore: finalScore,
      createdCanvas: createdCanvas,
      createdOverlay: createdOverlay,
      width: 960,
      height: 640,
      dpr: 1
    };
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
    var width = Math.max(320, Math.round(rect.width || ui.canvas.clientWidth || ui.canvas.width || window.innerWidth || 960));
    var height = Math.max(240, Math.round(rect.height || ui.canvas.clientHeight || ui.canvas.height || window.innerHeight || 640));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var changed = width !== ui.width || height !== ui.height;
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
    on(window, 'keydown', function (event) {
      var key = event.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright' || key === ' ') event.preventDefault();
      input.keys.add(key);
      if (key === ' ' && !event.repeat) dash();
      if (state && state.paused && ui.startScreen && !ui.startScreen.hidden && key === 'enter') beginRun();
      if (state && state.over && key === 'r') restart();
      if (state && state.paused && (key === '1' || key === '2' || key === '3')) chooseUpgrade(Number(key) - 1);
    });
    on(window, 'keyup', function (event) { input.keys.delete(event.key.toLowerCase()); });
    on(ui.canvas, 'pointermove', pointerPosition);
    on(ui.canvas, 'pointerdown', function (event) {
      pointerPosition(event);
      if (ui.canvas.focus) ui.canvas.focus();
      if (state && state.over) { restart(); return; }
      if (event.button === undefined || event.button === 0) input.mouse.down = true;
      if (ui.canvas.setPointerCapture && event.pointerId !== undefined) ui.canvas.setPointerCapture(event.pointerId);
    });
    on(window, 'pointerup', function () { input.mouse.down = false; });
    on(window, 'blur', function () { input.keys.clear(); input.mouse.down = false; });
    on(window, 'resize', resize);
    if (ui.restart) on(ui.restart, 'click', restart);
    if (ui.startButton) on(ui.startButton, 'click', beginRun);
    var touchKeys = { touchUp: 'w', touchLeft: 'a', touchDown: 's', touchRight: 'd' };
    Object.keys(touchKeys).forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      on(button, 'pointerdown', function (event) { event.preventDefault(); beginRun(); input.keys.add(touchKeys[id]); });
      on(button, 'pointerup', function () { input.keys.delete(touchKeys[id]); });
      on(button, 'pointercancel', function () { input.keys.delete(touchKeys[id]); });
    });
    var touchShoot = document.getElementById('touchShoot');
    if (touchShoot) {
      on(touchShoot, 'pointerdown', function (event) { event.preventDefault(); beginRun(); input.mouse.down = true; });
      on(touchShoot, 'pointerup', function () { input.mouse.down = false; });
      on(touchShoot, 'pointercancel', function () { input.mouse.down = false; });
    }
    var touchDash = document.getElementById('touchDash');
    if (touchDash) on(touchDash, 'pointerdown', function (event) { event.preventDefault(); beginRun(); dash(); });
  }

  function beginRun() {
    if (!state || state.over) return;
    state.paused = false;
    if (ui.startScreen) ui.startScreen.hidden = true;
    if (ui.runState) ui.runState.textContent = 'LIVE';
    if (ui.statusText) ui.statusText.textContent = 'SIGNAL LIVE — KEEP MOVING';
    if (ui.canvas && ui.canvas.focus) ui.canvas.focus();
  }

  function restart() {
    if (!ui) return;
    state = makeState(ui.width, ui.height);
    state.player.x = ui.width / 2;
    state.player.y = ui.height / 2;
    input.mouse.x = ui.width / 2 + 100;
    input.mouse.y = ui.height / 2;
    input.mouse.down = false;
    ui.overlay.hidden = true;
    if (ui.startScreen) ui.startScreen.hidden = true;
    if (ui.gameOver) ui.gameOver.hidden = true;
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
    var kind = roll < 0.16 + Math.min(0.1, state.wave * 0.012) ? 'rusher' : roll > 0.87 ? 'brute' : 'crawler';
    var e;
    if (kind === 'brute') {
      e = { kind: kind, x: x, y: y, r: 23, hp: 125 + state.wave * 16, maxHp: 125 + state.wave * 16, speed: 32 + state.wave * 1.4, damage: 25 + state.wave * 1.6, color: '#bd573f', touchCooldown: 0, phase: Math.random() * TAU };
    } else if (kind === 'rusher') {
      e = { kind: kind, x: x, y: y, r: 10, hp: 26 + state.wave * 5, maxHp: 26 + state.wave * 5, speed: 91 + state.wave * 3.2, damage: 9 + state.wave * 0.8, color: '#e1a644', touchCooldown: 0, phase: Math.random() * TAU };
    } else {
      e = { kind: kind, x: x, y: y, r: 14, hp: 43 + state.wave * 7, maxHp: 43 + state.wave * 7, speed: 51 + state.wave * 2.1, damage: 13 + state.wave, color: '#8d7861', touchCooldown: 0, phase: Math.random() * TAU };
    }
    state.enemies.push(e);
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

  function shoot() {
    var p = state.player;
    if (p.cooldown > 0) return;
    var dx = input.mouse.x - p.x;
    var dy = input.mouse.y - p.y;
    var length = Math.hypot(dx, dy) || 1;
    var angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.035;
    p.aim = Math.atan2(dy, dx);
    var speed = p.bulletSpeed;
    state.bullets.push({
      x: p.x + Math.cos(angle) * (p.r + 8),
      y: p.y + Math.sin(angle) * (p.r + 8),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: p.bulletSize,
      damage: p.damage,
      life: 1.25,
      trail: []
    });
    p.cooldown = p.fireRate;
    spawnParticles(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, '#f7d48a', 4, 90, 2);
    state.shake = Math.max(state.shake, 2.5);
  }

  function dash() {
    if (!state || state.over || state.paused || state.player.dashCooldown > 0) return;
    var p = state.player;
    var dx = 0;
    var dy = 0;
    if (input.keys.has('w') || input.keys.has('arrowup')) dy -= 1;
    if (input.keys.has('s') || input.keys.has('arrowdown')) dy += 1;
    if (input.keys.has('a') || input.keys.has('arrowleft')) dx -= 1;
    if (input.keys.has('d') || input.keys.has('arrowright')) dx += 1;
    if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
    var length = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / length) * 140, p.r, ui.width - p.r);
    p.y = clamp(p.y + (dy / length) * 140, p.r, ui.height - p.r);
    p.dashCooldown = 2.2;
    p.invulnerable = Math.max(p.invulnerable, 0.32);
    state.shake = Math.max(state.shake, 5);
    spawnParticles(p.x, p.y, '#75d1b0', 16, 180, 3);
  }

  function addXp(amount) {
    var p = state.player;
    state.xp += Math.max(1, Math.round(amount * p.xpMult));
    if (state.xp >= state.xpNext) {
      state.xp -= state.xpNext;
      state.level += 1;
      state.xpNext = Math.round(state.xpNext * 1.24 + 28);
      state.paused = true;
      state.upgradeChoices = randomUpgradeChoices();
      renderUpgradePanel();
      spawnParticles(p.x, p.y, '#75d1b0', 18, 210, 3);
    }
  }

  function chooseUpgrade(index) {
    if (!state || !state.paused || !state.upgradeChoices[index]) return;
    state.upgradeChoices[index].apply(state);
    state.upgradeChoices = [];
    state.paused = false;
    ui.overlay.hidden = true;
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
        if (small) small.textContent = upgrade.text;
      });
      existing.slice(choices.length).forEach(function (button) { button.hidden = true; });
    } else {
      ui.optionsNode.innerHTML = '';
      choices.forEach(function (upgrade, index) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'upgrade-choice';
        button.dataset.upgradeIndex = String(index);
        button.innerHTML = '<strong>' + upgrade.title + '</strong><small>' + upgrade.text + '</small><em>' + (index + 1) + '</em>';
        button.style.cssText = 'position:relative;display:grid;gap:8px;min-width:190px;padding:20px 24px;background:#201e1b;color:#f5d494;border:1px solid #b98b52;border-radius:4px;text-align:left;cursor:pointer;font:inherit;';
        button.querySelector('small').style.cssText = 'color:#d0c4ad;font-size:.85em;';
        button.querySelector('em').style.cssText = 'position:absolute;right:10px;top:8px;color:#75d1b0;font-style:normal;font-size:.78em;';
        ui.optionsNode.appendChild(button);
      });
    }
    ui.overlay.hidden = false;
  }

  function killEnemy(index) {
    var e = state.enemies[index];
    if (!e) return;
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.score += e.kind === 'brute' ? 90 : e.kind === 'rusher' ? 35 : 20;
    state.orbs.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, r: 7, value: e.kind === 'brute' ? 34 : e.kind === 'rusher' ? 13 : 10, life: 28 });
    spawnParticles(e.x, e.y, e.color, e.kind === 'brute' ? 22 : 11, e.kind === 'brute' ? 220 : 150, e.kind === 'brute' ? 5 : 3);
    state.shake = Math.max(state.shake, e.kind === 'brute' ? 7 : 3);
  }

  function update(dt) {
    if (!state || state.over || state.paused) return;
    var p = state.player;
    state.waveTime += dt;
    state.banner = Math.max(0, state.banner - dt);
    state.shake = Math.max(0, state.shake - dt * 18);
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 3);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);

    if (state.waveTime >= WAVE_LENGTH) {
      state.waveTime -= WAVE_LENGTH;
      state.wave += 1;
      state.banner = 2.3;
      spawnParticles(p.x, p.y, '#e0a84e', 24, 230, 3);
      for (var wi = 0; wi < Math.min(3, 1 + Math.floor(state.wave / 4)); wi += 1) spawnEnemy();
    }

    var mx = 0;
    var my = 0;
    if (input.keys.has('w') || input.keys.has('arrowup')) my -= 1;
    if (input.keys.has('s') || input.keys.has('arrowdown')) my += 1;
    if (input.keys.has('a') || input.keys.has('arrowleft')) mx -= 1;
    if (input.keys.has('d') || input.keys.has('arrowright')) mx += 1;
    var moveLength = Math.hypot(mx, my) || 1;
    p.x = clamp(p.x + (mx / moveLength) * p.speed * dt, p.r, ui.width - p.r);
    p.y = clamp(p.y + (my / moveLength) * p.speed * dt, p.r, ui.height - p.r);
    var aimDx = input.mouse.x - p.x;
    var aimDy = input.mouse.y - p.y;
    if (aimDx || aimDy) p.aim = Math.atan2(aimDy, aimDx);
    if (input.mouse.down) shoot();

    state.spawnTimer -= dt;
    var enemyCap = Math.min(95, 5 + state.wave * 4);
    if (state.spawnTimer <= 0 && state.enemies.length < enemyCap) {
      spawnEnemy();
      state.spawnTimer = Math.max(0.24, 1.08 - state.wave * 0.045) * (0.78 + Math.random() * 0.38);
    }

    for (var bi = state.bullets.length - 1; bi >= 0; bi -= 1) {
      var b = state.bullets[bi];
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 4) b.trail.shift();
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      var hit = false;
      for (var ei = state.enemies.length - 1; ei >= 0; ei -= 1) {
        var enemy = state.enemies[ei];
        if (dist2(b.x, b.y, enemy.x, enemy.y) <= (b.r + enemy.r) * (b.r + enemy.r)) {
          enemy.hp -= b.damage;
          spawnParticles(b.x, b.y, '#f7d48a', 4, 80, 2);
          hit = true;
          if (enemy.hp <= 0) killEnemy(ei);
          break;
        }
      }
      if (hit || b.life <= 0 || b.x < -50 || b.y < -50 || b.x > ui.width + 50 || b.y > ui.height + 50) state.bullets.splice(bi, 1);
    }

    for (var oi = state.orbs.length - 1; oi >= 0; oi -= 1) {
      var orb = state.orbs[oi];
      var odx = p.x - orb.x;
      var ody = p.y - orb.y;
      var od = Math.hypot(odx, ody) || 1;
      if (od < 165) {
        var pull = (1 - od / 165) * 520;
        orb.vx += (odx / od) * pull * dt;
        orb.vy += (ody / od) * pull * dt;
      }
      orb.vx *= Math.pow(0.08, dt);
      orb.vy *= Math.pow(0.08, dt);
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      if (od < p.r + orb.r + 5) {
        addXp(orb.value);
        spawnParticles(orb.x, orb.y, '#75d1b0', 6, 90, 2);
        state.orbs.splice(oi, 1);
      } else if (orb.life <= 0) state.orbs.splice(oi, 1);
    }

    for (var j = state.enemies.length - 1; j >= 0; j -= 1) {
      var e = state.enemies[j];
      var dx = p.x - e.x;
      var dy = p.y - e.y;
      var d = Math.hypot(dx, dy) || 1;
      var speed = e.speed * (e.kind === 'rusher' ? 1 + Math.sin(state.waveTime * 5 + e.phase) * 0.08 : 1);
      e.x += (dx / d) * speed * dt;
      e.y += (dy / d) * speed * dt;
      e.touchCooldown = Math.max(0, e.touchCooldown - dt);
      if (d <= p.r + e.r && e.touchCooldown <= 0 && p.invulnerable <= 0) {
        p.hp -= e.damage;
        p.invulnerable = 0.7;
        e.touchCooldown = 0.85;
        state.shake = Math.max(state.shake, 10);
        state.hurtFlash = 0.55;
        spawnParticles(p.x, p.y, '#df6b4f', 10, 160, 3);
        if (p.hp <= 0) {
          p.hp = 0;
          state.over = true;
          input.mouse.down = false;
          if (ui.gameOver) ui.gameOver.hidden = false;
        }
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
  }

  function drawOrb(ctx, orb) {
    var pulse = 1 + Math.sin((orb.life * 5) + orb.x) * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#75d1b0';
    ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r * 2.8 * pulse, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#75d1b0';
    ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.r * pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d5f4d8';
    ctx.beginPath(); ctx.arc(orb.x - 2, orb.y - 2, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawEnemy(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.atan2(state.player.y - e.y, state.player.x - e.x));
    var bob = Math.sin(state.waveTime * 6 + e.phase) * (e.kind === 'rusher' ? 2 : 1);
    ctx.translate(0, bob);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.kind === 'rusher' ? 10 : 5;
    ctx.fillStyle = e.color;
    if (e.kind === 'brute') {
      ctx.beginPath();
      ctx.moveTo(e.r, 0); ctx.lineTo(e.r * .45, e.r * .82); ctx.lineTo(-e.r * .65, e.r * .74); ctx.lineTo(-e.r, 0); ctx.lineTo(-e.r * .65, -e.r * .74); ctx.lineTo(e.r * .45, -e.r * .82); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#452d2a'; ctx.fillRect(-e.r * .55, -4, e.r * .9, 8);
      ctx.fillStyle = '#efb45b'; ctx.fillRect(e.r * .05, -2, 5, 4);
    } else if (e.kind === 'rusher') {
      ctx.beginPath(); ctx.moveTo(e.r * 1.3, 0); ctx.lineTo(-e.r * .7, e.r * .9); ctx.lineTo(-e.r * .35, 0); ctx.lineTo(-e.r * .7, -e.r * .9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a3022'; ctx.beginPath(); ctx.arc(1, 0, 3, 0, TAU); ctx.fill();
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
  }

  function drawPlayer(ctx) {
    var p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
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
    ctx.fillStyle = '#e7bb69';
    ctx.fillRect(p.r * .45, -3, p.r + 11, 6);
    ctx.fillStyle = '#fbda8a';
    ctx.fillRect(p.r + 13, -2, 5, 4);
    ctx.restore();
  }

  function drawHud(ctx) {
    var p = state.player;
    ctx.save();
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textBaseline = 'top';
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
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(ui.width - 145, 58, 125, 4);
    ctx.fillStyle = '#d49a55'; ctx.fillRect(ui.width - 145, 58, 125 * clamp(state.waveTime / WAVE_LENGTH, 0, 1), 4);
    ctx.restore();
  }

  function drawOverlay(ctx) {
    if (state.banner > 0 && !state.over) {
      ctx.save();
      ctx.globalAlpha = clamp(Math.min(state.banner, 0.8), 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f0cf88';
      ctx.font = '700 26px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillText('WAVE ' + String(state.wave).padStart(2, '0'), ui.width / 2, ui.height * .2);
      ctx.restore();
    }
    if (state.over) {
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

  function draw() {
    if (!ui || !state) return;
    var ctx = ui.ctx;
    ctx.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
    var shakeX = state.shake ? (Math.random() - .5) * state.shake : 0;
    var shakeY = state.shake ? (Math.random() - .5) * state.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground(ctx);
    state.orbs.forEach(function (orb) { drawOrb(ctx, orb); });
    state.bullets.forEach(function (bullet) {
      ctx.save();
      for (var i = 0; i < bullet.trail.length; i += 1) {
        var point = bullet.trail[i];
        ctx.globalAlpha = (i + 1) / bullet.trail.length * .28;
        ctx.fillStyle = '#f6cf78';
        ctx.beginPath(); ctx.arc(point.x, point.y, bullet.r * (i + 1) / bullet.trail.length, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffe7a4';
      ctx.shadowColor = '#f2aa55'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.r, 0, TAU); ctx.fill();
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
    setText(ui.health, Math.ceil(state.player.hp));
    setText(ui.xp, state.xp);
    setText(ui.xpMax, state.xpNext);
    setText(ui.level, String(state.level).padStart(2, '0'));
    setText(ui.wave, String(state.wave).padStart(2, '0'));
    setText(ui.score, String(state.score).padStart(6, '0'));
    setText(ui.kills, state.kills + ' HOSTILES');
    if (ui.healthFill) ui.healthFill.style.width = (clamp(state.player.hp / state.player.maxHp, 0, 1) * 100) + '%';
    if (ui.xpFill) ui.xpFill.style.width = (clamp(state.xp / state.xpNext, 0, 1) * 100) + '%';
    if (ui.healthFill && ui.healthFill.parentElement) ui.healthFill.parentElement.setAttribute('aria-valuenow', String(Math.ceil(state.player.hp)));
    if (ui.xpFill && ui.xpFill.parentElement) ui.xpFill.parentElement.setAttribute('aria-valuenow', String(state.xp));
    if (ui.gameOver) ui.gameOver.hidden = !state.over;
    if (ui.finalWave) ui.finalWave.textContent = String(state.wave).padStart(2, '0');
    if (ui.finalScore) ui.finalScore.textContent = String(state.score).padStart(6, '0');
    if (ui.runState && state.over) ui.runState.textContent = 'SIGNAL LOST';
    else if (ui.runState && !ui.startScreen) ui.runState.textContent = 'LIVE';
    if (ui.statusText && state.over) ui.statusText.textContent = 'SIGNAL LOST — PRESS R TO REDEPLOY';
  }

  function frame(timestamp) {
    if (!started) return;
    var dt = lastTime ? Math.min(0.05, (timestamp - lastTime) / 1000) : 0;
    lastTime = timestamp;
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
    if (state && !state.over) state.paused = true;
  }

  function resume() {
    if (state && !state.over && !state.upgradeChoices.length) state.paused = false;
  }

  function destroy() {
    started = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    listeners.splice(0).forEach(function (remove) { remove(); });
    if (ui && ui.createdOverlay && ui.overlay.parentNode) ui.overlay.parentNode.removeChild(ui.overlay);
    if (ui && ui.createdCanvas && ui.canvas.parentNode) ui.canvas.parentNode.removeChild(ui.canvas);
    ui = null;
    state = null;
  }

  function selfCheck() {
    var test = makeState(320, 240);
    if (test.player.hp !== test.player.maxHp || UPGRADES.length < 3 || test.enemies.length !== 0) throw new Error('LunaGame self-check failed');
    return { ok: true, upgrades: UPGRADES.length, controls: 'WASD/arrows + mouse hold' };
  }

  var api = {
    init: init,
    restart: restart,
    pause: pause,
    resume: resume,
    destroy: destroy,
    getState: function () { return state; },
    selfCheck: selfCheck
  };

  if (typeof window !== 'undefined') {
    window.LunaGame = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); }, { once: true });
    else window.setTimeout(function () { init(); }, 0);
  }
}());
