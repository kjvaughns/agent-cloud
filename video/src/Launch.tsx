import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { DEAL } from "@/components/landing/screens";
import { money } from "@/lib/format";
import { Bloom, Canvas, CardSweep, Grain, Vignette } from "./components/Atmosphere";
import { Burst } from "./components/Burst";
import { Cursor } from "./components/Cursor";
import { CloudGlyph, DealCard, Readout, RowContent } from "./components/DealCard";
import { ScreenStage } from "./components/ScreenStage";
import { Caption, Fine, MaskUp, PunchWords } from "./components/Type";
import { CountUp, Typewriter } from "./components/Typewriter";
import { BODY, DISPLAY } from "./lib/fonts";
import { easeIn, easeOut, lerp } from "./lib/motion";
import { buildWipe } from "./staging";
import { PHASE_H, SCREEN_PHASES, cameraAt, cardAt } from "./card-path";
import { C, CX, D, H, K, LAYOUT, R, T, alpha } from "./timeline";

/**
 * The whole video, on one clock.
 *
 * There are no `<Sequence>` blocks here, and that is the central architectural
 * decision. The deal is the main character and it never leaves the frame — it
 * transforms from a prospect card into the Post a Deal form into a policy row
 * into a leaderboard row into a commission payout into Nova's subject line into
 * the logo. Cutting that into eight sequences would put a mount/unmount
 * boundary at every handover, and those boundaries are exactly where a morph
 * turns into a jump.
 *
 * So everything reads the absolute frame, the card's geometry is a continuous
 * function of it (`card-path.ts`), and the screens arrive and leave around it.
 *
 * Layout follows the motion grammar in the build plan:
 *
 *   - every rectangle is rounded, one radius scale (`R`)
 *   - vertical motion is always UP; the card climbs 1180 → 640 and the screens
 *     position themselves around it (see `stageForCardY`)
 *   - the camera only pushes in, with exactly one pull-back at the very end
 *   - the card stays near frame centre at a similar size across every handover,
 *     which is what makes the beats read as continuous rather than as cuts
 *   - gold appears only when something resolves — two bursts and the endcard
 *
 * Two cursor clicks, not six. The interactive demo this advertises has six
 * guided clicks; the video's claim is the opposite of that number — a human
 * marks the deal sold and posts it, and the other five screens update without
 * anybody touching them. Animating a cursor onto the Book of Business or the
 * leaderboard would say the user had to go and do something there.
 */

const cents = (n: number) => money(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const Launch: React.FC = () => {
  const frame = useCurrentFrame();
  const card = cardAt(frame);
  const { rect } = card;

  /*
   * The camera. One slow push across the whole video and a single reversal on
   * the logo morph — the only moment anything moves backwards. Applied to a
   * wrapper around the screens and the card, never to the captions or the
   * readouts, which are furniture and should not breathe.
   */
  const camera = cameraAt(frame);

  /*
   * Where the two clicks land, read off the card path rather than written down.
   *
   * Both buttons are drawn on the card, so their canvas position is a function
   * of where the card is on the frame the click happens — which moves whenever
   * a beat length, a card Y or the frame scale changes. Typed-in coordinates
   * survive exactly one of those edits and then quietly point at empty space.
   */
  const soldAt = cardAt(K.cursorClick).rect;
  const soldTarget = { x: soldAt.cx, y: soldAt.cy + soldAt.h * 0.3 };
  const postAt = cardAt(K.postClick).rect;
  const postTarget = { x: postAt.cx + postAt.w / 2 - 74, y: postAt.cy + postAt.h * 0.33 };

  /* Gold only where something resolves. */
  const soldGlow = pulse(frame, K.soldBurst, D.soldBurst);
  const postGlow = pulse(frame, K.postBurst, D.postBurst);
  const glow = Math.max(soldGlow, postGlow, card.weight.logo);

  const screensGone = lerp(frame, [K.morphToLogo, K.morphToLogo + D.morphToLogo], [1, 0], easeIn);

  return (
    <Canvas>
      <Bloom
        x={50}
        y={(rect.cy / H) * 100}
        size={Math.max(46, (rect.w / CX) * 46)}
        intensity={0.26}
      />

      <AbsoluteFill style={{ transform: `scale(${camera})` }}>
        {/* ── The product, seven stages of it ─────────────────────────── */}
        {SCREEN_PHASES.map((phase) => {
          const opacity = card.present[phase] * screensGone;
          if (opacity <= 0.01) return null;
          return (
            <ScreenStage
              key={phase}
              stage={card.stages[phase]}
              opacity={opacity}
              clipPath={buildWipe(card.build[phase])}
            >
              <CardSweep start={0} duration={D.boardBuild} />
            </ScreenStage>
          );
        })}

        {/* ── The override row, arriving under the advance ─────────────── */}
        <OverrideRow card={card} frame={frame} />

        {/* ── The deal ─────────────────────────────────────────────────── */}
        <DealCard
          rect={rect}
          radius={card.radius}
          weight={card.weight}
          glow={glow}
          content={{
            pipeline: <ProspectCard h={PHASE_H.pipeline} />,
            postDeal: <DealForm h={PHASE_H.postDeal} />,
            book: <BookRow h={PHASE_H.book} />,
            leaderboard: <BoardRow h={PHASE_H.leaderboard} frame={frame} />,
            finances: <PayoutRow h={PHASE_H.finances} />,
            nova: <NovaStrip h={PHASE_H.nova} />,
            agency: <BoardRow h={PHASE_H.agency} frame={frame} settled />,
            logo: (
              <div
                style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}
              >
                <CloudGlyph size={PHASE_H.logo * 0.56} draw={card.weight.logo} />
              </div>
            ),
          }}
        />

        {/* ── Nova's four automations ──────────────────────────────────── */}
        <NovaFan frame={frame} />

        {/* ── The two clicks a human actually makes ────────────────────── */}
        <Cursor
          from={{ x: 940, y: 1700 }}
          to={soldTarget}
          travelStart={K.cursorTravel}
          travelFrames={D.cursorTravel}
          clickAt={K.cursorClick}
          exitAt={K.captionSale}
        />
        <Burst
          x={soldTarget.x}
          y={soldTarget.y}
          at={K.soldBurst}
          duration={D.soldBurst}
          radius={150}
        />

        <Cursor
          from={{ x: 200, y: 1660 }}
          to={postTarget}
          travelStart={K.postClick - D.cursorTravel}
          travelFrames={D.cursorTravel}
          clickAt={K.postClick}
          exitAt={K.captionEntered}
        />
        <Burst
          x={postTarget.x}
          y={postTarget.y}
          at={K.postBurst}
          duration={D.postBurst}
          radius={130}
        />
      </AbsoluteFill>

      {/* ── Readouts. The one number each beat is about. ───────────────── */}
      <Readouts frame={frame} />

      {/* ── Six captions in thirty seconds. ────────────────────────────── */}
      <Caption
        words={["One", "sale."]}
        at={K.captionSale}
        duration={D.captionSale}
        until={K.toForm}
        outDuration={D.captionOut}
        top={LAYOUT.caption}
      />
      <Caption
        words={["Entered", "once."]}
        at={K.captionEntered}
        duration={D.captionEntered}
        until={K.toBook}
        outDuration={D.captionOut}
        top={LAYOUT.caption}
      />
      <Caption
        words={["In", "the", "book."]}
        at={K.captionBook}
        duration={D.captionBook}
        until={K.toBoard}
        outDuration={D.captionOut}
        top={LAYOUT.caption}
      />
      <Caption
        words={["On", "the", "board."]}
        at={K.captionBoard}
        duration={D.captionBoard}
        until={K.toFinances}
        outDuration={D.captionOut}
        top={LAYOUT.caption}
      />
      <Caption
        words={["Paid", "—", "writing", "and", "override."]}
        at={K.captionPaid}
        duration={D.captionPaid}
        until={K.toNova}
        outDuration={D.captionOut}
        top={LAYOUT.caption}
      />
      <Caption
        words={["Nova", "takes", "the", "follow-up."]}
        at={K.captionNova}
        duration={D.captionNova}
        until={K.scopeExpand}
        outDuration={D.captionOut}
        top={LAYOUT.caption}
      />

      {/* ── Endcard ────────────────────────────────────────────────────── */}
      <Endcard frame={frame} />

      <Vignette />
      <Grain opacity={0.035} />
    </Canvas>
  );
};

/** A 0→1→0 bump, for a glow that answers a burst. */
const pulse = (frame: number, at: number, duration: number) => {
  const up = lerp(frame, [at, at + duration * 0.3], [0, 1], easeOut);
  const down = lerp(frame, [at + duration * 0.3, at + duration * 2], [0, 1], easeIn);
  return up * (1 - down);
};

// ── What the card is, beat by beat ──────────────────────────────────────────

const ProspectCard: React.FC<{ h: number }> = ({ h }) => (
  <div style={{ width: "100%", padding: `0 ${h * 0.11}px` }}>
    <div
      style={{
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: h * 0.17,
        lineHeight: 1.15,
        color: C.text,
      }}
    >
      {DEAL.client}
    </div>
    <div
      style={{
        fontFamily: BODY,
        fontSize: h * 0.105,
        lineHeight: 1.4,
        color: C.muted,
        marginTop: h * 0.05,
      }}
    >
      {DEAL.city} · Age {DEAL.age} · Callback
    </div>
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: h * 0.12,
        color: C.text,
        marginTop: h * 0.04,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {cents(DEAL.monthly)}/mo
    </div>
    <div
      style={{
        marginTop: h * 0.1,
        borderRadius: R.row,
        background: C.accent,
        color: C.bg,
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: h * 0.115,
        letterSpacing: "0.02em",
        textAlign: "center",
        padding: `${h * 0.055}px 0`,
      }}
    >
      Mark Sold
    </div>
  </div>
);

/** One labelled value in the form. Typed ones pass a node. */
const FormField: React.FC<{ label: string; h: number; children: React.ReactNode }> = ({
  label,
  h,
  children,
}) => (
  <div style={{ minWidth: 0 }}>
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 600,
        fontSize: h * 0.085,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: C.muted,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 600,
        fontSize: h * 0.125,
        lineHeight: 1.35,
        color: C.text,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        marginTop: h * 0.03,
      }}
    >
      {children}
    </div>
  </div>
);

const DealForm: React.FC<{ h: number }> = ({ h }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: `${h * 0.09}px ${h * 0.13}px`,
        width: "100%",
        padding: `0 ${h * 0.16}px`,
      }}
    >
      <FormField label="Client" h={h}>
        {DEAL.client}
      </FormField>
      <FormField label="Carrier *" h={h}>
        <Typewriter text={DEAL.carrier} at={K.typeCarrier} duration={D.typeCarrier} />
      </FormField>
      <FormField label="Product Sold *" h={h}>
        <Typewriter text={DEAL.product} at={K.typeProduct} duration={D.typeProduct} />
      </FormField>
      <FormField label="Policy Number *" h={h}>
        {DEAL.policyNo}
      </FormField>
      <FormField label="Effective Date *" h={h}>
        {DEAL.effective}
      </FormField>
      <FormField label="Face Amount *" h={h}>
        {money(DEAL.face)}
      </FormField>
      <FormField label="Monthly Premium *" h={h}>
        <Typewriter text={cents(DEAL.monthly)} at={K.typePremium} duration={D.typePremium} />
      </FormField>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: h * 0.085,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C.muted,
          }}
        >
          Annual Premium
        </div>
        <div
          style={{
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: h * 0.125,
            lineHeight: 1.35,
            marginTop: h * 0.03,
            color: C.good,
            fontVariantNumeric: "tabular-nums",
            opacity: lerp(
              frame,
              [K.annualResolve, K.annualResolve + D.annualResolve],
              [0, 1],
              easeOut,
            ),
          }}
        >
          {cents(DEAL.annual)} / year
        </div>
      </div>
    </div>
  );
};

const BookRow: React.FC<{ h: number }> = ({ h }) => (
  <RowContent
    h={h}
    cells={[
      { text: DEAL.client, grow: 2, bold: true },
      { text: DEAL.carrier, grow: 1.4, tone: "muted" },
      { text: DEAL.product, grow: 1.4, tone: "muted" },
      { text: DEAL.policyNo, grow: 1.4, tone: "muted" },
      { text: DEAL.effective, grow: 1.2, tone: "muted" },
      { text: money(DEAL.annual), grow: 1, tone: "good", bold: true },
      { text: "Submitted", grow: 0.9, tone: "accent", bold: true },
    ]}
  />
);

const BoardRow: React.FC<{ h: number; frame: number; settled?: boolean }> = ({
  h,
  frame,
  settled,
}) => {
  const rank = settled || frame >= K.rankTick + D.rankTick ? "4" : "5";
  return (
    <RowContent
      h={h}
      cells={[
        { text: `#${rank}`, grow: 0.5, tone: "accent", bold: true },
        { text: DEAL.agent, grow: 2, bold: true },
        { text: money(19600), grow: 1.2, bold: true },
        { text: "16 policies", grow: 1.2, tone: "muted" },
        { text: `${money(1225)} avg`, grow: 1.2, tone: "muted" },
        { text: "▲", grow: 0.4, tone: "good", bold: true },
      ]}
    />
  );
};

const PayoutRow: React.FC<{ h: number }> = ({ h }) => (
  <RowContent
    h={h}
    cells={[
      { text: DEAL.client, grow: 2, bold: true },
      { text: "Advance", grow: 1, tone: "accent", bold: true },
      { text: `${DEAL.carrier} · ${DEAL.level}% · Yr 1`, grow: 2.4, tone: "muted" },
      { text: money(DEAL.advance), grow: 1, bold: true },
    ]}
  />
);

const NovaStrip: React.FC<{ h: number }> = ({ h }) => (
  <RowContent
    h={h}
    cells={[
      { text: "✦ Nova AI", grow: 1.2, tone: "accent", bold: true },
      { text: `${DEAL.client} · ${DEAL.policyNo}`, grow: 3, tone: "muted" },
      { text: "4 tasks created", grow: 1.2, bold: true },
    ]}
  />
);

/**
 * The override, arriving underneath.
 *
 * Positioned one real row below the advance — 50 frame-pixels, scaled by
 * whatever zoom the Finances beat is at — because in the application it *is*
 * the next row down. The beat is that one posted deal produced two payouts to
 * two different people, so the second row has to look like it belongs to the
 * same table rather than like a callout.
 */
const OverrideRow: React.FC<{ card: ReturnType<typeof cardAt>; frame: number }> = ({
  card,
  frame,
}) => {
  const t = lerp(frame, [K.overrideSpawn, K.overrideSpawn + D.overrideSpawn], [0, 1], easeOut);
  const out = lerp(frame, [K.toNova, K.toNova + D.toNova], [0, 1], easeIn);
  const opacity = t * (1 - out) * card.present.finances;
  if (opacity <= 0.01) return null;

  const h = card.rect.h;
  const drop = h * 1.02;
  return (
    <div
      style={{
        position: "absolute",
        left: card.rect.cx - card.rect.w / 2,
        top: card.rect.cy - h / 2 + drop * t,
        width: card.rect.w,
        height: h,
        borderRadius: R.row,
        background: C.surface,
        border: `1px solid ${alpha(C.good, 0.3)}`,
        opacity,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <RowContent
        h={h}
        cells={[
          { text: DEAL.upline, grow: 2, bold: true },
          { text: "Override", grow: 1, tone: "good", bold: true },
          {
            text: `${DEAL.overrideSpread}-pt spread · via ${DEAL.agent}`,
            grow: 2.4,
            tone: "muted",
          },
          { text: money(DEAL.override), grow: 1, tone: "good", bold: true },
        ]}
      />
    </div>
  );
};

/**
 * Nova's four automations, in canvas space rather than inside the screen.
 *
 * Drawn large enough to read. Inside the frame these are 10px labels that land
 * at 13px on the canvas; the whole point of the beat is that a viewer sees what
 * Nova actually made, so they are re-drawn at video scale under the card.
 *
 * The names are the shipped ones. "Draft reminder" is a reminder rather than a
 * claimed automation, and the other three are `Policy anniversary`, the SMS
 * follow-up and `Lapse follow-up` from the automations panel — everything in
 * Nova's "Pipeline autopilot" group is still flagged `soon` and is not here.
 */
const NOVA_TASKS = [
  ["Client welcome", "SMS drafted for review"],
  ["Draft reminder", `Bank draft · ${DEAL.draftDay}`],
  ["Policy anniversary", DEAL.anniversary],
  ["Lapse follow-up", "Watching from day one"],
] as const;

const NovaFan: React.FC<{ frame: number }> = ({ frame }) => {
  const out = lerp(frame, [K.novaOut, K.novaOut + D.novaOut], [0, 1], easeIn);
  if (frame < K.novaFan - 1 || out >= 1) return null;

  const w = 452;
  const h = 116;
  const gap = 26;
  return (
    <>
      {NOVA_TASKS.map(([title, sub], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const at = K.novaFan + i * Math.round(D.novaFan / NOVA_TASKS.length);
        const t = lerp(frame, [at, at + D.novaSettle], [0, 1], easeOut);
        return (
          <div
            key={title}
            style={{
              position: "absolute",
              left: CX - w - gap / 2 + col * (w + gap),
              top: LAYOUT.fan + row * (h + gap) + (1 - t) * 34,
              width: w,
              height: h,
              borderRadius: R.card,
              background: C.surface,
              border: `1px solid ${alpha(C.accent, 0.22)}`,
              opacity: t * (1 - out),
              padding: "22px 26px",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 34,
                lineHeight: 1.2,
                color: C.text,
              }}
            >
              <span style={{ color: C.accentLt }}>✦ </span>
              {title}
            </div>
            <div
              style={{
                fontFamily: BODY,
                fontSize: 26,
                lineHeight: 1.3,
                color: C.muted,
                marginTop: 8,
              }}
            >
              {sub}
            </div>
          </div>
        );
      })}
    </>
  );
};

/** The one number each beat is about, big enough to read on a phone. */
const Readouts: React.FC<{ frame: number }> = ({ frame }) => {
  const win = (at: number, dur: number, until: number) =>
    lerp(frame, [at, at + dur], [0, 1], easeOut) *
    (1 - lerp(frame, [until, until + D.captionOut], [0, 1], easeIn));

  return (
    <>
      <Readout
        label="Prospect"
        value={DEAL.client}
        sub={`${DEAL.city} · Age ${DEAL.age} · ${cents(DEAL.monthly)} a month`}
        y={LAYOUT.readout}
        size={76}
        tone="text"
        opacity={win(K.cardSettle, D.cardSettle, K.toForm)}
      />
      <Readout
        label="Annual premium"
        value={cents(DEAL.annual)}
        sub={`${cents(DEAL.monthly)} a month · computed, not typed`}
        y={LAYOUT.readout}
        size={92}
        tone="good"
        opacity={win(K.annualResolve, D.annualResolve, K.toBook)}
      />
      <Readout
        label="On the books"
        value={DEAL.policyNo}
        sub={`Effective ${DEAL.effective} · Draft ${DEAL.draftDay} · Anniversary ${DEAL.anniversary}`}
        y={LAYOUT.readout}
        size={80}
        tone="text"
        opacity={win(K.datesReveal, D.datesReveal, K.toBoard)}
      />
      <Readout
        label="Month-to-date production"
        value={
          <CountUp to={19600} at={K.alpCount} duration={D.alpCount} format={(n) => money(n)} />
        }
        sub="Agency rank 5 → 4"
        y={LAYOUT.readout}
        size={92}
        opacity={win(K.alpCount, D.alpCount, K.toFinances)}
      />
      <Readout
        label="Commission on one deal"
        value={`${money(DEAL.advance)} + ${money(DEAL.override)}`}
        sub={`${DEAL.level}% writing to ${DEAL.agent} · ${DEAL.overrideSpread}-pt override to ${DEAL.upline}`}
        y={LAYOUT.readout}
        size={84}
        opacity={win(K.overrideCount, D.overrideCount, K.toNova)}
      />
      <Readout
        label="Agency production"
        value={money(248400)}
        sub="14 agents producing · 186 policies written"
        y={LAYOUT.readout}
        size={92}
        opacity={win(K.scopeExpand + D.scopeExpand, D.holdAgency, K.morphToLogo)}
      />
    </>
  );
};

const Endcard: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < K.wordmark - 1) return null;
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: LAYOUT.wordmark }}>
        <MaskUp at={K.wordmark} duration={D.wordmark}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: T.wordmark,
              textAlign: "center",
              color: C.text,
              letterSpacing: "-0.02em",
            }}
          >
            Agent Cloud
          </div>
        </MaskUp>
      </div>

      {/* PunchWords is an inline flex row and positions nothing itself. */}
      <div style={{ position: "absolute", left: 60, right: 60, top: LAYOUT.line }}>
        <PunchWords
          words={["Post", "it", "once.", "Everything", "updates."]}
          at={K.pill}
          duration={D.pill}
          size={T.climax}
        />
      </div>

      <div
        style={{ position: "absolute", left: 0, right: 0, top: LAYOUT.url, textAlign: "center" }}
      >
        <div
          style={{
            opacity: lerp(frame, [K.url, K.url + D.url], [0, 1], easeOut),
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: T.url,
            color: C.accentLt,
            letterSpacing: "0.01em",
          }}
        >
          useagentcloud.com
        </div>
        <div
          style={{
            marginTop: 26,
            opacity: lerp(frame, [K.pill, K.pill + D.pill], [0, 1], easeOut),
          }}
        >
          <Fine>Try the demo — no account needed</Fine>
        </div>
      </div>
    </>
  );
};
