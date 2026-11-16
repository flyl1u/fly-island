import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const enabledRegressionFeatures = process.env.FOCUSD_REGRESSION_FEATURES === "enabled";

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [react(), {
    name: "enabled-release-feature-fixtures",
    enforce: "pre",
    load(id) {
      // Test fixtures can exercise retained features; production builds always use the file.
      if (command === "serve" && enabledRegressionFeatures && id.split("?")[0].endsWith("/release-features.json")) {
        return JSON.stringify({ plugins: true, mailOtp: true });
      }
    },
  }],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available.
  //    The regression runner passes its own `--port`, so it never takes 1420.
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
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
