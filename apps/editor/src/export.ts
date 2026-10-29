import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { dimensions, projectDuration, type Project, type Resolution } from "@clipai/schema";
import { loadFonts, renderFrame, type LoadedAssets } from "@clipai/engine";
import { registry } from "./blocks";
import { assetUrl } from "./api";

export type ExportOptions = { resolution: Resolution; fps: 30 | 60; quality: "standard" | "high" };
export type ExportProgress = { frame: number; total: number; etaSeconds: number; stage: "audio" | "video" | "finishing" };

export const EXPORT_UNSUPPORTED = "Export needs Chrome or Edge.";

export function exportSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

const SAMPLE_RATE = 48000;

function bitrate(width: number, height: number, fps: number, quality: ExportOptions["quality"]): number {
  const base = width * height >= 1920 * 1080 * 0.9 ? 10_000_000 : 5_000_000;
  return Math.round(base * (fps === 60 ? 1.5 : 1) * (quality === "high" ? 1.3 : 0.8));
}

async function pickVideoConfig(width: number, height: number, fps: number, quality: ExportOptions["quality"]): Promise<VideoEncoderConfig> {
  // High profile, level 4.0 (1080p30) / 4.2 (1080p60), then fallbacks.
  const codecs = fps === 60 ? ["avc1.64002a", "avc1.4d002a", "avc1.42002a"] : ["avc1.640028", "avc1.4d0028", "avc1.42001f"];
  for (const codec of codecs) {
    const config: VideoEncoderConfig = { codec, width, height, bitrate: bitrate(width, height, fps, quality), framerate: fps, avc: { format: "avc" } };
    const res = await VideoEncoder.isConfigSupported(config).catch(() => null);
    if (res?.supported) return config;
  }
  throw new Error(`${EXPORT_UNSUPPORTED} (H.264 encoder not available)`);
}

/** Mix the music track with volume + fade-out, trimmed to the video length. */
async function renderAudio(name: string, project: Project, duration: number): Promise<AudioBuffer | null> {
  const music = project.audio?.music;
  if (!music) return null;
  const asset = project.assets.find((a) => a.id === music || a.file === music);
  if (!asset) return null;
  const data = await (await fetch(assetUrl(name, asset.file))).arrayBuffer();
  const length = Math.ceil(duration * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const buffer = await ctx.decodeAudioData(data);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  const vol = project.audio?.volume ?? 1;
  const fade = Math.min(project.audio?.fadeOut ?? 0, duration);
  gain.gain.setValueAtTime(vol, 0);
  if (fade > 0) {
    gain.gain.setValueAtTime(vol, Math.max(0, duration - fade));
    gain.gain.linearRampToValueAtTime(0, duration);
  }
  src.connect(gain).connect(ctx.destination);
  src.start(0);
  return ctx.startRendering();
}

async function pickAudioCodec(): Promise<{ config: AudioEncoderConfig; mux: "aac" | "opus" } | null> {
  if (typeof AudioEncoder === "undefined") return null;
  const options: { config: AudioEncoderConfig; mux: "aac" | "opus" }[] = [
    { config: { codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192_000 }, mux: "aac" },
    { config: { codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 160_000 }, mux: "opus" },
  ];
  for (const o of options) {
    const res = await AudioEncoder.isConfigSupported(o.config).catch(() => null);
    if (res?.supported) return o;
  }
  return null;
}

/**
 * Render the project frame by frame with the same renderer as the preview,
 * encode with WebCodecs (H.264 + AAC) and mux to MP4.
 */
export async function exportVideo(
  name: string,
  project: Project,
  assets: LoadedAssets,
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  if (!exportSupported()) throw new Error(EXPORT_UNSUPPORTED);
  await loadFonts();
  const { width, height } = dimensions(project.meta.format, opts.resolution);
  const fps = opts.fps;
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error("Nothing to export: add a scene first.");
  const total = Math.max(1, Math.round(duration * fps));

  const videoConfig = await pickVideoConfig(width, height, fps, opts.quality);
  onProgress({ frame: 0, total, etaSeconds: 0, stage: "audio" });
  const audioBuffer = await renderAudio(name, project, duration);
  const audioCodec = audioBuffer ? await pickAudioCodec() : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    audio: audioBuffer && audioCodec ? { codec: audioCodec.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e as Error),
  });
  encoder.configure(videoConfig);

  if (audioBuffer && audioCodec) {
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e as Error) });
    aenc.configure(audioCodec.config);
    const frameSize = 1024;
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    for (let i = 0; i < audioBuffer.length; i += frameSize) {
      const n = Math.min(frameSize, audioBuffer.length - i);
      const planar = new Float32Array(n * 2);
      planar.set(left.subarray(i, i + n), 0);
      planar.set(right.subarray(i, i + n), n);
      const data = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data: planar });
      aenc.encode(data);
      data.close();
    }
    await aenc.flush();
    aenc.close();
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;
  const started = performance.now();
  const frameUs = 1e6 / fps;
  for (let i = 0; i < total; i++) {
    if (signal.aborted) {
      encoder.close();
      throw new DOMException("Export cancelled", "AbortError");
    }
    if (failure) throw failure;
    renderFrame(ctx, project, i / fps, assets, registry);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
    if (i % 5 === 0 || i === total - 1) {
      const elapsed = (performance.now() - started) / 1000;
      onProgress({ frame: i + 1, total, etaSeconds: ((total - i - 1) * elapsed) / (i + 1), stage: "video" });
      await new Promise((r) => setTimeout(r, 0)); // let the UI breathe
    }
  }
  onProgress({ frame: total, total, etaSeconds: 0, stage: "finishing" });
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
