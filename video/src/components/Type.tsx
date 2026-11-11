import React from "react";
import { useCurrentFrame } from "remotion";
import { C, T } from "../timeline";
import { BODY, DISPLAY } from "../lib/fonts";
import { easeOut, lerp } from "../lib/motion";

/**
 * Typography.
 *
 * Six captions in the whole video, two to four words each. They are anchor
 * points, not narration — the timeline is built around them and the job of
 * every other frame is getting between them.
 *
 * Weight 700 on display, and `lineHeight` is never left to the browser: the
 * single most common way a caption ships broken is a descender clipped by a
 * wrapper sized at 1.0.
 *
 * Every caption is spatially anchored to the thing it describes. Text that just
 * fades in with no relationship to the content is on the slop list, and it is
 * on it because it is the default an AI reaches for.
 */
const LINE_HEIGHT = 1.2;

/**
 * Word-by-word punch-in.
 *
 * Each word: scale 1.12 -> 1.0, blur 8px -> 0, opacity 0 -> 1, staggered. Fast
 * enough that the line assembles rather than crawls.
 *
 * The blur is the expensive part, and it is why the per-word budget is small:
 * `filter: blur()` is live only while a word is arriving, and every word
 * settles to `none` rather than to `blur(0px)`, so the filter drops out of the
 * paint entirely once it has landed.
 */
export const PunchWords: React.FC<{
  words: string[];
  at: number;
  duration: number;
  size?: number;
  color?: string;
  align?: "center" | "left";
}> = ({ words, at, duration, size = T.caption, color = C.text, align = "center" }) => {
  const frame = useCurrentFrame();
  const perWord = Math.max(4, Math.round(duration * 0.62));
  const stagger = words.length > 1 ? (duration - perWord) / (words.length - 1) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: size * 0.24,
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      {words.map((word, i) => {
        const start = at + i * stagger;
        const t = lerp(frame, [start, start + perWord], [0, 1], easeOut);
        const blur = (1 - t) * 8;
        return (
          <span
            key={word + i}
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: size,
              lineHeight: LINE_HEIGHT,
              letterSpacing: "-0.03em",
              color,
              opacity: t,
              transform: `scale(${1.12 - 0.12 * t})`,
              filter: blur > 0.05 ? `blur(${blur}px)` : "none",
              display: "inline-block",
              whiteSpace: "pre",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Mask-up reveal — an overflow-hidden wrapper with the line sliding up inside.
 *
 * The restrained option, for anything that has to feel premium rather than
 * energetic. Nothing fades; the line is uncovered. The wrapper needs vertical
 * padding or the mask clips ascenders and descenders — subtle enough to survive
 * a still and obvious in motion.
 */
export const MaskUp: React.FC<{
  children: React.ReactNode;
  at: number;
  duration: number;
}> = ({ children, at, duration }) => {
  const frame = useCurrentFrame();
  const t = lerp(frame, [at, at + duration], [0, 1], easeOut);

  return (
    <span
      style={{
        display: "block",
        overflow: "hidden",
        paddingTop: "0.16em",
        paddingBottom: "0.16em",
        marginTop: "-0.16em",
        marginBottom: "-0.16em",
      }}
    >
      <span style={{ display: "block", transform: `translateY(${110 * (1 - t)}%)` }}>
        {children}
      </span>
    </span>
  );
};

/**
 * A caption, positioned by the beat that owns it rather than by a global rule.
 *
 * `until` is not optional in practice. Six captions that only ever fade IN end
 * up stacked on top of each other by the climax, which is illegible and is the
 * kind of thing that survives every still you happen to check and then ruins
 * the render. Each caption leaves when its beat hands over.
 */
export const Caption: React.FC<{
  words: string[];
  at: number;
  duration: number;
  /** Frame the caption starts leaving. */
  until: number;
  outDuration: number;
  top: number;
  size?: number;
  color?: string;
}> = ({ words, at, duration, until, outDuration, top, size = T.caption, color = C.text }) => {
  const frame = useCurrentFrame();
  if (frame > until + outDuration) return null;

  const out = lerp(frame, [until, until + outDuration], [0, 1], easeOut);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        display: "flex",
        justifyContent: "center",
        opacity: 1 - out,
        transform: `translateY(${-22 * out}px)`,
      }}
    >
      <PunchWords words={words} at={at} duration={duration} size={size} color={color} />
    </div>
  );
};

export const Fine: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = T.fine,
}) => (
  <span
    style={{
      fontFamily: BODY,
      fontWeight: 400,
      fontSize: size,
      lineHeight: LINE_HEIGHT,
      color: C.muted,
    }}
  >
    {children}
  </span>
);
