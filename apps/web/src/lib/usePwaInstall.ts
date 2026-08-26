import { useEffect, useState } from "react";

/** Evento de instalação do Chrome/Edge (fora do lib.dom padrão do TS). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** App já rodando instalado (janela própria) — nada a oferecer. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari expõe `navigator.standalone` (fora do tipo padrão).
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad (inclui iPadOS, que se apresenta como Mac com toque). */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/** Safari de verdade — exclui Chrome (CriOS), Firefox (FxiOS) e Edge no iOS. */
export function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|android|chrome|chromium/i.test(ua);
}

/**
 * Navegador da família Chromium (Chrome, Edge, Brave, Opera). São os que
 * implementam `beforeinstallprompt` — ou seja, os que instalam com um clique.
 */
export function isChromium(): boolean {
  const ua = navigator.userAgent;
  return /chrome|chromium|crios|edg\//i.test(ua) && !/fxios/i.test(ua);
}

export interface PwaInstall {
  /** Há um evento de instalação guardado: dá para instalar com um clique. */
  podeInstalar: boolean;
  /** Já está rodando em janela própria (ou foi instalado nesta sessão). */
  instalado: boolean;
  /** Dispara o diálogo do navegador. Sem evento guardado, não faz nada. */
  instalar: () => void;
}

/**
 * Estado de instalação do PWA, compartilhado pela tela de login (mobile) e por
 * Configurações (computador).
 *
 * O `beforeinstallprompt` é disparado **uma vez** pelo navegador, quando ele
 * decide que o site é instalável — e o evento precisa ser guardado, porque só
 * pode ser usado depois, no clique da pessoa. Por isso o listener vive num hook
 * e não dentro de um componente que pode nem estar montado na hora: quem montar
 * depois ainda encontra o evento guardado.
 *
 * O evento **não chega** em Firefox e Safari (não implementam), e também não
 * chega quando o app já está instalado.
 */
export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => guardado,
  );
  const [instalado, setInstalado] = useState<boolean>(() => isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Impede o mini-infobar padrão do Chrome; controlamos o momento pelo botão.
      e.preventDefault();
      guardado = e as BeforeInstallPromptEvent;
      setDeferred(guardado);
    };
    const onInstalled = () => {
      guardado = null;
      setInstalado(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    podeInstalar: deferred !== null && !instalado,
    instalado,
    instalar: () => {
      if (!deferred) return;
      void deferred.prompt();
      // O evento só serve uma vez; o resultado chega por `appinstalled`.
      guardado = null;
      setDeferred(null);
    },
  };
}

/**
 * O evento fica FORA do React de propósito. Ele costuma chegar durante o
 * carregamento, antes de a tela de Configurações existir; sem este guardado, a
 * pessoa abriria a tela e não veria botão nenhum, porque o evento já teria
 * passado.
 */
let guardado: BeforeInstallPromptEvent | null = null;

/**
 * Só para TESTE: o guardado acima sobrevive entre casos do mesmo arquivo, e um
 * teste que emite o evento contaminaria o seguinte, que espera não ter nenhum.
 */
export function __limparEventoGuardado(): void {
  guardado = null;
}
