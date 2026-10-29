import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import type { ChatMode } from "./types.js";

export type ChatSettings = { mode: ChatMode; apiKey?: string };

/** Chat settings live in `<root>/.clipai/settings.json` (gitignored, owner-only permissions). */
export class SettingsStore {
  private file: string;
  private cache: ChatSettings | null = null;

  constructor(dir: string) {
    this.file = path.join(dir, "settings.json");
  }

  async get(): Promise<ChatSettings> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse(await fs.readFile(this.file, "utf8"));
      this.cache = { mode: ["auto", "claude-code", "api"].includes(raw.mode) ? raw.mode : "auto", apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined };
    } catch {
      this.cache = { mode: "auto" };
    }
    return this.cache;
  }

  async update(patch: { mode?: ChatMode; apiKey?: string | null }): Promise<ChatSettings> {
    const cur = await this.get();
    const next: ChatSettings = { ...cur };
    if (patch.mode) next.mode = patch.mode;
    if (patch.apiKey === null || patch.apiKey === "") delete next.apiKey;
    else if (typeof patch.apiKey === "string") next.apiKey = patch.apiKey.trim();
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
    this.cache = next;
    return next;
  }

  /** API key from settings, else the ANTHROPIC_API_KEY environment variable. */
  async apiKey(): Promise<{ key?: string; source?: "settings" | "env" }> {
    const s = await this.get();
    if (s.apiKey) return { key: s.apiKey, source: "settings" };
    if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: "env" };
    return {};
  }
}

export type ClaudeCodeInfo = {
  installed: boolean;
  version?: string;
  /** null when this Claude Code version can't report sign-in status. */
  loggedIn: boolean | null;
  /** e.g. "claude.ai" (subscription) or "api_key" — never the email. */
  authMethod?: string;
  plan?: string;
};

let detected: { at: number; value: Promise<ClaudeCodeInfo> } | null = null;

function run(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 10_000, windowsHide: true }, (err, stdout) => resolve(err && !stdout ? null : String(stdout)));
  });
}

/** Is Claude Code installed and signed in? Cached for a minute unless `refresh`. */
export function detectClaudeCode(refresh = false, bin = claudeBin()): Promise<ClaudeCodeInfo> {
  if (!refresh && detected && Date.now() - detected.at < 60_000) return detected.value;
  const value = (async (): Promise<ClaudeCodeInfo> => {
    const version = await run(bin, ["--version"]);
    if (version === null) return { installed: false, loggedIn: false };
    const info: ClaudeCodeInfo = { installed: true, version: version.trim().split(/\s+/)[0], loggedIn: null };
    const status = await run(bin, ["auth", "status", "--json"]);
    try {
      const s = JSON.parse(status ?? "");
      if (typeof s.loggedIn === "boolean") info.loggedIn = s.loggedIn;
      if (typeof s.authMethod === "string") info.authMethod = s.authMethod;
      if (typeof s.subscriptionType === "string") info.plan = s.subscriptionType;
    } catch {
      // older Claude Code without `auth status`: unknown, try it on first message
    }
    return info;
  })();
  detected = { at: Date.now(), value };
  return value;
}

/** Forget the cached detection (e.g. after a sign-in error). */
export function forgetClaudeCode(): void {
  detected = null;
}

export const claudeBin = () => process.env.CLIPAI_CLAUDE_BIN || "claude";
