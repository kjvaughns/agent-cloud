import {
  CONTRACTING_QUEUE,
  CONTRACTING_ROW,
  COMMISSIONS_ROW,
  COMMISSIONS_VARIANCE,
  RETENTION_QUEUE,
  RETENTION_ROW,
} from "./lib/anchors";
import { easeInOut, easeOut, lerp, lerpRect } from "./lib/motion";
import type { Rect, Stage } from "./lib/space";
import { rowRect, stageForCardY } from "./staging";
import { CX, D, FIT, K, R } from "./timeline";

/**
 * Where the agent card is, at any frame, and where the screens are around it.
 *
 * Pulled out of the component and made pure for one reason: it is the part of
 * this video most likely to be janky, and a pure function can be *checked*.
 * `scripts/check-jank.mjs` samples every frame of the 900 and reports the
 * largest per-frame change in each property, which finds a discontinuity in
 * seconds instead of by scrubbing a strip of stills and squinting.
 *
 * The build plan's jank protocol says to find the frame and name it. This is
 * how the frame gets named.
 *
 * Continuity is by construction: every handover interpolates FROM the rect the
 * previous phase ended on, so at `t = 0` each branch returns exactly what the
 * branch above it returned at `t = 1`. The checker exists to catch the day
 * someone edits that property away.
 */

// ── Where the card is, beat by beat. Always climbing. ──────────────────────
export const CARD_Y_HOOK = 880;
export const CARD_Y_CONTRACTING = 828;
export const CARD_Y_COMMISSIONS = 776;
export const CARD_Y_RETENTION = 724;
export const CARD_Y_CLIMAX = 656;
export const CARD_Y_LOGO = 610;

export const HOOK_W = 620;
export const HOOK_H = 240;
export const CLIMAX_W = 452;
export const CLIMAX_H = 104;
export const LOGO_SIDE = 236;

/**
 * Punch-in depth per screen.
 *
 * Not a taste setting. Each one is chosen so that (a) the card-as-row fits the
 * canvas with its status pill intact, and (b) the screen behind it reaches the
 * right-hand edge rather than stopping short and leaving a band of black.
 * Retention's row is by far the widest, so it punches least; commissions
 * anchors far to the right of its screen, so it has to punch hardest to drag
 * the screen's right edge back into frame.
 */
export const ZOOM_CONTRACTING = 1.9;
export const ZOOM_COMMISSIONS = 2.1;
export const ZOOM_RETENTION = 1.2;

export type CardState = {
  rect: Rect;
  radius: number;
  /** 0 = profile card, 1 = table row. */
  rowness: number;
  /** 0 = card, 1 = logo tile. */
  logoness: number;
  s1: Stage;
  s2: Stage;
  s3: Stage;
  /** Build progress per screen, 0 to 1. */
  build1: number;
  build2: number;
  build3: number;
};

export const cardAt = (frame: number): CardState => {
  const pRise = lerp(frame, [K.cardRise, K.cardRise + D.cardRise], [0, 1], easeInOut);
  const build1 = lerp(frame, [K.frameBuild, K.frameBuild + D.frameBuild], [0, 1], easeOut);
  const pPunch1 = lerp(frame, [K.punchIn, K.punchIn + D.punchIn], [0, 1], easeOut);
  const pTravel2 = lerp(frame, [K.travelUp, K.travelUp + D.travelUp], [0, 1], easeInOut);
  const build2 = lerp(frame, [K.frameBuild2, K.frameBuild2 + D.frameBuild2], [0, 1], easeOut);
  const pTravel3 = lerp(frame, [K.travelUp2, K.travelUp2 + D.travelUp2], [0, 1], easeInOut);
  const build3 = lerp(frame, [K.frameBuild3, K.frameBuild3 + D.frameBuild3], [0, 1], easeOut);
  const pShrink = lerp(frame, [K.cardShrink, K.cardShrink + D.cardShrink], [0, 1], easeInOut);
  const pMorph = lerp(frame, [K.morphToLogo, K.morphToLogo + D.morphToLogo], [0, 1], easeInOut);

  /*
   * The card's Y is the primary variable and it only ever decreases. Each
   * screen then positions itself so its row lands here — see `stageForCardY`.
   */
  const cardY = lerp(
    frame,
    [
      K.cardRise,
      K.cardRise + D.cardRise,
      K.travelUp,
      K.travelUp + D.travelUp,
      K.travelUp2,
      K.travelUp2 + D.travelUp2,
      K.cardShrink,
      K.cardShrink + D.cardShrink,
    ],
    [
      CARD_Y_HOOK,
      CARD_Y_CONTRACTING,
      CARD_Y_CONTRACTING,
      CARD_Y_COMMISSIONS,
      CARD_Y_COMMISSIONS,
      CARD_Y_RETENTION,
      CARD_Y_RETENTION,
      CARD_Y_CLIMAX,
    ],
    easeInOut,
  );

  const s1 = stageForCardY("contracting", CONTRACTING_ROW, cardY, {
    fit: FIT,
    zoom: 1 + (ZOOM_CONTRACTING - 1) * pPunch1,
    pull: pPunch1,
    anchor: CONTRACTING_QUEUE,
  });
  const s2 = stageForCardY("commissions", COMMISSIONS_ROW, cardY, {
    fit: FIT,
    zoom: 1 + (ZOOM_COMMISSIONS - 1) * build2,
    pull: build2,
    anchor: COMMISSIONS_VARIANCE,
  });
  const s3 = stageForCardY("retention", RETENTION_ROW, cardY, {
    fit: FIT,
    zoom: 1 + (ZOOM_RETENTION - 1) * build3,
    pull: build3,
    anchor: RETENTION_QUEUE,
  });

  const hookRect = { cx: CX, cy: cardY, w: HOOK_W, h: HOOK_H };
  const r1 = rowRect(s1, CONTRACTING_ROW);
  const r2 = rowRect(s2, COMMISSIONS_ROW);
  const r3 = rowRect(s3, RETENTION_ROW);
  const climaxRect = { cx: CX, cy: cardY, w: CLIMAX_W, h: CLIMAX_H };
  const logoRect = { cx: CX, cy: CARD_Y_LOGO, w: LOGO_SIDE, h: LOGO_SIDE };

  let rect = hookRect;
  let rowness = 0;
  let radius: number = R.card;

  if (frame >= K.cardRise) {
    rect = lerpRect(hookRect, r1, pRise);
    rowness = pRise;
    radius = R.card + (R.row - R.card) * pRise;
  }
  if (frame >= K.travelUp) {
    rect = lerpRect(r1, r2, pTravel2);
    rowness = 1;
    radius = R.row;
  }
  if (frame >= K.travelUp2) {
    rect = lerpRect(r2, r3, pTravel3);
  }
  if (frame >= K.cardShrink) {
    rect = lerpRect(r3, climaxRect, pShrink);
  }
  if (frame >= K.morphToLogo) {
    rect = lerpRect(climaxRect, logoRect, pMorph);
    rowness = 1 - lerp(frame, [K.morphToLogo, K.morphToLogo + D.morphContentOut], [0, 1], easeOut);
    radius = R.row + (R.logo - R.row) * pMorph;
  }

  return { rect, radius, rowness, logoness: pMorph, s1, s2, s3, build1, build2, build3 };
};
