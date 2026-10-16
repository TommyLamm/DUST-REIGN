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
      console.log(`[HTTP] Test server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

function findChrome() {
  const envPath = process.env.CHROME_BIN || process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Chrome executable not found');
}

class SimpleCDP {
  constructor(port) {
    this.port = port;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect(httpPort) {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const resp = await fetch(`http://127.0.0.1:${this.port}/json/version`);
        if (resp.ok) {
          connected = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!connected) throw new Error('Failed to query Chrome debug port');

    const newTargetRes = await fetch(`http://127.0.0.1:${this.port}/json/new?http://127.0.0.1:${httpPort}/index.html`, { method: 'PUT' });
    const targetData = await newTargetRes.json();

    const WebSocketClient = globalThis.WebSocket;
    this.ws = new WebSocketClient(targetData.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.writeFileSync(outPath, buffer);
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    console.log(`[Screenshot] Saved: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return outPath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const PORT = 8912;
  const CDP_PORT = 9224;
  const server = await createStaticServer(PORT);
  const chromePath = findChrome();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-campaign-test-'));

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,720',
    'about:blank'
  ]);

  const cdp = new SimpleCDP(CDP_PORT);
  await cdp.connect(PORT);
  console.log('[CDP] Connected to Chrome');

  try {
    await cdp.send('Page.enable');
    await new Promise((r) => setTimeout(r, 1200));

    console.log('\n--- 1. Testing Mode Switching (Standard -> Campaign -> Hardcore -> Daily) ---');

    // Click Campaign Mode tab
    const selectCampaignRes = await cdp.eval(`(() => {
      const btn = document.querySelector('[data-mode="campaign"]');
      if (!btn) return { ok: false, reason: 'No campaign tab button' };
      btn.click();
      const stageBar = document.getElementById('campaignStageBar');
      return {
        ok: true,
        modeActive: btn.classList.contains('is-selected') || btn.getAttribute('aria-checked') === 'true',
        stageBarVisible: stageBar && !stageBar.hidden
      };
    })()`);
    console.log('[Test] Switch to Campaign Mode:', selectCampaignRes);
    if (!selectCampaignRes.ok || !selectCampaignRes.modeActive) throw new Error('Campaign mode switch failed');

    // Capture Campaign Mode loadout screenshot
    await cdp.captureScreenshot('campaign-mode-loadout.png');

    // Open Campaign Modal
    const openModalRes = await cdp.eval(`(() => {
      const openBtn = document.getElementById('campaignSelectStageBtn');
      if (!openBtn) return { ok: false, reason: 'No stage select button' };
      openBtn.click();
      const modal = document.getElementById('campaignModal');
      const cards = document.querySelectorAll('.stage-card');
      return {
        ok: true,
        modalOpen: modal && !modal.hidden,
        cardsCount: cards.length
      };
    })()`);
    console.log('[Test] Open Campaign Modal:', openModalRes);
    if (!openModalRes.ok || !openModalRes.modalOpen) throw new Error('Campaign modal open failed');

    // Capture Campaign Modal screenshot
    await cdp.captureScreenshot('campaign-modal-stages.png');

    // Close modal
    await cdp.eval(`(() => {
      const closeBtn = document.getElementById('closeCampaignModalBtn');
      if (closeBtn) closeBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Switch to Hardcore Mode tab
    console.log('\n--- 2. Testing Hardcore Mode & Briefing ---');
    const selectHardcoreRes = await cdp.eval(`(() => {
      const btn = document.querySelector('[data-mode="hardcore"]');
      if (!btn) return { ok: false, reason: 'No hardcore tab button' };
      btn.click();
      const briefing = document.getElementById('hardcoreBriefingContainer');
      const lockBadges = document.querySelectorAll('.is-locked, .is-locked-by-rule');
      return {
        ok: true,
        modeActive: btn.classList.contains('is-selected') || btn.getAttribute('aria-checked') === 'true',
        briefingVisible: briefing && !briefing.hidden,
        lockBadgesCount: lockBadges.length
      };
    })()`);
    console.log('[Test] Switch to Hardcore Mode:', selectHardcoreRes);
    if (!selectHardcoreRes.ok || !selectHardcoreRes.modeActive) throw new Error('Hardcore mode switch failed');

    // Capture Hardcore Briefing screenshot
    await cdp.captureScreenshot('hardcore-mode-briefing.png');

    // Switch through Operation 1 to Operation 3
    const opSwitchRes = await cdp.eval(`(() => {
      const opBtns = document.querySelectorAll('.op-pill');
      if (opBtns.length < 3) return { ok: false, reason: 'Too few op buttons: ' + opBtns.length };
      opBtns[1].click(); // Op 2
      const title2 = document.querySelector('.hardcore-name')?.textContent || '';
      opBtns[2].click(); // Op 3
      const title3 = document.querySelector('.hardcore-name')?.textContent || '';
      return { ok: true, opCount: opBtns.length, title2, title3 };
    })()`);
    console.log('[Test] Hardcore Operations Carousel:', opSwitchRes);

    // Switch back to Standard Mode
    console.log('\n--- 3. Testing Return to Standard Mode ---');
    const selectStandardRes = await cdp.eval(`(() => {
      const btn = document.querySelector('[data-mode="standard"]');
      if (!btn) return { ok: false, reason: 'No standard tab button' };
      btn.click();
      const briefing = document.getElementById('hardcoreBriefingContainer');
      const heatRow = document.getElementById('heatRow');
      return {
        ok: true,
        modeActive: btn.classList.contains('is-selected') || btn.getAttribute('aria-checked') === 'true',
        briefingHidden: !briefing || briefing.hidden,
        heatVisible: heatRow && heatRow.style.display !== 'none'
      };
    })()`);
    console.log('[Test] Return to Standard Mode:', selectStandardRes);
    if (!selectStandardRes.ok || !selectStandardRes.modeActive) throw new Error('Return to standard mode failed');

    console.log('\n==========================================');
    console.log('  ALL CAMPAIGN & HARDCORE UI TESTS PASSED!  ');
    console.log('==========================================\n');
  } finally {
    cdp.close();
    chromeProc.kill();
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
