// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "node:path";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
const config = defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: { preset: "vercel" },
  vite: {
    resolve: {
      // Exact-match only: a bare "entities" prefix alias also captured
      // htmlparser2's own "entities/decode" (a newer nested copy) and broke
      // dependency pre-bundling, leaving the dev preview stuck loading.
      alias: [
        { find: /^entities\/lib\/decode\.js$/, replacement: path.resolve("node_modules/entities/lib/decode.js") },
        { find: /^entities\/lib\/encode\.js$/, replacement: path.resolve("node_modules/entities/lib/encode.js") },
        { find: /^entities$/, replacement: path.resolve("node_modules/entities") },
      ],
    },
  },
});

export default async (env: import("vite").ConfigEnv) => {
  Object.assign(process.env, loadEnv(env.mode, process.cwd(), ""));
  return config(env);
};
