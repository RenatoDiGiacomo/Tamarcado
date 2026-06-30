import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { SalonService } from "../../database/entities/salon-service.entity";
import { ServicesService } from "./services.service";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";
import { SetProfessionalsDto } from "./dto/set-professionals.dto";

interface ServiceDto {
  id: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  isActive: boolean;
}

function toServiceDto(s: SalonService): ServiceDto {
  return {
    id: s.id,
    name: s.name,
    durationMinutes: s.duration_minutes,
    // DECIMAL volta como string do banco; expõe número (ou null quando opcional).
    price: s.price === null ? null : Number(s.price),
    isActive: s.is_active,
  };
}

// Tenant-aware: registrado em TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01).
// Guards como no UsersController; mutações exigem Dono (matriz FR-I2).
@ApiTags("services")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  /** Lista serviços do tenant. `?activeOnly=true` exclui inativos (AC3). */
  @Get()
  async list(
    @Query("activeOnly") activeOnly?: string,
  ): Promise<{ services: ServiceDto[] }> {
    const items = await this.services.list(activeOnly === "true");
    return { services: items.map(toServiceDto) };
  }

  /** Cria serviço (AC2). Somente Dono. */
  @Post()
  @Roles("owner")
  async create(@Body() dto: CreateServiceDto): Promise<ServiceDto> {
    return toServiceDto(await this.services.create(dto));
  }

  /** Lê profissionais que executam o serviço (AC4). Antes de :id. */
  @Get(":id/professionals")
  async getProfessionals(
    @Param("id") id: string,
  ): Promise<{ professionalIds: string[] }> {
    return { professionalIds: await this.services.getProfessionals(id) };
  }

  /** Define quais profissionais executam o serviço (AC4). Somente Dono. */
  @Put(":id/professionals")
  @Roles("owner")
  async setProfessionals(
    @Param("id") id: string,
    @Body() dto: SetProfessionalsDto,
  ): Promise<{ professionalIds: string[] }> {
    return {
      professionalIds: await this.services.setProfessionals(
        id,
        dto.professionalIds,
      ),
    };
  }

  /** Detalhe do serviço (tenant-scoped; id de outro tenant → 404). */
  @Get(":id")
  async byId(@Param("id") id: string): Promise<ServiceDto> {
    return toServiceDto(await this.services.findOne(id));
  }

  /** Edita serviço — nome/duração/preço/ativo (AC2). Somente Dono. */
  @Patch(":id")
  @Roles("owner")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceDto> {
    return toServiceDto(await this.services.update(id, dto));
  }
}
