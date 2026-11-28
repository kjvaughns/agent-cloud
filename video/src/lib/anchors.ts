import type { ScreenKey, ScreenScope } from "@/components/landing/screens";
import { FRAME_W } from "../timeline";

export { FRAME_W };

export type Anchor = { x: number; y: number };

/** A rectangle by its centre, which is the form every morph interpolates in. */
export type FrameRect = { cx: number; cy: number; w: number; h: number };

/**
 * Measured geometry, in frame pixels. Produced by `npm run measure`.
 *
 * `h` is the frame's rendered height; `row` is the element the deal card has to
 * become and cover exactly. Both come out of `getBoundingClientRect()` in the
 * page that actually renders these screens — not off a ruler, and not by eye.
 *
 * That distinction has already paid for itself. The hand-read values these
 * replace had the frames at 390 and 404; they are really 393.5 and 406.5. Three
 * pixels is invisible in a still and very visible in motion, because the card
 * is welded to the row and a constant offset makes it look like it is floating
 * a little above the table rather than sitting in it.
 *
 * Re-run `npm run measure` whenever a screen's layout changes in the app, and
 * paste the block it prints. Nothing else in the video needs to move.
 */
type Measured = { h: number; row: FrameRect };

const FRAMES: Record<string, Measured> = {
  // ── the sale story ────────────────────────────────────────────────────────
  /** The Willie Jenkins lead card, in the Callback column. */
  "pipeline:mine": { h: 393.5, row: { cx: 563, cy: 197.8, w: 247.3, h: 98.5 } },
  /** The whole Policy Details card — the card does not become a field, it becomes the form. */
  "postDeal:mine": { h: 393.5, row: { cx: 563, cy: 286, w: 800, h: 178 } },
  "book:mine": { h: 406.5, row: { cx: 563, cy: 221.8, w: 798, h: 35.5 } },
  /**
   * Two scopes, two geometries.
   *
   * Flipping Mine → Agency is not a cosmetic change: the board goes from one
   * row to seven, the frame grows by ~100px and the agent's own row ends up
   * 110px further down. Both are measured, because the card is welded to that
   * row and has to stay on it while the page grows underneath.
   */
  "leaderboard:mine": { h: 393.5, row: { cx: 563, cy: 238, w: 798, h: 36 } },
  "leaderboard:agency": { h: 496, row: { cx: 563, cy: 349.5, w: 798, h: 37 } },
  /** The advance payout row. The override row lands directly beneath it. */
  "finances:mine": { h: 415.5, row: { cx: 563, cy: 230, w: 798, h: 50 } },
  /**
   * Nova's header strip, not one of the four automation cards.
   *
   * The deal card lands as Nova's subject line and the automations fan out
   * beneath it, which is the beat: Nova acts on this policy. Landing on a 396px
   * card instead would also force this screen to punch nearly twice as deep as
   * its neighbours just to keep the frame's edges off canvas.
   */
  "nova:mine": { h: 393.5, row: { cx: 563, cy: 110.5, w: 800, h: 36 } },

  // ── the four that predate this cut, kept measured for the same reason ─────
  "contracting:mine": { h: 393.5, row: { cx: 385.7, cy: 237.3, w: 443.4, h: 35.5 } },
  "commissions:mine": { h: 393.5, row: { cx: 766, cy: 269.3, w: 368, h: 31.5 } },
  "retention:mine": { h: 406.5, row: { cx: 563, cy: 224.5, w: 798, h: 41 } },
  "grid:mine": { h: 393.5, row: { cx: 392.8, cy: 257.3, w: 457.7, h: 35.5 } },
};

/** Measured geometry for a screen, falling back to its `mine` scope. */
export const frameOf = (screen: ScreenKey, scope: ScreenScope = "mine"): Measured => {
  const m = FRAMES[`${screen}:${scope}`] ?? FRAMES[`${screen}:mine`];
  if (!m) throw new Error(`No measurement for ${screen}:${scope} — run \`npm run measure\`.`);
  return m;
};

/** The frame's own middle, which every transform in `space.ts` is relative to. */
export const centerOf = (screen: ScreenKey, scope: ScreenScope = "mine"): Anchor => ({
  x: FRAME_W / 2,
  y: frameOf(screen, scope).h / 2,
});

/**
 * The row the deal card becomes on a given screen.
 *
 * The card is the main character: it is a prospect card in the pipeline, and
 * then it *becomes* a row in each screen it travels through. So this is not a
 * decorative anchor — the card is sized and positioned to sit exactly on top of
 * the real row, covering it.
 */
export const rowOf = (screen: ScreenKey, scope: ScreenScope = "mine"): FrameRect =>
  frameOf(screen, scope).row;

/**
 * Where a punch-in aims: the row's own centre, always.
 *
 * Learned the hard way on the previous cut. An anchor set to "roughly the
 * interesting part of the screen" leaves the row straddling the canvas edge
 * once the zoom bites, which silently cut the risk score off the right-hand
 * side — the one number that beat existed to count down. The row is the
 * subject; aim at the subject.
 */
export const anchorOf = (screen: ScreenKey, scope: ScreenScope = "mine"): Anchor => {
  const r = rowOf(screen, scope);
  return { x: r.cx, y: r.cy };
};
