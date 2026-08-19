import type { ScreenKey } from "@/components/landing/screens";

/**
 * The frame's natural layout width, in CSS pixels.
 *
 * Gotcha (c) in the README, and the one that costs the most if you get it
 * wrong. `AppFrame` is an `@container/frame`; its sidebar is `@3xl/frame:block`,
 * so it exists only above 768px of *layout* width, and the second column and
 * table headers of every screen key off `@xl/frame` at 576px.
 *
 * So the card is laid out at 980px and shrunk with a CSS transform. Setting
 * `width: 900px` to make it fit a 1080px canvas looks like it worked and
 * quietly costs you the nav rail, the table headers and the right-hand column —
 * most of what makes this read as an application rather than a card with rows
 * in it. Transforms do not affect layout width, so the query still sees 980.
 */
export const FRAME_W = 980;

export type Anchor = { x: number; y: number };

/**
 * Element coordinates, in frame pixels, read off the `Probe` composition.
 *
 * A punch-in that closes on "roughly the middle-left" is the difference between
 * a shot that looks aimed and one that looks like a zoom. These are measured,
 * not guessed: render `Probe` for a screen, read the ruler, write it down here.
 *
 *   npm run still -- Probe out/probe.png --props='{"screen":"retention"}'
 *
 * If a screen's layout changes in the app, re-run the probe and update these.
 * Nothing else in the video needs to move.
 */

/** Card height at FRAME_W, per screen. Used to find the card's centre. */
export const FRAME_H: Record<ScreenKey, number> = {
  contracting: 390,
  commissions: 390,
  retention: 404,
  grid: 390,
};

export const centerOf = (screen: ScreenKey): Anchor => ({
  x: FRAME_W / 2,
  y: FRAME_H[screen] / 2,
});

/**
 * The rows the agent card lands in.
 *
 * The card is the main character: it is a profile card in the hook, and then it
 * *becomes* a row in each screen it travels through. So these are not decorative
 * anchors — the card is sized and positioned to sit exactly on top of the real
 * row, covering it. Measured from `Probe`; a few pixels out and the card visibly
 * floats above the table instead of being part of it.
 */
export type FrameRect = { cx: number; cy: number; w: number; h: number };

/** The carrier request queue, and row three inside it. */
export const CONTRACTING_QUEUE: Anchor = { x: 388, y: 212 };
export const CONTRACTING_ROW: FrameRect = { cx: 388, cy: 236, w: 435, h: 35 };

/** The statement import panel — where a carrier's shortfall shows up. */
export const COMMISSIONS_VARIANCE: Anchor = { x: 762, y: 262 };
/** The Transamerica statement line. Same carrier, one system over. */
export const COMMISSIONS_ROW: FrameRect = { cx: 767, cy: 269, w: 365, h: 30 };

/**
 * The at-risk queue, anchored on the row's own centre.
 *
 * The card BECOMES this row, and a row whose centre is not the punch anchor
 * ends up straddling the canvas edge — which silently cut the risk score off
 * the right-hand side, the one number the beat is counting down.
 */
export const RETENTION_QUEUE: Anchor = { x: 563, y: 262 };
/** The top row of the at-risk queue. Drives both the card and the spotlight. */
export const RETENTION_ROW: FrameRect = { cx: 563, cy: 225, w: 802, h: 36 };

/** The carrier levels table. */
export const GRID_LEVELS: Anchor = { x: 372, y: 268 };
