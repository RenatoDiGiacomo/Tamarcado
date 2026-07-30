import {
  Body,
  Controller,
  Ip,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { PlatformKeyGuard } from "./platform-key.guard";
import { PlatformRateLimitService } from "./platform-rate-limit.service";
import { PlatformService, type ProvisionResult } from "./platform.service";

/**
 * Endpoint de PLATAFORMA (Story 1.9). Provisiona um novo estabelecimento.
 * Protegido por `x-platform-key` (PlatformKeyGuard). PRÉ-TENANT: cria a company
 * e o convite do owner sem contexto de tenant (registrado em
 * PRE_TENANT_CONTROLLERS — DL-027). Superfície MÍNIMA: só cria (sem
 * listar/editar/deletar).
 */
@ApiTags("platform")
@Controller("platform/companies")
@UseGuards(PlatformKeyGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly rateLimit: PlatformRateLimitService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateCompanyDto,
    @Ip() ip: string,
  ): Promise<ProvisionResult> {
    this.rateLimit.assertWithinLimit(ip);
    return this.platform.provision(dto);
  }
}
