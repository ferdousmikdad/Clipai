import { useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { registry } from "../blocks";
import { useStore } from "../store";

const CATEGORIES = ["text", "ui", "data", "brand", "background", "overlay"] as const;
export const BLOCK_MIME = "application/x-clipai-block";

export function BlocksPanel({ pluginsVersion }: { pluginsVersion: number }) {
  const { project, selection, apply, time, pluginWarning } = useStore();
  const [q, setQ] = useState("");
  // The registry is mutable (plugins load async); pluginsVersion bumps when it changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blocks = useMemo(() => registry.list(), [pluginsVersion]);
  const filtered = blocks.filter((b) => !q || `${b.id} ${b.name} ${b.summary}`.toLowerCase().includes(q.toLowerCase()));

  const add = (id: string) => {
    const def = registry.get(id)!;
    if (def.category === "overlay") {
      const start = Math.round(time * 10) / 10;
      void apply([{ op: "add_overlay", overlay: { block: id, start, end: start + def.defaultDuration, props: structuredClone(def.defaults) } }]);
      return;
    }
    const idx = selection?.kind === "scene" && project ? project.scenes.findIndex((s) => s.id === selection.id) + 1 : undefined;
    void apply([{ op: "add_scene", scene: { block: id, duration: def.defaultDuration, props: structuredClone(def.defaults) }, index: idx }]).then((errs) => {
      if (errs.length) return;
      const p = useStore.getState().project!;
      const added = p.scenes[idx ?? p.scenes.length - 1];
      if (added) useStore.getState().select({ kind: "scene", id: added.id });
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-2">
        <input placeholder="Search blocks…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {pluginWarning.length > 0 && (
        <div className="m-2 flex gap-2 rounded-md border border-amber-500/50 p-2 text-xs text-amber-500">
          <AlertTriangle size={14} className="flex-none" />
          <span>Plugins run code on your machine: {pluginWarning.join(", ")}</span>
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        {CATEGORIES.map((cat) => {
          const list = filtered.filter((b) => b.category === cat);
          if (!list.length) return null;
          return (
            <div key={cat} className="mb-3">
              <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</div>
              {list.map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(BLOCK_MIME, b.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="group mb-1 flex cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-line hover:bg-panel-2"
                  title={`${b.summary}\nDrag to the timeline or click +`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {b.name}
                      {b.plugin && <span className="ml-1 text-[10px] text-amber-500">plugin</span>}
                    </div>
                    <div className="truncate text-xs text-muted">{b.summary}</div>
                  </div>
                  <button className="btn btn-icon opacity-0 group-hover:opacity-100" onClick={() => add(b.id)} title="Add">
                    <Plus size={12} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
