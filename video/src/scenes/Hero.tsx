import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { ScreenKey } from "@/components/landing/screens";
import { ScreenStage } from "../components/ScreenStage";
import { Bloom } from "../components/Atmosphere";
import { MaskUp } from "../components/Type";
import { DISPLAY, GOLD, TEXT } from "../lib/theme";
import { easeInOut, easeOut, enter, lerp, POP, SNAPPY } from "../lib/motion";

/**
 * Beats 28-34. The one beat that breathes.
 *
 * Everything on either side of this is cut to eight-frame entrances and hard
 * cuts on the beat. This scene opens with eight frames of complete stillness —
 * nothing on screen at all — and then moves slowly. Contrast is the only thing
 * that makes a "fast" edit feel fast; twenty-four seconds of uniform speed
 * reads as noise.
 *
 * The four screens fan out as a stack and then converge into one. The distinct
 * rotations matter more than they look like they should: four cards at the same
 * angle on a grid read as a spreadsheet loading, and four cards at -2, 1.5, -1
 * and 2.5 degrees read as paper dropped on a desk. Same positions, different
 * object.
 */
const STILL = 8;
const STAGGER = 2;
const CONVERGE_AT = 46;
const CONVERGE_LEN = 14;
const LINE_AT = 60;

const CARDS: { screen: ScreenKey; rotate: number; x: number; y: number }[] = [
  { screen: "contracting", rotate: -2, x: -46, y: -232 },
  { screen: "commissions", rotate: 1.5, x: 34, y: -78 },
  { screen: "retention", rotate: -1, x: -24, y: 78 },
  { screen: "grid", rotate: 2.5, x: 50, y: 232 },
];

export const Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 0 while fanned out, 1 once converged.
  const converge = lerp(
    frame,
    [CONVERGE_AT, CONVERGE_AT + CONVERGE_LEN],
    [0, 1],
    easeInOut,
  );

  const linePop = enter(frame, fps, 12, POP, LINE_AT);

  return (
    <AbsoluteFill>
      <Bloom y={40} intensity={0.3 * lerp(frame, [STILL, STILL + 14], [0, 1], easeOut)} />

      {CARDS.map((card, i) => {
        const at = STILL + i * STAGGER;
        const e = enter(frame, fps, 9, SNAPPY, at);

        /*
         * Converging means every card walks to the same place. The topmost card
         * stays opaque and the three under it fade as they arrive, so what is
         * left is one record rather than a pile — which is the line.
         */
        const x = card.x * (1 - converge);
        const y = card.y * (1 - converge) + 40 * (1 - e);
        const rotate = card.rotate * (1 - converge);
        const opacity = e * (i === 0 ? 1 : 1 - converge);

        return (
          <ScreenStage
            key={card.screen}
            screen={card.screen}
            fit={0.72}
            centerY={856}
            opacity={opacity}
            translateX={x}
            translateY={y}
            rotate={rotate}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 1230,
          textAlign: "center",
          transform: `scale(${0.94 + 0.06 * linePop})`,
        }}
      >
        <MaskUp start={LINE_AT} duration={11}>
          <span
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 86,
              lineHeight: 1.22,
              letterSpacing: "-0.03em",
              color: TEXT,
              display: "block",
            }}
          >
            One record.
          </span>
        </MaskUp>
        <MaskUp start={LINE_AT} delay={4} duration={11}>
          <span
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 86,
              lineHeight: 1.22,
              letterSpacing: "-0.03em",
              color: GOLD,
              display: "block",
            }}
          >
            Recruit to renewal.
          </span>
        </MaskUp>
      </div>
    </AbsoluteFill>
  );
};
