import React from "react";
import { AbsoluteFill } from "remotion";
import { Launch } from "./Launch";
import { C, H, W } from "./timeline";

/**
 * The 1:1 cut, for feeds that crop a vertical post to a square.
 *
 * The same `Launch` component, laid out at its native 1080x1920 and shown
 * through a 1080x1080 window onto the middle band. Not a re-layout: every beat
 * keeps the composition it was designed with, and the two cuts stay in sync
 * because there is only one edit.
 *
 * The card climbs from 880 to 610 across the video and the captions sit at
 * 1150-1332, so the band has to cover roughly 560-1450. Centring the window on
 * 1005 gives 465-1545 with margin at both ends.
 *
 * Change a Y coordinate in `Launch` and check this crop before shipping.
 */
const WINDOW_CENTER_Y = 1005;
const OFFSET_Y = W / 2 - WINDOW_CENTER_Y;

export const LaunchSquare: React.FC = () => (
  <AbsoluteFill style={{ overflow: "hidden", background: C.bg }}>
    <div style={{ position: "absolute", left: 0, top: OFFSET_Y, width: W, height: H }}>
      <Launch />
    </div>
  </AbsoluteFill>
);
