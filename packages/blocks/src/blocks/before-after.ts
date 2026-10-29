import { z } from "zod";
import { drawImageFit, easings, font, interpolate, rgba, roundedRect, withShadow } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { assetRef, drawBackdrop, drawIcon, drawPlaceholder, enter } from "../shared.js";

export default defineBlock({
  id: "before-after",
  name: "Before / After",
  summary: "Split comparison with slider wipe",
  category: "ui",
  defaultDuration: 4,
  schema: z.object({
    beforeAsset: assetRef("Image shown on the left (before)").default(""),
    afterAsset: assetRef("Image shown on the right (after)").default(""),
    labels: z
      .object({ before: z.string().default("Before"), after: z.string().default("After") })
      .default({ before: "Before", after: "After" })
      .describe("Corner labels"),
  }),
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    drawBackdrop(r, 0.6);
    const pad = 70 * unit;
    const bw = w - pad * 2;
    const bh = h - pad * 2;
    const radius = theme.radius * unit;
    const before = p.beforeAsset ? r.assets.get(p.beforeAsset) : undefined;
    const after = p.afterAsset ? r.assets.get(p.afterAsset) : undefined;
    const a = enter(t, 0, 0.5);
    ctx.globalAlpha = a;

    withShadow(ctx, "rgba(0,0,0,0.45)", 50 * unit, 20 * unit, () => {
      ctx.fillStyle = "#16161F";
      roundedRect(ctx, pad, pad, bw, bh, radius);
      ctx.fill();
    });

    // slider goes 0.85 → 0.15 → 0.5
    const mid = duration * 0.55;
    const split =
      t < mid
        ? interpolate(t, [0.4, mid], [0.85, 0.15], easings.inOutCubic)
        : interpolate(t, [mid, duration - 0.3], [0.15, 0.5], easings.inOutCubic);
    const sx = pad + bw * split;

    const paint = (img: typeof before, label: string, tint: string) => {
      if (img) drawImageFit(ctx, img, pad, pad, bw, bh, "cover");
      else {
        drawPlaceholder(r, pad, pad, bw, bh, label);
        ctx.fillStyle = tint;
        ctx.fillRect(pad, pad, bw, bh);
      }
    };
    ctx.save();
    roundedRect(ctx, pad, pad, bw, bh, radius);
    ctx.clip();
    paint(after, p.labels.after, rgba(theme.primary, 0.12));
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, sx - pad, bh);
    ctx.clip();
    paint(before, p.labels.before, rgba("#888888", 0.15));
    ctx.restore();
    ctx.restore();

    // handle
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(sx - 2 * unit, pad, 4 * unit, bh);
    withShadow(ctx, "rgba(0,0,0,0.35)", 16 * unit, 4 * unit, () => {
      ctx.beginPath();
      ctx.arc(sx, h / 2, 34 * unit, 0, Math.PI * 2);
      ctx.fill();
    });
    drawIcon(ctx, "move-horizontal", sx, h / 2, 34 * unit, "#111111", 2.4);

    const tag = (text: string, x: number, alignRight: boolean) => {
      ctx.font = font(700, 28 * unit, theme.font);
      const tw = ctx.measureText(text).width + 36 * unit;
      const tx = alignRight ? x - tw : x;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundedRect(ctx, tx, pad + 24 * unit, tw, 52 * unit, 26 * unit);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, tx + tw / 2, pad + 50 * unit);
    };
    tag(p.labels.before, pad + 24 * unit, false);
    tag(p.labels.after, pad + bw - 24 * unit, true);
  },
});
