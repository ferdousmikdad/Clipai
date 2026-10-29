import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Music, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { projectDuration, type Overlay, type Scene } from "@clipai/schema";
import { useStore, sceneStart } from "../store";
import { registry } from "../blocks";
import { BLOCK_MIME } from "./BlocksPanel";

const SCENE_MIME = "application/x-clipai-scene";
const round = (n: number) => Math.round(n * 10) / 10;

function label(props: Record<string, unknown>): string {
  for (const k of ["title", "text", "quote"]) if (typeof props[k] === "string" && props[k]) return props[k] as string;
  if (Array.isArray(props.lines) && typeof props.lines[0] === "string") return props.lines[0];
  return "";
}

/** Drag helper: calls onMove(dxSeconds) while dragging and onEnd(dxSeconds) on release. */
function makeDrag(pps: number) {
  return (e: RPointerEvent, onMove: (dt: number) => void, onEnd: (dt: number) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / pps);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEnd((ev.clientX - x0) / pps);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

export function Timeline() {
  const { project, selection, select, apply, time, seek, setPlaying, highlight } = useStore();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState<Record<string, Partial<Scene & Overlay>>>({});
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!project) return null;
  const duration = projectDuration(project);
  const span = Math.max(duration, 10);
  const pps = Math.max(20, ((width - 40) / span) * zoom);
  const drag = makeDrag(pps);
  const total = Math.max(width, span * pps + 200);

  const sceneDur = (s: Scene) => (preview[s.id]?.duration as number | undefined) ?? s.duration;
  const seekTo = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = clientX - rect.left + wrapRef.current!.scrollLeft - 16;
    setPlaying(false);
    seek(Math.max(0, Math.min(duration, x / pps)));
  };

  const onDropScene = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDropIndex(null);
    const block = e.dataTransfer.getData(BLOCK_MIME);
    const sceneId = e.dataTransfer.getData(SCENE_MIME);
    if (block) {
      const def = registry.get(block);
      if (!def) return;
      if (def.category === "overlay") return;
      void apply([{ op: "add_scene", scene: { block, duration: def.defaultDuration, props: structuredClone(def.defaults) }, index }]);
    } else if (sceneId) {
      const from = project.scenes.findIndex((s) => s.id === sceneId);
      const to = from < index ? index - 1 : index;
      if (from !== to) void apply([{ op: "move_scene", id: sceneId, index: to }]);
    }
  };

  const onDropOverlay = (e: React.DragEvent) => {
    e.preventDefault();
    const block = e.dataTransfer.getData(BLOCK_MIME);
    const def = block ? registry.get(block) : undefined;
    if (!def || def.category !== "overlay") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const start = round(Math.max(0, (e.clientX - rect.left) / pps));
    void apply([{ op: "add_overlay", overlay: { block, start, end: start + def.defaultDuration, props: structuredClone(def.defaults) } }]);
  };

  const removeSelected = () => {
    if (!selection) return;
    void apply([{ op: selection.kind === "scene" ? "remove_scene" : "remove_overlay", id: selection.id }]);
  };

  let x = 0;
  const music = project.audio?.music;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Timeline</span>
        <div className="flex-1" />
        <button className="btn btn-icon" onClick={removeSelected} disabled={!selection} title="Delete selected (Del)">
          <Trash2 size={12} />
        </button>
        <button className="btn btn-icon" onClick={() => setZoom((z) => Math.max(0.25, z / 1.4))} title="Zoom out">
          <ZoomOut size={12} />
        </button>
        <button className="btn btn-icon" onClick={() => setZoom((z) => Math.min(8, z * 1.4))} title="Zoom in">
          <ZoomIn size={12} />
        </button>
      </div>
      <div ref={wrapRef} className="relative flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative px-4" style={{ width: total }}>
          {/* ruler */}
          <div className="relative h-6 cursor-pointer border-b border-line" onPointerDown={(e) => seekTo(e.clientX)}>
            {Array.from({ length: Math.ceil(span) + 1 }, (_, i) => i).map((s) => (
              <div key={s} className="absolute top-0 h-full border-l border-line pl-1 text-[10px] text-muted" style={{ left: s * pps }}>
                {pps > 30 || s % 5 === 0 ? `${s}s` : ""}
              </div>
            ))}
          </div>

          {/* scenes */}
          <div
            className="relative mt-2 flex h-16"
            onDragOver={(e) => {
              e.preventDefault();
              if (project.scenes.length === 0) setDropIndex(0);
            }}
            onDragLeave={() => setDropIndex(null)}
            onDrop={(e) => onDropScene(e, dropIndex ?? project.scenes.length)}
          >
            {project.scenes.length === 0 && (
              <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-line text-muted">
                Drag a block here, or click + in the Blocks panel
              </div>
            )}
            {project.scenes.map((s, i) => {
              const d = sceneDur(s);
              const left = x;
              x += d * pps;
              const def = registry.get(s.block);
              const selected = selection?.kind === "scene" && selection.id === s.id;
              return (
                <div
                  key={s.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(SCENE_MIME, s.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDropIndex(e.clientX < rect.left + rect.width / 2 ? i : i + 1);
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onDropScene(e, e.clientX < rect.left + rect.width / 2 ? i : i + 1);
                  }}
                  onClick={() => {
                    select({ kind: "scene", id: s.id });
                    setPlaying(false);
                    seek(sceneStart(project, s.id) + 0.001);
                  }}
                  className={`absolute top-0 h-full cursor-pointer overflow-hidden rounded-md border px-2 py-1 ${
                    selected ? "border-accent bg-accent/25" : def ? "border-line bg-panel-2 hover:border-accent/60" : "border-danger bg-danger/10"
                  } ${highlight.includes(s.id) ? "flash" : ""}`}
                  style={{ left, width: Math.max(8, d * pps - 3) }}
                  title={`${s.id} · ${s.block} · ${d}s`}
                >
                  {dropIndex === i && <div className="absolute -left-1 top-0 h-full w-0.5 bg-accent" />}
                  {dropIndex === i + 1 && i === project.scenes.length - 1 && <div className="absolute right-0 top-0 h-full w-0.5 bg-accent" />}
                  <div className="truncate text-xs font-semibold">
                    <span className="text-muted">{s.id}</span> {def?.name ?? `${s.block} (missing)`}
                  </div>
                  <div className="truncate text-xs text-muted">{label(s.props)}</div>
                  <div className="text-[10px] text-muted">
                    {d}s{s.transition && s.transition.type !== "none" ? ` · ${s.transition.type}` : ""}
                  </div>
                  <div
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-accent/60"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) =>
                      drag(
                        e,
                        (dt) => setPreview({ [s.id]: { duration: Math.max(0.2, round(s.duration + dt)) } }),
                        (dt) => {
                          setPreview({});
                          const next = Math.max(0.2, round(s.duration + dt));
                          if (next !== s.duration) void apply([{ op: "update_scene", id: s.id, patch: { duration: next } }]);
                        },
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* overlays */}
          <div className="relative mt-2 h-8 rounded-md bg-panel-2/50" onDragOver={(e) => e.preventDefault()} onDrop={onDropOverlay} title="Overlay track: drop lower-third, captions or watermark here">
            {project.overlays.length === 0 && <span className="absolute left-2 top-1.5 text-xs text-muted">Overlays</span>}
            {project.overlays.map((o) => {
              const p = preview[o.id] ?? {};
              const start = (p.start as number | undefined) ?? o.start;
              const end = (p.end as number | undefined) ?? o.end;
              const selected = selection?.kind === "overlay" && selection.id === o.id;
              return (
                <div
                  key={o.id}
                  className={`absolute top-0.5 h-7 cursor-grab overflow-hidden rounded border px-2 text-xs leading-7 ${
                    selected ? "border-accent bg-accent/30" : "border-cyan-500/50 bg-cyan-500/15"
                  } ${highlight.includes(o.id) ? "flash" : ""}`}
                  style={{ left: start * pps, width: Math.max(8, (end - start) * pps) }}
                  onPointerDown={(e) => {
                    select({ kind: "overlay", id: o.id });
                    drag(
                      e,
                      (dt) => {
                        const s0 = Math.max(0, round(o.start + dt));
                        setPreview({ [o.id]: { start: s0, end: s0 + (o.end - o.start) } });
                      },
                      (dt) => {
                        setPreview({});
                        const s0 = Math.max(0, round(o.start + dt));
                        if (s0 !== o.start) void apply([{ op: "update_overlay", id: o.id, patch: { start: s0, end: round(s0 + (o.end - o.start)) } }]);
                      },
                    );
                  }}
                  title={`${o.id} · ${o.block} · ${o.start}-${o.end}s`}
                >
                  <span className="text-muted">{o.id}</span> {registry.get(o.block)?.name ?? o.block}
                  <div
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-accent/60"
                    onPointerDown={(e) =>
                      drag(
                        e,
                        (dt) => setPreview({ [o.id]: { end: Math.max(o.start + 0.2, round(o.end + dt)) } }),
                        (dt) => {
                          setPreview({});
                          const next = Math.max(o.start + 0.2, round(o.end + dt));
                          if (next !== o.end) void apply([{ op: "update_overlay", id: o.id, patch: { end: next } }]);
                        },
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* music */}
          <div className="relative mt-2 h-6">
            {music ? (
              <div className="absolute top-0 flex h-6 items-center gap-1 overflow-hidden rounded border border-emerald-500/40 bg-emerald-500/15 px-2 text-xs" style={{ left: 0, width: Math.max(40, duration * pps) }}>
                <Music size={12} /> {music} · vol {project.audio?.volume}
              </div>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Music size={12} /> No music (add an audio asset in the Project tab)
              </span>
            )}
          </div>

          {/* playhead */}
          <div className="pointer-events-none absolute top-0 h-full w-px bg-red-500" style={{ left: 16 + time * pps }}>
            <div className="-ml-1.5 h-2 w-3 rounded-b bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
