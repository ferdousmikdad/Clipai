import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "../src/index.js";

// A fake `claude` command whose sign-in state we control.
let dir: string;
let server: Awaited<ReturnType<typeof startServer>>;
const fake = (loggedIn: boolean | "old") =>
  writeFile(
    path.join(dir, "claude"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (Claude Code)"; exit 0; fi
if [ "$1" = "auth" ]; then
  ${loggedIn === "old" ? 'echo "unknown command auth" >&2; exit 1' : `echo '{"loggedIn": ${loggedIn}, "authMethod": "claude.ai", "subscriptionType": "max", "email": "someone@example.com"}'; exit ${loggedIn ? 0 : 1}`}
fi
exit 1
`,
  ).then(() => chmod(path.join(dir, "claude"), 0o755));

const status = async () => (await fetch(`${server.url}/api/chat/status?refresh=1`)).json();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "clipai-claude-"));
  process.env.CLIPAI_CLAUDE_BIN = path.join(dir, "claude");
  delete process.env.ANTHROPIC_API_KEY;
  server = await startServer({ port: 0, root: dir });
});
afterAll(async () => {
  await server?.close();
  delete process.env.CLIPAI_CLAUDE_BIN;
});

describe("Claude Code detection", () => {
  it("connects automatically when installed and signed in", async () => {
    await fake(true);
    const s = await status();
    expect(s.backend).toBe("claude-code");
    expect(s.claudeCode).toMatchObject({ installed: true, version: "9.9.9", loggedIn: true, plan: "max" });
    expect(JSON.stringify(s)).not.toContain("someone@example.com");
  });

  it("reports installed-but-signed-out up front", async () => {
    await fake(false);
    const s = await status();
    expect(s.backend).toBeNull();
    expect(s.problem).toBe("claude-signed-out");
    const res = await fetch(`${server.url}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "p" }) });
    expect(res.status).toBe(201);
    const chat = await (await fetch(`${server.url}/api/projects/p/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) })).text();
    expect(JSON.parse(chat.trim()).message).toMatch(/claude auth login/);
  });

  it("treats an older Claude Code without `auth status` as usable", async () => {
    await fake("old");
    const s = await status();
    expect(s.claudeCode.loggedIn).toBeNull();
    expect(s.backend).toBe("claude-code");
  });
});
