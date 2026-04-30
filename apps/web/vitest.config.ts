import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["tests/components/**/*.test.tsx", "jsdom"],
      ["tests/clerk-fallback.test.tsx", "jsdom"]
    ],
    setupFiles: ["tests/setup-dom.ts"]
  }
});
