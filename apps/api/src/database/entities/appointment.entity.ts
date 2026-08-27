import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type AppointmentSource = "whatsapp" | "manual" | "app" | "link";

export type CancelledBy = "client" | "professional" | "system";

/**
 * Agendamento (architecture.md §3.7, Story 3.1). Schema COMPLETO desde já — as
 * colunas que só o bot usa (`timeout_notified_at`, `cancellation_reason`,
 * `cancelled_by`) já entram para o Épico 6 plugar sem migração (DL-038 D5).
 *
 * - `professional_id` NULLABLE (addendum C.4-bis): bot cria sem atribuir; manual atribui.
 * - `price_snapshot` NULLABLE (DL-038 D1): serviço "sob consulta" sem preço (DL-030).
 * - `scheduled_at` em UTC (ADR-008); a lógica de dia/horário lê `companies.timezone`.
 * - Estado inicial por origem (FR-K3): whatsapp→pending; manual→confirmed. A ESCRITA
 *   desses estados é das Stories 3.3/6.x — aqui a tabela só existe.
 * - DECIMAL volta como string no driver MySQL/TypeORM.
 */
@Entity({ name: "appointments" })
@Index("idx_apt_company_date", ["company_id", "scheduled_at"])
@Index("idx_apt_company_status_date", ["company_id", "status", "scheduled_at"])
@Index("idx_apt_company_prof_date", [
  "company_id",
  "professional_id",
  "scheduled_at",
])
@Index("idx_apt_company_client", ["company_id", "client_id"])
@Index("idx_apt_company_source", ["company_id", "source"])
export class Appointment {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "bigint" })
  client_id!: string;

  @Column({ type: "bigint" })
  service_id!: string;

  @Column({ type: "bigint", nullable: true })
  professional_id!: string | null;

  @Column({ type: "datetime" })
  scheduled_at!: Date;

  // Snapshot do serviço no momento do agendamento.
  @Column({ type: "int" })
  duration_minutes!: number;

  // Snapshot do preço; null quando o serviço não tem preço (DL-030/DL-038 D1).
  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  price_snapshot!: string | null;

  @Column({
    type: "enum",
    enum: ["pending", "confirmed", "cancelled", "completed", "no_show"],
  })
  status!: AppointmentStatus;

  @Column({ type: "enum", enum: ["whatsapp", "manual", "app", "link"] })
  source!: AppointmentSource;

  // Nome COMO A CLIENTE DIGITOU no link público (DL-071). Sempre gravado na
  // solicitação pública; NULL nos demais canais. O cadastro é reaproveitado pelo
  // telefone, então este é o único registro de que o nome informado era outro.
  @Column({ type: "varchar", length: 100, nullable: true })
  requested_client_name!: string | null;

  // Auditoria do criador manual (FR-K2); NULL quando criado pelo bot.
  @Column({ type: "bigint", nullable: true })
  created_by_user_id!: string | null;

  @Column({ type: "text", nullable: true })
  cancellation_reason!: string | null;

  @Column({
    type: "enum",
    enum: ["client", "professional", "system"],
    nullable: true,
  })
  cancelled_by!: CancelledBy | null;

  // QUEM cancelou (a pessoa), distinto de `cancelled_by` (o lado). Story 3.4/D1;
  // espelha `created_by_user_id`. NULL quando nunca cancelado ou cancelado pelo bot.
  @Column({ type: "bigint", nullable: true })
  cancelled_by_user_id!: string | null;

  // QUEM atribuiu/trocou o profissional e QUANDO. Story 3.5/DL-043; espelha
  // `cancelled_by_user_id`. NULL quando o profissional nunca foi alterado.
  @Column({ type: "bigint", nullable: true })
  assigned_by_user_id!: string | null;

  @Column({ type: "datetime", nullable: true })
  assigned_at!: Date | null;

  // Só o bot usa (Épico 6): quando a notificação de timeout de 2h foi enviada.
  @Column({ type: "datetime", nullable: true })
  timeout_notified_at!: Date | null;

  @Column({ type: "boolean", default: false })
  is_deleted!: boolean;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
