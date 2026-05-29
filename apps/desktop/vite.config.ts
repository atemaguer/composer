import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

import packageJson from "./package.json";

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  plugins: [react(), tailwindcss()],
  // Pre-bundle the diff renderer and its highlighter so Vite can resolve their
  // dynamic imports (shiki languages, @pierre/theme themes) in dev. Without
  // this, the dynamic imports fail at runtime ("works in build, fails in dev").
  optimizeDeps: {
    include: ["@pierre/diffs", "@pierre/diffs/react", "shiki", "@pierre/theme"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@composer/client": path.resolve(
        __dirname,
        "../../packages/composer-client/src/index.ts"
      )
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
