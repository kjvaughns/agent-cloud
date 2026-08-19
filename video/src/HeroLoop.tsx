import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { ScreenKey } from "@/components/landing/screens";
import { ScreenStage } from "./components/ScreenStage";
import { Bloom, Canvas, Grain, Vignette } from "./components/Atmosphere";
import { stage } from "./lib/space";

/**
 * An eight-second loop for the website hero. 1920x1080.
 *
 * Seamless by construction rather than by trimming: every animated value is a
 * sine or cosine of `theta = 2*PI * frame / durationInFrames`, so frame 240 is
 * numerically identical to frame 0 and the loop point cannot be seen. There is
 * no crossfade and nothing to line up by eye.
 *
 * No endcard, no captions, nothing that has to be read — a hero loop plays
 * behind headline copy and under a viewer's cursor, at whatever moment they
 * happen to arrive. Anything with a beginning would be missed by most of them.
 *
 * Deliberately slow. This is ambient; the launch cut is the one that sells.
 */
const CARDS: { screen: ScreenKey; rotate: number; x: number; y: number; phase: number }[] = [
  { screen: "contracting", rotate: -2.4, x: -430, y: -150, phase: 0 },
  { screen: "commissions", rotate: 1.8, x: 150, y: -252, phase: 1.9 },
  { screen: "retention", rotate: -1.2, x: -120, y: 168, phase: 3.4 },
  { screen: "grid", rotate: 2.8, x: 470, y: 62, phase: 5.1 },
];

export const HeroLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const theta = (frame / durationInFrames) * Math.PI * 2;

  return (
    <Canvas>
      <Bloom x={50} y={50} size={78} intensity={0.24} />

      {CARDS.map((c) => (
        <ScreenStage
          key={c.screen}
          stage={stage(c.screen, {
            fit: 0.66,
            centerY: 578,
            translateX: c.x + 14 * Math.cos(theta + c.phase),
            translateY: c.y + 20 * Math.sin(theta + c.phase),
          })}
          rotate={c.rotate + 0.9 * Math.sin(theta + c.phase)}
        />
      ))}

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <Vignette strength={0.16} />
        <Grain seamlessPeriod={durationInFrames} />
      </AbsoluteFill>
    </Canvas>
  );
};
