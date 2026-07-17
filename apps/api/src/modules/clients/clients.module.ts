import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Client } from "../../database/entities/client.entity";
import { TenantModule } from "../tenant/tenant.module";
import { ClientsRepository } from "./clients.repository";

/**
 * Base de clientes (Story 3.1, D7): entidade + repositório tenant-aware, SEM
 * controller/CRUD. O cadastro inline vem na Story 3.3 e a gestão completa no
 * Épico 4 (que estende a tabela). Exporta o repositório para consumo futuro.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Client]), TenantModule],
  providers: [ClientsRepository],
  exports: [ClientsRepository],
})
export class ClientsModule {}
