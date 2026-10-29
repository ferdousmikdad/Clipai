import { useState } from "react";
import { Download, X } from "lucide-react";
import type { Resolution } from "@clipai/schema";
import { Modal } from "./Modal";
import { useStore } from "../store";
import { useExport } from "../exporter";
import { EXPORT_UNSUPPORTED, exportSupported, type ExportOptions } from "../export";

const fmtTime = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

export function ExportDialog() {
  const { name, project } = useStore();
  const { open, running, progress, result, error, show, start, cancel } = useExport();
  const [opts, setOpts] = useState<ExportOptions>(() => ({
    resolution: project?.meta.resolution ?? "1080p",
    fps: project?.meta.fps ?? 30,
    quality: "standard",
  }));
  if (!open || !project || !name) return null;
  const supported = exportSupported();
  const pct = progress ? Math.round((progress.frame / progress.total) * 100) : 0;

  return (
    <Modal title="Export MP4" onClose={running ? undefined : () => show(false)} width={460}>
      {!supported ? (
        <p className="text-danger">{EXPORT_UNSUPPORTED}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="text-muted">Resolution</span>
              <select disabled={running} value={opts.resolution} onChange={(e) => setOpts({ ...opts, resolution: e.target.value as Resolution })}>
                <option>720p</option>
                <option>1080p</option>
              </select>
            </label>
            <label>
              <span className="text-muted">FPS</span>
              <select disabled={running} value={opts.fps} onChange={(e) => setOpts({ ...opts, fps: Number(e.target.value) as 30 | 60 })}>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </label>
            <label>
              <span className="text-muted">Quality</span>
              <select disabled={running} value={opts.quality} onChange={(e) => setOpts({ ...opts, quality: e.target.value as ExportOptions["quality"] })}>
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          {(running || progress) && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-muted">
                <span>
                  {progress?.stage === "audio" ? "Preparing audio…" : progress?.stage === "finishing" ? "Finishing…" : `Frame ${progress?.frame ?? 0} / ${progress?.total ?? "…"}`}
                </span>
                <span>{running && progress?.stage === "video" ? `${pct}% · ETA ${fmtTime(progress.etaSeconds)}` : `${pct}%`}</span>
              </div>
            </div>
          )}
          {error && <p className="text-danger">{error}</p>}
          {result && (
            <div className="rounded-md border border-line p-2">
              <p className="mb-1">Saved to</p>
              <code className="block break-all text-xs text-muted">{result.path}</code>
              <a className="btn mt-2" href={result.url} download={`${name}.mp4`}>
                <Download size={14} /> Download
              </a>
            </div>
          )}
          <div className="flex justify-end gap-2">
            {running ? (
              <button className="btn" onClick={cancel}>
                <X size={14} /> Cancel
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => show(false)}>
                  Close
                </button>
                <button className="btn btn-primary" onClick={() => start(name, project, opts).catch(() => undefined)}>
                  <Download size={14} /> Export
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
