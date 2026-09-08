import type { CapabilityKey } from "../auth/AuthContext";

/**
 * Conteúdo comercial do bloqueio por plano (Story 6.15, DL-075).
 *
 * FONTE ÚNICA: número, texto do WhatsApp e o que cada recurso desbloqueia moram
 * aqui, não espalhados pelas telas. Recurso novo é ENTRADA NESTE MAPA — não um
 * componente novo, nem um `if` numa tela. É o que faz Financeiro, Dashboard e
 * limite de equipe herdarem o comportamento quando virarem pagos.
 */

/**
 * WhatsApp COMERCIAL da Tamarcado — o mesmo da landing page.
 *
 * ⚠️ NÃO trocar pelo (11) 94245-8672: aquele é a **WABA de desenvolvimento**, e
 * a partir do Épico 6 estará **ocupado com a API do bot**. Mandar cliente
 * interessado em comprar para lá é mandar cliente para o robô (DL-075, item 1).
 */
export const WHATSAPP_COMERCIAL = "5511998325320";

/**
 * O que cada recurso desbloqueia, em linguagem de DONA DE SALÃO — o que ele faz
 * por ela, não o nome técnico. A chave é a capability (DL-072): a tela nunca
 * decide o texto, ela só passa a chave que o backend já usa.
 */
interface ConteudoDoRecurso {
  /** Nome do recurso como a dona o chamaria. */
  titulo: string;
  /** Uma frase: o que muda no dia dela. */
  resumo: string;
  /** Ganhos concretos. Sem jargão, sem nome de API. */
  beneficios: string[];
}

const CONTEUDO: Record<CapabilityKey, ConteudoDoRecurso> = {
  whatsapp_bot: {
    titulo: "Agendamento pelo WhatsApp",
    resumo:
      "Suas clientes marcam horário pelo WhatsApp sozinhas, a qualquer hora — inclusive quando você está atendendo.",
    beneficios: [
      "A cliente escolhe o serviço e o horário conversando no WhatsApp, sem app e sem cadastro.",
      "Funciona de madrugada e no domingo: você não perde a cliente que resolveu marcar fora do horário.",
      "Você continua no controle — confirma ou recusa cada pedido pelo painel.",
      "O número é seu: se um dia sair da Tamarcado, leva o WhatsApp com você.",
    ],
  },
  lembrete_automatico: {
    titulo: "Lembrete automático",
    resumo:
      "A cliente recebe um lembrete do horário no WhatsApp, sem você precisar mandar mensagem uma por uma.",
    beneficios: [
      "Menos buraco na agenda: quem esquece do horário é avisado antes.",
      "Você escolhe com quanta antecedência o lembrete sai.",
      "Sai sozinho, todo dia, sem ninguém lembrar de mandar.",
    ],
  },
};

/**
 * Conteúdo do recurso. Chave desconhecida — ou ausente, quando o 403 não a
 * informou — cai num texto genérico do Pró, sem quebrar e sem descrever um
 * recurso errado.
 */
export function conteudoDoRecurso(
  capability?: CapabilityKey | string,
): ConteudoDoRecurso {
  return (
    CONTEUDO[capability as CapabilityKey] ?? {
      titulo: "Recurso do plano Pró",
      resumo: "Este recurso faz parte do plano Pró.",
      beneficios: [],
    }
  );
}

/**
 * Link do WhatsApp comercial com o texto já escrito e o ESTABELECIMENTO
 * identificado (DL-075, item 2).
 *
 * Sem o nome, o Renato recebe "quero dar update" de um número desconhecido e não
 * sabe de quem é — a conversa começa perdendo tempo. O nome sai da empresa
 * logada e vai **codificado na URL**.
 */
export function linkWhatsAppUpgrade(nomeDoEstabelecimento: string | null): string {
  const nome = (nomeDoEstabelecimento ?? "").trim();
  const mensagem = nome
    ? `Olá! Sou do ${nome} e quero fazer o update para o plano Pró.`
    : "Olá! Quero fazer o update para o plano Pró.";
  return `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(mensagem)}`;
}
