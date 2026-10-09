var fxSeed = 123456789;

export function fxRand() {
  fxSeed = (Math.imul(fxSeed | 0, 1664525) + 1013904223) | 0;
  return (fxSeed >>> 0) / 4294967296;
}

export function fxRandSigned() {
  return fxRand() * 2 - 1;
}
