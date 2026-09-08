import React from "react";
import { C, alpha } from "../timeline";
import { BODY, DISPLAY } from "../lib/fonts";
import type { Rect } from "../lib/space";
import type { Phase } from "../card-path";
import logoUrl from "@/assets/agent-cloud-logo.jpg";

/**
 * The main character.
 *
 * One rounded rectangle that never leaves the video. It does not cut away — it
 * transforms: a prospect card in the pipeline, the form on Post a Deal, a
 * policy row in the Book of Business, a leaderboard row, a commission payout,
 * Nova's subject line, then the logo tile.
 *
 * Two decisions make that work, and both are load-bearing:
 *
 * 1. **It is positioned in canvas space, always.** Never as a child of a
 *    screen. When it needs to sit inside a table row, the row's canvas rect is
 *    computed through `toCanvas` and the card is interpolated onto it. If the
 *    card were parented to the screen for some beats and to the canvas for
 *    others, every handover would be a discontinuity — and those are precisely
 *    the jumps that read as cheap.
 *
 * 2. **Its content cross-fades, its geometry interpolates.** The card is never
 *    unmounted and remounted with different children. Every phase's layout is
 *    passed in at once and drawn at an opacity taken from `weight`, inside a box
 *    whose width and height are continuous functions of frame.
 *
 * The last move is the payoff: the logo is already a rounded gold square, and
 * the card has been a rounded rectangle for thirty seconds. They are the same
 * shape, so the morph costs nothing and lands the thesis without narration.
 */
export const DealCard: React.FC<{
  rect: Rect;
  radius: number;
  /** How present each phase's content is. From `cardAt().weight`. */
  weight: Record<Phase, number>;
  /** What to draw for each phase. Absent phases draw nothing. */
  content: Partial<Record<Phase, React.ReactNode>>;
  /** Border glow, 0 to 1. Gold only ever means something resolved. */
  glow?: number;
  opacity?: number;
}> = ({ rect, radius, weight, content, glow = 0, opacity = 1 }) => {
  const logo = weight.logo;

  return (
    <div
      style={{
        position: "absolute",
        left: rect.cx - rect.w / 2,
        top: rect.cy - rect.h / 2,
        width: rect.w,
        height: rect.h,
        borderRadius: radius,
        /*
         * The surface is constant and the gold arrives as an overlay on top of
         * it. Switching `background` to the gradient the moment `logo > 0` puts
         * the card fully gold on frame one of a 26-frame morph — the shape then
         * animates underneath a fill that already finished, which reads as a
         * glitch rather than as a transformation.
         */
        background: C.surface,
        border: `1px solid ${glow > 0 ? alpha(C.accent, 0.25 + 0.55 * glow) : C.line}`,
        boxShadow:
          glow > 0
            ? `0 0 ${40 + 70 * glow}px ${alpha(C.accent, 0.16 * glow)}, 0 24px 60px rgba(0,0,0,0.5)`
            : "0 24px 60px rgba(0,0,0,0.5)",
        opacity,
        overflow: "hidden",
      }}
    >
      {/*
        The brand mark, arriving — the application's own asset, not a redraw.

        `object-fit: cover` matters here. The card is still 1036x47 when the
        morph starts and only becomes a 236px square at the end of it, so for
        most of the transition this shows a horizontal slice through the middle
        of the mark: a gold band with a sliver of cloud in it, resolving into
        the whole logo as the box squares up. Contain would letterbox the mark
        inside a wide dark row and read as a bug.
      */}
      {logo > 0.01 ? (
        <img
          src={logoUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: logo,
          }}
        />
      ) : null}

      {(Object.keys(content) as Phase[]).map((phase) => {
        const w = weight[phase];
        if (w <= 0.01) return null;
        return (
          <div
            key={phase}
            style={{
              position: "absolute",
              inset: 0,
              opacity: w,
              display: "flex",
              alignItems: "center",
            }}
          >
            {content[phase]}
          </div>
        );
      })}
    </div>
  );
};

/**
 * A table row's worth of content, at the row's own scale.
 *
 * Sized from the card's height rather than from a constant, because this same
 * component draws a 46px policy row and a 65px payout row and has to look like
 * it belongs in each. Text this small is texture, not information — the number
 * a beat is actually about is carried by `Readout`, large enough to read on a
 * phone.
 */
export const RowContent: React.FC<{
  h: number;
  cells: {
    text: string;
    grow: number;
    tone?: "text" | "muted" | "good" | "accent";
    bold?: boolean;
  }[];
}> = ({ h, cells }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: h * 0.18,
      width: "100%",
      padding: `0 ${h * 0.32}px`,
    }}
  >
    {cells.map((c, i) => (
      <span
        key={i}
        style={{
          flex: c.grow,
          minWidth: 0,
          fontFamily: BODY,
          fontWeight: c.bold ? 700 : 500,
          fontSize: h * 0.34,
          lineHeight: 1.3,
          color:
            c.tone === "muted"
              ? C.muted
              : c.tone === "good"
                ? C.good
                : c.tone === "accent"
                  ? C.accentLt
                  : C.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {c.text}
      </span>
    ))}
  </div>
);

/**
 * The one number a beat is about, at a size you can actually read.
 *
 * Necessary, not decorative. The product screens render at their natural 980px
 * layout width — that is what keeps the nav rail and the table headers alive —
 * so an 11px table cell lands at about 14px on a 1080px canvas, which is texture
 * on a desktop and invisible on a phone. The UI carries the context and this
 * carries the figure. Without it the Post a Deal and Finances beats are two
 * people watching a spreadsheet they cannot read.
 */
export const Readout: React.FC<{
  label: string;
  /** A node, not a string, so a beat can count its figure up rather than cut to it. */
  value: React.ReactNode;
  y: number;
  size: number;
  tone?: "accent" | "good" | "text";
  opacity?: number;
  sub?: string;
}> = ({ label, value, y, size, tone = "accent", opacity = 1, sub }) => {
  const color = tone === "good" ? C.good : tone === "text" ? C.text : C.accentLt;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y,
        textAlign: "center",
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: size * 0.28,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: C.muted,
          marginBottom: size * 0.12,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.05,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            fontFamily: BODY,
            fontWeight: 500,
            fontSize: size * 0.26,
            lineHeight: 1.3,
            color: C.muted,
            marginTop: size * 0.14,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};
