import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { SalonService } from "../../database/entities/salon-service.entity";
import { User } from "../../database/entities/user.entity";
import { Client } from "../../database/entities/client.entity";
import { Appointment } from "../../database/entities/appointment.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { ServicesService } from "../services/services.service";
import { UsersService } from "../users/users.service";
import {
  AvailabilityService,
  type DayAvailability,
} from "../availability/availability.service";
import { timeToMinutes, zonedWallTimeToUtc } from "../availability/tz.util";
import { isPastCivilDate } from "../appointments/create-appointment.util";
import { normalizePhoneBR } from "../clients/phone.util";
import { PublicRateLimitService } from "./public-rate-limit.service";
import type { CreatePublicAppointmentDto } from "./dto/create-public-appointment.dto";

/** Branding público — SÓ os campos de marca (whitelist, sem PII/config — DL-034). */
export interface PublicInstallationView {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}
export interface PublicServiceView {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
}
export interface PublicProfessionalView {
  id: string;
  name: string;
}
export interface CreatedPublicAppointment {
  id: string;
  status: "pending";
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Leituras públicas + criação do pendente (Stories 5B.1/5B.2). O tenant já foi
 * resolvido pelo slug (`PublicSlugTenantMiddleware`), então os repos saem
 * tenant-scoped. A criação é HOSTIL por padrão: validação estrita, rate limit,
 * janela antispam de 2h por telefone, honeypot. Entra `pending`, `source=link`.
 */
@Injectable()
export class PublicBookingService {
  constructor(
    private readonly tenant: TenantContextService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(SalonService)
    private readonly salonServices: Repository<SalonService>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    private readonly services: ServicesService,
    private readonly users: UsersService,
    private readonly availability: AvailabilityService,
    private readonly rateLimit: PublicRateLimitService,
  ) {}

  async getInstallation(): Promise<PublicInstallationView> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    return {
      name: company?.name ?? "",
      logoUrl: company?.logo_url ?? null,
      primaryColor: company?.primary_color ?? null,
    };
  }

  async listServices(): Promise<{ services: PublicServiceView[] }> {
    const list = await this.services.list(true);
    return {
      services: list.map((s) => ({
        id: String(s.id),
        name: s.name,
        durationMinutes: s.duration_minutes,
        price: s.price,
      })),
    };
  }

  async listProfessionals(): Promise<{ professionals: PublicProfessionalView[] }> {
    const list = await this.users.listAttenders();
    return {
      professionals: list.map((u) => ({ id: String(u.id), name: u.name })),
    };
  }

  /** Horários livres de um serviço num dia — reusa o AvailabilityService (5B.2). */
  getAvailability(params: {
    serviceId: string;
    date: string;
    professionalId?: string;
  }): Promise<DayAvailability> {
    return this.availability.getDayAvailability(params);
  }

  /**
   * Cria o agendamento PENDENTE a partir da página pública (5B.2). Ordem: honeypot
   * → rate limit (IP/slug) → validações (serviço/tenant, profissional, data) →
   * janela 2h por telefone → find-or-create cliente → cria pendente. `source=link`,
   * sem profissional obrigatório, sem criador (público).
   */
  async createPending(
    dto: CreatePublicAppointmentDto,
    ip: string,
    slug: string,
  ): Promise<CreatedPublicAppointment> {
    // Honeypot: campo oculto preenchido = bot. Rejeita sem tocar o banco.
    if (dto.website != null && dto.website.trim() !== "") {
      throw new BadRequestException("Não foi possível processar a solicitação.");
    }

    // Burst-guard por IP e por slug (429).
    this.rateLimit.assertWithinLimit(ip, slug);

    const companyId = this.tenant.getCompanyId();

    // Serviço: existe, ativo e DO TENANT (cross-tenant → 400) — snapshot de preço/duração.
    const service = await this.salonServices.findOne({
      where: { id: dto.serviceId, company_id: companyId, is_active: true },
    });
    if (!service) {
      throw new BadRequestException("Serviço inválido ou indisponível.");
    }

    // Profissional é OPCIONAL (DL-049); quando informado, precisa ser atendente ativo.
    let professionalId: string | null = null;
    if (dto.professionalId) {
      const prof = await this.usersRepo.findOne({
        where: {
          id: dto.professionalId,
          company_id: companyId,
          attends_clients: true,
          is_active: true,
        },
      });
      if (!prof) {
        throw new BadRequestException("Profissional inválido.");
      }
      professionalId = prof.id;
    }

    // Data/hora civis (fuso do tenant) → UTC; hoje-ou-futura.
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const scheduledAt = zonedWallTimeToUtc(dto.date, timeToMinutes(dto.time), tz);
    if (isPastCivilDate(scheduledAt, new Date(), tz)) {
      throw new BadRequestException("A data deve ser hoje ou futura.");
    }

    // Janela antispam de 2h por telefone (DL-049): mesma pessoa não spamma pedidos.
    const normalized = normalizePhoneBR(dto.phone);
    if (normalized) {
      const since = new Date(Date.now() - TWO_HOURS_MS);
      const recent = await this.appointments
        .createQueryBuilder("a")
        .innerJoin("clients", "c", "c.id = a.client_id")
        .where("a.company_id = :companyId", { companyId })
        .andWhere("a.source = :src", { src: "link" })
        .andWhere("c.phone_whatsapp_normalized = :normalized", { normalized })
        .andWhere("a.created_at > :since", { since })
        .getCount();
      if (recent > 0) {
        throw new HttpException(
          "Você já tem uma solicitação recente. Aguarde o contato do estabelecimento.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Cliente: reaproveita pelo telefone normalizado (dedup, tenant-scoped) ou cria.
    let client = normalized
      ? await this.clients.findOne({
          where: {
            company_id: companyId,
            phone_whatsapp_normalized: normalized,
            is_deleted: false,
          },
        })
      : null;
    if (!client) {
      client = await this.clients.save(
        this.clients.create({
          company_id: companyId,
          name: dto.name,
          phone_whatsapp: dto.phone,
          phone_whatsapp_normalized: normalized,
        }),
      );
    }

    const saved = await this.appointments.save(
      this.appointments.create({
        company_id: companyId,
        client_id: client.id,
        service_id: service.id,
        professional_id: professionalId,
        scheduled_at: scheduledAt,
        duration_minutes: service.duration_minutes,
        price_snapshot: service.price ?? null,
        status: "pending",
        source: "link",
        created_by_user_id: null,
      }),
    );

    return { id: String(saved.id), status: "pending" };
  }
}
