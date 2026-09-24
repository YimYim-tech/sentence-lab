/** Small deterministic helpers: every "random" choice in the app is reproducible from a seed. */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded generator; returns a new array. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** A stable shuffle that never returns the original order (when length > 1), so a bank of
 *  tokens never happens to show the answer in order. */
export function bankOrder<T>(items: readonly T[], seed: number, key: (t: T) => string): T[] {
  if (items.length < 2) return [...items];
  let s = seed;
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = seededShuffle(items, s);
    if (out.some((t, i) => key(t) !== key(items[i] as T))) return out;
    s = hashString(`${s}:${attempt}`);
  }
  const rotated = [...items.slice(1), items[0] as T];
  return rotated;
}

let idGenerator: ((prefix: string) => string) | null = null;

/** Tests install a deterministic generator so every engine run is reproducible. */
export function setIdGenerator(fn: ((prefix: string) => string) | null): void {
  idGenerator = fn;
}

export function randomId(prefix: string): string {
  if (idGenerator) return idGenerator(prefix);
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}
