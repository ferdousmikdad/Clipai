import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { summary } from "@clipai/schema";
import { compactBlockList, describeBlock } from "@clipai/blocks";
import type { ChatContext } from "./index.js";

type ToolResult = { ok: boolean; content: string | Anthropic.Beta.BetaToolResultBlockParam["content"] };

const OP_HELP = `Ops (applied atomically):
{op:"add_scene",scene:{block,duration?,props?,transition?},index?}
{op:"update_scene",id,patch:{duration?,props?,transition?,block?}} (props merged; null removes a key)
{op:"remove_scene",id} {op:"move_scene",id,index}
{op:"add_overlay",overlay:{block,start,end,props?}} {op:"update_overlay",id,patch} {op:"remove_overlay",id}
{op:"set_theme",patch} {op:"set_meta",patch} {op:"set_audio",audio:{music?,volume?,fadeOut?}|null}`;

const inputs = {
  list_blocks: z.object({}),
  get_block: z.object({ id: z.string() }),
  get_summary: z.object({}),
  get_project: z.object({}),
  set_project: z.object({ project: z.record(z.string(), z.unknown()) }),
  apply_ops: z.object({ ops: z.array(z.looseObject({ op: z.string() })).min(1) }),
  add_asset: z.object({ path: z.string(), id: z.string().optional() }),
  snapshot: z.object({ time: z.number().min(0) }),
};
export type ToolName = keyof typeof inputs;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

/** Tool definitions for the API backend. Same names and behavior as the MCP server. */
export const CHAT_TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "list_blocks", description: "List available blocks, one line each: id — summary — props (* = required).", input_schema: obj({}) },
  { name: "get_block", description: "Props of one block with types, defaults and an example.", input_schema: obj({ id: { type: "string" } }, ["id"]) },
  { name: "get_summary", description: "Compact summary of the current project.", input_schema: obj({}) },
  { name: "get_project", description: "Full project JSON. Costs tokens: only when the summary is not enough.", input_schema: obj({}) },
  {
    name: "set_project",
    description: "Replace the whole current project with full project JSON (use for a new video). Returns ok + summary, or errors.",
    input_schema: obj({ project: { type: "object", description: "Full project JSON" } }, ["project"]),
  },
  {
    name: "apply_ops",
    description: `Edit the current project. Batch every change into one call. Returns ok + summary, or errors.\n${OP_HELP}`,
    input_schema: obj({ ops: { type: "array", items: { type: "object" }, minItems: 1 } }, ["ops"]),
  },
  {
    name: "add_asset",
    description: "Copy a local image or audio file (absolute path the user gave you) into the project. Returns the asset id.",
    input_schema: obj({ path: { type: "string" }, id: { type: "string", description: "Optional asset id" } }, ["path"]),
  },
  {
    name: "snapshot",
    description: "Render one frame of the current project as an image so you can check how it looks.",
    input_schema: obj({ time: { type: "number", description: "Seconds" } }, ["time"]),
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

/** Run one tool against the project. Inputs are validated (eager streaming can deliver truncated JSON). */
export async function runTool(ctx: ChatContext, p: string, name: string, rawInput: unknown): Promise<ToolResult> {
  if (!(name in inputs)) return { ok: false, content: `unknown tool "${name}"` };
  const parsed = inputs[name as ToolName].safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, content: JSON.stringify({ INVALID_JSON: JSON.stringify(rawInput) }) };
  const input = parsed.data as any;
  try {
    switch (name as ToolName) {
      case "list_blocks":
        return { ok: true, content: compactBlockList(ctx.registry) };
      case "get_block": {
        const def = ctx.registry.get(input.id);
        return def ? { ok: true, content: describeBlock(def) } : { ok: false, content: `unknown block "${input.id}"` };
      }
      case "get_summary":
        return { ok: true, content: summary(await ctx.store.get(p)) };
      case "get_project":
        return { ok: true, content: JSON.stringify(await ctx.store.get(p)) };
      case "set_project": {
        const project = await ctx.store.put(p, input.project);
        ctx.notify(p, project, ["*"]);
        return { ok: true, content: `ok\n${summary(project)}` };
      }
      case "apply_ops": {
        const { project, changed } = await ctx.store.apply(p, input.ops);
        ctx.notify(p, project, changed);
        return { ok: true, content: `ok\n${summary(project)}` };
      }
      case "add_asset": {
        const res = await ctx.addAsset(p, input.path, input.id);
        return { ok: true, content: `asset id: ${res.id} (${res.type})` };
      }
      case "snapshot": {
        const png = await ctx.snapshot(p, input.time);
        return { ok: true, content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: png } }] };
      }
    }
  } catch (e) {
    const err = e as Error & { errors?: string[] };
    return { ok: false, content: err.errors?.length ? err.errors.slice(0, 20).join("\n") : err.message };
  }
}
