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

const { cardAt } = await import(pathToFileURL(process.env.CARD_PATH_JS).href);
const { K } = await import(pathToFileURL(process.env.TIMELINE_JS).href);

const PROPS = [
  ["cx", (s) => s.rect.cx],
  ["cy", (s) => s.rect.cy],
  ["w", (s) => s.rect.w],
  ["h", (s) => s.rect.h],
  ["radius", (s) => s.radius],
  ["rowness", (s) => s.rowness * 100],
  ["logoness", (s) => s.logoness * 100],
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

console.log(`\n✓ card path continuous across all ${K.TOTAL} frames`);
