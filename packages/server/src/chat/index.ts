import type Anthropic from "@anthropic-ai/sdk";
import type { Project } from "@clipai/schema";
import type { BlockRegistry } from "@clipai/engine";
import type { ProjectStore } from "../store.js";
import { SettingsStore, detectClaudeCode, forgetClaudeCode, type ClaudeCodeInfo } from "./settings.js";
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
  claudeCode: ClaudeCodeInfo;
  /** Why there is no backend, when there isn't one. */
  problem?: "claude-not-installed" | "claude-signed-out" | "no-api-key" | "nothing";
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

  async status(refresh = false): Promise<ChatStatus> {
    const s = await this.settings.get();
    const [cc, key] = await Promise.all([detectClaudeCode(refresh), this.settings.apiKey()]);
    // Signed-in state unknown (older Claude Code) counts as usable; the first message will tell.
    const ccReady = cc.installed && cc.loggedIn !== false;
    let backend: Backend | null = null;
    if (s.mode === "claude-code") backend = ccReady ? "claude-code" : null;
    else if (s.mode === "api") backend = key.key ? "api" : null;
    else backend = ccReady ? "claude-code" : key.key ? "api" : null;
    let problem: ChatStatus["problem"];
    if (!backend) {
      if (s.mode === "api") problem = "no-api-key";
      else if (cc.installed) problem = "claude-signed-out";
      else problem = s.mode === "claude-code" ? "claude-not-installed" : "nothing";
    }
    return {
      mode: s.mode,
      backend,
      claudeCode: cc,
      apiKey: { set: !!key.key, source: key.source },
      model: backend === "api" ? API_MODEL : "your Claude Code default",
      problem,
    };
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
      const messages: Record<NonNullable<ChatStatus["problem"]>, string> = {
        "claude-signed-out": 'Claude Code is installed but not signed in. Run "claude auth login" in a terminal, then try again.',
        "claude-not-installed": "Claude Code isn't installed. Install it from claude.com/claude-code, or switch to an API key in chat settings.",
        "no-api-key": "Add an Anthropic API key in chat settings.",
        nothing: "Connect Claude first: install Claude Code, or add an Anthropic API key in chat settings.",
      };
      emit({ type: "error", message: messages[status.problem ?? "nothing"] });
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
      else {
        if (status.backend === "claude-code") forgetClaudeCode(); // re-check sign-in next time
        emit({ type: "error", message: status.backend === "api" ? apiErrorMessage(err) : (err as Error).message });
      }
    } finally {
      session.running = undefined;
    }
  }
}
