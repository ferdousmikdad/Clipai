import { describe, expect, it } from "vitest";
import { builtinBlocks, compactBlockList, createBuiltinRegistry, describeBlock, resolvePluginExport } from "@clipai/blocks";

const V1 = [
  "title-reveal", "kinetic-text", "ui-mockup", "cursor-click", "zoom-pan", "feature-callout", "feature-grid",
  "stats-counter", "before-after", "testimonial", "pricing-card", "logo-outro", "background",
  "lower-third", "captions", "watermark",
];

describe("built-in blocks", () => {
  it("ships every v1 block", () => {
    expect(builtinBlocks.map((b) => b.id).sort()).toEqual([...V1].sort());
  });

  it.each(builtinBlocks.map((b) => [b.id, b] as const))("%s has valid defaults and a one-line summary", (_id, b) => {
    expect(b.schema.safeParse(b.defaults).success).toBe(true);
    expect(b.summary).not.toMatch(/\n/);
    expect(b.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(describeBlock(b)).toContain(b.id);
  });

  it("produces a compact list for the AI", () => {
    const text = compactBlockList(createBuiltinRegistry());
    expect(text.split("\n")).toHaveLength(V1.length);
    expect(text).toContain("title-reveal — Big title + subtitle animated in — props: title*,subtitle,style");
  });

  it("loads plugin factories", () => {
    const [b] = resolvePluginExport(
      ({ z, defineBlock }: any) =>
        defineBlock({ id: "hello", name: "Hello", summary: "Hi", category: "text", defaultDuration: 2, schema: z.object({ text: z.string().default("hi") }), render() {} }),
      "hello.js",
    );
    expect(b.id).toBe("hello");
    expect(b.defaults).toEqual({ text: "hi" });
    expect(b.plugin).toBe("hello.js");
    expect(() => resolvePluginExport({ nope: true }, "bad.js")).toThrow(/bad\.js/);
  });
});

describe("sample plugin", () => {
  it("docs/sample-plugin/countdown.js loads as a block", async () => {
    const mod = await import("../../../docs/sample-plugin/countdown.js");
    const [b] = resolvePluginExport(mod.default, "countdown.js");
    expect(b.id).toBe("countdown");
    expect(b.defaults).toEqual({ from: 3, message: "Launch!" });
  });
});
