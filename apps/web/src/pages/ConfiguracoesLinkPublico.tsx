import { PublicLinkCard } from "../components/PublicLinkCard";

/**
 * Configurações → Link (aba própria). O link público de agendamento saiu da
 * Identidade para não forçar scroll (a "Prévia ao vivo" foi removida). Aqui fica
 * o endereço em destaque (copiar/abrir) e a edição do slug com confirmação.
 */
export function ConfiguracoesLinkPublico() {
  return <PublicLinkCard />;
}
