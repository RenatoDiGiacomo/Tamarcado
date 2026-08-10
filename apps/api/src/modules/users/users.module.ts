import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../../database/entities/user.entity";
import { UserInvite } from "../../database/entities/user-invite.entity";
import { TenantModule } from "../tenant/tenant.module";
import { TokenModule } from "../token/token.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

@Module({
  // TokenModule: o TokenService emite os tokens novos na troca de senha (1.2.04).
  imports: [
    TypeOrmModule.forFeature([User, UserInvite]),
    TenantModule,
    TokenModule,
  ],
  controllers: [UsersController],
  // ActiveUserGuard vive aqui (usa UsersService) — evita ciclo com AuthModule.
  providers: [UsersService, UsersRepository, ActiveUserGuard],
  exports: [UsersService],
})
export class UsersModule {}
