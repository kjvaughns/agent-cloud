import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Bloom, Canvas, CardSweep, Grain, Spotlight, Vignette } from "./components/Atmosphere";
import { AgentCard, Chip } from "./components/AgentCard";
import { Burst } from "./components/Burst";
import { Cursor } from "./components/Cursor";
import { ScreenStage } from "./components/ScreenStage";
import { Caption, Fine, MaskUp, PunchWords } from "./components/Type";
import { BODY, DISPLAY } from "./lib/fonts";
import { easeIn, easeInOut, easeOut, enter, lerp } from "./lib/motion";
import { buildWipe } from "./staging";
import { cardAt } from "./card-path";
import { C, CX, D, H, K, R, S, T, W, alpha } from "./timeline";

/**
 * The whole video, on one clock.
 *
 * There are no `<Sequence>` blocks here, and that is the central architectural
 * decision. The agent card is the main character and it never leaves the frame
 * — it transforms from a profile card into a request row into a statement line
 * into an at-risk row into eight copies into one into the logo. Cutting that
 * into seven sequences would put a mount/unmount boundary at every handover,
 * and those boundaries are exactly where a morph turns into a jump.
 *
 * So everything reads the absolute frame, the card's geometry is a continuous
 * function of it, and the screens arrive and leave around it.
 *
 * Layout follows the motion grammar in the build plan:
 *
 *   - every rectangle is rounded, one radius scale (`R`)
 *   - vertical motion is always UP; the card climbs 880 → 828 → 776 → 724
 *     and the screens position themselves around it (see `stageForCardY`)
 *   - the camera only pushes in, with exactly one pull-back at the very end
 *   - the card stays near frame centre at a similar size across every handover,
 *     which is what makes the cuts read as continuous
 *   - gold appears only when something resolves — four bursts, no decoration
 */

/** Only still needed here to size the spotlight around the converged card. */
const CLIMAX_W = 452;

const CAPTION_Y = 1332;

/**
 * The eight-way fan.
 *
 * Distinct rotations, not one repeated. Eight cards at the same angle on a grid
 * read as a spreadsheet loading; eight at these angles read as paper dropped on
 * a desk. Same positions, different object — it is the single cheapest thing
 * separating this from a cookie-cutter card grid.
 */
const FAN = [
  { dx: 0, dy: 0, rot: -2, name: "Marcus Bell" },
  { dx: -252, dy: -330, rot: 1.5, name: "Tasha Wynn" },
  { dx: 258, dy: -222, rot: -1, name: "Leo Márquez" },
  { dx: -238, dy: -110, rot: 2.5, name: "Priya Raman" },
  { dx: 248, dy: 8, rot: -1.8, name: "Nia Thompson" },
  { dx: -256, dy: 124, rot: 2, name: "Derrick Combs" },
  { dx: 236, dy: 238, rot: -2.4, name: "Sam Whitaker" },
  { dx: -244, dy: 352, rot: 1.2, name: "Rosa Iglesias" },
];

const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

/** Characters revealed so far, for text typing inside a row. */
const typed = (text: string, frame: number, at: number, duration: number) =>
  text.slice(0, Math.round(lerp(frame, [at, at + duration], [0, text.length])));

export const Launch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Progress through each handover, 0 to 1 ───────────────────────────────
  const pFan = lerp(frame, [K.fanOut, K.fanOut + D.fanOut], [0, 1], easeOut);
  const pConverge = lerp(frame, [K.converge, K.converge + D.converge], [0, 1], easeInOut);
  const pPull = lerp(frame, [K.pullBack, K.pullBack + D.pullBack], [0, 1], easeOut);

  /*
   * The camera. Pushes in across the whole video and pulls back exactly once,
   * on the logo. That single reversal is what makes the ending feel like an
   * ending rather than like the video stopping.
   */
  const camera = lerp(frame, [K.cardFadeIn, K.cardShrink], [1, 1.05], easeInOut) - 0.13 * pPull;

  /*
   * Geometry comes from `cardAt`, which is a pure function in its own module
   * so `npm run check:jank` can sample every frame of it and prove the path is
   * continuous. Duplicating the maths here would mean the checker validates one
   * implementation while the video renders another.
   */
  const { rect, radius, rowness, logoness, s1, s2, s3, build1, build2, build3 } = cardAt(frame);

  // ── What the card says, and when it resolves ─────────────────────────────
  const licenceLit = lerp(frame, [K.stampBurst, K.stampBurst + D.stampBurst], [0, 1], easeOut);

  const writingNo = typed("MOO-4481207", frame, K.typeWritingNum, D.typeWritingNum);
  const isActive = frame >= K.activeBurst;

  const variance = lerp(frame, [K.varianceCount, K.varianceCount + D.varianceCount], [0, -4180]);
  const recovered = frame >= K.varianceResolve;

  const risk = lerp(frame, [K.riskFall, K.riskFall + D.riskFall], [88, 24]);
  const saved = frame >= K.saveBurst;

  let content = { name: "Marcus Bell", meta: "Referral · 2d" } as Parameters<
    typeof AgentCard
  >[0]["content"];

  if (frame >= K.cardRise) {
    content = {
      name: "Marcus Bell",
      meta: "Referral · 2d",
      detail: frame >= K.typeWritingNum ? writingNo : "Mutual of Omaha",
      status: isActive ? "Active" : "Submitted",
      statusTone: isActive ? "good" : "neutral",
    };
  }
  if (frame >= K.travelUp) {
    content = {
      name: "Marcus Bell",
      meta: "Referral · 2d",
      detail: "TA_July_2026",
      status: recovered ? "Recovered" : money(variance),
      statusTone: recovered ? "accent" : "bad",
    };
  }
  if (frame >= K.travelUp2) {
    content = {
      name: "Marcus Bell",
      meta: "Referral · 2d",
      detail: "Angela Ruiz · month 3",
      status: saved ? "Saved" : String(Math.round(risk)),
      statusTone: saved ? "good" : "bad",
    };
  }

  const cardGlow = Math.max(
    lerp(frame, [K.stampBurst, K.stampBurst + D.stampBurst * 2], [1, 0], easeOut) *
      (frame >= K.stampBurst ? 1 : 0),
    lerp(frame, [K.activeBurst, K.activeBurst + D.activeBurst * 2], [1, 0], easeOut) *
      (frame >= K.activeBurst ? 1 : 0),
    lerp(frame, [K.varianceResolve, K.varianceResolve + D.varianceResolve * 2], [1, 0], easeOut) *
      (frame >= K.varianceResolve ? 1 : 0),
    lerp(frame, [K.saveBurst, K.saveBurst + D.saveBurst * 2], [1, 0], easeOut) *
      (frame >= K.saveBurst ? 1 : 0),
  );

  // ── Screen visibility ────────────────────────────────────────────────────
  const show1 = build1 * lerp(frame, [K.travelUp, K.travelUp + D.travelUp], [1, 0], easeIn);
  const show2 = build2 * lerp(frame, [K.travelUp2, K.travelUp2 + D.travelUp2], [1, 0], easeIn);
  const show3 = build3 * lerp(frame, [K.cardShrink, K.cardShrink + D.cardShrink], [1, 0], easeIn);

  const cardFade = enter(frame, fps, D.cardFadeIn, S.SNAP, K.cardFadeIn);
  const cardScale = 0.96 + 0.04 * cardFade;

  // ── The eight ────────────────────────────────────────────────────────────
  const fanned = frame >= K.fanOut && frame < K.morphToLogo;

  /*
   * At climax width the detail column has nowhere to go and ellipsises to
   * "An...". The card sheds it and keeps the name and the status, which is all
   * the beat is claiming anyway: one record, still on the books.
   */
  const climaxContent =
    frame >= K.cardShrink
      ? { name: FAN[0].name, meta: "", status: "Saved", statusTone: "good" as const }
      : content;

  return (
    <Canvas>
      {/*
        The bloom is welded to the subject rather than parked at a fixed spot.
        A warm radial gradient on near-black only reads as *light* when there is
        something in front of it to light; left in the middle of an empty frame
        while the card is small and elsewhere, it reads as a stain. So it tracks
        the card's centre and scales with its width.
      */}
      <Bloom
        x={(rect.cx / W) * 100}
        y={(rect.cy / H) * 100}
        size={Math.max(26, Math.min(58, (rect.w / W) * 92))}
        intensity={lerp(frame, [K.cardFadeIn, K.stampBurst], [0.05, 0.15], easeOut)}
      />

      <AbsoluteFill style={{ transform: `scale(${camera})` }}>
        {/* ── Screens ─────────────────────────────────────────────────── */}
        {show1 > 0.001 ? (
          <ScreenStage stage={s1} opacity={show1} clipPath={buildWipe(build1)}>
            <CardSweep start={K.frameBuild} duration={D.frameBuild} />
          </ScreenStage>
        ) : null}

        {show2 > 0.001 ? (
          <ScreenStage stage={s2} opacity={show2} clipPath={buildWipe(build2)}>
            <CardSweep start={K.frameBuild2} duration={D.frameBuild2} />
          </ScreenStage>
        ) : null}

        {show3 > 0.001 ? (
          <ScreenStage stage={s3} opacity={show3} clipPath={buildWipe(build3)}>
            <CardSweep start={K.frameBuild3} duration={D.frameBuild3} />
          </ScreenStage>
        ) : null}

        {/* The spotlight sits above the screen and below the card, so the row
            the card occupies stays lit while everything else drops away. */}
        <Spotlight
          cx={CX}
          cy={rect.cy}
          rx={Math.max(rect.w, CLIMAX_W) * 0.86}
          ry={rect.h * 1.9}
          opacity={
            lerp(frame, [K.spotlight, K.spotlight + D.spotlight], [0, 1], easeOut) *
            lerp(frame, [K.captionBooks, K.captionBooks + D.captionBooks], [1, 0], easeOut)
          }
        />

        {/* ── The eight, then the one ─────────────────────────────────── */}
        {fanned
          ? FAN.slice(1).map((f, i) => {
              const delay = (i / (FAN.length - 1)) * D.fanOut * 0.5;
              const t =
                lerp(
                  frame,
                  [K.fanOut + delay, K.fanOut + delay + D.fanOut * 0.5],
                  [0, 1],
                  easeOut,
                ) *
                (1 - pConverge);
              return (
                <AgentCard
                  key={f.rot}
                  rect={{
                    cx: rect.cx + f.dx * t,
                    cy: rect.cy + f.dy * t,
                    w: rect.w,
                    h: rect.h,
                  }}
                  radius={radius}
                  content={{ name: f.name, meta: "", status: "Saved", statusTone: "good" }}
                  rowness={1}
                  opacity={t}
                  rotate={f.rot * t}
                />
              );
            })
          : null}

        {/* ── The card itself. Always. ────────────────────────────────── */}
        <AgentCard
          rect={rect}
          radius={radius}
          content={climaxContent}
          rowness={rowness}
          logoness={logoness}
          glow={cardGlow}
          opacity={cardFade}
          rotate={FAN[0].rot * pFan * (1 - pConverge)}
          chip={
            frame >= K.stampFall ? (
              <div
                style={{
                  transform: `translateY(${lerp(frame, [K.stampFall, K.stampFall + D.stampFall], [-220, 0], easeOut)}px)`,
                  opacity: lerp(frame, [K.stampFall, K.stampFall + D.stampFall], [0, 1], easeOut),
                }}
              >
                <Chip label="Licensed" lit={licenceLit} />
              </div>
            ) : null
          }
        >
          {/* The hook's card scales as it fades up — inside the card so it
              does not fight the geometry interpolation above. */}
          <div style={{ position: "absolute", inset: 0, transform: `scale(${cardScale})` }} />
        </AgentCard>

        {/* ── The four resolutions. Gold, and only here. ──────────────── */}
        <Burst
          x={rect.cx + rect.w * 0.32}
          y={rect.cy - rect.h * 0.22}
          at={K.stampBurst}
          duration={D.stampBurst}
        />
        <Burst
          x={rect.cx + rect.w * 0.36}
          y={rect.cy}
          at={K.activeBurst}
          duration={D.activeBurst}
          color={C.good}
        />
        <Burst
          x={rect.cx + rect.w * 0.38}
          y={rect.cy}
          at={K.varianceResolve}
          duration={D.varianceResolve}
        />
        <Burst
          x={rect.cx + rect.w * 0.4}
          y={rect.cy}
          at={K.saveBurst}
          duration={D.saveBurst}
          color={C.good}
        />

        <Cursor
          from={{ x: CX + 420, y: 1560 }}
          to={{ x: rect.cx - rect.w * 0.3, y: rect.cy }}
          travelStart={K.cursorTravel}
          travelFrames={D.cursorTravel}
          clickAt={K.cursorClick}
          exitAt={K.typeWritingNum + D.typeWritingNum}
        />
      </AbsoluteFill>

      {/* ── Captions. Six, and nothing else gets words. ─────────────────── */}
      <Caption
        words={["One", "agent."]}
        at={K.captionAgent}
        duration={D.captionAgent}
        until={K.cardRise}
        outDuration={D.captionOut}
        top={1150}
      />
      <Caption
        words={["Ready", "to", "sell."]}
        at={K.captionReady}
        duration={D.captionReady}
        until={K.travelUp}
        outDuration={D.captionOut}
        top={CAPTION_Y}
      />
      <Caption
        words={["Paid", "right."]}
        at={K.captionPaid}
        duration={D.captionPaid}
        until={K.travelUp2}
        outDuration={D.captionOut}
        top={CAPTION_Y}
      />
      <Caption
        words={["Still", "on", "the", "books."]}
        at={K.captionBooks}
        duration={D.captionBooks}
        until={K.cardShrink}
        outDuration={D.captionOut}
        top={CAPTION_Y}
      />

      {/* ── Climax ──────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1064,
          textAlign: "center",
          opacity: lerp(frame, [K.morphToLogo, K.morphToLogo + D.morphToLogo], [1, 0], easeOut),
        }}
      >
        <PunchWords
          words={["One", "record."]}
          at={K.climaxLine}
          duration={D.climaxLine}
          size={T.climax}
        />
        <div style={{ height: T.climax * 0.16 }} />
        <PunchWords
          words={["Recruit", "to", "renewal."]}
          at={K.climaxLine + D.climaxLine}
          duration={D.climaxLine}
          size={T.climax}
          color={C.accent}
        />
      </div>

      {/* ── Close ───────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 806,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <MaskUp at={K.wordmark} duration={D.wordmark}>
          <span
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: T.wordmark,
              lineHeight: 1.2,
              letterSpacing: "0.02em",
              color: C.text,
              display: "block",
            }}
          >
            AGENT CLOUD
          </span>
        </MaskUp>

        <div style={{ height: 18 }} />

        <MaskUp at={K.url} duration={D.url}>
          <span
            style={{
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: T.url,
              lineHeight: 1.2,
              color: C.accent,
              display: "block",
            }}
          >
            useagentcloud.com
          </span>
        </MaskUp>

        <div style={{ height: 46 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 32px",
            borderRadius: R.pill,
            border: `1px solid ${alpha(C.accent, 0.34)}`,
            background: alpha(C.accent, 0.09),
            opacity: lerp(frame, [K.pill, K.pill + D.pill], [0, 1], easeOut),
            transform: `translateY(${16 * (1 - lerp(frame, [K.pill, K.pill + D.pill], [0, 1], easeOut))}px)`,
          }}
        >
          <span
            style={{
              width: 15,
              height: 15,
              borderRadius: "50%",
              background: C.good,
              opacity: 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((frame / (D.pill * 2)) * Math.PI)),
            }}
          />
          <span
            style={{
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: T.pill,
              lineHeight: 1.2,
              color: C.text,
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
          top: 1300,
          textAlign: "center",
          opacity: lerp(frame, [K.holdClose, K.holdClose + D.pill], [0, 1], easeOut),
        }}
      >
        <Fine>Month to month · No contract · No overrides</Fine>
      </div>

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <Vignette />
        <Grain />
      </AbsoluteFill>
    </Canvas>
  );
};
