/**
 * NOMES DE PLANO (DL-072, Story 6.11) — vocabulário COMERCIAL, e só isso.
 *
 * Este arquivo guarda apenas a lista do que vendemos e o padrão. Ele NÃO decide
 * acesso, e nada aqui pode virar condicional: quem decide acesso é a CAPABILITY
 * (`company_capabilities`). A tradução plano → capabilities acontece UMA VEZ, na
 * contratação, em `modules/capabilities/capability-presets.ts`.
 *
 * Junto com aquele arquivo, é o único lugar do `src/` onde um literal de plano
 * pode aparecer — o guard-rail `plan-name-not-in-runtime.spec.ts` falha a suíte
 * em qualquer outro. Está em `common/` para que a entidade `Company` possa usar
 * `DEFAULT_PLAN` sem importar de `modules/`.
 */
export type PlanName = "basico" | "pro";

export const PLAN_NAMES: readonly PlanName[] = ["basico", "pro"] as const;

/** Plano de quem não escolheu nada — inclusive as empresas já existentes. */
export const DEFAULT_PLAN: PlanName = "basico";

/** True se `plan` é um nome que vendemos (validação de ENTRADA, não de acesso). */
export function isKnownPlan(plan: string): plan is PlanName {
  return (PLAN_NAMES as readonly string[]).includes(plan);
}
