#!/usr/bin/env node
/**
 * One still per beat, rendered before anything long.
 *
 * A 30-second render takes minutes; a bad `line-height` takes one still to
 * find. Every defect this catches is a layout defect, and layout defects are
 * invisible in a progress bar:
 *
 *   - text clipped, because a wrapper was sized at 1.0 line-height
 *   - things stacked vertically, because `AbsoluteFill` is `display: flex` with
 *     `flex-direction: column` and silently lays children out in a column
 *   - content truncated inside a card
 *   - the `AppFrame` sidebar missing, because the container query never fired
 *
 * Frames are DERIVED from the timeline, never typed in — the same rule the rest
 * of the project follows. Lengthen a duration and the audit follows the edit
 * instead of quietly sampling the wrong moments.
 *
 * Usage:  npm run audit
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { K, D } = await import(pathToFileURL(process.env.TIMELINE_JS).href);

const SHOTS = [
  ["hook-typed", K.typeMeta + D.typeMeta],
  ["hook-burst", K.stampBurst + Math.round(D.stampBurst * 0.4)],
  ["hook-caption", K.holdHook + Math.round(D.holdHook * 0.6)],
  ["reveal-rise", K.cardRise + Math.round(D.cardRise * 0.6)],
  ["reveal-built", K.screenSettle + D.screenSettle],
  ["reveal-hold", K.holdReveal + Math.round(D.holdReveal * 0.7)],
  ["s1-punched", K.punchIn + D.punchIn],
  ["s1-click", K.cursorClick + Math.round(D.cursorClick * 0.6)],
  ["s1-typing", K.typeWritingNum + Math.round(D.typeWritingNum * 0.7)],
  ["s1-active", K.activeBurst + Math.round(D.activeBurst * 0.4)],
  ["s1-caption", K.holdShowcase1 + Math.round(D.holdShowcase1 * 0.5)],
  ["s2-travel", K.travelUp + Math.round(D.travelUp * 0.5)],
  ["s2-counting", K.varianceCount + Math.round(D.varianceCount * 0.8)],
  ["s2-caption", K.holdShowcase2 + Math.round(D.holdShowcase2 * 0.5)],
  ["s3-travel", K.travelUp2 + Math.round(D.travelUp2 * 0.5)],
  ["s3-spotlight", K.riskFall + Math.round(D.riskFall * 0.6)],
  ["s3-caption", K.holdShowcase3 + Math.round(D.holdShowcase3 * 0.5)],
  ["climax-fan", K.fanOut + D.fanOut],
  ["climax-converged", K.climaxLine + D.climaxLine],
  ["climax-hold", K.holdClimax + Math.round(D.holdClimax * 0.5)],
  ["close-morph", K.morphToLogo + Math.round(D.morphToLogo * 0.55)],
  ["close-logo", K.pill + D.pill],
  ["close-settled", K.holdClose + Math.round(D.holdClose * 0.6)],
];

rmSync("out/audit", { recursive: true, force: true });
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
