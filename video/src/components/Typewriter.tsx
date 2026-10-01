import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../timeline";
import { lerp } from "../lib/motion";

/**
 * Text typed in character by character, with a caret.
 *
 * Readable range is 30-60 characters per second; below that it drags, above it
 * the eye cannot follow and it may as well have faded in. The duration comes
 * from `D`, so if a name gets longer the rate changes rather than the timing —
 * which is the right trade, because the beat boundary matters more than the
 * exact cadence.
 *
 * The caret blinks on a frame count rather than a CSS animation, for the same
 * reason everything else here does: a CSS `@keyframes` blink is wall-clock
 * driven and renders at whatever phase the browser happened to be in when the
 * frame was captured, which across a render is arbitrary and looks like a
 * flickering artefact.
 */
const CARET_PERIOD = 16;

export const Typewriter: React.FC<{
  text: string;
  at: number;
  duration: number;
  /** Keep the caret after the text finishes. */
  caretUntil?: number;
  style?: React.CSSProperties;
}> = ({ text, at, duration, caretUntil, style }) => {
  const frame = useCurrentFrame();

  const shown = Math.round(lerp(frame, [at, at + duration], [0, text.length]));
  const done = frame >= at + duration;
  const caretGone = caretUntil !== undefined && frame > caretUntil;
  const caretOn = !caretGone && (!done || Math.floor(frame / CARET_PERIOD) % 2 === 0);

  if (frame < at) return null;

  return (
    <span style={{ ...style, whiteSpace: "pre" }}>
      {text.slice(0, shown)}
      <span
        style={{
          display: "inline-block",
          width: "0.08em",
          height: "0.92em",
          marginLeft: "0.06em",
          verticalAlign: "-0.08em",
          background: C.accent,
          opacity: caretOn ? 1 : 0,
        }}
      />
    </span>
  );
};

/**
 * A number that counts to its value.
 *
 * Used once, on the commissions variance. A figure that simply appears is a
 * label; a figure that resolves in front of you is the product doing work, and
 * that difference is the entire claim of that beat.
 */
export const CountUp: React.FC<{
  to: number;
  at: number;
  duration: number;
  format: (n: number) => string;
  style?: React.CSSProperties;
}> = ({ to, at, duration, format, style }) => {
  const frame = useCurrentFrame();
  const v = lerp(frame, [at, at + duration], [0, to]);
  return <span style={{ ...style, whiteSpace: "pre" }}>{format(v)}</span>;
};
