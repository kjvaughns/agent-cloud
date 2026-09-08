import path from "node:path";
import { Config } from "@remotion/cli/config";

/**
 * The webpack override, the app-source check and the Chromium search all live
 * in `tools/bundle-config.cjs`, because `scripts/measure.mjs` drives the Node
 * API directly and has to build the *same* bundle this config describes.
 *
 * Required by absolute path off `process.cwd()`, not by a relative specifier.
 * The CLI transpiles this file to CJS and evaluates the result from inside its
 * own package, so `__dirname` here is `node_modules/@remotion/cli/dist` and
 * `import.meta.url` is empty — a relative require resolves against Remotion's
 * source tree rather than this folder. `process.cwd()` is this directory,
 * because the CLI must be run from wherever `remotion.config.ts` lives.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { webpackOverride, findChromium } = require(
  path.resolve(process.cwd(), "tools", "bundle-config.cjs"),
);

Config.overrideWebpackConfig(webpackOverride);

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

const chromium = findChromium();
if (chromium) {
  Config.setBrowserExecutable(chromium);
}
