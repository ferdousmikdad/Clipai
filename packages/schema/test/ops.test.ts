import { describe, expect, it } from "vitest";
import { applyOps, nextId } from "@clipai/schema";
import { example } from "./fixture.js";

describe("applyOps", () => {
  it("adds scenes with generated ids and is pure", () => {
    const before = JSON.stringify(example);
    const res = applyOps(example, [
      { op: "add_scene", scene: { block: "kinetic-text", props: { lines: ["Hi"] } } },
      { op: "add_scene", scene: { block: "background", duration: 2 }, index: 0 },
    ]);
    expect(res.errors).toEqual([]);
    expect(res.project.scenes.map((s) => s.id)).toEqual(["s6", "s1", "s2", "s3", "s4", "s5"]);
    expect(res.project.scenes[5].duration).toBe(3);
    expect(res.changed).toEqual(["s5", "s6"]);
    expect(JSON.stringify(example)).toBe(before);
  });

  it("uses the block default duration from the lookup", async () => {
    const { z } = await import("zod");
    const res = applyOps(example, [{ op: "add_scene", scene: { block: "x" } }], (id) => ({ id, category: "text", defaultDuration: 7, schema: z.any() }));
    expect(res.project.scenes.at(-1)!.duration).toBe(7);
  });

  it("merges props shallowly and removes null keys", () => {
    const res = applyOps(example, [{ op: "update_scene", id: "s1", patch: { props: { title: "New", subtitle: null }, duration: 5 } }]);
    expect(res.project.scenes[0]).toMatchObject({ duration: 5, props: { title: "New" } });
    expect(res.project.scenes[0].props).not.toHaveProperty("subtitle");
  });

  it("moves and removes scenes", () => {
    const res = applyOps(example, [
      { op: "move_scene", id: "s4", index: 0 },
      { op: "remove_scene", id: "s2" },
    ]);
    expect(res.project.scenes.map((s) => s.id)).toEqual(["s4", "s1", "s3"]);
  });

  it("is atomic: one failing op applies nothing", () => {
    const res = applyOps(example, [
      { op: "remove_scene", id: "s1" },
      { op: "remove_scene", id: "zzz" },
    ]);
    expect(res.errors).toEqual(['ops.1 (remove_scene): no scene "zzz"']);
    expect(res.project).toBe(example);
  });

  it("rejects ops that make the project invalid", () => {
    const res = applyOps(example, [{ op: "set_theme", patch: { primary: "red" } }]);
    expect(res.errors.length).toBe(1);
    expect(res.errors[0]).toMatch(/primary/);
  });

  it("reports malformed ops", () => {
    const res = applyOps(example, [{ op: "explode" }]);
    expect(res.errors[0]).toMatch(/^ops\.0/);
  });

  it("handles overlays, theme, meta, audio and assets", () => {
    const res = applyOps(example, [
      { op: "add_overlay", overlay: { block: "watermark", start: 0, end: 12 } },
      { op: "update_overlay", id: "o1", patch: { end: 10 } },
      { op: "set_theme", patch: { primary: "#FF0066" } },
      { op: "set_meta", patch: { format: "9:16" } },
      { op: "add_asset", asset: { id: "logo", type: "image", file: "logo.png" } },
      { op: "set_audio", audio: null },
    ]);
    expect(res.errors).toEqual([]);
    expect(res.project.overlays[0]).toMatchObject({ id: "o1", end: 10 });
    expect(res.project.theme.primary).toBe("#FF0066");
    expect(res.project.meta.format).toBe("9:16");
    expect(res.project.assets.map((a) => a.id)).toContain("logo");
    expect(res.project.audio).toBeUndefined();
    const rm = applyOps(res.project, [{ op: "remove_overlay", id: "o1" }]);
    expect(rm.project.overlays).toEqual([]);
  });

  it("generates short ids", () => {
    expect(nextId("s", ["s1", "s9", "o3"])).toBe("s10");
    expect(nextId("o", [])).toBe("o1");
  });
});
