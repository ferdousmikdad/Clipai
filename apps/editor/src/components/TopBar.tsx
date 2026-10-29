import { useState } from "react";
import { ArrowLeft, Bot, Download, FileJson, Moon, Redo2, Sun, Undo2 } from "lucide-react";
import { FORMATS, type Format } from "@clipai/schema";
import { useStore } from "../store";
import { api } from "../api";
import { useExport } from "../exporter";
import { ImportDialog } from "./ImportDialog";

export function TopBar() {
  const { name, project, history, apply, undo, redo, close, toast, dark, toggleDark } = useStore();
  const showExport = useExport((s) => s.show);
  const running = useExport((s) => s.running);
  const [importing, setImporting] = useState(false);
  if (!project || !name) return null;

  const copyPrompt = async () => {
    try {
      const text = await api.aiPrompt(name);
      await navigator.clipboard.writeText(text);
      toast("AI prompt copied. Paste it into any AI chat with your request.");
    } catch (e) {
      toast(`Copy failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex h-12 items-center gap-2 border-b border-line bg-panel px-3">
      <button className="btn btn-icon" onClick={close} title="All projects">
        <ArrowLeft size={14} />
      </button>
      <img src="/favicon.svg" alt="" className="h-6 w-6" />
      <span className="font-semibold">{name}</span>
      <select
        value={project.meta.format}
        onChange={(e) => apply([{ op: "set_meta", patch: { format: e.target.value as Format } }])}
        style={{ width: 80 }}
        title="Format"
      >
        {FORMATS.map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      <div className="mx-2 h-6 w-px bg-line" />
      <button className="btn btn-icon" onClick={undo} disabled={!history.undo} title="Undo (Ctrl+Z)">
        <Undo2 size={14} />
      </button>
      <button className="btn btn-icon" onClick={redo} disabled={!history.redo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={14} />
      </button>
      <div className="flex-1" />
      <button className="btn" onClick={copyPrompt} title="Copy a prompt for any AI chat (paste mode)">
        <Bot size={14} /> Copy AI Prompt
      </button>
      <button className="btn" onClick={() => setImporting(true)}>
        <FileJson size={14} /> Import JSON
      </button>
      <button className="btn btn-icon" onClick={toggleDark} title="Toggle light/dark">
        {dark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      <button className="btn btn-primary" onClick={() => showExport(true)}>
        <Download size={14} /> {running ? "Exporting…" : "Export"}
      </button>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
