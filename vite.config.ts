import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  // Prevent Vite from obscuring rust errors.
  clearScreen: false,

  // Tauri expects a fixed port, fail if not available.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tell Vite to ignore watching `src-tauri`.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Solid plugin: transforms .tsx/.jsx files through solid-js compiler.
  // Vanilla TS files (.ts) are unaffected — pet render core stays as-is.
  plugins: [solid()],

  // Multi-page entry: pet overlay (main) + shop window (shop).
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        shop: "shop.html",
      },
    },
  },

  // Assets: ensure pet sprites and shop cosmetics are served from public/.
  publicDir: "public",
  assetsInclude: ["**/*.png", "**/*.webp"],
}));
