import Anthropic from "@anthropic-ai/sdk";
import { summary } from "@clipai/schema";
import type { ChatContext } from "./index.js";
import { CHAT_SYSTEM_PROMPT, type Emit } from "./types.js";
import { CHAT_TOOLS, runTool } from "./tools.js";

export const API_MODEL = "claude-opus-5-5";
const MAX_STEPS = 25;

/**
 * One user turn with the Anthropic API: stream text, run tools, loop until Claude is done.
 * `history` is append-only and only gets complete exchanges (an assistant turn together
 * with its tool results), so a cancelled turn never leaves a dangling tool call.
 */
export async function runApiTurn(
  ctx: ChatContext,
  apiKey: string,
  project: string,
  history: Anthropic.Beta.BetaMessageParam[],
  message: string,
  emit: Emit,
  signal: AbortSignal,
): Promise<void> {
  const client = new Anthropic({ apiKey });
  const current = summary(await ctx.store.get(project));
  history.push({
    role: "user",
    content: [
      { type: "text", text: `Current project summary:\n${current}` },
      { type: "text", text: message },
    ],
  });
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) return;
    const stream = client.beta.messages.stream(
      {
        model: API_MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: CHAT_SYSTEM_PROMPT,
        tools: CHAT_TOOLS,
        messages: history,
      },
      { signal },
    );
    stream.on("text", (text) => emit({ type: "text", text }));

    let reply: Anthropic.Beta.BetaMessage;
    try {
      reply = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only an unparseable streamed tool input is retried; API errors go to the caller.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (reply.stop_reason === "refusal") {
      history.push({ role: "assistant", content: reply.content });
      emit({ type: "error", message: "Claude declined this request. Try rephrasing it." });
      return;
    }
    if (reply.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: reply.content });
      continue;
    }
    const calls = reply.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (calls.length === 0) {
      history.push({ role: "assistant", content: reply.content });
      return;
    }
    if (reply.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off (max_tokens). Try a smaller request.");

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      emit({ type: "tool", id: call.id, name: call.name });
      const res = await runTool(ctx, project, call.name, call.input);
      emit({ type: "tool_done", id: call.id, ok: res.ok, text: typeof res.content === "string" ? res.content.split("\n")[0] : "image" });
      results.push({ type: "tool_result", tool_use_id: call.id, content: res.content, ...(res.ok ? {} : { is_error: true }) });
    }
    if (signal.aborted) return;
    history.push({ role: "assistant", content: reply.content }, { role: "user", content: results });
  }
  emit({ type: "error", message: `Stopped after ${MAX_STEPS} steps.` });
}

/** Short, user-facing message for API errors. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Your Anthropic API key was rejected. Check it in chat settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key can't use this model.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Wait a moment and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return (err as Error).message;
}
