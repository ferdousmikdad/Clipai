# Building a block

Blocks are the animation building blocks of Clipai. The AI (or the user) only picks a block and fills in its props; the block does all the drawing. A block is one file with a Zod schema and a `render` function that draws one frame on a Canvas 2D context.

## The interface

```ts
type BlockDefinition<P> = {
  id: string; // kebab-case, unique
  name: string; // shown in the Blocks panel
  summary: string; // ONE short line, shown to the AI
  category: "text" | "ui" | "data" | "brand" | "background" | "overlay";
  defaultDuration: number; // seconds
  schema: z.ZodType<P>; // .describe() every field (short) — the editor builds its form from it
  defaults: P; // example props, used when the block is added from the panel
  render(r: RenderArgs<P>): void;
};

type RenderArgs<P> = {
  ctx: CanvasRenderingContext2D; // draw here
  props: P; // already validated, defaults applied
  theme: Theme; // project colors, font, radius
  t: number; // seconds since the scene started
  progress: number; // t / duration, clamped 0..1
  duration: number;
  width: number;
  height: number; // canvas size in pixels
  unit: number; // min(width, height) / 1080 — multiply sizes by it
  orientation: "landscape" | "portrait" | "square";
  assets: { get(id): ImageLike | undefined };
  random: () => number; // seeded per scene — never use Math.random()
  project: Project;
};
```

## Rules

1. **Deterministic.** `render` must draw exactly the same pixels for the same inputs. No `Date.now()`, no `Math.random()`, no state kept between frames. Preview and export use the same renderer, frame by frame.
2. **Use the theme.** Default to `theme.primary`, `theme.text`, `theme.font`… Let props override colors when useful.
3. **Scale with `unit`.** Write sizes as if the canvas were 1080 px on its short side (`48 * unit`). Then the block looks the same at 720p and 1080p.
4. **Work in every format.** Check `r.orientation` and lay out for 16:9, 9:16 and 1:1.
5. **Hold the final pose.** During an outgoing transition `t` keeps growing past `duration`; clamp your animations.
6. **Describe every prop** with a short `.describe()`. Give props defaults so the AI can send as little as possible.

Helpers available (from `@clipai/engine` / `@clipai/blocks`, and passed to plugins): `interpolate`, `easings`, `spring`, `stagger`, `enter`, `font`, `fitFontSize`, `wrapText`, `drawTextBlock`, `roundedRect`, `withShadow`, `linearGradient`, `radialGradient`, `drawImageFit`, `rgba`, `mix`, `contrastText`, `drawBackdrop`, `drawIcon` (Lucide), `drawCard`, `drawIconTile`, `drawFrame`, `drawPlaceholder`, `graphemes`.

Special prop metadata drives the editor's form widgets: `.meta({ format: "color" })`, `.meta({ format: "asset" })` (an asset id; also keys named `asset` or ending in `Asset` are checked against the project's assets) and `.meta({ format: "icon" })`.

## Built-in block

Add a file to `packages/blocks/src/blocks/` and register it in `packages/blocks/src/index.ts`:

```ts
import { z } from "zod";
import { font, spring } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { drawBackdrop } from "../shared.js";

export default defineBlock({
  id: "big-number",
  name: "Big Number",
  summary: "One huge number with a label",
  category: "data",
  defaultDuration: 3,
  schema: z.object({
    value: z.string().describe("e.g. 10x"),
    label: z.string().default("").describe("Caption under the number"),
  }),
  defaults: { value: "10x", label: "faster" },
  render(r) {
    const { ctx, props, theme, t, width, height, unit } = r;
    drawBackdrop(r);
    const s = spring(t);
    ctx.fillStyle = theme.primary;
    ctx.font = font(800, 300 * unit * s, theme.font);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(props.value, width / 2, height / 2);
  },
});
```

Then add a demo scene to one of the projects in `examples/` (a test checks that every block has one) and run `pnpm test`.

## Plugin block (no core changes)

Plugins are plain ES modules. Their default export is a function that receives the plugin API and returns a block definition (or an array of them). No imports are needed, so the same file runs in the server (validation) and in the editor (rendering).

Try the sample:

```bash
cp docs/sample-plugin/countdown.js blocks/
pnpm start
```

"Countdown" now shows up in the Blocks panel (marked *plugin*), in `list_blocks` for the AI, and in the paste-mode prompt.

```js
// blocks/countdown.js
export default ({ z, defineBlock, font, spring, drawBackdrop }) =>
  defineBlock({
    id: "countdown",
    name: "Countdown",
    summary: "Numbers count down to a launch message",
    category: "text",
    defaultDuration: 4,
    schema: z.object({
      from: z.number().int().min(1).max(10).default(3).describe("Start number"),
      message: z.string().default("Launch!").describe("Shown after zero"),
    }),
    render(r) {
      /* draw with r.ctx */
    },
  });
```

Plugins can also come from npm packages: install the package next to Clipai and list it in `clipai.config.json`:

```json
{ "plugins": ["clipai-block-confetti"] }
```

The package's main file must be a single ES module with the same default export.

> **Plugins run code on your machine.** Only install plugins you trust. The editor shows a warning listing loaded plugin blocks.
