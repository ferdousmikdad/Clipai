import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { startServer, isLocalRequest } from "../src/index.js";

let server: Awaited<ReturnType<typeof startServer>>;
let root: string;
const api = (p: string, init: RequestInit = {}) =>
  fetch(server.url + p, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "clipai-test-"));
  await mkdir(path.join(root, "blocks"));
  await writeFile(
    path.join(root, "blocks", "hello.js"),
    `export default ({ z, defineBlock }) => defineBlock({ id: "hello-plugin", name: "Hello", summary: "Plugin test", category: "text", defaultDuration: 2, schema: z.object({ text: z.string().default("hi") }), render() {} });`,
  );
  server = await startServer({ port: 0, root });
});
afterAll(() => server?.close());

describe("security", () => {
  it("only accepts localhost hosts and origins", () => {
    expect(isLocalRequest("127.0.0.1:4400", undefined, 4400)).toBe(true);
    expect(isLocalRequest("localhost:4400", "http://localhost:5173", 4400)).toBe(true);
    expect(isLocalRequest("evil.com:4400", undefined, 4400)).toBe(false);
    expect(isLocalRequest("127.0.0.1:4400", "https://evil.com", 4400)).toBe(false);
    expect(isLocalRequest("127.0.0.1:9999", undefined, 4400)).toBe(false);
  });

  it("rejects foreign origins over HTTP", async () => {
    const res = await api("/api/projects", { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });
});

describe("REST API", () => {
  it("lists blocks compactly, including plugins", async () => {
    const text = await (await api("/api/blocks")).text();
    expect(text).toContain("title-reveal — Big title");
    expect(text).toContain("hello-plugin — Plugin test");
    const one = await (await api("/api/blocks/title-reveal")).json();
    expect(one.schema.properties.title.type).toBe("string");
  });

  it("creates, edits, undoes and redoes a project", async () => {
    const created = await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Demo One", format: "9:16" }) });
    expect(created.status).toBe(201);
    expect((await created.json()).name).toBe("demo-one");

    const ops = await api("/api/projects/demo-one/ops", {
      method: "POST",
      body: JSON.stringify({ ops: [{ op: "add_scene", scene: { block: "title-reveal", props: { title: "Hello" } } }] }),
    });
    const body = await ops.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toContain('s1 title-reveal 3s "Hello"');

    const bad = await (await api("/api/projects/demo-one/ops", { method: "POST", body: JSON.stringify({ ops: [{ op: "update_scene", id: "s1", patch: { props: { title: 5 } } }] }) })).json();
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/^s1\.props\.title:/);

    await api("/api/projects/demo-one/undo", { method: "POST" });
    expect((await (await api("/api/projects/demo-one")).json()).project.scenes).toHaveLength(0);
    await api("/api/projects/demo-one/redo", { method: "POST" });
    expect((await (await api("/api/projects/demo-one")).json()).project.scenes).toHaveLength(1);

    const list = await (await api("/api/projects")).json();
    expect(list.projects.map((p: any) => p.name)).toContain("demo-one");
    const hist = await readdir(path.join(root, "projects", "demo-one", ".history"));
    expect(hist.length).toBeGreaterThan(0);
  });

  it("validates full replacements with block schemas", async () => {
    const res = await api("/api/projects/demo-one", {
      method: "PUT",
      body: JSON.stringify({
        version: 1,
        meta: { name: "x", format: "16:9", fps: 30, resolution: "1080p" },
        theme: { primary: "#7C3AED", secondary: "#22D3EE", background: "#0B0B12", text: "#FFFFFF", font: "Inter", radius: 16 },
        assets: [],
        scenes: [{ id: "s1", block: "nope", duration: 2, props: {} }],
        overlays: [],
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toContain('s1.block: unknown block "nope"');
  });

  it("rejects path traversal in names and asset files", async () => {
    expect((await api("/api/projects/..%2F..%2Fetc")).status).toBeGreaterThanOrEqual(400);
    expect((await api("/api/projects/demo-one/assets/..%2Fproject.json")).status).toBe(404);
  });

  it("copies local assets only for MCP callers", async () => {
    const src = path.join(root, "shot.png");
    await writeFile(src, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const denied = await api("/api/projects/demo-one/assets", { method: "POST", body: JSON.stringify({ path: src }) });
    expect(denied.status).toBe(403);
    const ok = await (await api("/api/projects/demo-one/assets", { method: "POST", headers: { "x-clipai-source": "mcp" }, body: JSON.stringify({ path: src }) })).json();
    expect(ok).toMatchObject({ ok: true, id: "shot", type: "image", file: "shot.png" });
  });

  it("saves exports to the project folder", async () => {
    const res = await (await fetch(`${server.url}/api/projects/demo-one/exports`, { method: "POST", body: new Uint8Array(64) })).json();
    expect(res.path).toMatch(/projects\/demo-one\/exports\/demo-one-\d{8}-\d{6}\.mp4$/);
    expect((await readFile(res.path)).length).toBe(64);
  });
});

describe("live sync", () => {
  it("pushes updates to an open editor", async () => {
    const ws = new WebSocket(server.url.replace("http", "ws") + "/ws");
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "editor:open", name: "demo-one" }));
    const got = new Promise<any>((resolve) =>
      ws.on("message", (d) => {
        const m = JSON.parse(String(d));
        if (m.type === "project:updated") resolve(m);
      }),
    );
    await api("/api/projects/demo-one/ops", {
      method: "POST",
      headers: { "x-clipai-source": "mcp" },
      body: JSON.stringify({ ops: [{ op: "set_theme", patch: { primary: "#FF0066" } }] }),
    });
    const msg = await got;
    expect(msg).toMatchObject({ name: "demo-one", source: "mcp", changed: ["theme"] });
    expect(msg.project.theme.primary).toBe("#FF0066");

    // snapshot relay round-trip
    ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      if (m.type === "snapshot:request") ws.send(JSON.stringify({ type: "snapshot:response", id: m.id, png: "iVBORw0KGgo=" }));
    });
    const snap = await (await api("/api/projects/demo-one/snapshot", { method: "POST", body: JSON.stringify({ time: 1 }) })).json();
    expect(snap.png).toBe("iVBORw0KGgo=");
    ws.close();
  });
});
