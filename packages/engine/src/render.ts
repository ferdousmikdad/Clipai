import { frameAt, type Project, type Scene, type Overlay, type Theme } from "@clipai/schema";
import type { BlockDefinition, BlockRegistry, Ctx2D, LoadedAssets, RenderArgs } from "./types.js";
import { easings } from "./easing.js";
import { seededRandom } from "./random.js";
import { font } from "./fonts.js";
import { rgba } from "./color.js";

const propsCache = new WeakMap<object, unknown>();

/** Block props with schema defaults applied. Falls back to defaults merged with raw props if invalid. */
export function resolveProps(def: BlockDefinition, props: Record<string, unknown>): any {
  const hit = propsCache.get(props);
  if (hit) return hit;
  const parsed = def.schema.safeParse(props);
  const value = parsed.success ? parsed.data : { ...def.defaults, ...props };
  propsCache.set(props, value);
  return value;
}

type Layer = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx2D };
const layers = new Map<string, Layer[]>();

function getLayers(w: number, h: number): Layer[] {
  const key = `${w}x${h}`;
  let l = layers.get(key);
  if (!l) {
    l = [0, 1].map(() => {
      const canvas =
        typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
      return { canvas, ctx: canvas.getContext("2d") as Ctx2D };
    });
    layers.set(key, l);
  }
  return l;
}

export type RenderOptions = {
  /** Drawn when a block id is unknown (e.g. a missing plugin). */
  onMissingBlock?: (id: string) => void;
};

/**
 * Render one frame. Pure and deterministic: same project + time + assets → same pixels.
 * Canvas size can be anything with the project's aspect ratio; blocks scale with `unit`.
 */
export function renderFrame(
  ctx: Ctx2D,
  project: Project,
  time: number,
  assets: LoadedAssets,
  registry: BlockRegistry,
  options: RenderOptions = {},
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const state = frameAt(project, time);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = project.theme.background;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const drawScene = (target: Ctx2D, scene: Scene, t: number) =>
    drawItem(target, project, scene, scene.duration, t, assets, registry, options, width, height);

  if (state.current && state.previous) {
    const [a, b] = getLayers(width, height);
    for (const l of [a, b]) {
      l.ctx.setTransform(1, 0, 0, 1, 0, 0);
      l.ctx.globalAlpha = 1;
      l.ctx.fillStyle = project.theme.background;
      l.ctx.fillRect(0, 0, width, height);
    }
    drawScene(a.ctx, state.previous.scene, state.previous.t);
    drawScene(b.ctx, state.current.scene, state.current.t);
    composite(ctx, a.canvas, b.canvas, state.current.scene.transition?.type ?? "fade", easings.inOutCubic(state.transitionProgress), width, height);
  } else if (state.current) {
    drawScene(ctx, state.current.scene, state.current.t);
  }

  for (const { overlay, t } of state.overlays) {
    drawItem(ctx, project, overlay, overlay.end - overlay.start, t, assets, registry, options, width, height);
  }
}

function drawItem(
  ctx: Ctx2D,
  project: Project,
  item: Scene | Overlay,
  duration: number,
  t: number,
  assets: LoadedAssets,
  registry: BlockRegistry,
  options: RenderOptions,
  width: number,
  height: number,
): void {
  const def = registry.get(item.block);
  ctx.save();
  if (!def) {
    options.onMissingBlock?.(item.block);
    drawMissing(ctx, project.theme, item.block, width, height);
  } else {
    const args: RenderArgs<unknown> = {
      ctx,
      props: resolveProps(def, item.props),
      theme: project.theme,
      t,
      progress: Math.min(1, Math.max(0, t / duration)),
      duration,
      width,
      height,
      unit: Math.min(width, height) / 1080,
      orientation: width > height * 1.05 ? "landscape" : height > width * 1.05 ? "portrait" : "square",
      assets,
      random: seededRandom(item.id),
      project,
    };
    try {
      def.render(args);
    } catch (err) {
      ctx.restore();
      ctx.save();
      drawMissing(ctx, project.theme, `${item.block}: ${(err as Error).message}`, width, height);
    }
  }
  ctx.restore();
}

function drawMissing(ctx: Ctx2D, theme: Theme, label: string, w: number, h: number) {
  const u = Math.min(w, h) / 1080;
  ctx.fillStyle = rgba(theme.text, 0.06);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(theme.text, 0.7);
  ctx.font = font(600, 32 * u, theme.font);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Missing block: ${label}`, w / 2, h / 2);
}

function composite(
  ctx: Ctx2D,
  from: CanvasImageSource,
  to: CanvasImageSource,
  type: string,
  p: number,
  w: number,
  h: number,
): void {
  ctx.save();
  switch (type) {
    case "slide":
      ctx.drawImage(from, -p * w, 0);
      ctx.drawImage(to, (1 - p) * w, 0);
      break;
    case "zoom": {
      ctx.globalAlpha = 1 - p;
      const s1 = 1 + 0.15 * p;
      ctx.drawImage(from, (w - w * s1) / 2, (h - h * s1) / 2, w * s1, h * s1);
      ctx.globalAlpha = p;
      const s2 = 0.85 + 0.15 * p;
      ctx.drawImage(to, (w - w * s2) / 2, (h - h * s2) / 2, w * s2, h * s2);
      break;
    }
    case "wipe":
      ctx.drawImage(from, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, w * p, h);
      ctx.clip();
      ctx.drawImage(to, 0, 0);
      break;
    case "none":
      ctx.drawImage(to, 0, 0);
      break;
    default:
      ctx.drawImage(from, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(to, 0, 0);
  }
  ctx.restore();
}
