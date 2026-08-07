import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { FIT, ScreenStage } from "../components/ScreenStage";
import { Cursor, RowHighlight } from "../components/Cursor";
import { Bloom, CardSweep } from "../components/Atmosphere";
import { Caption, Eyebrow } from "../components/Type";
import { CONTRACTING_QUEUE, CONTRACTING_ROW_RECT } from "../lib/anchors";
import { easeIn, easeOut, enter, lerp, SNAPPY } from "../lib/motion";

/**
 * Beats 4-10. The product arrives.
 *
 * Three things happen and then it holds:
 *
 *   f0-8    the card slams in — scale 1.08 -> 1.0 on a SNAPPY spring, with a
 *           mild 3D establish easing flat over the first 20 frames. Eight
 *           frames, because that is how long a real interface takes.
 *   f22-31  punch in on the request queue, then stop moving.
 *   f30-60  a pointer crosses and clicks a row, and the row responds.
 *
 * Everything between those is dead air on purpose. Removing the stillness makes
 * the scene faster and completely illegible.
 *
 * The last five frames are the outgoing half of the zoom-through into
 * Commissions: the queue accelerates toward the lens and blurs, and the cut
 * lands at peak blur. See `Commissions.tsx` for the other half.
 */
const PUNCH_IN = 22;
const PUNCH_LEN = 9;
const PUNCH_TO = 1.9;

const OUT_AT = 85;
const OUT_LEN = 5;
const CLICK_AT = 53;

export const Contracting: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const e = enter(frame, fps, 8, SNAPPY);
  const settle = lerp(frame, [0, 20], [0, 1], easeOut);

  const punchT = lerp(frame, [PUNCH_IN, PUNCH_IN + PUNCH_LEN], [0, 1], easeOut);
  // The zoom-through. Accelerating, so it leaves rather than drifts.
  const outT = lerp(frame, [OUT_AT, OUT_AT + OUT_LEN], [0, 1], easeIn);

  const zoom = (1 + (PUNCH_TO - 1) * punchT) * (1 + 4.9 * outT);

  return (
    <AbsoluteFill>
      <Bloom y={46} intensity={0.26} />
      <ScreenStage
        screen="contracting"
        anchor={CONTRACTING_QUEUE}
        zoom={zoom}
        pull={Math.max(punchT, outT)}
        blur={8 * outT}
        opacity={e}
        fit={FIT * (1.08 - 0.08 * e)}
        rotateY={-7 * (1 - settle)}
        rotateX={3 * (1 - settle)}
      >
        <CardSweep start={3} duration={13} />
        <RowHighlight rect={CONTRACTING_ROW_RECT} at={CLICK_AT} />
      </ScreenStage>

      <Eyebrow start={12}>Contracting</Eyebrow>

      {/*
        The pointer crosses from the lower right — 22 frames, three quarters of
        a second, which is the cross-screen figure — presses at f53, and the row
        lights the moment it does. A click with no response under it reads as a
        broken product rather than as a demonstration of one.

        The target is where the Transamerica row ends up once the punch has
        settled: the anchor sits at canvas (540, 900), and the row's label is
        138 frame-pixels to its left, each worth FIT * PUNCH_TO canvas pixels.
      */}
      <Cursor
        from={{ x: 940, y: 1560 }}
        to={{ x: 540 - 138 * FIT * PUNCH_TO, y: 900 - 11 * FIT * PUNCH_TO }}
        travelStart={30}
        travelFrames={22}
        clickAt={CLICK_AT}
        exitAt={78}
      />

      <Caption
        start={36}
        lines={["Every carrier request in one queue.", "With a name on it and a clock running."]}
      />
    </AbsoluteFill>
  );
};
