import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.resolve(ROOT_DIR, 'output', 'test-screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function createStaticServer(port) {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURI(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const safePath = path.normalize(path.join(ROOT_DIR, reqPath));
    if (!safePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(safePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[HTTP] Static server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) {
            reject(new Error(`CDP Error [${msg.error.code}]: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        } else if (msg.method) {
          const listeners = this.eventListeners.get(msg.method) || [];
          for (const fn of listeners) fn(msg.params);
        }
      } catch (err) {
        console.error('[CDP] Message parse error:', err);
      }
    };
  }

  on(method, callback) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(callback);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(code) {
    const trimmed = code.trim();
    const expression = `(() => {
      try {
        return eval(${JSON.stringify(trimmed)});
      } catch (err) {
        throw err;
      }
    })()`;
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Eval error: ${desc}`);
    }
    return res.result?.value;
  }

  async dispatchKeyEvent(type, key, code, text = '') {
    await this.send('Input.dispatchKeyEvent', {
      type,
      key,
      code,
      text: text || (type === 'char' ? key : undefined),
      unmodifiedText: text || (type === 'char' ? key : undefined)
    });
  }

  async dispatchMouseEvent(type, x, y, options = {}) {
    await this.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: options.button || 'none',
      buttons: options.buttons || 0,
      clickCount: options.clickCount || 0
    });
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[Screenshot] Saved: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return outPath;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function runTests() {
  const HTTP_PORT = 8910;
  const CDP_PORT = 9222;
  const server = await createStaticServer(HTTP_PORT);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const profileDir = path.join(os.tmpdir(), `dust_reign_chrome_${Date.now()}`);

  console.log(`[Chrome] Launching headless Chrome from: ${chromePath}`);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1280,720',
    `--user-data-dir=${profileDir}`
  ], { stdio: 'ignore' });

  // Wait for CDP to respond
  let connected = false;
  let attempts = 0;
  while (!connected && attempts < 20) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) connected = true;
    } catch (e) {
      attempts++;
    }
  }

  if (!connected) {
    chromeProc.kill();
    server.close();
    throw new Error('Chrome failed to start on CDP port within 4 seconds');
  }

  console.log('[Chrome] CDP ready. Creating target page...');
  const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${HTTP_PORT}/index.html`, { method: 'PUT' });
  const targetData = await newTargetRes.json();
  const wsUrl = targetData.webSocketDebuggerUrl;

  const client = new CDPClient(wsUrl);
  await client.connect();

  const exceptions = [];
  const consoleErrors = [];
  const consoleLogs = [];

  client.on('Runtime.exceptionThrown', (params) => {
    const details = params.exceptionDetails;
    const msg = details.exception?.description || details.text;
    console.error('[Browser Exception]', msg);
    exceptions.push({
      timestamp: Date.now(),
      text: details.text,
      description: msg,
      stack: details.stackTrace
    });
  });

  client.on('Runtime.consoleAPICalled', (params) => {
    const text = params.args.map((a) => a.value || a.description || '').join(' ');
    consoleLogs.push({ type: params.type, text });
    if (params.type === 'error') {
      console.error('[Browser console.error]', text);
      consoleErrors.push({ text, type: params.type });
    } else if (params.type === 'warning') {
      console.warn('[Browser console.warn]', text);
    }
  });

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');

  console.log('[Page] Loading and initializing game...');
  // Wait for window.LunaGame to be initialized
  let gameReady = false;
  for (let i = 0; i < 30; i++) {
    const ready = await client.evaluate('Boolean(window.LunaGame && window.LunaGame.getState())');
    if (ready) {
      gameReady = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!gameReady) {
    throw new Error('LunaGame failed to initialize on DOM ready');
  }

  const testReport = {
    startedAt: new Date().toISOString(),
    tests: [],
    exceptions: [],
    consoleErrors: []
  };

  function recordStep(name, passed, details = {}) {
    const item = { name, passed, details };
    testReport.tests.push(item);
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[Test] [${status}] ${name} ${Object.keys(details).length ? JSON.stringify(details) : ''}`);
    if (!passed) {
      console.error(`  --> FAILURE DETAILS:`, details);
    }
  }

  try {
    // ==========================================
    // 1. Start Screen & Loadout Testing
    // ==========================================
    console.log('\n--- 1. Testing Start Screen & Loadout ---');

    // Unlock all rigs and max heat in localStorage for testing
    await client.evaluate(`
      localStorage.setItem('dust-reign:meta:v1', JSON.stringify({
        v: 1,
        selectedRig: 'scrapper',
        selectedWeapon: 'standard',
        selectedHeat: 0,
        selectedMode: 'standard',
        heatUnlocked: 5,
        unlockedRigs: ['scrapper', 'strider', 'bulwark', 'salvager'],
        achievements: {},
        stats: { runs: 0, kills: 0, justDashes: 0, contracts: 0, extractions: 0, bestWave: 0, bossKills: {}, fusionsSeen: [], playTimeSec: 0, seenEnemies: [] }
      }));
      window.LunaGame.restart();
    `);
    await new Promise((r) => setTimeout(r, 200));

    // Verify start screen is displayed
    const startScreenVisible = await client.evaluate('!document.getElementById("startScreen").hidden');
    recordStep('Start screen is visible in standby', startScreenVisible === true);

    // Test switching rigs: Strider, Bulwark, Salvager, Scrapper
    const rigsToTest = ['strider', 'bulwark', 'salvager', 'scrapper'];
    for (const rigId of rigsToTest) {
      await client.evaluate(`
        const btn = document.querySelector('[data-rig="${rigId}"]');
        if (btn) btn.click();
      `);
      await new Promise((r) => setTimeout(r, 100));
      const activeRig = await client.evaluate(`
        const sel = document.querySelector('#loadoutPanel [data-rig="${rigId}"]');
        Boolean(sel && sel.classList.contains('is-selected'))
      `);
      recordStep(`Select Rig: ${rigId}`, activeRig === true, { rigId });
    }

    // Test switching weapons: Breacher, Vanguard, Arc-Welder, Standard
    const weaponsToTest = ['breacher', 'vanguard', 'arc-welder', 'standard'];
    for (const weaponId of weaponsToTest) {
      await client.evaluate(`
        const btn = document.querySelector('[data-weapon="${weaponId}"]');
        if (btn) btn.click();
      `);
      await new Promise((r) => setTimeout(r, 100));
      const activeWeapon = await client.evaluate(`
        const sel = document.querySelector('#loadoutPanel [data-weapon="${weaponId}"]');
        Boolean(sel && sel.classList.contains('is-selected'))
      `);
      recordStep(`Select Weapon: ${weaponId}`, activeWeapon === true, { weaponId });
    }

    // Test heat adjustments
    await client.evaluate(`
      const heatUp = document.querySelector('#loadoutPanel [aria-label="Raise Heat"]');
      if (heatUp) heatUp.click();
    `);
    await new Promise((r) => setTimeout(r, 50));
    let heatVal = await client.evaluate(`
      const val = document.querySelector('#loadoutPanel .loadout-heat-value');
      val ? val.textContent : ''
    `);
    recordStep('Heat step up to 1', heatVal.includes('1'), { text: heatVal });

    await client.evaluate(`
      const heatUp = document.querySelector('#loadoutPanel [aria-label="Raise Heat"]');
      if (heatUp) heatUp.click();
    `);
    await new Promise((r) => setTimeout(r, 50));
    heatVal = await client.evaluate(`
      const val = document.querySelector('#loadoutPanel .loadout-heat-value');
      val ? val.textContent : ''
    `);
    recordStep('Heat step up to 2', heatVal.includes('2'), { text: heatVal });

    await client.evaluate(`
      const heatDown = document.querySelector('#loadoutPanel [aria-label="Lower Heat"]');
      if (heatDown) heatDown.click();
    `);
    await new Promise((r) => setTimeout(r, 50));
    heatVal = await client.evaluate(`
      const val = document.querySelector('#loadoutPanel .loadout-heat-value');
      val ? val.textContent : ''
    `);
    recordStep('Heat step down to 1', heatVal.includes('1'), { text: heatVal });

    await client.captureScreenshot('01-start-loadout.png');

    // Test Codex button, tab cycling, and close modal
    console.log('\n--- Testing Codex Modal ---');
    await client.evaluate(`document.getElementById('codexOpenBtn').click();`);
    await new Promise((r) => setTimeout(r, 150));
    const codexOpen = await client.evaluate('!document.getElementById("codexPanel").hidden');
    recordStep('Open Codex modal', codexOpen === true);

    const codexTabs = ['achievements', 'enemies', 'fusions', 'stats'];
    for (const tabName of codexTabs) {
      await client.evaluate(`
        const tab = document.querySelector('[data-codex-tab="${tabName}"]');
        if (tab) tab.click();
      `);
      await new Promise((r) => setTimeout(r, 100));
      const tabInfo = await client.evaluate(`
        const tab = document.querySelector('[data-codex-tab="${tabName}"]');
        const body = document.getElementById('codexBody');
        ({
          selected: Boolean(tab && tab.classList.contains('is-selected')),
          cardsCount: body ? body.querySelectorAll('.codex-card').length : 0
        })
      `);
      recordStep(`Codex Tab: ${tabName}`, tabInfo.selected && tabInfo.cardsCount > 0, tabInfo);
    }

    await client.captureScreenshot('02-codex-modal.png');

    // Close Codex
    await client.evaluate(`document.getElementById('codexCloseBtn').click();`);
    await new Promise((r) => setTimeout(r, 100));
    const codexClosed = await client.evaluate('Boolean(document.getElementById("codexPanel").hidden)');
    recordStep('Close Codex modal', codexClosed === true);

    // Click 'ENTER THE DUST' (踏入塵暴) to start the run
    console.log('\n--- Starting Game Run ---');
    await client.evaluate(`document.getElementById('startBtn').click();`);
    await new Promise((r) => setTimeout(r, 200));

    const runStartedState = await client.evaluate(`
      ({
        startHidden: document.getElementById('startScreen').hidden,
        runState: document.getElementById('runState').textContent,
        paused: window.LunaGame.getState().paused,
        playerHp: window.LunaGame.getState().player.hp
      })
    `);
    recordStep('ENTER THE DUST starts run', runStartedState.startHidden && !runStartedState.paused && runStartedState.playerHp > 0, runStartedState);

    await client.captureScreenshot('03-combat-started.png');

    // ==========================================
    // 2. In-Game Combat & Input Simulation
    // ==========================================
    console.log('\n--- 2. Testing Movement & Combat Input ---');

    // Test WASD movement
    const initialPos = await client.evaluate(`({ x: window.LunaGame.getState().player.x, y: window.LunaGame.getState().player.y })`);

    // Move Right (D)
    await client.dispatchKeyEvent('rawKeyDown', 'd', 'KeyD');
    await new Promise((r) => setTimeout(r, 250));
    await client.dispatchKeyEvent('keyUp', 'd', 'KeyD');
    const posAfterD = await client.evaluate(`({ x: window.LunaGame.getState().player.x, y: window.LunaGame.getState().player.y })`);
    recordStep('Move Right (D)', posAfterD.x > initialPos.x, { from: initialPos.x, to: posAfterD.x });

    // Move Down (S)
    await client.dispatchKeyEvent('rawKeyDown', 's', 'KeyS');
    await new Promise((r) => setTimeout(r, 250));
    await client.dispatchKeyEvent('keyUp', 's', 'KeyS');
    const posAfterS = await client.evaluate(`({ x: window.LunaGame.getState().player.x, y: window.LunaGame.getState().player.y })`);
    recordStep('Move Down (S)', posAfterS.y > posAfterD.y, { from: posAfterD.y, to: posAfterS.y });

    // Move Left (A)
    await client.dispatchKeyEvent('rawKeyDown', 'a', 'KeyA');
    await new Promise((r) => setTimeout(r, 250));
    await client.dispatchKeyEvent('keyUp', 'a', 'KeyA');
    const posAfterA = await client.evaluate(`({ x: window.LunaGame.getState().player.x, y: window.LunaGame.getState().player.y })`);
    recordStep('Move Left (A)', posAfterA.x < posAfterS.x, { from: posAfterS.x, to: posAfterA.x });

    // Move Up (W)
    await client.dispatchKeyEvent('rawKeyDown', 'w', 'KeyW');
    await new Promise((r) => setTimeout(r, 250));
    await client.dispatchKeyEvent('keyUp', 'w', 'KeyW');
    const posAfterW = await client.evaluate(`({ x: window.LunaGame.getState().player.x, y: window.LunaGame.getState().player.y })`);
    recordStep('Move Up (W)', posAfterW.y < posAfterA.y, { from: posAfterA.y, to: posAfterW.y });

    // Aiming & Firing: Mouse coordinates on canvas
    const canvasBox = await client.evaluate(`
      const rect = document.getElementById('gameCanvas').getBoundingClientRect();
      ({ x: rect.left + 200, y: rect.top + 150 })
    `);
    // Aim towards point
    await client.dispatchMouseEvent('mouseMoved', canvasBox.x, canvasBox.y);
    // Mouse down on canvas (LMB)
    await client.dispatchMouseEvent('mousePressed', canvasBox.x, canvasBox.y, { button: 'left', buttons: 1, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 400));
    const bulletsFired = await client.evaluate('window.LunaGame.getState().bullets.length');
    await client.dispatchMouseEvent('mouseReleased', canvasBox.x, canvasBox.y, { button: 'left', buttons: 0, clickCount: 1 });
    recordStep('Aim & Fire (LMB)', bulletsFired > 0, { bulletsCount: bulletsFired });

    // Dash (Spacebar)
    await client.dispatchKeyEvent('rawKeyDown', ' ', 'Space');
    await new Promise((r) => setTimeout(r, 50));
    await client.dispatchKeyEvent('keyUp', ' ', 'Space');
    const dashActive = await client.evaluate(`
      const p = window.LunaGame.getState().player;
      p.dashCooldown > 0 || p.isDashing
    `);
    recordStep('Dash (Spacebar)', dashActive === true);

    // EMP (Q key)
    // Make sure player has battery
    await client.evaluate('window.LunaGame.getState().player.energy = 50;');
    await client.dispatchKeyEvent('rawKeyDown', 'q', 'KeyQ');
    await new Promise((r) => setTimeout(r, 50));
    await client.dispatchKeyEvent('keyUp', 'q', 'KeyQ');
    const empActive = await client.evaluate(`
      const s = window.LunaGame.getState();
      (s.shockRings && s.shockRings.length > 0) || s.player.energy < 50
    `);
    recordStep('EMP Blast (Q key)', empActive === true);

    await client.captureScreenshot('04-active-combat.png');

    // ==========================================
    // Leveling up & Salvage Cache Modal Testing
    // ==========================================
    console.log('\n--- Testing Level Up & Salvage Cache Modal ---');

    // Spawn a scrap orb directly on the player to trigger realistic orb pickup & level up
    await client.evaluate(`
      const s = window.LunaGame.getState();
      s.orbs.push({
        x: s.player.x,
        y: s.player.y,
        vx: 0,
        vy: 0,
        r: 10,
        value: s.xpNext || 100,
        kind: 'scrap',
        life: 15
      });
    `);
    await new Promise((r) => setTimeout(r, 300));

    const upgradeModalState = await client.evaluate(`
      const s = window.LunaGame.getState();
      ({
        paused: s.paused,
        choicesLength: s.upgradeChoices ? s.upgradeChoices.length : 0,
        overlayHidden: document.getElementById('upgradePanel').hidden,
        rerolls: s.rerolls,
        banishes: s.banishes
      })
    `);
    recordStep('Level Up triggers upgrade modal', upgradeModalState.paused && upgradeModalState.choicesLength === 3 && !upgradeModalState.overlayHidden, upgradeModalState);

    await client.captureScreenshot('05-upgrade-modal.png');

    // Test Reroll
    if (upgradeModalState.rerolls > 0) {
      const cardsBeforeReroll = await client.evaluate(`
        Array.from(document.querySelectorAll('#upgradeChoices .upgrade-card strong')).map(s => s.textContent)
      `);
      await client.evaluate(`document.getElementById('upgradeRerollBtn').click();`);
      await new Promise((r) => setTimeout(r, 300));
      const rerollResult = await client.evaluate(`
        const s = window.LunaGame.getState();
        ({
          newRerolls: s.rerolls,
          cards: Array.from(document.querySelectorAll('#upgradeChoices .upgrade-card strong')).map(s => s.textContent)
        })
      `);
      recordStep('Upgrade Reroll button', rerollResult.newRerolls === upgradeModalState.rerolls - 1, {
        before: cardsBeforeReroll,
        after: rerollResult.cards,
        remainingRerolls: rerollResult.newRerolls
      });
    }

    // Test Banish
    if (upgradeModalState.banishes > 0) {
      await client.evaluate(`document.getElementById('upgradeBanishBtn').click();`);
      await new Promise((r) => setTimeout(r, 100));
      const banishArmed = await client.evaluate(`
        const s = window.LunaGame.getState();
        const btn = document.getElementById('upgradeBanishBtn');
        Boolean(s.banishPicking && btn.classList.contains('is-armed'))
      `);
      recordStep('Banish button arms banish mode', banishArmed === true);

      // Banish choice 2
      const targetBanishId = await client.evaluate(`
        const s = window.LunaGame.getState();
        s.upgradeChoices[1] ? s.upgradeChoices[1].id : ''
      `);
      await client.evaluate(`
        const cards = document.querySelectorAll('#upgradeChoices .upgrade-card');
        if (cards[1]) cards[1].click();
      `);
      await new Promise((r) => setTimeout(r, 300));
      const banishResult = await client.evaluate(`
        const s = window.LunaGame.getState();
        ({
          banishedList: s.banished,
          banishesLeft: s.banishes,
          isBanishPicking: s.banishPicking
        })
      `);
      recordStep('Banish card execution', banishResult.banishedList.includes(targetBanishId), banishResult);
    }

    // Test Skip
    await client.evaluate(`document.getElementById('upgradeSkipBtn').click();`);
    await new Promise((r) => setTimeout(r, 300));
    const skipResult = await client.evaluate(`
      const s = window.LunaGame.getState();
      ({
        modalHidden: document.getElementById('upgradePanel').hidden,
        paused: s.paused,
        choicesEmpty: s.upgradeChoices.length === 0
      })
    `);
    recordStep('Skip upgrade card', skipResult.modalHidden && !skipResult.paused && skipResult.choicesEmpty, skipResult);

    // Trigger another level up to test selecting Card 1
    console.log('\n--- Testing Upgrade Selection (Card 1) ---');
    await client.evaluate(`
      const s = window.LunaGame.getState();
      s.orbs.push({
        x: s.player.x,
        y: s.player.y,
        vx: 0,
        vy: 0,
        r: 10,
        value: s.xpNext || 100,
        kind: 'scrap',
        life: 15
      });
    `);
    await new Promise((r) => setTimeout(r, 300));

    const card1Info = await client.evaluate(`
      const s = window.LunaGame.getState();
      s.upgradeChoices && s.upgradeChoices[0] ? s.upgradeChoices[0].id : null
    `);

    // Click Card 1
    await client.evaluate(`
      const card = document.querySelector('#upgradeChoices .upgrade-card');
      if (card) card.click();
    `);
    await new Promise((r) => setTimeout(r, 300));

    const pickResult = await client.evaluate(`
      const s = window.LunaGame.getState();
      ({
        modalHidden: document.getElementById('upgradePanel').hidden,
        paused: s.paused,
        installed: Boolean(s.acquiredUpgrades && s.acquiredUpgrades.some(u => u && u.id === ${JSON.stringify(card1Info)}))
      })
    `);
    recordStep('Select Upgrade Card 1', pickResult.modalHidden && !pickResult.paused, pickResult);

    // ==========================================
    // 3. Pause Menus & Audio Testing
    // ==========================================
    console.log('\n--- 3. Testing Pause Menus & Audio ---');

    // Click topbar pause button
    await client.evaluate(`document.getElementById('pauseBtn').click();`);
    await new Promise((r) => setTimeout(r, 200));

    const pauseOpen = await client.evaluate(`
      const modal = document.getElementById('pauseModal');
      const s = window.LunaGame.getState();
      Boolean(!modal.hidden && s.paused)
    `);
    recordStep('Pause game via topbar button', pauseOpen === true);

    await client.captureScreenshot('06-pause-system-tab.png');

    // Switch to Rig Build tab
    await client.evaluate(`document.getElementById('tabBtnBuild').click();`);
    await new Promise((r) => setTimeout(r, 150));
    const buildTabInfo = await client.evaluate(`
      const panel = document.getElementById('panelBuild');
      const statsGrid = document.querySelector('.build-stats-grid');
      ({
        panelVisible: !panel.hidden && panel.classList.contains('is-active'),
        statsCardsCount: statsGrid ? statsGrid.querySelectorAll('.build-stat-card').length : 0
      })
    `);
    recordStep('Pause tab: Rig Build Inspector', buildTabInfo.panelVisible && buildTabInfo.statsCardsCount > 0, buildTabInfo);

    await client.captureScreenshot('07-pause-build-tab.png');

    // Switch to Controls tab
    await client.evaluate(`document.getElementById('tabBtnControls').click();`);
    await new Promise((r) => setTimeout(r, 150));
    const controlsTabInfo = await client.evaluate(`
      const panel = document.getElementById('panelControls');
      const rows = document.querySelectorAll('.controls-matrix-row');
      ({
        panelVisible: !panel.hidden && panel.classList.contains('is-active'),
        rowsCount: rows.length
      })
    `);
    recordStep('Pause tab: Controls Matrix', controlsTabInfo.panelVisible && controlsTabInfo.rowsCount > 0, controlsTabInfo);

    // Switch back to System tab and toggle Audio
    await client.evaluate(`document.getElementById('tabBtnSystem').click();`);
    await new Promise((r) => setTimeout(r, 150));

    const audioInitialMute = await client.evaluate('window.LunaGame.getAudio().isMuted()');
    await client.evaluate(`document.getElementById('toggleAudioMute').click();`);
    await new Promise((r) => setTimeout(r, 50));
    const audioAfterToggle = await client.evaluate('window.LunaGame.getAudio().isMuted()');
    recordStep('Toggle Audio Mute setting', audioAfterToggle !== audioInitialMute, { initial: audioInitialMute, after: audioAfterToggle });

    // Toggle back via topbar audio button
    await client.evaluate(`document.getElementById('audioBtn').click();`);
    await new Promise((r) => setTimeout(r, 50));
    const audioAfterTopbar = await client.evaluate('window.LunaGame.getAudio().isMuted()');
    recordStep('Toggle Audio via Topbar button', audioAfterTopbar === audioInitialMute, { current: audioAfterTopbar });

    // Resume Combat
    await client.evaluate(`document.getElementById('pauseResumeBtn').click();`);
    await new Promise((r) => setTimeout(r, 200));
    const resumedState = await client.evaluate(`
      const modal = document.getElementById('pauseModal');
      const s = window.LunaGame.getState();
      Boolean(modal.hidden && !s.paused)
    `);
    recordStep('Resume Combat via pauseResumeBtn', resumedState === true);

    // ==========================================
    // 4. Game Over & Restart Testing
    // ==========================================
    console.log('\n--- 4. Testing Game Over & Restart ---');

    // Simulate fatal player damage
    await client.evaluate(`
      window.LunaGame.triggerGameOver();
    `);
    await new Promise((r) => setTimeout(r, 800)); // wait for deathSequenceTimer (0.55s)

    const gameOverInfo = await client.evaluate(`
      const s = window.LunaGame.getState();
      const screen = document.getElementById('gameOverScreen');
      ({
        screenVisible: !screen.hidden,
        isOver: s.over,
        finalScore: document.getElementById('finalScore').textContent,
        finalWave: document.getElementById('finalWave').textContent,
        telAccuracy: document.getElementById('telAccuracy').textContent,
        telMaxCombo: document.getElementById('telMaxCombo').textContent,
        telGrazes: document.getElementById('telGrazes').textContent,
        telDamage: document.getElementById('telDamage').textContent,
        combatRankLetter: document.getElementById('combatRankLetter').textContent,
        combatRankTitle: document.getElementById('combatRankTitle').textContent
      })
    `);
    recordStep('Game Over triggered and displayed', gameOverInfo.screenVisible && gameOverInfo.isOver, gameOverInfo);

    await client.captureScreenshot('08-game-over-screen.png');

    // Click 'RUN IT BACK' (再次出擊) to restart
    console.log('\n--- Testing RUN IT BACK restart ---');
    await client.evaluate(`document.getElementById('restartBtn').click();`);
    await new Promise((r) => setTimeout(r, 300));

    const postRestartState = await client.evaluate(`
      const s = window.LunaGame.getState();
      ({
        gameOverHidden: document.getElementById('gameOverScreen').hidden,
        startScreenVisible: !document.getElementById('startScreen').hidden,
        runState: document.getElementById('runState').textContent,
        paused: s.paused,
        playerHp: s.player.hp,
        bulletsCount: s.bullets.length,
        enemiesCount: s.enemies.length
      })
    `);
    recordStep('RUN IT BACK returns cleanly to standby loadout',
      postRestartState.gameOverHidden &&
      postRestartState.startScreenVisible &&
      postRestartState.runState === 'STANDBY' &&
      postRestartState.paused === true &&
      postRestartState.playerHp > 0,
      postRestartState
    );

    await client.captureScreenshot('09-post-restart-standby.png');

  } catch (err) {
    console.error('[Test Execution Error]', err);
    recordStep('Test execution unhandled error', false, { error: err.message, stack: err.stack });
  } finally {
    // Record all captured browser errors
    testReport.exceptions = exceptions;
    testReport.consoleErrors = consoleErrors;
    testReport.consoleLogsCount = consoleLogs.length;

    console.log('\n==========================================');
    console.log('            TEST RESULTS SUMMARY          ');
    console.log('==========================================');
    const passedCount = testReport.tests.filter((t) => t.passed).length;
    const totalCount = testReport.tests.length;
    console.log(`Passed: ${passedCount} / ${totalCount}`);
    console.log(`Unhandled Exceptions: ${exceptions.length}`);
    console.log(`Console Errors: ${consoleErrors.length}`);

    if (exceptions.length > 0) {
      console.log('\n--- Unhandled Exceptions ---');
      for (const ex of exceptions) console.log(ex);
    }
    if (consoleErrors.length > 0) {
      console.log('\n--- Console Errors ---');
      for (const ce of consoleErrors) console.log(ce);
    }

    const reportPath = path.join(ROOT_DIR, 'output', 'browser-gameplay-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(testReport, null, 2));
    console.log(`\nTest report saved to: ${reportPath}`);

    client.close();
    chromeProc.kill();
    server.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runTests().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
