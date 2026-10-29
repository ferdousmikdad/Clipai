import { linearGradient, mix, rgba, roundedRect, withShadow, type RenderArgs } from "@clipai/engine";
import { drawIcon } from "./shared.js";

/** Glassy card surface in theme colors. */
export function drawCard(r: RenderArgs<unknown>, x: number, y: number, w: number, h: number, highlight = false): void {
  const { ctx, theme, unit } = r;
  const radius = theme.radius * unit * 1.5;
  withShadow(ctx, "rgba(0,0,0,0.35)", 40 * unit, 16 * unit, () => {
    ctx.fillStyle = mix(theme.background, theme.text, 0.06);
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fill();
  });
  ctx.strokeStyle = highlight ? theme.primary : rgba(theme.text, 0.1);
  ctx.lineWidth = (highlight ? 3 : 1.5) * unit;
  roundedRect(ctx, x, y, w, h, radius);
  ctx.stroke();
}

/** Rounded gradient tile with a Lucide icon. */
export function drawIconTile(r: RenderArgs<unknown>, name: string, cx: number, cy: number, size: number): void {
  const { ctx, theme } = r;
  ctx.fillStyle = linearGradient(ctx, cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2, [theme.primary, theme.secondary]);
  roundedRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.28);
  ctx.fill();
  drawIcon(ctx, name, cx, cy, size * 0.52, "#FFFFFF", 2.2);
}
