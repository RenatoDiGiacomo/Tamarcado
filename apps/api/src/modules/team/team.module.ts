import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../../database/entities/user.entity";
import { Company } from "../../database/entities/company.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";
import { TeamRepository } from "./team.repository";

/**
 * Equipe — cadastro/controle de remuneração (Story 5.9). UsersModule entra
 * porque o ActiveUserGuard depende do UsersService. TeamRepository (tenant-aware)
 * faz as leituras; Appointment/ProfessionalService/SalonService entram por
 * manager/join, sem precisar de forFeature aqui.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Company]),
    TenantModule,
    UsersModule,
  ],
  controllers: [TeamController],
  providers: [TeamService, TeamRepository, ActiveUserGuard],
})
export class TeamModule {}
