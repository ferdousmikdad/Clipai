import { create } from "zustand";
import type { Project } from "@clipai/schema";
import { api } from "./api";
import { getAssets } from "./assets";
import { exportVideo, type ExportOptions, type ExportProgress } from "./export";

type ExportState = {
  open: boolean;
  running: boolean;
  progress: ExportProgress | null;
  result: { path: string; url: string } | null;
  error: string | null;
  controller: AbortController | null;
  show(open: boolean): void;
  start(name: string, project: Project, opts: ExportOptions, exportId?: string): Promise<{ path: string }>;
  cancel(): void;
};

export const useExport = create<ExportState>((set, get) => ({
  open: false,
  running: false,
  progress: null,
  result: null,
  error: null,
  controller: null,
  show: (open) => set({ open, ...(open && !get().running ? { error: null, result: null, progress: null } : {}) }),
  async start(name, project, opts, exportId) {
    if (get().running) throw new Error("An export is already running.");
    const controller = new AbortController();
    const prev = get().result;
    if (prev) URL.revokeObjectURL(prev.url);
    set({ open: true, running: true, progress: null, result: null, error: null, controller });
    try {
      const assets = await getAssets(name, project);
      const blob = await exportVideo(name, project, assets, opts, (progress) => set({ progress }), controller.signal);
      const saved = await api.saveExport(name, blob, exportId);
      set({ result: { path: saved.path, url: URL.createObjectURL(blob) } });
      return saved;
    } catch (e) {
      const err = e as Error;
      set({ error: err.name === "AbortError" ? "Export cancelled." : err.message });
      throw err;
    } finally {
      set({ running: false, controller: null });
    }
  },
  cancel: () => get().controller?.abort(),
}));
