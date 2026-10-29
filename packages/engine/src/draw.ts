import type { Ctx2D, ImageLike } from "./types.js";

export function roundedRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number | number[]): void {
  const radii = Array.isArray(r) ? r : [r, r, r, r];
  const [tl, tr, br, bl] = radii.map((v) => Math.max(0, Math.min(v ?? 0, w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

export function withShadow(ctx: Ctx2D, color: string, blur: number, offsetY = 0, fn: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  fn();
  ctx.restore();
}

export function linearGradient(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, stops: string[]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return g;
}

export function radialGradient(ctx: Ctx2D, x: number, y: number, r: number, stops: string[]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return g;
}

/** Draw an image into a box with cover or contain fit. */
export function drawImageFit(
  ctx: Ctx2D,
  img: ImageLike,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "cover" | "contain" = "cover",
  align: { x?: number; y?: number } = {},
): void {
  const iw = img.width || 1;
  const ih = img.height || 1;
  const scale = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ax = align.x ?? 0.5;
  const ay = align.y ?? 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) * ax, y + (h - dh) * ay, dw, dh);
  ctx.restore();
}

/** Segment text into words, keeping Bangla clusters intact (split on whitespace only). */
function words(text: string): string[] {
  return text.split(/(\s+)/).filter((w) => w.length > 0);
}

/** Wrap text into lines that fit `maxWidth` using the current ctx.font. Respects \n. */
export function wrapText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const w of words(paragraph)) {
      const test = line + w;
      if (line.trim() && ctx.measureText(test.trimEnd()).width > maxWidth && !/^\s+$/.test(w)) {
        out.push(line.trimEnd());
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line.trim());
  }
  return out;
}

export type TextBlockOptions = {
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  align?: CanvasTextAlign;
  /** Vertical anchor of the whole block. */
  baseline?: "top" | "middle" | "bottom";
};

/** Draw wrapped text. Returns the block height. */
export function drawTextBlock(ctx: Ctx2D, text: string, o: TextBlockOptions): { lines: string[]; height: number } {
  const lines = wrapText(ctx, text, o.maxWidth);
  const height = lines.length * o.lineHeight;
  const top = o.baseline === "middle" ? o.y - height / 2 : o.baseline === "bottom" ? o.y - height : o.y;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, o.x, top + o.lineHeight * (i + 0.5)));
  return { lines, height };
}

/** Largest font size (≤ max) at which `text` wraps into at most `maxLines` lines within maxWidth. */
export function fitFontSize(
  ctx: Ctx2D,
  text: string,
  fontAt: (size: number) => string,
  maxWidth: number,
  max: number,
  maxLines = 2,
  min = 12,
): number {
  let size = max;
  while (size > min) {
    ctx.font = fontAt(size);
    const lines = wrapText(ctx, text, maxWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= maxLines && widest <= maxWidth) break;
    size *= 0.92;
  }
  ctx.font = fontAt(size);
  return size;
}
