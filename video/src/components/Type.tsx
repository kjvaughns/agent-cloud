import React from "react";
import { useCurrentFrame } from "remotion";
import { BODY, DISPLAY, GOLD, MUTED, TEXT } from "../lib/theme";
import { easeOut, lerp } from "../lib/motion";

/**
 * Typography rules, in one place so they cannot drift scene to scene.
 *
 * Three to seven words on screen at once, two lines maximum, never a sentence.
 * Weight 600-700 rather than 800-900: heavy display weight is the consumer-app
 * register, and this segment — back-office software sold to people who run
 * agencies — reads lighter and tighter.
 *
 * `lineHeight` is never left to the browser. The single most common way a
 * caption ships broken is a descender clipped by a wrapper sized at 1.0.
 */
const LINE_HEIGHT = 1.22;

/**
 * Word-by-word punch-in.
 *
 * Each word: scale 1.12 -> 1.0, blur 8px -> 0, opacity 0 -> 1, over five
 * frames, staggered four frames apart. Five frames is 165ms — fast enough that
 * the line assembles rather than crawls.
 *
 * The blur is the expensive part and it is why this is capped at five frames
 * per word: `filter: blur()` is live only while a word is arriving, and every
 * word settles to `none` rather than to `blur(0px)`, so the filter is dropped
 * from the paint entirely once it has landed.
 */
export const PunchWords: React.FC<{
  lines: { words: string[]; color?: string }[];
  start?: number;
  size?: number;
  stagger?: number;
  perWord?: number;
  align?: "center" | "left";
}> = ({ lines, start = 0, size = 128, stagger = 4, perWord = 5, align = "center" }) => {
  const frame = useCurrentFrame();
  let index = 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        gap: size * 0.08,
      }}
    >
      {lines.map((line, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: align === "center" ? "center" : "flex-start",
            gap: size * 0.22,
          }}
        >
          {line.words.map((word) => {
            const at = start + index * stagger;
            index += 1;
            const t = lerp(frame, [at, at + perWord], [0, 1], easeOut);
            const blur = (1 - t) * 8;

            return (
              <span
                key={word + at}
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: size,
                  lineHeight: LINE_HEIGHT,
                  letterSpacing: "-0.03em",
                  color: line.color ?? TEXT,
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
      ))}
    </div>
  );
};

/**
 * Mask-up reveal — an overflow-hidden wrapper with the line sliding up inside.
 *
 * The restrained option, and the one to use for anything that has to feel
 * premium rather than energetic: hero lines, captions, the endcard. Nothing
 * fades; the line is simply uncovered.
 *
 * The wrapper needs vertical padding or the mask clips ascenders and
 * descenders, which is subtle enough to survive a still and obvious in motion.
 */
export const MaskUp: React.FC<{
  children: React.ReactNode;
  start: number;
  duration?: number;
  delay?: number;
}> = ({ children, start, duration = 9, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = lerp(frame, [start + delay, start + delay + duration], [0, 1], easeOut);

  return (
    <span
      style={{
        display: "block",
        overflow: "hidden",
        paddingTop: "0.14em",
        paddingBottom: "0.14em",
        marginTop: "-0.14em",
        marginBottom: "-0.14em",
      }}
    >
      <span
        style={{
          display: "block",
          transform: `translateY(${110 * (1 - t)}%)`,
        }}
      >
        {children}
      </span>
    </span>
  );
};

/**
 * A caption in the lower third.
 *
 * 85% of views are muted, so every claim in this video has to survive with the
 * sound off. If it is not written here it is not communicated.
 *
 * Positioned above the platform's bottom furniture — see SAFE_BOTTOM. Two lines
 * at 46px with a 1.22 line height end at y≈1402, which clears the 1536 line on
 * the vertical cut and the 1450 line of the square crop — see `LaunchSquare`.
 *
 * 46px rather than 52: at 52 the longest line in the cut wrapped to a third
 * line, and a caption is authored one line per line — a wrap means the writing
 * and the layout have quietly stopped agreeing about what the shot says.
 */
export const Caption: React.FC<{
  lines: string[];
  start: number;
  size?: number;
  top?: number;
  color?: string;
  accentLast?: boolean;
}> = ({ lines, start, size = 46, top = 1290, color = TEXT, accentLast = false }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      right: 70,
      top,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
    }}
  >
    {lines.map((line, i) => (
      <MaskUp key={line} start={start} delay={i * 3} duration={9}>
        <span
          style={{
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: size,
            lineHeight: LINE_HEIGHT,
            color: accentLast && i === lines.length - 1 ? GOLD : color,
            display: "block",
          }}
        >
          {line}
        </span>
      </MaskUp>
    ))}
  </div>
);

/** Small gold label above the payload. Sets the section without competing with it. */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  start: number;
  top?: number;
}> = ({ children, start, top = 376 }) => {
  const frame = useCurrentFrame();
  const t = lerp(frame, [start, start + 7], [0, 1], easeOut);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        textAlign: "center",
        opacity: t,
        transform: `translateY(${8 * (1 - t)}px)`,
      }}
    >
      <span
        style={{
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: 26,
          lineHeight: LINE_HEIGHT,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: GOLD,
        }}
      >
        {children}
      </span>
    </div>
  );
};

export const Sub: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 30,
}) => (
  <span
    style={{
      fontFamily: BODY,
      fontWeight: 400,
      fontSize: size,
      lineHeight: LINE_HEIGHT,
      color: MUTED,
    }}
  >
    {children}
  </span>
);
