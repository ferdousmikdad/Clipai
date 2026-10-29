import { describe, expect, it } from "vitest";
import { createProject, dimensions, summary, validateProject } from "@clipai/schema";
import { example } from "./fixture.js";

describe("project schema", () => {
  it("accepts the example project", () => {
    expect(validateProject(example).ok).toBe(true);
  });

  it("creates a valid empty project", () => {
    expect(validateProject(createProject("demo", "9:16")).ok).toBe(true);
  });

  it("reports short paths with scene ids", () => {
    const bad = structuredClone(example) as any;
    delete bad.scenes[2].duration;
    const res = validateProject(bad);
    expect(res.ok).toBe(false);
    expect(res.errors).toContain("s3.duration: required");
  });

  it("rejects bad colors, duplicate ids and unknown assets", () => {
    const bad = structuredClone(example) as any;
    bad.theme.primary = "purple";
    expect(validateProject(bad).errors[0]).toMatch(/^theme\.primary:/);
    const dup = structuredClone(example);
    dup.scenes[1].id = "s1";
    expect(validateProject(dup).errors).toContain("s1: duplicate id");
    const missing = structuredClone(example);
    missing.scenes[1].props.asset = "nope";
    expect(validateProject(missing).errors).toContain('s2.props.asset: unknown asset "nope"');
  });

  it("validates block props through a lookup", async () => {
    const { z } = await import("zod");
    const lookup = (id: string) =>
      id === "title-reveal"
        ? { id, category: "text", defaultDuration: 3, schema: z.object({ title: z.string() }) }
        : { id, category: "text", defaultDuration: 3, schema: z.any() };
    const bad = structuredClone(example);
    delete bad.scenes[0].props.title;
    expect(validateProject(bad, lookup).errors).toContain("s1.props.title: required");
    const unknown = structuredClone(example);
    expect(validateProject(unknown, (id) => (id === "logo-outro" ? undefined : lookup(id))).errors).toContain('s4.block: unknown block "logo-outro"');
  });

  it("computes canvas dimensions", () => {
    expect(dimensions("16:9", "1080p")).toEqual({ width: 1920, height: 1080 });
    expect(dimensions("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(dimensions("1:1", "720p")).toEqual({ width: 720, height: 720 });
  });

  it("summarizes compactly", () => {
    const text = summary(example);
    expect(text.split("\n")[0]).toBe("taskflow-promo · 16:9 1080p30 · 12.5s · theme #7C3AED/Inter");
    expect(text).toContain('s1 title-reveal 3s "Meet TaskFlow"');
    expect(text).toContain("s2 ui-mockup 4s asset=dash fade");
    expect(text).toContain("music: music.mp3 (0.6)");
  });
});
