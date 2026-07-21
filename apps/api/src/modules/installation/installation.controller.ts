import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { Company } from "../../database/entities/company.entity";
import { InstallationService } from "./installation.service";
import { UpdateInstallationDto } from "./dto/update-installation.dto";

interface InstallationView {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  businessHoursStart: string; // HH:MM
  businessHoursEnd: string;
}

function toView(company: Company): InstallationView {
  return {
    name: company.name,
    logoUrl: company.logo_url,
    primaryColor: company.primary_color,
    businessHoursStart: company.business_hours_start.slice(0, 5),
    businessHoursEnd: company.business_hours_end.slice(0, 5),
  };
}

// Identidade visual da instalação atual. NÃO está em TENANT_AWARE_CONTROLLERS
// (companies não é tenant-aware); usa sempre req.user.companyId do token.
@ApiTags("installation")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("installation")
export class InstallationController {
  constructor(private readonly installation: InstallationService) {}

  /** Identidade da instalação atual (branding do painel — AC4). Qualquer autenticado. */
  @Get()
  async get(@CurrentUser() user: AuthUser): Promise<InstallationView> {
    return toView(await this.installation.get(user.companyId));
  }

  /** Edita nome/logo(URL)/cor primária (AC1). Somente Dono. */
  @Patch()
  @Roles("owner")
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInstallationDto,
  ): Promise<InstallationView> {
    return toView(await this.installation.update(user.companyId, dto));
  }
}
