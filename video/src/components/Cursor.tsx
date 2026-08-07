import React from "react";
import { useCurrentFrame } from "remotion";
import { backOut, easeOut, lerp } from "../lib/motion";

/**
 * A simulated pointer.
 *
 * The numbers here are the whole trick, and they are not adjustable taste:
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
 */
export type Click = { at: number };

export const Cursor: React.FC<{
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Frame the pointer starts moving. */
  travelStart: number;
  /** 12-18 for a hop, 21-30 across the screen. */
  travelFrames?: number;
  /** Frame the button goes down. Release is three frames later. */
  clickAt: number;
  /** Frame the pointer leaves. Omit to keep it on screen. */
  exitAt?: number;
}> = ({ from, to, travelStart, travelFrames = 22, clickAt, exitAt }) => {
  const frame = useCurrentFrame();
  if (frame < travelStart) return null;
  if (exitAt !== undefined && frame > exitAt + 8) return null;

  const travel = lerp(frame, [travelStart, travelStart + travelFrames], [0, 1], easeOut);
  const x = from.x + (to.x - from.x) * travel;
  const y = from.y + (to.y - from.y) * travel;

  // Press over three frames, release over four with the overshoot.
  const PRESS = 3;
  const RELEASE = 4;
  let scale = 1;
  if (frame >= clickAt && frame < clickAt + PRESS) {
    scale = lerp(frame, [clickAt, clickAt + PRESS], [1, 0.88], easeOut);
  } else if (frame >= clickAt + PRESS && frame <= clickAt + PRESS + RELEASE) {
    const t = (frame - clickAt - PRESS) / RELEASE;
    scale = 0.88 + 0.12 * backOut(t, 2.2);
  }

  const exiting =
    exitAt !== undefined && frame > exitAt ? lerp(frame, [exitAt, exitAt + 8], [1, 0]) : 1;

  const rippleT = lerp(frame, [clickAt, clickAt + 13], [0, 1], easeOut);
  const showRipple = frame >= clickAt && frame <= clickAt + 13;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {showRipple && (
        <div
          style={{
            position: "absolute",
            left: to.x,
            top: to.y,
            width: 2,
            height: 2,
            borderRadius: "50%",
            border: "3px solid rgba(232,199,122,0.85)",
            transform: `translate(-50%, -50%) scale(${1 + rippleT * 46})`,
            opacity: (1 - rippleT) * 0.55 * exiting,
          }}
        />
      )}
      <svg
        width="54"
        height="62"
        viewBox="0 0 24 28"
        style={{
          position: "absolute",
          left: x,
          top: y,
          // The hotspot is the arrow's tip, at the top-left of the viewBox, so
          // the SVG hangs down-right from the point it is actually indicating.
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          opacity: exiting,
          filter: "drop-shadow(0 3px 7px rgba(0,0,0,0.55))",
        }}
      >
        <path
          d="M1 1 L1 20.5 L6.2 15.6 L9.6 23.4 L13.2 21.8 L9.9 14.2 L17 14.2 Z"
          fill="#FAFAF9"
          stroke="#08080A"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

/**
 * The state change under a click.
 *
 * Pair every click with one of these. A cursor that presses and nothing
 * responds is worse than no cursor at all — it reads as a broken product rather
 * than as a demonstration of one.
 *
 * Coordinates are frame pixels, so this goes inside `ScreenStage` and is scaled
 * and punched along with the UI it sits on.
 */
export const RowHighlight: React.FC<{
  rect: { x: number; y: number; w: number; h: number };
  at: number;
  duration?: number;
}> = ({ rect, at, duration = 6 }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;

  const t = lerp(frame, [at, at + duration], [0, 1], easeOut);

  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: 6,
        background: `rgba(203,163,90,${0.14 * t})`,
        boxShadow: `inset 3px 0 0 0 rgba(232,199,122,${0.95 * t})`,
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Spotlight — everything dims except one element.
 *
 * A flat black sheet with a hole cut in it by a radial gradient mask, rather
 * than four positioned rectangles. The soft edge is what stops it reading as a
 * cut-out.
 */
export const Spotlight: React.FC<{
  /** Canvas coordinates, not frame coordinates: this sits over the whole shot. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  at: number;
  until: number;
  strength?: number;
}> = ({ cx, cy, rx, ry, at, until, strength = 0.55 }) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > until) return null;

  const o =
    lerp(frame, [at, at + 7], [0, 1], easeOut) *
    lerp(frame, [until - 7, until], [1, 0], easeOut);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#000",
        opacity: strength * o,
        pointerEvents: "none",
        // `transparent` in a gradient is transparent *black* in some engines,
        // which grey-fringes the edge. Stating rgba(0,0,0,0) avoids it.
        maskImage: `radial-gradient(${rx}px ${ry}px at ${cx}px ${cy}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 62%, #000 100%)`,
        WebkitMaskImage: `radial-gradient(${rx}px ${ry}px at ${cx}px ${cy}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 62%, #000 100%)`,
      }}
    />
  );
};
