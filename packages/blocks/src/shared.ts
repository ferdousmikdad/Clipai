import { z } from "zod";
import { icons } from "lucide";
import {
  easings,
  interpolate,
  radialGradient,
  rgba,
  roundedRect,
  type Ctx2D,
  type RenderArgs,
} from "@clipai/engine";

// ---------- prop helpers (metadata drives the editor's auto-generated forms) ----------

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Optional color override; empty = use theme. */
export const color = (description: string) =>
  z.string().regex(HEX, "expected hex color").meta({ format: "color", description }).optional();

/** Reference to an asset id in project.assets. */
export const assetRef = (description: string) => z.string().meta({ format: "asset", description });

/** Lucide icon name in kebab-case, e.g. "refresh-cw". */
export const iconName = (description = "Lucide icon name, e.g. refresh-cw") =>
  z.string().meta({ format: "icon", description });

export const point = z.object({
  x: z.number().min(0).max(1).describe("0-1 from left"),
  y: z.number().min(0).max(1).describe("0-1 from top"),
});

// ---------- icons ----------

type IconNode = [string, Record<string, string | number>][];
const iconMap = icons as unknown as Record<string, IconNode>;
const pathCache = new Map<string, Path2D>();

export const toPascal = (name: string) =>
  name
    .trim()
    .split(/[-_\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

export function hasIcon(name: string): boolean {
  return !!iconMap[toPascal(name)];
}

export const ICON_NAMES: string[] = Object.keys(iconMap).map((n) =>
  n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase(),
);

function nodeToPath(tag: string, a: Record<string, string | number>): Path2D {
  const n = (k: string) => Number(a[k] ?? 0);
  if (tag === "path") return new Path2D(String(a.d));
  const p = new Path2D();
  switch (tag) {
    case "circle":
      p.arc(n("cx"), n("cy"), n("r"), 0, Math.PI * 2);
      break;
    case "ellipse":
      p.ellipse(n("cx"), n("cy"), n("rx"), n("ry"), 0, 0, Math.PI * 2);
      break;
    case "line":
      p.moveTo(n("x1"), n("y1"));
      p.lineTo(n("x2"), n("y2"));
      break;
    case "rect": {
      const r = n("rx");
      const x = n("x"), y = n("y"), w = n("width"), h = n("height");
      if (r) p.roundRect(x, y, w, h, r);
      else p.rect(x, y, w, h);
      break;
    }
    case "polyline":
    case "polygon": {
      const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, pts[i], pts[i + 1]);
      if (tag === "polygon") p.closePath();
      break;
    }
  }
  return p;
}

/** Draw a Lucide icon centered at (cx, cy). Unknown names fall back to "sparkles". */
export function drawIcon(ctx: Ctx2D, name: string, cx: number, cy: number, size: number, stroke: string, strokeWidth = 2, fill?: string): void {
  const key = iconMap[toPascal(name)] ? toPascal(name) : "Sparkles";
  let path = pathCache.get(key);
  if (!path) {
    path = new Path2D();
    for (const [tag, attrs] of iconMap[key] ?? []) path.addPath(nodeToPath(tag, attrs));
    pathCache.set(key, path);
  }
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  ctx.stroke(path);
  ctx.restore();
}

// ---------- scene helpers ----------

/** Soft animated glow backdrop in theme colors. Deterministic in t. */
export function drawBackdrop(r: RenderArgs<unknown>, strength = 1): void {
  const { ctx, width: w, height: h, theme, t } = r;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, w, h);
  if (strength <= 0) return;
  const m = Math.max(w, h);
  const ax = w * (0.2 + 0.05 * Math.sin(t * 0.5));
  const ay = h * (0.15 + 0.05 * Math.cos(t * 0.4));
  ctx.fillStyle = radialGradient(ctx, ax, ay, m * 0.6, [rgba(theme.primary, 0.28 * strength), rgba(theme.primary, 0)]);
  ctx.fillRect(0, 0, w, h);
  const bx = w * (0.85 + 0.05 * Math.cos(t * 0.45));
  const by = h * (0.9 + 0.04 * Math.sin(t * 0.35));
  ctx.fillStyle = radialGradient(ctx, bx, by, m * 0.55, [rgba(theme.secondary, 0.2 * strength), rgba(theme.secondary, 0)]);
  ctx.fillRect(0, 0, w, h);
}

/** Eased 0..1 entrance progress that starts at `delay` and lasts `dur` seconds. */
export const enter = (t: number, delay = 0, dur = 0.6, easing = easings.outCubic) =>
  interpolate(t, [delay, delay + dur], [0, 1], easing);

/** Checkerboard placeholder for a missing image. */
export function drawPlaceholder(r: RenderArgs<unknown>, x: number, y: number, w: number, h: number, label = "Add a screenshot"): void {
  const { ctx, theme, unit } = r;
  ctx.save();
  roundedRect(ctx, x, y, w, h, 0);
  ctx.clip();
  ctx.fillStyle = rgba(theme.text, 0.05);
  ctx.fillRect(x, y, w, h);
  const step = 40 * unit;
  ctx.fillStyle = rgba(theme.text, 0.04);
  for (let i = 0; i * step < w; i++) for (let j = 0; j * step < h; j++) if ((i + j) % 2 === 0) ctx.fillRect(x + i * step, y + j * step, step, step);
  ctx.fillStyle = rgba(theme.text, 0.45);
  ctx.font = `600 ${Math.round(28 * unit)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

/** Split text into grapheme clusters (keeps Bangla conjuncts together). */
export function graphemes(text: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s: any) => s.segment as string);
  return Array.from(text);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => graphemes(p)[0] ?? "")
    .join("")
    .toUpperCase();
