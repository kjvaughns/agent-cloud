import type { ScreenKey } from "@/components/landing/screens";
import { FRAME_H, FRAME_W, type Anchor, type FrameRect } from "./lib/anchors";
import { type Stage, type Rect, rectToCanvas, stage } from "./lib/space";
import { CX } from "./timeline";

/**
 * Position a screen so that one of its rows lands at a chosen canvas Y.
 *
 * This inverts the usual relationship, and doing so is what makes the motion
 * grammar hold. The rule is that vertical motion is always UP — the card climbs
 * through the whole video and nothing moves down until the final settle. If
 * each screen were placed at a fixed centre and the card were animated into
 * whatever row position that produced, the card would bob up and down between
 * beats, because the three rows sit at different heights inside their screens.
 *
 * So the card's Y is the primary variable and the screens arrange themselves
 * around it. Solving for `centerY`:
 *
 *   canvasY = centerY + fit·(qy − mid.y)      [from toCanvas]
 *   centerY = cardY  − fit·(qy − mid.y)
 *
 * with qy the row's Y after the punch-in has been applied. The card then climbs
 * monotonically, 880 → 828 → 776 → 724, and each screen slides to meet it.
 */
export const stageForCardY = (
  screen: ScreenKey,
  row: FrameRect,
  cardY: number,
  opts: { fit: number; zoom: number; pull: number; anchor: Anchor },
): Stage => {
  const midY = FRAME_H[screen] / 2;
  const qy =
    opts.anchor.y + opts.zoom * (row.cy - opts.anchor.y) + opts.pull * (midY - opts.anchor.y);

  return stage(screen, {
    fit: opts.fit,
    zoom: opts.zoom,
    pull: opts.pull,
    anchor: opts.anchor,
    centerY: cardY - opts.fit * (qy - midY),
  });
};

/** Where a row has ended up on the canvas, given its screen's current stage. */
export const rowRect = (s: Stage, row: FrameRect): Rect => rectToCanvas(s, row);

/**
 * The build-in wipe.
 *
 * A single horizontal `clip-path` opening left to right. Because the sidebar is
 * the leftmost thing in `AppFrame`, one wipe naturally reveals the nav rail
 * first and the content after it — which is the "sidebar wipes in from the
 * left, header from the top" beat, achieved without needing to reach inside a
 * component this workspace does not own.
 *
 * The card is drawn above the screen and arrives first, so the app assembles
 * around a record that was already there. That ordering is the point of the
 * beat: the card was there before the app was.
 */
export const buildWipe = (t: number) => `inset(0 ${(1 - t) * 100}% 0 0 round 22px)`;

export { FRAME_W, CX };
