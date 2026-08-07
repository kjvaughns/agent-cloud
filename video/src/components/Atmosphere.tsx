import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BG, GOLD } from "../lib/theme";
import { lerp } from "../lib/motion";

/**
 * Film grain.
 *
 * Not optional, and the cheapest production-value win available. Large flat
 * near-black fields — which is most of this video — band visibly once Instagram
 * re-encodes them. A few percent of noise gives the encoder something to hold
 * onto and the gradient survives.
 *
 * The noise is one static SVG turbulence tile, translated a couple of pixels
 * per frame. Regenerating turbulence every frame would be the correct way to do
 * it and roughly a hundred times the cost; moving a tile is indistinguishable
 * at 30fps.
 */
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E\")";

export const Grain: React.FC<{ opacity?: number; seamlessPeriod?: number }> = ({
  opacity = 0.035,
  seamlessPeriod,
}) => {
  const frame = useCurrentFrame();

  /*
   * Two nudge patterns.
   *
   * The default walks the tile with a pair of coprime moduli, which never
   * repeats over the length of the cut. A looping composition passes its own
   * duration instead and gets a sine, so the offset at the last frame is
   * exactly the offset at the first — otherwise the grain is the one thing in
   * an otherwise seamless loop that jumps.
   */
  const theta = seamlessPeriod ? (frame / seamlessPeriod) * Math.PI * 2 : 0;
  const dx = seamlessPeriod ? Math.round(5 * Math.sin(theta)) : ((frame * 7) % 11) - 5;
  const dy = seamlessPeriod ? Math.round(4 * Math.cos(theta)) : ((frame * 13) % 9) - 4;

  return (
    <AbsoluteFill
      style={{
        backgroundImage: NOISE,
        backgroundRepeat: "repeat",
        opacity,
        mixBlendMode: "overlay",
        transform: `translate(${dx}px, ${dy}px)`,
        // Oversized so the nudge never exposes an edge.
        left: -20,
        top: -20,
        right: -20,
        bottom: -20,
        width: "auto",
        height: "auto",
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * The gold bloom behind the card.
 *
 * A radial gradient, not a 200px `box-shadow` and not a `filter: blur()`.
 * Shadows and blurs are the render bottleneck in this genre — a single large
 * soft shadow behind a card that is on screen for twenty seconds costs more
 * than every animated transform in the video put together. A gradient is a
 * plain paint, and at this softness the two are indistinguishable.
 *
 * The colour reads as light rather than as a fill because it never reaches full
 * opacity and never gets a hard edge.
 */
export const Bloom: React.FC<{
  x?: number;
  y?: number;
  size?: number;
  intensity?: number;
}> = ({ x = 50, y = 46, size = 62, intensity = 0.3 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(${size}% ${size * 0.62}% at ${x}% ${y}%, rgba(203,163,90,${intensity}) 0%, rgba(203,163,90,${intensity * 0.4}) 32%, rgba(203,163,90,0) 68%)`,
      pointerEvents: "none",
    }}
  />
);

/** Tight vignette. 10-15%, which is enough to hold the eye and not enough to notice. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.13 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(72% 58% at 50% 48%, rgba(0,0,0,0) 40%, rgba(0,0,0,${strength * 2.4}) 100%)`,
      pointerEvents: "none",
    }}
  />
);

/** The canvas. Everything sits on this. */
export const Canvas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill className="dark" style={{ backgroundColor: BG }}>
    {children}
  </AbsoluteFill>
);

/**
 * A band of light travelling across a card as it arrives.
 *
 * 8-14 frames, once, on entrance. It reads as the card catching a light source
 * that exists off-frame, which is what sells a flat rectangle as an object.
 *
 * Goes INSIDE `ScreenStage`, as a child, in frame coordinates: it clips to the
 * card and scales with it. Run across the whole canvas instead and it stops
 * being a highlight on an object and becomes a diagonal wash over the video —
 * which is both the wrong read and, at 1080x1920, enormous.
 */
export const CardSweep: React.FC<{
  start: number;
  duration?: number;
  width?: number;
}> = ({ start, duration = 12, width = 260 }) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + duration) return null;

  const t = (frame - start) / duration;
  const x = lerp(t, [0, 1], [-width, 980 + width]);
  const fade = lerp(t, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: "-25%",
          height: "150%",
          left: x,
          width,
          background:
            "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 45%, rgba(232,199,122,0.14) 55%, rgba(255,255,255,0) 100%)",
          opacity: fade,
          transform: "skewX(-12deg)",
        }}
      />
    </div>
  );
};

/**
 * One frame of light on a cut.
 *
 * At 30fps a single frame is 33ms — below the threshold at which you register
 * it as a flash and above the threshold at which it does its job, which is to
 * hide the seam where two shots are spliced.
 */
export const Flash: React.FC<{ at: number; opacity?: number; color?: string }> = ({
  at,
  opacity = 0.3,
  color = GOLD,
}) => {
  const frame = useCurrentFrame();
  if (frame !== at) return null;
  return <AbsoluteFill style={{ background: color, opacity, pointerEvents: "none" }} />;
};
