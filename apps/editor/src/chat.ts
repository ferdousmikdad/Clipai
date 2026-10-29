import { create } from "zustand";

export type ChatStatus = {
  mode: "auto" | "claude-code" | "api";
  backend: "claude-code" | "api" | null;
  claudeCode: { installed: boolean; version?: string };
  apiKey: { set: boolean; source?: "settings" | "env" };
  model: string;
};

export type ToolStep = { id: string; name: string; ok?: boolean; text?: string };
export type ChatMessage = { role: "user" | "assistant"; text: string; steps: ToolStep[]; error?: string; costUsd?: number };

type ChatState = {
  status: ChatStatus | null;
  /** Conversation per project. */
  threads: Record<string, ChatMessage[]>;
  running: string | null;
  controller: AbortController | null;
  loadStatus(): Promise<void>;
  saveSettings(patch: { mode?: ChatStatus["mode"]; apiKey?: string | null }): Promise<void>;
  send(project: string, text: string): Promise<void>;
  stop(project: string): void;
  reset(project: string): Promise<void>;
};

const json = { "content-type": "application/json", "x-clipai-source": "ui" };

export const useChat = create<ChatState>((set, get) => ({
  status: null,
  threads: {},
  running: null,
  controller: null,

  async loadStatus() {
    const res = await fetch("/api/chat/status");
    if (res.ok) set({ status: await res.json() });
  },

  async saveSettings(patch) {
    const res = await fetch("/api/chat/settings", { method: "PUT", headers: json, body: JSON.stringify(patch) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't save settings");
    set({ status: data });
  },

  async send(project, text) {
    if (get().running) return;
    const controller = new AbortController();
    const thread = [...(get().threads[project] ?? []), { role: "user", text, steps: [] } as ChatMessage, { role: "assistant", text: "", steps: [] } as ChatMessage];
    set((s) => ({ threads: { ...s.threads, [project]: thread }, running: project, controller }));

    // Update the last (assistant) message immutably.
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      set((s) => {
        const t = [...(s.threads[project] ?? [])];
        t[t.length - 1] = fn(t[t.length - 1]);
        return { threads: { ...s.threads, [project]: t } };
      });

    try {
      const res = await fetch(`/api/projects/${project}/chat`, { method: "POST", headers: json, body: JSON.stringify({ message: text }), signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") patch((m) => ({ ...m, text: m.text + ev.text }));
          else if (ev.type === "tool") patch((m) => ({ ...m, steps: [...m.steps, { id: ev.id, name: ev.name }] }));
          else if (ev.type === "tool_done") patch((m) => ({ ...m, steps: m.steps.map((st) => (st.id === ev.id ? { ...st, ok: ev.ok, text: ev.text } : st)) }));
          else if (ev.type === "error") patch((m) => ({ ...m, error: ev.message }));
          else if (ev.type === "done") patch((m) => ({ ...m, costUsd: ev.costUsd }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      set({ running: null, controller: null });
    }
  },

  stop(project) {
    get().controller?.abort();
    void fetch(`/api/projects/${project}/chat/stop`, { method: "POST", headers: json });
  },

  async reset(project) {
    get().stop(project);
    await fetch(`/api/projects/${project}/chat/reset`, { method: "POST", headers: json });
    set((s) => ({ threads: { ...s.threads, [project]: [] } }));
  },
}));
