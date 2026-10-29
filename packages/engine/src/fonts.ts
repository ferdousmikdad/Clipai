/** Fonts bundled with Clipai (all SIL OFL 1.1). Files live in /assets/fonts. */
export const BUNDLED_FONTS: { family: string; slug: string; weights: number[]; subsets: string[] }[] = [
  { family: "Inter", slug: "inter", weights: [400, 600, 800], subsets: ["latin"] },
  { family: "Poppins", slug: "poppins", weights: [400, 600, 800], subsets: ["latin"] },
  { family: "Hind Siliguri", slug: "hind-siliguri", weights: [400, 600, 700], subsets: ["latin", "bengali"] },
  { family: "Noto Sans Bengali", slug: "noto-sans-bengali", weights: [400, 600, 800], subsets: ["latin", "bengali"] },
];

const UNICODE_RANGES: Record<string, string> = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  bengali: "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1",
};

/** CSS font-family stack: the theme font first, then Bangla fallbacks so mixed text always renders. */
export function fontStack(font: string): string {
  const fams = [font, "Inter", "Hind Siliguri", "Noto Sans Bengali"].filter((f, i, a) => a.indexOf(f) === i);
  return fams.map((f) => `"${f}"`).join(", ") + ", sans-serif";
}

export function font(weight: number, sizePx: number, family: string): string {
  return `${weight} ${Math.max(1, Math.round(sizePx))}px ${fontStack(family)}`;
}

let loading: Promise<void> | null = null;

/**
 * Register bundled fonts with `document.fonts` and wait for them.
 * Call before rendering or exporting. `baseUrl` is where the .woff2 files are served.
 */
export function loadFonts(baseUrl = "/fonts"): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  const faces: FontFace[] = [];
  for (const f of BUNDLED_FONTS) {
    for (const w of f.weights) {
      for (const subset of f.subsets) {
        const face = new FontFace(f.family, `url(${baseUrl}/${f.slug}-${subset}-${w}.woff2) format("woff2")`, {
          weight: String(w),
          unicodeRange: UNICODE_RANGES[subset],
          display: "block",
        });
        document.fonts.add(face);
        faces.push(face);
      }
    }
  }
  loading = Promise.all(faces.map((f) => f.load().catch(() => undefined))).then(() => document.fonts.ready.then(() => undefined));
  return loading;
}
