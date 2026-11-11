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
  movement: number; // 0..1 amount of extra block moves during the holds
  holeSize: number; // 0..1 of half the width
  holeVariation: number; // 0..1
  shapeSeed: number;
  duration: number; // s, one row's open/close transition
  moveDuration: number; // s, one block-width transition (reference ~3 s)
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
  imageX: number; // -1..1
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
  movement: 0.75,
  holeSize: 1,
  holeVariation: 0.3,
  shapeSeed: 3,
  duration: 1.6,
  moveDuration: 3,
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

export interface Move {
  t: number; // start time (s)
  d: number; // duration (s)
  from: number;
  to: number;
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
  m0: number; // multiplier in the closed (loop) state
  holeL: number; // px at 1x, fully open
  holeR: number;
  moves: Move[];
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
      holeL: 0,
      holeR: 0,
      moves: [],
    });
  }
  const maxRank = rows.reduce((m, r) => Math.max(m, r.rank), 0);
  const span = p.stagger * maxRank;
  const tOpen = p.holdClosed;
  const tOpenEnd = tOpen + p.duration + span;
  const tClose = tOpenEnd + p.holdOpen;
  const tCloseEnd = tClose + p.duration + span;
  const tl: Timeline = { tOpen, tOpenEnd, tClose, tCloseEnd, total: tCloseEnd, span };

  const q = 2 * p.unit; // hole edges snap to this grid
  for (const r of rows) {
    const k = r.index;
    r.delay = p.stagger * r.rank;
    r.closeDelay = span - r.delay;

    // Stripe phase: stratified so neighbouring rows don't form a staircase.
    r.phase = ((((k * 0.618) % 1) + rand(p.blockSeed, k, 1) * 0.6) % 1) * 2;
    // Closed-state width multiplier, nudged away from the row above.
    r.m0 = 1 + Math.floor(rand(p.blockSeed, k, 2) * 3);
    if (k > 0 && r.m0 === rows[k - 1].m0 && rand(p.blockSeed, k, 4) < 0.6) {
      r.m0 = pickStep(r.m0, rand(p.blockSeed, k, 5));
    }

    // Opening shape: a stepped hill peaking at the seam, plus seeded +-steps.
    const yc = (r.y0 + r.y1) / 2;
    const env = 1 - 0.6 * (Math.abs(yc - H / 2) / (H / 2));
    const base = Math.round(((W / 2) * p.holeSize * env) / q) * q;
    const sides: ("holeL" | "holeR")[] = ["holeL", "holeR"];
    sides.forEach((side, si) => {
      const noise = rand(p.shapeSeed, k, 10 + si) * 2 - 1;
      const steps = Math.round(noise * p.holeVariation * 3);
      r[side] = Math.max(0, Math.min(W / 2, base + steps * q));
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

  // Block width transitions. Measured on the reference: each row's width is
  // changing about 45% of the time in ~3 s eased transitions. The opening
  // transition starts with the row's hole (same stagger, same curve, longer),
  // extra transitions fill the open hold, and the closing transition starts
  // with the hole closing and may run on across the loop point (the card is
  // closed and static, the blocks still glide), exactly like the video.
  const d = p.duration;
  const T = tl.total;
  for (const r of rows) {
    const k = r.index;
    const moves: Move[] = [];
    let m = r.m0;
    const openAt = tOpen + r.delay;
    const closeAt = tClose + r.closeDelay;
    // the closing transition must end before the next loop's opening one
    const closeD = Math.max(0.1, Math.min(p.moveDuration, T + openAt - closeAt));
    const openD = Math.max(0.1, Math.min(p.moveDuration, closeAt - openAt));
    const m1 = pickStep(m, rand(p.blockSeed, k, 3));
    moves.push({ t: openAt, d: openD, from: m, to: m1 });
    m = m1;
    const a = openAt + openD;
    const L = Math.max(0, closeAt - a);
    const nMax = Math.floor(L / p.moveDuration);
    const nIdle = Math.min(nMax, Math.floor((p.movement * L) / p.moveDuration + rand(p.blockSeed, k, 30)));
    if (nIdle > 0) {
      // holds between transitions: the leftover time split by seeded weights
      const weights: number[] = [];
      let sum = 0;
      for (let j = 0; j <= nIdle; j++) {
        const wgt = 0.2 + rand(p.blockSeed, k, 40 + j);
        weights.push(wgt);
        sum += wgt;
      }
      const spare = L - nIdle * p.moveDuration;
      let t = a;
      for (let j = 0; j < nIdle; j++) {
        t += (spare * weights[j]) / sum;
        const to = pickStep(m, rand(p.blockSeed, k, 60 + j));
        moves.push({ t, d: p.moveDuration, from: m, to });
        m = to;
        t += p.moveDuration;
      }
    }
    if (m === r.m0) {
      // nothing to return to: bounce out and back so the row still glides
      const via = pickStep(m, rand(p.blockSeed, k, 90));
      moves.push({ t: closeAt, d: closeD / 2, from: m, to: via });
      moves.push({ t: closeAt + closeD / 2, d: closeD / 2, from: via, to: r.m0 });
    } else {
      moves.push({ t: closeAt, d: closeD, from: m, to: r.m0 });
    }
    r.moves = moves;
  }

  // The artist name has its own clock: it starts a beat after the bottom row
  // and unfolds a little faster; on close it folds with that row.
  const bottom = rows[n - 1];
  const artist: LabelClock = {
    openAt: tOpen + bottom.delay + 1.5 * p.stagger,
    openD: 0.8 * d,
    closeAt: tClose + bottom.closeDelay,
    closeD: 0.75 * d,
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

/** Block width multiplier (1..3 non-focus, fractional while moving) at time t. */
export function rowMultiplier(scene: Scene, r: RowSpec, t: number): number {
  const T = scene.tl.total;
  // closing transitions may run past the loop point into the next cycle
  for (const mv of r.moves) {
    if (mv.t + mv.d > T && t + T >= mv.t && t + T < mv.t + mv.d) {
      return mv.from + (mv.to - mv.from) * eased(scene, (t + T - mv.t) / mv.d);
    }
  }
  let m = r.m0;
  for (const mv of r.moves) {
    if (t < mv.t) break;
    if (t < mv.t + mv.d) return mv.from + (mv.to - mv.from) * eased(scene, (t - mv.t) / mv.d);
    m = mv.to;
  }
  return m;
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
    const y0 = Math.round(r.y0 * scale);
    const y1 = Math.round(r.y1 * scale);
    const h = y1 - y0;
    const cA = r.half === "top" ? p.colors.topA : p.colors.bottomA;
    const cB = r.half === "top" ? p.colors.topB : p.colors.bottomB;
    const edgeL = cx - holeL;
    const edgeR = cx + holeR;
    drawStripes(ctx, edgeL, 0, Math.round(edgeL), y0, h, w, r.phase, cA, cB);
    drawStripes(ctx, edgeR, Math.round(edgeR), W, y0, h, w, r.phase, cA, cB);
  }

  // Labels. Stage + date live on the closed card and fold into the seam as
  // its rows open (gone by ~30% of their progress, sliding sideways on the
  // way); the artist name unfolds along the bottom on its own clock.
  const S = Math.min(W, H);
  const nTop = scene.rows.filter((r) => r.half === "top").length;
  const pSeamTop = progress[nTop - 1] ?? 0;
  const pSeamBot = progress[nTop] ?? pSeamTop;
  const fam = p.fontFamily || "Manrope";
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
