import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type AccessLevel = "owner" | "manager" | "basic";
export type UserTheme = "light" | "dark";

/**
 * Usuário interno (dono, gestão, básico). Schema em architecture.md §3.2.
 * Dois eixos independentes (DL-022): `access_level` + `attends_clients`.
 * `theme` é preferência individual (DL-021).
 * Email é único POR TENANT (DL-026): `(company_id, email)`.
 */
@Entity({ name: "users" })
@Index("uq_users_tenant_email", ["company_id", "email"], { unique: true })
@Index("idx_users_company_access", ["company_id", "access_level"])
@Index("idx_users_company_attends", ["company_id", "attends_clients"])
@Index("idx_users_company_active", ["company_id", "is_active"])
export class User {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 200 })
  email!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone_whatsapp!: string | null;

  @Column({ type: "varchar", length: 255 })
  password_hash!: string;

  @Column({ type: "enum", enum: ["owner", "manager", "basic"] })
  access_level!: AccessLevel;

  @Column({ type: "boolean", default: false })
  attends_clients!: boolean;

  @Column({ type: "enum", enum: ["light", "dark"], default: "light" })
  theme!: UserTheme;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
