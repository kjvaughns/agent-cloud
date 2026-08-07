import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ScreenStage } from "../components/ScreenStage";
import { Bloom, CardSweep } from "../components/Atmosphere";
import { Caption, Eyebrow } from "../components/Type";
import { GRID_LEVELS } from "../lib/anchors";
import { easeOut, enter, lerp, SNAPPY } from "../lib/motion";

/**
 * Beats 22-28. The differentiator.
 *
 * No competitor in this category shows an agent their own comp grid — carrier
 * levels are the thing an upline keeps vague on purpose. So this scene gets the
 * same eight-frame entrance as the others and a longer hold, and the caption
 * does the arguing.
 *
 * Enters on a spring push from the right: distinct from Contracting's slam and
 * Retention's wipe, so four screens in a row do not read as four repetitions of
 * one move.
 */
const PUNCH_IN = 22;
const PUNCH_LEN = 9;
const PUNCH_TO = 1.7;

export const Grid: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const e = enter(frame, fps, 8, SNAPPY);
  const punchT = lerp(frame, [PUNCH_IN, PUNCH_IN + PUNCH_LEN], [0, 1], easeOut);

  return (
    <AbsoluteFill>
      <Bloom x={40} y={46} intensity={0.27} />
      <ScreenStage
        screen="grid"
        anchor={GRID_LEVELS}
        zoom={1 + (PUNCH_TO - 1) * punchT}
        pull={punchT}
        opacity={e}
        translateX={150 * (1 - e)}
      >
        <CardSweep start={4} duration={12} />
      </ScreenStage>

      <Eyebrow start={12}>What the agent sees</Eyebrow>

      <Caption
        start={40}
        lines={["Show them their grid.", "Best recruiting tool you've got."]}
      />

      {/* One frame of white on the cut in, to hide the seam from Retention. */}
      {frame === 0 ? (
        <AbsoluteFill style={{ background: "#FFFFFF", opacity: 0.16 }} />
      ) : null}
    </AbsoluteFill>
  );
};
