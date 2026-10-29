# Clipai

**A free, open-source, local video editor for animated and SaaS-style videos — built to be controlled by AI.**

You describe the video. Your AI assistant (Claude Code, Claude Desktop, or any MCP client) builds it in the editor through a small set of tools. You watch the live preview, adjust anything by hand, and export the MP4 on your own computer.

---

## Why it exists

- **Token-efficient.** The AI sends short JSON instructions ("add a feature-callout scene, 3 seconds"), not hundreds of lines of animation code. Prebuilt animation blocks do the heavy lifting.
- **100% local.** Runs on your machine. No account, no cloud, no telemetry.
- **Truly free.** MIT licensed, with its own rendering engine. Free for individuals **and companies of any size**, including commercial use.
- **Hackable.** Anyone can add new animation blocks as plugins.

---

![Clipai demo](docs/images/demo.gif)

## Features

- Live preview player with timeline (drag to reorder, drag edges to resize), inspector forms generated from each block's schema, theme tab, undo/redo
- 16 prebuilt blocks: title reveal, kinetic text, UI mockup (browser / phone / laptop frame), cursor click, zoom & pan, feature callout, feature grid, stats counter, before/after, testimonial, pricing cards, logo outro, animated backgrounds, plus lower-third, captions and watermark overlays
- Transitions: fade, slide, zoom, wipe
- Formats: 16:9, 9:16 (Reels / Shorts), 1:1 — at 720p or 1080p, 30 or 60 fps
- Themes: brand colors, font and corner radius applied across the whole video
- Export to MP4 (H.264 + AAC) directly in the browser using WebCodecs — preview and export use the exact same renderer
- Background music with volume and fade-out
- Bangla font support out of the box (Hind Siliguri, Noto Sans Bengali)
- Three ways to work with AI: MCP (live control), Paste mode (any AI chat), or manual editing
- Plugin blocks: drop a `.js` file into `blocks/`

![Editor](docs/images/editor.png)

| 16:9 | 9:16 |
| --- | --- |
| ![16:9 frames](docs/images/frames-16x9.png) | ![9:16 frames](docs/images/frames-9x16.png) |

---

## Requirements

- Node.js 20 or newer and [pnpm](https://pnpm.io) (`npm i -g pnpm` or `corepack enable`)
- Chrome or Edge (recommended for export — uses WebCodecs)
- Windows, macOS, or Linux

---

## Quick start

```bash
git clone https://github.com/ferdousmikdad/Clipai.git
cd Clipai
pnpm install
pnpm build
pnpm start
```

Open the URL shown in the terminal (default `http://127.0.0.1:4400`). Click **Add example projects** to load three demo videos.

Projects are saved as plain folders in `./projects/<project-name>/` (a `project.json` file plus an `assets/` folder). Exports go to `./projects/<project-name>/exports/`.

Options: `pnpm start --port 4401` (or `CLIPAI_PORT`), `--projects <dir>` (or `CLIPAI_PROJECTS`).

Keyboard: <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step one frame (<kbd>Shift</kbd> = 1 s) · <kbd>Ctrl/Cmd+Z</kbd> undo · <kbd>Ctrl/Cmd+Shift+Z</kbd> redo · <kbd>Delete</kbd> remove the selected scene/overlay. Drop images or audio anywhere on the editor to add them as assets.

---

## Connect your AI

### Claude Code

```bash
claude mcp add clipai -- node /absolute/path/to/Clipai/packages/mcp/dist/index.js
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clipai": {
      "command": "node",
      "args": ["/absolute/path/to/Clipai/packages/mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. Keep the editor running (`pnpm start`) to see changes live. If the editor runs on another port, set `"env": { "CLIPAI_PORT": "4401" }`.

Then ask something like:

> Make a 30-second 16:9 promo for my app "TaskFlow". Dark theme, purple accent. Show the dashboard screenshot in a browser frame, highlight 3 features, end with the logo.

MCP tools (responses are kept short to save tokens): `list_blocks`, `get_block`, `list_projects`, `create_project`, `open_project`, `set_project`, `apply_ops`, `get_summary`, `get_project`, `add_asset`, `snapshot`, `export_video`. A first draft usually takes 3–4 tool calls; each edit is one `apply_ops` call. `snapshot` and `export_video` need the editor open in Chrome or Edge.

### Paste mode (any AI, no setup)

1. In the editor, click **Copy AI Prompt**. It copies a short guide with the project format and the block list.
2. Paste it into any AI chat with your video request.
3. Copy the JSON it returns, click **Import JSON**, paste. Done.

---

## Development

```text
packages/schema   types, Zod schemas, ops, validation, summary()
packages/engine   deterministic Canvas renderer, timing, animation helpers, font loader
packages/blocks   built-in blocks (one file per block)
packages/server   local server + CLI (REST, WebSocket, file store)
packages/mcp      MCP stdio server
apps/editor       React UI (Vite, Zustand, Tailwind)
examples/         demo projects (fictional brands only)
docs/             schema.md, blocks.md (plugin tutorial), ai-prompt.md
```

```bash
pnpm build             # build everything
pnpm test              # unit + API + MCP tests (Vitest)
pnpm test:e2e          # export smoke test in Chrome (Playwright)
pnpm lint
pnpm dev               # editor with hot reload (run `pnpm start` alongside for the API)
pnpm licenses:check    # fail on non-allowed dependency licenses
pnpm licenses:notice   # regenerate THIRD_PARTY_NOTICES.md
```

See [`docs/schema.md`](./docs/schema.md) for the project format and API, and [`docs/blocks.md`](./docs/blocks.md) to build your own block.

---

## License

The code in this repository is released under the **MIT License** — see [LICENSE](./LICENSE).

You may use, copy, modify, fork, and distribute it, for personal or commercial purposes, for free. **This applies to individuals and companies of any size.** No paid license from any third party is required to use this tool.

---

## Notices

### Independent rendering engine

Clipai uses its **own rendering engine** (HTML Canvas + WebCodecs). It does **not** include, bundle, or depend on Remotion or any other source-available video framework that requires a commercial license. Contributors must not add such dependencies (see [CONTRIBUTING](#contributing)).

### Third-party software

Clipai depends on open-source packages that keep their own licenses (MIT, ISC, BSD, Apache-2.0, or MPL-2.0). A full list is generated in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) with:

```bash
pnpm licenses:notice
```

FFmpeg is **not** bundled. Video encoding uses the browser's built-in WebCodecs API.

### Fonts and icons

Bundled fonts are licensed under the **SIL Open Font License 1.1** (e.g., Inter, Poppins, Hind Siliguri, Noto Sans Bengali). Icons are from **Lucide** (ISC License). Their license files are included in `assets/licenses/`.

### Your content

- Videos you create with Clipai belong to you. The project claims no ownership over your output.
- **You are responsible** for having the rights to any images, screenshots, logos, music, fonts, or other media you import into your projects.
- Demo templates use fictional product names and placeholder graphics only.

### Trademarks

"Claude" is a trademark of Anthropic. Clipai is an independent project and is **not affiliated with, endorsed by, or sponsored by Anthropic** or any other AI provider. Other product names mentioned are the property of their respective owners and are used only for identification.

### Privacy

Clipai runs entirely on your computer. It collects **no telemetry** and sends no data anywhere. The local server listens only on `127.0.0.1`. If you connect an AI assistant, your conversations with that assistant are handled under that provider's own terms and privacy policy.

### Plugins

Community blocks and plugins run code on your machine. Only install plugins you trust. Plugins are the responsibility of their authors and are not covered by this project's maintainers.

### No warranty

The software is provided **"as is"**, without warranty of any kind, as stated in the MIT License.

---

## Contributing

Contributions are welcome — especially new animation blocks.

Rules:
- Dependencies must use one of these licenses: **MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, MPL-2.0** (unmodified). CI blocks anything else.
- No GPL / AGPL / source-available or commercially restricted dependencies (this includes Remotion).
- Fonts must be OFL or similarly free to redistribute. No copyrighted music, images, or brand logos in the repo.
- By contributing, you agree your contribution is released under the MIT License.

See [`docs/blocks.md`](./docs/blocks.md) to build your own block.

---

## Credits

Created by [Ferdous Mikdad](https://ferdousmikdad.com).
