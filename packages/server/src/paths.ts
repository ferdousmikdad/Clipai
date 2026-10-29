import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Repo / install root: the folder that contains `projects/`, `assets/` and `apps/`. */
export function findRoot(): string {
  if (process.env.CLIPAI_ROOT) return path.resolve(process.env.CLIPAI_ROOT);
  // packages/server/dist → root
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fromPackage = path.resolve(here, "../../..");
  if (existsSync(path.join(fromPackage, "pnpm-workspace.yaml"))) return fromPackage;
  return process.cwd();
}

const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/** Project names become folder names: letters, digits, dash, underscore. */
export function isValidName(name: string): boolean {
  return NAME.test(name);
}

export function toName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Safe file name for assets: keeps the extension, strips anything path-like. */
export function safeFileName(input: string): string {
  const base = path.basename(input).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+/, "");
  return base.slice(-120) || "file";
}

/** Resolve `rel` inside `dir`, refusing anything that escapes it. */
export function within(dir: string, rel: string): string | null {
  const full = path.resolve(dir, rel);
  return full === dir || full.startsWith(dir + path.sep) ? full : null;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
};

export const contentType = (file: string) => TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

export function assetType(file: string): "image" | "audio" | "video" | null {
  const ext = path.extname(file).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return "image";
  if ([".mp3", ".wav", ".m4a", ".ogg", ".aac"].includes(ext)) return "audio";
  if ([".mp4", ".webm", ".mov"].includes(ext)) return "video";
  return null;
}
