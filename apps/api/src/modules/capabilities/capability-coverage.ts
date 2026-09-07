import "reflect-metadata";
import { Type } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  GATED_BY_CAPABILITY_KEY,
  REQUIRE_CAPABILITY_KEY,
} from "../../common/decorators/require-capability.decorator";
import { CapabilitiesService } from "./capabilities.service";

/**
 * GUARD-RAIL das camadas 2 e 3 do bloqueio por capability (DL-072, Story 6.11) —
 * mesmo mecanismo que impede esquecer o `ActiveUserGuard` (DL-053) ou registrar
 * um controller fora do `tenant-aware-controllers` (DL-027).
 *
 * O problema que ele resolve: `@RequireCapability` é aplicado À MÃO, rota a
 * rota. Uma rota nova do domínio do WhatsApp sem o decorator é um recurso pago
 * aberto para quem não comprou — e nada avisa. Pior na camada 3: o webhook é
 * chamado PELA META, sem login, e o agendador roda SOZINHO; lá não existe guard
 * nenhum, e esquecer a checagem faz o bot responder cliente de empresa cortada e
 * o lembrete sair cobrado no cartão de quem já não paga.
 *
 * Como ele sabe o que DEVERIA estar gateado — sem lista manual:
 *
 * - CAMADA 2 (HTTP): o domínio gateado se auto-declara marcando os PROVIDERS com
 *   `@GatedByCapability(...)`. Todo controller que dependa (transitivamente) de
 *   um provider marcado precisa ter, em TODAS as suas rotas, `@RequireCapability`
 *   e o `CapabilityGuard` na pilha. É a mesma inferência por grafo de DI que o
 *   `tenant-coverage` faz com o `TenantAwareRepository`.
 *
 * - CAMADA 3 (sem request): pontos de entrada que não são rota — o processador
 *   do webhook (Story 6.20) e os tipos de tarefa do agendador (DL-056) — se
 *   registram em `CAPABILITY_GATED_ENTRYPOINTS`. O teste exige que cada um
 *   dependa do `CapabilitiesService`: sem ele injetado, não há como checar o
 *   direito, e a suíte falha.
 *
 * Limite conhecido (o mesmo do tenant-coverage): enxerga injeção POR TIPO de
 * classe, via `design:paramtypes`. Provider entregue por token customizado, ou
 * checagem feita fora do grafo de DI, continua sendo responsabilidade de review.
 */

/** Capability declarada diretamente no provider via `@GatedByCapability`. */
export function declaredCapability(metatype: unknown): string | undefined {
  if (typeof metatype !== "function") {
    return undefined;
  }
  return Reflect.getMetadata(GATED_BY_CAPABILITY_KEY, metatype) as
    | string
    | undefined;
}

/**
 * Caminha o grafo de dependências de construtor e diz se `metatype` pertence —
 * direta ou transitivamente — a um domínio marcado `@GatedByCapability`.
 */
export function belongsToGatedDomain(
  metatype: unknown,
  seen: Set<unknown> = new Set(),
): boolean {
  if (typeof metatype !== "function" || seen.has(metatype)) {
    return false;
  }
  seen.add(metatype);
  if (declaredCapability(metatype)) {
    return true;
  }
  const deps: unknown[] =
    (Reflect.getMetadata("design:paramtypes", metatype) as unknown[]) ?? [];
  return deps.some((dep) => belongsToGatedDomain(dep, seen));
}

/** Diz se `metatype` alcança o `CapabilitiesService` no grafo de DI. */
export function canCheckCapability(
  metatype: unknown,
  seen: Set<unknown> = new Set(),
): boolean {
  if (typeof metatype !== "function" || seen.has(metatype)) {
    return false;
  }
  seen.add(metatype);
  if (metatype === CapabilitiesService) {
    return true;
  }
  const deps: unknown[] =
    (Reflect.getMetadata("design:paramtypes", metatype) as unknown[]) ?? [];
  return deps.some((dep) => canCheckCapability(dep, seen));
}

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

/** Uma rota do domínio gateado que não passa pela camada 2. */
export interface CapabilityGap {
  controller: string;
  handler: string;
  reason: "sem @RequireCapability" | "sem CapabilityGuard";
}

/**
 * Dentre `controllers`, retorna as rotas que pertencem a um domínio gateado
 * (`@GatedByCapability` no grafo) mas não declaram `@RequireCapability` ou não
 * têm o `CapabilityGuard` na pilha efetiva (classe ∪ método).
 * Lista vazia = camada 2 íntegra; qualquer item = recurso pago sem trava.
 */
export function findUngatedCapabilityRoutes(
  controllers: readonly Type[],
): CapabilityGap[] {
  const gaps: CapabilityGap[] = [];
  for (const controller of controllers) {
    if (!belongsToGatedDomain(controller)) {
      continue;
    }
    const classGuards = guardNames(
      Reflect.getMetadata(GUARDS_METADATA, controller),
    );
    const classCapability = Reflect.getMetadata(
      REQUIRE_CAPABILITY_KEY,
      controller,
    ) as string | undefined;
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
      const capability =
        (Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler) as
          | string
          | undefined) ?? classCapability;
      if (!capability) {
        gaps.push({
          controller: controller.name,
          handler: handlerName,
          reason: "sem @RequireCapability",
        });
        continue;
      }
      const effective = new Set([
        ...classGuards,
        ...guardNames(Reflect.getMetadata(GUARDS_METADATA, handler)),
      ]);
      if (!effective.has("CapabilityGuard")) {
        gaps.push({
          controller: controller.name,
          handler: handlerName,
          reason: "sem CapabilityGuard",
        });
      }
    }
  }
  return gaps;
}

/**
 * Dentre os pontos de entrada SEM request registrados (camada 3), retorna os que
 * não alcançam o `CapabilitiesService` — ou seja, não têm como checar o direito.
 */
export function findUncheckedEntrypoints(
  entrypoints: readonly Type[],
): string[] {
  return entrypoints
    .filter((entrypoint) => !canCheckCapability(entrypoint))
    .map((entrypoint) => entrypoint.name);
}
