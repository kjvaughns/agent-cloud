import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Launch } from "./Launch";
import { easeInOut, lerp } from "./lib/motion";
import { C, D, H, K, W } from "./timeline";

/**
 * The 1:1 cut, for feeds that crop a vertical post to a square.
 *
 * The same `Launch` component, laid out at its native 1080x1920 and shown
 * through a 1080x1080 window onto the middle band. Not a re-layout: every beat
 * keeps the composition it was designed with, and the two cuts stay in sync
 * because there is only one edit.
 *
 * The window reframes once, and has to.
 *
 * Through the seven product beats the things that must survive the crop are the
 * card (as low as 1286 in the pipeline beat), the readout at 1380 and the
 * caption at 1640 — a band of 1074-1740, which is 1066px and only just fits.
 * The endcard is a different problem: the logo tile climbs to 522 and the URL
 * sits at 1330, so its band is 522-1330. No fixed window holds both.
 *
 * So the window moves, once, on the same handover the logo morph runs on. That
 * is a reframe for a different aspect ratio rather than a second edit — every
 * beat keeps the composition it was designed with, and there is still only one
 * timeline.
 *
 * Change a Y coordinate in `Launch` or `LAYOUT` and check this crop before
 * shipping: `npm run still -- LaunchSquare out/sq.png --frame=880`.
 */
const CENTER_BEATS = 1208;
const CENTER_ENDCARD = 926;

export const LaunchSquare: React.FC = () => {
  const frame = useCurrentFrame();
  const center = lerp(
    frame,
    [K.morphToLogo, K.morphToLogo + D.morphToLogo],
    [CENTER_BEATS, CENTER_ENDCARD],
    easeInOut,
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.bg }}>
      <div style={{ position: "absolute", left: 0, top: W / 2 - center, width: W, height: H }}>
        <Launch />
      </div>
    </AbsoluteFill>
  );
};
