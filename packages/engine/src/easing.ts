export type Easing = (t: number) => number;

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easings = {
  linear: (t: number) => t,
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  inOutBack: (t: number) => {
    const c = 1.70158 * 1.525;
    return t < 0.5 ? ((2 * t) ** 2 * ((c + 1) * 2 * t - c)) / 2 : ((2 * t - 2) ** 2 * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  inExpo: (t: number) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
} satisfies Record<string, Easing>;

export type EasingName = keyof typeof easings;

/**
 * Map `t` from an input range to an output range, clamped, with optional easing.
 * interpolate(t, [0.2, 0.8], [0, 100], easings.outCubic)
 */
export function interpolate(
  t: number,
  input: [number, number],
  output: [number, number] = [0, 1],
  easing: Easing = easings.linear,
): number {
  const [i0, i1] = input;
  const p = i1 === i0 ? (t >= i1 ? 1 : 0) : clamp((t - i0) / (i1 - i0));
  return lerp(output[0], output[1], easing(p));
}

/**
 * Closed-form damped spring from 0 to 1. Deterministic for a given time.
 * `t` is seconds since the spring started.
 */
export function spring(t: number, { stiffness = 170, damping = 18, mass = 1 } = {}): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** Local progress (0..1) of item `i` of `count` in a staggered sequence. */
export function stagger(t: number, i: number, { start = 0, each = 0.12, duration = 0.6 } = {}): number {
  return clamp((t - start - i * each) / duration);
}
