import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  ClientsService,
  type ClientListView,
  type ClientView,
} from "./clients.service";
import {
  CreateClientDto,
  ListClientsQueryDto,
  UpdateClientDto,
} from "./dto/client.dto";

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

  /**
   * `?search=` → autocomplete (3.3): vazio→[], termo→limitado, `{ clients }`.
   * `?page&pageSize` → modo lista da gestão (4.1): `{ clients, total, page, pageSize }`.
   */
  @Get()
  async list(
    @Query() q: ListClientsQueryDto,
  ): Promise<{ clients: ClientView[] } | ClientListView> {
    if (q.page !== undefined || q.pageSize !== undefined) {
      return this.clients.list({
        search: q.search,
        page: q.page,
        pageSize: q.pageSize,
      });
    }
    return { clients: await this.clients.search(q.search) };
  }

  /** Obter uma cliente por id (Story 4.1) — deletada/fora do tenant → 404. */
  @Get(":id")
  async getOne(@Param("id") id: string): Promise<ClientView> {
    return this.clients.getById(id);
  }

  /** Cadastro inline: nome obrigatório, WhatsApp opcional. */
  @Post()
  async create(@Body() dto: CreateClientDto): Promise<ClientView> {
    return this.clients.create(dto);
  }

  /** Editar nome/WhatsApp (Story 4.1). Colisão de telefone → 409. */
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientView> {
    return this.clients.update(id, dto);
  }
}
