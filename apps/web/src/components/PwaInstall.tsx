import { Download, Share } from "lucide-react";
import { useMediaQuery } from "../lib/useMediaQuery";
import { isIOS, isSafari, usePwaInstall } from "../lib/usePwaInstall";
import { Button } from "./ui/button";

/**
 * Instalar o app pela TELA DE LOGIN (Story 7.1 / DL-052). Nem todo dono sabe
 * instalar um PWA pelo menu do navegador — então oferecemos aqui.
 *
 * - Android/Chrome: um toque instala. Some se já instalado / em standalone.
 * - iOS/Safari: não há instalação programática — mostra a instrução visual
 *   (Compartilhar → Adicionar à Tela de Início). Só no iOS, só no Safari.
 * - Só no MOBILE, e de propósito: aqui o espaço é curto e o formulário de
 *   login não pode ser empurrado para fora da tela. **No computador a
 *   instalação vive em Configurações → Aplicativo**, onde há espaço para
 *   explicar — antes ela simplesmente não existia.
 *
 * O estado de instalação vem do hook `usePwaInstall`, compartilhado com aquela
 * tela: o evento do navegador chega uma vez só e precisa valer para as duas.
 */
export function PwaInstall() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { podeInstalar, instalado, instalar } = usePwaInstall();

  // Só mobile; nunca quando já está instalado/standalone.
  if (isDesktop || instalado) return null;

  // Android/Chrome: o evento chegou → botão de um toque.
  if (podeInstalar) {
    return (
      <Button type="button" variant="secondary" className="gap-2" onClick={instalar}>
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
