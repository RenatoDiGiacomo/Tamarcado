import "reflect-metadata";
import { DynamicModule, Type } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";

/**
 * Lógica do guard-rail de multi-tenancy (DL-027).
 *
 * Como o `TenantMiddleware` é aplicado por controller (`forRoutes`), esquecer de
 * registrar um controller novo que toca tabela tenant-aware vazaria dados entre
 * salões. Estas funções derivam — do grafo de DI — quais controllers são
 * tenant-aware, para confrontar com a lista efetivamente protegida.
 *
 * Limite conhecido: detecta apenas injeção POR TIPO de classe (o padrão da
 * arquitetura — `UsersService` -> `UsersRepository extends TenantAwareRepository`).
 * Um `TenantAwareRepository` injetado por token customizado, ou um acesso a
 * tabela com `company_id` por `Repository<T>` cru (fora do wrapper), não é
 * coberto por este check — isso continua sendo responsabilidade de code review.
 */

/** True se `target` (ou sua cadeia de protótipos) for um TenantAwareRepository. */
export function isTenantAwareRepository(target: unknown): boolean {
  let ctor = target as ((new (...args: never[]) => unknown) | null) | undefined;
  while (typeof ctor === "function" && ctor !== Function.prototype) {
    if (ctor === TenantAwareRepository) {
      return true;
    }
    ctor = Object.getPrototypeOf(ctor) as typeof ctor;
  }
  return false;
}

/**
 * Caminha o grafo de dependências de construtor (via `design:paramtypes`,
 * emitido pelo `emitDecoratorMetadata`) e diz se `metatype` depende — direta ou
 * transitivamente — de um TenantAwareRepository.
 */
export function dependsOnTenantAware(
  metatype: unknown,
  seen: Set<unknown> = new Set(),
): boolean {
  if (typeof metatype !== "function" || seen.has(metatype)) {
    return false;
  }
  seen.add(metatype);
  if (isTenantAwareRepository(metatype)) {
    return true;
  }
  const deps: unknown[] =
    (Reflect.getMetadata("design:paramtypes", metatype) as unknown[]) ?? [];
  return deps.some((dep) => dependsOnTenantAware(dep, seen));
}

/**
 * Dentre `controllers`, retorna os que tocam tabelas tenant-aware mas NÃO estão
 * na lista `covered` (a que o TenantMiddleware protege). Lista vazia = tudo ok;
 * qualquer item = vazamento de tenant em potencial → a suíte deve falhar.
 */
export function findUnprotectedTenantControllers(
  controllers: readonly Type[],
  covered: readonly Type[],
): Type[] {
  const coveredSet = new Set<Type>(covered);
  return controllers.filter(
    (controller) =>
      dependsOnTenantAware(controller) && !coveredSet.has(controller),
  );
}

/**
 * Enumera TODOS os controllers alcançáveis a partir de `rootModule`, lendo a
 * metadata estática dos decorators `@Module` (sem instanciar nada nem conectar
 * no banco). Atravessa imports estáticos e DynamicModules
 * (`forRoot()`/`forFeature()`/`register()`).
 *
 * É a contraparte do `dependsOnTenantAware`: dá o universo de controllers do app
 * para o guard-rail confrontar com a lista coberta pelo TenantMiddleware.
 * Limite conhecido: não resolve `forwardRef()` nem imports assíncronos (Promise)
 * — o AppModule não usa nenhum dos dois.
 */
export function collectControllers(rootModule: Type | DynamicModule): Type[] {
  const found = new Set<Type>();
  const visited = new Set<unknown>();
  const queue: unknown[] = [rootModule];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || visited.has(current)) {
      continue;
    }
    visited.add(current);

    let moduleClass: unknown;
    let controllers: unknown[] = [];
    let imports: unknown[] = [];

    if (typeof current === "function") {
      moduleClass = current;
    } else if (typeof current === "object" && "module" in current) {
      const dynamic = current as DynamicModule;
      moduleClass = dynamic.module;
      controllers = dynamic.controllers ?? [];
      imports = dynamic.imports ?? [];
    } else {
      continue; // forwardRef / Promise não suportados (ver doc acima)
    }

    if (typeof moduleClass === "function") {
      controllers = [
        ...controllers,
        ...((Reflect.getMetadata(
          MODULE_METADATA.CONTROLLERS,
          moduleClass,
        ) as unknown[]) ?? []),
      ];
      imports = [
        ...imports,
        ...((Reflect.getMetadata(
          MODULE_METADATA.IMPORTS,
          moduleClass,
        ) as unknown[]) ?? []),
      ];
    }

    for (const controller of controllers) {
      if (typeof controller === "function") {
        found.add(controller as Type);
      }
    }
    for (const imported of imports) {
      queue.push(imported);
    }
  }

  return [...found];
}
