import { z } from "zod";

export const FORMATS = ["16:9", "9:16", "1:1"] as const;
export const RESOLUTIONS = ["720p", "1080p"] as const;
export const FPS_VALUES = [30, 60] as const;
export const TRANSITIONS = ["none", "fade", "slide", "zoom", "wipe"] as const;
export const FONTS = ["Inter", "Poppins", "Hind Siliguri", "Noto Sans Bengali"] as const;

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "expected hex color like #7C3AED");
export const ColorSchema = hex;

export const MetaSchema = z.object({
  name: z.string().min(1).max(64),
  format: z.enum(FORMATS),
  fps: z.union([z.literal(30), z.literal(60)]),
  resolution: z.enum(RESOLUTIONS),
});

export const ThemeSchema = z.object({
  primary: hex,
  secondary: hex,
  background: hex,
  text: hex,
  font: z.string().min(1),
  radius: z.number().min(0).max(200),
});

export const AssetSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["image", "audio", "video"]),
  file: z.string().min(1),
});

export const TransitionSchema = z.object({
  type: z.enum(TRANSITIONS),
  duration: z.number().min(0).max(5),
});

export const SceneSchema = z.object({
  id: z.string().min(1).max(32),
  block: z.string().min(1),
  duration: z.number().positive().max(600),
  props: z.record(z.string(), z.unknown()),
  transition: TransitionSchema.optional(),
});

export const OverlaySchema = z.object({
  id: z.string().min(1).max(32),
  block: z.string().min(1),
  start: z.number().min(0),
  end: z.number().positive(),
  props: z.record(z.string(), z.unknown()),
});

export const AudioSchema = z.object({
  music: z.string().optional(),
  volume: z.number().min(0).max(1),
  fadeOut: z.number().min(0).max(30),
});

export const ProjectSchema = z.object({
  version: z.literal(1),
  meta: MetaSchema,
  theme: ThemeSchema,
  assets: z.array(AssetSchema),
  scenes: z.array(SceneSchema),
  overlays: z.array(OverlaySchema),
  audio: AudioSchema.optional(),
});

export type Format = (typeof FORMATS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];
export type Meta = z.infer<typeof MetaSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type Audio = z.infer<typeof AudioSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export const DEFAULT_THEME: Theme = {
  primary: "#7C3AED",
  secondary: "#22D3EE",
  background: "#0B0B12",
  text: "#FFFFFF",
  font: "Inter",
  radius: 16,
};

export function createProject(name: string, format: Format = "16:9", theme?: Partial<Theme>): Project {
  return {
    version: 1,
    meta: { name, format, fps: 30, resolution: "1080p" },
    theme: { ...DEFAULT_THEME, ...theme },
    assets: [],
    scenes: [],
    overlays: [],
  };
}

const SIZES: Record<Format, Record<Resolution, [number, number]>> = {
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
};

/** Pixel size of the canvas for a format + resolution. */
export function dimensions(format: Format, resolution: Resolution): { width: number; height: number } {
  const [width, height] = SIZES[format][resolution];
  return { width, height };
}
