import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Serviço oferecido pela instalação (architecture.md §3.4). Tenant-scoped por
 * `company_id`. `price` é OPCIONAL (DL-030): serviço "sob consulta"/variável.
 * Inativar = soft delete (`is_active=false`).
 */
@Entity({ name: "salon_services" })
@Index("idx_services_company_active", ["company_id", "is_active"])
export class SalonService {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "int" })
  duration_minutes!: number;

  // DECIMAL volta como string no driver MySQL/TypeORM; null quando sem preço.
  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  price!: string | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
