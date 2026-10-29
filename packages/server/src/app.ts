import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import { FORMATS, summary, ThemeSchema, type BlockLookup } from "@clipai/schema";
import { blockJsonSchema, compactBlockList, createBuiltinRegistry, describeBlock } from "@clipai/blocks";
import { ProjectStore, StoreError } from "./store.js";
import { assetType, contentType, isValidName, safeFileName, toName, within } from "./paths.js";
import { isLocalRequest } from "./security.js";
import type { Hub } from "./hub.js";
import { loadPlugins, type LoadedPlugin } from "./plugins.js";
import { ChatService } from "./chat/index.js";

export type AppOptions = {
  root: string;
  /** Where projects live (default `<root>/projects`). */
  projectsDir?: string;
  port: () => number;
  hub?: () => Hub | undefined;
};

type Source = "ui" | "mcp" | "api" | "ai";

export async function createApp(opts: AppOptions) {
  const { root } = opts;
  const registry = createBuiltinRegistry();
  const plugins: LoadedPlugin[] = await loadPlugins(root, (b) => registry.add(b));
  const lookup: BlockLookup = (id) => registry.get(id);
  const store = new ProjectStore(path.resolve(opts.projectsDir ?? path.join(root, "projects")), lookup);
  const editorDist = path.join(root, "apps", "editor", "dist");
  const fontsDir = path.join(root, "assets", "fonts");
  const hub = () => opts.hub?.();

  const app = new Hono();

  // ---- security: localhost only ----
  app.use("*", async (c, next) => {
    if (!isLocalRequest(c.req.header("host"), c.req.header("origin"), opts.port())) {
      return c.json({ ok: false, error: "forbidden: Clipai only accepts requests from localhost" }, 403);
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof StoreError) return c.json({ ok: false, error: err.message, errors: err.errors }, err.status as 400);
    return c.json({ ok: false, error: err.message }, 500);
  });

  const source = (c: Context): Source => {
    const s = c.req.header("x-clipai-source");
    return s === "mcp" || s === "ui" ? s : "api";
  };

  const notify = (name: string, project: unknown, src: Source, changed: string[] = []) => {
    const h = hub();
    if (!h) return;
    h.broadcast({ type: "project:updated", name, project, source: src, changed, history: store.canUndo(name) });
    h.broadcast({ type: "project:changed-by", name, source: src });
  };

  const name = (c: Context) => {
    const n = c.req.param("name") ?? "";
    if (!isValidName(n)) throw new StoreError(`invalid project name "${n}"`);
    return n;
  };

  const body = async (c: Context): Promise<any> => {
    try {
      return await c.req.json();
    } catch {
      throw new StoreError("request body must be JSON");
    }
  };

  // ---- meta ----
  app.get("/api/health", (c) => c.json({ ok: true, app: "clipai", editors: hub()?.editorCount ?? 0 }));
  app.get("/api/plugins", (c) => c.json({ plugins: plugins.map(({ url, blocks, error }) => ({ url, blocks, error })) }));

  // ---- blocks ----
  app.get("/api/blocks", (c) => {
    if (c.req.query("format") === "full") {
      return c.json({
        blocks: registry.list().map((b) => ({
          id: b.id,
          name: b.name,
          summary: b.summary,
          category: b.category,
          defaultDuration: b.defaultDuration,
          defaults: b.defaults,
          schema: blockJsonSchema(b),
          plugin: b.plugin,
        })),
      });
    }
    return c.text(compactBlockList(registry));
  });
  app.get("/api/blocks/:id", (c) => {
    const def = registry.get(c.req.param("id"));
    if (!def) return c.json({ ok: false, error: `unknown block "${c.req.param("id")}"` }, 404);
    if (c.req.query("format") === "text") return c.text(describeBlock(def));
    return c.json({ id: def.id, summary: def.summary, category: def.category, defaultDuration: def.defaultDuration, defaults: def.defaults, schema: blockJsonSchema(def) });
  });

  // ---- AI prompt (paste mode) ----
  app.get("/api/ai-prompt", async (c) => {
    const guide = await fs.readFile(path.join(root, "docs", "ai-prompt.md"), "utf8").catch(() => "");
    const parts = [guide.trim(), "## Blocks", registry.list().map(describeBlock).join("\n\n")];
    const p = c.req.query("project");
    if (p && isValidName(p) && (await store.exists(p))) parts.push("## Current project", summary(await store.get(p)));
    return c.text(parts.join("\n\n") + "\n");
  });

  // ---- projects ----
  app.get("/api/projects", async (c) => c.json({ projects: await store.list() }));

  app.post("/api/projects", async (c) => {
    const b = await body(c);
    const n = toName(String(b.name ?? ""));
    if (!n) throw new StoreError("name: required");
    const format = b.format ?? "16:9";
    if (!FORMATS.includes(format)) throw new StoreError(`format: must be one of ${FORMATS.join(", ")}`);
    const theme = b.theme ? ThemeSchema.partial().safeParse(b.theme) : undefined;
    if (theme && !theme.success) throw new StoreError("theme invalid", 400, theme.error.issues.map((i) => `theme.${i.path.join(".")}: ${i.message}`));
    const project = await store.create(n, format, theme?.data);
    return c.json({ ok: true, name: n, summary: summary(project), project }, 201);
  });

  app.get("/api/projects/:name", async (c) => {
    const n = name(c);
    return c.json({ project: await store.get(n), history: store.canUndo(n) });
  });

  app.put("/api/projects/:name", async (c) => {
    const n = name(c);
    const b = await body(c);
    const project = await store.put(n, b.project ?? b);
    notify(n, project, source(c));
    return c.json({ ok: true, summary: summary(project) });
  });

  app.delete("/api/projects/:name", async (c) => {
    const n = name(c);
    await store.remove(n);
    hub()?.broadcast({ type: "project:deleted", name: n });
    return c.json({ ok: true });
  });

  app.post("/api/projects/:name/duplicate", async (c) => {
    const n = name(c);
    const to = toName(String((await body(c)).to ?? `${n}-copy`));
    if (!to) throw new StoreError("to: required");
    const project = await store.duplicate(n, to);
    return c.json({ ok: true, name: to, summary: summary(project) });
  });

  app.post("/api/projects/:name/ops", async (c) => {
    const n = name(c);
    const b = await body(c);
    const ops = Array.isArray(b) ? b : b.ops;
    if (!Array.isArray(ops) || ops.length === 0) throw new StoreError("ops: expected a non-empty array");
    try {
      const { project, changed } = await store.apply(n, ops);
      notify(n, project, source(c), changed);
      return c.json({ ok: true, summary: summary(project), changed, errors: [] });
    } catch (e) {
      if (e instanceof StoreError && e.errors.length) return c.json({ ok: false, errors: e.errors }, 400);
      throw e;
    }
  });

  app.get("/api/projects/:name/summary", async (c) => c.text(summary(await store.get(name(c)))));

  for (const action of ["undo", "redo"] as const) {
    app.post(`/api/projects/:name/${action}`, async (c) => {
      const n = name(c);
      const project = await store[action](n);
      notify(n, project, source(c), ["*"]);
      return c.json({ ok: true, summary: summary(project) });
    });
  }

  // ---- examples ----
  const examplesDir = path.join(root, "examples");
  app.get("/api/examples", async (c) => {
    const names = existsSync(examplesDir) ? (await fs.readdir(examplesDir)).filter((n) => isValidName(n) && existsSync(path.join(examplesDir, n, "project.json"))) : [];
    return c.json({ examples: names });
  });
  /** Copy example projects that are not already in projects/. */
  app.post("/api/examples/install", async (c) => {
    const names = existsSync(examplesDir) ? (await fs.readdir(examplesDir)).filter((n) => isValidName(n) && existsSync(path.join(examplesDir, n, "project.json"))) : [];
    const installed: string[] = [];
    for (const n of names) {
      if (await store.exists(n)) continue;
      await fs.cp(path.join(examplesDir, n), store.projectDir(n), { recursive: true });
      await fs.mkdir(path.join(store.projectDir(n), "exports"), { recursive: true });
      installed.push(n);
    }
    return c.json({ ok: true, installed });
  });

  // ---- assets ----
  const assetsDirOf = async (n: string) => {
    await store.get(n);
    const dir = path.join(store.projectDir(n), "assets");
    await fs.mkdir(dir, { recursive: true });
    return dir;
  };

  /** Add a file already in assets/ to the project, picking a free id. */
  const registerAsset = async (n: string, fileName: string, requestedId: string | undefined, src: Source) => {
    const project = await store.get(n);
    const taken = new Set(project.assets.map((a) => a.id));
    let id = toName(requestedId || fileName.replace(/\.[^.]+$/, "")) || "asset";
    if (taken.has(id) && !requestedId) {
      let i = 2;
      while (taken.has(`${id}-${i}`)) i++;
      id = `${id}-${i}`;
    }
    const type = assetType(fileName)!;
    const res = await store.apply(n, [{ op: "add_asset", asset: { id, type, file: fileName } }]);
    notify(n, res.project, src, ["assets"]);
    return { id, type, file: fileName };
  };

  /** Copy a file from this machine into a project (MCP and the in-app chat only). */
  const copyLocalAsset = async (n: string, srcPath: string, requestedId: string | undefined, src: Source) => {
    const assetsDir = await assetsDirOf(n);
    const from = path.resolve(srcPath);
    const stat = await fs.stat(from).catch(() => null);
    if (!stat?.isFile()) throw new StoreError(`path: file not found "${srcPath}"`, 404);
    if (stat.size > 500 * 1024 * 1024) throw new StoreError("file too large (max 500 MB)");
    const fileName = await uniqueFile(assetsDir, safeFileName(from));
    if (!assetType(fileName)) throw new StoreError(`unsupported file type: ${fileName}`);
    await fs.copyFile(from, path.join(assetsDir, fileName));
    return registerAsset(n, fileName, requestedId, src);
  };

  app.post("/api/projects/:name/assets", async (c) => {
    const n = name(c);
    const ct = c.req.header("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const assetsDir = await assetsDirOf(n);
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw new StoreError("file: required (multipart field 'file')");
      const fileName = await uniqueFile(assetsDir, safeFileName(file.name));
      if (!assetType(fileName)) throw new StoreError(`unsupported file type: ${fileName}`);
      await fs.writeFile(path.join(assetsDir, fileName), Buffer.from(await file.arrayBuffer()));
      const res = await registerAsset(n, fileName, typeof form.id === "string" ? form.id : undefined, source(c));
      return c.json({ ok: true, ...res });
    }
    // Copying from a local path is only allowed for the MCP server (the user's own machine).
    if (source(c) !== "mcp") throw new StoreError("copying a local path is only allowed via MCP", 403);
    const b = await body(c);
    const res = await copyLocalAsset(n, String(b.path ?? ""), typeof b.id === "string" ? b.id : undefined, "mcp");
    return c.json({ ok: true, ...res });
  });

  app.get("/api/projects/:name/assets/:file", async (c) => {
    const n = name(c);
    const full = within(path.join(store.projectDir(n), "assets"), c.req.param("file"));
    if (!full || !existsSync(full)) return c.json({ ok: false, error: "asset not found" }, 404);
    return new Response(await fs.readFile(full), { headers: { "content-type": contentType(full), "cache-control": "no-cache" } });
  });

  // ---- exports ----
  app.post("/api/projects/:name/exports", async (c) => {
    const n = name(c);
    await store.get(n);
    const data = Buffer.from(await c.req.arrayBuffer());
    if (data.length < 8) throw new StoreError("empty export");
    const dir = path.join(store.projectDir(n), "exports");
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/\..+$/, "").replace(/[-:]/g, "").replace("T", "-");
    const file = path.join(dir, `${n}-${stamp}.mp4`);
    await fs.writeFile(file, data);
    const exportId = c.req.header("x-clipai-export-id");
    if (exportId) hub()?.settle(exportId, null, { path: file, bytes: data.length });
    return c.json({ ok: true, path: file, bytes: data.length });
  });

  app.get("/api/projects/:name/exports", async (c) => {
    const dir = path.join(store.projectDir(name(c)), "exports");
    const files = existsSync(dir) ? (await fs.readdir(dir)).filter((f) => f.endsWith(".mp4")).sort().reverse() : [];
    return c.json({ exports: files.map((f) => path.join(dir, f)) });
  });

  /** Ask the open editor to export (used by MCP). Resolves when the MP4 is saved. */
  app.post("/api/projects/:name/export-video", async (c) => {
    const n = name(c);
    await store.get(n);
    const b = await body(c).catch(() => ({}));
    const h = hub();
    if (!h) throw new StoreError("live sync not running", 503);
    const result = await h.request<{ path: string; bytes: number }>("export:request", n, { options: { resolution: b.resolution, fps: b.fps, quality: b.quality } }, 30 * 60_000);
    return c.json({ ok: true, path: result.path, bytes: result.bytes });
  });

  app.post("/api/projects/:name/snapshot", async (c) => {
    const n = name(c);
    await store.get(n);
    const b = await body(c).catch(() => ({}));
    const h = hub();
    if (!h) throw new StoreError("live sync not running", 503);
    const time = Number(b.time ?? 0);
    const res = await h.request<{ png: string }>("snapshot:request", n, { time, width: b.width }, 20_000);
    return c.json({ ok: true, png: res.png });
  });

  // ---- in-app chat ----
  const chat = new ChatService(
    {
      store,
      registry,
      notify: (n, project, changed) => notify(n, project, "ai", changed),
      addAsset: (n, p, id) => copyLocalAsset(n, p, id, "ai"),
      snapshot: async (n, time) => {
        const h = hub();
        if (!h) throw new Error("live sync not running");
        return (await h.request<{ png: string }>("snapshot:request", n, { time, width: 960 }, 20_000)).png;
      },
      projectDir: (n) => store.projectDir(n),
      mcpEntry: path.join(root, "packages", "mcp", "dist", "index.js"),
      port: opts.port,
    },
    path.join(root, ".clipai"),
  );

  app.get("/api/chat/status", async (c) => c.json(await chat.status()));

  app.put("/api/chat/settings", async (c) => {
    const b = await body(c);
    const mode = b.mode;
    if (mode !== undefined && !["auto", "claude-code", "api"].includes(mode)) throw new StoreError('mode: must be "auto", "claude-code" or "api"');
    if (b.apiKey !== undefined && b.apiKey !== null && typeof b.apiKey !== "string") throw new StoreError("apiKey: must be a string or null");
    await chat.settings.update({ mode, apiKey: b.apiKey });
    return c.json(await chat.status());
  });

  /** Send a chat message. Streams newline-delimited JSON events until the turn ends. */
  app.post("/api/projects/:name/chat", async (c) => {
    const n = name(c);
    await store.get(n);
    const message = String((await body(c)).message ?? "").trim();
    if (!message) throw new StoreError("message: required");
    const signal = c.req.raw.signal;
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (e: object) => {
          try {
            controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
          } catch {
            // client went away
          }
        };
        await chat.send(n, message, emit, signal);
        try {
          controller.close();
        } catch {
          // already closed
        }
      },
      cancel() {
        chat.stop(n);
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } });
  });

  app.post("/api/projects/:name/chat/stop", (c) => {
    chat.stop(name(c));
    return c.json({ ok: true });
  });

  app.post("/api/projects/:name/chat/reset", (c) => {
    chat.reset(name(c));
    return c.json({ ok: true });
  });

  // ---- static: fonts, plugins, editor ----
  app.get("/fonts/:file", async (c) => {
    const full = within(fontsDir, c.req.param("file"));
    if (!full || !existsSync(full)) return c.notFound();
    return new Response(await fs.readFile(full), { headers: { "content-type": contentType(full), "cache-control": "max-age=86400" } });
  });

  app.get("/plugins/*", async (c) => {
    const plugin = plugins.find((p) => p.url && p.url === c.req.path);
    if (!plugin) return c.notFound();
    return new Response(await fs.readFile(plugin.file), { headers: { "content-type": "text/javascript; charset=utf-8" } });
  });

  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ ok: false, error: "not found" }, 404);
    if (!existsSync(editorDist)) return c.text('Editor not built. Run "pnpm build" in the Clipai folder.', 503);
    const rel = decodeURIComponent(c.req.path).replace(/^\/+/, "") || "index.html";
    let full = within(editorDist, rel);
    if (!full || !existsSync(full) || (await fs.stat(full)).isDirectory()) full = path.join(editorDist, "index.html");
    const cache = full.includes(`${path.sep}assets${path.sep}`) ? "max-age=31536000, immutable" : "no-cache";
    return new Response(await fs.readFile(full), { headers: { "content-type": contentType(full), "cache-control": cache } });
  });

  return { app, store, registry, plugins, chat };
}

async function uniqueFile(dir: string, name: string): Promise<string> {
  if (!existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, -ext.length || undefined);
  let i = 2;
  while (existsSync(path.join(dir, `${base}-${i}${ext}`))) i++;
  return `${base}-${i}${ext}`;
}
