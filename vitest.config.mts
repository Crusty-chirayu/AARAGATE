import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // jsdom's `requestAnimationFrame` is a ~16ms timer. Running the jsdom files
    // in parallel starves those timers on a loaded machine, so the rAF-deferred
    // focus work (`flushFrame()` in the dialog suites) never lands: tests fail
    // with 5s timeouts, stale framer-motion `initial` styles, and a
    // timing-sensitive dialog debounce assertion. Measured: 247/256 parallel vs
    // 256/256 serial at the same wall-clock cost (25.3s vs 27.6s), so determinism
    // here is free. This is a harness setting — no test or assertion is relaxed.
    fileParallelism: false,
    // Deno-runtime tests are executed by `deno test`, not vitest.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/moderation-fail-closed.test.ts", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Deno-only `npm:` specifier in the shared extract module; vitest
      // imports that module for chunking tests, so remap it to a stub.
      "npm:pdfjs-dist@4.8.69": path.resolve(__dirname, "./tests/stubs/pdfjs.ts"),
    },
  },
});
