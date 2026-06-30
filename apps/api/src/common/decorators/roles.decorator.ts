import { SetMetadata } from "@nestjs/common";
import type { AccessLevel } from "../../database/entities/user.entity";

export const ROLES_KEY = "roles";

/**
 * Restringe um handler/controller a `access_level`s específicos (matriz FR-I2).
 * Lido pelo `RolesGuard`. Sem `@Roles`, a rota é regida só pelo `JwtAuthGuard`.
 * Ex.: `@Roles('owner')` na gestão de equipe.
 */
export const Roles = (...levels: AccessLevel[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, levels);
