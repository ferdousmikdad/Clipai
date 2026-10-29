import { z } from "zod";
import { drawImageFit, font, interpolate, rgba } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { assetRef } from "../shared.js";

export default defineBlock({
  id: "watermark",
  name: "Watermark",
  summary: "Corner logo",
  category: "overlay",
  defaultDuration: 10,
  schema: z.object({
    logoAsset: assetRef("Logo image asset id").optional(),
    text: z.string().default("").describe("Text used when there is no logo"),
    position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).default("top-right").describe("Corner"),
    opacity: z.number().min(0).max(1).default(0.8).describe("0-1"),
    size: z.number().min(0.03).max(0.4).default(0.1).describe("Height as fraction of the short side"),
  }),
  defaults: { text: "taskflow" },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    const fade = Math.min(interpolate(t, [0, 0.4]), interpolate(t, [duration - 0.4, duration], [1, 0]));
    const sz = Math.min(w, h) * p.size;
    const m = 40 * unit;
    const right = p.position.endsWith("right");
    const bottom = p.position.startsWith("bottom");
    ctx.globalAlpha = p.opacity * fade;
    const img = p.logoAsset ? r.assets.get(p.logoAsset) : undefined;
    if (img) {
      const bw = sz * (img.width / img.height);
      drawImageFit(ctx, img, right ? w - m - bw : m, bottom ? h - m - sz : m, bw, sz, "contain");
    } else if (p.text) {
      ctx.font = font(700, sz * 0.42, theme.font);
      ctx.fillStyle = rgba(theme.text, 1);
      ctx.textAlign = right ? "right" : "left";
      ctx.textBaseline = bottom ? "bottom" : "top";
      ctx.fillText(p.text, right ? w - m : m, bottom ? h - m : m);
    }
    ctx.globalAlpha = 1;
  },
});
