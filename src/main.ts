import "./style.css";
import "vanilla-colorful/hex-color-picker.js";
import type { HexColorPicker } from "vanilla-colorful/hex-color-picker.js";
import {
  DEFAULT_PARAMS,
  EASING_PRESETS,
  FORMATS,
  bezierEase,
  buildScene,
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
const fontInput = $<HTMLInputElement>("fontInput");
const timeSlider = $<HTMLInputElement>("timeSlider");
const timeVal = $<HTMLSpanElement>("timeVal");
const playBtn = $<HTMLButtonElement>("playBtn");

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
  timeSlider.value = String(scene.tl.total > 0 ? time / scene.tl.total : 0);
  timeVal.textContent = `${time.toFixed(2)} s / ${scene.tl.total.toFixed(2)} s`;
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
playBtn.addEventListener("click", () => setPlaying(!playing));
timeSlider.addEventListener("input", () => {
  if (playing) setPlaying(false);
  time = parseFloat(timeSlider.value) * scene.tl.total;
  syncTime();
  schedule();
});
$<HTMLButtonElement>("timeResetBtn").addEventListener("click", () => {
  if (playing) setPlaying(false);
  time = 0;
  syncTime();
  schedule();
});
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.key !== " ") return;
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName ?? "";
  const type = (t as HTMLInputElement | null)?.type;
  const typing =
    t?.isContentEditable ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (tag === "INPUT" && type !== "range" && type !== "checkbox" && type !== "button");
  if (typing) return;
  e.preventDefault();
  setPlaying(!playing);
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

const setFormatUI = bindSeg<Format>("formatSeg", "format", (v) => {
  params.format = v;
  applyFormat();
  rebuild();
});
function applyFormat() {
  const [W, H] = FORMATS[params.format];
  canvas.width = W;
  canvas.height = H;
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
});
bindSeg<string>("exportFpsSeg", "fps", (v) => {
  exportFps = parseInt(v, 10) || 30;
});

// ---------- number fields ----------

function bindInt(id: string, apply: (v: number) => void, min: number, max: number) {
  const el = $<HTMLInputElement>(id);
  const commit = () => {
    let v = Math.round(parseFloat(el.value));
    if (!isFinite(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    el.value = String(v);
    apply(v);
    rebuild();
  };
  el.addEventListener("change", commit);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
  });
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
  | "movement"
  | "duration"
  | "stagger"
  | "holeSize"
  | "holeVariation"
  | "holdClosed"
  | "holdOpen"
  | "imageZoom"
  | "imageX"
  | "imageY";

interface SliderDef {
  key: NumKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  container: string;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${v.toFixed(2)} s`;
const sliderDefs: SliderDef[] = [
  { key: "unit", label: "Block unit", min: 12, max: 160, step: 1, format: (v) => `${v.toFixed(0)}px`, container: "blockSliders" },
  { key: "movement", label: "Independent movement", min: 0, max: 1, step: 0.01, format: pct, container: "blockSliders" },
  { key: "duration", label: "Duration", min: 0.1, max: 4, step: 0.05, format: secs, container: "openSliders" },
  { key: "stagger", label: "Stagger per row", min: 0, max: 1, step: 0.01, format: secs, container: "openSliders" },
  { key: "holeSize", label: "Hole size", min: 0, max: 1, step: 0.01, format: pct, container: "shapeSliders" },
  { key: "holeVariation", label: "Variation", min: 0, max: 1, step: 0.01, format: pct, container: "shapeSliders" },
  { key: "holdClosed", label: "Hold closed", min: 0, max: 6, step: 0.05, format: secs, container: "timeSliders" },
  { key: "holdOpen", label: "Hold open", min: 0, max: 12, step: 0.05, format: secs, container: "timeSliders" },
  { key: "imageZoom", label: "Zoom", min: 1, max: 3, step: 0.01, format: pct, container: "imageSliders" },
  { key: "imageX", label: "Position X", min: -1, max: 1, step: 0.01, format: (v) => v.toFixed(2), container: "imageSliders" },
  { key: "imageY", label: "Position Y", min: -1, max: 1, step: 0.01, format: (v) => v.toFixed(2), container: "imageSliders" },
];
const numParams = params as unknown as Record<NumKey, number>;
const sliderInputs: Partial<Record<NumKey, HTMLInputElement>> = {};
const sliderVals: Partial<Record<NumKey, HTMLSpanElement>> = {};

function renderSlider(def: SliderDef) {
  const wrap = document.createElement("div");
  wrap.className = "slider";
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
  g.fillStyle = style.getPropertyValue("--surface").trim() || "#2c0e23";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = style.getPropertyValue("--on-surface").trim() || "#dff0ff";
  g.lineWidth = 1.5;
  g.beginPath();
  const ease = bezierEase(params.easing);
  const pad = 8;
  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    const y = ease(x);
    const px = pad + x * (w - 2 * pad);
    const py = h - pad - y * (h - 2 * pad);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
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
    if (!isFinite(v)) return;
    const next = [...params.easing] as Bezier;
    next[i] = i % 2 === 0 ? Math.max(0, Math.min(1, v)) : Math.max(-1, Math.min(2, v));
    params.easing = next;
    el.value = String(next[i]);
    easingSelect.value = presetNameFor(next);
    drawEasingPreview();
    rebuild();
  };
  el.addEventListener("change", commit);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
  });
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
const fontFamilyEl = $<HTMLInputElement>("fontFamily");

function ensureGoogleFont(family: string) {
  const f = family.trim();
  if (!f || f === "CustomLabelFont") return;
  const id = "gf-" + f.replace(/\s+/g, "-").toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@800&display=swap`;
  document.head.appendChild(link);
}
async function waitForFont(family: string) {
  try {
    await document.fonts.load(`800 100px "${family}"`);
  } catch {
    /* fall back silently */
  }
  schedule();
}
let fontTimer = 0;
fontFamilyEl.addEventListener("input", () => {
  params.fontFamily = fontFamilyEl.value.trim() || "Manrope";
  schedule();
  window.clearTimeout(fontTimer);
  fontTimer = window.setTimeout(() => {
    ensureGoogleFont(params.fontFamily);
    waitForFont(params.fontFamily);
    window.setTimeout(() => waitForFont(params.fontFamily), 1500);
  }, 400);
});
$<HTMLButtonElement>("fontLoadBtn").addEventListener("click", () => fontInput.click());
fontInput.addEventListener("change", async () => {
  const file = fontInput.files?.[0];
  fontInput.value = "";
  if (!file) return;
  try {
    const face = new FontFace("CustomLabelFont", await file.arrayBuffer(), { weight: "800" });
    await face.load();
    document.fonts.add(face);
    params.fontFamily = "CustomLabelFont";
    fontFamilyEl.value = file.name.replace(/\.[^.]+$/, "");
    schedule();
  } catch (err) {
    console.error("[font]", err);
    alert("Could not load that font file.");
  }
});

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

function loadImageFile(file: File) {
  if (!file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    image = { source: img, width: img.naturalWidth, height: img.naturalHeight };
    canvas.classList.add("has-image");
    schedule();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("Could not load that image.");
  };
  img.src = url;
}
$<HTMLButtonElement>("imageLoadBtn").addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", () => fileInput.click());
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

// Scroll on the preview to zoom the canvas within the stage (CSS, not transform).
let previewScale = 1;
stageEl.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const next = Math.max(0.1, Math.min(1, previewScale - e.deltaY * 0.002));
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
function applySettings(str: string): boolean {
  let obj: Partial<Record<keyof Params, unknown>>;
  try {
    obj = JSON.parse(str.trim());
  } catch {
    return false;
  }
  if (!obj || typeof obj !== "object") return false;
  const numKeys: (NumKey | "rowsTop" | "rowsBottom" | "blockSeed" | "shapeSeed")[] = [
    ...sliderDefs.map((d) => d.key),
    "rowsTop",
    "rowsBottom",
    "blockSeed",
    "shapeSeed",
  ];
  const all = params as unknown as Record<string, unknown>;
  for (const k of numKeys) {
    const v = obj[k];
    if (typeof v === "number" && isFinite(v)) all[k] = v;
  }
  if (obj.format && (obj.format as string) in FORMATS) params.format = obj.format as Format;
  if (obj.focus === "top" || obj.focus === "bottom") params.focus = obj.focus;
  if (obj.staggerOrder === "center" || obj.staggerOrder === "top" || obj.staggerOrder === "bottom")
    params.staggerOrder = obj.staggerOrder;
  if (Array.isArray(obj.easing) && obj.easing.length === 4 && obj.easing.every((x) => typeof x === "number"))
    params.easing = [...(obj.easing as number[])] as Bezier;
  for (const k of ["artist", "stage", "date", "fontFamily"] as const) {
    if (typeof obj[k] === "string") params[k] = obj[k] as string;
  }
  if (obj.colors && typeof obj.colors === "object") {
    const c = obj.colors as Record<string, unknown>;
    for (const k of Object.keys(colorLabels) as (keyof Colors)[]) {
      const n = typeof c[k] === "string" ? normalizeHex(c[k] as string) : null;
      if (n) params.colors[k] = n;
    }
  }
  params.rowsTop = Math.max(1, Math.min(24, Math.round(params.rowsTop)));
  params.rowsBottom = Math.max(1, Math.min(24, Math.round(params.rowsBottom)));
  syncUI();
  applyFormat();
  ensureGoogleFont(params.fontFamily);
  waitForFont(params.fontFamily);
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
  for (const def of sliderDefs) {
    const inp = sliderInputs[def.key];
    const val = sliderVals[def.key];
    if (inp) inp.value = String(numParams[def.key]);
    if (val) val.textContent = def.format(numParams[def.key]);
  }
  syncEasingUI();
  artistEl.value = params.artist;
  stageTextEl.value = params.stage;
  dateEl.value = params.date;
  fontFamilyEl.value = params.fontFamily;
  for (const k of Object.keys(colorLabels) as (keyof Colors)[]) {
    const ci = colorInputs[k];
    if (ci) {
      ci.swatch.style.background = params.colors[k];
      ci.hex.value = params.colors[k];
    }
  }
}

// ---------- export ----------

const exportPngBtn = $<HTMLButtonElement>("exportPngBtn");
const exportMp4Btn = $<HTMLButtonElement>("exportMp4Btn");
exportPngBtn.addEventListener("click", async () => {
  exportPngBtn.disabled = true;
  try {
    await exportPng(params, scene, time, exportScale, image);
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
  if (playing) setPlaying(false);
  exportMp4Btn.disabled = true;
  exportPngBtn.disabled = true;
  try {
    await exportMp4(params, scene, exportScale, exportFps, image, (f) => {
      exportMp4Btn.textContent = `Encoding ${Math.round(f * 100)}%`;
    });
  } catch (err) {
    console.error("[export]", err);
    alert("Export failed. Try 1x or check the console.");
  } finally {
    exportMp4Btn.textContent = "MP4";
    exportMp4Btn.disabled = false;
    exportPngBtn.disabled = false;
    if (wasPlaying) setPlaying(true);
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
    if (playing) setPlaying(false);
    time = Math.max(0, Math.min(scene.tl.total, t));
    syncTime();
    draw();
  },
  apply: applySettings,
  loadImageUrl: (url: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        image = { source: img, width: img.naturalWidth, height: img.naturalHeight };
        canvas.classList.add("has-image");
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
