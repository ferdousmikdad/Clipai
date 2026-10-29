import { z } from "zod";
import { easings, font, interpolate, spring } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { assetRef, drawBackdrop, enter } from "../shared.js";
import { drawFrame, layoutFrame } from "../frames.js";

export default defineBlock({
  id: "ui-mockup",
  name: "UI Mockup",
  summary: "Screenshot in browser/phone/laptop frame",
  category: "ui",
  defaultDuration: 4,
  schema: z.object({
    asset: assetRef("Screenshot image asset id").default(""),
    frame: z.enum(["browser", "phone", "laptop", "none"]).default("browser").describe("Device frame"),
    motion: z.enum(["slide-up", "tilt", "float"]).default("slide-up").describe("Camera motion"),
    url: z.string().default("").describe("Address bar text (browser frame)"),
    caption: z.string().default("").describe("Optional caption above the mockup"),
  }),
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    drawBackdrop(r);
    const img = p.asset ? r.assets.get(p.asset) : undefined;
    const capH = p.caption ? 110 * unit : 0;
    const maxW = w * (p.frame === "phone" ? 0.5 : r.orientation === "portrait" ? 0.9 : 0.74);
    const maxH = (h - capH) * (p.frame === "phone" ? 0.86 : 0.78);
    const L = layoutFrame(p.frame, img, maxW, maxH, unit);
    let x = (w - L.w) / 2;
    let y = capH + (h - capH - L.h) / 2;

    if (p.caption) {
      const e = enter(t, 0.1, 0.6);
      ctx.save();
      ctx.globalAlpha = e;
      ctx.fillStyle = theme.text;
      ctx.font = font(700, 54 * unit, theme.font);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.caption, w / 2, capH * 0.75 + (1 - e) * 20 * unit, w * 0.9);
      ctx.restore();
    }

    ctx.save();
    const cx = x + L.w / 2;
    const cy = y + L.h / 2;
    if (p.motion === "slide-up") {
      const e = interpolate(t, [0, 0.9], [0, 1], easings.outExpo);
      ctx.globalAlpha = Math.min(1, e * 1.4);
      y += (1 - e) * h * 0.35;
      const s = 0.96 + 0.04 * interpolate(t, [0, duration], [0, 1]);
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    } else if (p.motion === "tilt") {
      const e = spring(t, { stiffness: 80, damping: 14 });
      const tilt = (1 - e) * 0.22 + 0.04;
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.translate(cx, cy);
      ctx.transform(1 - tilt * 0.3, -tilt * 0.35, 0, 1, 0, 0);
      const s = 0.85 + 0.15 * e;
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    } else {
      ctx.globalAlpha = enter(t, 0, 0.6);
      y += Math.sin(t * 1.6) * 14 * unit;
      x += Math.cos(t * 1.1) * 6 * unit;
    }
    drawFrame(r, p.frame, img, x, y, maxW, maxH, { url: p.url });
    ctx.restore();
  },
});
