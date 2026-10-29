import type { Op, Project } from "@clipai/schema";

const headers = { "content-type": "application/json", "x-clipai-source": "ui" };

export class ApiError extends Error {
  constructor(
    message: string,
    public errors: string[] = [],
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const isJson = (res.headers.get("content-type") ?? "").includes("json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const errors: string[] = isJson ? (data.errors ?? []) : [];
    throw new ApiError(isJson ? (data.error ?? errors[0] ?? `HTTP ${res.status}`) : String(data), errors);
  }
  return data as T;
}

export type ProjectListItem = { name: string; format: string; duration: number; scenes: number; updated: string };
export type History = { undo: boolean; redo: boolean };

export const api = {
  listProjects: () => req<{ projects: ProjectListItem[] }>("GET", "/api/projects").then((r) => r.projects),
  createProject: (name: string, format: string) => req<{ name: string }>("POST", "/api/projects", { name, format }),
  getProject: (name: string) => req<{ project: Project; history: History }>("GET", `/api/projects/${name}`),
  putProject: (name: string, project: unknown) => req<{ ok: true }>("PUT", `/api/projects/${name}`, { project }),
  deleteProject: (name: string) => req("DELETE", `/api/projects/${name}`),
  duplicateProject: (name: string, to: string) => req<{ name: string }>("POST", `/api/projects/${name}/duplicate`, { to }),
  ops: (name: string, ops: Op[]) => req<{ ok: boolean; summary: string; errors: string[] }>("POST", `/api/projects/${name}/ops`, { ops }),
  undo: (name: string) => req("POST", `/api/projects/${name}/undo`),
  redo: (name: string) => req("POST", `/api/projects/${name}/redo`),
  aiPrompt: (name?: string) => req<string>("GET", `/api/ai-prompt${name ? `?project=${encodeURIComponent(name)}` : ""}`),
  installExamples: () => req<{ installed: string[] }>("POST", "/api/examples/install"),
  plugins: () => req<{ plugins: { url: string; blocks: string[]; error?: string }[] }>("GET", "/api/plugins").then((r) => r.plugins),
  async uploadAsset(name: string, file: File): Promise<{ id: string; type: string; file: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/projects/${name}/assets`, { method: "POST", body: form, headers: { "x-clipai-source": "ui" } });
    const data = await res.json();
    if (!res.ok) throw new ApiError(data.error ?? "upload failed", data.errors);
    return data;
  },
  async saveExport(name: string, blob: Blob, exportId?: string): Promise<{ path: string }> {
    const res = await fetch(`/api/projects/${name}/exports`, {
      method: "POST",
      body: blob,
      headers: { "content-type": "video/mp4", ...(exportId ? { "x-clipai-export-id": exportId } : {}) },
    });
    const data = await res.json();
    if (!res.ok) throw new ApiError(data.error ?? "saving export failed");
    return data;
  },
};

export const assetUrl = (project: string, file: string) => `/api/projects/${project}/assets/${encodeURIComponent(file)}`;
