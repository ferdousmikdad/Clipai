import { create } from "zustand";
import { applyOps, projectDuration, type Op, type Project } from "@clipai/schema";
import { api, ApiError, type History } from "./api";
import { lookup } from "./blocks";

export type Selection = { kind: "scene" | "overlay"; id: string } | null;
export type Toast = { id: number; text: string; tone: "info" | "error" };

type State = {
  name: string | null;
  project: Project | null;
  history: History;
  selection: Selection;
  time: number;
  playing: boolean;
  highlight: string[];
  toasts: Toast[];
  dark: boolean;
  pending: number;
  pluginWarning: string[];

  open(name: string): Promise<void>;
  close(): void;
  /** Apply ops optimistically, then persist. Returns errors (empty on success). */
  apply(ops: Op[]): Promise<string[]>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  receive(name: string, project: Project, history: History | undefined, source: string, changed: string[]): void;
  select(sel: Selection): void;
  seek(t: number): void;
  setPlaying(p: boolean): void;
  toast(text: string, tone?: Toast["tone"]): void;
  toggleDark(): void;
};

let toastId = 0;

const savedDark = (() => {
  try {
    return localStorage.getItem("clipai:theme") !== "light";
  } catch {
    return true;
  }
})();

export const useStore = create<State>((set, get) => ({
  name: null,
  project: null,
  history: { undo: false, redo: false },
  selection: null,
  time: 0,
  playing: false,
  highlight: [],
  toasts: [],
  dark: savedDark,
  pending: 0,
  pluginWarning: [],

  async open(name) {
    const { project, history } = await api.getProject(name);
    set({ name, project, history, selection: project.scenes[0] ? { kind: "scene", id: project.scenes[0].id } : null, time: 0, playing: false });
    if (location.hash !== `#/p/${name}`) location.hash = `#/p/${name}`;
  },

  close() {
    set({ name: null, project: null, selection: null, playing: false, time: 0 });
    location.hash = "";
  },

  async apply(ops) {
    const { project, name } = get();
    if (!project || !name) return ["no project open"];
    const res = applyOps(project, ops, lookup);
    if (res.errors.length) {
      get().toast(res.errors[0], "error");
      return res.errors;
    }
    set((s) => ({ project: res.project, pending: s.pending + 1, history: { ...s.history, undo: true, redo: false } }));
    try {
      await api.ops(name, ops);
      return [];
    } catch (e) {
      const errs = e instanceof ApiError && e.errors.length ? e.errors : [(e as Error).message];
      get().toast(errs[0], "error");
      const fresh = await api.getProject(name).catch(() => null);
      if (fresh) set({ project: fresh.project, history: fresh.history });
      return errs;
    } finally {
      set((s) => ({ pending: s.pending - 1 }));
    }
  },

  async undo() {
    const { name } = get();
    if (name) await api.undo(name).catch((e) => get().toast((e as Error).message, "error"));
  },
  async redo() {
    const { name } = get();
    if (name) await api.redo(name).catch((e) => get().toast((e as Error).message, "error"));
  },

  receive(name, project, history, source, changed) {
    const s = get();
    if (s.name !== name) return;
    // Our own optimistic edits are already applied; skip echoes while requests are in flight.
    if (source === "ui" && s.pending > 0) {
      if (history) set({ history });
      return;
    }
    const duration = projectDuration(project);
    const sel = s.selection;
    const stillThere =
      sel && (sel.kind === "scene" ? project.scenes.some((x) => x.id === sel.id) : project.overlays.some((x) => x.id === sel.id));
    set({
      project,
      history: history ?? s.history,
      time: Math.min(s.time, duration),
      selection: stillThere ? sel : project.scenes[0] ? { kind: "scene", id: project.scenes[0].id } : null,
    });
    if (source === "mcp" || source === "api" || source === "ai") {
      const ids = changed.filter((c) => /^[so]\d+$/.test(c));
      set({ highlight: ids });
      setTimeout(() => get().highlight === ids && set({ highlight: [] }), 1500);
      if (ids.length === 1 && project.scenes.some((x) => x.id === ids[0])) set({ selection: { kind: "scene", id: ids[0] } });
    }
  },

  select: (selection) => set({ selection }),
  seek: (t) => set({ time: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  toast(text, tone = "info") {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "error" ? 6000 : 3000);
  },
  toggleDark() {
    const dark = !get().dark;
    try {
      localStorage.setItem("clipai:theme", dark ? "dark" : "light");
    } catch {
      // ignore
    }
    set({ dark });
  },
}));

/** Start time of each scene, for seeking to a selection. */
export function sceneStart(project: Project, id: string): number {
  let t = 0;
  for (const s of project.scenes) {
    if (s.id === id) return t;
    t += s.duration;
  }
  return 0;
}
