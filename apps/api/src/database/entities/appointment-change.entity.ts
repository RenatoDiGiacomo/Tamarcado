import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Campo do agendamento que pode ser editado (Story 3.6). */
export type AppointmentChangeField = "service" | "scheduled_at" | "professional";

/**
 * Registro de alteração de um agendamento (Story 3.6, DL-044/DL-045). Append-only:
 * uma linha por campo alterado numa edição (de→para, quem, quando). Genérica por
 * `field` — cancelamento/atribuição poderiam migrar para cá no futuro (DL-045).
 */
@Entity({ name: "appointment_changes" })
@Index("idx_apt_changes_company_apt", ["company_id", "appointment_id"])
export class AppointmentChange {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "bigint" })
  appointment_id!: string;

  @Column({ type: "bigint" })
  changed_by_user_id!: string;

  @Column({ type: "datetime" })
  changed_at!: Date;

  @Column({ type: "varchar", length: 32 })
  field!: AppointmentChangeField;

  @Column({ type: "varchar", length: 255, nullable: true })
  old_value!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  new_value!: string | null;
}
