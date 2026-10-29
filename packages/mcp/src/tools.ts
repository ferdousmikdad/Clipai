import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClipaiClient, ClipaiError } from "./client.js";

export const INSTRUCTIONS = `Clipai builds animated videos from short JSON. You never write animation code.

Workflow:
1. Call list_blocks once. Call get_block only for blocks you will use.
2. create_project (or open_project) to pick the project.
3. Build the first version with ONE set_project call (full project JSON).
4. Edit with apply_ops, batching all changes into one call.
5. Don't call get_project or snapshot unless needed; summaries come back after every change.
6. export_video when the user asks for the MP4.

Project JSON: {version:1, meta:{name,format:"16:9"|"9:16"|"1:1",fps:30|60,resolution:"720p"|"1080p"}, theme:{primary,secondary,background,text,font,radius}, assets:[{id,type,file}], scenes:[{id,block,duration,props,transition?:{type:"none"|"fade"|"slide"|"zoom"|"wipe",duration}}], overlays:[{id,block,start,end,props}], audio?:{music,volume,fadeOut}}
Times are seconds. Scene ids s1,s2…; overlay ids o1,o2…. Fonts: Inter, Poppins, Hind Siliguri, Noto Sans Bengali (Bangla text works in any font).

Rules:
- Use fictional names and brands unless the user gives real ones.
- Never invent asset paths. Ask the user for a file, then add_asset.
- Blocks without an asset show a placeholder, which is fine for drafts.
- Overlay blocks (lower-third, captions, watermark) go in overlays, not scenes.
- Errors look like "s3.props.title: required" — fix exactly that and retry.`;

const OP_HELP = `Ops (all applied atomically):
{op:"add_scene",scene:{block,duration?,props?,transition?},index?}
{op:"update_scene",id,patch:{duration?,props?,transition?,block?}} (props merged; null removes a key)
{op:"remove_scene",id} {op:"move_scene",id,index}
{op:"add_overlay",overlay:{block,start,end,props?}} {op:"update_overlay",id,patch} {op:"remove_overlay",id}
{op:"set_theme",patch} {op:"set_meta",patch} {op:"set_audio",audio:{music?,volume?,fadeOut?}|null}`;

type Text = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (t: string): Text => ({ content: [{ type: "text", text: t }] });
const fail = (t: string): Text => ({ content: [{ type: "text", text: t }], isError: true });

/** Instructions when the server is locked to one project (the in-app chat). */
export const LOCKED_INSTRUCTIONS = INSTRUCTIONS.replace("2. create_project (or open_project) to pick the project.", "2. The project is already open; every tool works on it.");

const PROJECT_PICKERS = new Set(["list_projects", "create_project", "open_project"]);

/**
 * Register Clipai's tools. With `project` (set by the in-app chat), the server is locked to that
 * project: the tools that pick or create projects are left out, so edits land where the user is looking.
 */
export function registerTools(server: McpServer, client: ClipaiClient, project?: string) {
  let current: string | undefined = project;
  const register = ((name: string, config: any, cb: any) =>
    project && PROJECT_PICKERS.has(name) ? undefined : server.registerTool(name, config, cb)) as McpServer["registerTool"];

  const need = () => {
    if (!current) throw new ClipaiError("No project open. Call create_project or open_project first.");
    return current;
  };
  const wrap =
    <A>(fn: (args: A) => Promise<Text | any>) =>
    async (args: A) => {
      try {
        return await fn(args);
      } catch (e) {
        return fail(e instanceof ClipaiError ? e.message : `Error: ${(e as Error).message}`);
      }
    };
  const enc = encodeURIComponent;

  register(
    "list_blocks",
    { description: "List available blocks, one line each: id — summary — props (* = required). Call once." },
    wrap(async () => text(await client.call<string>("GET", "/api/blocks"))),
  );

  register(
    "get_block",
    { description: "Props of one block with types, defaults and an example.", inputSchema: { id: z.string() } },
    wrap(async ({ id }: { id: string }) => text(await client.call<string>("GET", `/api/blocks/${enc(id)}?format=text`))),
  );

  register(
    "list_projects",
    { description: "List projects (name, format, duration)." },
    wrap(async () => {
      const { projects } = await client.call<{ projects: { name: string; format: string; duration: number; scenes: number }[] }>("GET", "/api/projects");
      if (!projects.length) return text("No projects yet.");
      return text(projects.map((p) => `${p.name} · ${p.format} · ${p.duration}s · ${p.scenes} scenes`).join("\n"));
    }),
  );

  register(
    "create_project",
    {
      description: "Create a project and make it current. Returns its summary.",
      inputSchema: {
        name: z.string().describe("lowercase-with-dashes"),
        format: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
        theme: z
          .object({
            primary: z.string().optional(),
            secondary: z.string().optional(),
            background: z.string().optional(),
            text: z.string().optional(),
            font: z.string().optional(),
            radius: z.number().optional(),
          })
          .optional()
          .describe("hex colors, font name"),
      },
    },
    wrap(async (args: { name: string; format: string; theme?: object }) => {
      const res = await client.call<{ name: string; summary: string }>("POST", "/api/projects", args);
      current = res.name;
      return text(res.summary);
    }),
  );

  register(
    "open_project",
    { description: "Make an existing project current. Returns its summary.", inputSchema: { name: z.string() } },
    wrap(async ({ name }: { name: string }) => {
      const s = await client.call<string>("GET", `/api/projects/${enc(name)}/summary`);
      current = name;
      return text(s);
    }),
  );

  register(
    "set_project",
    {
      description: "Replace the current project with full project JSON (use for the first build). Returns ok + summary, or errors.",
      inputSchema: { project: z.record(z.string(), z.unknown()).describe("Full project JSON") },
    },
    wrap(async ({ project }: { project: Record<string, any> }) => {
      if (!current) {
        // Allow set_project as the very first call: create the project from meta.name.
        const name = String(project?.meta?.name ?? "").trim();
        if (!name) throw new ClipaiError("No project open and project.meta.name missing.");
        const list = await client.call<{ projects: { name: string }[] }>("GET", "/api/projects");
        const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
        if (!list.projects.some((p) => p.name === slug)) {
          await client.call("POST", "/api/projects", { name: slug, format: project?.meta?.format ?? "16:9" });
        }
        current = slug;
      }
      const res = await client.call<{ summary: string }>("PUT", `/api/projects/${enc(current)}`, { project });
      return text(`ok\n${res.summary}`);
    }),
  );

  register(
    "apply_ops",
    {
      description: `Edit the current project. Batch every change into one call. Returns ok + summary, or errors.\n${OP_HELP}`,
      inputSchema: { ops: z.array(z.looseObject({ op: z.string() })).min(1) },
    },
    wrap(async ({ ops }: { ops: unknown[] }) => {
      const res = await client.call<{ summary: string }>("POST", `/api/projects/${enc(need())}/ops`, { ops });
      return text(`ok\n${res.summary}`);
    }),
  );

  register(
    "get_summary",
    { description: "Compact summary of the current project." },
    wrap(async () => text(await client.call<string>("GET", `/api/projects/${enc(need())}/summary`))),
  );

  register(
    "get_project",
    { description: "Full project JSON. Costs tokens: only use when the summary is not enough." },
    wrap(async () => {
      const { project } = await client.call<{ project: unknown }>("GET", `/api/projects/${enc(need())}`);
      return text(JSON.stringify(project));
    }),
  );

  register(
    "add_asset",
    {
      description: "Copy a local file (image/audio) into the current project. Returns the asset id to use in props. Never guess paths; ask the user.",
      inputSchema: { path: z.string().describe("Absolute path on this machine"), id: z.string().optional().describe("Optional asset id") },
    },
    wrap(async (args: { path: string; id?: string }) => {
      const res = await client.call<{ id: string; type: string }>("POST", `/api/projects/${enc(need())}/assets`, args);
      return text(`asset id: ${res.id} (${res.type})`);
    }),
  );

  register(
    "snapshot",
    {
      description: "Render one frame as PNG. Costs many tokens: only use when the user asks to see a frame. Needs the editor open in a browser.",
      inputSchema: { time: z.number().min(0).describe("Seconds") },
    },
    wrap(async ({ time }: { time: number }) => {
      const res = await client.call<{ png: string }>("POST", `/api/projects/${enc(need())}/snapshot`, { time, width: 640 }, 30_000);
      return { content: [{ type: "image", data: res.png, mimeType: "image/png" }] };
    }),
  );

  register(
    "export_video",
    {
      description: "Export the current project to MP4 in the open editor (Chrome/Edge). Returns the file path when done.",
      inputSchema: {
        resolution: z.enum(["720p", "1080p"]).optional(),
        fps: z.union([z.literal(30), z.literal(60)]).optional(),
      },
    },
    wrap(async (args: { resolution?: string; fps?: number }) => {
      const res = await client.call<{ path: string }>("POST", `/api/projects/${enc(need())}/export-video`, args, 31 * 60_000);
      return text(`exported: ${res.path}`);
    }),
  );

  return { current: () => current };
}
