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
import { CurrentActor, type Actor } from "../auth/actor.decorator";
import {
  ClientsService,
  type ClientListView,
  type ClientProfileView,
  type ClientView,
} from "./clients.service";
import { AppointmentsService } from "../appointments/appointments.service";
import type { AppointmentView } from "../appointments/appointments.mapper";
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
  constructor(
    private readonly clients: ClientsService,
    private readonly appointments: AppointmentsService,
  ) {}

  /**
   * `?search=` → autocomplete (3.3): vazio→[], termo→limitado, `{ clients }`.
   *   **Exceção (DL-062, 2026-08-14):** a busca do AGENDAMENTO NÃO é recortada —
   *   o profissional pode escolher qualquer cliente (inclusive nova) ao agendar.
   * `?page&pageSize` → modo LISTA do módulo (4.1): `{ clients, total, ... }`.
   *   **Recortado (DL-062):** o profissional vê só as clientes que ELE atendeu;
   *   quem gerencia a equipe vê a carteira inteira.
   */
  @Get()
  async list(
    @Query() q: ListClientsQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<{ clients: ClientView[] } | ClientListView> {
    if (q.page !== undefined || q.pageSize !== undefined) {
      return this.clients.list({
        search: q.search,
        page: q.page,
        pageSize: q.pageSize,
        attendedByProfessionalId: actor.canManageAll ? undefined : actor.userId,
        includeFinance: actor.canViewFinanceiro, // Story 5.5 (corte de valor)
      });
    }
    return { clients: await this.clients.search(q.search) };
  }

  /** Perfil por id (4.1 + 4.2: notes/createdAt) — deletada/fora do tenant → 404. */
  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @CurrentActor() actor: Actor,
  ): Promise<ClientProfileView> {
    return this.clients.getById(id, actor.canViewFinanceiro);
  }

  /**
   * Histórico de agendamentos da cliente (Story 4.2). Valida a cliente (404) e
   * reusa o AppointmentsService; quem não gerencia a equipe vê só os próprios (roleScope).
   */
  @Get(":id/appointments")
  async history(
    @Param("id") id: string,
    @CurrentActor() actor: Actor,
  ): Promise<{ appointments: AppointmentView[] }> {
    await this.clients.getById(id); // 404 se inválida/deletada/fora do tenant
    return this.appointments.listByClient(id, actor);
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
