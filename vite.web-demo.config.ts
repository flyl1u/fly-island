import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The website's live demo (web-demo/): the island with a mocked native side, as static files with
// relative paths so the website can serve them from any folder. `pnpm build:web-demo` writes them to
// dist-web-demo/; the website's scripts/sync-island-demo.mjs copies them over.
export default defineConfig({
  root: "web-demo",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-web-demo",
    emptyOutDir: true,
    // The island is one bundle on purpose: the demo shows all of it at once.
    chunkSizeWarningLimit: 900,
  },
});
