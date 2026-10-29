import type { Project } from "@clipai/schema";
import type { ImageLike, LoadedAssets } from "./types.js";

/**
 * Load every image asset of a project. `urlFor(file)` maps an asset file name to a URL.
 * Resolves once all images are decoded so rendering is deterministic.
 */
export async function loadImageAssets(project: Project, urlFor: (file: string) => string): Promise<LoadedAssets> {
  const map = new Map<string, ImageLike>();
  await Promise.all(
    project.assets
      .filter((a) => a.type === "image")
      .map(async (a) => {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = urlFor(a.file);
          await img.decode();
          map.set(a.id, img);
        } catch {
          // Missing image: blocks draw a placeholder.
        }
      }),
  );
  return { get: (id) => map.get(id) };
}
