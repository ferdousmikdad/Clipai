import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startServer } from "../../server/src/index.js";
import { createMcpServer, INSTRUCTIONS, NOT_RUNNING } from "../src/server.js";

let server: Awaited<ReturnType<typeof startServer>>;

async function connect(baseUrl: string) {
  const mcp = createMcpServer(baseUrl);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([mcp.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res: any = await client.callTool({ name, arguments: args });
    return { text: res.content.map((c: any) => c.text).join("\n") as string, isError: !!res.isError };
  };
  return { client, call };
}

beforeAll(async () => {
  server = await startServer({ port: 0, root: await mkdtemp(path.join(tmpdir(), "clipai-mcp-")) });
});
afterAll(() => server?.close());

describe("MCP server", () => {
  it("keeps instructions short", () => {
    expect(INSTRUCTIONS.split(/\s+/).length).toBeLessThan(300);
  });

  it("exposes the planned tools", async () => {
    const { client } = await connect(server.url);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["add_asset", "apply_ops", "create_project", "export_video", "get_block", "get_project", "get_summary", "list_blocks", "list_projects", "open_project", "set_project", "snapshot"].sort(),
    );
  });

  it("builds a 4-scene promo in ≤ 4 calls and edits in 1", async () => {
    const { call } = await connect(server.url);
    const blocks = await call("list_blocks");
    expect(blocks.text).toContain("title-reveal");
    const created = await call("create_project", { name: "promo", format: "16:9" });
    expect(created.text).toMatch(/^promo · 16:9/);
    const set = await call("set_project", {
      project: {
        version: 1,
        meta: { name: "promo", format: "16:9", fps: 30, resolution: "1080p" },
        theme: { primary: "#7C3AED", secondary: "#22D3EE", background: "#0B0B12", text: "#FFFFFF", font: "Inter", radius: 16 },
        assets: [],
        scenes: [
          { id: "s1", block: "title-reveal", duration: 5, props: { title: "Meet Orbit" } },
          { id: "s2", block: "feature-grid", duration: 5, props: { items: [{ title: "Fast" }, { title: "Calm" }] } },
          { id: "s3", block: "stats-counter", duration: 5, props: { items: [{ value: 42, label: "Teams" }] } },
          { id: "s4", block: "logo-outro", duration: 5, props: { text: "orbit.app" } },
        ],
        overlays: [],
      },
    });
    expect(set.isError).toBe(false);
    expect(set.text).toContain("20s");
    const edit = await call("apply_ops", { ops: [{ op: "update_scene", id: "s1", patch: { props: { subtitle: "Plan less" } } }] });
    expect(edit.text.startsWith("ok")).toBe(true);
  });

  it("returns short actionable errors", async () => {
    const { call } = await connect(server.url);
    await call("open_project", { name: "promo" });
    const res = await call("apply_ops", { ops: [{ op: "update_scene", id: "s1", patch: { props: { title: null } } }] });
    expect(res.isError).toBe(true);
    expect(res.text).toBe("s1.props.title: required");
  });

  it("explains when the editor is not running", async () => {
    const { call } = await connect("http://127.0.0.1:1");
    const res = await call("list_blocks");
    expect(res).toEqual({ text: NOT_RUNNING, isError: true });
  });
});
