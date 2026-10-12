// Runs the dental demo seed with the app's own path aliases (see README.md).
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: [".pitch-build/dental/seed.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../../tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
