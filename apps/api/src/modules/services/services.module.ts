import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SalonService } from "../../database/entities/salon-service.entity";
import { ProfessionalService } from "../../database/entities/professional-service.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";
import { SalonServicesRepository } from "./services.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([SalonService, ProfessionalService]),
    TenantModule,
    UsersModule, // UsersService p/ validar attends_clients na associação (AC4)
  ],
  controllers: [ServicesController],
  providers: [ServicesService, SalonServicesRepository, ActiveUserGuard],
  exports: [ServicesService],
})
export class ServicesModule {}
