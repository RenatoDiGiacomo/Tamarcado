import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { useMediaQuery } from "../lib/useMediaQuery";
import { Button } from "./ui/button";

/** Evento de instalação do Chrome/Android (fora do lib.dom padrão do TS). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** App já rodando instalado (standalone) — nada a oferecer. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari expõe `navigator.standalone` (fora do tipo padrão).
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad (inclui iPadOS, que se apresenta como Mac com toque). */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/** Safari de verdade — exclui Chrome (CriOS), Firefox (FxiOS) e Edge no iOS. */
function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|android/i.test(ua);
}

/**
 * Instalar o app pela TELA DE LOGIN (Story 7.1 / DL-052). Nem todo dono sabe
 * instalar um PWA pelo menu do navegador — então oferecemos aqui.
 *
 * - Android/Chrome: captura `beforeinstallprompt` e mostra "Instalar app"
 *   (um toque instala). Some se já instalado / em standalone.
 * - iOS/Safari: não há instalação programática — mostra a instrução visual
 *   (Compartilhar → Adicionar à Tela de Início). Só no iOS, só no Safari.
 * - Só no MOBILE. Discreto: fica ABAIXO do card de login, sem competir com o
 *   formulário nem empurrar o botão Entrar para fora da tela.
 */
export function PwaInstall() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Impede o mini-infobar padrão do Chrome; controlamos o momento pelo botão.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Só mobile; nunca quando já está instalado/standalone.
  if (isDesktop || installed) return null;

  // Android/Chrome: o evento chegou → botão de um toque.
  if (deferred) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="gap-2"
        onClick={() => {
          void deferred.prompt();
          // O evento só serve uma vez; o resultado vem por `appinstalled`.
          setDeferred(null);
        }}
      >
        <Download className="size-4" aria-hidden="true" />
        Instalar app
      </Button>
    );
  }

  // iOS/Safari: sem evento programático → instrução curta com o ícone certo.
  if (isIOS() && isSafari()) {
    return (
      <p className="flex max-w-xs items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <span>Para instalar: toque em</span>
        <Share className="inline size-4 shrink-0" aria-label="Compartilhar" />
        <span>e depois em “Adicionar à Tela de Início”.</span>
      </p>
    );
  }

  // Android antes do evento (critérios ainda não satisfeitos) ou browser sem
  // suporte: não mostra nada — evita um botão que não faz nada.
  return null;
}
