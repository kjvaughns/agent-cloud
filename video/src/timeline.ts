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
 *   actions  — an element doing something. 8-26 frames. These are tuned by eye
 *              and then left alone; they are what "responsive" feels like.
 *   hold*    — deliberate stillness afterwards. These are the shock absorbers.
 *              Tune these to move a beat boundary or to hit a musical accent;
 *              never stretch an action to fill time, because a card that takes
 *              40 frames to arrive reads sluggish AND still leaves dead air.
 */
export const D = {
  // ── 1 · PIPELINE — one sale ──────────────────────────────────────── 120 ──
  boardBuild: 14,
  cardSettle: 10,
  cursorTravel: 20,
  cursorClick: 8,
  soldBurst: 14,
  captionSale: 8,
  /**
   * How long a caption takes to leave.
   *
   * Not consumed by `K` — the accumulator lists its keys explicitly, so a
   * duration that only ever describes a fade can be added here without shifting
   * a single keyframe. Worth knowing before adding others.
   *
   * Captions on the previous cut only ever faded IN. By the last beat four of
   * them were stacked on top of each other and none was legible.
   */
  captionOut: 9,
  holdPipeline: 46,

  // ── 2 · POST THE DEAL — entered once ─────────────────────────────── 140 ──
  toForm: 18,
  formBuild: 16,
  typeCarrier: 16,
  typeProduct: 14,
  typePremium: 18,
  /** The green annual figure. The form computes it; nobody types it. */
  annualResolve: 14,
  postClick: 10,
  postBurst: 12,
  captionEntered: 8,
  holdPostDeal: 14,

  // ── 3 · BOOK OF BUSINESS — in the book ───────────────────────────── 120 ──
  toBook: 20,
  bookBuild: 16,
  rowLand: 10,
  /** Effective, draft day, anniversary. The dates the policy carries forever. */
  datesReveal: 18,
  captionBook: 8,
  holdBook: 48,

  // ── 4 · LEADERBOARD — on the board ───────────────────────────────── 110 ──
  toBoard: 20,
  boardBuild2: 16,
  alpCount: 24,
  rankTick: 12,
  captionBoard: 8,
  holdBoard: 30,

  // ── 5 · FINANCES — writing and override ──────────────────────────── 130 ──
  toFinances: 20,
  financesBuild: 16,
  advanceLand: 12,
  /** The override row arriving underneath is the beat. Two payouts, one deal. */
  overrideSpawn: 20,
  overrideCount: 18,
  captionPaid: 8,
  holdFinances: 36,

  // ── 6 · NOVA — takes the follow-up ───────────────────────────────── 110 ──
  toNova: 20,
  novaBuild: 14,
  novaFan: 22,
  novaSettle: 10,
  captionNova: 8,
  holdNova: 36,

  // ── 7 · AGENCY SCOPE — no caption, the only rest in the cut ───────── 80 ──
  /** Nova's four cards leave, and the last caption with them. */
  novaOut: 14,
  /** The Agency pill lights before the rows arrive, so the cause reads first. */
  scopeCue: 8,
  /** Mine → Agency. Six rows fade in around the one that was already there. */
  scopeExpand: 24,
  holdAgency: 34,

  // ── 8 · ENDCARD — post it once ────────────────────────────────────── 90 ──
  morphToLogo: 26,
  /**
   * The only reversal in the video, and it has to live here rather than in the
   * agency beat where it started out.
   *
   * Every wide row sits right of the frame's centre, so the frame is carried
   * left to centre it and its right edge ends up only just off canvas. Pulling
   * the camera back by 11% while a screen is still on shot drags that edge 34px
   * into frame — a rounded corner and a border, mid-air. `check:jank` fails on
   * it. So the reversal runs after the morph, once the screens have gone and
   * there is nothing left with an edge to show.
   */
  pullBack: 14,
  /**
   * How long the row's text takes to clear during the morph.
   *
   * Shorter than `morphToLogo` on purpose, and not consumed by `K`. Fading the
   * content on the same curve as the gold leaves the name legible at 20% over a
   * bright fill for a third of the transition — it reads as a rendering fault
   * rather than as a transformation. The text has to be gone before the gold
   * is bright.
   */
  morphContentOut: 10,
  wordmark: 10,
  url: 10,
  pill: 8,
  holdClose: 22,
} as const;

/**
 * Keyframes, derived from `D` by accumulation.
 *
 * Each value is the frame its event STARTS on; the event runs for `D.<same
 * name>`. Insert a duration above or lengthen one, and everything after it
 * shifts automatically — which is the entire point of the file.
 *
 * Strictly sequential. Where two things need to overlap, a scene composes them
 * from named values (`K.captionSale - D.captionOut`), never from a literal.
 */
export const K = (() => {
  let t = 0;
  const at = (d: number) => {
    const start = t;
    t += d;
    return start;
  };

  const k = {
    boardBuild: at(D.boardBuild),
    cardSettle: at(D.cardSettle),
    cursorTravel: at(D.cursorTravel),
    cursorClick: at(D.cursorClick),
    soldBurst: at(D.soldBurst),
    captionSale: at(D.captionSale),
    holdPipeline: at(D.holdPipeline),

    toForm: at(D.toForm),
    formBuild: at(D.formBuild),
    typeCarrier: at(D.typeCarrier),
    typeProduct: at(D.typeProduct),
    typePremium: at(D.typePremium),
    annualResolve: at(D.annualResolve),
    postClick: at(D.postClick),
    postBurst: at(D.postBurst),
    captionEntered: at(D.captionEntered),
    holdPostDeal: at(D.holdPostDeal),

    toBook: at(D.toBook),
    bookBuild: at(D.bookBuild),
    rowLand: at(D.rowLand),
    datesReveal: at(D.datesReveal),
    captionBook: at(D.captionBook),
    holdBook: at(D.holdBook),

    toBoard: at(D.toBoard),
    boardBuild2: at(D.boardBuild2),
    alpCount: at(D.alpCount),
    rankTick: at(D.rankTick),
    captionBoard: at(D.captionBoard),
    holdBoard: at(D.holdBoard),

    toFinances: at(D.toFinances),
    financesBuild: at(D.financesBuild),
    advanceLand: at(D.advanceLand),
    overrideSpawn: at(D.overrideSpawn),
    overrideCount: at(D.overrideCount),
    captionPaid: at(D.captionPaid),
    holdFinances: at(D.holdFinances),

    toNova: at(D.toNova),
    novaBuild: at(D.novaBuild),
    novaFan: at(D.novaFan),
    novaSettle: at(D.novaSettle),
    captionNova: at(D.captionNova),
    holdNova: at(D.holdNova),

    novaOut: at(D.novaOut),
    scopeCue: at(D.scopeCue),
    scopeExpand: at(D.scopeExpand),
    holdAgency: at(D.holdAgency),

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
 * rather than eight sequences. The card never leaves the screen, so cutting it
 * into `<Sequence>` blocks would introduce exactly the seams it exists to
 * avoid.
 */
export const BEATS = [
  { id: "pipeline", from: 0, to: K.toForm },
  { id: "postDeal", from: K.toForm, to: K.toBook },
  { id: "book", from: K.toBook, to: K.toBoard },
  { id: "leaderboard", from: K.toBoard, to: K.toFinances },
  { id: "finances", from: K.toFinances, to: K.toNova },
  { id: "nova", from: K.toNova, to: K.novaOut },
  { id: "agency", from: K.novaOut, to: K.morphToLogo },
  { id: "close", from: K.morphToLogo, to: K.TOTAL },
] as const;

/** Where a frame lands on the musical grid. For syncing once a track exists. */
export const beatsAt = (frame: number) => frame / B;

/**
 * How wide the deal card is on the canvas, beat by beat.
 *
 * These are the primary motion variable, and the reason zoom is computed rather
 * than chosen. What a viewer reads is how big the *subject* is, not what scale
 * factor a screen happens to be at; and the grammar says the camera only ever
 * pushes in, with one reversal at the end. Rows differ wildly in width — a
 * pipeline lead card is 247 frame-pixels, a leaderboard row is 798 — so holding
 * the card growing steadily means each screen punches to a different depth.
 * `zoomFor()` in `lib/anchors.ts` does that arithmetic.
 *
 * Monotonically non-decreasing, and never reversed until the logo morph —
 * which is the video's single pull-back, as the grammar requires.
 */
/**
 * Where the deal card sits on the canvas, beat by beat.
 *
 * Strictly decreasing: vertical motion in this video is always up. The card
 * starts low, in the bottom third where a phone's thumb is, and climbs to the
 * optical centre by the endcard. Screens position themselves around these
 * numbers rather than the other way round — see `stageForCardY`.
 */
export const CARD_Y = {
  pipeline: 1120,
  postDeal: 1070,
  book: 1020,
  leaderboard: 980,
  finances: 940,
  nova: 910,
  agency: 890,
  logo: 700,
} as const;

/** The logo tile the card becomes. Square, because the logo is. */
export const LOGO_SIDE = 236;

/**
 * Where the furniture sits on the canvas.
 *
 * Chosen against the screens rather than by eye, and then against the platforms.
 *
 * A product screen is centred on the card and is between 510 and 765 canvas
 * pixels tall depending on the beat, which leaves two usable bands: above the
 * screens and below them. The first draft put both the caption and the readout
 * in the lower one and left the top 40% of a 9:16 frame empty — a lot of
 * nothing on the only axis this format has.
 *
 * So the caption goes up top and the readout sits just under the screens. That
 * also keeps every word clear of the bottom fifth of the frame, which is where
 * TikTok and Reels lay their own caption, username and button rail. Text put
 * there is not cropped, it is *covered*, and only on the phone.
 *
 * Move a card Y or a punch depth and re-check these: `npm run audit` renders
 * one still per beat, which is the fastest way to see a collision.
 */
export const LAYOUT = {
  /** Six captions in thirty seconds. Nothing else gets words. */
  caption: 280,
  /** The one number a beat is about. Under the screens, above the platform UI. */
  readout: 1400,
  /** Nova's four automations, fanning out under the screen. */
  fan: 1260,
  /** Endcard. `line` wraps to two at T.climax, hence the gap before `url`. */
  wordmark: 880,
  line: 1060,
  url: 1330,
} as const;

/**
 * Look.
 *
 * `accent` is the payoff colour and appears only when something resolves — a
 * deal is marked sold, a premium annualises, a commission is calculated, a
 * board position moves. Everything else is greyscale on near-black. Restraint
 * here is what makes the gold land; used as decoration it stops meaning
 * anything.
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

/** The canvas. */
export const W = 1080;
export const H = 1920;
export const CX = W / 2;

/**
 * The frame's natural layout width, in CSS pixels.
 *
 * Not negotiable, and the most expensive thing in this project to get wrong.
 * `AppFrame` is an `@container/frame`: its nav rail is `@3xl/frame:block` and
 * so exists only above 768px of *layout* width, and the second column and every
 * table header key off `@xl/frame` at 576px. Narrow the element to make it fit
 * and it looks like it worked while quietly costing the rail, the headers and
 * the right-hand column — most of what makes this read as an application. So
 * the frame is always laid out at 980 and scaled with a transform, which does
 * not affect layout width.
 */
export const FRAME_W = 980;

/**
 * One scale, for every beat: the whole application, edge to edge.
 *
 * This replaced a set of per-beat punch-ins, and the reason is worth keeping.
 * Every wide row sits at x=563 in a 980px frame — right of centre, because the
 * rail eats the left 146px — so centring the row on the canvas carries the
 * frame left. At any scale past 1.1 that pushes the rail off the left edge and
 * chops the window title mid-word: the audit still read "oud" where it should
 * have read "Book of Business — Agent Cloud". That does not look like a camera
 * pushing in. It looks like a bug.
 *
 * 1080/980 is the largest scale that still shows all of it, and it happens to
 * be full-bleed — no side margins, no rounded corner floating in frame, the
 * rail and the table headers intact. What it costs is legibility: an 11px table
 * cell lands at 12px. That is what `Readout` is for. The app carries the
 * context and the big figure carries the number, which is the right division of
 * labour anyway — nobody reads a spreadsheet in a thirty-second video.
 */
export const FIT = W / FRAME_W;
