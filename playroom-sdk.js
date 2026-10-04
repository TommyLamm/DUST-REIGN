// Copy this module into your game ZIP. No platform credentials are sent to games.
const pending = new Map();
let connection = null;
let parentOrigin = null;
let mode = 'standalone';
let scoring = false;
let diagnostics = false;
let resolveReady;
const readiness = new Promise((resolve) => { resolveReady = resolve; });
const timeout = setTimeout(() => resolveReady({ available: false, mode }), 8000);
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.source === window) return;
  const data = event.data;
  if (!data || data.protocol !== 'playroom' || data.version !== 1) return;
  if (data.type === 'init' && !connection && typeof data.connection === 'string' &&
      ['authenticated', 'guest', 'preview'].includes(data.mode)) {
    parentOrigin = event.origin;
    connection = data.connection;
    mode = data.mode;
    scoring = data.scoring === true;
    diagnostics = mode === 'preview' && data.diagnostics === true;
    clearTimeout(timeout);
    resolveReady({ available: mode === 'authenticated' && scoring, mode });
    return;
  }
  if (event.origin !== parentOrigin || data.connection !== connection || data.type !== 'response') return;
  const request = pending.get(data.requestId);
  if (!request) return;
  pending.delete(data.requestId);
  clearTimeout(request.timer);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.result);
});
if (window.parent !== window) window.parent.postMessage({ protocol: 'playroom', version: 1, type: 'hello', diagnostics: true }, '*');

async function request(method, payload) {
  await readiness;
  // Diagnostic preview issues ephemeral runs, while ready().available stays false.
  // A simulated finish always resolves null: it never represents a saved result.
  if (!connection || (mode !== 'authenticated' && !diagnostics) || (!scoring && !diagnostics)) return null;
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('平台回應逾時，請在平台工具列確認保存狀態'));
    }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    window.parent.postMessage({ protocol: 'playroom', version: 1, type: 'request', connection, requestId, method, payload }, parentOrigin);
  });
}
export const Playroom = {
  ready: () => readiness,
  startRun: () => request('startRun', {}),
  finishRun: async ({ runId, score }) => {
    const result = await request('finishRun', { runId, score });
    return mode === 'preview' ? null : result;
  },
};
