#!/usr/bin/env node
/**
 * Measure the screens, rather than reading numbers off a ruler.
 *
 * Every anchor in `src/lib/anchors.ts` describes where something *actually is*
 * inside a rendered product screen: the height of the frame, the centre of the
 * row the deal card has to cover. Guessing those to the nearest ten pixels puts
 * the card visibly off its row, and the result reads as bad animation rather
 * than as the arithmetic mistake it is.
 *
 * So this renders the `Probe` composition once per screen, lets the page report
 * `getBoundingClientRect()` for the elements that matter, and prints a
 * paste-ready block. When a screen's layout changes in the app, re-run it —
 * nothing else in the video needs to move.
 *
 * Uses the Node API rather than the CLI because the CLI does not forward
 * browser console output at any log level.
 *
 *   npm run measure
 */
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { VIDEO_ROOT, webpackOverride, findChromium } = require("../tools/bundle-config.cjs");

/** Screens to measure, and the scope each is measured in. */
const ONLY = process.env.MEASURE_SCREENS?.split(",").map((x) => x.trim());

const ALL = [
  ["pipeline", "mine"],
  ["postDeal", "mine"],
  ["book", "mine"],
  ["leaderboard", "mine"],
  ["leaderboard", "agency"],
  ["finances", "mine"],
  ["nova", "mine"],
  ["contracting", "mine"],
  ["commissions", "mine"],
  ["retention", "mine"],
  ["grid", "mine"],
];

const SCREENS = ONLY ? ALL.filter(([s]) => ONLY.includes(s)) : ALL;

mkdirSync(path.join(VIDEO_ROOT, "out", "probe"), { recursive: true });

process.stdout.write("bundling ... ");
const serveUrl = await bundle({
  entryPoint: path.join(VIDEO_ROOT, "src", "index.ts"),
  webpackOverride,
});
console.log("ok\n");

const browserExecutable = findChromium();
const results = [];

for (const [screen, scope] of SCREENS) {
  const inputProps = { screen, scope };
  const composition = await selectComposition({
    serveUrl,
    id: "Probe",
    inputProps,
    browserExecutable,
  });

  let line = null;
  await renderStill({
    composition,
    serveUrl,
    inputProps,
    browserExecutable,
    output: path.join(VIDEO_ROOT, "out", "probe", `${screen}-${scope}.png`),
    overwrite: true,
    timeoutInMilliseconds: 120_000,
    onBrowserLog: (log) => {
      if (log.text.startsWith("PROBE ")) line = log.text.slice("PROBE ".length);
    },
  });

  if (!line) {
    console.error(`  ${screen}/${scope}: NO MEASUREMENT — the probe did not report`);
    process.exitCode = 1;
    continue;
  }
  const m = JSON.parse(line);
  results.push(m);
  const r = m.row;
  console.log(
    `  ${(screen + "/" + scope).padEnd(22)} frameH=${String(m.frameH).padStart(6)}  ` +
      (r ? `row cx=${r.cx} cy=${r.cy} w=${r.w} h=${r.h}` : "row NOT FOUND"),
  );
  if (!r) process.exitCode = 1;
}

// ── paste-ready output ──────────────────────────────────────────────────────
const uniq = new Map();
for (const m of results) if (!uniq.has(m.screen)) uniq.set(m.screen, m);

console.log("\n// ── FRAME_H ────────────────────────────────────────────────");
for (const [k, m] of uniq) console.log(`  ${k}: ${Math.round(m.frameH)},`);

console.log("\n// ── rows ───────────────────────────────────────────────────");
for (const m of results) {
  if (!m.row) continue;
  const r = m.row;
  console.log(
    `${m.screen}/${m.scope}: { cx: ${Math.round(r.cx)}, cy: ${Math.round(r.cy)}, ` +
      `w: ${Math.round(r.w)}, h: ${Math.round(r.h)} }`,
  );
}
console.log("\nstills in out/probe/");
