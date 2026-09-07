import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import type { CapabilityKey } from "../../common/capabilities/capability";

/**
 * Lista de recursos liberados POR EMPRESA (DL-072, Story 6.11).
 *
 * É uma LISTA, e não um campo por recurso na `companies`, exatamente para que
 * recurso novo seja **linha, não migration**. A coluna `capability` é `varchar`
 * (não enum) pelo mesmo motivo — enum obrigaria `ALTER TABLE` a cada venda nova.
 *
 * LINHA PRESENTE = DIREITO ATIVO. Revogar é apagar a linha; não há flag de
 * "desligado" aqui, senão voltaríamos ao modelo de campo por recurso que o
 * DL-072 existe para impedir. A PREFERÊNCIA do dono (o USO) é campo separado,
 * em outra tabela (Story 6.17) — revogar o direito NÃO apaga a preferência que
 * ele escolheu, e desligar a preferência NÃO revoga o direito.
 */
@Entity({ name: "company_capabilities" })
@Unique("uq_company_capability", ["company_id", "capability"])
@Index("idx_company_capabilities_company", ["company_id"])
export class CompanyCapability {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  @Column({ type: "varchar", length: 50 })
  capability!: CapabilityKey;

  @CreateDateColumn({ type: "timestamp" })
  granted_at!: Date;

  /**
   * Rastro de COMO o direito foi concedido — o AC pede "quando/por quem".
   * Texto livre de propósito, porque a origem varia: `preset:pro` (contratação),
   * `avulso` (venda de um recurso só), `cortesia` (liberado sem cobrar) ou
   * `migration:preserva-acesso-atual`. É registro de auditoria comercial —
   * NUNCA é lido para decidir acesso (quem decide é a existência da linha).
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  granted_by!: string | null;
}
