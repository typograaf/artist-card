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
  focus: Focus; // this half gets 2x block width
  blockSeed: number;
  movement: number; // 0..1 amount of independent block moves
  holeSize: number; // 0..1 of half the width
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
  imageX: number; // -1..1
  imageY: number; // -1..1
}

export const EASING_PRESETS: Record<string, Bezier> = {
  Reference: [0.7, 0.15, 0.05, 0.8],
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
  movement: 0.5,
  holeSize: 0.9,
  holeVariation: 0.3,
  shapeSeed: 3,
  duration: 1.5,
  stagger: 0.13,
  staggerOrder: "center",
  easing: [0.7, 0.15, 0.05, 0.8],
  holdClosed: 1.5,
  holdOpen: 5,
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
  fontFamily: "Manrope",
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
  delay: number;
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

export interface Scene {
  W: number;
  H: number;
  rows: RowSpec[];
  tl: Timeline;
  ease: (x: number) => number;
}

const clampInt = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(v) || lo));

function pickOther(current: number, r: number): number {
  const options = [1, 2, 3].filter((m) => m !== current);
  return options[Math.min(options.length - 1, Math.floor(r * options.length))];
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
    r.phase = rand(p.blockSeed, k, 1) * 2;
    r.m0 = 1 + Math.floor(rand(p.blockSeed, k, 2) * 3);

    // Opening shape: a hill that peaks at the seam, plus seeded variation per side.
    const yc = (r.y0 + r.y1) / 2;
    const env = 1 - 0.6 * (Math.abs(yc - H / 2) / (H / 2));
    const sides: ("holeL" | "holeR")[] = ["holeL", "holeR"];
    sides.forEach((side, si) => {
      const noise = rand(p.shapeSeed, k, 10 + si) * 2 - 1;
      const raw = (W / 2) * p.holeSize * env * (1 + p.holeVariation * noise);
      const snapped = Math.round(raw / q) * q;
      r[side] = Math.max(0, Math.min(W / 2, snapped));
    });

    // Block width transitions: optional pre-move in the closed hold, the opening
    // move (same easing/stagger as the hole), independent moves during the open
    // hold, and the closing move back to m0 so the loop is seamless.
    const moves: Move[] = [];
    let m = r.m0;
    const openAt = tOpen + r.delay;
    const closeAt = tClose + r.delay;
    if (p.holdClosed > p.duration * 1.6 && rand(p.blockSeed, k, 20) < p.movement) {
      const latest = openAt - p.duration * 1.1;
      const t = 0.2 + rand(p.blockSeed, k, 21) * Math.max(0, latest - 0.2);
      const to = pickOther(m, rand(p.blockSeed, k, 22));
      moves.push({ t, d: p.duration, from: m, to });
      m = to;
    }
    const m1 = pickOther(m, rand(p.blockSeed, k, 3));
    moves.push({ t: openAt, d: p.duration, from: m, to: m1 });
    m = m1;
    const a = openAt + p.duration;
    const b = closeAt - p.duration;
    const L = b - a;
    const nMax = Math.floor(L / p.duration);
    let nIdle = Math.floor(rand(p.blockSeed, k, 30) * (p.movement * 4 + 0.999));
    nIdle = Math.min(nIdle, Math.max(0, nMax - 1));
    if (nIdle > 0) {
      const slot = (L - p.duration) / nIdle;
      for (let j = 0; j < nIdle; j++) {
        const t = a + slot * (j + rand(p.blockSeed, k, 40 + j) * 0.8);
        const to = pickOther(m, rand(p.blockSeed, k, 60 + j));
        moves.push({ t, d: p.duration, from: m, to });
        m = to;
      }
    }
    moves.push({ t: closeAt, d: p.duration, from: m, to: r.m0 });
    r.moves = moves;
  }
  return { W, H, rows, tl, ease: bezierEase(p.easing) };
}

/** Row opening progress 0..1 at time t (seconds into the loop). */
export function rowProgress(scene: Scene, p: Params, r: RowSpec, t: number): number {
  const a = scene.tl.tOpen + r.delay;
  const c = scene.tl.tClose + r.delay;
  let pr = 0;
  if (t < a) pr = 0;
  else if (t < a + p.duration) pr = scene.ease((t - a) / p.duration);
  else if (t < c) pr = 1;
  else if (t < c + p.duration) pr = 1 - scene.ease((t - c) / p.duration);
  // Long-tailed easings spend their last frames on sub-pixel motion; snap so
  // the loop ends truly closed (no hairline hole or label sliver at the seam).
  if (pr < 0.004) return 0;
  if (pr > 0.996) return 1;
  return pr;
}

/** Block width multiplier (1..3, fractional while moving) at time t. */
export function rowMultiplier(scene: Scene, r: RowSpec, t: number): number {
  let m = r.m0;
  for (const mv of r.moves) {
    if (t < mv.t) break;
    if (t < mv.t + mv.d) return mv.from + (mv.to - mv.from) * scene.ease((t - mv.t) / mv.d);
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

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: ImageSource,
  W: number,
  H: number,
  zoom: number,
  ox: number,
  oy: number,
) {
  const s = Math.max(W / img.width, H / img.height) * Math.max(0.1, zoom);
  const dw = img.width * s;
  const dh = img.height * s;
  const x = (W - dw) / 2 - ox * ((dw - W) / 2);
  const y = (H - dh) / 2 - oy * ((dh - H) / 2);
  ctx.drawImage(img.source, x, y, dw, dh);
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
  capH: number;
}

function labelFont(fs: number, family: string) {
  return `800 ${fs}px "${family}", "Manrope", system-ui, sans-serif`;
}

function measureLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  fs: number,
  family: string,
  maxW: number,
): LabelMetrics {
  ctx.font = labelFont(fs, family);
  let tw = ctx.measureText(text).width;
  let bw = tw + 2 * 0.2 * fs;
  if (bw > maxW && tw > 0) {
    fs = fs * (maxW / bw);
    ctx.font = labelFont(fs, family);
    tw = ctx.measureText(text).width;
    bw = tw + 2 * 0.2 * fs;
  }
  const capH = ctx.measureText("H").actualBoundingBoxAscent || fs * 0.7;
  return { fs, bw, bh: 1.5 * fs, capH };
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
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, cx + offsetX, top + m.bh / 2 + m.capH / 2);
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
  if (image) drawCover(ctx, image, W, H, p.imageZoom, p.imageX, p.imageY);

  const progress: number[] = [];
  for (const r of scene.rows) {
    const pr = rowProgress(scene, p, r, t);
    progress[r.index] = pr;
    const mult = rowMultiplier(scene, r, t);
    const w = Math.max(1, p.unit * scale * mult * (r.half === p.focus ? 2 : 1));
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

  // Labels. Stage + date live on the closed card and fold away into the seam
  // as it opens; the artist name unfolds from the bottom once the last rows open.
  // Measured on the reference: the closed-card labels are gone by ~30% of the
  // seam rows' progress, sliding ~35% of their half-width on the way out; the
  // artist name is fully unfolded at ~90% of the last row's progress.
  const S = Math.min(W, H);
  const nTop = scene.rows.filter((r) => r.half === "top").length;
  const pSeamTop = progress[nTop - 1] ?? 0;
  const pSeamBot = progress[nTop] ?? pSeamTop;
  const pLast = progress[scene.rows.length - 1] ?? 0;
  const fam = p.fontFamily || "Manrope";
  const foldOut = (pr: number) => Math.min(1, pr / 0.3);
  const unfold = (pr: number) => Math.min(1, pr / 0.9);

  const stage = measureLabel(ctx, p.stage, 0.1 * S, fam, W * 0.92);
  const stageTop = H / 2 + 0.046 * S - stage.bh;
  drawLabel(
    ctx,
    p.stage,
    stage,
    fam,
    cx,
    stageTop,
    (stage.bw / 2) * (1 - foldOut(pSeamTop)),
    -0.35 * foldOut(pSeamTop) * (stage.bw / 2),
    p.colors,
  );
  const date = measureLabel(ctx, p.date, 0.05 * S, fam, W * 0.92);
  const dateTop = stageTop + stage.bh + 0.02 * S;
  drawLabel(
    ctx,
    p.date,
    date,
    fam,
    cx,
    dateTop,
    (date.bw / 2) * (1 - foldOut(pSeamBot)),
    0.35 * foldOut(pSeamBot) * (date.bw / 2),
    p.colors,
  );
  const artist = measureLabel(ctx, p.artist, 0.15 * S, fam, W * 0.85);
  drawLabel(
    ctx,
    p.artist,
    artist,
    fam,
    cx,
    H - artist.bh,
    (artist.bw / 2) * unfold(pLast),
    -0.35 * (1 - unfold(pLast)) * (artist.bw / 2),
    p.colors,
  );
  ctx.restore();
}
