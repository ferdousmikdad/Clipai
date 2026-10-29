import { z } from "zod";
import {
  AssetSchema,
  AudioSchema,
  MetaSchema,
  OverlaySchema,
  SceneSchema,
  ThemeSchema,
  TransitionSchema,
  type Project,
} from "./project.js";
import { nextId } from "./ids.js";
import { validateProject, type BlockLookup } from "./validate.js";
import { formatIssues } from "./errors.js";

const props = z.record(z.string(), z.unknown());

export const OpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_scene"),
    scene: z.object({
      block: z.string(),
      duration: z.number().positive().optional(),
      props: props.optional(),
      transition: TransitionSchema.optional(),
    }),
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    op: z.literal("update_scene"),
    id: z.string(),
    patch: SceneSchema.omit({ id: true }).partial(),
  }),
  z.object({ op: z.literal("remove_scene"), id: z.string() }),
  z.object({ op: z.literal("move_scene"), id: z.string(), index: z.number().int().min(0) }),
  z.object({
    op: z.literal("add_overlay"),
    overlay: z.object({ block: z.string(), start: z.number().min(0), end: z.number().positive(), props: props.optional() }),
  }),
  z.object({ op: z.literal("update_overlay"), id: z.string(), patch: OverlaySchema.omit({ id: true }).partial() }),
  z.object({ op: z.literal("remove_overlay"), id: z.string() }),
  z.object({ op: z.literal("set_theme"), patch: ThemeSchema.partial() }),
  z.object({ op: z.literal("set_meta"), patch: MetaSchema.partial() }),
  z.object({ op: z.literal("set_audio"), audio: AudioSchema.partial().nullable().optional() }),
  z.object({ op: z.literal("add_asset"), asset: AssetSchema }),
  z.object({ op: z.literal("remove_asset"), id: z.string() }),
]);

export type Op = z.infer<typeof OpSchema>;

export type ApplyResult = { project: Project; errors: string[]; changed: string[] };

/**
 * Apply ops atomically. Pure: the input project is never mutated.
 * If any op fails (or the result is invalid), the original project is returned with errors.
 */
export function applyOps(project: Project, ops: unknown[], lookup?: BlockLookup): ApplyResult {
  const draft: Project = structuredClone(project);
  const errors: string[] = [];
  const changed = new Set<string>();

  ops.forEach((raw, i) => {
    const parsed = OpSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...formatIssues(parsed.error.issues, `ops.${i}`));
      return;
    }
    const err = applyOne(draft, parsed.data, lookup, changed);
    if (err) errors.push(`ops.${i} (${parsed.data.op}): ${err}`);
  });

  if (errors.length) return { project, errors, changed: [] };
  const result = validateProject(draft, lookup);
  if (!result.ok) return { project, errors: result.errors, changed: [] };
  return { project: result.project, errors: [], changed: [...changed] };
}

function applyOne(p: Project, op: Op, lookup: BlockLookup | undefined, changed: Set<string>): string | null {
  const allIds = () => [...p.scenes.map((s) => s.id), ...p.overlays.map((o) => o.id)];
  switch (op.op) {
    case "add_scene": {
      const id = nextId("s", allIds());
      const duration = op.scene.duration ?? lookup?.(op.scene.block)?.defaultDuration ?? 3;
      const scene = { id, block: op.scene.block, duration, props: op.scene.props ?? {}, ...(op.scene.transition ? { transition: op.scene.transition } : {}) };
      const index = op.index === undefined ? p.scenes.length : Math.min(op.index, p.scenes.length);
      p.scenes.splice(index, 0, scene);
      changed.add(id);
      return null;
    }
    case "update_scene": {
      const scene = p.scenes.find((s) => s.id === op.id);
      if (!scene) return `no scene "${op.id}"`;
      const { props: patchProps, ...rest } = op.patch;
      Object.assign(scene, rest);
      if (patchProps) scene.props = dropNulls({ ...scene.props, ...patchProps });
      changed.add(scene.id);
      return null;
    }
    case "remove_scene": {
      const i = p.scenes.findIndex((s) => s.id === op.id);
      if (i < 0) return `no scene "${op.id}"`;
      p.scenes.splice(i, 1);
      return null;
    }
    case "move_scene": {
      const i = p.scenes.findIndex((s) => s.id === op.id);
      if (i < 0) return `no scene "${op.id}"`;
      const [scene] = p.scenes.splice(i, 1);
      p.scenes.splice(Math.min(op.index, p.scenes.length), 0, scene);
      changed.add(scene.id);
      return null;
    }
    case "add_overlay": {
      const id = nextId("o", allIds());
      p.overlays.push({ id, block: op.overlay.block, start: op.overlay.start, end: op.overlay.end, props: op.overlay.props ?? {} });
      changed.add(id);
      return null;
    }
    case "update_overlay": {
      const overlay = p.overlays.find((o) => o.id === op.id);
      if (!overlay) return `no overlay "${op.id}"`;
      const { props: patchProps, ...rest } = op.patch;
      Object.assign(overlay, rest);
      if (patchProps) overlay.props = dropNulls({ ...overlay.props, ...patchProps });
      changed.add(overlay.id);
      return null;
    }
    case "remove_overlay": {
      const i = p.overlays.findIndex((o) => o.id === op.id);
      if (i < 0) return `no overlay "${op.id}"`;
      p.overlays.splice(i, 1);
      return null;
    }
    case "set_theme":
      p.theme = { ...p.theme, ...op.patch };
      changed.add("theme");
      return null;
    case "set_meta":
      p.meta = { ...p.meta, ...op.patch };
      changed.add("meta");
      return null;
    case "set_audio": {
      if (!op.audio) {
        delete p.audio;
      } else {
        p.audio = { volume: 0.8, fadeOut: 1.5, ...p.audio, ...op.audio };
      }
      changed.add("audio");
      return null;
    }
    case "add_asset": {
      const i = p.assets.findIndex((a) => a.id === op.asset.id);
      if (i >= 0) p.assets[i] = op.asset;
      else p.assets.push(op.asset);
      changed.add("assets");
      return null;
    }
    case "remove_asset": {
      const i = p.assets.findIndex((a) => a.id === op.id);
      if (i < 0) return `no asset "${op.id}"`;
      p.assets.splice(i, 1);
      changed.add("assets");
      return null;
    }
  }
}

/** A `null` value in a props patch removes that key. */
function dropNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null));
}
