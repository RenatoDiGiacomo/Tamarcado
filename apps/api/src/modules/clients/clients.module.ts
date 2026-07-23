import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Client } from "../../database/entities/client.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { ClientsRepository } from "./clients.repository";
import { ClientsService } from "./clients.service";
import { ClientsController } from "./clients.controller";

/**
 * Clientes: base tenant-aware (Story 3.1) + busca/cadastro inline (Story 3.3,
 * FR-D7). A gestão completa (listar/editar/excluir) fica no Épico 4. Exporta o
 * repositório para consumo por outros módulos (ex.: agendamento).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Client]),
    TenantModule,
    UsersModule, // ActiveUserGuard depende de UsersService
    AppointmentsModule, // histórico da cliente (Story 4.2) — exporta AppointmentsService
  ],
  controllers: [ClientsController],
  providers: [ClientsRepository, ClientsService, ActiveUserGuard],
  exports: [ClientsRepository],
})
export class ClientsModule {}
