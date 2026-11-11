import "./style.css";
import "vanilla-colorful/hex-color-picker.js";
import type { HexColorPicker } from "vanilla-colorful/hex-color-picker.js";
import {
  DEFAULT_PARAMS,
  EASING_PRESETS,
  FORMATS,
  bezierEase,
  buildScene,
  coverRect,
  render,
  type Bezier,
  type Colors,
  type Focus,
  type Format,
  type ImageSource,
  type Params,
  type Scene,
  type StaggerOrder,
} from "./engine";
import { exportMp4, exportPng, supportsVideoExport } from "./export";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("canvas");
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const stageEl = $<HTMLDivElement>("stage");
const dropZone = $<HTMLDivElement>("dropZone");
const fileInput = $<HTMLInputElement>("fileInput");
const timeSlider = $<HTMLInputElement>("timeSlider");
const timeVal = $<HTMLSpanElement>("timeVal");
const playBtn = $<HTMLButtonElement>("playBtn");
const canvasTitle = $<HTMLHeadingElement>("canvasTitle");
const sidebar = $<HTMLElement>("sidebar");
const exportPngBtn = $<HTMLButtonElement>("exportPngBtn");
const exportMp4Btn = $<HTMLButtonElement>("exportMp4Btn");

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const params: Params = structuredClone(DEFAULT_PARAMS);
let scene: Scene = buildScene(params);
let image: ImageSource | null = null;
let time = 0; // seconds into the loop
let playing = false;
let exportScale = 1;
let exportFps = 30;

// ---------- render scheduling ----------

let raf = 0;
function draw() {
  render(ctx, params, scene, time, 1, image);
}
function schedule() {
  if (raf || playing) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    draw();
  });
}
function rebuild() {
  scene = buildScene(params);
  if (time > scene.tl.total) time = 0;
  syncTime();
  schedule();
}
function syncTime() {
  const total = scene.tl.total;
  timeSlider.value = String(total > 0 ? time / total : 0);
  const frame = Math.round(time * exportFps);
  timeVal.textContent = `f ${frame} · ${time.toFixed(2)} / ${total.toFixed(2)} s`;
  exportPngBtn.textContent = `PNG @ ${time.toFixed(2)} s`;
}

// ---------- playback ----------

let playStart = 0;
let playOffset = 0;
function tick(now: number) {
  if (!playing) return;
  const total = scene.tl.total;
  time = total > 0 ? ((now - playStart) / 1000 + playOffset) % total : 0;
  syncTime();
  draw();
  requestAnimationFrame(tick);
}
function setPlaying(p: boolean) {
  if (p === playing) return;
  playing = p;
  playBtn.textContent = playing ? "Pause" : "Play";
  playBtn.classList.toggle("playing", playing);
  if (playing) {
    playStart = performance.now();
    playOffset = time;
    requestAnimationFrame(tick);
  } else {
    schedule();
  }
}
function setTime(t: number) {
  if (playing) setPlaying(false);
  time = clamp(t, 0, scene.tl.total);
  syncTime();
  schedule();
}
playBtn.addEventListener("click", () => setPlaying(!playing));
timeSlider.addEventListener("input", () => setTime(parseFloat(timeSlider.value) * scene.tl.total));
$<HTMLButtonElement>("timeResetBtn").addEventListener("click", () => setTime(0));

document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName ?? "";
  const type = (t as HTMLInputElement | null)?.type;
  const typing =
    t?.isContentEditable ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (tag === "INPUT" && type !== "range" && type !== "checkbox" && type !== "button");
  if (typing) return;
  if (e.code === "Space" || e.key === " ") {
    if (e.repeat || tag === "BUTTON") return; // let focused buttons activate
    e.preventDefault();
    setPlaying(!playing);
    return;
  }
  if (tag === "INPUT" && type === "range") return; // native slider keys
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const dir = e.key === "ArrowLeft" ? -1 : 1;
    const frames = e.shiftKey ? 10 : 1;
    setTime(time + (dir * frames) / exportFps);
  } else if (e.key === "Home") {
    e.preventDefault();
    setTime(0);
  }
});

// ---------- generic segmented buttons ----------

function bindSeg<T extends string>(
  id: string,
  attr: string,
  onPick: (value: T) => void,
): (value: T) => void {
  const seg = $<HTMLDivElement>(id);
  const btns = Array.from(seg.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`));
  const setActive = (value: T) => {
    for (const b of btns) b.classList.toggle("active", b.dataset[attr] === value);
  };
  for (const b of btns) {
    b.addEventListener("click", () => {
      const v = b.dataset[attr] as T;
      setActive(v);
      onPick(v);
    });
  }
  return setActive;
}

function updateCanvasTitle() {
  const [W, H] = FORMATS[params.format];
  const tail = exportScale > 1 ? ` · ${W * exportScale} x ${H * exportScale} at ${exportScale}x` : "";
  canvasTitle.textContent = `Canvas Preview · ${W} x ${H}${tail}`;
}
const setFormatUI = bindSeg<Format>("formatSeg", "format", (v) => {
  params.format = v;
  applyFormat();
  rebuild();
});
function applyFormat() {
  const [W, H] = FORMATS[params.format];
  canvas.width = W;
  canvas.height = H;
  updateCanvasTitle();
}
const setFocusUI = bindSeg<Focus>("focusSeg", "focus", (v) => {
  params.focus = v;
  rebuild();
});
const setOrderUI = bindSeg<StaggerOrder>("orderSeg", "order", (v) => {
  params.staggerOrder = v;
  rebuild();
});
bindSeg<string>("exportScaleSeg", "scale", (v) => {
  exportScale = parseInt(v, 10) || 1;
  updateCanvasTitle();
});
bindSeg<string>("exportFpsSeg", "fps", (v) => {
  exportFps = parseInt(v, 10) || 30;
  syncTime();
});

// ---------- number fields ----------

/** Arrow = +-step, Shift+Arrow = +-10 steps, Enter commits (design-system convention). */
function wireNumberKeys(el: HTMLInputElement, commit: () => void) {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      commit();
      return;
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = parseFloat(el.step || "1") * (e.shiftKey ? 10 : 1);
    const min = el.min === "" ? -Infinity : parseFloat(el.min);
    const max = el.max === "" ? Infinity : parseFloat(el.max);
    const cur = parseFloat(el.value) || 0;
    const next = clamp(cur + (e.key === "ArrowUp" ? step : -step), min, max);
    el.value = String(Math.round(next * 1000) / 1000);
    commit();
  });
}

function bindInt(id: string, apply: (v: number) => void, min: number, max: number) {
  const el = $<HTMLInputElement>(id);
  const commit = () => {
    let v = Math.round(parseFloat(el.value));
    if (!isFinite(v)) v = min;
    v = clamp(v, min, max);
    el.value = String(v);
    apply(v);
    rebuild();
  };
  el.addEventListener("change", commit);
  wireNumberKeys(el, commit);
  return el;
}
const rowsTopEl = bindInt("rowsTop", (v) => (params.rowsTop = v), 1, 24);
const rowsBottomEl = bindInt("rowsBottom", (v) => (params.rowsBottom = v), 1, 24);
const blockSeedEl = bindInt("blockSeed", (v) => (params.blockSeed = v), 0, 999999);
const shapeSeedEl = bindInt("shapeSeed", (v) => (params.shapeSeed = v), 0, 999999);
$<HTMLButtonElement>("blockShuffle").addEventListener("click", () => {
  params.blockSeed = Math.floor(Math.random() * 100000);
  blockSeedEl.value = String(params.blockSeed);
  rebuild();
});
$<HTMLButtonElement>("shapeShuffle").addEventListener("click", () => {
  params.shapeSeed = Math.floor(Math.random() * 100000);
  shapeSeedEl.value = String(params.shapeSeed);
  rebuild();
});

// ---------- sliders ----------

type NumKey =
  | "unit"
  | "moveMin"
  | "moveMax"
  | "travelMin"
  | "travelMax"
  | "floatCount"
  | "floatMin"
  | "floatMax"
  | "duration"
  | "stagger"
  | "holeSize"
  | "holeVariation"
  | "holdClosed"
  | "holdOpen"
  | "imageZoom";

interface SliderDef {
  key: NumKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  container: string;
  title?: string;
  pairMin?: NumKey; // this slider is a maximum; keep it >= pairMin
  pairMax?: NumKey; // this slider is a minimum; keep it <= pairMax
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${v.toFixed(2)} s`;
const units = (v: number) => `${v.toFixed(1)} u`;
const px = (v: number) => `${v.toFixed(0)}px`;
const sliderDefs: SliderDef[] = [
  { key: "unit", label: "Block unit", min: 12, max: 160, step: 1, format: px, container: "blockSliders", title: "Width of one block unit at 1x; rows use 1, 2 or 3 units" },
  { key: "moveMin", label: "Move length min", min: 0.3, max: 8, step: 0.05, format: secs, container: "blockSliders", pairMax: "moveMax", title: "Shortest keyframe transition; each move picks a length between min and max" },
  { key: "moveMax", label: "Move length max", min: 0.3, max: 8, step: 0.05, format: secs, container: "blockSliders", pairMin: "moveMin" },
  { key: "travelMin", label: "Travel min", min: 0, max: 400, step: 1, format: px, container: "blockSliders", pairMax: "travelMax", title: "Smallest sideways step per keyframe, at 1x" },
  { key: "travelMax", label: "Travel max", min: 0, max: 400, step: 1, format: px, container: "blockSliders", pairMin: "travelMin", title: "Largest sideways step per keyframe; the drift stays within this distance" },
  { key: "floatCount", label: "Per row", min: 0, max: 8, step: 1, format: (v) => v.toFixed(0), container: "floatSliders", title: "Free blocks inside each open row; they grow, shrink and drift with the move and travel ranges" },
  { key: "floatMin", label: "Size min", min: 0.2, max: 8, step: 0.1, format: units, container: "floatSliders", pairMax: "floatMax" },
  { key: "floatMax", label: "Size max", min: 0.2, max: 8, step: 0.1, format: units, container: "floatSliders", pairMin: "floatMin" },
  { key: "duration", label: "Duration", min: 0.1, max: 4, step: 0.05, format: secs, container: "openSliders" },
  { key: "stagger", label: "Stagger per row", min: 0, max: 1, step: 0.01, format: secs, container: "openSliders" },
  { key: "holeSize", label: "Hole width", min: 0, max: 1, step: 0.01, format: pct, container: "shapeSliders", title: "How far the rows open; 100% leaves no blocks" },
  { key: "holeVariation", label: "Hole irregularity", min: 0, max: 1, step: 0.01, format: pct, container: "shapeSliders", title: "Random extra steps per row and side; the hole never widens away from the seam" },
  { key: "holdClosed", label: "Hold closed", min: 0, max: 6, step: 0.05, format: secs, container: "timeSliders" },
  { key: "holdOpen", label: "Hold open", min: 0, max: 12, step: 0.05, format: secs, container: "timeSliders" },
  { key: "imageZoom", label: "Zoom", min: 1, max: 3, step: 0.01, format: pct, container: "imageSliders" },
];
const numParams = params as unknown as Record<NumKey, number>;
const sliderInputs: Partial<Record<NumKey, HTMLInputElement>> = {};
const sliderVals: Partial<Record<NumKey, HTMLSpanElement>> = {};

function syncSlider(key: NumKey) {
  const def = sliderDefs.find((d) => d.key === key);
  const inp = sliderInputs[key];
  const val = sliderVals[key];
  if (def && inp) inp.value = String(numParams[key]);
  if (def && val) val.textContent = def.format(numParams[key]);
}

function renderSlider(def: SliderDef) {
  const wrap = document.createElement("div");
  wrap.className = "slider";
  if (def.title) wrap.title = def.title;
  wrap.innerHTML = `
    <div class="slider-head">
      <span class="slider-label">${def.label}</span>
      <span class="slider-val"></span>
    </div>
    <div class="slider-row">
      <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${numParams[def.key]}" />
      <button type="button" class="reset-btn" title="Reset to default">reset</button>
    </div>`;
  const input = wrap.querySelector('input[type="range"]') as HTMLInputElement;
  const val = wrap.querySelector(".slider-val") as HTMLSpanElement;
  const reset = wrap.querySelector(".reset-btn") as HTMLButtonElement;
  sliderInputs[def.key] = input;
  sliderVals[def.key] = val;
  const label = () => (val.textContent = def.format(numParams[def.key]));
  label();
  input.addEventListener("input", () => {
    numParams[def.key] = parseFloat(input.value);
    if (def.pairMax && numParams[def.pairMax] < numParams[def.key]) {
      numParams[def.pairMax] = numParams[def.key];
      syncSlider(def.pairMax);
    }
    if (def.pairMin && numParams[def.pairMin] > numParams[def.key]) {
      numParams[def.pairMin] = numParams[def.key];
      syncSlider(def.pairMin);
    }
    label();
    rebuild();
  });
  reset.addEventListener("click", () => {
    numParams[def.key] = (DEFAULT_PARAMS as unknown as Record<NumKey, number>)[def.key];
    input.value = String(numParams[def.key]);
    label();
    rebuild();
  });
  $<HTMLDivElement>(def.container).appendChild(wrap);
}
for (const def of sliderDefs) renderSlider(def);

// ---------- easing ----------

const easingSelect = $<HTMLSelectElement>("easingSelect");
const bzInputs = [0, 1, 2, 3].map((i) => $<HTMLInputElement>(`bz${i}`));
const easingPreview = $<HTMLCanvasElement>("easingPreview");
for (const name of Object.keys(EASING_PRESETS)) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  easingSelect.appendChild(opt);
}
const customOpt = document.createElement("option");
customOpt.value = "Custom";
customOpt.textContent = "Custom";
customOpt.disabled = true;
easingSelect.appendChild(customOpt);

function presetNameFor(b: Bezier): string {
  for (const [name, v] of Object.entries(EASING_PRESETS)) {
    if (v.every((x, i) => Math.abs(x - b[i]) < 1e-6)) return name;
  }
  return "Custom";
}
function drawEasingPreview() {
  const c = easingPreview;
  const g = c.getContext("2d");
  if (!g) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 300;
  const h = 80;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const style = getComputedStyle(document.documentElement);
  const surface = style.getPropertyValue("--surface").trim() || "#2c0e23";
  const ink = style.getPropertyValue("--on-surface").trim() || "#dff0ff";
  g.fillStyle = surface;
  g.fillRect(0, 0, w, h);
  const pad = 8;
  const px = (x: number) => pad + x * (w - 2 * pad);
  const py = (y: number) => h - pad - y * (h - 2 * pad);
  const [x1, y1, x2, y2] = params.easing;
  // control handles
  g.strokeStyle = ink;
  g.globalAlpha = 0.45;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(px(0), py(0));
  g.lineTo(px(x1), py(y1));
  g.moveTo(px(1), py(1));
  g.lineTo(px(x2), py(y2));
  g.stroke();
  for (const [hx, hy] of [
    [x1, y1],
    [x2, y2],
  ]) {
    g.beginPath();
    g.arc(px(hx), py(hy), 3, 0, Math.PI * 2);
    g.fillStyle = ink;
    g.fill();
  }
  g.globalAlpha = 1;
  g.lineWidth = 1.5;
  g.beginPath();
  const ease = bezierEase(params.easing);
  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    const y = ease(x);
    if (i === 0) g.moveTo(px(x), py(y));
    else g.lineTo(px(x), py(y));
  }
  g.stroke();
}
function syncEasingUI() {
  easingSelect.value = presetNameFor(params.easing);
  bzInputs.forEach((el, i) => (el.value = String(Math.round(params.easing[i] * 100) / 100)));
  drawEasingPreview();
}
easingSelect.addEventListener("change", () => {
  const preset = EASING_PRESETS[easingSelect.value];
  if (preset) {
    params.easing = [...preset] as Bezier;
    syncEasingUI();
    rebuild();
  }
});
bzInputs.forEach((el, i) => {
  const commit = () => {
    const v = parseFloat(el.value);
    if (!isFinite(v)) {
      el.value = String(params.easing[i]);
      return;
    }
    const next = [...params.easing] as Bezier;
    next[i] = clamp(v, 0, 1);
    params.easing = next;
    el.value = String(next[i]);
    easingSelect.value = presetNameFor(next);
    drawEasingPreview();
    rebuild();
  };
  el.addEventListener("change", commit);
  wireNumberKeys(el, commit);
});

// ---------- text + font ----------

function bindText(id: string, apply: (v: string) => void) {
  const el = $<HTMLInputElement>(id);
  el.addEventListener("input", () => {
    apply(el.value);
    schedule();
  });
  return el;
}
const artistEl = bindText("artistText", (v) => (params.artist = v));
const stageTextEl = bindText("stageText", (v) => (params.stage = v));
const dateEl = bindText("dateText", (v) => (params.date = v));
async function waitForFont(family: string) {
  try {
    await document.fonts.load(`700 100px "${family}"`);
  } catch {
    /* fall back silently */
  }
  schedule();
}
document.fonts.addEventListener("loadingdone", () => schedule());

// ---------- colours ----------

const colorLabels: Record<keyof Colors, string> = {
  topA: "Top base",
  topB: "Top blocks",
  bottomA: "Bottom base",
  bottomB: "Bottom blocks",
  labelBg: "Label background",
  labelText: "Label text",
};
function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split("").map((c) => c + c).join("");
  if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toUpperCase();
  return null;
}
const colorInputs: Partial<Record<keyof Colors, { swatch: HTMLButtonElement; hex: HTMLInputElement }>> = {};
let popover: HTMLDivElement | null = null;
let closePopoverListeners: (() => void) | null = null;
function closePicker() {
  popover?.remove();
  popover = null;
  closePopoverListeners?.();
  closePopoverListeners = null;
}
function openPicker(anchor: HTMLElement, current: string, onChange: (hex: string) => void) {
  closePicker();
  popover = document.createElement("div");
  popover.className = "color-popover";
  const picker = document.createElement("hex-color-picker") as HexColorPicker;
  picker.color = current;
  picker.addEventListener("color-changed", (e: Event) => {
    onChange((e as CustomEvent<{ value: string }>).detail.value);
  });
  popover.appendChild(picker);
  document.body.appendChild(popover);
  const r = anchor.getBoundingClientRect();
  popover.style.left = `${Math.max(8, Math.min(window.innerWidth - 250, r.right + 8))}px`;
  popover.style.top = `${Math.max(8, Math.min(window.innerHeight - 250, r.top))}px`;
  const onDoc = (ev: MouseEvent) => {
    if (popover && !popover.contains(ev.target as Node) && ev.target !== anchor) closePicker();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") closePicker();
  };
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
  closePopoverListeners = () => {
    document.removeEventListener("mousedown", onDoc);
    document.removeEventListener("keydown", onKey);
  };
}
function buildColorRows() {
  const host = $<HTMLDivElement>("colorRows");
  host.innerHTML = "";
  for (const key of Object.keys(colorLabels) as (keyof Colors)[]) {
    const row = document.createElement("div");
    row.className = "color-row";
    row.innerHTML = `
      <span class="color-label">${colorLabels[key]}</span>
      <button type="button" class="swatch" title="Pick colour"></button>
      <input type="text" maxlength="7" spellcheck="false" />`;
    const swatch = row.querySelector(".swatch") as HTMLButtonElement;
    const hex = row.querySelector("input") as HTMLInputElement;
    colorInputs[key] = { swatch, hex };
    const setColor = (c: string) => {
      params.colors[key] = c;
      swatch.style.background = c;
      hex.value = c;
      schedule();
    };
    swatch.style.background = params.colors[key];
    hex.value = params.colors[key];
    swatch.addEventListener("click", () => openPicker(swatch, params.colors[key], setColor));
    const commit = () => {
      const n = normalizeHex(hex.value);
      if (n) setColor(n);
      else hex.value = params.colors[key];
    };
    hex.addEventListener("change", commit);
    hex.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
    });
    host.appendChild(row);
  }
}
buildColorRows();

// ---------- background image ----------

const imageRemoveBtn = $<HTMLButtonElement>("imageRemoveBtn");
let loadGen = 0;
function setImage(next: ImageSource | null) {
  image = next;
  canvas.classList.toggle("has-image", !!next);
  imageRemoveBtn.disabled = !next;
  schedule();
}
function loadImageFile(file: File) {
  if (!file.type.startsWith("image/")) return;
  const gen = ++loadGen;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    if (gen !== loadGen) return; // a newer file won
    setImage({ source: img, width: img.naturalWidth, height: img.naturalHeight });
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    if (gen === loadGen) alert("Could not load that image.");
  };
  img.src = url;
}
$<HTMLButtonElement>("imageLoadBtn").addEventListener("click", () => fileInput.click());
imageRemoveBtn.addEventListener("click", () => {
  loadGen++;
  setImage(null);
});
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  fileInput.value = "";
  if (f) loadImageFile(f);
});
for (const ev of ["dragenter", "dragover"]) {
  stageEl.addEventListener(ev, (e) => {
    e.preventDefault();
    stageEl.classList.add("dragover");
    dropZone.classList.add("dragover");
  });
}
for (const ev of ["dragleave", "drop"]) {
  stageEl.addEventListener(ev, (e) => {
    e.preventDefault();
    stageEl.classList.remove("dragover");
    dropZone.classList.remove("dragover");
  });
}
stageEl.addEventListener("drop", (e) => {
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) loadImageFile(f);
});

// Drag on the preview to reposition the photo; a plain click (no drag) still
// opens the file picker to replace it.
let panning = false;
let panMoved = false;
let panX = 0;
let panY = 0;
stageEl.addEventListener("pointerdown", (e) => {
  if (!image || e.button !== 0) return;
  panning = true;
  panMoved = false;
  panX = e.clientX;
  panY = e.clientY;
  stageEl.setPointerCapture(e.pointerId);
});
stageEl.addEventListener("pointermove", (e) => {
  if (!panning || !image) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const k = canvas.width / rect.width; // canvas px per css px
  const dx = (e.clientX - panX) * k;
  const dy = (e.clientY - panY) * k;
  if (!panMoved && Math.hypot(e.clientX - panX, e.clientY - panY) < 3) return;
  panMoved = true;
  stageEl.classList.add("panning");
  panX = e.clientX;
  panY = e.clientY;
  const W = canvas.width;
  const H = canvas.height;
  const c = coverRect(image, W, H, params.imageZoom, 0, 0);
  if (c.dw - W > 1) params.imageX = clamp(params.imageX - dx / ((c.dw - W) / 2), -1, 1);
  if (c.dh - H > 1) params.imageY = clamp(params.imageY - dy / ((c.dh - H) / 2), -1, 1);
  schedule();
});
for (const ev of ["pointerup", "pointercancel"]) {
  stageEl.addEventListener(ev, () => {
    panning = false;
    stageEl.classList.remove("panning");
  });
}
dropZone.addEventListener("click", () => {
  if (panMoved) {
    panMoved = false;
    return;
  }
  fileInput.click();
});

// Scroll on the preview to zoom the canvas within the stage (CSS, not transform).
let previewScale = 1;
stageEl.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const next = clamp(previewScale - e.deltaY * 0.002, 0.1, 1);
    if (next === previewScale) return;
    previewScale = next;
    canvas.style.setProperty("--preview-scale", String(previewScale));
  },
  { passive: false },
);

// ---------- settings copy / paste ----------

function flash(btn: HTMLButtonElement, msg: string, ms = 900) {
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = orig), ms);
}
const intRanges: Record<"rowsTop" | "rowsBottom" | "blockSeed" | "shapeSeed", [number, number]> = {
  rowsTop: [1, 24],
  rowsBottom: [1, 24],
  blockSeed: [0, 999999],
  shapeSeed: [0, 999999],
};
function applySettings(str: string): boolean {
  let obj: Partial<Record<keyof Params, unknown>>;
  try {
    obj = JSON.parse(str.trim());
  } catch {
    return false;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  let applied = 0;
  for (const def of sliderDefs) {
    const v = obj[def.key];
    if (typeof v === "number" && Number.isFinite(v)) {
      numParams[def.key] = clamp(v, def.min, def.max);
      applied++;
    }
  }
  for (const k of Object.keys(intRanges) as (keyof typeof intRanges)[]) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      params[k] = clamp(Math.round(v), intRanges[k][0], intRanges[k][1]);
      applied++;
    }
  }
  if (typeof obj.format === "string" && Object.hasOwn(FORMATS, obj.format)) {
    params.format = obj.format as Format;
    applied++;
  }
  if (obj.focus === "top" || obj.focus === "bottom") {
    params.focus = obj.focus;
    applied++;
  }
  if (obj.staggerOrder === "center" || obj.staggerOrder === "top" || obj.staggerOrder === "bottom") {
    params.staggerOrder = obj.staggerOrder;
    applied++;
  }
  if (
    Array.isArray(obj.easing) &&
    obj.easing.length === 4 &&
    obj.easing.every((x) => typeof x === "number" && Number.isFinite(x))
  ) {
    params.easing = (obj.easing as number[]).map((x) => clamp(x, 0, 1)) as Bezier;
    applied++;
  }
  for (const k of ["imageX", "imageY"] as const) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      params[k] = clamp(v, -1, 1);
      applied++;
    }
  }
  for (const k of ["artist", "stage", "date"] as const) {
    if (typeof obj[k] === "string") {
      params[k] = (obj[k] as string).slice(0, 200);
      applied++;
    }
  }
  if (obj.colors && typeof obj.colors === "object") {
    const c = obj.colors as Record<string, unknown>;
    for (const k of Object.keys(colorLabels) as (keyof Colors)[]) {
      const n = typeof c[k] === "string" ? normalizeHex(c[k] as string) : null;
      if (n) {
        params.colors[k] = n;
        applied++;
      }
    }
  }
  if (!applied) return false;
  syncUI();
  applyFormat();
  rebuild();
  return true;
}
const copyBtn = $<HTMLButtonElement>("copySettingsBtn");
const pasteBtn = $<HTMLButtonElement>("pasteSettingsBtn");
copyBtn.addEventListener("click", async () => {
  const str = JSON.stringify(params);
  try {
    await navigator.clipboard.writeText(str);
    flash(copyBtn, "Copied!");
  } catch {
    prompt("Copy settings:", str);
  }
});
pasteBtn.addEventListener("click", async () => {
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    text = prompt("Paste settings string:") ?? "";
  }
  if (!text) return;
  flash(pasteBtn, applySettings(text) ? "Applied!" : "Invalid", 1200);
});

function syncUI() {
  setFormatUI(params.format);
  setFocusUI(params.focus);
  setOrderUI(params.staggerOrder);
  rowsTopEl.value = String(params.rowsTop);
  rowsBottomEl.value = String(params.rowsBottom);
  blockSeedEl.value = String(params.blockSeed);
  shapeSeedEl.value = String(params.shapeSeed);
  for (const def of sliderDefs) syncSlider(def.key);
  syncEasingUI();
  artistEl.value = params.artist;
  stageTextEl.value = params.stage;
  dateEl.value = params.date;
  for (const k of Object.keys(colorLabels) as (keyof Colors)[]) {
    const ci = colorInputs[k];
    if (ci) {
      ci.swatch.style.background = params.colors[k];
      ci.hex.value = params.colors[k];
    }
  }
}

// ---------- export ----------

function snapshot() {
  const p = structuredClone(params);
  return { p, scene: buildScene(p), image };
}
exportPngBtn.addEventListener("click", async () => {
  const snap = snapshot();
  exportPngBtn.disabled = true;
  try {
    await exportPng(snap.p, snap.scene, time, exportScale, snap.image);
  } catch (err) {
    console.error("[export]", err);
    alert("PNG export failed; check the console.");
  } finally {
    exportPngBtn.disabled = false;
  }
});
exportMp4Btn.addEventListener("click", async () => {
  if (!supportsVideoExport()) {
    alert("Video export needs WebCodecs (Chrome, Edge or Safari 16.4+).");
    return;
  }
  const wasPlaying = playing;
  setPlaying(false);
  const snap = snapshot();
  sidebar.inert = true;
  exportMp4Btn.disabled = true;
  exportPngBtn.disabled = true;
  try {
    await exportMp4(snap.p, snap.scene, exportScale, exportFps, snap.image, (f) => {
      exportMp4Btn.textContent = `Encoding ${Math.round(f * 100)}%`;
    });
  } catch (err) {
    console.error("[export]", err);
    alert("Export failed. Try 1x or check the console.");
  } finally {
    exportMp4Btn.textContent = "MP4";
    exportMp4Btn.disabled = false;
    exportPngBtn.disabled = false;
    sidebar.inert = false;
    if (wasPlaying && !playing) setPlaying(true);
    else schedule();
  }
});

// ---------- hooks for automated testing ----------

declare global {
  interface Window {
    artistCard: {
      params: Params;
      setTime: (t: number) => void;
      apply: (json: string) => boolean;
      loadImageUrl: (url: string) => Promise<void>;
      render: () => void;
      total: () => number;
    };
  }
}
window.artistCard = {
  params,
  setTime: (t: number) => {
    setTime(t);
    draw();
  },
  apply: applySettings,
  loadImageUrl: (url: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        loadGen++;
        setImage({ source: img, width: img.naturalWidth, height: img.naturalHeight });
        draw();
        resolve();
      };
      img.onerror = () => reject(new Error("image failed"));
      img.src = url;
    }),
  render: draw,
  total: () => scene.tl.total,
};

// ---------- init ----------

applyFormat();
syncUI();
rebuild();
waitForFont(params.fontFamily);
document.fonts.ready.then(() => schedule());
window.addEventListener("resize", drawEasingPreview);
