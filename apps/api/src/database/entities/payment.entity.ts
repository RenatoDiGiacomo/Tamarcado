import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type PaymentStatus = "pago" | "pendente";
export type PaymentMethod =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "outro";

/**
 * Pagamento de um agendamento (Story 5.2). **Um por agendamento** (unique
 * `(company_id, appointment_id)`) — o registro é upsert. `method` é OPCIONAL. O
 * `status` (`pago`/`pendente`) é dado PRÓPRIO do pagamento, independente do
 * status do agendamento. Tenant-scoped por `company_id`. Acesso pelo módulo
 * Financeiro (DL-062).
 */
@Entity({ name: "payments" })
@Index("uq_payments_appointment", ["company_id", "appointment_id"], {
  unique: true,
})
export class Payment {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "bigint" })
  appointment_id!: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount!: string;

  @Column({
    type: "enum",
    enum: ["dinheiro", "pix", "debito", "credito", "outro"],
    nullable: true,
  })
  method!: PaymentMethod | null;

  @Column({ type: "enum", enum: ["pago", "pendente"] })
  status!: PaymentStatus;

  @Column({ type: "bigint", nullable: true })
  created_by_user_id!: string | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
