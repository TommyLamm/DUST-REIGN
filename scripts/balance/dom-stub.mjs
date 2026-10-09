// Minimal document stand-in so level-up can call renderUpgradePanel without a browser.
// Gameplay does not read these nodes. Timers scheduled by the upgrade panel are left alone;
// they only touch stub elements.

function createClassList() {
  var set = new Set();
  return {
    add: function () {
      for (var i = 0; i < arguments.length; i += 1) set.add(arguments[i]);
    },
    remove: function () {
      for (var i = 0; i < arguments.length; i += 1) set.delete(arguments[i]);
    },
    toggle: function (name, force) {
      if (arguments.length > 1) {
        if (force) set.add(name);
        else set.delete(name);
        return Boolean(force);
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    },
    contains: function (name) {
      return set.has(name);
    }
  };
}

function matches(el, selector) {
  var sel = String(selector || '').trim();
  if (!sel || sel.indexOf(' ') !== -1 || sel.indexOf('[') !== -1) return false;
  if (sel.charAt(0) === '.') return Boolean(el.classList && el.classList.contains(sel.slice(1)));
  if (sel.charAt(0) === '#') return el.id === sel.slice(1);
  return el.tagName === sel.toUpperCase();
}

export function createEl(tag) {
  var el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [],
    id: '',
    className: '',
    textContent: '',
    hidden: false,
    dataset: {},
    type: '',
    disabled: false,
    width: 0,
    height: 0,
    offsetWidth: 0,
    offsetLeft: 0,
    parentNode: null,
    parentElement: null,
    firstChild: null,
    lastElementChild: null,
    nodeType: 1,
    style: null,
    classList: null
  };
  var style = {
    width: '',
    transform: '',
    transition: '',
    pointerEvents: ''
  };
  style.setProperty = function (key, value) {
    style[key] = value;
  };
  el.style = style;
  el.classList = createClassList();
  el.setAttribute = function (name, value) {
    if (name === 'id') el.id = String(value);
    el.dataset[name] = String(value);
  };
  el.getAttribute = function (name) {
    if (name === 'id') return el.id || null;
    return Object.prototype.hasOwnProperty.call(el.dataset, name) ? el.dataset[name] : null;
  };
  el.removeAttribute = function (name) {
    delete el.dataset[name];
  };
  el.focus = function () {};
  el.getContext = function () { return null; };
  el.closest = function () { return null; };
  el.querySelector = function (selector) {
    for (var i = 0; i < el.children.length; i += 1) {
      if (matches(el.children[i], selector)) return el.children[i];
      var nested = el.children[i].querySelector && el.children[i].querySelector(selector);
      if (nested) return nested;
    }
    return null;
  };
  el.querySelectorAll = function (selector) {
    var out = [];
    for (var i = 0; i < el.children.length; i += 1) {
      if (matches(el.children[i], selector)) out.push(el.children[i]);
      if (el.children[i].querySelectorAll) {
        var nested = el.children[i].querySelectorAll(selector);
        for (var j = 0; j < nested.length; j += 1) out.push(nested[j]);
      }
    }
    return out;
  };
  el.appendChild = function (child) {
    if (!child) return child;
    detach(child);
    child.parentNode = el;
    child.parentElement = el;
    el.children.push(child);
    el.firstChild = el.children[0] || null;
    el.lastElementChild = child;
    return child;
  };
  el.insertBefore = function (child, ref) {
    if (!child) return child;
    detach(child);
    child.parentNode = el;
    child.parentElement = el;
    var idx = ref ? el.children.indexOf(ref) : 0;
    if (idx < 0) idx = el.children.length;
    el.children.splice(idx, 0, child);
    el.firstChild = el.children[0] || null;
    el.lastElementChild = el.children[el.children.length - 1] || null;
    return child;
  };
  el.removeChild = function (child) {
    var idx = el.children.indexOf(child);
    if (idx >= 0) el.children.splice(idx, 1);
    if (child) {
      child.parentNode = null;
      child.parentElement = null;
    }
    el.firstChild = el.children[0] || null;
    el.lastElementChild = el.children[el.children.length - 1] || null;
    return child;
  };
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    enumerable: true,
    get: function () { return ''; },
    set: function () {
      el.children.length = 0;
      el.firstChild = null;
      el.lastElementChild = null;
    }
  });
  return el;
}

function detach(child) {
  if (!child || !child.parentNode || !child.parentNode.children) return;
  var list = child.parentNode.children;
  var idx = list.indexOf(child);
  if (idx >= 0) list.splice(idx, 1);
  if (child.parentNode.firstChild === child) child.parentNode.firstChild = list[0] || null;
  child.parentNode.lastElementChild = list[list.length - 1] || null;
}

export function installDomStub() {
  if (globalThis.document && globalThis.document.__balanceStub) return;
  var doc = {
    __balanceStub: true,
    readyState: 'complete',
    visibilityState: 'hidden',
    hidden: true,
    documentElement: createEl('html'),
    body: createEl('body'),
    activeElement: null,
    createElement: createEl,
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  globalThis.document = doc;
}

export function makeUi(width, height) {
  return {
    width: width,
    height: height,
    createdOverlay: true,
    overlay: createEl('section'),
    optionsNode: createEl('div'),
    statusText: createEl('p'),
    runState: createEl('span'),
    startScreen: { hidden: true },
    canvas: createEl('canvas')
  };
}
