import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Horário de trabalho de um profissional por dia da semana (architecture.md
 * §3.6, Story 1.6). Tenant-scoped por `company_id`. Uma linha por dia ativo;
 * o intervalo entre atendimentos vive em `users.slot_interval_minutes` (DL-032).
 */
@Entity({ name: "professional_schedules" })
@Index("idx_pschedules_company_prof_day", [
  "company_id",
  "professional_id",
  "day_of_week",
])
export class ProfessionalSchedule {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "bigint" })
  professional_id!: string;

  // 0=Dom, 1=Seg ... 6=Sab
  @Column({ type: "tinyint" })
  day_of_week!: number;

  // TIME volta como string "HH:MM:SS" no driver MySQL/TypeORM.
  @Column({ type: "time" })
  start_time!: string;

  @Column({ type: "time" })
  end_time!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;
}
