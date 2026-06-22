/**
 * vitest.config.ts
 * Cấu hình vitest cho unit tests của Copet.
 * Dùng happy-dom (nhẹ hơn jsdom) để có DOM APIs (Image, matchMedia, fetch mock).
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/__tests__/**/*.test.ts"],
    globals: false,
  },
});
