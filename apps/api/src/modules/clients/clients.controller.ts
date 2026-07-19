import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ClientsService, type ClientView } from "./clients.service";
import { CreateClientDto, SearchClientsQueryDto } from "./dto/client.dto";

/**
 * Clientes — busca + cadastro inline para o agendamento manual (Story 3.3).
 * Leitura/escrita para qualquer usuário autenticado do tenant. Tenant-aware:
 * registrado em TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01).
 */
@ApiTags("clients")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /** Autocomplete por nome/telefone (`?search=`). */
  @Get()
  async search(
    @Query() q: SearchClientsQueryDto,
  ): Promise<{ clients: ClientView[] }> {
    return { clients: await this.clients.search(q.search) };
  }

  /** Cadastro inline: nome obrigatório, WhatsApp opcional. */
  @Post()
  async create(@Body() dto: CreateClientDto): Promise<ClientView> {
    return this.clients.create(dto);
  }
}
