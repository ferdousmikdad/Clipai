import { z } from "zod";
import type { BlockDefinition, BlockRegistry } from "@clipai/engine";

/** JSON Schema (input side, so fields with defaults are optional). */
export function blockJsonSchema(def: BlockDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(def.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** One line per block: `id — summary — props: a,b,c` (required props marked with *). */
export function compactBlockList(registry: BlockRegistry): string {
  return registry
    .list()
    .map((b) => {
      const js = blockJsonSchema(b) as { properties?: Record<string, unknown>; required?: string[] };
      const req = new Set(js.required ?? []);
      const props = Object.keys(js.properties ?? {}).map((k) => (req.has(k) ? `${k}*` : k));
      const tag = b.category === "overlay" ? " [overlay]" : "";
      return `${b.id}${tag} — ${b.summary} — props: ${props.join(",")}`;
    })
    .join("\n");
}

/** Short, token-cheap description of one block's props with defaults. */
export function describeBlock(def: BlockDefinition): string {
  const js = blockJsonSchema(def) as { properties?: Record<string, any>; required?: string[] };
  const req = new Set(js.required ?? []);
  const lines = [`${def.id} (${def.category}, default ${def.defaultDuration}s) — ${def.summary}`];
  for (const [key, prop] of Object.entries(js.properties ?? {})) {
    const dflt = isEmpty(prop.default) ? "" : ` = ${JSON.stringify(prop.default)}`;
    lines.push(`- ${key}${req.has(key) ? "*" : ""}: ${typeLabel(prop)}${dflt}${prop.description ? ` — ${prop.description}` : ""}`);
  }
  const example = Object.fromEntries(Object.entries(def.defaults as object).filter(([, v]) => !isEmpty(v)));
  lines.push(`example: ${JSON.stringify(example)}`);
  return lines.join("\n");
}

const isEmpty = (v: unknown) =>
  v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "number" && v === 0);

function typeLabel(p: any): string {
  if (!p) return "any";
  if (p.enum) return p.enum.map((v: unknown) => JSON.stringify(v)).join("|");
  if (p.format === "asset") return "asset id";
  if (p.format === "icon") return "icon";
  if (p.format === "color") return "hex color";
  if (p.type === "array") {
    const item = p.items;
    if (item?.type === "object") return `[{${Object.keys(item.properties ?? {}).join(",")}}]`;
    return `${typeLabel(item)}[]`;
  }
  if (p.type === "object") return `{${Object.keys(p.properties ?? {}).join(",")}}`;
  if (p.anyOf) return p.anyOf.map(typeLabel).join("|");
  return String(p.type ?? "any");
}
