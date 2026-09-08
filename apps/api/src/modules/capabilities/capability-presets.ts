import {
  CAPABILITY_KEYS,
  type CapabilityKey,
} from "../../common/capabilities/capability";
import type { PlanName } from "../../common/capabilities/plan";

export {
  DEFAULT_PLAN,
  isKnownPlan,
  PLAN_NAMES,
  type PlanName,
} from "../../common/capabilities/plan";

/**
 * O PLANO é apenas um PRESET (DL-072, Story 6.11).
 *
 * ESTE ARQUIVO É O ÚNICO LUGAR DO CÓDIGO ONDE NOME DE PLANO PODE APARECER.
 * Ele traduz "o que foi vendido" para "quais linhas entram em
 * `company_capabilities`" no ato da contratação — e a tradução acontece UMA VEZ.
 * A partir daí quem manda é a capability: nenhum ponto do código pergunta o nome
 * do plano para decidir acesso.
 *
 * O guard-rail `plan-name-not-in-runtime.spec.ts` varre `src/` e FALHA a suíte se
 * um nome de plano for comparado fora daqui.
 *
 * Consequência prática do desenho (o que o campo `plan` sozinho não permitia):
 * - VENDA AVULSA: conceder só `lembrete_automatico`, sem tocar no plano.
 * - CORTESIA: conceder um recurso sem mentir o plano do cliente.
 * - MUDAR O CONTEÚDO DE UM PLANO: editar este mapa, sem caçar condicional.
 *   (Editar o mapa muda o que NOVAS contratações recebem; quem já tem, mantém —
 *   direito concedido não é revogado por mudança de tabela de preços.)
 */
const PRESETS: Record<PlanName, readonly CapabilityKey[]> = {
  // O produto manual de hoje. NENHUMA capability: nada do que o Básico entrega
  // (agenda, clientes, serviços, equipe, financeiro) é gateado por capability —
  // são gateados por MÓDULO, que é o outro eixo (DL-062) e continua existindo.
  basico: [],
  // Tudo do Básico + as duas metades do WhatsApp (DL-072).
  pro: ["whatsapp_bot", "lembrete_automatico"],
};

/** Capabilities que a contratação de `plan` concede. Plano desconhecido → vazio. */
export function capabilitiesForPlan(plan: string): readonly CapabilityKey[] {
  return PRESETS[plan as PlanName] ?? [];
}

/**
 * PRESET DE PRESERVAÇÃO DO ACESSO ATUAL — o que as empresas JÁ EXISTENTES
 * recebem quando a migration desta story roda (DL-072 + DL-064).
 *
 * É VAZIO, e isso é o correto, não um esquecimento: na virada, NENHUM recurso em
 * produção é gateado por capability. `whatsapp_bot` e `lembrete_automatico` não
 * existem ainda (Épico 6 não foi construído), então nenhuma empresa "usa hoje"
 * algo que passaria a exigir capability. Conceder o Pró a todo mundo aqui seria
 * DAR acesso que ninguém tinha — o oposto do que o AC pede.
 *
 * O invariante que a migration precisa provar contra base populada é
 * "ninguém PERDE acesso", e ele é satisfeito porque nada existente muda de gate.
 * Provado em `test/migration-company-capabilities.e2e-spec.ts`.
 */
export const PRESERVE_CURRENT_ACCESS: readonly CapabilityKey[] = [];

/** Sanidade: todo preset só cita chaves conhecidas. */
export function presetsAreWellFormed(): boolean {
  return Object.values(PRESETS).every((keys) =>
    keys.every((key) => CAPABILITY_KEYS.includes(key)),
  );
}
