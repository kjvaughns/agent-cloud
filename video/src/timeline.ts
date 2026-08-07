/**
 * Every number that governs how this video looks or moves.
 *
 * The hard rule for this project: **no raw frame numbers, no hex colours and no
 * spring configs anywhere except this file.** Scenes import from here. If a
 * scene needs a new timing, it gets a named duration in `D` — never a literal.
 *
 * This is not style policing. The whole point is that these constants get
 * changed by hand, constantly, and everything downstream has to recompute. A
 * hardcoded `frame > 340` in a scene file is a landmine: it works until someone
 * lengthens an earlier beat, and then it is wrong in a way that produces no
 * error and is only visible if you happen to scrub past it.
 *
 * `npm run check:params` enforces this. It is wired into `npm run typecheck`,
 * so drift gets caught rather than discovered.
 */

export const FPS = 30;

/**
 * The musical grid.
 *
 * Nothing in `K` is snapped to this yet, because there is no track yet. When
 * one exists, `beatsAt()` below reports where each keyframe lands relative to
 * the grid, and syncing becomes a matter of nudging the `hold*` durations in
 * `D` until the big moments land on beats. That is the entire reason the holds
 * are named separately from the actions.
 */
export const BPM = 124;
export const B = (60 / BPM) * FPS;
export const beat = (n: number) => Math.round(n * B);

/**
 * How long each thing TAKES.
 *
 * Two kinds of entry, and the distinction matters:
 *
 *   actions  — an element doing something. 8-30 frames. These are tuned by eye
 *              and then left alone; they are what "responsive" feels like.
 *   hold*    — deliberate stillness afterwards. These are the shock absorbers.
 *              Tune these to move a beat boundary or to hit a musical accent;
 *              never stretch an action to fill time, because a card that takes
 *              40 frames to arrive reads sluggish AND still leaves dead air.
 */
export const D = {
  // ── HOOK ─────────────────────────────────────────────────────────────────
  cardFadeIn: 12,
  typeName: 26,
  typeMeta: 14,
  stampFall: 10,
  stampBurst: 16,
  captionAgent: 8,
  /**
   * How long a caption takes to leave.
   *
   * Not consumed by `K` — the accumulator lists its keys explicitly, so a
   * duration that only ever describes a fade can be added here without shifting
   * a single keyframe. Worth knowing before adding others.
   */
  captionOut: 9,
  holdHook: 24,

  // ── REVEAL ───────────────────────────────────────────────────────────────
  cardRise: 14,
  frameBuild: 18,
  screenSettle: 12,
  holdReveal: 56,

  // ── SHOWCASE 1 · contracting ─────────────────────────────────────────────
  punchIn: 9,
  cursorTravel: 18,
  cursorClick: 7,
  typeWritingNum: 22,
  activeBurst: 14,
  captionReady: 8,
  holdShowcase1: 42,

  // ── SHOWCASE 2 · commissions ─────────────────────────────────────────────
  travelUp: 20,
  frameBuild2: 18,
  stmtRowLand: 10,
  varianceCount: 30,
  varianceResolve: 14,
  captionPaid: 8,
  holdShowcase2: 20,

  // ── SHOWCASE 3 · retention ───────────────────────────────────────────────
  travelUp2: 20,
  frameBuild3: 18,
  spotlight: 12,
  riskFall: 26,
  saveBurst: 14,
  captionBooks: 8,
  holdShowcase3: 22,

  // ── CLIMAX ───────────────────────────────────────────────────────────────
  cardShrink: 12,
  fanOut: 22,
  /** Complete stillness before the convergence. Silence before the hit. */
  stillness: 8,
  converge: 26,
  climaxLine: 12,
  holdClimax: 70,

  // ── CLOSE ────────────────────────────────────────────────────────────────
  morphToLogo: 30,
  /**
   * How long the row's text takes to clear during the morph.
   *
   * Shorter than `morphToLogo` on purpose, and not consumed by `K`. Fading the
   * content on the same curve as the gold leaves the name legible at 20% over a
   * bright fill for a third of the transition — it reads as a rendering fault
   * rather than as a transformation. The text has to be gone before the gold
   * is bright.
   */
  morphContentOut: 11,
  /** The only pull-back in the video. That single reversal is what ends it. */
  pullBack: 18,
  wordmark: 10,
  url: 10,
  pill: 10,
  holdClose: 102,
} as const;

/**
 * Keyframes, derived from `D` by accumulation.
 *
 * Each value is the frame its event STARTS on; the event runs for `D.<same
 * name>`. Insert a duration above or lengthen one, and everything after it
 * shifts automatically — which is the entire point of the file.
 *
 * Strictly sequential. Where two things need to overlap, a scene composes them
 * from named values (`K.captionAgent - D.captionLead`), never from a literal.
 */
export const K = (() => {
  let t = 0;
  const at = (d: number) => {
    const start = t;
    t += d;
    return start;
  };

  const k = {
    cardFadeIn: at(D.cardFadeIn),
    typeName: at(D.typeName),
    typeMeta: at(D.typeMeta),
    stampFall: at(D.stampFall),
    stampBurst: at(D.stampBurst),
    captionAgent: at(D.captionAgent),
    holdHook: at(D.holdHook),

    cardRise: at(D.cardRise),
    frameBuild: at(D.frameBuild),
    screenSettle: at(D.screenSettle),
    holdReveal: at(D.holdReveal),

    punchIn: at(D.punchIn),
    cursorTravel: at(D.cursorTravel),
    cursorClick: at(D.cursorClick),
    typeWritingNum: at(D.typeWritingNum),
    activeBurst: at(D.activeBurst),
    captionReady: at(D.captionReady),
    holdShowcase1: at(D.holdShowcase1),

    travelUp: at(D.travelUp),
    frameBuild2: at(D.frameBuild2),
    stmtRowLand: at(D.stmtRowLand),
    varianceCount: at(D.varianceCount),
    varianceResolve: at(D.varianceResolve),
    captionPaid: at(D.captionPaid),
    holdShowcase2: at(D.holdShowcase2),

    travelUp2: at(D.travelUp2),
    frameBuild3: at(D.frameBuild3),
    spotlight: at(D.spotlight),
    riskFall: at(D.riskFall),
    saveBurst: at(D.saveBurst),
    captionBooks: at(D.captionBooks),
    holdShowcase3: at(D.holdShowcase3),

    cardShrink: at(D.cardShrink),
    fanOut: at(D.fanOut),
    stillness: at(D.stillness),
    converge: at(D.converge),
    climaxLine: at(D.climaxLine),
    holdClimax: at(D.holdClimax),

    morphToLogo: at(D.morphToLogo),
    pullBack: at(D.pullBack),
    wordmark: at(D.wordmark),
    url: at(D.url),
    pill: at(D.pill),
    holdClose: at(D.holdClose),
  };

  return { ...k, TOTAL: t };
})();

/**
 * Beat boundaries, derived.
 *
 * Used only for labelling the audit stills and for reasoning about pacing —
 * nothing renders from these, because the video is one continuous timeline
 * rather than seven sequences. The card never leaves the screen, so cutting it
 * into `<Sequence>` blocks would introduce exactly the seams it exists to
 * avoid.
 */
export const BEATS = [
  { id: "hook", from: K.cardFadeIn, to: K.cardRise },
  { id: "reveal", from: K.cardRise, to: K.punchIn },
  { id: "showcase1", from: K.punchIn, to: K.travelUp },
  { id: "showcase2", from: K.travelUp, to: K.travelUp2 },
  { id: "showcase3", from: K.travelUp2, to: K.cardShrink },
  { id: "climax", from: K.cardShrink, to: K.morphToLogo },
  { id: "close", from: K.morphToLogo, to: K.TOTAL },
] as const;

/** Where a frame lands on the musical grid. For syncing once a track exists. */
export const beatsAt = (frame: number) => frame / B;

/**
 * Look.
 *
 * `accent` is the payoff colour and appears only when something resolves — a
 * licence validates, a writing number issues, a variance is caught, a policy is
 * saved. Everything else is greyscale on near-black. Restraint here is what
 * makes the gold land; used as decoration it stops meaning anything.
 *
 * Note this is the brief's #C9A227. The product's own dark-mode `--gold` is
 * #CBA35A, and the screens inside the frame render themselves from that token —
 * so the UI's gold and the video furniture's gold are close but not identical.
 * Set `accent` to '#CBA35A' and `accentLt` to '#E7C877' if you want them to be
 * the same colour; it is a one-line change and nothing else needs to move.
 */
export const C = {
  bg: "#08080A",
  surface: "#101014",
  line: "#1E1E24",
  text: "#FAFAF9",
  muted: "#8B8B93",
  accent: "#C9A227",
  accentLt: "#E8C75A",
  good: "#4ADE80",
  bad: "#F87171",
} as const;

/**
 * `rgba()` from a token, so scene files never need a colour literal to express
 * "the accent, but faint".
 */
export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/**
 * One shape family. Cards, screens, the logo, the pill — every rectangle in
 * this video is rounded, and the only circles are status dots and the burst.
 * The card→logo morph at the end works *because* the card has been the same
 * shape as the logo for thirty seconds.
 */
export const R = { card: 18, row: 8, screen: 22, logo: 34, pill: 999 } as const;

/** Three configs. SNAP for about 90% of everything. */
export const S = {
  SNAP: { damping: 20, stiffness: 200, mass: 0.5 },
  POP: { damping: 12, stiffness: 300, mass: 0.8 },
  NONE: { damping: 200 },
} as const;

/** Type sizes. Display type is Space Grotesk; see `lib/fonts.ts` for why. */
export const T = {
  caption: 78,
  climax: 84,
  wordmark: 96,
  url: 50,
  pill: 34,
  fine: 30,
  cardName: 40,
  cardMeta: 26,
  chip: 20,
} as const;

/**
 * Base fit from a screen's frame pixels to canvas pixels, for an establishing
 * shot. At 1.0 the 980px-wide card is 980px on a 1080px canvas — a 50px margin
 * each side. Deliberately near the edge: on a vertical canvas a landscape card
 * is always a band, and letting it own the full width stops it reading as a
 * postage stamp.
 */
export const FIT = 1.0;

/** The canvas. */
export const W = 1080;
export const H = 1920;
export const CX = W / 2;
