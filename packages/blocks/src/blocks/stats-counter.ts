import { z } from "zod";
import { easings, font, interpolate, rgba, stagger } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { drawBackdrop, enter } from "../shared.js";

export default defineBlock({
  id: "stats-counter",
  name: "Stats Counter",
  summary: "Numbers count up",
  category: "data",
  defaultDuration: 3.5,
  schema: z.object({
    title: z.string().default("").describe("Optional heading"),
    items: z
      .array(
        z.object({
          value: z.number().describe("Final number"),
          prefix: z.string().default("").describe("e.g. $"),
          suffix: z.string().default("").describe("e.g. %, k, +"),
          label: z.string().default("").describe("Caption under the number"),
        }),
      )
      .min(1)
      .max(4)
      .describe("Stats"),
  }),
  defaults: {
    items: [
      { value: 10, suffix: "k+", label: "Teams" },
      { value: 99.9, suffix: "%", label: "Uptime" },
      { value: 4.9, suffix: "/5", label: "Rating" },
    ],
  },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    drawBackdrop(r, 0.8);
    const n = p.items.length;
    const portrait = r.orientation === "portrait";
    const headH = p.title ? 150 * unit : 0;
    const cellW = portrait ? w * 0.8 : (w * 0.86) / n;
    const cellH = portrait ? Math.min(300 * unit, (h * 0.7 - headH) / n) : 320 * unit;
    const totalH = headH + (portrait ? cellH * n : cellH);
    const y0 = (h - totalH) / 2 + headH;
    const numSize = Math.min(150 * unit, cellW * 0.32, cellH * 0.5);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (p.title) {
      ctx.globalAlpha = enter(t, 0, 0.5);
      ctx.fillStyle = theme.text;
      ctx.font = font(800, 64 * unit, theme.font);
      ctx.fillText(p.title, w / 2, y0 - headH / 2, w * 0.9);
      ctx.globalAlpha = 1;
    }
    const countEnd = Math.max(1, duration * 0.7);
    p.items.forEach((item, i) => {
      const cx = portrait ? w / 2 : (w - cellW * n) / 2 + cellW * (i + 0.5);
      const cy = portrait ? y0 + cellH * (i + 0.5) : y0 + cellH / 2;
      const appear = stagger(t, i, { start: 0.1, each: 0.15, duration: 0.5 });
      const q = interpolate(t, [0.1 + i * 0.15, countEnd], [0, 1], easings.outExpo);
      const decimals = (String(item.value).split(".")[1] ?? "").length;
      const shown = (item.value * q).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(0, (1 - easings.outCubic(appear)) * 40 * unit);
      const grad = ctx.createLinearGradient(cx - cellW / 2, 0, cx + cellW / 2, 0);
      grad.addColorStop(0, theme.primary);
      grad.addColorStop(1, theme.secondary);
      ctx.fillStyle = grad;
      ctx.font = font(800, numSize, theme.font);
      ctx.fillText(`${item.prefix}${shown}${item.suffix}`, cx, cy - numSize * 0.2, cellW * 0.95);
      if (item.label) {
        ctx.fillStyle = rgba(theme.text, 0.72);
        ctx.font = font(600, numSize * 0.26, theme.font);
        ctx.fillText(item.label, cx, cy + numSize * 0.55, cellW * 0.9);
      }
      ctx.restore();
    });
  },
});
