import { interpolate, spring } from "remotion";
import { S } from "../timeline";

/**
 * Easing and interpolation helpers.
 *
 * Deliberately holds no constants of its own. Spring configs live in `S` in
 * `timeline.ts` with every other number that governs motion — see
 * `scripts/check-params.mjs`, which fails the build if one reappears here.
 */

/**
 * A spring forced into a frame budget.
 *
 * `durationInFrames` is the honest way to hit a 9-frame entrance: it rescales
 * the curve, instead of leaving you tuning stiffness until it looks about
 * right, and it keeps every entrance in the video on the same shape.
 */
export const enter = (
  frame: number,
  fps: number,
  durationInFrames: number,
  config: Record<string, number> = S.SNAP,
  delay = 0,
) => spring({ frame, fps, config, durationInFrames, delay });

/**
 * `interpolate` with both ends clamped.
 *
 * The unclamped default is never what a scene wants: a value that keeps
 * extrapolating past its range is how an element ends up at scale -3 four
 * frames after it was supposed to have settled.
 */
export const lerp = (
  input: number,
  range: readonly number[],
  out: readonly number[],
  easing?: (t: number) => number,
) =>
  interpolate(input, range as number[], out as number[], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** Standard decelerate. Everything arriving on screen uses this unless it's a spring. */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Accelerate. For things leaving, so they leave rather than drift. */
export const easeIn = (t: number) => t * t * t;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * `back.out(2.2)`.
 *
 * The overshoot on a cursor release, and on the licence chip landing, is the
 * entire illusion. A linear settle reads mechanical; this slight bounce past
 * the target and back reads as a physical object arriving.
 */
export const backOut = (t: number, s = 2.2) => {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

/** Interpolate every field of a rect. The card's morph runs through this. */
export const lerpRect = <T extends Record<string, number>>(a: T, b: T, t: number): T => {
  const out = {} as T;
  for (const k of Object.keys(a) as (keyof T)[]) {
    out[k] = (a[k] + (b[k] - a[k]) * t) as T[keyof T];
  }
  return out;
};
