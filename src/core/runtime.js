// Shared mutable runtime. ES module imports are read-only bindings, so every
// value that is reassigned across modules (or swapped by selfCheck) lives here.
export var rt = {
  state: null,
  ui: null,
  raf: 0,
  lastTime: 0,
  started: false,
  terrain: [],
  listeners: [],
  resizeObserver: null,
  firePointers: new Set(),
  input: {
    keys: new Set(),
    mouse: { x: 480, y: 320, down: false },
    touchMode: false,
    gamepadX: 0,
    gamepadY: 0
  },
  gamepadState: {
    connected: false,
    selectedUpgrade: 0,
    navDebounce: 0,
    prevButtons: {}
  },
  accountRun: null,
  accountRunSaved: false,
  renderTime: 0,
  renderDt: 0,
  fxEvents: null
};
