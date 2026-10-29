import type { z } from "zod";
import { ProjectSchema, type Project } from "./project.js";
import { formatIssues } from "./errors.js";

/** The minimum a validator needs to know about a block. */
export type BlockInfo = {
  id: string;
  category: string;
  defaultDuration: number;
  schema: z.ZodType;
};

export type BlockLookup = (id: string) => BlockInfo | undefined;

export type ValidationResult = { ok: true; project: Project; errors: [] } | { ok: false; errors: string[] };

const ASSET_KEY = /(^asset$|Asset$)/;

/**
 * Validate a full project. With `lookup`, also checks block ids, block props
 * and that asset references point to existing assets.
 */
export function validateProject(input: unknown, lookup?: BlockLookup): ValidationResult {
  const parsed = ProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error.issues, "", input) };
  const project = parsed.data;
  const errors: string[] = [];

  const seen = new Set<string>();
  for (const item of [...project.scenes, ...project.overlays]) {
    if (seen.has(item.id)) errors.push(`${item.id}: duplicate id`);
    seen.add(item.id);
  }
  const assetIds = new Set<string>();
  for (const a of project.assets) {
    if (assetIds.has(a.id)) errors.push(`assets.${a.id}: duplicate id`);
    assetIds.add(a.id);
  }
  for (const o of project.overlays) {
    if (o.end <= o.start) errors.push(`${o.id}.end: must be after start`);
  }
  if (project.audio?.music && !project.assets.some((a) => a.id === project.audio!.music || a.file === project.audio!.music)) {
    errors.push(`audio.music: unknown asset "${project.audio.music}"`);
  }

  const items = [
    ...project.scenes.map((s) => ({ kind: "scene" as const, id: s.id, block: s.block, props: s.props })),
    ...project.overlays.map((o) => ({ kind: "overlay" as const, id: o.id, block: o.block, props: o.props })),
  ];
  for (const item of items) {
    errors.push(...checkAssetRefs(item.id, item.props, assetIds));
    if (!lookup) continue;
    const block = lookup(item.block);
    if (!block) {
      errors.push(`${item.id}.block: unknown block "${item.block}"`);
      continue;
    }
    const isOverlay = block.category === "overlay";
    if (item.kind === "scene" && isOverlay) errors.push(`${item.id}.block: "${item.block}" is an overlay block`);
    if (item.kind === "overlay" && !isOverlay) errors.push(`${item.id}.block: "${item.block}" is not an overlay block`);
    const res = block.schema.safeParse(item.props);
    if (!res.success) errors.push(...formatIssues(res.error.issues, `${item.id}.props`));
  }

  return errors.length ? { ok: false, errors } : { ok: true, project, errors: [] };
}

function checkAssetRefs(id: string, props: Record<string, unknown>, assets: Set<string>): string[] {
  const out: string[] = [];
  const visit = (value: unknown, path: string, key: string) => {
    if (typeof value === "string" && ASSET_KEY.test(key)) {
      if (value && !assets.has(value)) out.push(`${path}: unknown asset "${value}"`);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, `${path}.${i}`, key));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, `${path}.${k}`, k);
    }
  };
  for (const [k, v] of Object.entries(props)) visit(v, `${id}.props.${k}`, k);
  return out;
}
