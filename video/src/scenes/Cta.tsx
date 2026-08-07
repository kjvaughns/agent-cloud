import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { MaskUp, Sub } from "../components/Type";
import { BODY, DISPLAY, GOLD, GOLD_BRIGHT, GREEN, TEXT } from "../lib/theme";
import { easeOut, enter, lerp, POP } from "../lib/motion";

/**
 * Beats 40-48. Where the mark finally earns its place.
 *
 * The cloud lands on a POP spring and then breathes at plus or minus two
 * percent — small enough that nobody consciously sees it and large enough that
 * the last four seconds are not a frozen JPEG, which is what the platform's
 * encoder does to a still endcard.
 *
 * The bloom behind the mark is a radial gradient, not a `box-shadow`. On a
 * 120-frame endcard that difference is most of the scene's render cost.
 */
const MARK_AT = 4;

const CloudMark: React.FC<{ scale: number }> = ({ scale }) => (
  <div style={{ position: "relative", width: 232, height: 232, transform: `scale(${scale})` }}>
    <div
      style={{
        position: "absolute",
        inset: -108,
        background:
          "radial-gradient(circle at 50% 50%, rgba(203,163,90,0.42) 0%, rgba(203,163,90,0.16) 38%, rgba(203,163,90,0) 70%)",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 56,
        background: `linear-gradient(150deg, ${GOLD_BRIGHT} 0%, ${GOLD} 58%, #A98446 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="132" height="132" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M6.6 18.5a4.1 4.1 0 0 1-.5-8.17 5.6 5.6 0 0 1 10.83-1.5 3.9 3.9 0 0 1 .57-.04 4.85 4.85 0 0 1 .3 9.71H6.6Z"
          fill="#1a1400"
        />
      </svg>
    </div>
  </div>
);

export const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = enter(frame, fps, 14, POP, MARK_AT);
  // Breathing, on a period that does not divide the beat, so it never appears
  // to be pulsing in time with anything.
  const breathe = 1 + 0.02 * Math.sin(((frame - MARK_AT) / 34) * Math.PI * 2);
  const markScale = (0.7 + 0.3 * pop) * (frame > MARK_AT + 14 ? breathe : 1);

  const dot = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((frame / 21) * Math.PI * 2));

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 566,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <CloudMark scale={markScale} />

        <div style={{ height: 74 }} />

        <MaskUp start={18} duration={11}>
          <span
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 96,
              lineHeight: 1.22,
              letterSpacing: "0.02em",
              color: TEXT,
              display: "block",
            }}
          >
            AGENT CLOUD
          </span>
        </MaskUp>

        <div style={{ height: 16 }} />

        <MaskUp start={24} duration={11}>
          <span
            style={{
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: 52,
              lineHeight: 1.24,
              color: GOLD,
              display: "block",
            }}
          >
            useagentcloud.com
          </span>
        </MaskUp>

        <div style={{ height: 46 }} />

        {/* Availability is data, not decoration — so it gets the app's own pill. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 32px",
            borderRadius: 999,
            border: "1px solid rgba(203,163,90,0.34)",
            background: "rgba(203,163,90,0.09)",
            opacity: lerp(frame, [32, 40], [0, 1], easeOut),
            transform: `translateY(${10 * (1 - lerp(frame, [32, 40], [0, 1], easeOut))}px)`,
          }}
        >
          <span
            style={{
              width: 15,
              height: 15,
              borderRadius: "50%",
              background: GREEN,
              opacity: dot,
              boxShadow: `0 0 12px rgba(74,222,128,${0.5 * dot})`,
            }}
          />
          <span
            style={{
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: 34,
              lineHeight: 1.24,
              color: TEXT,
            }}
          >
            Now taking founding agencies
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1292,
          textAlign: "center",
          opacity: lerp(frame, [40, 48], [0, 1], easeOut),
        }}
      >
        <Sub>Month to month · No contract · No overrides</Sub>
      </div>
    </AbsoluteFill>
  );
};
