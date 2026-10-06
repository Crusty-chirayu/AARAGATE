import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    // Generated browser diagnostics contain third-party bundles, not application source.
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "next-env.d.ts",
    // Deno runtime — typechecked separately by `deno check` in CI,
    // not by the Next.js/Node ESLint program.
    "supabase/functions/**",
    // k6 load scripts run in the k6 runtime and intentionally use require().
    "load/**",
    // Stale agent worktree copy — not part of the build.
    ".kilo/**",
    // Prompt-asset helper scripts; .cjs files use require() intentionally.
    ".github/**",
  ]),

  {
    // NOTE: `react-hooks` is already registered by
    // `eslint-config-next/core-web-vitals` (see the `plugins` key there).
    // Registering it again here throws "Cannot redefine plugin" under flat
    // config, because eslint-config-next and this file resolve *different*
    // module instances of eslint-plugin-react-hooks (CJS/ESM dual-package).
    // Rule lookups resolve against the merged config, so only the rule
    // override is needed here.
    rules: {
      /**
       * The React Compiler lint flags any setState inside an effect. Our
       * remaining uses are the legitimate escape hatches the rule's own
       * docs carve out:
       *   - subscribing to an external store (Supabase Realtime, the demo
       *     store) and calling setState from the subscription callback;
       *   - resolving an async fetch into state on mount;
       *   - the standard `mounted` flag that gates createPortal until the
       *     client has hydrated.
       * Each is already guarded against post-unmount writes. Kept as a
       * warning so genuinely new cascading-render bugs still surface.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
