import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModuleGuard } from "../auth/guards/module.guard";
import { RequireModule } from "../../common/decorators/require-module.decorator";
import { DashboardService, type DashboardMetrics } from "./dashboard.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

/**
 * Dashboard (Story 5.6) — somente leitura, gateado por `@RequireModule('dashboard')`
 * (403 + menu ausente para quem não tem `can_view_dashboard`). Tenant-aware:
 * registrado em TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01).
 */
@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, ModuleGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequireModule("dashboard")
  async metrics(@Query() q: DashboardQueryDto): Promise<DashboardMetrics> {
    return this.dashboard.metrics(q.from, q.to);
  }
}
