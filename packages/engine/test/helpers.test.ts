import { describe, expect, it } from "vitest";
import { easings, interpolate, parseColor, rgba, seededRandom, spring, stagger, contrastText } from "@clipai/engine";

describe("animation helpers", () => {
  it("interpolates with clamping and easing", () => {
    expect(interpolate(0.5, [0, 1], [0, 100])).toBe(50);
    expect(interpolate(-1, [0, 1], [0, 100])).toBe(0);
    expect(interpolate(2, [0, 1], [0, 100])).toBe(100);
    expect(interpolate(0.5, [0, 1], [0, 1], easings.inCubic)).toBeCloseTo(0.125);
  });

  it("easings hit 0 and 1 at the ends", () => {
    for (const [name, fn] of Object.entries(easings)) {
      expect(fn(0), name).toBeCloseTo(0);
      expect(fn(1), name).toBeCloseTo(1);
    }
  });

  it("spring settles at 1 and starts at 0", () => {
    expect(spring(0)).toBe(0);
    expect(spring(3)).toBeCloseTo(1, 2);
  });

  it("stagger offsets items", () => {
    expect(stagger(0.5, 0, { each: 0.2, duration: 1 })).toBe(0.5);
    expect(stagger(0.5, 1, { each: 0.2, duration: 1 })).toBeCloseTo(0.3);
  });

  it("seeded random is deterministic", () => {
    const a = seededRandom("s1");
    const b = seededRandom("s1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRandom("s2")()).not.toBe(seededRandom("s1")());
  });

  it("parses colors", () => {
    expect(parseColor("#7C3AED")).toEqual({ r: 124, g: 58, b: 237, a: 1 });
    expect(rgba("#fff", 0.5)).toBe("rgba(255,255,255,0.5)");
    expect(contrastText("#FFFFFF")).toBe("#0B0B12");
  });
});
