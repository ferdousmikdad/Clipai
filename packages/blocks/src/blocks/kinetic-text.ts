import { z } from "zod";
import { fitFontSize, font, spring } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { color, drawBackdrop } from "../shared.js";

export default defineBlock({
  id: "kinetic-text",
  name: "Kinetic Text",
  summary: "Words/lines pop in one by one",
  category: "text",
  defaultDuration: 4,
  schema: z.object({
    lines: z.array(z.string()).min(1).max(8).describe("Lines shown in order"),
    emphasis: z.array(z.string()).default([]).describe("Words to highlight in the primary color"),
    mode: z.enum(["stack", "replace"]).default("stack").describe("stack: lines accumulate; replace: one line at a time"),
    textColor: color("Text color (default theme text)"),
    emphasisColor: color("Highlight color (default theme primary)"),
  }),
  defaults: { lines: ["Plan less.", "Ship more.", "Smile often."], emphasis: ["Ship"] },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    drawBackdrop(r, 0.7);
    const n = p.lines.length;
    const slot = Math.max(0.25, (duration * 0.8) / n);
    const maxW = w * 0.84;
    const longest = p.lines.reduce((a, b) => (b.length > a.length ? b : a), "");
    const size = fitFontSize(ctx, longest, (s) => font(800, s, theme.font), maxW, (p.mode === "replace" ? 150 : 110) * unit, 1);
    const lh = size * 1.18;
    const emph = new Set(p.emphasis.map((e) => e.toLowerCase()));
    const active = Math.min(n - 1, Math.floor(t / slot));

    const visible = p.mode === "replace" ? [active] : p.lines.map((_, i) => i).filter((i) => t >= i * slot);
    const top = p.mode === "replace" ? h / 2 - lh / 2 : h / 2 - (n * lh) / 2;

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    visible.forEach((i, row) => {
      const s = spring(t - i * slot, { stiffness: 220, damping: 16 });
      const cy = top + lh * ((p.mode === "replace" ? row : i) + 0.5);
      ctx.font = font(800, size, theme.font);
      const words = p.lines[i].split(/(\s+)/);
      const total = ctx.measureText(p.lines[i]).width;
      ctx.save();
      ctx.translate(w / 2, cy);
      ctx.scale(0.4 + 0.6 * s, 0.4 + 0.6 * s);
      ctx.globalAlpha = Math.min(1, s * 1.5);
      let x = -total / 2;
      for (const word of words) {
        const clean = word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
        ctx.fillStyle = clean && emph.has(clean) ? (p.emphasisColor ?? theme.primary) : (p.textColor ?? theme.text);
        ctx.fillText(word, x, 0);
        x += ctx.measureText(word).width;
      }
      ctx.restore();
    });
  },
});
