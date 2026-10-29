import { z } from "zod";
import { contrastText, drawImageFit, easings, font, linearGradient, rgba, roundedRect, spring, withShadow } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { assetRef, drawBackdrop, enter, initials } from "../shared.js";

export default defineBlock({
  id: "logo-outro",
  name: "Logo Outro",
  summary: "Logo/asset reveal + URL/CTA",
  category: "brand",
  defaultDuration: 2.5,
  schema: z.object({
    logoAsset: assetRef("Logo image asset id (default: monogram)").optional(),
    text: z.string().default("").describe("URL or tagline under the logo"),
    cta: z.string().default("").describe("Button label, e.g. Try it free"),
    brand: z.string().default("").describe("Brand name used for the monogram when no logo"),
  }),
  defaults: { text: "taskflow.app", cta: "Start free" },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    drawBackdrop(r, 1.2);
    const size = 220 * unit;
    const hasCta = !!p.cta;
    const totalH = size + (p.text ? 110 * unit : 0) + (hasCta ? 130 * unit : 0);
    let y = (h - totalH) / 2;

    // glow ring
    const ring = enter(t, 0, 1.2, easings.outExpo);
    ctx.strokeStyle = rgba(theme.primary, 0.5 * (1 - ring));
    ctx.lineWidth = 6 * unit;
    ctx.beginPath();
    ctx.arc(w / 2, y + size / 2, size * (0.5 + ring * 0.9), 0, Math.PI * 2);
    ctx.stroke();

    const s = spring(t, { stiffness: 150, damping: 12 });
    ctx.save();
    ctx.translate(w / 2, y + size / 2);
    ctx.scale(s, s);
    ctx.rotate((1 - s) * -0.3);
    const img = p.logoAsset ? r.assets.get(p.logoAsset) : undefined;
    if (img) {
      drawImageFit(ctx, img, -size / 2, -size / 2, size, size, "contain");
    } else {
      withShadow(ctx, rgba(theme.primary, 0.6), 60 * unit, 0, () => {
        ctx.fillStyle = linearGradient(ctx, -size / 2, -size / 2, size / 2, size / 2, [theme.primary, theme.secondary]);
        roundedRect(ctx, -size / 2, -size / 2, size, size, size * 0.28);
        ctx.fill();
      });
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(800, size * 0.45, theme.font);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(p.brand || p.text.replace(/^https?:\/\//, "").split(/[.\s]/)[0] || "C").slice(0, 2), 0, size * 0.03);
    }
    ctx.restore();
    y += size;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (p.text) {
      const e = enter(t, 0.45, 0.6);
      ctx.globalAlpha = e;
      ctx.fillStyle = theme.text;
      ctx.font = font(700, 56 * unit, theme.font);
      ctx.fillText(p.text, w / 2, y + 70 * unit + (1 - e) * 20 * unit, w * 0.9);
      y += 110 * unit;
    }
    if (hasCta) {
      const e = spring(t - 0.75, { stiffness: 200, damping: 14 });
      ctx.globalAlpha = Math.min(1, Math.max(0, (t - 0.75) * 4));
      ctx.font = font(700, 36 * unit, theme.font);
      const bw = ctx.measureText(p.cta).width + 90 * unit;
      const bh = 84 * unit;
      ctx.save();
      ctx.translate(w / 2, y + 50 * unit + bh / 2);
      ctx.scale(e, e);
      ctx.fillStyle = theme.primary;
      roundedRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = contrastText(theme.primary);
      ctx.fillText(p.cta, 0, 2 * unit);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
});
