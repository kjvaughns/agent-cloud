const fs = require("node:fs");
const path = require("node:path");

const MARKER = "@app-tokens";

/**
 * Splices the application's real token layer into the video's stylesheet.
 *
 * Why not just `@import "../../src/styles.css"`, which is the obvious thing:
 * Tailwind v4 resolves `@import` itself, with its own resolver rooted at the
 * directory of the file doing the importing. Inlined that way, `src/styles.css`
 * tries to resolve its own `@import "tailwindcss"` from `<repo>/src`, walks up
 * to `<repo>/node_modules`, and finds nothing — because the whole point of this
 * workspace is that you only install inside `video/`. Webpack's `resolve` never
 * gets a say; the resolution happens inside the Tailwind compiler.
 *
 * So the entry stylesheet declares Tailwind once, itself, from a directory
 * where `tailwindcss` actually resolves, and this loader pastes in everything
 * `src/styles.css` has to say about tokens with its bare `@import`s removed.
 *
 * That makes gotcha (b) — exactly one preflight — a mechanical property of the
 * build rather than a rule someone has to remember. There is no second
 * `@import "tailwindcss"` anywhere in the graph, because this loader deletes
 * the only one that could have existed.
 *
 * `src/styles.css` stays the single source of truth: it is read from disk on
 * every build and registered as a watched dependency, so changing `--gold` in
 * the app changes the gold in this video with no step in between.
 */
module.exports = function appTokensLoader(source) {
  if (!source.includes(MARKER)) return source;

  const appCssPath = path.resolve(process.cwd(), "..", "src", "styles.css");
  const appCssDir = path.dirname(appCssPath);

  this.addDependency(appCssPath);

  let css = fs.readFileSync(appCssPath, "utf8");

  // Drop bare `@import`s (`tailwindcss`, `tw-animate-css`). The entry hoists
  // both, from a directory where they resolve.
  css = css.replace(
    /^[ \t]*@import[ \t]+["'](?![./])([^"']+)["']([^;]*);[ \t]*$/gm,
    (_m, spec) => `/* hoisted to the video entry: @import "${spec}" */`,
  );

  // `@source` is resolved relative to the file that declares it. Having moved
  // this text into `video/src`, every relative source path in it now points at
  // the wrong tree — `@source "../src"` would quietly scan the video workspace
  // instead of the app and generate none of the classes the screens use.
  css = css.replace(
    /@source[ \t]+["']([^"']+)["']/g,
    (m, spec) =>
      spec.startsWith(".") ? `@source "${path.resolve(appCssDir, spec)}"` : m,
  );

  return source.replace(
    new RegExp(`/\\*\\s*${MARKER}\\s*\\*/`),
    () => `/* ── begin src/styles.css ── */\n${css}\n/* ── end src/styles.css ── */`,
  );
};
