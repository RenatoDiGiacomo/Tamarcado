import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AccessLevel } from "../../../database/entities/user.entity";
import type { AuthUser } from "../auth-user";
import { RolesGuard } from "./roles.guard";

function makeContext(accessLevel?: AccessLevel): ExecutionContext {
  const user: Partial<AuthUser> | undefined = accessLevel
    ? { accessLevel }
    : undefined;
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeReflector(required: AccessLevel[] | undefined): Reflector {
  return {
    getAllAndOverride: (): AccessLevel[] | undefined => required,
  } as unknown as Reflector;
}

describe("RolesGuard (FR-I2)", () => {
  it("sem @Roles → libera", () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext("manager"))).toBe(true);
  });

  it("@Roles vazio → libera", () => {
    const guard = new RolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext("manager"))).toBe(true);
  });

  it("nível compatível → libera", () => {
    const guard = new RolesGuard(makeReflector(["owner"]));
    expect(guard.canActivate(makeContext("owner"))).toBe(true);
  });

  it("nível insuficiente → 403", () => {
    const guard = new RolesGuard(makeReflector(["owner"]));
    expect(() => guard.canActivate(makeContext("manager"))).toThrow(
      ForbiddenException,
    );
  });

  it("sem usuário no request → 403", () => {
    const guard = new RolesGuard(makeReflector(["owner"]));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
