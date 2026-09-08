import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  NestModule,
  UseGuards,
} from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../../src/database/entities/company.entity";
import { TenantModule } from "../../src/modules/tenant/tenant.module";
import { TenantMiddleware } from "../../src/modules/tenant/tenant.middleware";
import { UsersModule } from "../../src/modules/users/users.module";
import { CapabilitiesModule } from "../../src/modules/capabilities/capabilities.module";
import { JwtAuthGuard } from "../../src/modules/auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../../src/modules/auth/guards/active-user.guard";
import { CapabilityGuard } from "../../src/modules/auth/guards/capability.guard";
import { ModuleGuard } from "../../src/modules/auth/guards/module.guard";
import { RolesGuard } from "../../src/modules/auth/guards/roles.guard";
import { RequireCapability } from "../../src/common/decorators/require-capability.decorator";
import { RequireModule } from "../../src/common/decorators/require-module.decorator";
import { Roles } from "../../src/common/decorators/roles.decorator";

/**
 * FIXTURE DE TESTE — não faz parte da aplicação (vive em `test/`, fora do
 * `src/`, e é montado só pelo `capability-gate.e2e-spec.ts`).
 *
 * Existe porque a Story 6.11 entrega a FUNDAÇÃO: nenhum recurso real é gateado
 * por capability ainda (o bot é a 6.1, a tela é a 6.17). Sem um ponto gateado de
 * verdade não há como provar ponta a ponta o 403 da camada 2 nem a independência
 * entre os eixos — e "gate testado só em unit" é exatamente como se descobre em
 * produção que o guard não estava na pilha.
 *
 * As rotas espelham a pilha REAL de um controller de domínio
 * (`JwtAuthGuard → ActiveUserGuard → CapabilityGuard → ModuleGuard → RolesGuard`),
 * na ordem em que o projeto as aplica.
 */
@UseGuards(
  JwtAuthGuard,
  ActiveUserGuard,
  CapabilityGuard,
  ModuleGuard,
  RolesGuard,
)
@Controller("__probe")
export class CapabilityProbeController {
  /** Só capability: prova o eixo COMERCIAL isolado (a empresa comprou?). */
  @Get("bot")
  @RequireCapability("whatsapp_bot")
  bot(): { ok: true } {
    return { ok: true };
  }

  /** Só módulo: prova o eixo de VISIBILIDADE isolado (esta pessoa vê?). */
  @Get("financeiro")
  @RequireModule("financeiro")
  financeiro(): { ok: true } {
    return { ok: true };
  }

  /** Os DOIS juntos: é onde a independência das camadas fica visível. */
  @Get("bot-financeiro")
  @RequireCapability("whatsapp_bot")
  @RequireModule("financeiro")
  botFinanceiro(): { ok: true } {
    return { ok: true };
  }

  /** Capability + papel: o owner não passa por cima da capability. */
  @Get("bot-owner")
  @RequireCapability("lembrete_automatico")
  @Roles("owner")
  botOwner(): { ok: true } {
    return { ok: true };
  }

  /** Sem gate nenhum: âncora de que a pilha não bloqueia por si só. */
  @Get("aberto")
  aberto(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [
    JwtModule.register({}),
    TypeOrmModule.forFeature([Company]),
    TenantModule,
    UsersModule,
    CapabilitiesModule,
  ],
  controllers: [CapabilityProbeController],
})
export class CapabilityProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // O ActiveUserGuard faz lookup tenant-scoped — sem o TenantMiddleware não há
    // contexto de tenant e a rota estoura. Mesmo arranjo do AppModule real.
    consumer.apply(TenantMiddleware).forRoutes(CapabilityProbeController);
  }
}
