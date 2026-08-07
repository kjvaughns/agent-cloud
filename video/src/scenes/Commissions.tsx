import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ScreenStage } from "../components/ScreenStage";
import { Bloom, Flash } from "../components/Atmosphere";
import { Caption, Eyebrow } from "../components/Type";
import { COMMISSIONS_VARIANCE } from "../lib/anchors";
import { easeOut, lerp } from "../lib/motion";

/**
 * Beats 10-16, and the incoming half of the zoom-through.
 *
 * The signature move, built as a nested scale match rather than from a preset:
 *
 *   1. Contracting's last five frames accelerate the Transamerica row toward
 *      the lens, blurring to 8px.
 *   2. The cut lands on peak blur, with one frame of gold at 30% over it.
 *   3. This scene opens at 2.2x anchored on the Transamerica *statement* row —
 *      the same carrier, one system over — and decelerates to 1.0 as the blur
 *      comes off.
 *
 * The two halves have different curves on purpose: accelerating out,
 * decelerating in. Matching them would read as one continuous camera move,
 * which is not what a cut is for.
 *
 * `crossZoom()` and `dreamyZoom()` cannot do this — they zoom to frame centre,
 * not to an element — and the newer presets are built on HTML-in-canvas, which
 * needs Chrome 149 with a flag to preview and does not work in Firefox or
 * Safari at all. Hand-built, this depends on nothing.
 */
const IN_LEN = 7;
const PUNCH_IN = 28;
const PUNCH_LEN = 9;
const PUNCH_TO = 1.75;

export const Commissions: React.FC = () => {
  const frame = useCurrentFrame();

  /*
   * The arrival runs the punch mechanism backwards: it opens fully closed on
   * the anchor (2.2x, pulled to centre) and releases to the establishing shot.
   * Expressing it that way rather than as a separate transform is what keeps
   * the anchor point continuous across the cut — the whole reason the move
   * reads as travelling through the UI instead of as two zooms.
   */
  const arriveT = lerp(frame, [0, IN_LEN], [1, 0], easeOut);
  const punchT = lerp(frame, [PUNCH_IN, PUNCH_IN + PUNCH_LEN], [0, 1], easeOut);

  const zoom = (1 + 1.2 * arriveT) * (1 + (PUNCH_TO - 1) * punchT);

  return (
    <AbsoluteFill>
      <Bloom x={58} y={46} intensity={0.28} />
      <ScreenStage
        screen="commissions"
        anchor={COMMISSIONS_VARIANCE}
        zoom={zoom}
        pull={Math.max(arriveT, punchT)}
        blur={8 * arriveT}
      />

      <Eyebrow start={12}>Commissions</Eyebrow>

      {/*
        "Shorted you" is a claim about arithmetic, and the screen behind it is
        the arithmetic: 275 of 281 statement lines matched, six on the
        Transamerica file that did not. The punch-in lands on the exception,
        not on the headline number.
      */}
      <Caption start={40} lines={["The carrier shorted you.", "Now you'd know."]} />

      <Flash at={0} opacity={0.3} />
    </AbsoluteFill>
  );
};
