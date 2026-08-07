import React from "react";
import { Composition } from "remotion";
import "./lib/fonts";
import "./tailwind.css";
import { FPS, TOTAL } from "./lib/timing";
import { Launch } from "./Launch";
import { LaunchSquare } from "./LaunchSquare";
import { HeroLoop } from "./HeroLoop";
import { Probe } from "./Probe";

/**
 * `TOTAL` is derived from the beat grid, not typed in. Change `BPM` in
 * `lib/timing.ts` and every composition's length moves with the edit.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Launch"
      component={Launch}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1080}
      height={1920}
    />

    <Composition
      id="LaunchSquare"
      component={LaunchSquare}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1080}
      height={1080}
    />

    <Composition
      id="HeroLoop"
      component={HeroLoop}
      durationInFrames={8 * FPS}
      fps={FPS}
      width={1920}
      height={1080}
    />

    {/* Measurement rig. Not a deliverable — see lib/anchors.ts. */}
    <Composition
      id="Probe"
      component={Probe}
      durationInFrames={1}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ screen: "contracting" as const }}
    />
  </>
);
