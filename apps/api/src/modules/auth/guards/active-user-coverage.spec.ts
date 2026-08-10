import { Controller, Get, UseGuards } from "@nestjs/common";
import { AppModule } from "../../../app.module";
import { collectControllers } from "../../tenant/tenant-coverage";
import { UsersController } from "../../users/users.controller";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { ActiveUserGuard } from "./active-user.guard";
import { findRevocationGaps } from "./active-user-coverage";

// Controllers sintéticos espelhando os arranjos possíveis de @UseGuards.
@Controller("both")
@UseGuards(JwtAuthGuard, ActiveUserGuard)
class BothGuardsController {
  @Get()
  list(): string {
    return "ok";
  }
}

@Controller("jwt-only")
@UseGuards(JwtAuthGuard)
class JwtOnlyController {
  @Get()
  list(): string {
    return "ok";
  }
}

// JwtAuthGuard na classe + ActiveUserGuard no método → conjunto efetivo cobre.
@Controller("method-active")
@UseGuards(JwtAuthGuard)
class MethodActiveController {
  @Get()
  @UseGuards(ActiveUserGuard)
  list(): string {
    return "ok";
  }
}

@Controller("public")
class PublicController {
  @Get()
  ping(): string {
    return "pong";
  }
}

describe("active-user-coverage — detector (1.2.04)", () => {
  it("sinaliza rota com JwtAuthGuard SEM ActiveUserGuard", () => {
    expect(findRevocationGaps([JwtOnlyController])).toEqual([
      { controller: "JwtOnlyController", handler: "list" },
    ]);
  });

  it("não sinaliza quando os dois guards estão na classe", () => {
    expect(findRevocationGaps([BothGuardsController])).toEqual([]);
  });

  it("não sinaliza quando o ActiveUserGuard vem no método (classe ∪ método)", () => {
    expect(findRevocationGaps([MethodActiveController])).toEqual([]);
  });

  it("ignora controller público (sem JwtAuthGuard)", () => {
    expect(findRevocationGaps([PublicController])).toEqual([]);
  });
});

describe("GUARD-RAIL: toda rota autenticada passa pelo ActiveUserGuard (1.2.04 / DL-053)", () => {
  const controllers = collectControllers(AppModule);

  it("a enumeração de controllers do AppModule funciona (sanity)", () => {
    // Se zerar, a varredura de metadata quebrou e o guard-rail ficaria cego.
    expect(controllers).toContain(UsersController);
    expect(controllers.length).toBeGreaterThanOrEqual(1);
  });

  it("nenhuma rota tem JwtAuthGuard sem ActiveUserGuard", () => {
    // Se falhar: a rota exige JWT mas NÃO passa pelo ActiveUserGuard, então um
    // token revogado (senha trocada, 1.2.04) continuaria valendo lá até expirar.
    // Correção: adicione ActiveUserGuard ao @UseGuards do controller/rota.
    const gaps = findRevocationGaps(controllers);
    expect(gaps).toEqual([]);
  });
});
