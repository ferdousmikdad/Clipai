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

let detected: { at: number; value: Promise<{ installed: boolean; version?: string }> } | null = null;

/** Is the Claude Code CLI installed? Cached for a minute. */
export function detectClaudeCode(bin = claudeBin()): Promise<{ installed: boolean; version?: string }> {
  if (detected && Date.now() - detected.at < 60_000) return detected.value;
  const value = new Promise<{ installed: boolean; version?: string }>((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err) resolve({ installed: false });
      else resolve({ installed: true, version: String(stdout).trim().split(/\s+/)[0] });
    });
  });
  detected = { at: Date.now(), value };
  return value;
}

export const claudeBin = () => process.env.CLIPAI_CLAUDE_BIN || "claude";
