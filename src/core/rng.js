var seeded = false;
var seedKey = '';
var streams = null;

function hash32(text) {
  var h = 2166136261;
  var s = String(text);
  var i;
  for (i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function streamRng(name) {
  var key = name || 'default';
  if (!streams[key]) streams[key] = mulberry32(hash32(seedKey + '\0' + key));
  return streams[key];
}

export function seedRun(seed) {
  seeded = true;
  seedKey = String(seed);
  streams = Object.create(null);
}

export function clearSeed() {
  seeded = false;
  seedKey = '';
  streams = null;
}

export function rng(stream) {
  if (!seeded) return Math.random();
  return streamRng(stream)();
}
