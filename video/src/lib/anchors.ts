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

/** The carrier request queue, and the Transamerica row inside it. */
export const CONTRACTING_QUEUE: Anchor = { x: 388, y: 212 };
export const CONTRACTING_ROW: Anchor = { x: 388, y: 201 };
/** Frame-space rect of the Transamerica row, for the click highlight. */
export const CONTRACTING_ROW_RECT = { x: 170, y: 185, w: 435, h: 33 };

/** The statement import panel — where a carrier's shortfall shows up. */
export const COMMISSIONS_VARIANCE: Anchor = { x: 762, y: 262 };

/**
 * The at-risk queue.
 *
 * Anchored left of the table's true centre (563) on purpose. At the punch-in's
 * 1.5x the table is wider than the canvas, so something has to fall off the
 * edge; anchoring at 470 drops the Owner initials rather than the client names,
 * and the caption is about a client.
 */
export const RETENTION_QUEUE: Anchor = { x: 470, y: 262 };
/** The top row, 38 frame-pixels above the queue anchor. Drives the spotlight. */
export const RETENTION_TOP_ROW: Anchor = { x: 470, y: 224 };

/** The carrier levels table. */
export const GRID_LEVELS: Anchor = { x: 372, y: 268 };
