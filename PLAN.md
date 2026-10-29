# Clipai — Build Plan (for Claude Code)

> Instructions for Claude Code: build this project from this document, milestone by milestone. Finish each milestone's acceptance criteria before starting the next. Ask the user before changing any decision in the "Fixed decisions" section.

---

## 1. Goal

A local, open-source (MIT) video editor for animated / SaaS-style videos that an AI can control through MCP with very few tokens.

- The AI sends **short JSON** (scene type + props), never animation code.
- The user previews live and exports MP4 locally.
- Everything runs on the user's machine. No cloud, no accounts, no telemetry.

---

## 2. Fixed decisions

| Topic | Decision |
|---|---|
| License | MIT for all project code |
| Rendering | **Own engine**: HTML Canvas 2D, deterministic `render(project, time)` |
| Video export | Browser **WebCodecs** (`VideoEncoder` H.264, `AudioEncoder` AAC) + MP4 muxer |
| Forbidden deps | Remotion, any GPL/AGPL/source-available/commercial-restricted package, bundled FFmpeg |
| Runtime | Node.js 20+, Chrome/Edge for export |
| Hosting | **Local only**. Server binds to `127.0.0.1` |
| Storage | Plain files: `projects/<name>/project.json` + `assets/` + `exports/` |
| Token rule | Every MCP response is short. Full JSON only when explicitly requested |

---

## 3. Tech stack

All dependencies must be MIT / ISC / BSD / Apache-2.0 / MPL-2.0.

- **Language:** TypeScript (strict)
- **Monorepo:** pnpm workspaces
- **Editor UI:** React + Vite, Zustand (state), Tailwind CSS, Lucide icons
- **Validation:** Zod
- **Local server:** Hono (or Node `http`) + `ws`
- **MCP:** `@modelcontextprotocol/sdk` (stdio transport)
- **MP4 muxing:** `mediabunny` (MPL-2.0) or `mp4-muxer` (MIT)
- **Testing:** Vitest (unit), Playwright (export smoke test)
- **License check:** `license-checker-rseidelsohn` (or similar) in CI
- **Fonts (OFL, bundled):** Inter, Poppins, Hind Siliguri, Noto Sans Bengali

---

## 4. Architecture

```
┌──────────────────────┐     stdio      ┌──────────────────────┐
│  AI client           │ ─────────────► │  packages/mcp        │
│  (Claude Code/Desktop)│               │  MCP server          │
└──────────────────────┘                └─────────┬────────────┘
                                                  │ HTTP (127.0.0.1:4400/api)
                                                  ▼
┌──────────────────────────────────────────────────────────────┐
│  packages/server  (pnpm start)                               │
│  - serves editor UI                                          │
│  - REST API: projects, ops, assets, exports                  │
│  - file store: ./projects/<name>/...                         │
│  - WebSocket: pushes project changes to the open editor      │
└─────────────────────────┬────────────────────────────────────┘
                          │ WebSocket + HTTP
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  apps/editor (browser)                                       │
│  Player · Timeline · Inspector · Blocks panel · Export       │
│  uses packages/engine to render frames on <canvas>           │
│  export: engine → WebCodecs → MP4 → POST to server           │
└──────────────────────────────────────────────────────────────┘
```

Rules:
- **Single source of truth:** `project.json` on disk, owned by the server.
- All changes (from UI or MCP) go through the same **ops** API → validated → saved → broadcast over WebSocket.
- If the server isn't running, the MCP server returns: `Editor not running. Run "pnpm start" in the Clipai folder.`
- **Preview and export use the exact same renderer** (what you see = what you export).

---

## 5. Repository layout

```
clipai/
├─ LICENSE
├─ README.md
├─ PLAN.md
├─ THIRD_PARTY_NOTICES.md        (generated)
├─ package.json / pnpm-workspace.yaml / tsconfig.base.json
├─ assets/
│  ├─ fonts/                      (OFL fonts)
│  └─ licenses/                   (OFL.txt, lucide LICENSE, etc.)
├─ docs/
│  ├─ blocks.md                   (how to build a block)
│  ├─ schema.md                   (project format)
│  └─ ai-prompt.md                (text used by "Copy AI Prompt")
├─ packages/
│  ├─ schema/    types, Zod schemas, ops, validation, summary()
│  ├─ engine/    renderer, timing, animation helpers, font loader
│  ├─ blocks/    built-in blocks (one file per block)
│  ├─ server/    local server + CLI (`pnpm start`)
│  └─ mcp/       MCP stdio server
├─ apps/
│  └─ editor/    React UI
├─ examples/     demo projects (fictional brands only)
└─ projects/     user projects (gitignored)
```

---

## 6. Project format (`packages/schema`)

Units: time in **seconds**, positions as **0–1 fractions** of canvas size (format-independent).

```ts
type Project = {
  version: 1;
  meta: { name: string; format: "16:9" | "9:16" | "1:1"; fps: 30 | 60; resolution: "720p" | "1080p" };
  theme: { primary: string; secondary: string; background: string; text: string; font: string; radius: number };
  assets: Asset[];          // { id, type: "image" | "audio" | "video", file }  (file relative to assets/)
  scenes: Scene[];          // played in order
  overlays: Overlay[];      // drawn on top, absolute start/end (captions, watermark logo)
  audio?: { music?: string; volume: number; fadeOut: number };
};

type Scene = {
  id: string;
  block: string;            // block id, e.g. "title-reveal"
  duration: number;
  props: Record<string, unknown>;   // validated by that block's Zod schema
  transition?: { type: "none" | "fade" | "slide" | "zoom" | "wipe"; duration: number };
};

type Overlay = { id: string; block: string; start: number; end: number; props: Record<string, unknown> };
```

Example:

```json
{
  "version": 1,
  "meta": { "name": "taskflow-promo", "format": "16:9", "fps": 30, "resolution": "1080p" },
  "theme": { "primary": "#7C3AED", "secondary": "#22D3EE", "background": "#0B0B12", "text": "#FFFFFF", "font": "Inter", "radius": 16 },
  "assets": [{ "id": "dash", "type": "image", "file": "dashboard.png" }],
  "scenes": [
    { "id": "s1", "block": "title-reveal", "duration": 3, "props": { "title": "Meet TaskFlow", "subtitle": "Plan less. Ship more." } },
    { "id": "s2", "block": "ui-mockup", "duration": 4, "props": { "asset": "dash", "frame": "browser", "motion": "slide-up" }, "transition": { "type": "fade", "duration": 0.4 } },
    { "id": "s3", "block": "feature-callout", "duration": 3, "props": { "title": "Auto-sync", "text": "Every device, instantly.", "icon": "refresh-cw" } },
    { "id": "s4", "block": "logo-outro", "duration": 2.5, "props": { "text": "taskflow.app" } }
  ],
  "overlays": [],
  "audio": { "music": "music.mp3", "volume": 0.6, "fadeOut": 1.5 }
}
```

### Ops (the only way to change a project)

```ts
type Op =
  | { op: "add_scene"; scene: Omit<Scene, "id">; index?: number }
  | { op: "update_scene"; id: string; patch: Partial<Scene> }      // props merged shallowly
  | { op: "remove_scene"; id: string }
  | { op: "move_scene"; id: string; index: number }
  | { op: "add_overlay"; overlay: Omit<Overlay, "id"> }
  | { op: "update_overlay"; id: string; patch: Partial<Overlay> }
  | { op: "remove_overlay"; id: string }
  | { op: "set_theme"; patch: Partial<Project["theme"]> }
  | { op: "set_meta"; patch: Partial<Project["meta"]> }
  | { op: "set_audio"; audio: Project["audio"] };
```

- `applyOps(project, ops)` is pure, validates the result, and returns `{ project, errors }`. If any op fails, none are applied.
- IDs are short and generated (`s1`, `s2`, `o1`…).
- Keep **undo/redo** history (last 100 states) in the server.

### `summary(project)` — compact text for AI

```
taskflow-promo · 16:9 1080p30 · 12.5s · theme #7C3AED/Inter
s1 title-reveal 3s "Meet TaskFlow"
s2 ui-mockup 4s asset=dash fade
s3 feature-callout 3s "Auto-sync"
s4 logo-outro 2.5s
music: music.mp3 (0.6)
```

---

## 7. Engine (`packages/engine`)

- `renderFrame(ctx: CanvasRenderingContext2D, project, time: number, assets: LoadedAssets)` — **pure and deterministic**. Same input → same pixels. No `Date.now()`, no `Math.random()` (use seeded random).
- Timeline resolver: scene start times, transition overlaps, overlays.
- Transitions: render outgoing + incoming scenes to offscreen canvases, composite.
- Helpers: `interpolate`, `easings` (in/out/inOut cubic, back, expo), `spring`, `stagger`, text layout with wrapping, rounded rects, shadows, gradients, image fit (cover/contain).
- Font loader: waits for `document.fonts` before rendering/exporting.
- **Bangla text** must render correctly (test with Hind Siliguri).
- Resolutions: 720p / 1080p for each format (e.g., 9:16 1080p = 1080×1920).

---

## 8. Blocks (`packages/blocks`)

### Block interface

```ts
type BlockDefinition<P> = {
  id: string;                // kebab-case
  name: string;
  summary: string;           // ONE line, shown to AI
  category: "text" | "ui" | "data" | "brand" | "background" | "overlay";
  defaultDuration: number;
  schema: z.ZodType<P>;      // with .describe() on every field (short)
  defaults: P;
  render(r: RenderArgs<P>): void;   // r = { ctx, props, theme, t, progress, duration, width, height, assets }
};
```

Every block must:
- Use theme colors/fonts by default (props can override).
- Look good in 16:9, 9:16 and 1:1.
- Have a demo entry in `examples/`.

### v1 block list

| id | What it does | Key props |
|---|---|---|
| `title-reveal` | Big title + subtitle animated in | title, subtitle, style: "rise" \| "type" \| "scale" |
| `kinetic-text` | Words/lines pop in one by one | lines[], emphasis[] |
| `ui-mockup` | Screenshot in browser/phone/laptop frame | asset, frame, motion: "slide-up" \| "tilt" \| "float" |
| `cursor-click` | Animated cursor moves and clicks on a screenshot | asset, path[{x,y}], clickAt[] |
| `zoom-pan` | Zooms into a region of a screenshot | asset, from{x,y,scale}, to{x,y,scale} |
| `feature-callout` | Icon + title + text card | title, text, icon (Lucide name) |
| `feature-grid` | 2–6 feature cards appear staggered | items[{icon,title,text}] |
| `stats-counter` | Numbers count up | items[{value,suffix,label}] |
| `before-after` | Split comparison with slider wipe | beforeAsset, afterAsset, labels |
| `testimonial` | Quote + name + role (fictional in demos) | quote, name, role, avatarAsset? |
| `pricing-card` | Plan cards slide in | plans[{name,price,features[]}] |
| `logo-outro` | Logo/asset reveal + URL/CTA | logoAsset?, text, cta? |
| `background` | Gradient/mesh/grid animated background (usable as scene) | style, colors? |
| `lower-third` (overlay) | Name/label bar | title, subtitle |
| `captions` (overlay) | Subtitle lines with timing | lines[{text,start,end}], style |
| `watermark` (overlay) | Corner logo | logoAsset, position |

### Plugin blocks

- Load extra blocks from `./blocks/*.js` (local folder) and from packages listed in `clipai.config.json` → `"plugins": []`.
- Same `BlockDefinition` interface. Show a warning in the UI: "Plugins run code on your machine."

---

## 9. Editor UI (`apps/editor`)

Layout (desktop):

```
┌───────────────────────────────────────────────────────────┐
│ Top bar: project name · format · undo/redo · Copy AI Prompt · Import JSON · Export │
├──────────┬──────────────────────────────────┬─────────────┤
│ Blocks   │          Player (canvas)          │ Inspector   │
│ panel    │   play/pause · scrub · time       │ (props form │
│ (drag to │                                   │  from Zod)  │
│ timeline)│                                   │ Theme tab   │
├──────────┴──────────────────────────────────┴─────────────┤
│ Timeline: scene clips (drag reorder, resize duration) · overlay track · music track │
└───────────────────────────────────────────────────────────┘
```

- Inspector forms are **auto-generated from each block's Zod schema** (text, number, color, select, asset picker, list editor).
- Asset upload: drag files in → `POST /api/projects/:name/assets`.
- Live updates: when MCP changes the project, UI updates within ~200 ms and briefly highlights the changed scene.
- Keyboard: Space play/pause, ←/→ frame step, Ctrl+Z / Ctrl+Shift+Z.
- Project picker on start screen: list, create (choose format), open, duplicate, delete.
- **Copy AI Prompt**: copies `docs/ai-prompt.md` + current block list (compact) + current project summary.
- **Import JSON**: paste full project JSON → validate → show errors clearly or replace project.
- Dark and light theme. Must work at 1280px width minimum.

---

## 10. Export

- Runs in the browser, frame by frame: `renderFrame` → `VideoFrame` → `VideoEncoder` (H.264, `avc1.640028`, ~8–12 Mbps for 1080p).
- Audio: decode music with `AudioContext`, apply volume + fade-out, encode with `AudioEncoder` (AAC), mux together.
- Progress bar with ETA and **Cancel**.
- Result posted to `POST /api/projects/:name/exports` → saved as `exports/<name>-<timestamp>.mp4`. Also offer browser download.
- If WebCodecs/H.264 unavailable: show "Export needs Chrome or Edge."
- Options: resolution (720p/1080p), fps (30/60), quality (standard/high).

---

## 11. Local server (`packages/server`)

`pnpm start` → builds if needed, starts on `127.0.0.1:4400` (configurable via `--port` / `CLIPAI_PORT`), prints URL.

REST API (JSON):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | list |
| POST | `/api/projects` | create `{name, format, theme?}` |
| GET | `/api/projects/:name` | full project |
| PUT | `/api/projects/:name` | replace (validated) |
| POST | `/api/projects/:name/ops` | apply ops `{ops: Op[]}` → `{ok, summary, errors}` |
| GET | `/api/projects/:name/summary` | compact text |
| POST | `/api/projects/:name/undo` / `redo` | history |
| POST | `/api/projects/:name/assets` | upload (multipart) or `{path}` to copy a local file |
| POST | `/api/projects/:name/exports` | save exported MP4 |
| GET | `/api/blocks` | compact block list |
| GET | `/api/blocks/:id` | one block's prop schema (JSON Schema) |
| POST | `/api/projects/:name/snapshot` | ask the open editor to render a PNG at time t |

WebSocket `/ws`: messages `project:updated {name, project}`, `project:changed-by {source: "ui" | "mcp"}`, `snapshot:request/response`, `export:request`.

Security:
- Bind to `127.0.0.1` only. Reject requests whose `Host`/`Origin` isn't localhost.
- Sanitize names and paths (no `..`, no absolute paths outside allowed folders). Asset copy from local path only when called via MCP (user's own machine).
- Atomic file writes (write temp → rename). Auto-backup last 10 versions in `projects/<name>/.history/`.

---

## 12. MCP server (`packages/mcp`)

stdio transport. Talks to the local server over HTTP. **Keep the tool list small and responses short.**

| Tool | Input | Returns |
|---|---|---|
| `list_blocks` | – | one line per block: `id — summary — props: a,b,c` |
| `get_block` | `id` | that block's props with short descriptions + defaults |
| `list_projects` | – | names + duration |
| `create_project` | `name, format, theme?` | summary |
| `open_project` | `name` | summary (sets "current project" for later calls) |
| `set_project` | `project` (full JSON) | `ok` + summary, or validation errors. Use for the first build. |
| `apply_ops` | `ops[]` | `ok` + summary, or errors. Use for all edits. |
| `get_summary` | – | compact summary |
| `get_project` | – | full JSON (only when needed) |
| `add_asset` | `path` (local file) | asset id |
| `snapshot` | `time` | PNG image (warn in description: costs tokens, use only when asked) |
| `export_video` | `resolution?, fps?` | starts export in the open editor, returns file path when done |

Server instructions (sent to the AI on connect), keep under ~300 words:
- Call `list_blocks` once, `get_block` only for blocks you'll use.
- Build the first version with one `set_project` call; edit with `apply_ops` batches.
- Don't call `get_project` or `snapshot` unless needed.
- Use fictional names; never invent asset paths — ask the user.

Error messages must be short and actionable, e.g. `s3.props.title: required`.

---

## 13. Milestones

**M0 — Repo setup**
- pnpm monorepo, TS strict, ESLint/Prettier, Vitest, LICENSE, README.
- CI: build, test, **license check** (fail on non-allowed licenses), `pnpm licenses:notice` generates `THIRD_PARTY_NOTICES.md`.
- ✅ `pnpm build` and `pnpm test` pass; license check works.

**M1 — Schema + engine + 3 blocks**
- Schema, ops, validation, summary, unit tests.
- Engine with timing, transitions, helpers, font loading.
- Blocks: `title-reveal`, `feature-callout`, `logo-outro`, `background`.
- A test page that plays an example project.
- ✅ Example plays smoothly at 30 fps in 16:9 and 9:16; Bangla title renders correctly.

**M2 — Editor UI**
- Player, timeline (reorder, resize), inspector auto-forms, theme tab, blocks panel, undo/redo, project picker.
- ✅ A user can build a 4-scene video by hand without touching JSON.

**M3 — Export**
- Video export, then audio + mux, progress, cancel, saves to `exports/`.
- ✅ 30s 1080p export plays in VLC and in the browser; audio in sync; output matches preview.

**M4 — Local server + live sync**
- File store, REST API, WebSocket, history, security rules.
- ✅ Editing `project.json` through the API updates an open editor live.

**M5 — MCP server**
- All tools from section 12 + server instructions.
- ✅ From Claude Code: "make a 20s promo with 4 scenes" works in ≤ 4 tool calls; edits take 1 call.

**M6 — All v1 blocks + Paste mode**
- Remaining blocks from section 8, overlays, `docs/ai-prompt.md`, Copy AI Prompt, Import JSON.
- ✅ Every block has an example; paste mode round-trip works with a JSON written by an AI chat.

**M7 — Plugins, docs, release**
- Plugin loading, `docs/blocks.md` tutorial with a sample plugin block, example projects, screenshots/GIF for README.
- ✅ A new block can be added from `./blocks/` without touching core code. Tag v0.1.0.

---

## 14. Out of scope for v1

- Cloud hosting, accounts, remote MCP
- Video clip editing (cutting real footage), screen recording
- AI image/voice/music generation
- Keyframe editor for custom animations (blocks only in v1)
- Mobile layout for the editor

---

## 15. Rules for Claude Code

1. Before adding any dependency, check its license. Allowed: MIT, ISC, BSD-2/3, Apache-2.0, MPL-2.0. Otherwise stop and ask.
2. Never add Remotion, Motion Canvas forks with restrictive terms, GPL/AGPL code, or bundled FFmpeg.
3. Never commit copyrighted fonts, music, images, or real brand logos. Use fictional demo brands.
4. Keep `renderFrame` deterministic; preview and export must share it.
5. Keep MCP responses compact; never dump full project JSON unless `get_project` is called.
6. Write tests for schema, ops and timing. Run `pnpm test` before finishing each milestone.
7. Update README and docs when behavior changes.
