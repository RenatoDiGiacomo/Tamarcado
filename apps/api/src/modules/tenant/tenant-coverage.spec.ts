import { Controller, Get, Injectable } from "@nestjs/common";
import { AppModule } from "../../app.module";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { UsersController } from "../users/users.controller";
import {
  PRE_TENANT_CONTROLLERS,
  TENANT_AWARE_CONTROLLERS,
} from "./tenant-aware-controllers";
import {
  collectControllers,
  dependsOnTenantAware,
  findUnprotectedTenantControllers,
  isTenantAwareRepository,
} from "./tenant-coverage";

// Grafo de DI sintético (decorado p/ emitir design:paramtypes), espelhando o
// padrão real: Controller -> Service -> Repository extends TenantAwareRepository.
class FakeTenantRepo extends TenantAwareRepository<Record<string, unknown>> {}

@Injectable()
class FakeService {
  constructor(private readonly repo: FakeTenantRepo) {}
}

@Controller("fake-tenant")
class FakeTenantController {
  constructor(private readonly svc: FakeService) {}

  @Get()
  list(): string {
    return this.svc ? "ok" : "no";
  }
}

@Controller("plain")
class PlainController {
  @Get()
  ping(): string {
    return "pong";
  }
}

describe("tenant-coverage — guard-rail de multi-tenancy (DL-027)", () => {
  it("isTenantAwareRepository reconhece a classe base e suas subclasses", () => {
    expect(isTenantAwareRepository(TenantAwareRepository)).toBe(true);
    expect(isTenantAwareRepository(FakeTenantRepo)).toBe(true);
    expect(isTenantAwareRepository(FakeService)).toBe(false);
    expect(isTenantAwareRepository(undefined)).toBe(false);
  });

  it("dependsOnTenantAware enxerga dependência transitiva (controller→service→repo)", () => {
    expect(dependsOnTenantAware(FakeTenantController)).toBe(true);
    expect(dependsOnTenantAware(PlainController)).toBe(false);
  });

  it("ALARME: controller tenant-aware fora da lista de cobertura é sinalizado", () => {
    const unprotected = findUnprotectedTenantControllers(
      [FakeTenantController, PlainController],
      [], // simula esquecer de registrar
    );
    expect(unprotected).toEqual([FakeTenantController]);
  });

  it("controller tenant-aware registrado na lista NÃO é sinalizado", () => {
    const unprotected = findUnprotectedTenantControllers(
      [FakeTenantController, PlainController],
      [FakeTenantController],
    );
    expect(unprotected).toEqual([]);
  });
});

describe("Guard-rail: cobertura do TenantMiddleware no AppModule real (DL-027)", () => {
  const controllers = collectControllers(AppModule);

  it("a enumeração de controllers do AppModule funciona (sanity)", () => {
    // Se isto falhar/zerar, a varredura de metadata quebrou e o guard-rail
    // estaria cego — então ancoramos num controller que sabemos existir.
    expect(controllers).toContain(UsersController);
    expect(controllers.length).toBeGreaterThanOrEqual(1);
  });

  it("GUARD-RAIL: todo controller que toca tabela tenant-aware está protegido OU declarado pré-tenant", () => {
    const accountedFor = [
      ...TENANT_AWARE_CONTROLLERS,
      ...PRE_TENANT_CONTROLLERS,
    ];
    const unprotected = findUnprotectedTenantControllers(
      controllers,
      accountedFor,
    );
    // Se falhar: o controller toca tabela tenant-aware e não foi classificado.
    // Caso comum → adicione-o a TENANT_AWARE_CONTROLLERS (protegido pelo
    // middleware). Exceção pré-tenant consciente → PRE_TENANT_CONTROLLERS, com
    // justificativa. Ambos em src/modules/tenant/tenant-aware-controllers.ts (DL-027).
    expect(unprotected.map((controller) => controller.name)).toEqual([]);
  });

  it("as listas não têm entradas obsoletas (toda existe no app e é tenant-aware)", () => {
    const known = new Set(controllers);
    for (const controller of [
      ...TENANT_AWARE_CONTROLLERS,
      ...PRE_TENANT_CONTROLLERS,
    ]) {
      expect(known.has(controller)).toBe(true);
      expect(dependsOnTenantAware(controller)).toBe(true);
    }
  });
});
