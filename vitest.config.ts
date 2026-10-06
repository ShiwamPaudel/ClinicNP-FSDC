import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Components are rendered in a few tests (the printed bill). Next compiles
  // JSX with the automatic runtime, so components never import React; the
  // tests have to compile them the same way.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
    // integration tests each point db() at their own file DB via process.env;
    // run files sequentially so they don't race on the shared env / singleton.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
