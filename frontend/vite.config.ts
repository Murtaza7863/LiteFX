import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shim = (name: string) => path.join(dir, "src/engine/shims", name);

/** `/LiteFX/` on GitHub Pages; `/` for local and Render. */
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "node:fs": shim("fs.ts"),
      "node:path": shim("path.ts"),
      "node:url": shim("url.ts"),
      "node:async_hooks": shim("async_hooks.ts"),
      "node:crypto": shim("crypto.ts"),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [path.join(dir, "..")] },
    proxy: {
      "/api": "http://localhost:3001",
      "/claim": "http://localhost:3001",
    },
  },
});
