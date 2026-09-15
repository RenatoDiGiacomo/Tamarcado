import {
  Body,
  Controller,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyPlanDto } from "./dto/update-company-plan.dto";
import { PlatformKeyGuard } from "./platform-key.guard";
import { PlatformRateLimitService } from "./platform-rate-limit.service";
import {
  PlatformService,
  type PlanChangeResult,
  type ProvisionResult,
} from "./platform.service";

/**
 * Endpoint de PLATAFORMA (Story 1.9). Provisiona um novo estabelecimento e
 * — desde a Story 6.16 — troca o que uma empresa existente pode usar.
 * Protegido por `x-platform-key` (PlatformKeyGuard). PRÉ-TENANT: opera sem
 * contexto de tenant, com a empresa-alvo explícita (registrado em
 * PRE_TENANT_CONTROLLERS — DL-027).
 *
 * Superfície deliberadamente pequena: CRIAR a empresa e MUDAR o que ela
 * contratou. Não lista, não edita dado do salão, não apaga.
 *
 * ⚠️ **A restrição de IP no Nginx é PRÉ-REQUISITO DE PRODUÇÃO, e está
 * PENDENTE.** O DL-076 especifica `x-platform-key` **+** IP restrito; hoje só a
 * chave existe. Enquanto for assim, este controller é a superfície com a qual se
 * liga e desliga o que um cliente pagou, protegida por um único segredo
 * compartilhado. Ver a nota de implantação da Story 6.16.
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

  /**
   * Ativa ou corta recursos de uma empresa (Story 6.16, DL-076).
   *
   * Identificada pelo **slug**, não pelo id: é o que o operador tem na mão (é o
   * que ele usa no reset de senha da 1.9.01, e é o que aparece no link público
   * do salão). Pedir o id do banco obrigaria a consultar o banco antes de
   * operar — que é exatamente o que este endpoint existe para evitar.
   *
   * O corpo aceita o PRESET (`plan`) ou a LISTA (`capabilities`), nunca os dois;
   * a lista é o ESTADO FINAL, então `capabilities: []` corta tudo. Ver o DTO.
   */
  @Patch(":slug/plan")
  changePlan(
    @Param("slug") slug: string,
    @Body() dto: UpdateCompanyPlanDto,
    @Ip() ip: string,
  ): Promise<PlanChangeResult> {
    this.rateLimit.assertWithinLimit(ip);
    return this.platform.changePlan(slug, dto, ip);
  }
}
