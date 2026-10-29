# Project format

A project is a folder: `projects/<name>/project.json` + `assets/` + `exports/` (+ `.history/` with the last 10 saved versions).
`project.json` is the single source of truth. Every change from the editor or the AI goes through the same **ops** API, is validated, saved atomically and pushed to open editors over WebSocket.

Units: time in **seconds**; positions inside blocks as **0–1 fractions** so a project looks the same in every format and resolution.

```ts
type Project = {
  version: 1;
  meta: { name: string; format: "16:9" | "9:16" | "1:1"; fps: 30 | 60; resolution: "720p" | "1080p" };
  theme: { primary: string; secondary: string; background: string; text: string; font: string; radius: number };
  assets: { id: string; type: "image" | "audio" | "video"; file: string }[]; // file is relative to assets/
  scenes: Scene[]; // played in order
  overlays: Overlay[]; // drawn on top with absolute start/end
  audio?: { music?: string; volume: number; fadeOut: number }; // music = asset id
};

type Scene = {
  id: string; // s1, s2, …
  block: string; // block id, e.g. "title-reveal"
  duration: number;
  props: Record<string, unknown>; // validated by the block's schema; missing props use defaults
  transition?: { type: "none" | "fade" | "slide" | "zoom" | "wipe"; duration: number };
};

type Overlay = { id: string; block: string; start: number; end: number; props: Record<string, unknown> };
```

## Timing

- Total length = sum of scene durations.
- A scene's `transition` plays during its **first** `duration` seconds while the previous scene keeps animating past its end (blocks hold their final pose). The transition length is clamped to both scenes' durations.

| Format | 720p       | 1080p      |
| ------ | ---------- | ---------- |
| 16:9   | 1280×720   | 1920×1080  |
| 9:16   | 720×1280   | 1080×1920  |
| 1:1    | 720×720    | 1080×1080  |

## Ops

`POST /api/projects/:name/ops` with `{ "ops": [...] }`. Ops are applied atomically: if one fails, none are applied.

```ts
type Op =
  | { op: "add_scene"; scene: { block: string; duration?: number; props?: object; transition?: Transition }; index?: number }
  | { op: "update_scene"; id: string; patch: Partial<Omit<Scene, "id">> } // props merged shallowly; null removes a key
  | { op: "remove_scene"; id: string }
  | { op: "move_scene"; id: string; index: number }
  | { op: "add_overlay"; overlay: { block: string; start: number; end: number; props?: object } }
  | { op: "update_overlay"; id: string; patch: Partial<Omit<Overlay, "id">> }
  | { op: "remove_overlay"; id: string }
  | { op: "set_theme"; patch: Partial<Theme> }
  | { op: "set_meta"; patch: Partial<Meta> }
  | { op: "set_audio"; audio: Partial<Audio> | null }
  | { op: "add_asset"; asset: Asset }
  | { op: "remove_asset"; id: string };
```

Errors are short and point at the problem: `s3.props.title: required`, `ops.1 (remove_scene): no scene "s9"`.

## Summary

`GET /api/projects/:name/summary` returns a compact text view used by the AI:

```
taskflow-promo · 16:9 1080p30 · 12.5s · theme #7C3AED/Inter
s1 title-reveal 3s "Meet TaskFlow"
s2 ui-mockup 4s asset=dash fade
s3 feature-callout 3s "Auto-sync"
s4 logo-outro 2.5s "taskflow.app"
music: music.mp3 (0.6)
```

## REST API

All endpoints are on `127.0.0.1` only; requests with a non-localhost `Host` or `Origin` are rejected.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/projects` | list |
| POST | `/api/projects` | create `{name, format, theme?}` |
| GET / PUT / DELETE | `/api/projects/:name` | read / replace (validated) / delete |
| POST | `/api/projects/:name/duplicate` | copy `{to}` |
| POST | `/api/projects/:name/ops` | apply ops → `{ok, summary, errors}` |
| GET | `/api/projects/:name/summary` | compact text |
| POST | `/api/projects/:name/undo`, `/redo` | history (last 100 states, shared by UI and AI) |
| POST | `/api/projects/:name/assets` | upload (multipart `file`) or `{path}` to copy a local file (MCP only) |
| GET | `/api/projects/:name/assets/:file` | serve an asset |
| POST | `/api/projects/:name/exports` | save an exported MP4 |
| POST | `/api/projects/:name/export-video` | ask the open editor to export; resolves with the file path |
| POST | `/api/projects/:name/snapshot` | ask the open editor to render a PNG at `{time}` |
| GET | `/api/blocks` | compact block list (`?format=full` for JSON with schemas) |
| GET | `/api/blocks/:id` | one block's JSON Schema (`?format=text` for a short description) |
| GET | `/api/ai-prompt?project=` | the paste-mode prompt |

WebSocket `/ws` messages: `project:updated {name, project, source, changed}`, `project:changed-by {source}`, `snapshot:request/response`, `export:request/response`.
