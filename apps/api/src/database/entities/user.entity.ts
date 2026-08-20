import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type AccessLevel = "owner" | "professional";
export type UserTheme = "light" | "dark";
/** Remuneração (Story 5.9). */
export type SalaryCadence = "daily" | "weekly" | "monthly";
export type CommissionScope = "none" | "professional" | "service";
export type CommissionKind = "percent" | "fixed";

/**
 * Usuário interno (Dono, Gestão). Schema em architecture.md §3.2.
 * Papéis: `owner` (Dono) e `professional` (Profissional). O antigo `basic` foi
 * **aposentado** (DL-062) — o que o restringia virou a AUSÊNCIA dos flags abaixo.
 * Dois eixos independentes (DL-022): `access_level` + `attends_clients`.
 * `theme` é preferência individual (DL-021).
 * Email é único POR TENANT (DL-026): `(company_id, email)`.
 *
 * Permissões por MÓDULO/AÇÃO (DL-062), todas OFF por padrão, concedidas só pelo
 * Dono; o `owner` ignora os flags (sempre pode). Lidas da LINHA FRESCA a cada
 * request (ActiveUserGuard) → revogação imediata.
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

  @Column({ type: "enum", enum: ["owner", "professional"] })
  access_level!: AccessLevel;

  @Column({ type: "boolean", default: false })
  attends_clients!: boolean;

  // Visibilidade de MÓDULO (DL-062): o menu existe/não existe para a pessoa;
  // o backend nega o endpoint com 403. OFF por padrão; owner ignora.
  @Column({ type: "boolean", default: false })
  can_view_financeiro!: boolean;

  @Column({ type: "boolean", default: false })
  can_view_dashboard!: boolean;

  // Escopo de AÇÃO da Agenda (DL-062 adição 2026-08-13): NÃO é módulo (não
  // esconde menu). OFF = opera só os próprios agendamentos; ON = os de toda a
  // equipe. owner sempre opera tudo. Substitui o antigo "basic = só os próprios".
  @Column({ type: "boolean", default: false })
  can_manage_all_appointments!: boolean;

  // Intervalo entre atendimentos (minutos), por profissional (FR-G3, DL-032).
  @Column({ type: "int", default: 0 })
  slot_interval_minutes!: number;

  @Column({ type: "enum", enum: ["light", "dark"], default: "light" })
  theme!: UserTheme;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  /**
   * Versão de sessão (1.2.04, DL-025-nota). Entra no payload do access E do
   * refresh token; qualquer divergência entre o token e este valor invalida a
   * sessão. Incrementa ao trocar (Perfil) ou redefinir (reset 1.9.01) a senha —
   * derrubando as OUTRAS sessões. Token sem o claim (emitido antes desta coluna)
   * vale como 0, igual ao default, então nada em uso quebra.
   */
  @Column({ type: "int", default: 0 })
  token_version!: number;

  // ---- Remuneração (Story 5.9) — salário fixo + comissão por profissional ----
  /** Salário fixo (valor). Coexiste com comissão. Null = sem salário fixo. */
  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  salary_amount!: string | null;

  /** Cadência do salário fixo. Null quando não há salário. */
  @Column({ type: "enum", enum: ["daily", "weekly", "monthly"], nullable: true })
  salary_cadence!: SalaryCadence | null;

  /** Origem da comissão: nenhuma / por profissional / por serviço (professional_services). */
  @Column({
    type: "enum",
    enum: ["none", "professional", "service"],
    default: "none",
  })
  commission_scope!: CommissionScope;

  /** Tipo da comissão POR PROFISSIONAL (quando scope='professional'). */
  @Column({ type: "enum", enum: ["percent", "fixed"], nullable: true })
  commission_kind!: CommissionKind | null;

  /** Valor da comissão por profissional: % (ex.: 30.00) ou valor fixo por atendimento. */
  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  commission_value!: string | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
