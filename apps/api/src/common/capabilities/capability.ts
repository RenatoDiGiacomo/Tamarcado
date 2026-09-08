/**
 * CAPABILITY — o DIREITO da EMPRESA de usar um recurso (DL-072, Story 6.11).
 *
 * NÃO confundir com os dois eixos que já existem e continuam existindo:
 *
 * | eixo                    | granularidade | quem controla | onde mora                |
 * |-------------------------|---------------|---------------|--------------------------|
 * | PAPEL (`access_level`)  | por USUÁRIO   | o dono        | `users.access_level`     |
 * | MÓDULO (`can_view_*`)   | por USUÁRIO   | o dono        | `users.can_view_*`       |
 * | CAPABILITY (este)       | por EMPRESA   | NÓS           | `company_capabilities`   |
 *
 * As três valem JUNTAS e nenhuma substitui a outra: a empresa pode TER o
 * Financeiro (capability) e a pessoa NÃO poder vê-lo (módulo). Por isso o
 * `CapabilityGuard` é separado do `ModuleGuard` — juntá-los voltaria a misturar
 * comercial com permissão interna da equipe (DL-072, camada 2).
 *
 * Há ainda um quarto conceito, que NÃO é este: a PREFERÊNCIA do dono (ligar/
 * desligar o lembrete, por exemplo) vive dentro do direito que ele já tem, é
 * campo diferente, e é escopo da Story 6.17.
 *
 * Recurso novo é LINHA na tabela, não migration: a coluna é `varchar`, e esta
 * união literal existe só para dar type-safety ao código que já conhece a chave.
 */
export type CapabilityKey = "whatsapp_bot" | "lembrete_automatico";

/**
 * Capabilities do primeiro momento (DL-072). Separadas de propósito: são as duas
 * metades que se vendem sozinhas — quem só quer o lembrete não deve ser obrigado
 * a aceitar agendamento pelo bot.
 *
 * Financeiro, Dashboard e limite de equipe entram nesta mesma lista quando
 * virarem pagos; hoje são gateados por MÓDULO (DL-062), que é outro eixo.
 */
export const CAPABILITY_KEYS: readonly CapabilityKey[] = [
  "whatsapp_bot",
  "lembrete_automatico",
] as const;

/** Aceita uma string vinda do banco/entrada como chave conhecida. */
export function isCapabilityKey(value: unknown): value is CapabilityKey {
  return (
    typeof value === "string" &&
    (CAPABILITY_KEYS as readonly string[]).includes(value)
  );
}
