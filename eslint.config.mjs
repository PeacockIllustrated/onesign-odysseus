import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static assets are not source — notably the vendored, minified pdf.js
    // worker (public/pdf.worker.min.mjs), which otherwise floods lint with
    // errors from third-party minified code.
    "public/**",
    // Test fixtures holding third-party code verbatim — Mak's original sign
    // calculator engine, kept as-is so panel_letters_v2 can be held to it. It
    // is a .cjs file, which eslint-config-next's react-hooks plugin does not
    // cover, so the global rule overrides below would otherwise crash lint.
    "lib/quoter/engine/__fixtures__/**",
  ]),
  {
    rules: {
      // Tracked debt, being paid down in the Result<T>/typing migration
      // (docs/PRODUCTION-AUDIT.md, Phase 3). Demoted to warnings so CI can
      // block on real errors without drowning in the legacy `any` count.
      "@typescript-eslint/no-explicit-any": "warn",
      // New React-Compiler-era hooks rules surfaced by the eslint-config-next
      // bump. Demoted pending a dedicated review; rules-of-hooks (the genuine
      // bug rule) intentionally stays an error.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Cosmetic: unescaped apostrophes/quotes in JSX text render fine.
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
