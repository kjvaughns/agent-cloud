import React from "react";
import { useCurrentFrame } from "remotion";
import { C, alpha } from "../timeline";
import { backOut, easeOut, lerp } from "../lib/motion";

/**
 * A simulated pointer.
 *
 * The numbers here are the trick, and they are not adjustable taste:
 *
 *   travel   short hop 0.4-0.6s (12-18 frames), cross-screen 0.7-1.0s
 *            (21-30 frames), always ease-out
 *   press    the cursor scales to 88%, and a ripple expands from the point
 *   release  overshoots — `back.out(2.2)` — and settles
 *
 * The overshoot on release is what makes it read as a finger lifting off glass
 * instead of a sprite being keyframed. A linear release is instantly and
 * unplaceably wrong.
 *
 * Drawn as an SVG arrow rather than a screenshot of an OS pointer: a bitmap
 * cursor is the wrong DPI at every scale and dates the video to an OS version.
 *
 * Every click must be paired with a visible state change underneath it. A
 * cursor that presses and gets no response reads as a broken product rather
 * than as a demonstration of one.
 */
const PRESS = 3;
const RELEASE = 4;
const RIPPLE = 13;
const FADE = 8;

export const Cursor: React.FC<{
  from: { x: number; y: number };
  to: { x: number; y: number };
  travelStart: number;
  travelFrames: number;
  /** Frame the button goes down. */
  clickAt: number;
  /** Frame the pointer leaves. */
  exitAt?: number;
}> = ({ from, to, travelStart, travelFrames, clickAt, exitAt }) => {
  const frame = useCurrentFrame();
  if (frame < travelStart) return null;
  if (exitAt !== undefined && frame > exitAt + FADE) return null;

  const travel = lerp(frame, [travelStart, travelStart + travelFrames], [0, 1], easeOut);
  const x = from.x + (to.x - from.x) * travel;
  const y = from.y + (to.y - from.y) * travel;

  let scale = 1;
  if (frame >= clickAt && frame < clickAt + PRESS) {
    scale = lerp(frame, [clickAt, clickAt + PRESS], [1, 0.88], easeOut);
  } else if (frame >= clickAt + PRESS && frame <= clickAt + PRESS + RELEASE) {
    scale = 0.88 + 0.12 * backOut((frame - clickAt - PRESS) / RELEASE, 2.2);
  }

  const exiting =
    exitAt !== undefined && frame > exitAt ? lerp(frame, [exitAt, exitAt + FADE], [1, 0]) : 1;

  const rippleT = lerp(frame, [clickAt, clickAt + RIPPLE], [0, 1], easeOut);
  const showRipple = frame >= clickAt && frame <= clickAt + RIPPLE;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {showRipple ? (
        <div
          style={{
            position: "absolute",
            left: to.x,
            top: to.y,
            width: 2,
            height: 2,
            borderRadius: "50%",
            border: `3px solid ${alpha(C.accentLt, 0.85)}`,
            transform: `translate(-50%, -50%) scale(${1 + rippleT * 46})`,
            opacity: (1 - rippleT) * 0.55 * exiting,
          }}
        />
      ) : null}
      <svg
        width="54"
        height="62"
        viewBox="0 0 24 28"
        style={{
          position: "absolute",
          left: x,
          top: y,
          // The hotspot is the arrow's tip, at the top-left of the viewBox, so
          // the SVG hangs down-right from the point it is indicating.
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          opacity: exiting,
          filter: `drop-shadow(0 3px 7px ${alpha(C.bg, 0.55)})`,
        }}
      >
        <path
          d="M1 1 L1 20.5 L6.2 15.6 L9.6 23.4 L13.2 21.8 L9.9 14.2 L17 14.2 Z"
          fill={C.text}
          stroke={C.bg}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
