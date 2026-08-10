import "reflect-metadata";
import { Type } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";

/**
 * Guard-rail da revogação de sessão (1.2.04 / DL-053).
 *
 * A validação de `token_version` no access token mora no `ActiveUserGuard`. Ela
 * só protege uma rota se o guard REALMENTE roda nela — e a aplicação é manual,
 * controller a controller (`@UseGuards(JwtAuthGuard, ActiveUserGuard, ...)`), sem
 * guard global. Esquecer o `ActiveUserGuard` numa rota nova protegida por
 * `JwtAuthGuard` deixaria um token revogado valendo lá até expirar.
 *
 * Estas funções derivam, da metadata dos decorators, quais rotas exigem JWT mas
 * não passam pelo `ActiveUserGuard` — para o spec falhar a suíte se isso surgir.
 *
 * Invariante checado: para TODA rota, se os guards efetivos (classe ∪ método)
 * incluem `JwtAuthGuard`, precisam incluir `ActiveUserGuard`.
 *
 * Limite conhecido: compara guards por NOME de classe e só varre métodos
 * próprios do controller (o padrão da arquitetura; sem herança de controller).
 */

/** Nome de cada guard registrado (aceita classe ou instância). */
function guardNames(raw: unknown): string[] {
  const list = (raw as unknown[]) ?? [];
  return list
    .map((g) =>
      typeof g === "function"
        ? g.name
        : ((g as { constructor?: { name?: string } })?.constructor?.name ?? ""),
    )
    .filter((name) => name.length > 0);
}

/** Uma rota (controller + handler) que exige JWT sem passar pelo ActiveUserGuard. */
export interface RevocationGap {
  controller: string;
  handler: string;
}

/**
 * Dentre `controllers`, retorna as rotas protegidas por `JwtAuthGuard` que NÃO
 * têm o `ActiveUserGuard` no conjunto efetivo de guards (classe ∪ método). Lista
 * vazia = invariante ok; qualquer item = janela de token revogado → a suíte falha.
 */
export function findRevocationGaps(
  controllers: readonly Type[],
): RevocationGap[] {
  const gaps: RevocationGap[] = [];
  for (const controller of controllers) {
    const classGuards = guardNames(
      Reflect.getMetadata(GUARDS_METADATA, controller),
    );
    const proto = controller.prototype as object;
    for (const handlerName of Object.getOwnPropertyNames(proto)) {
      if (handlerName === "constructor") {
        continue;
      }
      const handler = (proto as Record<string, unknown>)[handlerName];
      if (typeof handler !== "function") {
        continue;
      }
      // Só rotas de fato (têm metadata de path do @Get/@Post/@Patch/...).
      if (!Reflect.hasMetadata(PATH_METADATA, handler)) {
        continue;
      }
      const effective = new Set([
        ...classGuards,
        ...guardNames(Reflect.getMetadata(GUARDS_METADATA, handler)),
      ]);
      if (effective.has("JwtAuthGuard") && !effective.has("ActiveUserGuard")) {
        gaps.push({ controller: controller.name, handler: handlerName });
      }
    }
  }
  return gaps;
}
