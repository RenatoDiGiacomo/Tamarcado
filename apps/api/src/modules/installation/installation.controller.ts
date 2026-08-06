import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
import { UpdateSlugDto } from "./dto/update-slug.dto";

interface InstallationView {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  businessHoursStart: string; // HH:MM
  businessHoursEnd: string;
  /** Slug do link público (`/agendar/{slug}`) — editável em Configurações. */
  slug: string;
  /** Endereço completo do agendamento, montado sobre WEB_BASE_URL. */
  publicUrl: string;
}

// Identidade visual da instalação atual. NÃO está em TENANT_AWARE_CONTROLLERS
// (companies não é tenant-aware); usa sempre req.user.companyId do token.
@ApiTags("installation")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("installation")
export class InstallationController {
  constructor(
    private readonly installation: InstallationService,
    private readonly config: ConfigService,
  ) {}

  private toView(company: Company): InstallationView {
    const base = this.config.get<string>(
      "WEB_BASE_URL",
      "http://localhost:5173",
    );
    return {
      name: company.name,
      logoUrl: company.logo_url,
      primaryColor: company.primary_color,
      businessHoursStart: company.business_hours_start.slice(0, 5),
      businessHoursEnd: company.business_hours_end.slice(0, 5),
      slug: company.slug,
      publicUrl: `${base}/agendar/${company.slug}`,
    };
  }

  /** Identidade da instalação atual (branding do painel — AC4). Qualquer autenticado. */
  @Get()
  async get(@CurrentUser() user: AuthUser): Promise<InstallationView> {
    return this.toView(await this.installation.get(user.companyId));
  }

  /** Edita nome/logo(URL)/cor primária (AC1). Somente Dono. */
  @Patch()
  @Roles("owner")
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInstallationDto,
  ): Promise<InstallationView> {
    return this.toView(await this.installation.update(user.companyId, dto));
  }

  /**
   * Troca o slug do link público (DL-049 — editável em Configurações). Somente
   * Dono. 409 se já estiver em uso. NÃO há redirect do slug antigo: o aviso e a
   * confirmação ficam no front.
   */
  @Patch("slug")
  @Roles("owner")
  async updateSlug(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSlugDto,
  ): Promise<InstallationView> {
    return this.toView(await this.installation.updateSlug(user.companyId, dto.slug));
  }
}
