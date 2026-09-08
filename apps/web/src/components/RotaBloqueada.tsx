import type { ReactNode } from "react";
import { useAuth, type CapabilityKey } from "../auth/AuthContext";
import { canViewModule, hasCapability, type ModuleName } from "../lib/permissions";
import { BloqueioPermissao, BloqueioPro } from "./PlanoPro";
import { PageLayout } from "./PageLayout";

/**
 * O CAMINHO CRU (Story 6.15) — chegar na rota bloqueada DIRETO pela URL.
 *
 * Sempre existem DOIS caminhos até um bloqueio:
 * - o **desenhado**: o usuário vê a coroa na tela e clica;
 * - o **cru**: ele chega na rota sem passar por tela nenhuma — link antigo,
 *   favorito, endereço digitado, alguém mandou o link. Aqui **não existe coroa**
 *   para clicar.
 *
 * O segundo não é exceção rara: é o que acontece quando o produto tem usuários de
 * verdade. Se ele não for tratado, a coroa não resolve nada — e é neste caminho
 * que se decide se o produto **explica** ou **parece quebrado**.
 *
 * Até esta story o caminho cru respondia com `<Navigate to="/" />`: quem colava
 * `/financeiro` sem permissão era **jogado na Agenda em silêncio**, sem uma
 * palavra. Mesma família de defeito do 403 que virava "erro de servidor", só com
 * outra roupa.
 *
 * O menu continua **escondendo** o módulo de quem não o tem (DL-062 intacto):
 * esconder onde a pessoa navega é diferente de emudecer onde ela já chegou.
 */

/** Nome do módulo como aparece no menu — título da tela bloqueada. */
const ROTULO_MODULO: Record<ModuleName, string> = {
  financeiro: "Financeiro",
  dashboard: "Dashboard",
  equipe: "Equipe",
};

/** Moldura padrão da tela bloqueada, para o cabeçalho não sumir junto. */
function TelaBloqueada({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <PageLayout title={titulo}>{children}</PageLayout>;
}

/**
 * Rota de MÓDULO (DL-062) — visibilidade da PESSOA dentro da empresa.
 *
 * Sem acesso, explica **quem libera**. E **nunca** oferece plano: quem barrou foi
 * o dono do estabelecimento, e a profissional não tem como comprar o que ele já
 * pagou — oferecer upgrade aqui faria ela cobrar o dono por uma compra que não
 * existe.
 *
 * Na revogação, o polling de flags atualiza o `user` e a rota passa a bloquear
 * sozinha, sem relogar.
 */
export function RequireModule({
  module,
  children,
}: {
  module: ModuleName;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (canViewModule(user, module)) return <>{children}</>;
  return (
    <TelaBloqueada titulo={ROTULO_MODULO[module]}>
      <BloqueioPermissao />
    </TelaBloqueada>
  );
}

/**
 * Rota de CAPABILITY (DL-072) — o que a EMPRESA contratou.
 *
 * Sem o direito, mostra a tela de venda (coroa + caminho até o WhatsApp
 * comercial) em vez de deixar a página buscar dados e cair num 403 cru.
 *
 * Esta checagem é **UX** — lê do AuthContext, que faz o polling de ~20s. A
 * segurança continua sendo o **403 do backend**, que também chega tratado pelo
 * `ErrorState`: cobre a janela entre o corte da capability e o próximo poll, em
 * que o front ainda acha que tem o direito.
 *
 * Ainda sem consumidor em produção — a primeira tela gateada por capability é a
 * **Story 6.17** (WhatsApp). Nasce aqui, junto do resto do bloqueio, porque é o
 * mesmo mecanismo: separar isto da coroa seria garantir que os dois caminhos
 * divergissem.
 */
export function RequireCapability({
  capability,
  titulo,
  children,
}: {
  capability: CapabilityKey;
  /** Título da tela, para o cabeçalho continuar fazendo sentido bloqueado. */
  titulo: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (hasCapability(user, capability)) return <>{children}</>;
  return (
    <TelaBloqueada titulo={titulo}>
      <BloqueioPro capability={capability} />
    </TelaBloqueada>
  );
}
