import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { render, type ImageSource, type Params, type Scene } from "./engine";

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function fileStem(p: Params, scale: number): string {
  const parts = [slug(p.artist), slug(p.day)].filter(Boolean);
  const name = parts.length ? parts.join("-") : "artist-card";
  return `${name}-${p.format.replace(":", "x")}@${scale}x`;
}

async function fontsReady(p: Params) {
  try {
    await document.fonts.load(`700 100px "${p.fontFamily}"`);
    await document.fonts.ready;
  } catch {
    /* render with whatever is available */
  }
}

export async function exportPng(
  p: Params,
  scene: Scene,
  t: number,
  scale: number,
  image: ImageSource | null,
) {
  await fontsReady(p);
  const c = document.createElement("canvas");
  c.width = scene.W * scale;
  c.height = scene.H * scale;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  render(ctx, p, scene, t, scale, image);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (blob) downloadBlob(blob, `${fileStem(p, scale)}-${t.toFixed(2)}s.png`);
}

function pickH264Codec(w: number, h: number): string {
  const px = w * h;
  if (px <= 1280 * 720) return "avc1.64001F";
  if (px <= 1920 * 1088) return "avc1.640028";
  if (px <= 2560 * 1440) return "avc1.640032";
  if (px <= 3840 * 2160) return "avc1.640033";
  if (px <= 4096 * 2160) return "avc1.640034";
  return "avc1.640040";
}

export function supportsVideoExport(): boolean {
  return "VideoEncoder" in window && "VideoFrame" in window;
}

/** First encoder config the browser accepts, from the most specific down. */
async function pickConfig(outW: number, outH: number, fps: number): Promise<VideoEncoderConfig> {
  const codec = pickH264Codec(outW, outH);
  const bitrate = Math.min(100_000_000, Math.round(outW * outH * fps * 0.25));
  const candidates: VideoEncoderConfig[] = [
    { codec, width: outW, height: outH, framerate: fps, bitrate, bitrateMode: "variable", avc: { format: "avc" } },
    { codec, width: outW, height: outH, framerate: fps, bitrate, avc: { format: "avc" } },
    { codec, width: outW, height: outH, framerate: fps, bitrate },
    { codec: "avc1.42001f", width: outW, height: outH, framerate: fps, bitrate },
  ];
  for (const c of candidates) {
    try {
      const r = await VideoEncoder.isConfigSupported(c);
      if (r.supported) return r.config ?? c;
    } catch {
      /* try the next one */
    }
  }
  return candidates[0];
}

/**
 * Encode exactly one loop (scene.tl.total seconds) to H.264 MP4.
 * Backpressure is handled by flushing every few frames rather than polling
 * encodeQueueSize, which WebKit does not keep up to date (it used to hang
 * the export in Safari); a watchdog aborts if the encoder stops producing.
 */
export async function exportMp4(
  p: Params,
  scene: Scene,
  scale: number,
  fps: number,
  image: ImageSource | null,
  onProgress: (fraction: number) => void,
) {
  await fontsReady(p);
  const outW = Math.max(16, Math.floor((scene.W * scale) / 2) * 2);
  const outH = Math.max(16, Math.floor((scene.H * scale) / 2) * 2);
  const c = document.createElement("canvas");
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("No 2D context");

  const totalFrames = Math.max(1, Math.round(scene.tl.total * fps));
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: outW, height: outH, frameRate: fps },
    fastStart: "in-memory",
  });
  let encoderError: unknown = null;
  let chunks = 0;
  let lastChunkAt = performance.now();
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
        chunks++;
        lastChunkAt = performance.now();
      } catch (e) {
        encoderError = e;
      }
    },
    error: (e) => {
      encoderError = e;
    },
  });
  const STALL_MS = 20_000;
  const flushWithWatchdog = async () => {
    const started = performance.now();
    let done = false;
    const flushed = encoder.flush().then(() => (done = true));
    while (!done) {
      await Promise.race([flushed, sleep(250)]);
      if (done) break;
      if (encoderError) throw encoderError;
      if (performance.now() - Math.max(lastChunkAt, started) > STALL_MS) {
        throw new Error(`Encoder stalled after ${chunks} frames`);
      }
    }
  };
  try {
    encoder.configure(await pickConfig(outW, outH, fps));
    for (let i = 0; i < totalFrames; i++) {
      if (encoderError) throw encoderError;
      render(ctx, p, scene, i / fps, scale, image);
      const frame = new VideoFrame(c, {
        timestamp: Math.round((i * 1_000_000) / fps),
        duration: Math.round(1_000_000 / fps),
      });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      // bounded queue: let the encoder catch up every few frames
      if (i % 8 === 7) await flushWithWatchdog();
      onProgress(i / totalFrames);
      await sleep(0);
    }
    await flushWithWatchdog();
    if (encoderError) throw encoderError;
    if (chunks === 0) throw new Error("The encoder produced no frames");
    muxer.finalize();
    const buffer = muxer.target.buffer;
    downloadBlob(new Blob([buffer], { type: "video/mp4" }), `${fileStem(p, scale)}.mp4`);
  } finally {
    try {
      if (encoder.state !== "closed") encoder.close();
    } catch {
      /* already closed */
    }
  }
}
