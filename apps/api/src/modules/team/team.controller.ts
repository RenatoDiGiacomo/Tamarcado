import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { TeamService, type Remuneration, type TeamMemberView } from "./team.service";
import { TeamQueryDto } from "./dto/team-query.dto";
import { UpdateRemunerationDto } from "./dto/update-remuneration.dto";

/**
 * Equipe — cadastro/controle de remuneração (Story 5.9), **owner-only** (@Roles).
 * Menu próprio (saiu de Configurações). Tenant-aware: registrado em
 * TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01). NÃO é caixa — só previsão.
 */
@ApiTags("team")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("team")
export class TeamController {
  constructor(private readonly team: TeamService) {}

  /** Lista a equipe com remuneração + PREVISÃO do período. */
  @Get()
  @Roles("owner")
  async list(@Query() q: TeamQueryDto): Promise<{ members: TeamMemberView[] }> {
    return this.team.list(q.from, q.to);
  }

  /** Salva a remuneração de um membro (salário + comissão). */
  @Patch(":id/remuneration")
  @Roles("owner")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRemunerationDto,
  ): Promise<Remuneration> {
    return this.team.updateRemuneration(id, dto);
  }
}
