import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Canvas, Grain, Vignette } from "./components/Atmosphere";
import { span } from "./lib/timing";
import { Hook } from "./scenes/Hook";
import { Contracting } from "./scenes/Contracting";
import { Commissions } from "./scenes/Commissions";
import { Retention } from "./scenes/Retention";
import { Grid } from "./scenes/Grid";
import { Hero } from "./scenes/Hero";
import { NotYourImo } from "./scenes/NotYourImo";
import { Cta } from "./scenes/Cta";

/**
 * The edit.
 *
 * Every boundary is an absolute `Sequence` placed on the beat grid, and about
 * 70% of them are hard cuts. Nothing here uses `TransitionSeries`, and that is
 * a decision rather than an omission:
 *
 *   - `TransitionSeries` consumes frames from both neighbours
 *     (total = seqA + seqB − transition), so a fixed beat grid and a series of
 *     transitions fight each other, and the grid loses a frame at a time until
 *     the cuts drift audibly off the track.
 *   - The one transition that matters here is the element-anchored
 *     zoom-through, and both halves of it live inside the scenes they belong
 *     to — Contracting accelerates away over its last five frames, Commissions
 *     decelerates in over its first seven. Each scene owns its own curve, reads
 *     its own local frame, and the cut stays exactly on the beat.
 *
 * `@remotion/transitions` is installed and unused. It is left in `package.json`
 * because anything added later — a whip pan between two new scenes, say — will
 * want it, and because `springTiming({durationRestThreshold: 0.001})` is the
 * right way to drive one if you do (the 0.005 default cuts off visibly).
 *
 * Scenes are pure: none reads absolute time, so any of them can be moved,
 * re-ordered or dropped into `HeroLoop` without editing it.
 */
export const Launch: React.FC = () => (
  <Canvas>
    <Sequence {...span("hook")} name="Hook">
      <Hook />
    </Sequence>
    <Sequence {...span("contracting")} name="Contracting">
      <Contracting />
    </Sequence>
    <Sequence {...span("commissions")} name="Commissions">
      <Commissions />
    </Sequence>
    <Sequence {...span("retention")} name="Retention">
      <Retention />
    </Sequence>
    <Sequence {...span("grid")} name="Grid">
      <Grid />
    </Sequence>
    <Sequence {...span("hero")} name="Hero">
      <Hero />
    </Sequence>
    <Sequence {...span("imo")} name="Not your IMO">
      <NotYourImo />
    </Sequence>
    <Sequence {...span("cta")} name="CTA">
      <Cta />
    </Sequence>

    {/*
      Grain and vignette sit above every scene and below nothing. The grain in
      particular has to be the last thing composited or the flat near-black
      fields underneath it band once the platform re-encodes.
    */}
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Vignette />
      <Grain />
    </AbsoluteFill>
  </Canvas>
);
