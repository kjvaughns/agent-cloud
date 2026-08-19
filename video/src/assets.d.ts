/**
 * Fonts are bundled as data URIs — see the `asset/inline` rule in
 * `remotion.config.ts`. The default export is a `data:font/woff2;base64,...`
 * string, ready to hand to `loadFont`.
 */
declare module "*.woff2" {
  const dataUri: string;
  export default dataUri;
}
