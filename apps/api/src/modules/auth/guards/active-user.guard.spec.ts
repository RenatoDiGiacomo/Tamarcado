import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { User } from "../../../database/entities/user.entity";
import type { UsersService } from "../../users/users.service";
import { ActiveUserGuard } from "./active-user.guard";

function context(userId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

function usersServiceReturning(value: Partial<User> | null): UsersService {
  return {
    findById: (): Promise<Partial<User> | null> => Promise.resolve(value),
  } as unknown as UsersService;
}

describe("ActiveUserGuard (AC6)", () => {
  it("usuário ativo → libera", async () => {
    const guard = new ActiveUserGuard(usersServiceReturning({ is_active: true }));
    await expect(guard.canActivate(context("1"))).resolves.toBe(true);
  });

  it("usuário inativo → 401", async () => {
    const guard = new ActiveUserGuard(
      usersServiceReturning({ is_active: false }),
    );
    await expect(guard.canActivate(context("1"))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("usuário inexistente (tenant) → 401", async () => {
    const guard = new ActiveUserGuard(usersServiceReturning(null));
    await expect(guard.canActivate(context("1"))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("sem req.user → 401", async () => {
    const guard = new ActiveUserGuard(usersServiceReturning(null));
    await expect(guard.canActivate(context(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
