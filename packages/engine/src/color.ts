export type RGB = { r: number; g: number; b: number; a: number };

export function parseColor(hex: string): RGB {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

export function rgba(hex: string, alpha = 1): string {
  const c = parseColor(hex);
  return `rgba(${c.r},${c.g},${c.b},${+(c.a * alpha).toFixed(4)})`;
}

export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const m = (p: number, q: number) => Math.round(p + (q - p) * t);
  return `rgb(${m(x.r, y.r)},${m(x.g, y.g)},${m(x.b, y.b)})`;
}

/** Relative luminance 0..1. */
export function luminance(hex: string): number {
  const { r, g, b } = parseColor(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Black or white, whichever reads better on `bg`. */
export function contrastText(bg: string): string {
  return luminance(bg) > 0.6 ? "#0B0B12" : "#FFFFFF";
}
