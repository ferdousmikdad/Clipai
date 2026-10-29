import { z } from "zod";
import { easings, fitFontSize, font, interpolate, rgba, spring, wrapText } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { color, drawBackdrop, enter, graphemes } from "../shared.js";

export default defineBlock({
  id: "title-reveal",
  name: "Title Reveal",
  summary: "Big title + subtitle animated in",
  category: "text",
  defaultDuration: 3,
  schema: z.object({
    title: z.string().describe("Main title"),
    subtitle: z.string().default("").describe("Smaller line under the title"),
    style: z.enum(["rise", "type", "scale"]).default("rise").describe("Entrance animation"),
    align: z.enum(["center", "left"]).default("center").describe("Text alignment"),
    titleColor: color("Title color (default theme text)"),
    accentColor: color("Accent bar color (default theme primary)"),
  }),
  defaults: { title: "Your big idea", subtitle: "A short, punchy subtitle" },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    drawBackdrop(r);
    const left = p.align === "left";
    const maxW = w * (r.orientation === "portrait" ? 0.84 : 0.76);
    const x = left ? (w - maxW) / 2 : w / 2;
    const titleSize = fitFontSize(ctx, p.title, (s) => font(800, s, theme.font), maxW, 130 * unit, 3);
    const titleLines = wrapText(ctx, p.title, maxW);
    const lh = titleSize * 1.12;
    const subSize = 44 * unit;
    const gap = 32 * unit;
    const blockH = titleLines.length * lh + (p.subtitle ? gap + subSize * 1.3 : 0);
    let y = h / 2 - blockH / 2;

    ctx.textAlign = left ? "left" : "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.titleColor ?? theme.text;

    if (p.style === "type") {
      const chars = graphemes(p.title);
      const typed = Math.floor(interpolate(t, [0.1, 0.1 + Math.min(1.6, chars.length * 0.05)], [0, chars.length]));
      let remaining = typed;
      ctx.font = font(800, titleSize, theme.font);
      let cursorX = x;
      let cursorY = y + lh / 2;
      titleLines.forEach((line, i) => {
        const g = graphemes(line);
        const shown = g.slice(0, Math.max(0, remaining)).join("");
        remaining -= g.length + 1;
        const ly = y + lh * (i + 0.5);
        ctx.fillText(shown, x, ly);
        if (shown.length || i === 0) {
          const mw = ctx.measureText(shown).width;
          cursorX = left ? x + mw : x + mw / 2;
          cursorY = ly;
        }
      });
      if (Math.floor(t * 2.5) % 2 === 0 || typed < chars.length) {
        ctx.fillStyle = p.accentColor ?? theme.primary;
        ctx.fillRect(cursorX + 8 * unit, cursorY - titleSize * 0.45, 8 * unit, titleSize * 0.9);
      }
    } else {
      titleLines.forEach((line, i) => {
        const d = 0.08 + i * 0.12;
        ctx.save();
        const ly = y + lh * (i + 0.5);
        if (p.style === "scale") {
          const s = spring(t - d, { stiffness: 140, damping: 14 });
          ctx.globalAlpha = Math.min(1, Math.max(0, (t - d) * 4));
          ctx.translate(x, ly);
          ctx.scale(0.6 + 0.4 * s, 0.6 + 0.4 * s);
          ctx.translate(-x, -ly);
        } else {
          const e = enter(t, d, 0.7, easings.outExpo);
          ctx.globalAlpha = e;
          ctx.translate(0, (1 - e) * 60 * unit);
        }
        ctx.font = font(800, titleSize, theme.font);
        ctx.fillText(line, x, ly);
        ctx.restore();
      });
    }
    y += titleLines.length * lh;

    if (p.subtitle) {
      const e = enter(t, 0.5, 0.7);
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(0, (1 - e) * 24 * unit);
      ctx.font = font(400, subSize, theme.font);
      ctx.fillStyle = rgba(p.titleColor ?? theme.text, 0.72);
      ctx.fillText(p.subtitle, x, y + gap + subSize * 0.65, maxW);
      ctx.restore();
    }

    const bar = enter(t, 0.35, 0.8, easings.outExpo);
    const barW = 120 * unit * bar;
    ctx.fillStyle = p.accentColor ?? theme.primary;
    const by = h / 2 - blockH / 2 - 40 * unit;
    ctx.fillRect(left ? x : x - barW / 2, by, barW, 8 * unit);
  },
});
