import { interpolate, spring } from "remotion";

/**
 * Three spring configs, and SNAPPY does about 90% of the work.
 *
 * Reaching for a bouncier config per element is how a video ends up feeling
 * like eight different videos. POP is spent once — on the hero line — and NONE
 * exists only to move a transition along a curve without overshoot.
 */
export const SNAPPY = { damping: 20, stiffness: 200, mass: 0.5 } as const;
export const POP = { damping: 12, stiffness: 300, mass: 0.8 } as const;
export const NONE = { damping: 200 } as const;

/**
 * A spring forced into a frame budget.
 *
 * `durationInFrames` is the honest way to hit a 7-frame entrance: it rescales
 * the curve instead of leaving you hand-tuning stiffness until it looks about
 * right, and it keeps every entrance in the video on the same shape.
 */
export const enter = (
  frame: number,
  fps: number,
  durationInFrames = 7,
  config: Record<string, number> = SNAPPY,
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

/** Accelerate. Used by the zoom-through's outgoing half, so it leaves rather than drifts. */
export const easeIn = (t: number) => t * t * t;

export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * `back.out(2.2)`.
 *
 * The overshoot on a cursor release is the entire illusion. A linear release
 * reads mechanical; this slight bounce past the target and back reads as a
 * finger lifting off glass.
 */
export const backOut = (t: number, s = 2.2) => {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};
