#!/usr/bin/env node
/**
 * Render one still per beat of interest, before rendering anything long.
 *
 * A 24-second render at full scale takes minutes; a bad `line-height` takes one
 * still to find. Every defect this catches is a layout defect, and layout
 * defects are invisible in a progress bar:
 *
 *   - text clipped, because a wrapper was sized at 1.0 line-height
 *   - things stacked vertically, because `AbsoluteFill` is `display: flex` with
 *     `flex-direction: column` and silently lays children out in a column
 *   - content truncated inside a card, because the frame was laid out too narrow
 *   - the `AppFrame` sidebar missing, because the container query never fired
 *
 * Usage:  npm run audit
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

/**
 * Absolute frames, chosen per scene AFTER its captions have settled.
 *
 * Worth stating because getting it wrong wastes a round: these are absolute,
 * but every scene animates on its own local clock, so a frame that looks late
 * in the video can be frame 3 of the shot it lands in. Scene starts are
 * hook 0, contracting 60, commissions 150, retention 240, grid 330, hero 420,
 * imo 510, cta 600.
 */
const SHOTS = [
  ["hook-words", 25],
  ["contracting-establish", 70],
  ["contracting-punched", 105],
  ["contracting-click", 118],
  ["contracting-zoomout", 147],
  ["commissions-arrive", 153],
  ["commissions-punched", 205],
  ["retention-wipe", 244],
  ["retention-spotlight", 300],
  ["grid-punched", 385],
  ["hero-fan", 445],
  ["hero-line", 498],
  ["imo-lines", 578],
  ["cta", 655],
  ["cta-late", 710],
];

mkdirSync("out/audit", { recursive: true });

for (const [name, frame] of SHOTS) {
  process.stdout.write(`${String(frame).padStart(3)}  ${name} ... `);
  execFileSync(
    "npx",
    [
      "remotion",
      "still",
      "Launch",
      `out/audit/${String(frame).padStart(3, "0")}-${name}.png`,
      `--frame=${frame}`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  console.log("ok");
}

console.log(`\n${SHOTS.length} stills in out/audit/`);
