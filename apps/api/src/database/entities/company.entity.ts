import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Tenant. Schema canônico em architecture.md §3.1.
 *
 * Nota de escopo (Story 1.1): as colunas `whatsapp_provider` e
 * `evolution_instance_name` NÃO existem ainda — são adicionadas na Story 2.1.
 */
@Entity({ name: "companies" })
export class Company {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 50, unique: true })
  slug!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  logo_url!: string | null;

  @Column({ type: "varchar", length: 7, nullable: true, default: "#6C63FF" })
  primary_color!: string | null;

  // ── Página pública (1ª leva do redesenho) ───────────────────────────────
  // Só exibição: a página mostra o que estiver preenchido e omite o resto.
  /** Endereço em UM campo — decisão da spec de UX (2026-08-26). */
  @Column({ type: "varchar", length: 200, nullable: true })
  address!: string | null;

  /** Link do mapa (o dono cola). Sem geocoding: abre o app de mapas do aparelho. */
  @Column({ type: "varchar", length: 500, nullable: true })
  maps_url!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  instagram_url!: string | null;

  /** Guardado como o dono digita; o link `wa.me` é montado na exibição. */
  @Column({ type: "varchar", length: 20, nullable: true })
  whatsapp_phone!: string | null;

  @Column({ type: "time", default: "08:00:00" })
  business_hours_start!: string;

  @Column({ type: "time", default: "19:00:00" })
  business_hours_end!: string;

  // architecture.md §3.1 indica VARCHAR(20), mas o default tem 23 chars —
  // corrigido para 50 (a spec é internamente inconsistente).
  @Column({ type: "varchar", length: 50, default: "mon,tue,wed,thu,fri,sat" })
  business_days!: string;

  @Column({ type: "varchar", length: 50, default: "America/Sao_Paulo" })
  timezone!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
