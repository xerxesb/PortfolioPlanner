import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __GIT_SHA__: JSON.stringify("test"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
