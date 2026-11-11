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

function fileStem(p: Params, scale: number) {
  return `artist-card-${p.format.replace(":", "x")}@${scale}x`;
}

export async function exportPng(
  p: Params,
  scene: Scene,
  t: number,
  scale: number,
  image: ImageSource | null,
) {
  const c = document.createElement("canvas");
  c.width = scene.W * scale;
  c.height = scene.H * scale;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  render(ctx, p, scene, t, scale, image);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (blob) downloadBlob(blob, `${fileStem(p, scale)}.png`);
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

/** Encode exactly one loop (scene.tl.total seconds) to H.264 MP4. */
export async function exportMp4(
  p: Params,
  scene: Scene,
  scale: number,
  fps: number,
  image: ImageSource | null,
  onProgress: (fraction: number) => void,
) {
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
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  encoder.configure({
    codec: pickH264Codec(outW, outH),
    width: outW,
    height: outH,
    framerate: fps,
    bitrate: Math.min(100_000_000, Math.round(outW * outH * fps * 0.25)),
    bitrateMode: "variable",
    avc: { format: "avc" },
  });

  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError;
    render(ctx, p, scene, i / fps, scale, image);
    const frame = new VideoFrame(c, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 16) await sleep(8);
    if (i % 5 === 0) {
      onProgress(i / totalFrames);
      await sleep(0);
    }
  }
  await encoder.flush();
  muxer.finalize();
  const buffer = muxer.target.buffer;
  downloadBlob(new Blob([buffer], { type: "video/mp4" }), `${fileStem(p, scale)}.mp4`);
}
