import fs from "node:fs";
import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

/**
 * The app's source tree, resolved from the working directory.
 *
 * Neither of the obvious anchors works here. The Remotion CLI transpiles this
 * file to CJS before loading it, so `import.meta.url` is empty and
 * `fileURLToPath` throws; and it evaluates the result from inside its own
 * package, so `__dirname` is `node_modules/@remotion/cli/dist` rather than this
 * directory. Aliasing `@` against that silently points the alias at Remotion's
 * own source and you get a wall of "doesn't exist" from the resolver.
 *
 * `process.cwd()` is this folder, because the CLI has to be run from wherever
 * `remotion.config.ts` lives. The check below turns a wrong cwd into one clear
 * sentence instead of that wall.
 */
const appSrc = path.resolve(process.cwd(), "..", "src");

if (!fs.existsSync(path.join(appSrc, "components", "landing", "screens.tsx"))) {
  throw new Error(
    `Could not find the app source at ${appSrc}. Run Remotion from the video/ directory — ` +
      `the "@" alias is resolved relative to the current working directory.`,
  );
}

Config.overrideWebpackConfig((current) => {
  const withTailwind = enableTailwind(current);

  /**
   * Run the token loader ahead of Tailwind's.
   *
   * Webpack applies a `use` array right-to-left, so appending puts this first
   * in execution order — the app's tokens are spliced in before the Tailwind
   * compiler ever looks at the file.
   */
  const rules = (withTailwind.module?.rules ?? []).map((rule) => {
    if (
      rule &&
      rule !== "..." &&
      typeof rule === "object" &&
      rule.test?.toString().includes(".css") &&
      Array.isArray(rule.use)
    ) {
      return {
        ...rule,
        use: [...rule.use, path.resolve(process.cwd(), "tools", "app-tokens-loader.cjs")],
      };
    }
    return rule;
  });

  return {
    ...withTailwind,
    module: {
      ...withTailwind.module,
      rules: [
        ...rules,
        /**
         * Fonts are inlined into the bundle as data URIs, not served.
         *
         * Fetching them with `staticFile()` is the documented path and it fails
         * here, reproducibly, several hundred frames into a render: Remotion
         * runs multiple browser pages and recycles them, every new page
         * re-evaluates the font module, and a request issued while every other
         * page is saturating the CPU can miss `@remotion/fonts`' internal
         * 28-second budget. That budget is inside the package, so no amount of
         * raising ours helps — the render simply dies at frame 224 with a
         * timeout that looks like a font problem and is really a scheduling one.
         *
         * Five woff2 files come to 65KB. Inlining them costs ~88KB of base64 in
         * the bundle and removes the entire failure class: there is no server,
         * no request, and nothing to race.
         */
        { test: /\.woff2$/, type: "asset/inline" },
      ],
    },
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...withTailwind.resolve?.alias,
        // Gotcha (a) in the README. `screens.tsx` imports `@/lib/utils` and
        // `@/lib/format`; without this there is no video.
        "@": appSrc,
      },
      /**
       * Bare imports inside the app's files — `lucide-react`, `clsx`,
       * `tailwind-merge` — resolve from here rather than by walking up from
       * `src/`, which is what Node would do and which finds nothing unless the
       * whole application has been installed. This is what keeps `video/` a
       * self-contained workspace: `npm install` in this folder is the only
       * install anyone needs to render.
       */
      modules: [path.resolve(process.cwd(), "node_modules"), "node_modules"],
    },
  };
});

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

/**
 * A generous `delayRender` budget.
 *
 * The 28-second default is ample for what this video actually waits on — five
 * woff2 faces, inlined into the bundle as data URIs — and it still killed a
 * 720-frame render at frame 224, reproducibly, while the same frames rendered
 * fine in isolation.
 *
 * The cause is not the fonts. A render does not use one browser page: Remotion
 * runs several concurrently and spawns fresh ones as it goes, and every new
 * page re-evaluates the bundle from scratch. Do that a few hundred frames in,
 * on a machine whose cores are all busy encoding, and boot-to-first-paint on
 * the new page can exceed a timer that started the moment the module was
 * evaluated. The failure then surfaces as "a delayRender was called but not
 * cleared", which reads as a font bug and is really a scheduling one.
 *
 * Set globally rather than per-call because `@remotion/fonts` opens its own
 * handle internally, with its own default — so a `timeoutInMilliseconds` on our
 * `delayRender` fixes our half and leaves theirs to fail four frames later.
 */
Config.setDelayRenderTimeoutInMilliseconds(120_000);

/**
 * Use a Chromium that is already on the machine, when one is.
 *
 * Remotion otherwise downloads its own Chrome Headless Shell from
 * remotion.media on first render. Behind an egress allowlist — CI, this repo's
 * sandbox, most locked-down build images — that 403s and the render dies before
 * it starts, with an error that reads like a Remotion bug rather than a network
 * policy. Playwright's Chromium is already installed in all of those places.
 *
 * Explicit env var first, then the standard Playwright location, then Remotion's
 * own resolution — which is the right answer on a developer's laptop, where the
 * download works fine.
 */
const findChromium = (): string | null => {
  const explicit = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (explicit) return explicit;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return null;

  /*
   * `headless_shell` across every install before falling back to full `chrome`,
   * rather than checking both inside one directory loop.
   *
   * Playwright installs `chromium-<rev>` and `chromium_headless_shell-<rev>`
   * side by side, and `chromium-<rev>` sorts first. Remotion drives the browser
   * in old headless mode, which the full binary removed — so finding `chrome`
   * first launches something that immediately exits with "Old Headless mode has
   * been removed", which does not look like a browser-selection problem at all.
   */
  const dirs = fs.readdirSync(root);
  for (const bin of ["chrome-linux/headless_shell", "chrome-linux/chrome"]) {
    for (const dir of dirs) {
      const candidate = path.join(root, dir, bin);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
};

const chromium = findChromium();
if (chromium) {
  Config.setBrowserExecutable(chromium);
}
