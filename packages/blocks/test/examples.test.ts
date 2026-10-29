import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { validateProject } from "@clipai/schema";
import { createBuiltinRegistry } from "@clipai/blocks";

const dir = path.resolve(__dirname, "../../../examples");
const registry = createBuiltinRegistry();
const examples = readdirSync(dir).filter((n) => existsSync(path.join(dir, n, "project.json")));

describe("examples", () => {
  it.each(examples)("%s is a valid project with existing asset files", (name) => {
    const json = JSON.parse(readFileSync(path.join(dir, name, "project.json"), "utf8"));
    const res = validateProject(json, (id) => registry.get(id));
    expect(res.errors).toEqual([]);
    for (const a of json.assets) expect(existsSync(path.join(dir, name, "assets", a.file)), a.file).toBe(true);
  });

  it("every built-in block has a demo", () => {
    const used = new Set<string>();
    for (const n of examples) {
      const p = JSON.parse(readFileSync(path.join(dir, n, "project.json"), "utf8"));
      for (const x of [...p.scenes, ...p.overlays]) used.add(x.block);
    }
    expect(registry.list().map((b) => b.id).filter((id) => !used.has(id))).toEqual([]);
  });
});
