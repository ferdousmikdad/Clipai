import { z } from "zod";
import { font, interpolate, rgba, roundedRect, wrapText } from "@clipai/engine";
import { defineBlock } from "../define.js";

export default defineBlock({
  id: "captions",
  name: "Captions",
  summary: "Subtitle lines with timing",
  category: "overlay",
  defaultDuration: 6,
  schema: z.object({
    lines: z
      .array(z.object({ text: z.string(), start: z.number().min(0).describe("Seconds from overlay start"), end: z.number().positive() }))
      .min(1)
      .describe("Caption lines"),
    style: z.enum(["box", "outline", "bold"]).default("box").describe("Look"),
    position: z.enum(["bottom", "middle", "top"]).default("bottom").describe("Vertical position"),
  }),
  defaults: {
    lines: [
      { text: "This is Clipai.", start: 0, end: 2 },
      { text: "Videos made by AI, on your machine.", start: 2, end: 5 },
    ],
  },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    const line = p.lines.find((l) => t >= l.start && t < l.end);
    if (!line) return;
    const fade = Math.min(interpolate(t, [line.start, line.start + 0.15]), interpolate(t, [line.end - 0.15, line.end], [1, 0]));
    const size = (p.style === "bold" ? 60 : 46) * unit;
    ctx.font = font(p.style === "bold" ? 800 : 600, size, theme.font);
    const lines = wrapText(ctx, line.text, w * 0.8);
    const lh = size * 1.3;
    const blockH = lines.length * lh;
    const cy = p.position === "top" ? h * 0.12 + blockH / 2 : p.position === "middle" ? h / 2 : h * (r.orientation === "portrait" ? 0.78 : 0.86) - blockH / 2;
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((l, i) => {
      const y = cy - blockH / 2 + lh * (i + 0.5);
      const tw = ctx.measureText(l).width;
      if (p.style === "box") {
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        roundedRect(ctx, w / 2 - tw / 2 - 20 * unit, y - lh / 2 + 2 * unit, tw + 40 * unit, lh - 4 * unit, 10 * unit);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
      } else {
        ctx.lineJoin = "round";
        ctx.lineWidth = (p.style === "bold" ? 12 : 8) * unit;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(l, w / 2, y);
        ctx.fillStyle = p.style === "bold" ? "#FFFFFF" : rgba("#FFFFFF", 1);
      }
      ctx.fillText(l, w / 2, y);
    });
    ctx.globalAlpha = 1;
  },
});
