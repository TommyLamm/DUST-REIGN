import { rt } from './runtime.js';

export var FX_EVENT_CAP = 64;

function events() {
  var buf = rt.fxEvents;
  if (!buf || !buf.items || buf.items.length !== FX_EVENT_CAP) {
    buf = { items: new Array(FX_EVENT_CAP), head: 0, count: 0 };
    rt.fxEvents = buf;
  }
  return buf;
}

export function pushFxEvent(kind, x, y, opts) {
  var buf = events();
  var slot;
  if (buf.count < FX_EVENT_CAP) {
    slot = (buf.head + buf.count) % FX_EVENT_CAP;
    buf.count += 1;
  } else {
    slot = buf.head;
    buf.head = (buf.head + 1) % FX_EVENT_CAP;
  }
  var ev = buf.items[slot];
  if (!ev) {
    ev = { kind: '', x: 0, y: 0, opts: null };
    buf.items[slot] = ev;
  }
  ev.kind = kind;
  ev.x = typeof x === 'number' && x === x ? x : 0;
  ev.y = typeof y === 'number' && y === y ? y : 0;
  ev.opts = opts == null ? null : opts;
}

var scratch = { kind: '', x: 0, y: 0, opts: null };

export function drainFxEvents(fn) {
  var buf = events();
  var n = buf.count;
  var head = buf.head;
  buf.head = 0;
  buf.count = 0;
  if (!fn || !n) return;
  for (var i = 0; i < n; i += 1) {
    var ev = buf.items[(head + i) % FX_EVENT_CAP];
    scratch.kind = ev ? ev.kind : '';
    scratch.x = ev ? ev.x : 0;
    scratch.y = ev ? ev.y : 0;
    scratch.opts = ev ? ev.opts : null;
    fn(scratch);
  }
  scratch.kind = '';
  scratch.x = 0;
  scratch.y = 0;
  scratch.opts = null;
}
