import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { FONTS, TRANSITIONS, type Theme } from "@clipai/schema";
import { useStore } from "../store";
import { registry, schemaOf } from "../blocks";
import { api } from "../api";
import { AssetField, DebouncedInput, SchemaForm } from "./SchemaForm";

type Tab = "item" | "theme" | "project";

export function Inspector() {
  const [tab, setTab] = useState<Tab>("item");
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-line">
        {(["item", "theme", "project"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide ${tab === t ? "border-b-2 border-accent text-fg" : "text-muted"}`}
            onClick={() => setTab(t)}
          >
            {t === "item" ? "Inspector" : t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === "item" && <ItemTab />}
        {tab === "theme" && <ThemeTab />}
        {tab === "project" && <ProjectTab />}
      </div>
    </div>
  );
}

function ItemTab() {
  const { project, selection, apply } = useStore();
  if (!project || !selection) return <p className="text-muted">Select a scene or overlay on the timeline.</p>;
  if (selection.kind === "scene") {
    const scene = project.scenes.find((s) => s.id === selection.id);
    if (!scene) return null;
    const def = registry.get(scene.block);
    const tr = scene.transition ?? { type: "none" as const, duration: 0.4 };
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">{def?.name ?? scene.block}</div>
            <div className="text-xs text-muted">
              {scene.id} · {def?.summary ?? "Block not installed"}
            </div>
          </div>
          <button className="btn btn-icon" onClick={() => apply([{ op: "remove_scene", id: scene.id }])} title="Delete scene">
            <Trash2 size={12} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Duration (s)</span>
            <DebouncedInput
              type="number"
              step={0.1}
              min={0.1}
              value={String(scene.duration)}
              onCommit={(v) => Number(v) > 0 && apply([{ op: "update_scene", id: scene.id, patch: { duration: Number(v) } }])}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Transition in</span>
            <select
              value={tr.type}
              onChange={(e) => apply([{ op: "update_scene", id: scene.id, patch: { transition: { ...tr, type: e.target.value as typeof tr.type } } }])}
            >
              {TRANSITIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Length (s)</span>
            <DebouncedInput
              type="number"
              step={0.1}
              min={0}
              max={5}
              value={String(tr.duration)}
              onCommit={(v) => apply([{ op: "update_scene", id: scene.id, patch: { transition: { ...tr, duration: Math.max(0, Math.min(5, Number(v))) } } }])}
            />
          </label>
        </div>
        <hr className="border-line" />
        {def ? (
          <SchemaForm
            key={scene.id}
            schema={schemaOf(def)}
            value={scene.props}
            onChange={(patch) => apply([{ op: "update_scene", id: scene.id, patch: { props: patch } }])}
          />
        ) : (
          <p className="text-danger">Block “{scene.block}” is not installed. Its props are kept as-is.</p>
        )}
      </div>
    );
  }
  const overlay = project.overlays.find((o) => o.id === selection.id);
  if (!overlay) return null;
  const def = registry.get(overlay.block);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{def?.name ?? overlay.block}</div>
          <div className="text-xs text-muted">{overlay.id} · overlay</div>
        </div>
        <button className="btn btn-icon" onClick={() => apply([{ op: "remove_overlay", id: overlay.id }])} title="Delete overlay">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["start", "end"] as const).map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{k === "start" ? "Start (s)" : "End (s)"}</span>
            <DebouncedInput
              type="number"
              step={0.1}
              min={0}
              value={String(overlay[k])}
              onCommit={(v) => apply([{ op: "update_overlay", id: overlay.id, patch: { [k]: Number(v) } }])}
            />
          </label>
        ))}
      </div>
      <hr className="border-line" />
      {def && (
        <SchemaForm
          key={overlay.id}
          schema={schemaOf(def)}
          value={overlay.props}
          onChange={(patch) => apply([{ op: "update_overlay", id: overlay.id, patch: { props: { ...overlay.props, ...patch } } }])}
        />
      )}
    </div>
  );
}

const PRESETS: { name: string; theme: Partial<Theme> }[] = [
  { name: "Violet night", theme: { primary: "#7C3AED", secondary: "#22D3EE", background: "#0B0B12", text: "#FFFFFF" } },
  { name: "Sunrise", theme: { primary: "#F97316", secondary: "#FACC15", background: "#1A0F0A", text: "#FFF7ED" } },
  { name: "Mint paper", theme: { primary: "#059669", secondary: "#0EA5E9", background: "#F8FAF9", text: "#0F172A" } },
  { name: "Mono", theme: { primary: "#FFFFFF", secondary: "#A3A3A3", background: "#0A0A0A", text: "#FAFAFA" } },
];

function ThemeTab() {
  const { project, apply } = useStore();
  if (!project) return null;
  const t = project.theme;
  const set = (patch: Partial<Theme>) => apply([{ op: "set_theme", patch }]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button key={p.name} className="btn justify-start" onClick={() => set(p.theme)}>
            <span className="flex">
              {[p.theme.background, p.theme.primary, p.theme.secondary].map((c) => (
                <span key={c} className="h-3 w-3 rounded-full border border-line" style={{ background: c }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
      </div>
      {(["primary", "secondary", "background", "text"] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="text-xs font-medium capitalize text-muted">{k}</span>
          <div className="flex gap-2">
            <input type="color" value={t[k].slice(0, 7)} onChange={(e) => set({ [k]: e.target.value.toUpperCase() })} />
            <DebouncedInput value={t[k]} onCommit={(v) => set({ [k]: v })} />
          </div>
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Font</span>
        <select value={t.font} onChange={(e) => set({ font: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Corner radius ({t.radius})</span>
        <input type="range" min={0} max={48} value={t.radius} onChange={(e) => set({ radius: Number(e.target.value) })} />
      </label>
    </div>
  );
}

function ProjectTab() {
  const { project, name, apply, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  if (!project || !name) return null;
  const audio = project.audio;
  const upload = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      await api.uploadAsset(name, f).catch((e) => toast((e as Error).message, "error"));
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">FPS</span>
          <select value={project.meta.fps} onChange={(e) => apply([{ op: "set_meta", patch: { fps: Number(e.target.value) as 30 | 60 } }])}>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Resolution</span>
          <select value={project.meta.resolution} onChange={(e) => apply([{ op: "set_meta", patch: { resolution: e.target.value as "720p" | "1080p" } }])}>
            <option>720p</option>
            <option>1080p</option>
          </select>
        </label>
      </div>
      <hr className="border-line" />
      <div className="font-semibold">Music</div>
      <AssetField
        title="Track"
        accept="audio"
        value={audio?.music ?? ""}
        onChange={(v) => apply([{ op: "set_audio", audio: v ? { music: v, volume: audio?.volume ?? 0.8, fadeOut: audio?.fadeOut ?? 1.5 } : null }])}
      />
      {audio?.music && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Volume ({audio.volume})</span>
            <input type="range" min={0} max={1} step={0.05} value={audio.volume} onChange={(e) => apply([{ op: "set_audio", audio: { volume: Number(e.target.value) } }])} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Fade out (s)</span>
            <DebouncedInput type="number" min={0} step={0.5} value={String(audio.fadeOut)} onCommit={(v) => apply([{ op: "set_audio", audio: { fadeOut: Number(v) } }])} />
          </label>
        </div>
      )}
      <hr className="border-line" />
      <div className="flex items-center justify-between">
        <span className="font-semibold">Assets</span>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={12} /> Upload
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" accept="image/*,audio/*" onChange={(e) => upload(e.target.files).then(() => (e.target.value = ""))} />
      </div>
      <p className="text-xs text-muted">Tip: drop image or audio files anywhere on the editor. You need the rights to anything you import.</p>
      <ul className="flex flex-col gap-1">
        {project.assets.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-md bg-panel-2 px-2 py-1">
            {a.type === "image" ? (
              <img src={`/api/projects/${name}/assets/${encodeURIComponent(a.file)}`} alt="" className="h-8 w-12 rounded object-cover" />
            ) : (
              <span className="w-12 text-center text-xs text-muted">{a.type}</span>
            )}
            <span className="min-w-0 flex-1 truncate">
              <b>{a.id}</b> <span className="text-muted">{a.file}</span>
            </span>
            <button className="btn btn-icon" title="Remove from project" onClick={() => apply([{ op: "remove_asset", id: a.id }])}>
              <Trash2 size={11} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
