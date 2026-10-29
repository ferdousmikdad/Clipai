import { z } from "zod";
import { contrastText, easings, font, interpolate, rgba, roundedRect, stagger } from "@clipai/engine";
import { defineBlock } from "../define.js";
import { drawBackdrop, drawIcon, enter } from "../shared.js";
import { drawCard } from "../card.js";

export default defineBlock({
  id: "pricing-card",
  name: "Pricing Cards",
  summary: "Plan cards slide in",
  category: "data",
  defaultDuration: 4,
  schema: z.object({
    title: z.string().default("").describe("Optional heading"),
    plans: z
      .array(
        z.object({
          name: z.string().describe("Plan name"),
          price: z.string().describe("e.g. $12"),
          period: z.string().default("/mo").describe("e.g. /mo"),
          features: z.array(z.string()).max(6).default([]).describe("Bullet list"),
          highlight: z.boolean().default(false).describe("Mark as recommended"),
        }),
      )
      .min(1)
      .max(3)
      .describe("1-3 plans"),
  }),
  defaults: {
    title: "Simple pricing",
    plans: [
      { name: "Starter", price: "$0", features: ["1 project", "720p export"] },
      { name: "Pro", price: "$12", features: ["Unlimited projects", "1080p60 export", "Brand themes"], highlight: true },
      { name: "Team", price: "$29", features: ["Everything in Pro", "Shared library"] },
    ],
  },
  render(r) {
    const { ctx, props: p, theme, t, width: w, height: h, unit } = r;
    drawBackdrop(r, 0.8);
    const n = p.plans.length;
    const portrait = r.orientation === "portrait";
    const headH = p.title ? 140 * unit : 0;
    const gap = 30 * unit;
    const maxFeatures = Math.max(1, ...p.plans.map((pl) => pl.features.length));
    const naturalH = (230 + maxFeatures * 54 + 50) * unit;
    const cw = portrait ? w * 0.84 : Math.min(460 * unit, (w * 0.9 - gap * (n - 1)) / n);
    const ch = portrait ? Math.min(naturalH, (h * 0.86 - headH - gap * (n - 1)) / n) : Math.min(naturalH, h * 0.8 - headH);
    const totalW = portrait ? cw : cw * n + gap * (n - 1);
    const totalH = headH + (portrait ? ch * n + gap * (n - 1) : ch);
    const x0 = (w - totalW) / 2;
    const y0 = (h - totalH) / 2 + headH;

    ctx.textBaseline = "middle";
    if (p.title) {
      ctx.textAlign = "center";
      ctx.globalAlpha = enter(t, 0, 0.5);
      ctx.fillStyle = theme.text;
      ctx.font = font(800, 64 * unit, theme.font);
      ctx.fillText(p.title, w / 2, y0 - headH / 2, w * 0.9);
      ctx.globalAlpha = 1;
    }

    const s = portrait ? Math.min(1, ch / naturalH) : 1;
    p.plans.forEach((plan, i) => {
      const x = portrait ? x0 : x0 + i * (cw + gap);
      const y = portrait ? y0 + i * (ch + gap) : y0;
      const q = stagger(t, i, { start: 0.15, each: 0.15, duration: 0.7 });
      ctx.save();
      ctx.globalAlpha = interpolate(q, [0, 0.3]);
      ctx.translate(0, (1 - easings.outExpo(q)) * 120 * unit);
      if (plan.highlight && !portrait) {
        ctx.translate(x + cw / 2, y + ch / 2);
        ctx.scale(1.04, 1.04);
        ctx.translate(-(x + cw / 2), -(y + ch / 2));
      }
      drawCard(r, x, y, cw, ch, plan.highlight);
      const px = x + 40 * unit;
      let py = y + 56 * unit * s;
      ctx.textAlign = "left";
      ctx.fillStyle = rgba(theme.text, 0.8);
      ctx.font = font(700, 32 * unit * s, theme.font);
      ctx.fillText(plan.name, px, py, cw - 80 * unit);
      if (plan.highlight) {
        ctx.font = font(700, 20 * unit, theme.font);
        const label = "POPULAR";
        const bw = ctx.measureText(label).width + 28 * unit;
        ctx.fillStyle = theme.primary;
        roundedRect(ctx, x + cw - 40 * unit - bw, py - 18 * unit, bw, 36 * unit, 18 * unit);
        ctx.fill();
        ctx.fillStyle = contrastText(theme.primary);
        ctx.textAlign = "center";
        ctx.fillText(label, x + cw - 40 * unit - bw / 2, py);
        ctx.textAlign = "left";
      }
      py += 90 * unit * s;
      ctx.fillStyle = theme.text;
      ctx.font = font(800, 84 * unit * s, theme.font);
      ctx.fillText(plan.price, px, py);
      const pw = ctx.measureText(plan.price).width;
      ctx.fillStyle = rgba(theme.text, 0.55);
      ctx.font = font(400, 30 * unit * s, theme.font);
      ctx.fillText(plan.period, px + pw + 8 * unit, py + 14 * unit * s);
      py += 84 * unit * s;
      ctx.font = font(400, 28 * unit * s, theme.font);
      plan.features.forEach((f, j) => {
        const fy = py + j * 54 * unit * s;
        if (fy > y + ch - 30 * unit) return;
        drawIcon(ctx, "check", px + 14 * unit, fy, 28 * unit * s, theme.secondary, 2.6);
        ctx.fillStyle = rgba(theme.text, 0.8);
        ctx.fillText(f, px + 44 * unit, fy, cw - 120 * unit);
      });
      ctx.restore();
    });
  },
});
