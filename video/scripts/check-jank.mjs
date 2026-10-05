#!/usr/bin/env node
/**
 * Finds discontinuities in the agent card's path, numerically.
 *
 * Every animation comes out janky the first time, and the tell is always the
 * same: a property that should ease smoothly has a visible jump at one specific
 * frame — usually where two phases hand over and one of them starts from the
 * wrong value. The build plan's protocol for this is to render a strip of
 * stills, find the frame, and name it, because "make it smoother" gets you
 * nothing.
 *
 * This does the finding. It samples the card path at every frame of the
 * composition and reports, per property, the largest single-frame change and
 * where it happened. A smooth ease shows a max delta close to the local average.
 * A discontinuity shows a spike — and the frame number in the output is the
 * frame to name.
 *
 * The comparison is against each frame's IMMEDIATE NEIGHBOURS, not against the
 * whole video. That distinction is the difference between a useful check and a
 * noisy one: most of these 900 frames are deliberate stillness, so a global
 * median makes every legitimate 9-frame punch-in look like a spike. What
 * actually indicates a discontinuity is one frame moving far more than the
 * frames either side of it — a smooth ease changes velocity gradually, a jump
 * does not.
 *
 * Run: npm run check:jank
 */
import { pathToFileURL } from "node:url";

const { cardAt, frameEdgesAt, PHASES, SCREEN_PHASES } = await import(
  pathToFileURL(process.env.CARD_PATH_JS).href
);
const { K, W } = await import(pathToFileURL(process.env.TIMELINE_JS).href);

const PROPS = [
  ["cx", (s) => s.rect.cx],
  ["cy", (s) => s.rect.cy],
  ["w", (s) => s.rect.w],
  ["h", (s) => s.rect.h],
  ["radius", (s) => s.radius],
  // Content weights are 0..1; scaled so one is comparable to a pixel.
  ...PHASES.map((p) => [`w:${p}`, (s) => s.weight[p] * 100]),
];

/** A frame moving this many times more than its neighbours is a jump. */
const SPIKE = 4;

/** Below this, a "jump" is sub-pixel and nobody will ever see it. */
const FLOOR = 1.5;

const states = [];
for (let f = 0; f < K.TOTAL; f++) states.push(cardAt(f));

let failures = 0;

for (const [name, get] of PROPS) {
  const deltas = [];
  for (let f = 1; f < states.length; f++) {
    deltas.push({ f, d: Math.abs(get(states[f]) - get(states[f - 1])) });
  }

  if (deltas.every((x) => x.d < 0.0001)) {
    console.log(`  · ${name.padEnd(9)} static`);
    continue;
  }

  let worst = { f: 0, d: 0, ratio: 0 };
  for (let i = 1; i < deltas.length - 1; i++) {
    const here = deltas[i].d;
    if (here < FLOOR) continue;
    const neighbours = Math.max(deltas[i - 1].d, deltas[i + 1].d, 0.001);
    const ratio = here / neighbours;
    if (ratio > worst.ratio) worst = { f: deltas[i].f, d: here, ratio };
  }

  const bad = worst.ratio > SPIKE;
  if (bad) failures++;

  console.log(
    `  ${bad ? "✗" : "✓"} ${name.padEnd(9)} sharpest Δ ${worst.d.toFixed(2)} at frame ${String(worst.f).padStart(3)}` +
      `   ${worst.ratio.toFixed(1)}× its neighbours`,
  );
}

if (failures > 0) {
  console.error(
    `\n${failures} propert${failures === 1 ? "y" : "ies"} jump at a single frame.\n` +
      `Look at the frame named above: most likely a phase that starts from a value\n` +
      `the previous phase did not end on, or two curves driving one property.\n`,
  );
  process.exit(1);
}

// ── The frame's edges must never come into view ────────────────────────────
/*
 * A separate class of defect from jank, and one that also fails silently.
 *
 * Every wide row sits right of the frame's centre, because the nav rail eats
 * the left 146px. Putting that row in the middle of the canvas carries the
 * frame left, so its right edge is the first to come into view — and when it
 * does you get a rounded corner and a 1px border a few dozen pixels in from the
 * side of frame. On near-black that is nearly invisible in a still and
 * unmistakable in motion: the screen stops being an environment and becomes a
 * card sitting on a background.
 *
 * `CARD_W` in timeline.ts is sized to prevent it. This checks that it did.
 */
let edgeFailures = 0;

for (const phase of SCREEN_PHASES) {
  let worst = { f: -1, left: 0, right: 0, slack: Infinity };
  for (let f = 0; f < states.length; f++) {
    // Only judge a screen while it is actually on shot.
    if (states[f].present[phase] < 0.98) continue;
    const [left, right] = frameEdgesAt(f, phase);
    const slack = Math.min(-left, right - W);
    if (slack < worst.slack) worst = { f, left, right, slack };
  }
  if (worst.f < 0) continue;

  // Full-bleed by design, so exact tangency is the target, not a near-miss.
  const ok = worst.slack >= -0.5;
  if (!ok) edgeFailures++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${phase.padEnd(12)} frame edges at ${worst.left.toFixed(1)} / ` +
      `${worst.right.toFixed(1)} on a 0-${W} canvas at frame ${String(worst.f).padStart(3)}`,
  );
}

if (edgeFailures > 0) {
  console.error(
    `\n${edgeFailures} screen(s) let the frame's own edge into shot.\n` +
      `Raise the matching CARD_W in src/timeline.ts — FULL is the width a row at\n` +
      `x=563 needs so that 417 frame-pixels cover half a canvas.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ card path continuous across all ${K.TOTAL} frames, no frame edge in shot`);
