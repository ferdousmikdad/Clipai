import { useEffect, useState } from "react";
import { Copy, Film, Moon, Plus, Sparkles, Sun, Trash2 } from "lucide-react";
import { FORMATS } from "@clipai/schema";
import { api, type ProjectListItem } from "../api";
import { useStore } from "../store";

export function StartScreen() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<string>("16:9");
  const [error, setError] = useState<string | null>(null);
  const { open, toast, dark, toggleDark } = useStore();

  const refresh = () =>
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => setError((e as Error).message));
  useEffect(() => void refresh(), []);

  const create = async () => {
    try {
      const res = await api.createProject(name || "untitled", format);
      await open(res.name);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-8 px-8 py-12">
      <header className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="h-10 w-10" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Clipai</h1>
          <p className="text-muted">Local video editor for animated & SaaS-style videos, controlled by AI.</p>
        </div>
        <button className="btn btn-icon" onClick={toggleDark} title="Toggle theme">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="mb-3 font-semibold">New project</h2>
        <div className="flex gap-2">
          <input placeholder="project-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: 160 }}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f} {f === "16:9" ? "landscape" : f === "9:16" ? "reels / shorts" : "square"}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={create}>
            <Plus size={14} /> Create
          </button>
        </div>
        {error && <p className="mt-2 text-danger">{error}</p>}
      </section>

      <section className="flex-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Projects</h2>
          <button
            className="btn"
            onClick={() =>
              api
                .installExamples()
                .then((r) => (toast(r.installed.length ? `Added ${r.installed.join(", ")}` : "Examples already added."), refresh()))
                .catch((e) => toast(e.message, "error"))
            }
          >
            <Sparkles size={14} /> Add example projects
          </button>
        </div>
        {projects === null ? (
          <p className="text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-muted">No projects yet. Create one above, or ask your AI assistant to make one through MCP.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {projects.map((p) => (
              <li key={p.name} className="group flex items-center gap-3 rounded-xl border border-line bg-panel p-3 hover:border-accent">
                <button className="flex flex-1 items-center gap-3 text-left" onClick={() => open(p.name).catch((e) => toast(e.message, "error"))}>
                  <Film size={20} className="text-accent" />
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    <span className="text-muted">
                      {p.format} · {p.duration}s · {p.scenes} scenes
                    </span>
                  </span>
                </button>
                <button
                  className="btn btn-icon opacity-0 group-hover:opacity-100"
                  title="Duplicate"
                  onClick={async () => {
                    const to = prompt("Name of the copy", `${p.name}-copy`);
                    if (to) await api.duplicateProject(p.name, to).then(refresh).catch((e) => toast(e.message, "error"));
                  }}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="btn btn-icon opacity-0 group-hover:opacity-100"
                  title="Delete"
                  onClick={async () => {
                    if (confirm(`Delete "${p.name}" and its assets and exports? This cannot be undone.`))
                      await api.deleteProject(p.name).then(refresh).catch((e) => toast(e.message, "error"));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
