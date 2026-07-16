import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Cliente final da instalação (architecture.md §3.3, Story 3.1 — base mínima).
 * Tenant-scoped por `company_id`. `phone_whatsapp` guarda como digitado;
 * `phone_whatsapp_normalized` em E.164 para matching/dedup. Cliente sem WhatsApp:
 * ambos NULL (a UNIQUE é NULL-safe — dois NULL não conflitam no MySQL).
 * Enriquecida no Épico 4 (e-mail, data do 1º agendamento). `is_deleted` = soft
 * delete (LGPD §3.11).
 */
@Entity({ name: "clients" })
@Index("uq_clients_tenant_phone", ["company_id", "phone_whatsapp_normalized"], {
  unique: true,
})
@Index("idx_clients_company_name", ["company_id", "name"])
@Index("idx_clients_company_deleted", ["company_id", "is_deleted"])
export class Client {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone_whatsapp!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone_whatsapp_normalized!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "boolean", default: false })
  is_deleted!: boolean;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
