import { z } from "zod";
import { easings, font, interpolate, rgba, roundedRect } from "@clipai/engine";
import { defineBlock } from "../define.js";

export default defineBlock({
  id: "lower-third",
  name: "Lower Third",
  summary: "Name/label bar",
  category: "overlay",
  defaultDuration: 4,
  schema: z.object({
    title: z.string().describe("Main label, e.g. a name"),
    subtitle: z.string().default("").describe("Second line, e.g. a role"),
    position: z.enum(["left", "right"]).default("left").describe("Side of the screen"),
  }),
  defaults: { title: "Rina Das", subtitle: "Founder, Northwind Labs" },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit, duration } = r;
    const inP = interpolate(t, [0, 0.6], [0, 1], easings.outExpo);
    const outP = interpolate(t, [duration - 0.5, duration], [0, 1], easings.inCubic);
    const q = inP * (1 - outP);
    if (q <= 0) return;
    const ts = 40 * unit;
    const ss = 28 * unit;
    ctx.font = font(700, ts, theme.font);
    let bw = ctx.measureText(p.title).width;
    ctx.font = font(400, ss, theme.font);
    bw = Math.max(bw, ctx.measureText(p.subtitle).width) + 80 * unit;
    const bh = (p.subtitle ? 128 : 84) * unit;
    const margin = 64 * unit;
    const right = p.position === "right";
    const x = right ? w - margin - bw : margin;
    const y = h - margin - bh - (r.orientation === "portrait" ? h * 0.12 : 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(right ? x + bw * (1 - q) : x, y - 10 * unit, bw * q + 10 * unit, bh + 20 * unit);
    ctx.clip();
    ctx.fillStyle = rgba(theme.background, 0.85);
    roundedRect(ctx, x, y, bw, bh, theme.radius * unit);
    ctx.fill();
    ctx.fillStyle = theme.primary;
    roundedRect(ctx, right ? x + bw - 10 * unit : x, y, 10 * unit, bh, [right ? 0 : theme.radius * unit, right ? theme.radius * unit : 0, right ? theme.radius * unit : 0, right ? 0 : theme.radius * unit]);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.text;
    ctx.font = font(700, ts, theme.font);
    const tx = x + 40 * unit;
    ctx.fillText(p.title, tx, y + (p.subtitle ? 46 : 42) * unit);
    if (p.subtitle) {
      ctx.fillStyle = rgba(theme.text, 0.7);
      ctx.font = font(400, ss, theme.font);
      ctx.fillText(p.subtitle, tx, y + 92 * unit);
    }
    ctx.restore();
  },
});
