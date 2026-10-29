import { z } from "zod";
import { easings, font, rgba, spring, wrapText } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { drawBackdrop, enter, iconName } from "../shared.js";
import { drawCard, drawIconTile } from "../card.js";

export default defineBlock({
  id: "feature-callout",
  name: "Feature Callout",
  summary: "Icon + title + text card",
  category: "text",
  defaultDuration: 3,
  schema: z.object({
    title: z.string().describe("Feature name"),
    text: z.string().default("").describe("One-line description"),
    icon: iconName().default("sparkles"),
    eyebrow: z.string().default("").describe("Small label above the title, e.g. NEW"),
  }),
  defaults: { title: "Auto-sync", text: "Every device, instantly.", icon: "refresh-cw" },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    drawBackdrop(r);
    const portrait = r.orientation === "portrait";
    const cw = Math.min(w * (portrait ? 0.86 : 0.62), 1100 * unit);
    const pad = 64 * unit;
    const icon = 140 * unit;
    const titleSize = 76 * unit;
    const textSize = 38 * unit;
    ctx.font = font(400, textSize, theme.font);
    const textLines = p.text ? wrapText(ctx, p.text, cw - pad * 2) : [];
    const eyebrowH = p.eyebrow ? 50 * unit : 0;
    const ch = pad * 2 + icon + 40 * unit + eyebrowH + titleSize * 1.15 + (textLines.length ? 20 * unit + textLines.length * textSize * 1.35 : 0);
    const x = (w - cw) / 2;
    const y = (h - ch) / 2;

    const s = spring(t, { stiffness: 120, damping: 15 });
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 3);
    ctx.translate(0, (1 - s) * 80 * unit);
    drawCard(r, x, y, cw, ch);

    const ie = spring(t - 0.15, { stiffness: 180, damping: 12 });
    ctx.save();
    ctx.translate(w / 2, y + pad + icon / 2);
    ctx.scale(ie, ie);
    drawIconTile(r, p.icon, 0, 0, icon);
    ctx.restore();

    let cy = y + pad + icon + 40 * unit;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (p.eyebrow) {
      ctx.globalAlpha = enter(t, 0.25, 0.5);
      ctx.fillStyle = theme.secondary;
      ctx.font = font(700, 26 * unit, theme.font);
      ctx.fillText(p.eyebrow.toUpperCase(), w / 2, cy + 14 * unit);
      cy += eyebrowH;
    }
    const te = enter(t, 0.3, 0.6, easings.outExpo);
    ctx.globalAlpha = te;
    ctx.fillStyle = theme.text;
    ctx.font = font(800, titleSize, theme.font);
    ctx.fillText(p.title, w / 2, cy + titleSize * 0.55 + (1 - te) * 20 * unit, cw - pad * 2);
    cy += titleSize * 1.15 + 20 * unit;
    ctx.globalAlpha = enter(t, 0.45, 0.6);
    ctx.fillStyle = rgba(theme.text, 0.7);
    ctx.font = font(400, textSize, theme.font);
    textLines.forEach((l, i) => ctx.fillText(l, w / 2, cy + textSize * 1.35 * (i + 0.5)));
    ctx.restore();
  },
});
