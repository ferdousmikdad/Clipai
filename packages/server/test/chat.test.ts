import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { startServer } from "../src/index.js";

// A tiny stand-in for the Messages API: first reply calls apply_ops, second reply is text.
const requests: any[] = [];
let mock: Server;
let server: Awaited<ReturnType<typeof startServer>>;

function sse(events: [string, object][]) {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
}
const start = (id: string) => ["message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }] as [string, object];

beforeAll(async () => {
  mock = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      requests.push({ headers: req.headers, body: JSON.parse(body) });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ops = JSON.stringify({ ops: [{ op: "add_scene", scene: { block: "title-reveal", props: { title: "Hi Pebble" } } }] });
      if (requests.length === 1) {
        res.end(
          sse([
            start("msg_1"),
            ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "apply_ops", input: {} } }],
            ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ops } }],
            ["content_block_stop", { type: "content_block_stop", index: 0 }],
            ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } }],
            ["message_stop", { type: "message_stop" }],
          ]),
        );
      } else {
        res.end(
          sse([
            start("msg_2"),
            ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
            ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Added a title." } }],
            ["content_block_stop", { type: "content_block_stop", index: 0 }],
            ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } }],
            ["message_stop", { type: "message_stop" }],
          ]),
        );
      }
    });
  });
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  process.env.CLIPAI_CLAUDE_BIN = "/nonexistent/claude"; // force the API backend
  const root = await mkdtemp(path.join(tmpdir(), "clipai-chat-"));
  server = await startServer({ port: 0, root });
});
afterAll(async () => {
  await server?.close();
  mock?.close();
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.CLIPAI_CLAUDE_BIN;
});

const api = (p: string, init: RequestInit = {}) => fetch(server.url + p, { ...init, headers: { "content-type": "application/json" } });

describe("in-app chat", () => {
  it("reports no backend until Claude is connected, and never returns the key", async () => {
    const s = await (await api("/api/chat/status")).json();
    expect(s.backend).toBeNull();
    expect(s.claudeCode.installed).toBe(false);
    const saved = await (await api("/api/chat/settings", { method: "PUT", body: JSON.stringify({ apiKey: "sk-test-123" }) })).json();
    expect(saved).toMatchObject({ backend: "api", apiKey: { set: true, source: "settings" } });
    expect(JSON.stringify(saved)).not.toContain("sk-test-123");
  });

  it("runs a tool loop with the API backend and streams events", async () => {
    await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "pebble" }) });
    const res = await api("/api/projects/pebble/chat", { method: "POST", body: JSON.stringify({ message: "Add a title" }) });
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events.map((e) => e.type)).toEqual(["start", "tool", "tool_done", "text", "done"]);
    expect(events[2]).toMatchObject({ ok: true, text: "ok" });
    expect(events[3].text).toBe("Added a title.");

    const project = (await (await api("/api/projects/pebble")).json()).project;
    expect(project.scenes[0].props.title).toBe("Hi Pebble");

    const first = requests[0];
    expect(first.headers["x-api-key"] ?? first.headers.authorization).toContain("sk-test-123");
    expect(first.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "medium" }, stream: true });
    expect(first.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(first.body.tools.every((t: any) => t.eager_input_streaming === true)).toBe(true);
    // second request carries the assistant tool call and its result, in order
    const msgs = requests[1].body.messages;
    expect(msgs.map((m: any) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
  });

  it("explains how to connect when nothing is configured", async () => {
    await api("/api/chat/settings", { method: "PUT", body: JSON.stringify({ apiKey: null }) });
    const res = await api("/api/projects/pebble/chat", { method: "POST", body: JSON.stringify({ message: "hi" }) });
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events[0].type).toBe("error");
    expect(events[0].message).toMatch(/install Claude Code, or add an Anthropic API key/);
  });
});
