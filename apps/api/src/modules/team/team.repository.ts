import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../database/entities/user.entity";
import { Appointment } from "../../database/entities/appointment.entity";
import { ProfessionalService } from "../../database/entities/professional-service.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/** Atendimento concluído (base da comissão). */
export interface CompletedAppt {
  professionalId: string;
  serviceId: string;
  price: number | null;
}

/** Comissão por serviço de um profissional (para editar e apurar). */
export interface ServiceCommissionRow {
  professionalId: string;
  serviceId: string;
  serviceName: string;
  kind: "percent" | "fixed" | null;
  value: number | null;
}

/**
 * Acesso à Equipe/remuneração (Story 5.9) escopado pelo tenant. Estende
 * `TenantAwareRepository<User>` — o guard-rail de multi-tenancy (DL-027)
 * reconhece a cobertura. Demais tabelas entram por `manager`/join com o
 * `company_id` do contexto.
 */
@Injectable()
export class TeamRepository extends TenantAwareRepository<User> {
  constructor(
    @InjectRepository(User) repo: Repository<User>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  /** Todos os membros do tenant (Dono + profissionais), por nome. */
  members(): Promise<User[]> {
    return this.findAll({ order: { name: "ASC" } });
  }

  /** Um membro do tenant, ou null. */
  member(id: string): Promise<User | null> {
    return this.findById(id);
  }

  /** Persiste o membro (já carimbado com company_id do contexto). */
  saveMember(user: User): Promise<User> {
    return this.repo.save(user);
  }

  /** Atendimentos CONCLUÍDOS do período (base da comissão), com atribuição. */
  async completedAppointments(
    startUtc: Date,
    endUtc: Date,
  ): Promise<CompletedAppt[]> {
    const rows = await this.repo.manager
      .getRepository(Appointment)
      .createQueryBuilder("a")
      .select("a.professional_id", "professional_id")
      .addSelect("a.service_id", "service_id")
      .addSelect("a.price_snapshot", "price")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.status = 'completed'")
      .andWhere("a.professional_id IS NOT NULL")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .getRawMany<{
        professional_id: string;
        service_id: string;
        price: string | null;
      }>();
    return rows.map((r) => ({
      professionalId: String(r.professional_id),
      serviceId: String(r.service_id),
      price: r.price != null ? Number(r.price) : null,
    }));
  }

  /** Comissões por serviço (todas do tenant) + nome do serviço, para editar/apurar. */
  async serviceCommissions(): Promise<ServiceCommissionRow[]> {
    const rows = await this.repo.manager
      .getRepository(ProfessionalService)
      .createQueryBuilder("ps")
      .innerJoin(
        "salon_services",
        "s",
        "s.id = ps.service_id AND s.company_id = ps.company_id",
      )
      .select("ps.professional_id", "professional_id")
      .addSelect("ps.service_id", "service_id")
      .addSelect("s.name", "service_name")
      .addSelect("ps.commission_kind", "kind")
      .addSelect("ps.commission_value", "value")
      .where("ps.company_id = :companyId", { companyId: this.companyId })
      .orderBy("s.name", "ASC")
      .getRawMany<{
        professional_id: string;
        service_id: string;
        service_name: string | null;
        kind: "percent" | "fixed" | null;
        value: string | null;
      }>();
    return rows.map((r) => ({
      professionalId: String(r.professional_id),
      serviceId: String(r.service_id),
      serviceName: r.service_name ?? "",
      kind: r.kind,
      value: r.value != null ? Number(r.value) : null,
    }));
  }

  /** Define a comissão de UM serviço de um profissional (só se o vínculo existe). */
  async setServiceCommission(
    professionalId: string,
    serviceId: string,
    kind: "percent" | "fixed" | null,
    value: number | null,
  ): Promise<void> {
    await this.repo.manager
      .getRepository(ProfessionalService)
      .createQueryBuilder()
      .update()
      .set({ commission_kind: kind, commission_value: value?.toFixed(2) ?? null })
      .where(
        "company_id = :companyId AND professional_id = :professionalId AND service_id = :serviceId",
        { companyId: this.companyId, professionalId, serviceId },
      )
      .execute();
  }
}
