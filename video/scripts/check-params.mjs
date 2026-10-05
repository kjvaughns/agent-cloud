#!/usr/bin/env node
/**
 * Enforces the one hard rule: every number that governs look or motion lives in
 * `src/timeline.ts`, and nowhere else.
 *
 * This exists because the rule does not hold on its own. Left unchecked, magic
 * numbers creep back into scene files within a couple of edits — a `#C9A227`
 * pasted inline here, a `frame > 340` there — and each one is a landmine that
 * produces no error and only shows up if you happen to scrub past that exact
 * moment after changing an earlier beat.
 *
 * Three checks, chosen because each is unambiguous. Deliberately NOT checking
 * every integer: scene files are full of legitimate layout pixels, and a rule
 * that fires on `left: 108` would be turned off within a day, which is worse
 * than no rule.
 *
 *   1. hex colour literals            — always a token
 *   2. spring config keys             — always S.SNAP / S.POP / S.NONE
 *   3. numbers inside a frame-driven  — always a K.* or D.* value
 *      interpolate/lerp input range
 *
 * Run: npm run check:params  (also runs as part of npm run typecheck)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "src";
/**
 * `Probe` is the measurement rig, not the video. Its ruler is magenta and cyan
 * precisely so those lines can never be mistaken for something the product
 * would render, and putting them in the palette would be worse than exempting
 * the one file that uses them.
 */
const EXEMPT = new Set(["src/timeline.ts", "src/Probe.tsx"]);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk(ROOT).filter((f) => /\.tsx?$/.test(f) && !EXEMPT.has(f.replace(/\\/g, "/")));

const problems = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    const where = `${relative(".", file)}:${i + 1}`;

    // Comments are prose. A doc block that mentions #C9A227 to explain the
    // token is the opposite of the problem this catches.
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (/^\s*\*/.test(line)) return;

    if (/#[0-9a-fA-F]{3,8}\b/.test(code)) {
      problems.push([where, "hex colour literal — use a token from C", code.trim()]);
    }

    if (/\b(damping|stiffness|mass)\s*:/.test(code)) {
      problems.push([where, "spring config — use S.SNAP / S.POP / S.NONE", code.trim()]);
    }

    /*
     * A frame-driven input range: `lerp(frame, [a, b], ...)`. The numbers in
     * that first array are points in time and must be named. Output ranges are
     * not checked — those are pixels, opacities and scales, which belong to the
     * scene.
     */
    const timed = code.match(/\b(?:lerp|interpolate)\(\s*(?:frame|f)\s*,\s*\[([^\]]*)\]/g);
    for (const m of timed ?? []) {
      const inner = m.slice(m.indexOf("[") + 1, m.lastIndexOf("]"));
      // A bare integer with no K./D. next to it is a hardcoded frame.
      const bare = inner
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^-?\d+(\.\d+)?$/.test(s));
      if (bare.length > 0) {
        problems.push([
          where,
          `hardcoded frame number(s) ${bare.join(", ")} — derive from K / D`,
          code.trim(),
        ]);
      }
    }
  });
}

if (problems.length === 0) {
  console.log(`✓ ${files.length} files — no hardcoded colours, springs or frame numbers`);
  process.exit(0);
}

console.error(`\n${problems.length} parameterization problem(s):\n`);
for (const [where, why, code] of problems) {
  console.error(`  ${where}`);
  console.error(`    ${why}`);
  console.error(`    ${code.slice(0, 100)}\n`);
}
console.error("Every number governing look or motion belongs in src/timeline.ts.\n");
process.exit(1);
