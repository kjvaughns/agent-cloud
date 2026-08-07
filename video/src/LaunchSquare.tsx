import React from "react";
import { AbsoluteFill } from "remotion";
import { Launch } from "./Launch";
import { BG } from "./lib/theme";

/**
 * The 1:1 cut for feeds that crop a vertical post to a square.
 *
 * The same `Launch` component, laid out at its native 1080x1920 and shown
 * through a 1080x1080 window onto the middle band — y 370 to 1450. Not a
 * re-layout: every scene keeps the composition it was designed with, and the
 * two cuts stay in sync because there is only one edit.
 *
 * That band is what the vertical version's layout is tuned against, and the
 * tuning is mutual: eyebrows sit at 376 rather than lower so the square keeps
 * them, captions moved from 1318 to 1290 and the hero line from 1276 to 1230 so
 * their second lines land above 1450. Everything meaningful — the card at
 * y≈900, the eyebrow at 376, captions ending at 1402, the endcard between 566
 * and 1329 — falls inside, so the square loses margin rather than content.
 *
 * Change a Y coordinate in a scene and check this crop before shipping.
 */
const OFFSET_Y = -370;

export const LaunchSquare: React.FC = () => (
  <AbsoluteFill style={{ overflow: "hidden", background: BG }}>
    <div style={{ position: "absolute", left: 0, top: OFFSET_Y, width: 1080, height: 1920 }}>
      <Launch />
    </div>
  </AbsoluteFill>
);
