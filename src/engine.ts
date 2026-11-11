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

export interface Params {
  format: Format;
  rowsTop: number;
  rowsBottom: number;
  unit: number; // block unit in px at 1x
  focus: Focus; // this half gets one unit thicker blocks (2/3/4 vs 1/2/3)
  blockSeed: number;
  moveMin: number; // s, shortest block keyframe transition
  moveMax: number; // s, longest
  travelMin: number; // px at 1x, smallest sideways step per keyframe
  travelMax: number; // px at 1x, largest
  floatCount: number; // floating blocks per open row
  floatMin: number; // units, smallest floating block
  floatMax: number; // units, largest
  floatMoveMin: number; // s, floating block keyframe spacing
  floatMoveMax: number;
  floatTravelMin: number; // px at 1x, floating block sideways step
  floatTravelMax: number;
  holeSize: number; // 0..1; 1 = every row fully open
  holeVariation: number; // 0..1
  shapeSeed: number;
  duration: number; // s, one row's open/close transition
  stagger: number; // s between row ranks
  staggerOrder: StaggerOrder;
  easing: Bezier;
  holdClosed: number; // s
  holdOpen: number; // s
  colors: Colors;
  artist: string;
  stage: string;
  date: string;
  fontFamily: string;
  imageZoom: number; // 1..
  imageX: number; // -1..1 (set by dragging the preview)
  imageY: number; // -1..1
}

export const EASING_PRESETS: Record<string, Bezier> = {
  Measured: [0.7, 0.1, 0.1, 0.9],
  "Ease in-out": [0.42, 0, 0.58, 1],
  Snap: [0.85, 0, 0.15, 1],
  "Ease out": [0, 0, 0.2, 1],
  "Ease in": [0.6, 0, 1, 1],
  Linear: [0, 0, 1, 1],
};

export const DEFAULT_PARAMS: Params = {
  format: "4:5",
  rowsTop: 4,
  rowsBottom: 4,
  unit: 40,
  focus: "top",
  blockSeed: 7,
  moveMin: 1.8,
  moveMax: 3.6,
  travelMin: 30,
  travelMax: 120,
  floatCount: 0,
  floatMin: 1,
  floatMax: 2.5,
  floatMoveMin: 1,
  floatMoveMax: 2.5,
  floatTravelMin: 40,
  floatTravelMax: 200,
  holeSize: 0.9,
  holeVariation: 0.3,
  shapeSeed: 3,
  duration: 1.6,
  stagger: 0.15,
  staggerOrder: "center",
  easing: [0.7, 0.1, 0.1, 0.9],
  holdClosed: 1.8,
  holdOpen: 4.1,
  colors: {
    topA: "#7E9EFC",
    topB: "#0A06FD",
    bottomA: "#FCA61A",
    bottomB: "#FA7C01",
    labelBg: "#FDEDA1",
    labelText: "#000000",
  },
  artist: "Kaytranada",
  stage: "MAIN STAGE",
  date: "Vendredi 28.08",
  fontFamily: "Avantt",
  imageZoom: 1,
  imageX: 0,
  imageY: 0,
};

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
  phase: number; // 0..2 block widths
  m0: number; // width multiplier at the start of the opening
  anchor: number; // x (px at 1x) the pattern scales about; off-centre on purpose
  holeL: number; // px at 1x, fully open
  holeR: number;
  widthKeys: Key[]; // multiplier chain over [openAt, openAt + total]
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
  closeAt: number;
  closeD: number;
}

export interface Scene {
  W: number;
  H: number;
  rows: RowSpec[];
  tl: Timeline;
  artist: LabelClock;
  ease: (x: number) => number;
}

const clampInt = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(v) || lo));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Next multiplier: one step up or down within 1..3 (never 1 <-> 3 in one move). */
function pickStep(current: number, r: number): number {
  if (current <= 1) return 2;
  if (current >= 3) return 2;
  return r < 0.5 ? 1 : 3;
}

/** Next multiplier one step away from `cur`, avoiding `avoid` when possible. */
function nextValue(cur: number, avoid: number, r: number): number {
  const options = [cur - 1, cur + 1].filter((m) => m >= 1 && m <= 3);
  const preferred = options.filter((m) => m !== avoid);
  const pool = preferred.length ? preferred : options;
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

export function buildScene(p: Params): Scene {
  const [W, H] = FORMATS[p.format];
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
      holeL: 0,
      holeR: 0,
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
  const travelMin = Math.max(0, Math.min(p.travelMin, p.travelMax));
  const travelMax = Math.max(travelMin, p.travelMax);

  const q = 2 * p.unit; // hole edges snap to this grid
  // Above 90% the hole blends to the full width, so 100% shows no blocks.
  const full = clamp01((p.holeSize - 0.9) / 0.1);
  for (const r of rows) {
    const k = r.index;
    r.delay = p.stagger * r.rank;
    r.closeDelay = span - r.delay;

    // Stripe phase: stratified so neighbouring rows don't form a staircase.
    r.phase = ((((k * 0.618) % 1) + rand(p.blockSeed, k, 1) * 0.6) % 1) * 2;
    r.m0 = 1 + Math.floor(rand(p.blockSeed, k, 2) * 3);
    if (k > 0 && r.m0 === rows[k - 1].m0 && rand(p.blockSeed, k, 4) < 0.6) {
      r.m0 = pickStep(r.m0, rand(p.blockSeed, k, 5));
    }

    // Opening shape: a stepped hill peaking at the seam, plus seeded +-steps.
    const yc = (r.y0 + r.y1) / 2;
    const env = 1 - 0.6 * (Math.abs(yc - H / 2) / (H / 2));
    const base = Math.round(((W / 2) * Math.min(1, p.holeSize) * env) / q) * q;
    const sides: ("holeL" | "holeR")[] = ["holeL", "holeR"];
    sides.forEach((side, si) => {
      const noise = rand(p.shapeSeed, k, 10 + si) * 2 - 1;
      const steps = Math.round(noise * p.holeVariation * 3);
      const stepped = Math.max(0, Math.min(W / 2, base + steps * q));
      r[side] = stepped + (W / 2 - stepped) * full;
    });
  }
  // The hole never widens again as it moves away from the seam.
  for (let i = nTop - 2; i >= 0; i--) {
    rows[i].holeL = Math.min(rows[i].holeL, rows[i + 1].holeL);
    rows[i].holeR = Math.min(rows[i].holeR, rows[i + 1].holeR);
  }
  for (let i = nTop + 1; i < n; i++) {
    rows[i].holeL = Math.min(rows[i].holeL, rows[i - 1].holeL);
    rows[i].holeR = Math.min(rows[i].holeR, rows[i - 1].holeR);
  }

  // Block motion. The reference slit-scans show every block edge as a
  // continuous curve: the pattern drifts sideways while its block width
  // changes, scaling about a point that is not the seam (so left and right
  // move differently), and no edge ever sits still. Both quantities are
  // keyframe chains joined by the opening easing, like easy-eased keyframes
  // with random spacing in [moveMin, moveMax]: the width chain starts a
  // transition with the row's opening and another with its closing (same
  // stagger as the hole), the drift chain runs free.
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
    v = pickStep(v, rr(3));
    keys.push({ t, v });
    const times = fillSpan(t, closeAt - t, moveMin, moveMax, (i) => rr(110 + i));
    times.forEach((tk, i) => {
      v = pickStep(v, rr(130 + i));
      keys.push({ t: tk, v });
    });
    // the value reached when the closing starts is never the loop value,
    // so the closing transition is a real move
    v = nextValue(v, r.m0, rr(150));
    keys.push({ t: closeAt, v });
    keys.push({ t: openAt + T, v: r.m0 });
    r.widthKeys = keys;
    r.shiftKeys = driftChain(T, moveMin, moveMax, travelMin, travelMax, rr);

    // Floating blocks: masks inside the hole showing their own stripe
    // pattern (changing colour like the rows), growing, shrinking to nothing
    // and back (spawn / despawn), and drifting on their own ranges.
    const count = clampInt(p.floatCount, 0, 8);
    const reach = Math.min(r.holeL, r.holeR);
    if (count > 0 && reach > p.unit) {
      const fmin = Math.max(0.1, Math.min(p.floatMin, p.floatMax)) * p.unit;
      const fmax = Math.max(fmin, p.floatMax * p.unit);
      const fMoveMin = Math.max(0.2, Math.min(p.floatMoveMin, p.floatMoveMax));
      const fMoveMax = Math.max(fMoveMin, p.floatMoveMax);
      const fTravelMin = Math.max(0, Math.min(p.floatTravelMin, p.floatTravelMax));
      const fTravelMax = Math.max(fTravelMin, p.floatTravelMax);
      for (let j = 0; j < count; j++) {
        const fr = (key: number) => rand(p.blockSeed, k, 5000 + j * 100 + key);
        const lane = (j + 0.5) / count; // spread across the hole, then jitter
        const x0 = -reach * 0.8 + reach * 1.6 * (lane + (fr(1) - 0.5) * 0.6);
        const size = (i: number) => (fr(40 + i) < 0.35 ? 0 : fmin + fr(41 + i * 7) * (fmax - fmin));
        const wk: Key[] = [{ t: 0, v: size(0) }];
        const wtimes = fillSpan(0, T, fMoveMin, fMoveMax, (i) => fr(10 + i));
        wtimes.forEach((tk, i) => wk.push({ t: tk, v: size(i + 1) }));
        wk.push({ t: T, v: wk[0].v });
        const sk: Key[] = [{ t: 0, v: 1 + Math.floor(fr(3) * 3) }];
        let sv = sk[0].v;
        const stimes = fillSpan(0, T, fMoveMin, fMoveMax, (i) => fr(80 + i));
        stimes.forEach((tk, i) => {
          sv = pickStep(sv, fr(90 + i));
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
  }

  // The artist name has its own clock: it starts a beat after the bottom row
  // and unfolds a little faster; on close it folds with that row.
  const bottom = rows[n - 1];
  const artist: LabelClock = {
    openAt: tOpen + bottom.delay + 1.5 * p.stagger,
    openD: 0.8 * p.duration,
    closeAt: tClose + bottom.closeDelay,
    closeD: 0.75 * p.duration,
  };
  return { W, H, rows, tl, artist, ease: bezierEase(p.easing) };
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
function evalChain(scene: Scene, keys: Key[], t: number): number {
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

/** Block width multiplier (1..3 non-focus, fractional while moving) at time t. */
export function rowMultiplier(scene: Scene, r: RowSpec, t: number): number {
  return evalChain(scene, r.widthKeys, t);
}

/** Sideways drift of the row's pattern (px at 1x) at time t. */
export function rowShift(scene: Scene, r: RowSpec, t: number): number {
  return evalChain(scene, r.shiftKeys, t);
}

// ---------- rendering ----------

export interface ImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
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
    const a = Math.max(from, x0);
    const b = Math.min(to, x0 + w);
    if (b > a) ctx.fillRect(a, y0, b - a, h);
  }
}

interface LabelMetrics {
  fs: number;
  bw: number;
  bh: number;
  ascent: number; // ink ascent of the measured string
  descent: number;
}

export const LABEL_WEIGHT = 700;
export const LABEL_TRACKING = -0.02; // em, the reference's Figma -2%

function labelFont(fs: number, family: string) {
  return `${LABEL_WEIGHT} ${fs}px "${family}", "Manrope", system-ui, sans-serif`;
}

/** Apply the label tracking where the canvas supports it (Chrome, Safari 17.4+). */
function setTracking(ctx: CanvasRenderingContext2D, fs: number) {
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${LABEL_TRACKING * fs}px`;
  }
}

/**
 * Box metrics measured on the reference: fixed padding in canvas units
 * regardless of font size, text ink centred in the box.
 */
function measureLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  fs: number,
  family: string,
  padX: number,
  padY: number,
  maxW: number,
  capsOnly: boolean,
): LabelMetrics {
  const measure = (size: number) => {
    ctx.font = labelFont(size, family);
    setTracking(ctx, size);
    const m = ctx.measureText(text);
    const cap = ctx.measureText("H");
    const ascent = capsOnly ? cap.actualBoundingBoxAscent || size * 0.7 : m.actualBoundingBoxAscent || size * 0.7;
    const descent = capsOnly ? 0 : m.actualBoundingBoxDescent || 0;
    return { tw: m.width, ascent, descent };
  };
  let r = measure(fs);
  let bw = r.tw + 2 * padX;
  if (bw > maxW && r.tw > 0) {
    fs = fs * ((maxW - 2 * padX) / r.tw);
    r = measure(fs);
    bw = r.tw + 2 * padX;
  }
  return { fs, bw, bh: r.ascent + r.descent + 2 * padY, ascent: r.ascent, descent: r.descent };
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  m: LabelMetrics,
  family: string,
  cx: number,
  top: number,
  windowHalf: number,
  offsetX: number,
  colors: Colors,
) {
  if (windowHalf < 0.5 || !text) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - windowHalf, top, windowHalf * 2, m.bh);
  ctx.clip();
  ctx.fillStyle = colors.labelBg;
  ctx.fillRect(cx - m.bw / 2 + offsetX, top, m.bw, m.bh);
  ctx.fillStyle = colors.labelText;
  ctx.font = labelFont(m.fs, family);
  setTracking(ctx, m.fs);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const inkH = m.ascent + m.descent;
  ctx.fillText(text, cx + offsetX, top + (m.bh - inkH) / 2 + m.ascent);
  ctx.restore();
}

/**
 * Render one frame. `scale` multiplies every pixel quantity so exports at 2x
 * are geometrically identical to the 1x preview.
 */
export function render(
  ctx: CanvasRenderingContext2D,
  p: Params,
  scene: Scene,
  t: number,
  scale: number,
  image: ImageSource | null,
) {
  const W = scene.W * scale;
  const H = scene.H * scale;
  const cx = W / 2;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1a1a1a";
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
    const w = Math.max(1, p.unit * scale * (mult + (r.half === p.focus ? 1 : 0)));
    const holeL = r.holeL * scale * pr;
    const holeR = r.holeR * scale * pr;
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
        const sw = Math.max(1, p.unit * scale * (sm + (r.half === p.focus ? 1 : 0)));
        const so = fx + evalChain(scene, f.stripeShift, t) * scale;
        const a = Math.max(left, fx - fw / 2);
        const b = Math.min(right, fx + fw / 2);
        drawStripes(ctx, so, a, b, y0, h, sw, f.phase, cA, cB);
      }
      ctx.restore();
    }
  }

  // Labels. Stage + date live on the closed card and fold into the seam as
  // its rows open (gone by ~30% of their progress, sliding sideways on the
  // way); the artist name unfolds along the bottom on its own clock.
  const S = Math.min(W, H);
  const nTop = scene.rows.filter((r) => r.half === "top").length;
  const pSeamTop = progress[nTop - 1] ?? 0;
  const pSeamBot = progress[nTop] ?? pSeamTop;
  const fam = p.fontFamily || "Avantt";
  const foldOut = (pr: number) => Math.min(1, pr / 0.3);
  const slide = 0.11 * S;

  const padY = 0.043 * S;
  const stage = measureLabel(ctx, p.stage, 0.089 * S, fam, 0.0095 * S, padY, W * 0.92, true);
  const stageTop = H / 2 + 0.046 * S - stage.bh;
  drawLabel(
    ctx,
    p.stage,
    stage,
    fam,
    cx,
    stageTop,
    (stage.bw / 2) * (1 - foldOut(pSeamTop)),
    -slide * foldOut(pSeamTop),
    p.colors,
  );
  const date = measureLabel(ctx, p.date, 0.046 * S, fam, 0.013 * S, padY, W * 0.92, true);
  const dateTop = stageTop + stage.bh + 0.021 * S;
  drawLabel(
    ctx,
    p.date,
    date,
    fam,
    cx,
    dateTop,
    (date.bw / 2) * (1 - foldOut(pSeamBot)),
    slide * foldOut(pSeamBot),
    p.colors,
  );

  const ac = scene.artist;
  const pa = segmentProgress(scene, t, ac.openAt, ac.openD, ac.closeAt, ac.closeD);
  const artist = measureLabel(ctx, p.artist, 0.145 * S, fam, 0.0097 * S, 0.0213 * S, W * 0.92, false);
  drawLabel(
    ctx,
    p.artist,
    artist,
    fam,
    cx,
    H - 0.06 * S - artist.bh,
    (artist.bw / 2) * pa,
    -0.12 * S * (1 - pa),
    p.colors,
  );
  ctx.restore();
}
