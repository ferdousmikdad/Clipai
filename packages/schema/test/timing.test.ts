import { describe, expect, it } from "vitest";
import { frameAt, projectDuration, resolveTimeline, transitionDuration } from "@clipai/schema";
import { example } from "./fixture.js";

describe("timing", () => {
  it("sums durations", () => {
    expect(projectDuration(example)).toBe(12.5);
    expect(resolveTimeline(example).map((e) => [e.start, e.end])).toEqual([
      [0, 3],
      [3, 7],
      [7, 10],
      [10, 12.5],
    ]);
  });

  it("finds the current scene and local time", () => {
    const f = frameAt(example, 8);
    expect(f.current?.scene.id).toBe("s3");
    expect(f.current?.t).toBeCloseTo(1);
    expect(f.previous).toBeUndefined();
  });

  it("overlaps the outgoing scene during a transition", () => {
    const f = frameAt(example, 3.2);
    expect(f.current?.scene.id).toBe("s2");
    expect(f.previous?.scene.id).toBe("s1");
    expect(f.previous?.t).toBeCloseTo(3.2);
    expect(f.transitionProgress).toBeCloseTo(0.5);
    expect(frameAt(example, 3.5).previous).toBeUndefined();
  });

  it("clamps transition length to neighbors", () => {
    const a = { id: "a", block: "x", duration: 0.3, props: {} };
    const b = { id: "b", block: "x", duration: 2, props: {}, transition: { type: "fade" as const, duration: 1 } };
    expect(transitionDuration(a, b)).toBe(0.3);
    expect(transitionDuration(undefined, b)).toBe(0);
  });

  it("clamps time to the project range and holds the last frame", () => {
    expect(frameAt(example, -1).current?.scene.id).toBe("s1");
    expect(frameAt(example, 99).current?.scene.id).toBe("s4");
    expect(frameAt({ scenes: [], overlays: [] }, 1).current).toBeUndefined();
  });

  it("includes active overlays with local time", () => {
    const p = { ...example, overlays: [{ id: "o1", block: "watermark", start: 2, end: 5, props: {} }] };
    expect(frameAt(p, 3).overlays.map((o) => [o.overlay.id, o.t])).toEqual([["o1", 1]]);
    expect(frameAt(p, 5).overlays).toEqual([]);
  });
});
