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

async function main() {
  const HTTP_PORT = 8915;
  const CDP_PORT = 9225;
  const server = await createStaticServer(HTTP_PORT);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const profileDir = path.join(os.tmpdir(), `dust_reign_contrast_${Date.now()}`);

  console.log(`[Chrome] Launching Chrome from: ${chromePath}`);
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

  let connected = false;
  let attempts = 0;
  while (!connected && attempts < 25) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) connected = true;
    } catch {
      attempts++;
    }
  }

  if (!connected) {
    chromeProc.kill();
    server.close();
    throw new Error('Chrome failed to start on CDP port');
  }

  console.log('[Chrome] Creating target page...');
  const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${HTTP_PORT}/index.html`, { method: 'PUT' });
  const targetData = await newTargetRes.json();
  const wsUrl = targetData.webSocketDebuggerUrl;

  const client = new CDPClient(wsUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');

  console.log('[Game] Waiting for game to initialize...');
  for (let i = 0; i < 30; i++) {
    const ready = await client.evaluate('Boolean(window.LunaGame && window.LunaGame.getState())');
    if (ready) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Start game run
  await client.evaluate(`
    const startBtn = document.getElementById('startBtn');
    if (startBtn) startBtn.click();
    else if (window.LunaGame.beginRun) window.LunaGame.beginRun();
  `);
  await new Promise((r) => setTimeout(r, 600));

  // Populate visual showcase elements
  await client.evaluate(`
    const st = window.LunaGame.getState();
    if (st) {
      // Clear banner overlay
      st.banner = 0;
      st.bannerText = '';
      st.paused = true; // freeze simulation so our showcase state remains stable

      const w = (window.LunaGame.rt && window.LunaGame.rt.ui && window.LunaGame.rt.ui.width) || 960;
      const h = (window.LunaGame.rt && window.LunaGame.rt.ui && window.LunaGame.rt.ui.height) || 540;
      const cx = w * 0.5;
      const cy = h * 0.52;

      // Place player
      if (st.player) {
        st.player.x = cx;
        st.player.y = cy;
      }

      // Drops: Scrap, Repair Scrap, Overclock Core, Crates (Battery, Reroll)
      st.orbs = [
        { kind: 'scrap', type: 'scrap', x: cx - 140, y: cy - 70, r: 10, value: 1 },
        { kind: 'repair', type: 'repair', x: cx - 60, y: cy - 70, r: 12, value: 0 },
        { kind: 'overdrive', type: 'overdrive', x: cx + 20, y: cy - 70, r: 12, value: 0 },
        { kind: 'crate', type: 'crate', payload: 'battery', x: cx + 100, y: cy - 70, r: 13, value: 0 },
        { kind: 'crate', type: 'crate', payload: 'reroll', x: cx + 170, y: cy - 70, r: 13, value: 0 }
      ];

      // Ground Hazards: Acid Pool, Artillery Warning, Molten Zone, Plasma Zone
      st.acidPools = [
        { x: cx - 180, y: cy + 50, r: 42, timer: 3.5, maxTimer: 5.0 }
      ];

      st.artilleryTargets = [
        { x: cx + 160, y: cy + 50, r: 40, state: 'warning', timer: 0.5, maxTimer: 1.0 },
        { x: cx + 270, y: cy + 40, r: 36, state: 'molten', timer: 2.5, maxTimer: 3.5 }
      ];

      st.plasmaZones = [
        { x: cx - 50, y: cy + 110, r: 36, timer: 2.5, maxTimer: 3.5 }
      ];

      // Telegraph: Lightning Corridor
      st.lightningStrikes = [
        { x1: cx - 350, y1: cy + 180, x2: cx + 350, y2: cy + 180, width: 28, warning: true, timer: 0.7, maxTimer: 1.0 }
      ];

      // Enemies
      st.enemies = [
        { kind: 'mine', x: cx - 260, y: cy - 70, r: 10, hp: 20, maxHp: 20, arming: false },
        { kind: 'rusher', x: cx - 270, y: cy + 30, r: 12, hp: 30, maxHp: 30, face: 0 },
        { kind: 'scurrier', x: cx - 110, y: cy + 90, r: 10, hp: 15, maxHp: 15, arming: true, armTimer: 0.2 },
        { kind: 'brute', x: cx + 260, y: cy - 60, r: 24, hp: 120, maxHp: 120, face: Math.PI },
        { kind: 'sovereign', isBoss: true, x: cx, y: cy - 180, r: 28, hp: 500, maxHp: 600, eyeRadius: 280, eyeWarn: 0 }
      ];

      // Bullets
      st.bullets = [
        { x: cx + 40, y: cy - 5, vx: 300, vy: -30, r: 4, type: 'basic', life: 1 },
        { x: cx + 55, y: cy + 15, vx: 260, vy: 40, r: 5, type: 'piercing', life: 1 }
      ];

      st.enemyBullets = [
        { x: cx - 80, y: cy - 5, vx: -120, vy: 0, r: 4.5, type: 'flak', color: '#ff6238' },
        { x: cx - 110, y: cy + 25, vx: 0, vy: 140, r: 5, type: 'acid', color: '#c6e35a', targetX: cx - 180, targetY: cy + 50, flight: 0.7, age: 0.3 }
      ];
    }
  `);

  // 1. Dusk Palette Screenshot
  console.log('[Showcase] Setting Dusk palette (Sector 1)...');
  await client.evaluate(`
    const st = window.LunaGame.getState();
    if (st) {
      st.sector = 'dusk';
      st.wave = 1;
    }
  `);
  await new Promise((r) => setTimeout(r, 400));
  await client.captureScreenshot('contrast-showcase-dusk.png');

  // 2. Rust Palette Screenshot
  console.log('[Showcase] Setting Rust palette (Sector 2)...');
  await client.evaluate(`
    const st = window.LunaGame.getState();
    if (st) {
      st.sector = 'rust';
      st.wave = 3;
    }
  `);
  await new Promise((r) => setTimeout(r, 400));
  await client.captureScreenshot('contrast-showcase-rust.png');

  // 3. Night Palette Screenshot
  console.log('[Showcase] Setting Night palette (Sector 3)...');
  await client.evaluate(`
    const st = window.LunaGame.getState();
    if (st) {
      st.sector = 'night';
      st.wave = 5;
    }
  `);
  await new Promise((r) => setTimeout(r, 400));
  await client.captureScreenshot('contrast-showcase-night.png');

  // 4. High Contrast Screenshot
  console.log('[Showcase] Setting High Contrast mode on Rust palette...');
  await client.evaluate(`
    const st = window.LunaGame.getState();
    if (st) {
      st.sector = 'rust';
      st.wave = 3;
    }
    // Enable high contrast setting
    try {
      localStorage.setItem('dust_reign_high_contrast', 'true');
    } catch (e) {}
    document.body.classList.add('high-contrast');
  `);
  await new Promise((r) => setTimeout(r, 400));
  await client.captureScreenshot('contrast-showcase-high-contrast.png');

  console.log('[Showcase] All showcase screenshots successfully captured!');

  client.close();
  chromeProc.kill();
  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
