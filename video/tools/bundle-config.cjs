/**
 * The bundle definition, in one place.
 *
 * `remotion.config.ts` configures the CLI; `scripts/measure.mjs` drives the
 * Node API directly, because it needs `onBrowserLog` and the CLI does not
 * forward browser console output at any log level. Both need the same webpack
 * — the `@` alias, the app-token loader, inlined fonts — and two copies of that
 * would drift, with the failure showing up as a measurement taken against a
 * differently-built page than the one the video renders.
 *
 * CommonJS on purpose. The Remotion CLI transpiles `remotion.config.ts` to CJS
 * before loading it, so an `.mjs` here would be unimportable from the config.
 * Unlike in the config, `__dirname` is trustworthy in this file: it is loaded
 * from its real path rather than evaluated inside the CLI's own package.
 */
const fs = require("node:fs");
const path = require("node:path");
const { enableTailwind } = require("@remotion/tailwind-v4");

const VIDEO_ROOT = path.resolve(__dirname, "..");
const APP_SRC = path.resolve(VIDEO_ROOT, "..", "src");

if (!fs.existsSync(path.join(APP_SRC, "components", "landing", "screens.tsx"))) {
  throw new Error(
    `Could not find the app source at ${APP_SRC}. The video/ workspace has to sit ` +
      `next to the application's src/ directory — the "@" alias points at it.`,
  );
}

/** See the long note in remotion.config.ts for why each of these exists. */
const webpackOverride = (current) => {
  const withTailwind = enableTailwind(current);

  // Webpack applies a `use` array right-to-left, so appending runs the token
  // loader FIRST — the app's tokens are spliced in before Tailwind compiles.
  const rules = (withTailwind.module?.rules ?? []).map((rule) => {
    if (
      rule &&
      rule !== "..." &&
      typeof rule === "object" &&
      rule.test?.toString().includes(".css") &&
      Array.isArray(rule.use)
    ) {
      return { ...rule, use: [...rule.use, path.join(__dirname, "app-tokens-loader.cjs")] };
    }
    return rule;
  });

  return {
    ...withTailwind,
    module: {
      ...withTailwind.module,
      rules: [...rules, { test: /\.woff2$/, type: "asset/inline" }],
    },
    resolve: {
      ...withTailwind.resolve,
      alias: { ...withTailwind.resolve?.alias, "@": APP_SRC },
      modules: [path.join(VIDEO_ROOT, "node_modules"), "node_modules"],
    },
  };
};

/**
 * A Chromium already on the machine, when there is one.
 *
 * `headless_shell` across every install before falling back to full `chrome`,
 * rather than checking both inside one directory loop: Playwright installs
 * `chromium-<rev>` and `chromium_headless_shell-<rev>` side by side and the
 * former sorts first, but Remotion drives the browser in old headless mode,
 * which the full binary removed. Finding `chrome` first launches something that
 * exits immediately with "Old Headless mode has been removed" — which does not
 * look like a browser-selection problem at all.
 */
const findChromium = () => {
  const explicit = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (explicit) return explicit;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return null;

  const dirs = fs.readdirSync(root);
  for (const bin of ["chrome-linux/headless_shell", "chrome-linux/chrome"]) {
    for (const dir of dirs) {
      const candidate = path.join(root, dir, bin);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
};

module.exports = { APP_SRC, VIDEO_ROOT, webpackOverride, findChromium };
