/**
 * Registro do Service Worker (Story 7.1). A regra crítica: a versão nova NÃO
 * pode trocar no meio do uso (a pessoa perderia o que está digitando num novo
 * agendamento). Como isso é garantido AQUI:
 *
 * - Registro "cru" (navigator.serviceWorker.register), SEM ouvir
 *   `controllerchange`/`controlling` e SEM chamar location.reload(). O plugin
 *   (autoUpdate) injetaria um reload automático ao detectar versão nova — por
 *   isso desliguei a injeção (injectRegister:false) e faço o registro à mão.
 * - O SW usa skipWaiting + clientsClaim: um SW novo assume o controle para o
 *   PRÓXIMO carregamento. Ele NÃO recarrega a aba atual — sem reload, a página
 *   em uso continua com o JS que já está na memória.
 * - Não há code-splitting no app (todo o JS carrega no start), então a sessão
 *   ativa nunca busca um "chunk" novo do SW recém-ativado. Nada quebra no meio.
 * - O index.html vem SEMPRE da rede (workbox.navigateFallback:null). Assim, a
 *   versão nova entra num CARREGAMENTO NOVO do app (reabrir pelo ícone / cold
 *   start): o HTML fresco referencia os assets novos. Nunca durante a sessão.
 */
export function registerPwa(): void {
  if (!import.meta.env.PROD) return; // SW só na build de produção
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    // Sem handlers de reload: o take-over do SW novo fica para o próximo load.
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* best-effort: sem SW o app funciona normalmente, só não instala */
    });
  });
}
