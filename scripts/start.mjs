#!/usr/bin/env node
// `pnpm start`: build if needed, then start the local server on 127.0.0.1.
import { existsSync, statSync, readdirSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputs = [
  "packages/schema/dist/index.js",
  "packages/engine/dist/index.js",
  "packages/blocks/dist/index.js",
  "packages/server/dist/cli.js",
  "packages/mcp/dist/index.js",
  "apps/editor/dist/index.html",
];

function newestSource(dir) {
  let newest = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

const stale = outputs.some((rel) => {
  const out = path.join(root, rel);
  if (!existsSync(out)) return true;
  const pkgDir = path.join(root, rel.split("/").slice(0, 2).join("/"), "src");
  return existsSync(pkgDir) && newestSource(pkgDir) > statSync(out).mtimeMs;
});

if (stale) {
  console.log("Building Clipai…");
  const res = spawnSync("pnpm", ["build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

const child = spawn(process.execPath, [path.join(root, "packages/server/dist/cli.js"), ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
