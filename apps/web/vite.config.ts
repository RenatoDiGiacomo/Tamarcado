/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import pkg from "./package.json";

export default defineConfig({
  // Logos importados como componente React via `?react` (vite-plugin-svgr) —
  // herdam cor por CSS e não geram requisição extra.
  plugins: [react(), svgr()],
  // Versão exibida na UI vem do package.json na BUILD (não hardcoded no
  // componente) — assim não desatualiza. Formatada em src/lib/version.ts.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
