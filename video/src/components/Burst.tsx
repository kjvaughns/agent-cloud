import React from "react";
import { useCurrentFrame } from "remotion";
import { C, alpha } from "../timeline";
import { easeOut, lerp } from "../lib/motion";

/**
 * The resolution burst — a ring plus radial lines, fired once when something
 * lands.
 *
 * This is the only place gold appears outside the endcard, and it fires exactly
 * four times in the video: a licence validates, a writing number issues, a
 * variance is caught, a policy is saved. That restraint is the whole reason it
 * reads as a payoff rather than as decoration.
 *
 * The easing is the part that separates this from a CSS `scale` keyframe. Both
 * the ring and the lines decelerate *hard* — most of the travel happens in the
 * first third of the duration and then they crawl to a stop. Linear radial
 * lines look like a loading spinner; hard-decelerating ones look like an
 * impact, because that is what actual debris does.
 */
const LINES = 10;

export const Burst: React.FC<{
  x: number;
  y: number;
  at: number;
  duration: number;
  /** Ring radius at rest. */
  radius?: number;
  color?: string;
}> = ({ x, y, at, duration, radius = 130, color = C.accent }) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + duration) return null;

  const t = lerp(frame, [at, at + duration], [0, 1], easeOut);

  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {/* The ring. Expands and thins as it goes, which is what stops it
          reading as a circle being scaled up. */}
      <div
        style={{
          position: "absolute",
          left: -radius * t,
          top: -radius * t,
          width: radius * 2 * t,
          height: radius * 2 * t,
          borderRadius: "50%",
          border: `${Math.max(1, 4 * (1 - t))}px solid ${alpha(color, 0.85 * (1 - t))}`,
        }}
      />

      {Array.from({ length: LINES }, (_, i) => {
        const angle = (i / LINES) * Math.PI * 2;
        /*
         * Each line gets its own reach, varied deterministically by index. Ten
         * lines of identical length is a starburst clip-art; ten of varying
         * length is debris. No randomness — a render has to be reproducible.
         */
        const reach = radius * (0.62 + 0.38 * ((i * 7) % 5) * 0.25);
        const inner = reach * t * 0.55;
        const outer = reach * t;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: outer - inner,
              height: Math.max(1, 3 * (1 - t)),
              borderRadius: 2,
              background: alpha(color, 0.9 * (1 - t)),
              transformOrigin: "0 50%",
              transform: `rotate(${angle}rad) translateX(${inner}px) translateY(-50%)`,
            }}
          />
        );
      })}
    </div>
  );
};
