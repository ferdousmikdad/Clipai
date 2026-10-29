import { z } from "zod";
import { drawImageFit, easings, fitFontSize, font, linearGradient, rgba, wrapText } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { assetRef, drawBackdrop, drawIcon, enter, initials } from "../shared.js";

export default defineBlock({
  id: "testimonial",
  name: "Testimonial",
  summary: "Quote + name + role (fictional in demos)",
  category: "text",
  defaultDuration: 4.5,
  schema: z.object({
    quote: z.string().describe("The quote, without quote marks"),
    name: z.string().default("").describe("Person's name"),
    role: z.string().default("").describe("Role / company"),
    avatarAsset: assetRef("Optional avatar image asset id").optional(),
    rating: z.number().int().min(0).max(5).default(0).describe("Stars 0-5 (0 hides)"),
  }),
  defaults: { quote: "We shipped our launch video in an afternoon.", name: "Rina Das", role: "Founder, Northwind Labs", rating: 5 },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    drawBackdrop(r, 0.7);
    const maxW = w * (r.orientation === "portrait" ? 0.84 : 0.7);
    const size = fitFontSize(ctx, p.quote, (s) => font(600, s, theme.font), maxW, 64 * unit, 5, 24 * unit);
    const lines = wrapText(ctx, p.quote, maxW);
    const lh = size * 1.35;
    const quoteH = lines.length * lh;
    const avatar = 110 * unit;
    const totalH = 120 * unit + quoteH + 60 * unit + avatar;
    let y = (h - totalH) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = enter(t, 0, 0.5);
    ctx.fillStyle = theme.primary;
    ctx.font = font(800, 220 * unit, "Poppins");
    ctx.fillText("“", w / 2, y + 90 * unit);
    ctx.globalAlpha = 1;
    y += 120 * unit;

    if (p.rating > 0) {
      for (let i = 0; i < p.rating; i++) {
        ctx.globalAlpha = enter(t, 0.2 + i * 0.06, 0.3);
        drawIcon(ctx, "star", w / 2 + (i - (p.rating - 1) / 2) * 44 * unit, y - 12 * unit, 34 * unit, "#FACC15", 2, "#FACC15");
      }
      ctx.globalAlpha = 1;
      y += 30 * unit;
    }

    ctx.font = font(600, size, theme.font);
    ctx.fillStyle = theme.text;
    lines.forEach((l, i) => {
      const e = enter(t, 0.25 + i * 0.12, 0.6, easings.outExpo);
      ctx.globalAlpha = e;
      ctx.fillText(l, w / 2, y + lh * (i + 0.5) + (1 - e) * 16 * unit);
    });
    y += quoteH + 60 * unit;

    const e = enter(t, 0.6 + lines.length * 0.1, 0.6);
    ctx.globalAlpha = e;
    ctx.font = font(700, 34 * unit, theme.font);
    const nameW = Math.max(ctx.measureText(p.name).width, (ctx.font = font(400, 28 * unit, theme.font), ctx.measureText(p.role).width));
    const rowW = avatar + 28 * unit + nameW;
    const ax = w / 2 - rowW / 2;
    const img = p.avatarAsset ? r.assets.get(p.avatarAsset) : undefined;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + avatar / 2, y + avatar / 2, avatar / 2, 0, Math.PI * 2);
    ctx.clip();
    if (img) drawImageFit(ctx, img, ax, y, avatar, avatar, "cover");
    else {
      ctx.fillStyle = linearGradient(ctx, ax, y, ax + avatar, y + avatar, [theme.primary, theme.secondary]);
      ctx.fillRect(ax, y, avatar, avatar);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(700, avatar * 0.38, theme.font);
      ctx.fillText(initials(p.name || "?"), ax + avatar / 2, y + avatar / 2);
    }
    ctx.restore();
    ctx.textAlign = "left";
    const tx = ax + avatar + 28 * unit;
    ctx.fillStyle = theme.text;
    ctx.font = font(700, 34 * unit, theme.font);
    ctx.fillText(p.name, tx, y + avatar / 2 - (p.role ? 20 * unit : 0));
    if (p.role) {
      ctx.fillStyle = rgba(theme.text, 0.65);
      ctx.font = font(400, 28 * unit, theme.font);
      ctx.fillText(p.role, tx, y + avatar / 2 + 22 * unit);
    }
  },
});
