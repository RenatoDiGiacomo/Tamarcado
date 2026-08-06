import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { App } from "./App";
import { Toaster } from "./components/ui/sonner";
import { registerPwa } from "./pwa";
import "./globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento #root não encontrado no index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// PWA: registra o Service Worker (prod). Ver src/pwa.ts para a garantia de que
// a versão nova não troca no meio da sessão.
registerPwa();
