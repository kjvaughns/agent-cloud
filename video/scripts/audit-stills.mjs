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
 *   - two captions on screen at once, or a caption sitting on a table
 *
 * Frames are DERIVED from the timeline, never typed in — the same rule the rest
 * of the project follows. Lengthen a duration and the audit follows the edit
 * instead of quietly sampling the wrong moments.
 *
 * Uses the Node API rather than one `npx remotion still` per shot: that spawned
 * a fresh bundle and a fresh browser thirty-odd times, which took longer than
 * the render it exists to happen before.
 *
 * Usage:  npm run audit
 */
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { VIDEO_ROOT, webpackOverride, findChromium } = require("../tools/bundle-config.cjs");
const { K, D } = await import(pathToFileURL(process.env.TIMELINE_JS).href);

/** Part-way through a beat, so the still shows motion rather than its endpoints. */
const into = (start, dur, frac) => start + Math.round(dur * frac);

const SHOTS = [
  ["p1-built", into(K.boardBuild, D.boardBuild, 1)],
  ["p1-card", into(K.cardSettle, D.cardSettle, 1)],
  ["p1-cursor", into(K.cursorTravel, D.cursorTravel, 0.7)],
  ["p1-click", into(K.cursorClick, D.cursorClick, 0.6)],
  ["p1-burst", into(K.soldBurst, D.soldBurst, 0.4)],
  ["p1-caption", into(K.holdPipeline, D.holdPipeline, 0.5)],

  ["p2-travel", into(K.toForm, D.toForm, 0.5)],
  ["p2-form", into(K.formBuild, D.formBuild, 1)],
  ["p2-typing", into(K.typeProduct, D.typeProduct, 0.7)],
  ["p2-premium", into(K.typePremium, D.typePremium, 0.85)],
  ["p2-annual", into(K.annualResolve, D.annualResolve, 1)],
  ["p2-post", into(K.postClick, D.postClick, 0.7)],
  ["p2-burst", into(K.postBurst, D.postBurst, 0.4)],
  ["p2-caption", into(K.holdPostDeal, D.holdPostDeal, 0.6)],

  ["p3-travel", into(K.toBook, D.toBook, 0.5)],
  ["p3-land", into(K.rowLand, D.rowLand, 1)],
  ["p3-dates", into(K.datesReveal, D.datesReveal, 1)],
  ["p3-caption", into(K.holdBook, D.holdBook, 0.5)],

  ["p4-travel", into(K.toBoard, D.toBoard, 0.5)],
  ["p4-count", into(K.alpCount, D.alpCount, 0.8)],
  ["p4-rank", into(K.rankTick, D.rankTick, 1)],
  ["p4-caption", into(K.holdBoard, D.holdBoard, 0.5)],

  ["p5-travel", into(K.toFinances, D.toFinances, 0.5)],
  ["p5-advance", into(K.advanceLand, D.advanceLand, 1)],
  ["p5-override", into(K.overrideSpawn, D.overrideSpawn, 0.7)],
  ["p5-readout", into(K.overrideCount, D.overrideCount, 1)],
  ["p5-caption", into(K.holdFinances, D.holdFinances, 0.5)],

  ["p6-travel", into(K.toNova, D.toNova, 0.5)],
  ["p6-fan", into(K.novaFan, D.novaFan, 1)],
  ["p6-caption", into(K.holdNova, D.holdNova, 0.5)],

  ["p7-cue", into(K.scopeCue, D.scopeCue, 1)],
  ["p7-expand", into(K.scopeExpand, D.scopeExpand, 0.7)],
  ["p7-hold", into(K.holdAgency, D.holdAgency, 0.5)],

  ["p8-morph", into(K.morphToLogo, D.morphToLogo, 0.55)],
  ["p8-logo", into(K.wordmark, D.wordmark, 1)],
  ["p8-line", into(K.pill, D.pill, 1)],
  ["p8-settled", into(K.holdClose, D.holdClose, 0.6)],
];

const OUT = path.join(VIDEO_ROOT, "out", "audit");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

process.stdout.write("bundling ... ");
const serveUrl = await bundle({
  entryPoint: path.join(VIDEO_ROOT, "src", "index.ts"),
  webpackOverride,
});
console.log("ok\n");

const browserExecutable = findChromium();
const composition = await selectComposition({ serveUrl, id: "Launch", browserExecutable });

for (const [name, frame] of SHOTS) {
  process.stdout.write(`${String(frame).padStart(3)}  ${name} ... `);
  await renderStill({
    composition,
    serveUrl,
    browserExecutable,
    frame,
    overwrite: true,
    timeoutInMilliseconds: 120_000,
    output: path.join(OUT, `${String(frame).padStart(3, "0")}-${name}.png`),
  });
  console.log("ok");
}

console.log(`\n${SHOTS.length} stills in out/audit/`);
