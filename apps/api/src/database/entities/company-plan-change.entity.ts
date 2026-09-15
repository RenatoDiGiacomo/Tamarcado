import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { CapabilityKey } from "../../common/capabilities/capability";

/**
 * REGISTRO DE AUDITORIA das mudanças de plano/capabilities (Story 6.16, DL-076).
 *
 * POR QUE UMA TABELA, e não só a linha de log que o DL-076 pede:
 *
 * O DL-076 diz "auditar em log, mesmo padrão da 1.9.01" — e o log continua sendo
 * emitido, porque é ele que serve para acompanhar a operação no momento. Mas o
 * que está sendo registrado aqui é **o que o cliente contratou e o que ele
 * pagou**. Log de stdout é rotacionado pelo PM2 e some; uma divergência
 * comercial ("eu paguei o Pró em março", "não recebi") aparece SEMANAS depois, e
 * aí a única resposta possível seria a palavra de um contra a do outro.
 *
 * As duas coisas que a tabela `company_capabilities` sozinha NÃO responde:
 * 1. **O corte.** Revogar é APAGAR a linha (por desenho — DL-072). Sem esta
 *    tabela, um rebaixamento não deixa rastro nenhum: some e pronto.
 * 2. **O histórico.** `granted_at`/`granted_by` contam só o estado ATUAL; a
 *    sequência (básico → pró → básico → pró) não existe em lugar nenhum.
 *
 * É tabela de ESCRITA APENDADA: nunca atualizada, nunca apagada em operação
 * normal. E NÃO é lida para decidir acesso — quem decide isso é, sempre, a
 * existência da linha em `company_capabilities` (DL-072).
 *
 * NÃO é tenant-aware de propósito: o endpoint que a escreve é PRÉ-TENANT
 * (`x-platform-key`, DL-027) e roda sem `TenantContext` — o `company_id` vem
 * explícito, do alvo resolvido pelo slug.
 */
@Entity({ name: "company_plan_changes" })
// A consulta real é "o histórico DESTA empresa, do mais novo para o mais
// velho" — atendida por este índice sem varrer a tabela.
@Index("idx_company_plan_changes_company", ["company_id", "created_at"])
export class CompanyPlanChange {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  /**
   * Rótulo comercial ANTES e DEPOIS. Ficam nulos quando a mudança foi por LISTA
   * de capabilities (venda avulsa/cortesia), que de propósito não mexe no plano
   * — é justamente o caminho que permite conceder um recurso **sem mentir o
   * plano da empresa** (DL-072/DL-076).
   */
  @Column({ type: "varchar", length: 20, nullable: true })
  plan_before!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  plan_after!: string | null;

  /**
   * Estado COMPLETO das capabilities antes e depois, não o diff. Guardar o
   * estado é o que permite reconstruir "o que ele tinha em tal data" mesmo que
   * o conteúdo de um preset mude depois; o diff se calcula a partir daqui, o
   * contrário não é verdade.
   */
  @Column({ type: "json" })
  capabilities_before!: CapabilityKey[];

  @Column({ type: "json" })
  capabilities_after!: CapabilityKey[];

  /**
   * QUEM fez. Obrigatório, e o endpoint recusa a chamada sem isto.
   *
   * A chave de plataforma é ÚNICA e compartilhada — ela prova que "alguém com a
   * chave" agiu, nunca quem. Então o "quem" é declarado por quem chama, e o `ip`
   * abaixo é o que sustenta a declaração.
   */
  @Column({ type: "varchar", length: 100 })
  changed_by!: string;

  /**
   * O PORQUÊ comercial — "pix recebido 15/09", "cortesia até o fim do mês",
   * "inadimplente desde agosto". Opcional, mas é o campo que de fato resolve uma
   * divergência: o "o que mudou" as outras colunas já contam.
   */
  @Column({ type: "varchar", length: 255, nullable: true })
  reason!: string | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip!: string | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;
}
