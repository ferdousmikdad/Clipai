import { useState } from "react";
import { validateProject } from "@clipai/schema";
import { Modal } from "./Modal";
import { useStore } from "../store";
import { lookup } from "../blocks";
import { api, ApiError } from "../api";

/** Extract the first JSON object from text an AI chat returned (handles ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object found.");
  return JSON.parse(body.slice(start, end + 1));
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { name, project, toast } = useStore();
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const submit = async () => {
    let json: any;
    try {
      json = extractJson(text);
    } catch (e) {
      setErrors([`Not valid JSON: ${(e as Error).message}`]);
      return;
    }
    if (json && typeof json === "object" && json.project) json = json.project;
    // Keep this project's name and existing assets the AI could not know about.
    if (json?.meta) json.meta.name = name;
    if (json && Array.isArray(json.assets) && project) {
      const ids = new Set(json.assets.map((a: any) => a?.id));
      json.assets = [...json.assets, ...project.assets.filter((a) => !ids.has(a.id))];
    } else if (json && project && !json.assets) json.assets = project.assets;
    const res = validateProject(json, lookup);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    try {
      await api.putProject(name!, res.project);
      toast("Project imported.");
      onClose();
    } catch (e) {
      setErrors(e instanceof ApiError && e.errors.length ? e.errors : [(e as Error).message]);
    }
  };

  return (
    <Modal title="Import JSON" onClose={onClose} width={720}>
      <p className="mb-2 text-muted">Paste the project JSON an AI chat returned. It replaces the current project (you can undo).</p>
      <textarea
        className="h-80 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"version": 1, "meta": {...}, "scenes": [...]}'
        autoFocus
      />
      {errors.length > 0 && (
        <ul className="mt-3 max-h-40 overflow-auto rounded-md border border-danger p-2 font-mono text-xs text-danger">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
          Validate & replace
        </button>
      </div>
    </Modal>
  );
}
