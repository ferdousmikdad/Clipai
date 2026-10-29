import { useEffect, useState } from "react";
import { projectDuration } from "@clipai/schema";
import { useStore } from "../store";
import { useAssets } from "../assets";
import { api } from "../api";
import { TopBar } from "./TopBar";
import { BlocksPanel } from "./BlocksPanel";
import { Player } from "./Player";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { ExportDialog } from "./ExportDialog";
import { IconDatalist } from "./SchemaForm";

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

export function Editor({ fontsReady, pluginsVersion }: { fontsReady: boolean; pluginsVersion: number }) {
  const { name, project } = useStore();
  const assets = useAssets(name, project);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (!s.project) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        if (typing(e.target)) return;
        e.preventDefault();
        void (e.shiftKey ? s.redo() : s.undo());
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void s.redo();
        return;
      }
      if (typing(e.target)) return;
      const step = 1 / s.project.meta.fps;
      if (e.code === "Space") {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.setPlaying(false);
        s.seek(Math.max(0, s.time - (e.shiftKey ? 1 : step)));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        s.setPlaying(false);
        s.seek(Math.min(projectDuration(s.project), s.time + (e.shiftKey ? 1 : step)));
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.selection) {
        e.preventDefault();
        void s.apply([{ op: s.selection.kind === "scene" ? "remove_scene" : "remove_overlay", id: s.selection.id }]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!project) return null;

  return (
    <div
      className="grid h-full"
      style={{ gridTemplateRows: "48px minmax(0,1fr) 220px", gridTemplateColumns: "240px minmax(0,1fr) 320px" }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={async (e) => {
        if (!e.dataTransfer.files.length || !name) return;
        e.preventDefault();
        setDragging(false);
        for (const f of Array.from(e.dataTransfer.files)) {
          try {
            const res = await api.uploadAsset(name, f);
            useStore.getState().toast(`Added asset “${res.id}”`);
          } catch (err) {
            useStore.getState().toast((err as Error).message, "error");
          }
        }
      }}
    >
      <div className="col-span-3">
        <TopBar />
      </div>
      <aside className="min-h-0 border-r border-line bg-panel">
        <BlocksPanel pluginsVersion={pluginsVersion} />
      </aside>
      <main className="flex min-h-0 flex-col">
        <Player assets={assets} fontsReady={fontsReady} />
      </main>
      <aside className="min-h-0 border-l border-line bg-panel">
        <Inspector />
      </aside>
      <section className="col-span-3 min-h-0 border-t border-line bg-panel">
        <Timeline />
      </section>
      <ExportDialog />
      <IconDatalist />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-accent bg-accent/10 text-lg font-semibold">
          Drop images or audio to add them as assets
        </div>
      )}
    </div>
  );
}
