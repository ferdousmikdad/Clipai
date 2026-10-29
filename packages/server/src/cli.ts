#!/usr/bin/env node
import { startServer } from "./index.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.split("=")[1];
}

const port = Number(arg("port") ?? process.env.CLIPAI_PORT ?? 4400);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid port: ${port}`);
  process.exit(1);
}

try {
  const s = await startServer({ port, root: arg("root"), projectsDir: arg("projects") ?? process.env.CLIPAI_PROJECTS });
  console.log(`\n  Clipai is running → ${s.url}\n`);
  console.log(`  projects: ${s.projectsDir}`);
  for (const p of s.plugins) {
    if (p.error) console.warn(`  plugin error (${p.file}): ${p.error}`);
    else console.log(`  plugin: ${p.blocks.join(", ")}  (${p.file}) — plugins run code on your machine`);
  }
  console.log("\n  Press Ctrl+C to stop.\n");
  const stop = () => s.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Try --port 4401 or set CLIPAI_PORT.`);
  else console.error(err);
  process.exit(1);
}
