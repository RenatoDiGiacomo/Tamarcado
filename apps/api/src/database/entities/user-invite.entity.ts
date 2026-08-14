import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { AccessLevel } from "./user.entity";

/**
 * Convite de equipe (Story 1.4, DL-029). O `User` só é criado no aceite (com
 * senha) — `users.password_hash` segue `NOT NULL`. O token em claro só existe
 * no link retornado na criação; o banco guarda apenas o `token_hash` (SHA-256).
 * Convite é de uso único (`accepted_at`) e expira (`expires_at`).
 */
@Entity({ name: "user_invites" })
@Index("idx_user_invites_company_email", ["company_id", "email"])
@Index("uq_user_invites_token", ["token_hash"], { unique: true })
export class UserInvite {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "varchar", length: 200 })
  email!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  // Convite nunca cria 'owner' (FR-I3 / DL-029 item 4); validado no DTO. O
  // 'basic' foi aposentado (DL-062) — restam owner/manager no enum da coluna.
  @Column({ type: "enum", enum: ["owner", "manager"] })
  access_level!: AccessLevel;

  @Column({ type: "boolean", default: false })
  attends_clients!: boolean;

  @Column({ type: "varchar", length: 255 })
  token_hash!: string;

  @Column({ type: "timestamp" })
  expires_at!: Date;

  @Column({ type: "timestamp", nullable: true })
  accepted_at!: Date | null;

  @Column({ type: "bigint", nullable: true })
  invited_by!: string | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
