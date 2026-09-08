/**
 * Fonts are bundled as data URIs — see the `asset/inline` rule in
 * `remotion.config.ts`. The default export is a `data:font/woff2;base64,...`
 * string, ready to hand to `loadFont`.
 */
declare module "*.woff2" {
  const dataUri: string;
  export default dataUri;
}

/**
 * The brand mark, bundled the same way and for the same reason. The default
 * export is a `data:image/jpeg;base64,...` string.
 *
 * It is the application's own asset — `src/assets/agent-cloud-logo.jpg`, the
 * one `BrandLogo` renders — rather than a redrawn copy. A traced SVG cloud is
 * a second source of truth for the logo, and the day the brand changes it is
 * the one nobody remembers to update.
 */
declare module "*.jpg" {
  const dataUri: string;
  export default dataUri;
}
