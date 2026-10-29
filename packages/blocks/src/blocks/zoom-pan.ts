import { z } from "zod";
import { easings, interpolate, roundedRect, withShadow } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { assetRef, drawBackdrop, drawPlaceholder } from "../shared.js";

const view = z.object({
  x: z.number().min(0).max(1).describe("View center 0-1 from left"),
  y: z.number().min(0).max(1).describe("View center 0-1 from top"),
  scale: z.number().min(1).max(8).describe("Zoom (1 = whole image)"),
});

export default defineBlock({
  id: "zoom-pan",
  name: "Zoom & Pan",
  summary: "Zooms into a region of a screenshot",
  category: "ui",
  defaultDuration: 4,
  schema: z.object({
    asset: assetRef("Screenshot image asset id").default(""),
    from: view.default({ x: 0.5, y: 0.5, scale: 1 }).describe("Start view"),
    to: view.default({ x: 0.7, y: 0.35, scale: 2.2 }).describe("End view"),
    hold: z.number().min(0).max(5).default(0.6).describe("Seconds to hold at each end"),
  }),
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    drawBackdrop(r, 0.5);
    const img = p.asset ? r.assets.get(p.asset) : undefined;
    const pad = 48 * unit;
    const bw = w - pad * 2;
    const bh = h - pad * 2;
    const q = interpolate(t, [p.hold, Math.max(p.hold + 0.1, duration - p.hold)], [0, 1], easings.inOutCubic);
    const vx = p.from.x + (p.to.x - p.from.x) * q;
    const vy = p.from.y + (p.to.y - p.from.y) * q;
    const vs = p.from.scale * (p.to.scale / p.from.scale) ** q; // geometric zoom feels linear

    const radius = theme.radius * unit;
    withShadow(ctx, "rgba(0,0,0,0.45)", 50 * unit, 20 * unit, () => {
      ctx.fillStyle = "#16161F";
      roundedRect(ctx, pad, pad, bw, bh, radius);
      ctx.fill();
    });
    ctx.save();
    roundedRect(ctx, pad, pad, bw, bh, radius);
    ctx.clip();
    if (!img) {
      drawPlaceholder(r, pad, pad, bw, bh);
    } else {
      const base = Math.min(bw / img.width, bh / img.height); // contain at scale 1
      const s = base * vs;
      const dw = img.width * s;
      const dh = img.height * s;
      let dx = pad + bw / 2 - vx * dw;
      let dy = pad + bh / 2 - vy * dh;
      // keep image covering the box when zoomed in
      if (dw > bw) dx = Math.min(pad, Math.max(pad + bw - dw, dx));
      else dx = pad + (bw - dw) / 2;
      if (dh > bh) dy = Math.min(pad, Math.max(pad + bh - dh, dy));
      else dy = pad + (bh - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    ctx.restore();
  },
});
