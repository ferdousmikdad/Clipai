import { drawImageFit, rgba, roundedRect, withShadow, type ImageLike, type RenderArgs } from "@clipai/engine";
import { drawPlaceholder } from "./shared.js";

export type FrameKind = "browser" | "phone" | "laptop" | "none";

type Box = { x: number; y: number; w: number; h: number };

/** Frame outer size + content rect (relative to frame origin) that fits inside maxW × maxH. */
export function layoutFrame(kind: FrameKind, img: ImageLike | undefined, maxW: number, maxH: number, unit: number) {
  const aspect = kind === "phone" ? 9 / 19.5 : img ? img.width / img.height : 16 / 10;
  const bar = kind === "browser" ? 48 * unit : 0;
  const bezel = kind === "phone" ? 16 * unit : kind === "laptop" ? 18 * unit : 0;
  const base = kind === "laptop" ? 34 * unit : 0;
  // content size such that outer box fits
  let cw = maxW - bezel * 2;
  let ch = cw / aspect;
  const outerH = (c: number) => c + bar + bezel * 2 + base;
  if (outerH(ch) > maxH) {
    ch = maxH - bar - bezel * 2 - base;
    cw = ch * aspect;
  }
  const w = cw + bezel * 2;
  const h = outerH(ch);
  return { w, h, content: { x: bezel, y: bezel + bar, w: cw, h: ch } as Box, bar, bezel, base };
}

/** Draw a device frame with `img` (or a placeholder) at x, y. */
export function drawFrame(
  r: RenderArgs<unknown>,
  kind: FrameKind,
  img: ImageLike | undefined,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  opts: { url?: string; fit?: "cover" | "contain"; drawContent?: (box: Box) => void } = {},
) {
  const { ctx, theme, unit } = r;
  const L = layoutFrame(kind, img, maxW, maxH, unit);
  const radius = kind === "phone" ? 56 * unit : Math.min(theme.radius, 28) * unit * 1.2;
  const c = { x: x + L.content.x, y: y + L.content.y, w: L.content.w, h: L.content.h };
  const surface = "#16161F";

  withShadow(ctx, "rgba(0,0,0,0.45)", 60 * unit, 24 * unit, () => {
    ctx.fillStyle = kind === "none" ? surface : kind === "phone" ? "#0E0E14" : "#1C1C26";
    if (kind === "laptop") roundedRect(ctx, x, y, L.w, L.h - L.base, [radius, radius, 6 * unit, 6 * unit]);
    else roundedRect(ctx, x, y, L.w, L.h, radius);
    ctx.fill();
  });

  if (kind === "browser") {
    const cy = y + L.bar / 2;
    ["#FF5F57", "#FEBC2E", "#28C840"].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + 26 * unit + i * 22 * unit, cy, 7 * unit, 0, Math.PI * 2);
      ctx.fill();
    });
    const bw = Math.min(L.w * 0.5, 520 * unit);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundedRect(ctx, x + (L.w - bw) / 2, cy - 14 * unit, bw, 28 * unit, 14 * unit);
    ctx.fill();
    if (opts.url) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `500 ${Math.round(16 * unit)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(opts.url, x + L.w / 2, cy, bw - 20 * unit);
    }
  }

  ctx.save();
  const innerR = kind === "phone" ? 42 * unit : kind === "browser" ? [0, 0, radius, radius] : kind === "none" ? radius : 4 * unit;
  roundedRect(ctx, c.x, c.y, c.w, c.h, innerR);
  ctx.clip();
  if (opts.drawContent) opts.drawContent(c);
  else if (img) {
    // Screenshots read from the top: fit the width unless that leaves the screen mostly empty.
    const widthFitH = (img.height * c.w) / img.width;
    if (!opts.fit && widthFitH >= c.h * 0.35) ctx.drawImage(img, c.x, c.y, c.w, widthFitH);
    else drawImageFit(ctx, img, c.x, c.y, c.w, c.h, opts.fit ?? "cover", { y: 0 });
  }
  else drawPlaceholder(r, c.x, c.y, c.w, c.h);
  ctx.restore();

  if (kind === "phone") {
    ctx.fillStyle = "#0E0E14";
    const nw = c.w * 0.3;
    roundedRect(ctx, c.x + (c.w - nw) / 2, c.y + 14 * unit, nw, 30 * unit, 15 * unit);
    ctx.fill();
  }
  if (kind === "laptop") {
    const by = y + L.h - L.base;
    ctx.fillStyle = "#2A2A36";
    ctx.beginPath();
    ctx.moveTo(x - 50 * unit, by + 4 * unit);
    ctx.lineTo(x + L.w + 50 * unit, by + 4 * unit);
    ctx.lineTo(x + L.w + 20 * unit, by + L.base);
    ctx.lineTo(x - 20 * unit, by + L.base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba("#FFFFFF", 0.12);
    ctx.fillRect(x + L.w / 2 - 60 * unit, by + 4 * unit, 120 * unit, 6 * unit);
  }
  return { ...L, content: c };
}
