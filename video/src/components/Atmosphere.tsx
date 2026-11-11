import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, alpha } from "../timeline";
import { lerp } from "../lib/motion";

/**
 * The three layers that stop a near-black background reading as a solid fill.
 *
 * A background that is just a colour is one of the loudest tells of generated
 * video. Near-black needs the gold bloom behind the product, grain at 2-4%, and
 * a 10-15% vignette — three layers minimum, and the colour has to come from
 * light behind the thing rather than from a fill on top of it.
 */

/**
 * Film grain.
 *
 * Not optional, and the cheapest production-value win available. Large flat
 * near-black fields — which is most of this video — band visibly once Instagram
 * re-encodes them. A few percent of noise gives the encoder something to hold
 * onto and the gradient survives.
 *
 * One static turbulence tile, translated a couple of pixels per frame.
 * Regenerating turbulence every frame would be correct and roughly a hundred
 * times the cost; at 30fps the two are indistinguishable.
 */
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E\")";

export const Grain: React.FC<{ opacity?: number; seamlessPeriod?: number }> = ({
  opacity = 0.035,
  seamlessPeriod,
}) => {
  const frame = useCurrentFrame();

  /*
   * Two nudge patterns. The default walks the tile with a pair of coprime
   * moduli, which never repeats over the length of the cut. A looping
   * composition passes its own duration and gets a sine instead, so the offset
   * at the last frame is exactly the offset at the first — otherwise the grain
   * is the one thing in an otherwise seamless loop that jumps.
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
 * The gold bloom behind the product.
 *
 * A radial gradient, not a large `box-shadow` and not a `filter: blur()`.
 * Shadows and blurs are the render bottleneck in this genre — a single soft
 * shadow behind a card that is on screen for thirty seconds costs more than
 * every animated transform in the video put together. A gradient is a plain
 * paint, and at this softness the two are indistinguishable.
 *
 * It reads as light rather than as a fill because it never reaches full opacity
 * and never gets a hard edge. This is the exception to "gold means something
 * resolved": light behind the product is not the accent, it is the room.
 */
export const Bloom: React.FC<{
  x?: number;
  y?: number;
  size?: number;
  intensity?: number;
}> = ({ x = 50, y = 46, size = 62, intensity = 0.3 }) => (
  <AbsoluteFill
    style={{
      /*
       * Built from `accentLt`, not `accent`. The accent is a saturated,
       * slightly olive gold; spread thinly across a near-black field at low
       * opacity it stops reading as light and starts reading as a brown smear.
       * The lighter, yellower tint reads as a source behind the product, which
       * is the entire job — colour from light, never from a fill.
       */
      background: `radial-gradient(${size}% ${size * 0.58}% at ${x}% ${y}%, ${alpha(C.accentLt, intensity)} 0%, ${alpha(C.accentLt, intensity * 0.34)} 26%, ${alpha(C.accentLt, 0)} 62%)`,
      pointerEvents: "none",
    }}
  />
);

/** Tight vignette. Enough to hold the eye, not enough to notice. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.13 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(72% 58% at 50% 48%, ${alpha(C.bg, 0)} 40%, ${alpha(C.bg, strength * 2.4)} 100%)`,
      pointerEvents: "none",
    }}
  />
);

/** The canvas. Everything sits on this. */
export const Canvas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill className="dark" style={{ backgroundColor: C.bg }}>
    {children}
  </AbsoluteFill>
);

/**
 * A band of light travelling across a card as it arrives.
 *
 * Goes INSIDE `ScreenStage`, as a child, in frame coordinates: it clips to the
 * card and scales with it. Run across the whole canvas instead and it stops
 * being a highlight on an object and becomes a diagonal wash over the video.
 */
export const CardSweep: React.FC<{
  start: number;
  duration: number;
  width?: number;
}> = ({ start, duration, width = 260 }) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + duration) return null;

  const t = (frame - start) / duration;
  const x = -width + t * (980 + width * 2);
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
          background: `linear-gradient(100deg, ${alpha(C.text, 0)} 0%, ${alpha(C.text, 0.1)} 45%, ${alpha(C.accentLt, 0.14)} 55%, ${alpha(C.text, 0)} 100%)`,
          opacity: fade,
          transform: "skewX(-12deg)",
        }}
      />
    </div>
  );
};

/**
 * Everything dims except one element.
 *
 * A flat sheet with a hole cut in it by a radial gradient mask, rather than
 * four positioned rectangles. The soft edge is what stops it reading as a
 * cut-out.
 */
export const Spotlight: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity: number;
  strength?: number;
}> = ({ cx, cy, rx, ry, opacity, strength = 0.55 }) => {
  if (opacity <= 0.001) return null;

  // `transparent` in a gradient is transparent *black* in some engines, which
  // grey-fringes the edge. Stating the alpha explicitly avoids it.
  const mask = `radial-gradient(${rx}px ${ry}px at ${cx}px ${cy}px, ${alpha(C.bg, 0)} 0%, ${alpha(C.bg, 0)} 62%, ${C.bg} 100%)`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.bg,
        opacity: strength * opacity,
        pointerEvents: "none",
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
};
