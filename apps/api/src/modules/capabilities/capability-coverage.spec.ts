import { Controller, Get, Injectable, UseGuards } from "@nestjs/common";
import { AppModule } from "../../app.module";
import { collectControllers } from "../tenant/tenant-coverage";
import {
  GatedByCapability,
  RequireCapability,
} from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../auth/guards/capability.guard";
import { CapabilitiesService } from "./capabilities.service";
import { CAPABILITY_GATED_ENTRYPOINTS } from "./capability-gated-entrypoints";
import {
  belongsToGatedDomain,
  canCheckCapability,
  findUncheckedEntrypoints,
  findUngatedCapabilityRoutes,
} from "./capability-coverage";

// Grafo de DI sintético, espelhando o formato real do domínio do Épico 6:
// Controller -> Service marcado @GatedByCapability.
@GatedByCapability("whatsapp_bot")
@Injectable()
class FakeBotService {}

@Injectable()
class FakeFacade {
  constructor(private readonly bot: FakeBotService) {}
}

@Controller("fake-bot-ok")
@UseGuards(CapabilityGuard)
class GatedOkController {
  constructor(private readonly facade: FakeFacade) {}

  @Get()
  @RequireCapability("whatsapp_bot")
  list(): string {
    return this.facade ? "ok" : "no";
  }
}

@Controller("fake-bot-sem-decorator")
@UseGuards(CapabilityGuard)
class SemDecoratorController {
  constructor(private readonly facade: FakeFacade) {}

  @Get()
  list(): string {
    return this.facade ? "ok" : "no";
  }
}

@Controller("fake-bot-sem-guard")
class SemGuardController {
  constructor(private readonly facade: FakeFacade) {}

  @Get()
  @RequireCapability("whatsapp_bot")
  list(): string {
    return this.facade ? "ok" : "no";
  }
}

@Controller("plain")
class PlainController {
  @Get()
  ping(): string {
    return "pong";
  }
}

// Pontos de entrada SEM request (camada 3): o de baixo consegue checar, o outro não.
@Injectable()
class FakeProcessadorComChecagem {
  constructor(private readonly capabilities: CapabilitiesService) {}
}

@Injectable()
class FakeProcessadorSemChecagem {
  constructor(private readonly bot: FakeBotService) {}
}

describe("capability-coverage — guard-rail do DL-072 (Story 6.11)", () => {
  it("belongsToGatedDomain enxerga a marca transitivamente (controller→facade→service)", () => {
    expect(belongsToGatedDomain(GatedOkController)).toBe(true);
    expect(belongsToGatedDomain(PlainController)).toBe(false);
  });

  it("controller do domínio gateado, com decorator e guard, NÃO é sinalizado", () => {
    expect(findUngatedCapabilityRoutes([GatedOkController, PlainController])).toEqual(
      [],
    );
  });

  it("ALARME: rota do domínio gateado SEM @RequireCapability é sinalizada", () => {
    expect(findUngatedCapabilityRoutes([SemDecoratorController])).toEqual([
      {
        controller: "SemDecoratorController",
        handler: "list",
        reason: "sem @RequireCapability",
      },
    ]);
  });

  it("ALARME: decorator sem CapabilityGuard na pilha é sinalizado (o gate não roda)", () => {
    expect(findUngatedCapabilityRoutes([SemGuardController])).toEqual([
      {
        controller: "SemGuardController",
        handler: "list",
        reason: "sem CapabilityGuard",
      },
    ]);
  });

  it("canCheckCapability distingue quem alcança o CapabilitiesService", () => {
    expect(canCheckCapability(FakeProcessadorComChecagem)).toBe(true);
    expect(canCheckCapability(FakeProcessadorSemChecagem)).toBe(false);
  });

  it("ALARME: ponto de entrada da camada 3 sem como checar é sinalizado", () => {
    expect(findUncheckedEntrypoints([FakeProcessadorSemChecagem])).toEqual([
      "FakeProcessadorSemChecagem",
    ]);
    expect(findUncheckedEntrypoints([FakeProcessadorComChecagem])).toEqual([]);
  });
});

describe("Guard-rail: cobertura de capability no AppModule real (DL-072)", () => {
  it("CAMADA 2: toda rota do domínio gateado exige capability e tem o guard", () => {
    const gaps = findUngatedCapabilityRoutes(collectControllers(AppModule));
    // Se falhar: uma rota que toca domínio marcado @GatedByCapability está
    // aberta para empresa que não comprou. Adicione @RequireCapability no
    // handler/classe e o CapabilityGuard na pilha de @UseGuards.
    expect(gaps).toEqual([]);
  });

  it("CAMADA 3: todo ponto de entrada sem request consegue checar capability", () => {
    // Se falhar: o processador do webhook ou uma tarefa do agendador foi
    // registrada em CAPABILITY_GATED_ENTRYPOINTS sem injetar o
    // CapabilitiesService — ou seja, sem como checar o direito. O webhook é
    // chamado PELA META (sem login) e o agendador roda SOZINHO: aqui não há
    // guard nenhum protegendo, a checagem é manual e obrigatória.
    expect(findUncheckedEntrypoints(CAPABILITY_GATED_ENTRYPOINTS)).toEqual([]);
  });

  it("a lista da camada 3 está VAZIA enquanto webhook e agendador não existem", () => {
    // Documenta o estado, não o congela: o dia em que a 6.1/6.20 criar o
    // processador, esta expectativa cai junto com o `toEqual([])` acima virando
    // exigência real. Se alguém criar o ponto de entrada e NÃO registrar, este
    // teste continua verde — por isso a marca @GatedByCapability no serviço é o
    // que fecha o cerco pelo lado do HTTP.
    expect(CAPABILITY_GATED_ENTRYPOINTS).toEqual([]);
  });
});
