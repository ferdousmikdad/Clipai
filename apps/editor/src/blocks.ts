import { blockJsonSchema, createBuiltinRegistry, resolvePluginExport } from "@clipai/blocks";
import type { BlockDefinition } from "@clipai/engine";
import type { BlockLookup } from "@clipai/schema";
import { api } from "./api";

export const registry = createBuiltinRegistry();
export const lookup: BlockLookup = (id) => registry.get(id);

const schemaCache = new Map<string, JsonSchema>();
export type JsonSchema = {
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  anyOf?: JsonSchema[];
};

export function schemaOf(def: BlockDefinition): JsonSchema {
  let s = schemaCache.get(def.id);
  if (!s) {
    s = blockJsonSchema(def) as JsonSchema;
    schemaCache.set(def.id, s);
  }
  return s;
}

export type PluginStatus = { url: string; blocks: string[]; error?: string };

/** Load plugin blocks served by the local server. Plugins run code on your machine. */
export async function loadPlugins(): Promise<PluginStatus[]> {
  let list: PluginStatus[] = [];
  try {
    list = await api.plugins();
  } catch {
    return [];
  }
  for (const p of list) {
    if (!p.url || p.error) continue;
    try {
      const mod = await import(/* @vite-ignore */ p.url);
      for (const b of resolvePluginExport(mod.default, p.url.split("/").pop() ?? p.url)) {
        registry.add(b);
        schemaCache.delete(b.id);
      }
    } catch (e) {
      p.error = (e as Error).message;
    }
  }
  return list;
}
