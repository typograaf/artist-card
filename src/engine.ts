// Artist Card engine: deterministic scene model + canvas renderer.
// Everything is computed from (params, time) so playback, scrubbing and
// export all share one code path.

export type Format = "4:5" | "16:9" | "9:16" | "1:1";
export const FORMATS: Record<Format, [number, number]> = {
  "4:5": [1080, 1350],
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
};

export type Bezier = [number, number, number, number];
export type Focus = "top" | "bottom";
export type StaggerOrder = "center" | "top" | "bottom";

export interface Colors {
  topA: string;
  topB: string;
  bottomA: string;
  bottomB: string;
  labelBg: string;
  labelText: string;
}

/** One block unit is the card's short side divided by this. */
export const UNITS_ACROSS = 24;

export interface Params {
  format: Format;
  rowsTop: number;
  rowsBottom: number;
  focus: Focus; // this half's stripes start three units wide (the other: one)
  blockWidth: number; // units, widest edge block left in an open row
  blockTravel: number; // units, largest sideways step of a row's pattern
  blockSeed: number;
  moveMin: number; // s, shortest block keyframe transition
  moveMax: number; // s, longest
  floatCount: number; // floating blocks spread over the open rows (0 = none)
  floatSize: number; // units, largest floating block (smallest is half)
  floatTravel: number; // px at 1x, largest floating-block sideways step
  floatMoveMin: number; // s, floating block keyframe spacing
  floatMoveMax: number;
  opening: number; // 0..100, how far the rows open
  irregularity: number; // 0..100, extra blocks per row and side
  shapeSeed: number;
  duration: number; // s, one row's open/close transition
  stagger: number; // s between row ranks
  staggerOrder: StaggerOrder;
  easing: Bezier;
  holdClosed: number; // s
  holdOpen: number; // s
  colors: Colors;
  day: string;
  timeStart: string;
  timeEnd: string;
  artist: string;
  stage: string;
  labelY: number; // 0..1, top of the artist label group as a fraction of H
  fontFamily: string;
  imageZoom: number; // 1..
  imageX: number; // -1..1 (set by dragging the preview)
  imageY: number; // -1..1
}

export const DEFAULT_EASING: Bezier = [0.7, 0.1, 0.1, 0.9];

export const DEFAULT_PARAMS: Params = {
  format: "4:5",
  rowsTop: 4,
  rowsBottom: 4,
  focus: "bottom",
  blockWidth: 2,
  blockTravel: 4,
  blockSeed: 4,
  moveMin: 1.8,
  moveMax: 3.6,
  floatCount: 5,
  floatSize: 2,
  floatTravel: 100,
  floatMoveMin: 1,
  floatMoveMax: 2.5,
  opening: 100,
  irregularity: 30,
  shapeSeed: 1,
  duration: 1.5,
  stagger: 0.15,
  staggerOrder: "center",
  easing: DEFAULT_EASING,
  holdClosed: 1.5,
  holdOpen: 1.5,
  colors: {
    topA: "#0C08FF",
    topB: "#829FFF",
    bottomA: "#00504E",
    bottomB: "#00201F",
    labelBg: "#FFEFA4",
    labelText: "#000000",
  },
  day: "Thursday 28.08",
  timeStart: "20:00",
  timeEnd: "21:00",
  artist: "Chris Stussy",
  stage: "Main Stage",
  labelY: 401 / 679,
  fontFamily: "Avantt",
  imageZoom: 1,
  imageX: 0,
  imageY: 0,
};

/** The Touquet colour pairs; the randomiser picks one of these. */
export const COLOR_COMBOS: [string, string][] = [
  ["#3F98FF", "#FFEFA4"],
  ["#AA0026", "#FF979C"],
  ["#212072", "#4C5EFF"],
  ["#FFA81C", "#FC7E03"],
  ["#01232C", "#027370"],
  ["#63ECFF", "#007F59"],
  ["#FFEFA4", "#A2A400"],
  ["#FFA16C", "#640D00"],
  ["#FFEFA4", "#FF979C"],
  ["#80FFE3", "#027370"],
  ["#AA0026", "#F64D1D"],
  ["#E90062", "#AA0026"],
  ["#65D36D", "#007F59"],
];

// ---------- deterministic randomness ----------

function hash(...nums: number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    const x = Math.floor(n) | 0;
    h ^= x;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Uniform [0,1) from a seed and any number of integer keys. */
export function rand(seed: number, ...keys: number[]): number {
  let t = (hash(seed, ...keys) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- easing ----------

export function bezierEase(b: Bezier): (x: number) => number {
  const [x1, y1, x2, y2] = b;
  const A = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
  const B = (a1: number, a2: number) => 3 * a2 - 6 * a1;
  const C = (a1: number) => 3 * a1;
  const calc = (t: number, a1: number, a2: number) =>
    ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t: number, a1: number, a2: number) =>
    3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x1 === y1 && x2 === y2) return x;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    if (!(t >= 0 && t <= 1) || Math.abs(calc(t, x1, x2) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i++) {
        t = (lo + hi) / 2;
        if (calc(t, x1, x2) < x) lo = t;
        else hi = t;
      }
    }
    return calc(t, y1, y2);
  };
}

// ---------- scene model ----------

/** A keyframe; consecutive keyframes are joined by the opening easing. */
export interface Key {
  t: number;
  v: number;
}

export interface Floater {
  x0: number; // px at 1x, relative to the seam
  phase: number; // stripe phase inside the mask
  widthKeys: Key[]; // mask width, px at 1x (0 = despawned)
  shiftKeys: Key[]; // mask position drift, px at 1x
  stripeKeys: Key[]; // stripe multiplier chain (1..3) inside the mask
  stripeShift: Key[]; // stripe drift inside the mask, px at 1x
}

export interface RowSpec {
  index: number;
  half: Focus;
  y0: number;
  y1: number;
  rank: number;
  delay: number; // opening delay (s)
  closeDelay: number; // closing delay (s), mirrored so outer rows close first
  phase: number; // 0..2 stripe widths
  m0: number; // stripe multiplier at the start of the opening
  anchor: number; // x (px at 1x) the pattern scales about; off-centre on purpose
  remL: number; // units, blocks left standing at the edge when fully open (static part)
  remR: number;
  edgeL: Key[]; // units, extra edge block width chain (never still)
  edgeR: Key[];
  widthKeys: Key[]; // stripe multiplier chain over [openAt, openAt + total]
  shiftKeys: Key[]; // sideways drift (px at 1x) over [0, total]
  floaters: Floater[];
}

export interface Timeline {
  tOpen: number;
  tOpenEnd: number;
  tClose: number;
  tCloseEnd: number;
  total: number;
  span: number;
}

export interface LabelClock {
  openAt: number;
  openD: number;
  openStagger: number; // s between blocks on the way in
  closeAt: number;
  closeD: number;
  closeStagger: number; // s between blocks on the way out (compressed to fit)
}

export interface Scene {
  W: number;
  H: number;
  S: number; // short side
  unit: number; // px at 1x
  rows: RowSpec[];
  tl: Timeline;
  artist: LabelClock;
  ease: (x: number) => number;
}

const clampInt = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(v) || lo));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** One step up or down inside [lo, hi] (never two steps in one move). */
function stepWithin(cur: number, lo: number, hi: number, r: number): number {
  const options = [cur - 1, cur + 1].filter((v) => v >= lo && v <= hi);
  if (!options.length) return cur;
  return options[Math.min(options.length - 1, Math.floor(r * options.length))];
}

/** Next value one step away from `cur`, avoiding `avoid` when possible. */
function nextValue(cur: number, avoid: number, lo: number, hi: number, r: number): number {
  const options = [cur - 1, cur + 1].filter((m) => m >= lo && m <= hi);
  const preferred = options.filter((m) => m !== avoid);
  const pool = preferred.length ? preferred : options;
  if (!pool.length) return cur;
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}

/**
 * Random durations in [min, max] that fill `span` exactly (scaled to fit).
 * Returns the cumulative keyframe times after `start`, excluding the end.
 */
function fillSpan(
  start: number,
  span: number,
  min: number,
  max: number,
  r: (i: number) => number,
): number[] {
  if (span <= 0) return [];
  const durs: number[] = [];
  let acc = 0;
  let i = 0;
  while (acc < span && i < 400) {
    const d = min + r(i) * (max - min);
    durs.push(d);
    acc += d;
    i++;
  }
  const k = span / acc;
  const times: number[] = [];
  let t = start;
  for (let j = 0; j < durs.length - 1; j++) {
    t += durs[j] * k;
    times.push(t);
  }
  return times;
}

/** Seamless sideways drift chain over [0, T]: steps of travelMin..travelMax, bounded. */
function driftChain(
  T: number,
  moveMin: number,
  moveMax: number,
  travelMin: number,
  travelMax: number,
  r: (i: number) => number,
): Key[] {
  const keys: Key[] = [{ t: 0, v: 0 }];
  if (travelMax > 0) {
    const times = fillSpan(0, T, moveMin, moveMax, (i) => r(1000 + i));
    let v = 0;
    times.forEach((t, i) => {
      let delta = travelMin + r(2000 + i) * (travelMax - travelMin);
      if (r(3000 + i) < 0.5) delta = -delta;
      if (Math.abs(v + delta) > travelMax) delta = -delta;
      v += delta;
      keys.push({ t, v });
    });
  }
  keys.push({ t: T, v: 0 });
  return keys;
}

/** Seamless integer chain over [0, T] stepping +-1 inside [lo, hi], never resting. */
function intChain(
  T: number,
  lo: number,
  hi: number,
  moveMin: number,
  moveMax: number,
  r: (i: number) => number,
): Key[] {
  const start = lo + Math.floor(r(0) * (hi - lo + 1));
  const keys: Key[] = [{ t: 0, v: start }];
  if (hi > lo) {
    const times = fillSpan(0, T, moveMin, moveMax, (i) => r(1 + i));
    let v = start;
    times.forEach((t, i) => {
      v = stepWithin(v, lo, hi, r(500 + i));
      keys.push({ t, v });
    });
    // never rest on the loop value right before wrapping back to it
    if (keys.length > 1 && keys[keys.length - 1].v === start) {
      keys[keys.length - 1].v = stepWithin(start, lo, hi, r(999));
    }
  }
  keys.push({ t: T, v: start });
  return keys;
}

export function buildScene(p: Params): Scene {
  const [W, H] = FORMATS[p.format];
  const S = Math.min(W, H);
  const unit = S / UNITS_ACROSS;
  const nTop = clampInt(p.rowsTop, 1, 24);
  const nBot = clampInt(p.rowsBottom, 1, 24);
  const n = nTop + nBot;
  const rows: RowSpec[] = [];
  for (let i = 0; i < n; i++) {
    const half: Focus = i < nTop ? "top" : "bottom";
    const y0 = half === "top" ? (H / 2) * (i / nTop) : H / 2 + (H / 2) * ((i - nTop) / nBot);
    const y1 =
      half === "top" ? (H / 2) * ((i + 1) / nTop) : H / 2 + (H / 2) * ((i - nTop + 1) / nBot);
    let rank: number;
    if (p.staggerOrder === "center") rank = half === "top" ? nTop - 1 - i : i - nTop;
    else if (p.staggerOrder === "top") rank = i;
    else rank = n - 1 - i;
    rows.push({
      index: i,
      half,
      y0,
      y1,
      rank,
      delay: 0,
      closeDelay: 0,
      phase: 0,
      m0: 1,
      anchor: 0,
      remL: 0,
      remR: 0,
      edgeL: [],
      edgeR: [],
      widthKeys: [],
      shiftKeys: [],
      floaters: [],
    });
  }
  const maxRank = rows.reduce((m, r) => Math.max(m, r.rank), 0);
  const span = p.stagger * maxRank;
  const tOpen = p.holdClosed;
  const tOpenEnd = tOpen + p.duration + span;
  const tClose = tOpenEnd + p.holdOpen;
  const tCloseEnd = tClose + p.duration + span;
  const tl: Timeline = { tOpen, tOpenEnd, tClose, tCloseEnd, total: tCloseEnd, span };
  const T = tl.total;

  const moveMin = Math.max(0.2, Math.min(p.moveMin, p.moveMax));
  const moveMax = Math.max(moveMin, p.moveMax);
  const travelMax = Math.max(0, p.blockTravel) * unit;
  const travelMin = travelMax / 4;
  const edgeHi = clampInt(p.blockWidth, 0, 12);
  const edgeLo = Math.max(0, edgeHi - 2);

  const open = clamp01(p.opening / 100);
  const irr = clamp01(p.irregularity / 100);
  // Opening shape: every row opens to the same width (minus the edge
  // blocks), the irregularity adds whole blocks, more towards the outer
  // rows (a hill peaking at the seam) and seeded per row and side.
  const baseUnits = Math.round(((1 - open) * (W / 2)) / unit);
  for (const r of rows) {
    const k = r.index;
    r.delay = p.stagger * r.rank;
    r.closeDelay = span - r.delay;
    // Stripe phase: stratified so neighbouring rows don't form a staircase.
    r.phase = ((((k * 0.618) % 1) + rand(p.blockSeed, k, 1) * 0.6) % 1) * 2;
    r.m0 = r.half === p.focus ? 3 : 1;
    const yc = (r.y0 + r.y1) / 2;
    const hill = Math.abs(yc - H / 2) / (H / 2);
    const sides: ("remL" | "remR")[] = ["remL", "remR"];
    sides.forEach((side, si) => {
      const noise = rand(p.shapeSeed, k, 10 + si);
      r[side] = baseUnits + Math.round(irr * 4 * (0.5 * hill + 0.5 * noise));
    });
  }
  // The hole never widens again as it moves away from the seam.
  for (let i = nTop - 2; i >= 0; i--) {
    rows[i].remL = Math.max(rows[i].remL, rows[i + 1].remL);
    rows[i].remR = Math.max(rows[i].remR, rows[i + 1].remR);
  }
  for (let i = nTop + 1; i < n; i++) {
    rows[i].remL = Math.max(rows[i].remL, rows[i - 1].remL);
    rows[i].remR = Math.max(rows[i].remR, rows[i - 1].remR);
  }

  // Block motion. The reference slit-scans show every block edge as a
  // continuous curve: the pattern drifts sideways while its stripe width
  // changes, scaling about a point that is not the seam (so left and right
  // move differently), and no edge ever sits still. The edge blocks left
  // standing in an open row grow and shrink on their own chain too.
  for (const r of rows) {
    const k = r.index;
    const rr = (key: number) => rand(p.blockSeed, k, key);
    const openAt = tOpen + r.delay;
    const closeAt = tClose + r.closeDelay;
    r.anchor = W * (0.3 + 0.4 * rr(7));

    const keys: Key[] = [{ t: openAt, v: r.m0 }];
    let v = r.m0;
    const openSpan = closeAt - openAt;
    let t = openAt + Math.min(moveMin + rr(100) * (moveMax - moveMin), openSpan * 0.6);
    v = stepWithin(v, 1, 3, rr(3));
    keys.push({ t, v });
    const times = fillSpan(t, closeAt - t, moveMin, moveMax, (i) => rr(110 + i));
    times.forEach((tk, i) => {
      v = stepWithin(v, 1, 3, rr(130 + i));
      keys.push({ t: tk, v });
    });
    // the value reached when the closing starts is never the loop value,
    // so the closing transition is a real move
    v = nextValue(v, r.m0, 1, 3, rr(150));
    keys.push({ t: closeAt, v });
    // back to the closed width with the closing, then hold it (the drift
    // keeps the closed card moving) until the next opening
    keys.push({ t: Math.min(closeAt + p.duration, openAt + T), v: r.m0 });
    keys.push({ t: openAt + T, v: r.m0 });
    r.widthKeys = keys;
    r.shiftKeys = driftChain(T, moveMin, moveMax, travelMin, travelMax, rr);
    r.edgeL = intChain(T, edgeLo, edgeHi, moveMin, moveMax, (i) => rr(7000 + i));
    r.edgeR = intChain(T, edgeLo, edgeHi, moveMin, moveMax, (i) => rr(8000 + i));
  }

  // Floating blocks: masks inside the hole showing their own stripe
  // pattern (changing colour like the rows), growing, shrinking to nothing
  // and back (spawn / despawn), and drifting on their own ranges. The count
  // is spread over the rows, innermost first.
  const count = clampInt(p.floatCount, 0, 60);
  if (count > 0) {
    const fmax = Math.max(0.2, p.floatSize) * unit;
    const fmin = fmax / 2;
    const fMoveMin = Math.max(0.2, Math.min(p.floatMoveMin, p.floatMoveMax));
    const fMoveMax = Math.max(fMoveMin, p.floatMoveMax);
    const fTravelMax = Math.max(0, p.floatTravel);
    const fTravelMin = fTravelMax / 2;
    const order = [...rows].sort((a, b) => {
      const da = Math.abs((a.y0 + a.y1) / 2 - H / 2);
      const db = Math.abs((b.y0 + b.y1) / 2 - H / 2);
      return da - db || a.index - b.index;
    });
    const hosts = order.filter((r) => Math.min(W / 2 - r.remL * unit, W / 2 - r.remR * unit) > unit);
    for (let j = 0; j < count && hosts.length; j++) {
      const r = hosts[j % hosts.length];
      const k = r.index;
      const reach = Math.min(W / 2 - r.remL * unit, W / 2 - r.remR * unit);
      const fr = (key: number) => rand(p.blockSeed, k, 5000 + j * 100 + key);
      const x0 = -reach * 0.8 + reach * 1.6 * fr(1);
      const size = (i: number) => (fr(40 + i) < 0.35 ? 0 : fmin + fr(41 + i * 7) * (fmax - fmin));
      const wk: Key[] = [{ t: 0, v: size(0) }];
      const wtimes = fillSpan(0, T, fMoveMin, fMoveMax, (i) => fr(10 + i));
      wtimes.forEach((tk, i) => wk.push({ t: tk, v: size(i + 1) }));
      wk.push({ t: T, v: wk[0].v });
      const sk: Key[] = [{ t: 0, v: 1 + Math.floor(fr(3) * 3) }];
      let sv = sk[0].v;
      const stimes = fillSpan(0, T, fMoveMin, fMoveMax, (i) => fr(80 + i));
      stimes.forEach((tk, i) => {
        sv = stepWithin(sv, 1, 3, fr(90 + i));
        sk.push({ t: tk, v: sv });
      });
      sk.push({ t: T, v: sk[0].v });
      r.floaters.push({
        x0,
        phase: fr(4) * 2,
        widthKeys: wk,
        shiftKeys: driftChain(T, fMoveMin, fMoveMax, fTravelMin, fTravelMax, (i) => fr(60 + i)),
        stripeKeys: sk,
        stripeShift: driftChain(T, fMoveMin, fMoveMax, fTravelMin * 0.5, fTravelMax * 0.5, (i) => fr(70 + i)),
      });
    }
  }

  // The artist group has its own clock: it starts a beat after the bottom
  // row and unfolds a little faster, one block after another. On close it
  // starts with the closing and must be gone before the seam labels come
  // back (they fold in once the seam rows are 70% closed), so its stagger
  // and duration are compressed to fit that window when needed.
  const ease = bezierEase(p.easing);
  const bottom = rows[n - 1];
  const seamDelay = Math.max(rows[nTop - 1].closeDelay, rows[nTop]?.closeDelay ?? 0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < 0.7) lo = mid;
    else hi = mid;
  }
  const seamLabelsBack = tClose + seamDelay + p.duration * lo;
  const nBlocks =
    [p.timeStart, p.timeEnd].filter((t) => t.trim()).length +
    p.artist.trim().split(/\s+/).filter(Boolean).length +
    p.stage.trim().split(/\s+/).filter(Boolean).length;
  const closeStart = tClose + bottom.closeDelay;
  const need = Math.max(1, nBlocks - 1) * p.stagger + 0.75 * p.duration;
  const available = Math.max(0.1, seamLabelsBack - closeStart - 0.05);
  const k = Math.min(1, available / need);
  const artist: LabelClock = {
    openAt: tOpen + bottom.delay + 1.5 * p.stagger,
    openD: 0.8 * p.duration,
    openStagger: p.stagger,
    closeAt: closeStart,
    closeD: 0.75 * p.duration * k,
    closeStagger: p.stagger * k,
  };
  return { W, H, S, unit, rows, tl, artist, ease };
}

/**
 * Eased 0..1 for a time fraction. Long-tailed curves spend their last frames
 * on sub-pixel motion, so the ends snap; overshoot is clamped so hole, labels
 * and block widths always share one curve.
 */
function eased(scene: Scene, u: number): number {
  if (u <= 0.004) return 0;
  if (u >= 0.996) return 1;
  return clamp01(scene.ease(u));
}

function segmentProgress(scene: Scene, t: number, openAt: number, openD: number, closeAt: number, closeD: number): number {
  if (t < openAt) return 0;
  if (t < openAt + openD) return eased(scene, (t - openAt) / openD);
  if (t < closeAt) return 1;
  if (t < closeAt + closeD) return 1 - eased(scene, (t - closeAt) / closeD);
  return 0;
}

/** Row opening progress 0..1 at time t (seconds into the loop). */
export function rowProgress(scene: Scene, p: Params, r: RowSpec, t: number): number {
  return segmentProgress(
    scene,
    t,
    scene.tl.tOpen + r.delay,
    p.duration,
    scene.tl.tClose + r.closeDelay,
    p.duration,
  );
}

/** Evaluate a keyframe chain that covers one loop starting at keys[0].t. */
export function evalChain(scene: Scene, keys: Key[], t: number): number {
  if (keys.length < 2) return keys[0]?.v ?? 0;
  const t0 = keys[0].t;
  const period = keys[keys.length - 1].t - t0;
  const tt = period > 0 ? t0 + ((((t - t0) % period) + period) % period) : t0;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (tt >= a.t && tt < b.t) {
      if (b.v === a.v) return a.v;
      return a.v + (b.v - a.v) * eased(scene, (tt - a.t) / (b.t - a.t));
    }
  }
  return keys[keys.length - 1].v;
}

/** Stripe width multiplier (1..3, fractional while moving) at time t. */
export function rowMultiplier(scene: Scene, r: RowSpec, t: number): number {
  return evalChain(scene, r.widthKeys, t);
}

/** Sideways drift of the row's pattern (px at 1x) at time t. */
export function rowShift(scene: Scene, r: RowSpec, t: number): number {
  return evalChain(scene, r.shiftKeys, t);
}

/** Half-hole extent (px at 1x) of one side when the row is fully open, at time t. */
export function rowHole(scene: Scene, r: RowSpec, side: "L" | "R", t: number): number {
  const rem = (side === "L" ? r.remL : r.remR) + evalChain(scene, side === "L" ? r.edgeL : r.edgeR, t);
  return Math.max(0, scene.W / 2 - rem * scene.unit);
}

// ---------- rendering ----------

export interface ImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the renderer laid out, for on-canvas interaction (at the render scale). */
export interface Layout {
  artistRect: Rect | null; // the artist label group while it is visible
}

/** Cover-fit placement of the background image (shared with drag-to-pan). */
export function coverRect(
  img: { width: number; height: number },
  W: number,
  H: number,
  zoom: number,
  ox: number,
  oy: number,
): { x: number; y: number; dw: number; dh: number } {
  const s = Math.max(W / img.width, H / img.height) * Math.max(0.1, zoom);
  const dw = img.width * s;
  const dh = img.height * s;
  const x = (W - dw) / 2 - ox * ((dw - W) / 2);
  const y = (H - dh) / 2 - oy * ((dh - H) / 2);
  return { x, y, dw, dh };
}

function drawStripes(
  ctx: CanvasRenderingContext2D,
  edge: number, // content origin (x where s = 0)
  from: number, // region start x
  to: number, // region end x
  y0: number,
  h: number,
  w: number,
  phase: number,
  colorA: string,
  colorB: string,
) {
  if (to <= from) return;
  ctx.fillStyle = colorA;
  ctx.fillRect(from, y0, to - from, h);
  ctx.fillStyle = colorB;
  const kmin = Math.floor((from - edge) / w + phase) - 1;
  const kmax = Math.floor((to - edge) / w + phase) + 1;
  for (let k = kmin; k <= kmax; k++) {
    if ((k & 1) === 0) continue;
    const x0 = edge + (k - phase) * w;
    // whole pixels: no anti-aliased hairlines between the two colours
    const a = Math.round(Math.max(from, x0));
    const b = Math.round(Math.min(to, x0 + w));
    if (b > a) ctx.fillRect(a, y0, b - a, h);
  }
}

// ---------- labels ----------
// Every word is its own block. Metrics are the Figma design's, expressed as
// fractions of the card's short side (the design is 540 wide): the text box
// is trimmed cap height to baseline, like Figma's vertical trim, and the
// padding sits around that.

export const LABEL_WEIGHT = 700;
export const LABEL_TRACKING = -0.02; // em, Figma -2%

interface LabelStyle {
  fs: number;
  padTop: number;
  padBottom: number;
  padX: number;
  upper: boolean;
}
const D = 540;
const STYLE_BIG: LabelStyle = { fs: 72 / D, padTop: 12 / D, padBottom: 24 / D, padX: 3 / D, upper: false };
const STYLE_SMALL: LabelStyle = { fs: 36 / D, padTop: 18 / D, padBottom: 18 / D, padX: 3 / D, upper: true };
const STYLE_TINY: LabelStyle = { fs: 18 / D, padTop: 18 / D, padBottom: 18 / D, padX: 3 / D, upper: false };
const LABEL_GAP = 4.5 / D;

interface Block {
  text: string;
  w: number;
}
interface LabelRow {
  blocks: Block[];
  fs: number;
  padX: number;
  padTop: number;
  capH: number;
  w: number;
  h: number;
}

function labelFont(fs: number, family: string) {
  return `${LABEL_WEIGHT} ${fs}px "${family}", system-ui, sans-serif`;
}

/** Apply the label tracking where the canvas supports it (Chrome, Safari 17.4+). */
function setTracking(ctx: CanvasRenderingContext2D, fs: number) {
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${LABEL_TRACKING * fs}px`;
  }
}

function words(text: string, upper: boolean): string[] {
  const t = upper ? text.toUpperCase() : text;
  return t.trim().split(/\s+/).filter(Boolean);
}

function layoutRow(
  ctx: CanvasRenderingContext2D,
  texts: string[],
  style: LabelStyle,
  S: number,
  gap: number,
  maxW: number,
  family: string,
): LabelRow | null {
  if (!texts.length) return null;
  const padX = style.padX * S;
  const padTop = style.padTop * S;
  const padBottom = style.padBottom * S;
  const measure = (fs: number) => {
    ctx.font = labelFont(fs, family);
    setTracking(ctx, fs);
    const capH = ctx.measureText("H").actualBoundingBoxAscent || fs * 0.7;
    // the canvas adds the tracking after the last glyph too; Figma does not
    const trail = Math.abs(LABEL_TRACKING * fs);
    const blocks = texts.map((text) => ({ text, w: ctx.measureText(text).width + trail + 2 * padX }));
    const w = blocks.reduce((a, b) => a + b.w, 0) + gap * (blocks.length - 1);
    return { fs, capH, blocks, w };
  };
  let r = measure(style.fs * S);
  if (r.w > maxW) {
    const fixed = 2 * padX * texts.length + gap * (texts.length - 1);
    const text = r.w - fixed;
    if (text > 0) r = measure(r.fs * Math.max(0.2, (maxW - fixed) / text));
  }
  return { blocks: r.blocks, fs: r.fs, padX, padTop, capH: r.capH, w: r.w, h: padTop + r.capH + padBottom };
}

/**
 * Draw one row of blocks; `reveal(i)` is block i's own 0..1. Every block is
 * masked on its own, growing from its own centre, and the row is laid out
 * from the blocks' current widths with the fixed gap and centred on `cx`
 * at every moment.
 */
function drawRow(
  ctx: CanvasRenderingContext2D,
  row: LabelRow | null,
  cx: number,
  top: number,
  gap: number,
  reveal: (i: number) => number,
  dir: (i: number) => number, // -1 or 1: the side each word slides in from
  slide: number, // px, how far a word travels inside its mask
  colors: Colors,
  family: string,
) {
  if (!row) return;
  const vis = row.blocks.map((b, i) => b.w * clamp01(reveal(i)));
  if (!vis.some((v) => v >= 0.5)) return;
  const rowW = vis.reduce((a, v) => a + v, 0) + gap * (row.blocks.length - 1);
  ctx.save();
  ctx.font = labelFont(row.fs, family);
  setTracking(ctx, row.fs);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let x = cx - rowW / 2;
  row.blocks.forEach((b, i) => {
    const vw = vis[i];
    if (vw >= 0.5) {
      ctx.save();
      ctx.beginPath();
      // the mask only limits the width; overshoots and descenders hang out
      // of the block top and bottom, as in the design
      ctx.rect(x, top - row.fs, vw, row.h + 2 * row.fs);
      ctx.clip();
      // the full block slides in from its side, never leaving the mask
      // uncovered: the offset is capped at the hidden half-width
      const r = clamp01(reveal(i));
      const off = Math.min(slide * (1 - r), (b.w - vw) / 2) * (dir(i) < 0 ? -1 : 1);
      const bx = x + vw / 2 - b.w / 2 + off;
      ctx.fillStyle = colors.labelBg;
      ctx.fillRect(bx, top, b.w, row.h);
      ctx.fillStyle = colors.labelText;
      ctx.fillText(b.text, bx + row.padX, top + row.padTop + row.capH);
      ctx.restore();
    }
    x += vw + gap;
  });
  ctx.restore();
}

/**
 * Render one frame. `scale` multiplies every pixel quantity so exports at 2x
 * are geometrically identical to the 1x preview. Returns the layout of the
 * interactive parts (the artist group) at that scale.
 */
export function render(
  ctx: CanvasRenderingContext2D,
  p: Params,
  scene: Scene,
  t: number,
  scale: number,
  image: ImageSource | null,
): Layout {
  const W = scene.W * scale;
  const H = scene.H * scale;
  const S = scene.S * scale;
  const unit = scene.unit * scale;
  const cx = W / 2;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  if (image) {
    const c = coverRect(image, W, H, p.imageZoom, p.imageX, p.imageY);
    ctx.drawImage(image.source, c.x, c.y, c.dw, c.dh);
  }

  const progress: number[] = [];
  for (const r of scene.rows) {
    const pr = rowProgress(scene, p, r, t);
    progress[r.index] = pr;
    const mult = rowMultiplier(scene, r, t);
    const w = Math.max(1, unit * mult);
    const holeL = rowHole(scene, r, "L", t) * scale * pr;
    const holeR = rowHole(scene, r, "R", t) * scale * pr;
    const origin = (r.anchor + rowShift(scene, r, t)) * scale;
    const y0 = Math.round(r.y0 * scale);
    const y1 = Math.round(r.y1 * scale);
    const h = y1 - y0;
    const cA = r.half === "top" ? p.colors.topA : p.colors.bottomA;
    const cB = r.half === "top" ? p.colors.topB : p.colors.bottomB;
    const left = Math.round(cx - holeL);
    const right = Math.round(cx + holeR);
    // each half carries its pattern along with its hole edge
    drawStripes(ctx, origin - holeL, 0, left, y0, h, w, r.phase, cA, cB);
    drawStripes(ctx, origin + holeR, right, W, y0, h, w, r.phase, cA, cB);
    if (r.floaters.length && right - left > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, y0, right - left, h);
      ctx.clip();
      for (const f of r.floaters) {
        const fw = evalChain(scene, f.widthKeys, t) * scale;
        if (fw < 1) continue;
        const fx = cx + (f.x0 + evalChain(scene, f.shiftKeys, t)) * scale;
        const sm = evalChain(scene, f.stripeKeys, t);
        const sw = Math.max(1, unit * sm);
        const so = fx + evalChain(scene, f.stripeShift, t) * scale;
        const a = Math.max(left, fx - fw / 2);
        const b = Math.min(right, fx + fw / 2);
        drawStripes(ctx, so, a, b, y0, h, sw, f.phase, cA, cB);
      }
      ctx.restore();
    }
  }

  // Labels. Stage + day sit on the seam of the closed card and fold into it
  // as its rows open (gone by ~30% of their progress); the artist group
  // (times, name, stage) unfolds on its own clock at the height set by
  // dragging it on the preview. Blocks come in one after another (one
  // row stagger apart) and leave in reverse order, faster if the seam
  // labels would otherwise return on top of them; rows stay centred.
  const nTop = scene.rows.filter((r) => r.half === "top").length;
  const pSeamTop = progress[nTop - 1] ?? 0;
  const pSeamBot = progress[nTop] ?? pSeamTop;
  const fam = p.fontFamily || "Avantt";
  const gap = LABEL_GAP * S;
  const maxW = W * 0.92;
  const slide = 0.12 * S;
  // which side each word slides in from: seeded, so neighbours differ
  const seamDir = (base: number) => (i: number) => (rand(p.blockSeed, 900 + base + i) < 0.5 ? -1 : 1);
  // seam blocks: block i folds out between 30% progress, starting 6% later
  // per block (so on close the last one out is the first one back)
  const seamReveal = (pr: number) => (i: number) => 1 - clamp01((pr - 0.06 * i) / 0.3);

  const seamStage = layoutRow(ctx, words(p.stage, false), STYLE_BIG, S, gap, maxW, fam);
  const seamDay = layoutRow(ctx, words(p.day, true), STYLE_SMALL, S, gap, maxW, fam);
  const seamH = (seamStage?.h ?? 0) + (seamStage && seamDay ? gap : 0) + (seamDay?.h ?? 0);
  let y = H / 2 - seamH / 2;
  if (seamStage) {
    drawRow(ctx, seamStage, cx, y, gap, seamReveal(pSeamTop), seamDir(0), slide, p.colors, fam);
    y += seamStage.h + gap;
  }
  if (seamDay) drawRow(ctx, seamDay, cx, y, gap, seamReveal(pSeamBot), seamDir(10), slide, p.colors, fam);

  const ac = scene.artist;
  const times = layoutRow(ctx, [p.timeStart, p.timeEnd].map((s) => s.trim()).filter(Boolean), STYLE_TINY, S, gap, maxW, fam);
  const name = layoutRow(ctx, words(p.artist, false), STYLE_BIG, S, gap, maxW, fam);
  const stage2 = layoutRow(ctx, words(p.stage, true), STYLE_SMALL, S, gap, maxW, fam);
  const groupRows = [times, name, stage2].filter((r): r is LabelRow => !!r);
  let artistRect: Rect | null = null;
  if (groupRows.length) {
    const gh = groupRows.reduce((a, r) => a + r.h, 0) + gap * (groupRows.length - 1);
    const gw = groupRows.reduce((a, r) => Math.max(a, r.w), 0);
    const top = Math.max(0, Math.min(H - gh, clamp01(p.labelY) * H));
    const nBlocks = groupRows.reduce((a, r) => a + r.blocks.length, 0);
    let first = 0; // global block index of the row's first block
    let yy = top;
    let anyOpen = 0;
    for (const r of groupRows) {
      const base = first;
      drawRow(
        ctx,
        r,
        cx,
        yy,
        gap,
        (i) => {
          const g = base + i;
          const pr = segmentProgress(
            scene,
            t,
            ac.openAt + g * ac.openStagger,
            ac.openD,
            ac.closeAt + (nBlocks - 1 - g) * ac.closeStagger,
            ac.closeD,
          );
          anyOpen = Math.max(anyOpen, pr);
          return pr;
        },
        (i) => (rand(p.blockSeed, 950 + base + i) < 0.5 ? -1 : 1),
        slide,
        p.colors,
        fam,
      );
      first += r.blocks.length;
      yy += r.h + gap;
    }
    if (anyOpen > 0.5) artistRect = { x: cx - gw / 2, y: top, w: gw, h: gh };
  }
  ctx.restore();
  return { artistRect };
}
