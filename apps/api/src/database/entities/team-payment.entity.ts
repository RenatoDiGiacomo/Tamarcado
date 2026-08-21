import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Pagamento à equipe (Story 5.10) — a SAÍDA de caixa que fecha o previsão→real.
 * O Dono paga um profissional referente a um período; fica registrado no
 * Financeiro (central de entradas E saídas). `paid_on` é a data do pagamento
 * (filtro do Financeiro); `period_from/to` é o período a que o valor se refere.
 */
@Entity({ name: "team_payments" })
@Index("idx_team_payments_company_paid", ["company_id", "paid_on"])
export class TeamPayment {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "bigint" })
  professional_id!: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount!: string;

  /** Data do pagamento (YYYY-MM-DD) — o que entra no período do Financeiro. */
  @Column({ type: "date" })
  paid_on!: string;

  /** Período a que o pagamento se refere (previsão→real). */
  @Column({ type: "date" })
  period_from!: string;

  @Column({ type: "date" })
  period_to!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  note!: string | null;

  @Column({ type: "bigint", nullable: true })
  created_by_user_id!: string | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;
}
