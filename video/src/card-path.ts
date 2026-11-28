import type { ScreenKey, ScreenScope } from "@/components/landing/screens";
import { centerOf, rowOf } from "./lib/anchors";
import { easeIn, easeInOut, easeOut, lerp } from "./lib/motion";
import type { Rect, Stage } from "./lib/space";
import { stageForCardY } from "./staging";
import { CARD_Y, CX, D, FIT, FRAME_W, K, LOGO_SIDE, R } from "./timeline";

/**
 * Where the deal is, at any frame, and where the screens are around it.
 *
 * Pulled out of the component and made pure for one reason: it is the part of
 * this video most likely to be janky, and a pure function can be *checked*.
 * `scripts/check-jank.mjs` samples every frame of the 900 and reports the
 * largest per-frame change in each property, which finds a discontinuity in
 * seconds instead of by scrubbing a strip of stills and squinting.
 *
 * The build plan's jank protocol says to find the frame and name it. This is
 * how the frame gets named.
 */

/** The eight things the card is, in order. It never cuts; it becomes. */
export const PHASES = [
  "pipeline",
  "postDeal",
  "book",
  "leaderboard",
  "finances",
  "nova",
  "agency",
  "logo",
] as const;
export type Phase = (typeof PHASES)[number];

/** The seven beats that put a screen on the canvas. `logo` is not one. */
export const SCREEN_PHASES = PHASES.slice(0, -1) as readonly Exclude<Phase, "logo">[];
export type ScreenPhase = (typeof SCREEN_PHASES)[number];

/**
 * Which product screen each beat shows.
 *
 * `agency` is not a seventh screen — it is the leaderboard again with the scope
 * toggle flipped. That is what the application actually does, and it is the
 * better shot: the page does not cut, it grows, and the row the card is welded
 * to stays put while six more fade in around it.
 */
export const SCREEN_OF: Record<ScreenPhase, { screen: ScreenKey; scope: ScreenScope }> = {
  pipeline: { screen: "pipeline", scope: "mine" },
  postDeal: { screen: "postDeal", scope: "mine" },
  book: { screen: "book", scope: "mine" },
  leaderboard: { screen: "leaderboard", scope: "mine" },
  finances: { screen: "finances", scope: "mine" },
  nova: { screen: "nova", scope: "mine" },
  agency: { screen: "leaderboard", scope: "agency" },
};

/**
 * When each handover happens: `[start, duration]`, one per gap between phases.
 *
 * Derived from `K`/`D` and never written down twice. Everything below — the
 * card's size, its position, its corner radius, which screen is visible, which
 * content is drawn on the card — moves on exactly these windows, so a beat can
 * be lengthened in `timeline.ts` and nothing gets left behind on the old grid.
 */
const HANDOVER: readonly (readonly [number, number])[] = [
  [K.toForm, D.toForm],
  [K.toBook, D.toBook],
  [K.toBoard, D.toBoard],
  [K.toFinances, D.toFinances],
  [K.toNova, D.toNova],
  [K.scopeExpand, D.scopeExpand],
  [K.morphToLogo, D.morphToLogo],
];

/** The very first arrival, which has no phase before it. */
const OPENING: readonly [number, number] = [0, D.boardBuild];

/**
 * Interpolate a per-phase value across the handovers.
 *
 * One piecewise curve built from `HANDOVER`, so every animated property shares
 * the same timing. This is what makes continuity structural rather than
 * something to be re-checked by eye: two properties cannot disagree about when
 * a handover starts, because there is only one list.
 */
const across = (frame: number, value: Record<Phase, number>): number => {
  const input: number[] = [0];
  const output: number[] = [value[PHASES[0]]];
  HANDOVER.forEach(([start, dur], i) => {
    input.push(start, start + dur);
    output.push(value[PHASES[i]], value[PHASES[i + 1]]);
  });
  input.push(K.TOTAL);
  output.push(value[PHASES[PHASES.length - 1]]);
  return lerp(frame, input, output, easeInOut);
};

/** How present each phase's SCREEN is, 0 to 1. Fades in on its own handover, out on the next. */
const weightOf = (frame: number, i: number): number => {
  const [inStart, inDur] = i === 0 ? OPENING : HANDOVER[i - 1];
  const fadeIn = lerp(frame, [inStart, inStart + inDur], [0, 1], easeOut);
  if (i >= HANDOVER.length) return fadeIn;
  const [outStart, outDur] = HANDOVER[i];
  return fadeIn * (1 - lerp(frame, [outStart, outStart + outDur], [0, 1], easeIn));
};

/** The last handover, where the content has to clear before the gold lands. */
const LAST = HANDOVER.length - 1;

/*
 * The card's CONTENT crosses over faster than the screens behind it, at both
 * ends of a handover. Two reasons, and neither is subtle on screen.
 *
 * Fading both layers on the same curve puts a 4-column form and a 7-cell table
 * row on top of each other at 50% each for a third of the transition — not a
 * dissolve, just two sets of words in the same box. Clearing the old one by 60%
 * and holding the new one back until 40% leaves a fifth of the window where
 * both are faint, which reads as one thing becoming another.
 *
 * The final handover is the acute case: there the card also fills with gold, so
 * text still legible at 20% over a bright fill reads as a rendering fault
 * rather than a transformation. That one gets `D.morphContentOut`.
 */
const CONTENT_IN_AT = 0.4;
const CONTENT_OUT_BY = 0.6;

const contentWeightOf = (frame: number, i: number): number => {
  const [inStart, inDur] = i === 0 ? OPENING : HANDOVER[i - 1];
  const fadeIn = lerp(frame, [inStart + inDur * CONTENT_IN_AT, inStart + inDur], [0, 1], easeOut);
  if (i >= HANDOVER.length) return fadeIn;
  const [outStart, outDur] = HANDOVER[i];
  const dur = i === LAST ? D.morphContentOut : outDur * CONTENT_OUT_BY;
  return fadeIn * (1 - lerp(frame, [outStart, outStart + dur], [0, 1], easeIn));
};

/** Read something off every beat's measured row. */
const measure = (f: (row: { cx: number; cy: number; w: number; h: number }) => number) =>
  Object.fromEntries(
    SCREEN_PHASES.map((p) => {
      const { screen, scope } = SCREEN_OF[p];
      return [p, f(rowOf(screen, scope))];
    }),
  );

/**
 * The card's height in each phase — its row's own height at the one scale.
 *
 * Exported because the card's CONTENT has to be sized from the settled height,
 * not the live one. Sizing text off the animating height means that halfway
 * through the form→row morph the type is still 3x its final size inside a box
 * that is already row-shaped, so every cell truncates to "Willie … Mut… Fina…"
 * for a dozen frames. Content cross-fades at a fixed size; only the box morphs.
 */
export const PHASE_H: Record<Phase, number> = {
  ...(measure((row) => row.h * FIT) as Record<ScreenPhase, number>),
  logo: LOGO_SIDE,
};

const HEIGHT_OF = PHASE_H;

const WIDTH_OF: Record<Phase, number> = {
  ...(measure((row) => row.w * FIT) as Record<ScreenPhase, number>),
  logo: LOGO_SIDE,
};

/**
 * Where the card sits horizontally, per phase.
 *
 * A row is not in the middle of its frame — the nav rail takes the left 146px,
 * so every row in this story is centred on x=563 of 980 and lands a little
 * right of the canvas centre. That is where the row actually is, so that is
 * where the card goes; moving it would unstick it from the row underneath.
 *
 * The logo is the exception and returns to the true centre, which gives the
 * endcard a small settling move to the middle as the last thing that happens.
 */
const CX_OF: Record<Phase, number> = {
  ...(measure((row) => CX + FIT * (row.cx - FRAME_W / 2)) as Record<ScreenPhase, number>),
  logo: CX,
};

/**
 * Corner radius per phase.
 *
 * A prospect card and a form are cards; everything in a table is a row; the
 * logo is a rounded tile. The final morph works precisely because the card has
 * been the same *family* of shape for the whole video — only the radius and the
 * proportions change.
 */
const RADIUS_OF: Record<Phase, number> = {
  pipeline: R.card,
  postDeal: R.card,
  book: R.row,
  leaderboard: R.row,
  finances: R.row,
  nova: R.row,
  agency: R.row,
  logo: R.logo,
};

export type CardState = {
  /** The card, in canvas pixels. */
  rect: Rect;
  radius: number;
  /** How present each phase's content is, for cross-fading what's drawn on the card. */
  weight: Record<Phase, number>;
  /** Each screen's stage, opacity and build-in progress. */
  stages: Record<ScreenPhase, Stage>;
  present: Record<ScreenPhase, number>;
  build: Record<ScreenPhase, number>;
};

/**
 * The card's Y is the primary variable and it only ever decreases.
 *
 * Each screen then positions itself so its row lands here — see
 * `stageForCardY`. With screens at fixed centres the card bobs between beats,
 * because the seven rows sit at different heights inside their screens.
 * Inverting the relationship makes "vertical motion is always up" hold by
 * construction rather than by tuning.
 */
export const cardYAt = (frame: number) => across(frame, CARD_Y);

export const cardAt = (frame: number): CardState => {
  const cardY = cardYAt(frame);

  const weight = Object.fromEntries(PHASES.map((p, i) => [p, contentWeightOf(frame, i)])) as Record<
    Phase,
    number
  >;

  const stages = Object.fromEntries(
    SCREEN_PHASES.map((p) => {
      const { screen, scope } = SCREEN_OF[p];
      const row = rowOf(screen, scope);
      return [
        p,
        stageForCardY(screen, row, cardY, {
          fit: FIT,
          // No punch and no pull. The frame is shown whole, anchored on its own
          // middle, and only slides vertically so its row meets the card.
          zoom: 1,
          pull: 0,
          anchor: centerOf(screen, scope),
          scope,
        }),
      ];
    }),
  ) as Record<ScreenPhase, Stage>;

  // Screens fade on the plain handover window; only the card's content is
  // hurried off ahead of the gold.
  const present = Object.fromEntries(
    SCREEN_PHASES.map((p, i) => [p, weightOf(frame, i)]),
  ) as Record<ScreenPhase, number>;

  const build = Object.fromEntries(
    SCREEN_PHASES.map((p, i) => {
      const [start, dur] = i === 0 ? OPENING : HANDOVER[i - 1];
      return [p, lerp(frame, [start, start + dur], [0, 1], easeOut)];
    }),
  ) as Record<ScreenPhase, number>;

  return {
    rect: {
      cx: across(frame, CX_OF),
      cy: cardY,
      w: across(frame, WIDTH_OF),
      h: across(frame, HEIGHT_OF),
    },
    radius: across(frame, RADIUS_OF),
    weight,
    stages,
    present,
    build,
  };
};

/**
 * The camera.
 *
 * One slow push across the whole video and a single reversal at the very end —
 * the only moment anything in this edit moves backwards. It lives here rather
 * than in the component for the same reason the card's geometry does: it scales
 * the screens about the canvas centre, so it decides whether a frame's own edge
 * comes into shot, and `check:jank` has to be able to see it.
 *
 * Applied to a wrapper around the screens and the card, never to the captions
 * or the readouts — furniture should not breathe.
 */
export const PUSH_TO = 1.045;
export const PULL_BY = 0.11;

export const cameraAt = (frame: number) =>
  lerp(frame, [K.cardSettle, K.morphToLogo], [1, PUSH_TO], easeInOut) -
  PULL_BY * lerp(frame, [K.pullBack, K.pullBack + D.pullBack], [0, 1], easeInOut);

/**
 * Where a screen's own left and right edges land on the canvas, camera included.
 *
 * Its own function because two things need it and they must not disagree: the
 * design says the frame is shown whole and full-bleed, and `check:jank` has to
 * be able to prove that at every frame. An edge drifting inside the canvas is a
 * rounded corner and a 1px border floating mid-frame — nearly invisible in a
 * still on near-black, and unmistakable in motion.
 */
export const frameEdgesAt = (frame: number, phase: ScreenPhase): [number, number] => {
  const s = cardAt(frame).stages[phase];
  const mid = FRAME_W / 2;
  const at = (p: number) => {
    const q = s.anchor.x + s.zoom * (p - s.anchor.x) + s.pull * (mid - s.anchor.x);
    return CX + s.fit * (q - mid) + s.translateX;
  };
  const cam = cameraAt(frame);
  return [CX + (at(0) - CX) * cam, CX + (at(FRAME_W) - CX) * cam];
};
