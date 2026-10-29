import type Anthropic from "@anthropic-ai/sdk";
import type { Project } from "@clipai/schema";
import type { BlockRegistry } from "@clipai/engine";
import type { ProjectStore } from "../store.js";
import { SettingsStore, detectClaudeCode } from "./settings.js";
import { runApiTurn, apiErrorMessage, API_MODEL } from "./api-backend.js";
import { runClaudeCodeTurn } from "./claude-code.js";
import type { Backend, ChatMode, Emit } from "./types.js";

export type { ChatEvent, ChatMode, Backend } from "./types.js";

/** What the chat backends need from the server. */
export type ChatContext = {
  store: ProjectStore;
  registry: BlockRegistry;
  notify: (name: string, project: Project, changed: string[]) => void;
  addAsset: (name: string, path: string, id?: string) => Promise<{ id: string; type: string }>;
  snapshot: (name: string, time: number) => Promise<string>;
  projectDir: (name: string) => string;
  /** Path to the built MCP server (used by the Claude Code backend). */
  mcpEntry: string;
  port: () => number;
};

type Session = {
  backend?: Backend;
  history: Anthropic.Beta.BetaMessageParam[];
  claude: { id?: string };
  running?: AbortController;
};

export type ChatStatus = {
  mode: ChatMode;
  backend: Backend | null;
  claudeCode: { installed: boolean; version?: string };
  apiKey: { set: boolean; source?: "settings" | "env" };
  model: string;
};

/** In-app chat: one conversation per project, served by Claude Code or the Anthropic API. */
export class ChatService {
  readonly settings: SettingsStore;
  private sessions = new Map<string, Session>();

  constructor(
    private ctx: ChatContext,
    settingsDir: string,
  ) {
    this.settings = new SettingsStore(settingsDir);
  }

  async status(): Promise<ChatStatus> {
    const s = await this.settings.get();
    const [cc, key] = await Promise.all([detectClaudeCode(), this.settings.apiKey()]);
    let backend: Backend | null = null;
    if (s.mode === "claude-code") backend = cc.installed ? "claude-code" : null;
    else if (s.mode === "api") backend = key.key ? "api" : null;
    else backend = cc.installed ? "claude-code" : key.key ? "api" : null;
    return { mode: s.mode, backend, claudeCode: cc, apiKey: { set: !!key.key, source: key.source }, model: backend === "api" ? API_MODEL : "your Claude Code default" };
  }

  private session(name: string): Session {
    let s = this.sessions.get(name);
    if (!s) {
      s = { history: [], claude: {} };
      this.sessions.set(name, s);
    }
    return s;
  }

  reset(name: string): void {
    this.sessions.get(name)?.running?.abort();
    this.sessions.delete(name);
  }

  stop(name: string): void {
    this.sessions.get(name)?.running?.abort();
  }

  /** Run one user message. Events go to `emit`; resolves when the turn is over. */
  async send(name: string, message: string, emit: Emit, signal?: AbortSignal): Promise<void> {
    const session = this.session(name);
    if (session.running) {
      emit({ type: "error", message: "Claude is still working on the last message." });
      return;
    }
    const status = await this.status();
    if (!status.backend) {
      emit({
        type: "error",
        message:
          status.mode === "claude-code"
            ? "Claude Code isn't installed. Install it from claude.com/claude-code, or switch to an API key in chat settings."
            : "Connect Claude first: install Claude Code, or add an Anthropic API key in chat settings.",
      });
      return;
    }
    // Switching backend starts a fresh conversation (the two don't share history).
    if (session.backend && session.backend !== status.backend) {
      session.history = [];
      session.claude = {};
    }
    session.backend = status.backend;

    const controller = new AbortController();
    session.running = controller;
    signal?.addEventListener("abort", () => controller.abort(), { once: true });
    emit({ type: "start", backend: status.backend });
    try {
      let costUsd: number | undefined;
      if (status.backend === "claude-code") {
        ({ costUsd } = await runClaudeCodeTurn(this.ctx, name, session.claude, message, emit, controller.signal));
      } else {
        const { key } = await this.settings.apiKey();
        await runApiTurn(this.ctx, key!, name, session.history, message, emit, controller.signal);
      }
      emit({ type: "done", costUsd });
    } catch (err) {
      if (controller.signal.aborted) emit({ type: "done" });
      else emit({ type: "error", message: status.backend === "api" ? apiErrorMessage(err) : (err as Error).message });
    } finally {
      session.running = undefined;
    }
  }
}
