import type { Overlay, Project, Scene } from "./project.js";

export type TimedScene = {
  scene: Scene;
  index: number;
  start: number;
  end: number;
};

/** Scenes play back to back; total duration is the sum of scene durations. */
export function resolveTimeline(project: Pick<Project, "scenes">): TimedScene[] {
  let t = 0;
  return project.scenes.map((scene, index) => {
    const start = t;
    t += scene.duration;
    return { scene, index, start, end: t };
  });
}

export function projectDuration(project: Pick<Project, "scenes">): number {
  return round(project.scenes.reduce((sum, s) => sum + s.duration, 0));
}

/** Effective transition length into a scene, clamped so it never exceeds either neighbor. */
export function transitionDuration(prev: Scene | undefined, scene: Scene): number {
  const tr = scene.transition;
  if (!prev || !tr || tr.type === "none") return 0;
  return Math.max(0, Math.min(tr.duration, prev.duration, scene.duration));
}

export type FrameLayer = {
  scene: Scene;
  /** Local time inside the scene (may exceed duration for the outgoing scene of a transition). */
  t: number;
};

export type FrameState = {
  /** Current scene. */
  current?: FrameLayer;
  /** Outgoing scene when inside a transition. */
  previous?: FrameLayer;
  /** 0..1 progress of the transition into `current`, or 1 when no transition is active. */
  transitionProgress: number;
  overlays: { overlay: Overlay; t: number }[];
};

/**
 * Work out what is on screen at `time`.
 * A transition occupies the first `duration` seconds of the incoming scene while the
 * outgoing scene keeps playing past its end (blocks hold their final pose).
 */
export function frameAt(project: Pick<Project, "scenes" | "overlays">, time: number): FrameState {
  const timeline = resolveTimeline(project);
  const overlays = project.overlays
    .filter((o) => time >= o.start && time < o.end)
    .map((overlay) => ({ overlay, t: time - overlay.start }));
  if (timeline.length === 0) return { transitionProgress: 1, overlays };

  const last = timeline[timeline.length - 1];
  const clamped = Math.min(Math.max(time, 0), Math.max(0, last.end - 1e-6));
  const entry = timeline.find((e) => clamped >= e.start && clamped < e.end) ?? last;
  const t = clamped - entry.start;
  const prevEntry = entry.index > 0 ? timeline[entry.index - 1] : undefined;
  const td = transitionDuration(prevEntry?.scene, entry.scene);

  if (prevEntry && td > 0 && t < td) {
    return {
      current: { scene: entry.scene, t },
      previous: { scene: prevEntry.scene, t: prevEntry.scene.duration + t },
      transitionProgress: t / td,
      overlays,
    };
  }
  return { current: { scene: entry.scene, t }, transitionProgress: 1, overlays };
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
