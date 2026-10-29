import { z } from "zod";
import { easings, font, interpolate, rgba, stagger, wrapText } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { drawBackdrop, enter, iconName } from "../shared.js";
import { drawCard, drawIconTile } from "../card.js";

export default defineBlock({
  id: "feature-grid",
  name: "Feature Grid",
  summary: "2–6 feature cards appear staggered",
  category: "text",
  defaultDuration: 4,
  schema: z.object({
    title: z.string().default("").describe("Optional heading above the grid"),
    items: z
      .array(z.object({ icon: iconName().default("check"), title: z.string(), text: z.string().default("") }))
      .min(2)
      .max(6)
      .describe("Feature cards"),
  }),
  defaults: {
    title: "Everything you need",
    items: [
      { icon: "zap", title: "Fast", text: "Loads in a blink." },
      { icon: "shield-check", title: "Secure", text: "Private by default." },
      { icon: "refresh-cw", title: "Synced", text: "On every device." },
    ],
  },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    drawBackdrop(r, 0.8);
    const n = p.items.length;
    const portrait = r.orientation === "portrait";
    const cols = portrait ? (n > 3 ? 2 : 1) : n === 4 ? 2 : Math.min(3, n);
    const rows = Math.ceil(n / cols);
    const headH = p.title ? 140 * unit : 0;
    const gap = 32 * unit;
    const areaW = w * (portrait ? 0.88 : 0.86);
    const areaH = (h - headH) * 0.8;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = Math.min((areaH - gap * (rows - 1)) / rows, cw * 0.9);
    const totalH = headH + rows * ch + (rows - 1) * gap;
    const x0 = (w - areaW) / 2;
    const y0 = (h - totalH) / 2 + headH;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (p.title) {
      const e = enter(t, 0, 0.6, easings.outExpo);
      ctx.globalAlpha = e;
      ctx.fillStyle = theme.text;
      ctx.font = font(800, 68 * unit, theme.font);
      ctx.fillText(p.title, w / 2, y0 - headH / 2 + (1 - e) * 20 * unit, w * 0.9);
      ctx.globalAlpha = 1;
    }

    const icon = Math.min(110 * unit, ch * 0.32);
    const tSize = Math.min(44 * unit, ch * 0.13);
    const dSize = Math.min(30 * unit, ch * 0.095);
    p.items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? n - row * cols : cols;
      const rowOffset = ((cols - inRow) * (cw + gap)) / 2;
      const x = x0 + rowOffset + col * (cw + gap);
      const y = y0 + row * (ch + gap);
      const q = stagger(t, i, { start: 0.2, each: 0.15, duration: 0.6 });
      const e = easings.outBack(q);
      ctx.save();
      ctx.globalAlpha = interpolate(q, [0, 0.4]);
      ctx.translate(0, (1 - e) * 60 * unit);
      drawCard(r, x, y, cw, ch);
      const cx = x + cw / 2;
      const top = y + ch * 0.12;
      drawIconTile(r, item.icon, cx, top + icon / 2, icon);
      ctx.fillStyle = theme.text;
      ctx.font = font(700, tSize, theme.font);
      ctx.fillText(item.title, cx, top + icon + tSize * 1.1, cw - 40 * unit);
      if (item.text) {
        ctx.fillStyle = rgba(theme.text, 0.68);
        ctx.font = font(400, dSize, theme.font);
        wrapText(ctx, item.text, cw - 48 * unit)
          .slice(0, 3)
          .forEach((l, j) => ctx.fillText(l, cx, top + icon + tSize * 1.9 + dSize * 1.35 * (j + 0.5)));
      }
      ctx.restore();
    });
  },
});
