import { useEffect, useRef } from "react";
import { Pause, Play, SkipBack } from "lucide-react";
import { dimensions, projectDuration } from "@clipai/schema";
import { renderFrame, type LoadedAssets } from "@clipai/engine";
import { useStore } from "../store";
import { registry } from "../blocks";
import { assetUrl } from "../api";

export const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};

export function Player({ assets, fontsReady }: { assets: LoadedAssets; fontsReady: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { name, project, time, playing, seek, setPlaying } = useStore();
  const duration = project ? projectDuration(project) : 0;
  const dims = project ? dimensions(project.meta.format, "720p") : { width: 1280, height: 720 };

  // Draw on any change while paused.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && project && !playing) renderFrame(ctx, project, time, assets, registry);
  }, [project, time, assets, playing, fontsReady, dims.width, dims.height]);

  // Playback loop.
  useEffect(() => {
    if (!playing || !project) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const t0 = performance.now();
    const start = time >= duration - 0.01 ? 0 : time;
    let raf = 0;
    const tick = () => {
      const t = start + (performance.now() - t0) / 1000;
      if (t >= duration) {
        renderFrame(ctx, project, duration, assets, registry);
        seek(duration);
        setPlaying(false);
        return;
      }
      renderFrame(ctx, project, t, assets, registry);
      seek(t);
      syncAudioVolume(audioRef.current, project, t, duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const audio = audioRef.current;
    if (audio && audio.src) {
      audio.currentTime = start;
      audio.play().catch(() => undefined);
    }
    return () => {
      cancelAnimationFrame(raf);
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, project, assets]);

  if (!project || !name) return null;
  const music = project.audio?.music ? project.assets.find((a) => a.id === project.audio!.music || a.file === project.audio!.music) : undefined;
  const fps = project.meta.fps;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/30 p-4">
        <canvas
          ref={canvasRef}
          width={dims.width}
          height={dims.height}
          className="max-h-full max-w-full rounded shadow-xl"
          style={{ aspectRatio: `${dims.width} / ${dims.height}` }}
          onClick={() => setPlaying(!playing)}
        />
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-panel px-3 py-2">
        <button className="btn btn-icon" onClick={() => (setPlaying(false), seek(0))} title="Start">
          <SkipBack size={14} />
        </button>
        <button className="btn btn-icon btn-primary" onClick={() => setPlaying(!playing)} title="Play/Pause (Space)" disabled={duration === 0}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={1 / fps}
          value={Math.min(time, duration)}
          onChange={(e) => (setPlaying(false), seek(Number(e.target.value)))}
          className="flex-1"
        />
        <span className="w-32 text-right font-mono text-xs text-muted">
          {fmt(Math.min(time, duration))} / {fmt(duration)}
        </span>
      </div>
      {music && <audio ref={audioRef} src={assetUrl(name, music.file)} preload="auto" />}
    </div>
  );
}

function syncAudioVolume(audio: HTMLAudioElement | null, project: { audio?: { volume: number; fadeOut: number } }, t: number, duration: number) {
  if (!audio || !project.audio) return;
  const { volume, fadeOut } = project.audio;
  const fade = fadeOut > 0 ? Math.min(1, Math.max(0, (duration - t) / fadeOut)) : 1;
  audio.volume = Math.max(0, Math.min(1, volume * fade));
}
