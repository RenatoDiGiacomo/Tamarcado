import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModuleGuard } from "../auth/guards/module.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RequireModule } from "../../common/decorators/require-module.decorator";
import { CurrentActor, type Actor } from "../auth/actor.decorator";
import {
  TeamService,
  type Remuneration,
  type TeamMemberView,
  type TeamPaymentsView,
} from "./team.service";
import { TeamQueryDto } from "./dto/team-query.dto";
import { UpdateRemunerationDto } from "./dto/update-remuneration.dto";
import { RegisterTeamPaymentDto } from "./dto/register-team-payment.dto";

/**
 * Equipe — cadastro/controle de remuneração (Story 5.9). Menu próprio (saiu de
 * Configurações). VER a equipe é gateado por módulo `can_view_equipe` (owner
 * sempre pode; DL-062); EDITAR a remuneração é **owner-only** (@Roles). Tenant-aware:
 * registrado em TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01). NÃO é caixa.
 */
@ApiTags("team")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, ModuleGuard, RolesGuard)
@Controller("team")
export class TeamController {
  constructor(private readonly team: TeamService) {}

  /** Lista a equipe com remuneração + PREVISÃO do período (módulo `equipe`). */
  @Get()
  @RequireModule("equipe")
  async list(@Query() q: TeamQueryDto): Promise<{ members: TeamMemberView[] }> {
    return this.team.list(q.from, q.to);
  }

  /** SAÍDAS do período (por data do pagamento) — mostradas no Financeiro (módulo). */
  @Get("payments")
  @RequireModule("financeiro")
  async payments(@Query() q: TeamQueryDto): Promise<TeamPaymentsView> {
    return this.team.listPayments(q.from, q.to);
  }

  /** Registra uma SAÍDA (pagamento à equipe) — só o Dono (fecha o previsão→real). */
  @Post("payments")
  @Roles("owner")
  async registerPayment(
    @Body() dto: RegisterTeamPaymentDto,
    @CurrentActor() actor: Actor,
  ): Promise<{ ok: true }> {
    await this.team.registerPayment(dto, actor.userId);
    return { ok: true };
  }

  /** Salva a remuneração de um membro (salário + comissão) — só o Dono. */
  @Patch(":id/remuneration")
  @Roles("owner")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRemunerationDto,
  ): Promise<Remuneration> {
    return this.team.updateRemuneration(id, dto);
  }
}
