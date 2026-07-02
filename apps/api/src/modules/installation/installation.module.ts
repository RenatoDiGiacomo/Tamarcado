import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../../database/entities/company.entity";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { InstallationController } from "./installation.controller";
import { InstallationService } from "./installation.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    UsersModule, // UsersService para o ActiveUserGuard
  ],
  controllers: [InstallationController],
  providers: [InstallationService, ActiveUserGuard],
})
export class InstallationModule {}
