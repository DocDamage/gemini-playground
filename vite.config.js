/**
 * vite.config.js
 *
 * Vite configuration for Gemini-CLI / AI Dev Suite.
 * Supports Electron, TypeScript, Tailwind, and multi-window builds.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: ".", // project root
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        dashboard: path.resolve(__dirname, "index.html"),
        aipanel: path.resolve(__dirname, "aipanel.html"),
      },
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "renderer"),
      "@core": path.resolve(__dirname, "core"),
      "@plugins": path.resolve(__dirname, "plugins"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: false,
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
