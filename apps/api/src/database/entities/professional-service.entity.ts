import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Junção profissional ↔ serviço (architecture.md §3.5): quais serviços cada
 * profissional executa. PK composta `(professional_id, service_id)`;
 * `company_id` desnormalizado para filtro tenant rápido. Sem `id` único — não
 * usa `TenantAwareRepository.findById`; queries carimbam/filtram `company_id`.
 */
@Entity({ name: "professional_services" })
@Index("idx_prof_services_company_service", ["company_id", "service_id"])
export class ProfessionalService {
  @PrimaryColumn({ type: "bigint" })
  professional_id!: string;

  @PrimaryColumn({ type: "bigint" })
  service_id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  // ---- Comissão POR SERVIÇO (Story 5.9) — usada quando o profissional tem
  // commission_scope='service'. Null = sem comissão para este serviço. ----
  @Column({ type: "enum", enum: ["percent", "fixed"], nullable: true })
  commission_kind!: "percent" | "fixed" | null;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  commission_value!: string | null;
}
