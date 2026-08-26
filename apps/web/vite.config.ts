/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

export default defineConfig({
  // Logos importados como componente React via `?react` (vite-plugin-svgr) —
  // herdam cor por CSS e não geram requisição extra.
  plugins: [
    react(),
    svgr(),
    // PWA instalável (Story 7.1). Estratégia de atualização e a ressalva de NÃO
    // trocar de versão no meio do uso estão explicadas em src/pwa.ts.
    VitePWA({
      registerType: "autoUpdate",
      // Registro o SW manualmente (src/pwa.ts) SEM reload em sessão — por isso
      // não deixo o plugin injetar o script de auto-reload padrão do autoUpdate.
      injectRegister: false,
      // Copiado para a raiz do dist e referenciado pelas metas do iOS no HTML.
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Tamarcado",
        short_name: "Tamarcado",
        description: "Painel de agendamentos do seu negócio.",
        lang: "pt-BR",
        // Design system: primary (243 100% 69% ≈ #6C63FF) como cor de tema;
        // background branco (--background 0 0% 100%) para a splash/tela inicial.
        theme_color: "#6C63FF",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        // start_url/scope RELATIVOS: valem sempre a origem que serve o app.
        // Desde o DL-069 essa origem é https://app.tamarcado.tec.br (a raiz
        // virou landing page), então o manifest, o escopo do service worker e
        // os ícones passaram a viver lá — sem hardcode de domínio aqui.
        // ATENÇÃO: origem nova = PWA novo para o navegador. Quem instalou pela
        // raiz antes da mudança precisa DESINSTALAR e instalar de novo pelo
        // endereço novo; não existe migração automática (RUNBOOK §12).
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Só assets HASHEADOS entram no precache (imutáveis → cache-first sem
        // risco de servir versão velha). O index.html NÃO é precacheado.
        globPatterns: ["**/*.{js,css,svg,png,ico,woff2}"],
        // HTML SEMPRE da rede: sem fallback de navegação precacheado, cada
        // carregamento novo busca o index.html atual → referencia os assets
        // novos. (Offline está fora de escopo — Story 7.1.)
        navigateFallback: null,
        // skipWaiting + clientsClaim: o SW novo assume o cache para o PRÓXIMO
        // carregamento. Como não há code-splitting (todo o JS carrega no start)
        // e eu não recarrego a página, a sessão ativa não é afetada.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
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
