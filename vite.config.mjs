import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("./web/workspace/", import.meta.url));
const output = fileURLToPath(new URL("./public/workspace/", import.meta.url));

export default defineConfig({
  root,
  base: "/workspace/",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: output,
    emptyOutDir: true,
    assetsDir: "assets",
    assetsInlineLimit: 0,
    sourcemap: false
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/health": "http://127.0.0.1:3000"
    }
  }
});
