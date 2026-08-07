import type { ScreenKey } from "@/components/landing/screens";
import { CX, H } from "../timeline";
import { FRAME_H, FRAME_W, type Anchor, centerOf } from "./anchors";

/**
 * How a product screen is currently sitting on the canvas.
 *
 * One object, consumed by two things that must never disagree: `ScreenStage`,
 * which applies it as a CSS transform, and `toCanvas` below, which applies the
 * same maths numerically. That agreement is what lets the agent card sit inside
 * a table row and stay locked to it through a punch-in.
 */
export type Stage = {
  screen: ScreenKey;
  /** Frame pixels to canvas pixels for the establishing shot. */
  fit: number;
  /** Total zoom, punch-in and any push on top of it. */
  zoom: number;
  /** How far the anchor has been carried to the middle of the card, 0 to 1. */
  pull: number;
  anchor: Anchor;
  /** Where the card's centre sits on the canvas. */
  centerY: number;
  translateX: number;
  translateY: number;
};

export const stage = (screen: ScreenKey, over: Partial<Stage> = {}): Stage => ({
  screen,
  fit: 1,
  zoom: 1,
  pull: 0,
  anchor: centerOf(screen),
  centerY: H / 2,
  translateX: 0,
  translateY: 0,
  ...over,
});

/** A rectangle by its centre, which is the form every morph interpolates in. */
export type Rect = { cx: number; cy: number; w: number; h: number };

/**
 * Map a point from a screen's own coordinate space onto the canvas.
 *
 * Derived from exactly the transform `ScreenStage` writes, in the same order:
 *
 *   1. the inner element scales about `anchor` and is carried by `pull`
 *        q = anchor + zoom·(p − anchor) + pull·(mid − anchor)
 *   2. the outer element scales by `fit` about the card's own middle, and the
 *      whole thing is positioned so that middle lands at (CX, centerY)
 *        canvas = (CX, centerY) + fit·(q − mid) + translate
 *
 * Keeping this in one place is the point. Two implementations of the same
 * transform drift, and the failure mode — a card that sits a few pixels off its
 * row and slides during a punch-in — reads as sloppy animation rather than as
 * the arithmetic bug it is.
 */
export const toCanvas = (s: Stage, p: Anchor): Anchor => {
  const mid = centerOf(s.screen);
  const qx = s.anchor.x + s.zoom * (p.x - s.anchor.x) + s.pull * (mid.x - s.anchor.x);
  const qy = s.anchor.y + s.zoom * (p.y - s.anchor.y) + s.pull * (mid.y - s.anchor.y);
  return {
    x: CX + s.fit * (qx - mid.x) + s.translateX,
    y: s.centerY + s.fit * (qy - mid.y) + s.translateY,
  };
};

/** Frame pixels to canvas pixels, for sizes rather than positions. */
export const scaleOf = (s: Stage) => s.fit * s.zoom;

/** Map a whole rect — the form the agent card wants when it lands in a row. */
export const rectToCanvas = (s: Stage, r: Rect): Rect => {
  const c = toCanvas(s, { x: r.cx, y: r.cy });
  const k = scaleOf(s);
  return { cx: c.x, cy: c.y, w: r.w * k, h: r.h * k };
};

export { FRAME_W, FRAME_H };
