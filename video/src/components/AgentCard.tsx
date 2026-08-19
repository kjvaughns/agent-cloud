import React from "react";
import { C, R, T, alpha } from "../timeline";
import { BODY, DISPLAY } from "../lib/fonts";
import type { Rect } from "../lib/space";

/**
 * The main character.
 *
 * One rounded rectangle that never leaves the video. It does not cut away — it
 * transforms: a profile card in the hook, a request row inside Contracting, a
 * statement line inside Commissions, an at-risk row inside Retention, then
 * eight copies, then one, then the logo tile.
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
 *    unmounted and remounted with different children. Profile layout and row
 *    layout are both always rendered, at opacities that sum to one, inside a
 *    box whose width and height are continuous functions of frame.
 *
 * The last move is the payoff: the logo is already a rounded gold square, and
 * the card has been a rounded rectangle for thirty seconds. They are the same
 * shape, so the morph costs nothing and lands the thesis without narration.
 */

export type CardContent = {
  name: string;
  meta: string;
  /** Right-hand status text, once the card has become a row. */
  status?: string;
  statusTone?: "neutral" | "good" | "bad" | "accent";
  /** Middle column, once the card has become a row. */
  detail?: string;
};

export const AgentCard: React.FC<{
  rect: Rect;
  radius: number;
  content: CardContent;
  /** 0 = profile card, 1 = table row. Drives the content cross-fade. */
  rowness: number;
  /** 0 = card, 1 = logo tile. Drives the gold fill and the glyph. */
  logoness?: number;
  /** Border glow, 0 to 1. Gold only ever means something resolved. */
  glow?: number;
  opacity?: number;
  rotate?: number;
  /** Chip in the top-right of the profile layout — the licence stamp. */
  chip?: React.ReactNode;
  children?: React.ReactNode;
}> = ({
  rect,
  radius,
  content,
  rowness,
  logoness = 0,
  glow = 0,
  opacity = 1,
  rotate = 0,
  chip,
  children,
}) => {
  const profile = 1 - rowness;

  /*
   * Padding scales with the card's own height rather than being fixed. A row is
   * 35 canvas pixels tall at rest; 20px of padding would have nowhere to go and
   * the text would spill outside the box it is supposed to be inside.
   */
  const pad = Math.max(rect.h * 0.09, 6);

  const toneColor =
    content.statusTone === "good"
      ? C.good
      : content.statusTone === "bad"
        ? C.bad
        : content.statusTone === "accent"
          ? C.accent
          : C.muted;

  return (
    <div
      style={{
        position: "absolute",
        left: rect.cx - rect.w / 2,
        top: rect.cy - rect.h / 2,
        width: rect.w,
        height: rect.h,
        opacity,
        transform: `rotate(${rotate}deg)`,
        borderRadius: radius,
        /*
         * Always the surface colour. The gold arrives as the overlay below,
         * fading in with `logoness` — switching this to the gradient the moment
         * `logoness` left zero made the card snap fully gold on the first frame
         * of the morph, which turned a 30-frame transformation into a cut.
         */
        background: C.surface,
        border: `1px solid ${
          glow > 0 ? alpha(C.accent, 0.25 + 0.75 * glow) : alpha(C.line, 1 - logoness)
        }`,
        boxShadow: glow > 0 ? `0 0 ${24 * glow}px ${alpha(C.accent, 0.3 * glow)}` : undefined,
        overflow: "hidden",
      }}
    >
      {/* The gold fill fades in over the surface rather than replacing it, so
          the morph to the logo has no frame where the card is neither. */}
      {logoness > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: logoness,
            background: `linear-gradient(150deg, ${C.accentLt} 0%, ${C.accent} 58%, ${C.accent} 100%)`,
          }}
        />
      ) : null}

      {/* ── Profile layout ─────────────────────────────────────────────── */}
      {profile > 0.01 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: pad * 2,
            opacity: profile * (1 - logoness),
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: T.cardName,
              lineHeight: 1.24,
              letterSpacing: "-0.02em",
              color: C.text,
              whiteSpace: "nowrap",
            }}
          >
            {content.name}
          </div>
          <div
            style={{
              marginTop: pad * 0.6,
              fontFamily: BODY,
              fontWeight: 400,
              fontSize: T.cardMeta,
              lineHeight: 1.24,
              color: C.muted,
              whiteSpace: "nowrap",
            }}
          >
            {content.meta}
          </div>
          {chip ? (
            <div style={{ position: "absolute", right: pad * 2, top: pad * 2 }}>{chip}</div>
          ) : null}
        </div>
      ) : null}

      {/* ── Row layout ─────────────────────────────────────────────────── */}
      {rowness > 0.01 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            paddingLeft: pad * 2.4,
            paddingRight: pad * 2.4,
            opacity: rowness * (1 - logoness),
            display: "flex",
            alignItems: "center",
            gap: pad,
          }}
        >
          <span
            style={{
              flex: 2,
              minWidth: 0,
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: rect.h * 0.34,
              lineHeight: 1.24,
              color: C.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {content.name}
          </span>
          {/* Rendered only when there is something to say. An empty span still
              claims its `flex` share, which silently halves the width the name
              gets and ellipsises it — a layout bug that looks like a font bug. */}
          {content.detail ? (
            <span
              style={{
                flex: 2,
                minWidth: 0,
                fontFamily: BODY,
                fontSize: rect.h * 0.32,
                lineHeight: 1.24,
                color: C.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {content.detail}
            </span>
          ) : null}
          {content.status ? (
            <span
              style={{
                flexShrink: 0,
                fontFamily: BODY,
                fontWeight: 700,
                fontSize: rect.h * 0.3,
                lineHeight: 1.24,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: toneColor,
                background: alpha(toneColor, 0.14),
                borderRadius: R.pill,
                padding: `${rect.h * 0.1}px ${rect.h * 0.24}px`,
                whiteSpace: "nowrap",
              }}
            >
              {content.status}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── Logo glyph ─────────────────────────────────────────────────── */}
      {logoness > 0.01 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: logoness,
          }}
        >
          <CloudGlyph size={rect.h * 0.56} draw={logoness} />
        </div>
      ) : null}

      {children}
    </div>
  );
};

/**
 * The cloud, drawn rather than faded in.
 *
 * `strokeDashoffset` walks the outline on, then the fill arrives behind it. A
 * mark that draws itself reads as the video arriving somewhere; a mark that
 * fades in reads as a slide transition.
 */
export const CloudGlyph: React.FC<{ size: number; draw: number }> = ({ size, draw }) => {
  const LEN = 46;
  const t = Math.max(0, Math.min(1, (draw - 0.35) / 0.65));

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6.6 18.5a4.1 4.1 0 0 1-.5-8.17 5.6 5.6 0 0 1 10.83-1.5 3.9 3.9 0 0 1 .57-.04 4.85 4.85 0 0 1 .3 9.71H6.6Z"
        fill={C.bg}
        opacity={t}
        stroke={C.bg}
        strokeWidth="0.9"
        strokeLinejoin="round"
        strokeDasharray={LEN}
        strokeDashoffset={LEN * (1 - Math.max(0, Math.min(1, draw / 0.7)))}
      />
    </svg>
  );
};

/** The licence chip that falls onto the card in the hook. */
export const Chip: React.FC<{ label: string; lit: number }> = ({ label, lit }) => (
  <span
    style={{
      display: "inline-block",
      fontFamily: BODY,
      fontWeight: 700,
      fontSize: T.chip,
      lineHeight: 1.24,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: lit > 0 ? C.accent : C.muted,
      background: alpha(C.accent, 0.1 * lit),
      border: `1px solid ${lit > 0 ? alpha(C.accent, 0.4) : C.line}`,
      borderRadius: R.pill,
      padding: "8px 18px",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);
