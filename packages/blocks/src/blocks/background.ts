import { z } from "zod";
import { font, linearGradient, radialGradient, rgba } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { color, enter } from "../shared.js";

export default defineBlock({
  id: "background",
  name: "Background",
  summary: "Gradient/mesh/grid animated background (usable as scene)",
  category: "background",
  defaultDuration: 3,
  schema: z.object({
    style: z.enum(["gradient", "mesh", "grid", "dots"]).default("mesh").describe("Background style"),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{3,8}$/)).max(4).default([]).describe("Up to 4 hex colors (default theme)"),
    text: z.string().default("").describe("Optional centered text"),
    textColor: color("Text color"),
  }),
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    const cols = p.colors.length ? p.colors : [theme.primary, theme.secondary, theme.background];
    const m = Math.max(w, h);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    if (p.style === "gradient") {
      const a = t * 0.3;
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = linearGradient(ctx, cx - Math.cos(a) * m, cy - Math.sin(a) * m, cx + Math.cos(a) * m, cy + Math.sin(a) * m, cols);
      ctx.fillRect(0, 0, w, h);
    } else if (p.style === "mesh") {
      cols.forEach((c, i) => {
        const ph = i * 2.1;
        const x = w * (0.5 + 0.38 * Math.sin(t * 0.35 + ph));
        const y = h * (0.5 + 0.38 * Math.cos(t * 0.3 + ph * 1.3));
        ctx.fillStyle = radialGradient(ctx, x, y, m * 0.65, [rgba(c, 0.55), rgba(c, 0)]);
        ctx.fillRect(0, 0, w, h);
      });
    } else {
      ctx.fillStyle = radialGradient(ctx, w / 2, h / 2, m * 0.7, [rgba(cols[0], 0.25), rgba(cols[0], 0)]);
      ctx.fillRect(0, 0, w, h);
      const step = 64 * unit;
      const off = (t * 20 * unit) % step;
      if (p.style === "grid") {
        ctx.strokeStyle = rgba(theme.text, 0.08);
        ctx.lineWidth = 1.5 * unit;
        ctx.beginPath();
        for (let x = -step + off; x < w + step; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = -step + off; y < h + step; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      } else {
        for (let x = -step + off; x < w + step; x += step) {
          for (let y = -step + off; y < h + step; y += step) {
            const d = Math.hypot(x - w / 2, y - h / 2) / m;
            ctx.fillStyle = rgba(theme.text, Math.max(0.03, 0.22 - d * 0.3));
            ctx.beginPath();
            ctx.arc(x, y, 2.5 * unit, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    if (p.text) {
      ctx.globalAlpha = enter(t, 0.1, 0.6);
      ctx.fillStyle = p.textColor ?? theme.text;
      ctx.font = font(800, 96 * unit, theme.font);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, w / 2, h / 2, w * 0.9);
    }
  },
});
