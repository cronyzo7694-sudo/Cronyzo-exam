import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    // The live-preview host is generated per sandbox (e.g.
    // 5173-<sandboxId>.e2b.app), so it cannot be enumerated ahead of time.
    // Allow the preview subdomains rather than disabling the host check
    // entirely — arbitrary Host headers still get rejected.
    allowedHosts: [".e2b.app", ".e2b.dev", ".localhost"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", ".e2b.dev", ".localhost"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
});
