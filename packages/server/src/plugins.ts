import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolvePluginExport } from "@clipai/blocks";
import type { BlockDefinition } from "@clipai/engine";

export type LoadedPlugin = { url: string; file: string; blocks: string[]; error?: string };

/**
 * Load plugin blocks from `<root>/blocks/*.js` and packages listed in clipai.config.json → "plugins".
 * Each plugin is served to the editor at /plugins/... so both sides use the same code.
 */
export async function loadPlugins(root: string, add: (b: BlockDefinition) => void): Promise<LoadedPlugin[]> {
  const out: LoadedPlugin[] = [];
  const localDir = path.join(root, "blocks");
  const files: { file: string; url: string }[] = [];
  if (existsSync(localDir)) {
    for (const f of (await fs.readdir(localDir)).sort()) {
      if (/\.(m?js)$/.test(f)) files.push({ file: path.join(localDir, f), url: `/plugins/local/${encodeURIComponent(f)}` });
    }
  }
  const configFile = path.join(root, "clipai.config.json");
  if (existsSync(configFile)) {
    try {
      const config = JSON.parse(await fs.readFile(configFile, "utf8")) as { plugins?: string[] };
      const require = createRequire(path.join(root, "package.json"));
      for (const name of config.plugins ?? []) {
        try {
          files.push({ file: require.resolve(name), url: `/plugins/pkg/${encodeURIComponent(name)}` });
        } catch {
          out.push({ url: "", file: name, blocks: [], error: `cannot resolve plugin package "${name}"` });
        }
      }
    } catch (e) {
      out.push({ url: "", file: configFile, blocks: [], error: `clipai.config.json: ${(e as Error).message}` });
    }
  }
  for (const { file, url } of files) {
    try {
      const mod = await import(pathToFileURL(file).href + `?v=${Date.now()}`);
      const blocks = resolvePluginExport(mod.default, path.basename(file));
      blocks.forEach(add);
      out.push({ url, file, blocks: blocks.map((b) => b.id) });
    } catch (e) {
      out.push({ url, file, blocks: [], error: (e as Error).message });
    }
  }
  return out;
}
