import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FIT, ScreenStage } from "../components/ScreenStage";
import { Spotlight } from "../components/Cursor";
import { Bloom, CardSweep } from "../components/Atmosphere";
import { Caption, Eyebrow } from "../components/Type";
import { RETENTION_QUEUE } from "../lib/anchors";
import { easeOut, lerp } from "../lib/motion";

/**
 * Beats 16-22.
 *
 * Enters on a mask wipe rather than a transform: a `clip-path` inset opening
 * left to right over eight frames, so the panel reads as the product drawing
 * itself in rather than as a video transition applied on top of it. That
 * distinction is most of the difference between a product reel and a template.
 *
 * Then the spotlight. Everything dims to 55% except the top row of the at-risk
 * queue, which is the one row the caption is about — Angela Ruiz, month three,
 * nobody has spoken to her in 74 days. Dimming is a stronger pointer than an
 * arrow and it does not add furniture to the frame.
 */
const WIPE = 8;
const PUNCH_IN = 20;
const PUNCH_LEN = 9;
const PUNCH_TO = 1.5;

export const Retention: React.FC = () => {
  const frame = useCurrentFrame();

  const wipe = lerp(frame, [0, WIPE], [0, 1], easeOut);
  const punchT = lerp(frame, [PUNCH_IN, PUNCH_IN + PUNCH_LEN], [0, 1], easeOut);

  /*
   * Where the top row ends up on the canvas once the punch has settled.
   *
   * The punch centres RETENTION_QUEUE on the card's middle — canvas (540, 900).
   * The top row sits 38 frame-pixels above that anchor, and every frame pixel
   * is worth `FIT * zoom` canvas pixels once scaled.
   */
  const scale = FIT * PUNCH_TO;
  const rowY = 900 - 38 * scale;

  return (
    <AbsoluteFill>
      <Bloom x={46} y={46} intensity={0.24} />
      <ScreenStage
        screen="retention"
        anchor={RETENTION_QUEUE}
        zoom={1 + (PUNCH_TO - 1) * punchT}
        pull={punchT}
        clipPath={`inset(0 ${(1 - wipe) * 100}% 0 0 round 16px)`}
        translateX={-26 * (1 - wipe)}
      >
        <CardSweep start={6} duration={12} />
      </ScreenStage>

      <Spotlight cx={560} cy={rowY} rx={560} ry={70} at={44} until={78} strength={0.55} />

      <Eyebrow start={12}>Retention</Eyebrow>

      <Caption start={50} lines={["Find the lapse before the draft fails."]} />
    </AbsoluteFill>
  );
};
