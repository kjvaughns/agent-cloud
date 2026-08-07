import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { PunchWords } from "../components/Type";
import { BODY, GOLD, GREEN, TEXT } from "../lib/theme";
import { easeOut, lerp } from "../lib/motion";

/**
 * Beats 34-40. Back to fast, and back to black.
 *
 * The three claims are the objections an agency owner has already formed by
 * this point in the video, answered in the order they occur to them. They are
 * full sentences rather than fragments because each one is a commitment, and a
 * commitment that has been trimmed for rhythm reads as weasel wording.
 */
const LINES = [
  "No override. Not one basis point.",
  "We don't recruit your agents.",
  "Your book. Your data. Export any time.",
];

const LIST_AT = 36;
const LIST_STAGGER = 6;

/** A check that draws itself, rather than appearing. */
const Check: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const LEN = 26;
  const t = lerp(frame, [start, start + 9], [0, 1], easeOut);

  return (
    <svg width="46" height="46" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10.5" fill="rgba(74,222,128,0.13)" opacity={t} />
      <path
        d="M7 12.4 L10.6 16 L17 8.6"
        fill="none"
        stroke={GREEN}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // The stroke is drawn by walking the dash offset back to zero. A path
        // that fades in is a graphic; a path that draws is a confirmation.
        strokeDasharray={LEN}
        strokeDashoffset={LEN * (1 - t)}
      />
    </svg>
  );
};

export const NotYourImo: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 520,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <PunchWords
          start={4}
          size={112}
          lines={[{ words: ["We're", "software."] }, { words: ["Not", "your", "IMO."], color: GOLD }]}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 108,
          right: 108,
          top: 1052,
          display: "flex",
          flexDirection: "column",
          gap: 40,
        }}
      >
        {LINES.map((line, i) => {
          const at = LIST_AT + i * LIST_STAGGER;
          const t = lerp(frame, [at, at + 7], [0, 1], easeOut);
          return (
            <div
              key={line}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                opacity: t,
                transform: `translateX(${-18 * (1 - t)}px)`,
              }}
            >
              <Check start={at} />
              <span
                style={{
                  fontFamily: BODY,
                  fontWeight: 600,
                  fontSize: 44,
                  lineHeight: 1.24,
                  color: TEXT,
                }}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
