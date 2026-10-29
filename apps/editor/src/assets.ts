import { useEffect, useState } from "react";
import { EMPTY_ASSETS, loadImageAssets, type LoadedAssets } from "@clipai/engine";
import type { Project } from "@clipai/schema";
import { assetUrl } from "./api";

const cache = new Map<string, Promise<LoadedAssets>>();

/** Load (and cache) a project's image assets, keyed by the asset list. */
export function getAssets(name: string, project: Project): Promise<LoadedAssets> {
  const key = name + "|" + project.assets.map((a) => `${a.id}:${a.file}`).join(",");
  let p = cache.get(key);
  if (!p) {
    p = loadImageAssets(project, (file) => assetUrl(name, file));
    cache.set(key, p);
  }
  return p;
}

export function useAssets(name: string | null, project: Project | null): LoadedAssets {
  const [assets, setAssets] = useState<LoadedAssets>(EMPTY_ASSETS);
  const key = project ? project.assets.map((a) => `${a.id}:${a.file}`).join(",") : "";
  useEffect(() => {
    if (!name || !project) return;
    let alive = true;
    getAssets(name, project).then((a) => alive && setAssets(a));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key]);
  return assets;
}
