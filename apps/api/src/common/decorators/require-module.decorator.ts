import { SetMetadata } from "@nestjs/common";

/** Módulos com visibilidade controlada por pessoa (DL-062). */
export type ModuleName = "financeiro" | "dashboard" | "equipe";

export const REQUIRE_MODULE_KEY = "requireModule";

/**
 * Exige que o usuário tenha o módulo liberado (flag `can_view_*` na linha
 * fresca — DL-062). Lido pelo `ModuleGuard`. Sem `@RequireModule`, a rota não é
 * gateada por módulo. `owner` sempre passa. Ex.: `@RequireModule('financeiro')`.
 *
 * NÃO usar para o escopo de agenda (`can_manage_all_appointments`) — aquilo é
 * eixo de AÇÃO (amplia o alcance dentro da Agenda), não visibilidade de módulo;
 * ver `@Actor()` / DL-062 adição.
 */
export const RequireModule = (module: ModuleName): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_MODULE_KEY, module);
