import { z } from "zod";
import { clamp, easings, rgba } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { assetRef, drawBackdrop, enter, point } from "../shared.js";
import { drawFrame, layoutFrame } from "../frames.js";

export default defineBlock({
  id: "cursor-click",
  name: "Cursor Click",
  summary: "Animated cursor moves and clicks on a screenshot",
  category: "ui",
  defaultDuration: 4,
  schema: z.object({
    asset: assetRef("Screenshot image asset id").default(""),
    path: z.array(point).min(1).default([{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.55 }]).describe("Cursor waypoints (0-1 of screenshot)"),
    clickAt: z.array(z.number().min(0)).default([]).describe("Click times in seconds (default: on arrival at each waypoint)"),
    frame: z.enum(["browser", "none"]).default("browser").describe("Frame around the screenshot"),
    url: z.string().default("").describe("Address bar text"),
  }),
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    drawBackdrop(r, 0.6);
    const img = p.asset ? r.assets.get(p.asset) : undefined;
    const maxW = w * (r.orientation === "portrait" ? 0.92 : 0.8);
    const maxH = h * 0.82;
    const L = layoutFrame(p.frame, img, maxW, maxH, unit);
    const x = (w - L.w) / 2;
    const y = (h - L.h) / 2;
    ctx.save();
    ctx.globalAlpha = enter(t, 0, 0.4);
    const F = drawFrame(r, p.frame, img, x, y, maxW, maxH, { url: p.url });
    ctx.restore();
    const c = F.content;

    // movement: start off-screen bottom-right, then each waypoint
    const pts = [{ x: 1.05, y: 1.1 }, ...p.path];
    const moveStart = 0.4;
    const usable = Math.max(0.5, duration - moveStart - 0.6);
    const seg = usable / (pts.length - 1);
    const arrivals = p.path.map((_, i) => moveStart + seg * (i + 1));
    const clicks = p.clickAt.length ? p.clickAt : arrivals;

    let px = pts[0].x;
    let py = pts[0].y;
    const k = clamp((t - moveStart) / seg, 0, pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(k));
    const e = easings.inOutCubic(clamp(k - i));
    px = pts[i].x + (pts[i + 1].x - pts[i].x) * e;
    py = pts[i].y + (pts[i + 1].y - pts[i].y) * e;
    const cx = c.x + px * c.w;
    const cy = c.y + py * c.h;

    let press = 0;
    for (const ct of clicks) {
      const dt = t - ct;
      if (dt >= 0 && dt < 0.7) {
        const q = dt / 0.7;
        ctx.strokeStyle = rgba(theme.primary, 1 - q);
        ctx.lineWidth = 4 * unit;
        ctx.beginPath();
        ctx.arc(cx, cy, (12 + 50 * easings.outCubic(q)) * unit, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = rgba(theme.primary, 0.25 * (1 - q));
        ctx.fill();
      }
      if (dt >= -0.08 && dt < 0.15) press = 1;
    }

    // cursor arrow
    const s = (1.6 - press * 0.2) * unit;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 28);
    ctx.lineTo(7, 21);
    ctx.lineTo(12, 32);
    ctx.lineTo(17, 30);
    ctx.lineTo(12, 19);
    ctx.lineTo(22, 19);
    ctx.closePath();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111111";
    ctx.stroke();
    ctx.restore();
  },
});
