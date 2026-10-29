import { spawn } from "node:child_process";
import type { ChatContext } from "./index.js";
import { CHAT_SYSTEM_PROMPT, type Emit } from "./types.js";
import { claudeBin } from "./settings.js";

/**
 * One user turn through the user's installed Claude Code (their own login / subscription).
 * Claude Code runs headless with no built-in tools; its only tools are Clipai's MCP server,
 * pre-pointed at this project. `session` keeps the conversation across turns via --resume.
 */
export function runClaudeCodeTurn(
  ctx: ChatContext,
  project: string,
  session: { id?: string },
  message: string,
  emit: Emit,
  signal: AbortSignal,
): Promise<{ costUsd?: number }> {
  const mcpConfig = {
    mcpServers: {
      clipai: {
        command: process.execPath,
        args: [ctx.mcpEntry],
        env: { CLIPAI_PORT: String(ctx.port()), CLIPAI_PROJECT: project },
      },
    },
  };
  const args = [
    "-p",
    message,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--mcp-config",
    JSON.stringify(mcpConfig),
    "--strict-mcp-config",
    "--tools",
    "",
    "--allowedTools",
    "mcp__clipai",
    "--permission-mode",
    "dontAsk",
    "--append-system-prompt",
    CHAT_SYSTEM_PROMPT,
    ...(session.id ? ["--resume", session.id] : []),
  ];

  return new Promise((resolve, reject) => {
    let costUsd: number | undefined;
    const child = spawn(claudeBin(), args, { cwd: ctx.projectDir(project), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const onAbort = () => child.kill("SIGTERM");
    signal.addEventListener("abort", onAbort, { once: true });
    let buf = "";
    let stderr = "";
    let finished = false;
    let streamedText = false;

    const handle = (line: string) => {
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.session_id) session.id = ev.session_id;
      if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta") {
        streamedText = true;
        emit({ type: "text", text: ev.event.delta.text });
      } else if (ev.type === "assistant") {
        for (const block of ev.message?.content ?? []) {
          if (block.type === "tool_use") emit({ type: "tool", id: block.id, name: String(block.name).replace(/^mcp__clipai__/, "") });
          else if (block.type === "text" && !streamedText) emit({ type: "text", text: block.text });
        }
        streamedText = false;
      } else if (ev.type === "user") {
        for (const block of ev.message?.content ?? []) {
          if (block.type !== "tool_result") continue;
          const text = Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? "").join(" ") : String(block.content ?? "");
          emit({ type: "tool_done", id: block.tool_use_id, ok: !block.is_error, text: text.split("\n")[0] });
        }
      } else if (ev.type === "result") {
        finished = true;
        if (ev.is_error || ev.subtype !== "success") {
          emit({ type: "error", message: explain(String(ev.result ?? ev.subtype ?? "Claude Code failed")) });
        }
        if (typeof ev.total_cost_usd === "number") costUsd = ev.total_cost_usd;
      }
    };

    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handle(line);
      }
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error(`Couldn't start Claude Code: ${e.message}`));
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (buf.trim()) handle(buf.trim());
      if (signal.aborted || finished) return resolve({ costUsd });
      reject(new Error(explain(stderr.trim() || `Claude Code exited with code ${code}`)));
    });
  });
}

function explain(msg: string): string {
  if (/log ?in|auth|credential|api key/i.test(msg)) return `Claude Code isn't signed in. Run "claude auth login" in a terminal, then try again. (${msg.slice(0, 200)})`;
  return msg.slice(0, 500);
}
