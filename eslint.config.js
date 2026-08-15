import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `.vercel` is the build output, and leaving it out is why `eslint .` could
  // not finish. A production build writes about 33MB of bundled JavaScript
  // there — including a single 7.5MB jsdom bundle — and linting it took longer
  // than any patience allows: the run had to be killed at fifteen minutes.
  // With it ignored the same command finishes in under thirty seconds.
  //
  // Same reason for the esbuild scratch files: `package.json`'s check:* scripts
  // bundle a script to `.<name>.mjs` beside the config and run it. They are
  // dotfiles and already in .gitignore, so the pattern matches those and not
  // `scripts/mobile-check.mjs`, which is a real checked-in script.
  { ignores: ["dist", ".output", ".vinxi", ".vercel", ".*.mjs"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  // ── Two rules deliberately reported rather than enforced ──
  //
  // Last, because `eslint-plugin-prettier/recommended` sets its own severity
  // and a flat config's later entries win — an override placed above it is
  // silently undone.
  //
  // Both are real signals worth seeing. Neither is a defect, and leaving them
  // as errors meant `npm run lint` could never pass — which in practice means
  // nobody runs it, and the genuine findings underneath (a self-assignment
  // that normalised nothing, three empty catch blocks) sat unnoticed among
  // twenty-seven thousand others.
  {
    // Every file the prettier preset reaches, not just TypeScript — the
    // checked-in `.mjs` scripts are formatted no more consistently than the
    // rest, and leaving them at `error` would have kept lint failing on
    // sixteen line-break preferences in one file.
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      // 24,863 of them, every one a formatting difference. This repository is
      // edited by Lovable as well as by hand, so a formatting rule set to
      // `error` fails on every generated push — and a one-time
      // `prettier --write .` would rewrite nearly every file, burying real
      // changes in every future diff to fix nothing that was broken.
      "prettier/prettier": "warn",
    },
  },
  {
    // Separate block: `@typescript-eslint` is only registered for TypeScript
    // files, and naming one of its rules against a plain `.mjs` fails the
    // whole config to load rather than the one file.
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // 2,194, and the great majority are the documented house pattern for
      // this codebase: `const supabaseAdmin = _admin as any` and
      // `type Ctx = { supabase: any }`, because the generated Supabase types
      // lag the schema and a migration applied by hand lands before the
      // regenerated types do. Tightening those is a real project; pretending
      // it is a lint failure is not.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
