import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CompanyCapability } from "../../database/entities/company-capability.entity";
import {
  isCapabilityKey,
  type CapabilityKey,
} from "../../common/capabilities/capability";
import { capabilitiesForPlan } from "./capability-presets";

/**
 * Leitura e concessão de CAPABILITIES por empresa (DL-072, Story 6.11).
 *
 * REGRA DE OURO desta classe: **a decisão de acesso lê a LINHA FRESCA do banco,
 * nunca o token** — mesma razão do DL-062. Cortar um cliente não pode esperar o
 * access token dele expirar; o operador revoga e a requisição seguinte já cai
 * no 403.
 *
 * Por isso não há cache aqui. O custo é uma query indexada por
 * (`company_id`) nas rotas gateadas — barato perto de "cliente cortado continua
 * usando por 15 minutos".
 *
 * Todos os métodos recebem `companyId` EXPLÍCITO de propósito: as camadas 2 e 3
 * do DL-072 compartilham este serviço, e a camada 3 (webhook chamado pela Meta,
 * agendador rodando sozinho) não tem contexto de request para carregar tenant.
 */
@Injectable()
export class CapabilitiesService {
  constructor(
    // Repositório CRU (sem `TenantAwareRepository`) — exceção CONSCIENTE ao
    // padrão do ADR-002, pela mesma razão dos métodos *unscoped* do
    // `UsersService` (DL-026): este serviço é usado TAMBÉM fora de request
    // (camada 3 do DL-072 — webhook chamado pela Meta, agendador rodando
    // sozinho), onde não existe `TenantContext` para o repositório ler.
    //
    // O escopo é garantido pela ASSINATURA, não pelo AsyncLocalStorage: todo
    // método exige `companyId` como primeiro parâmetro obrigatório, e o
    // compilador recusa a chamada sem ele. Envolver isto num
    // `TenantAwareRepository` obrigaria a manter DOIS caminhos de leitura — um
    // por contexto e outro explícito — para a mesma tabela, que é justamente
    // como se esquece de gatear um deles.
    @InjectRepository(CompanyCapability)
    private readonly repo: Repository<CompanyCapability>,
  ) {}

  /**
   * Capabilities ATIVAS da empresa, lidas da linha fresca. Usado pela camada 2
   * (guard), pela camada 3 (webhook/agendador) e pela exposição ao front.
   */
  async listForCompany(companyId: string): Promise<CapabilityKey[]> {
    const rows = await this.repo.find({
      where: { company_id: companyId },
      select: { capability: true },
    });
    // Chave desconhecida no banco (recurso removido do produto, dado manual
    // torto) não vira acesso: só passa o que o código sabe gatear.
    return rows.map((row) => row.capability).filter(isCapabilityKey);
  }

  /** A empresa TEM o direito? Linha fresca, sempre. */
  async hasCapability(
    companyId: string,
    capability: CapabilityKey,
  ): Promise<boolean> {
    const found = await this.repo.count({
      where: { company_id: companyId, capability },
    });
    return found > 0;
  }

  /**
   * Concede capabilities avulsas (venda de um recurso só, cortesia). Idempotente:
   * conceder de novo não duplica nem reescreve `granted_at` — o direito já é dele.
   */
  async grant(
    companyId: string,
    capabilities: readonly CapabilityKey[],
    grantedBy: string,
  ): Promise<void> {
    if (capabilities.length === 0) {
      return;
    }
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(CompanyCapability)
      .values(
        capabilities.map((capability) => ({
          company_id: companyId,
          capability,
          granted_by: grantedBy,
        })),
      )
      // A UNIQUE (company_id, capability) é a garantia; o IGNORE só evita que
      // uma reconcessão vire erro.
      .orIgnore()
      .execute();
  }

  /** Revoga o DIREITO. Não toca em preferência do dono (campo separado — 6.17). */
  async revoke(
    companyId: string,
    capabilities: readonly CapabilityKey[],
  ): Promise<void> {
    if (capabilities.length === 0) {
      return;
    }
    await this.repo.delete({
      company_id: companyId,
      capability: In([...capabilities]),
    });
  }

  /**
   * Aplica o PLANO como PRESET (DL-072): traduz o que foi vendido em linhas de
   * capability, UMA VEZ, no ato da contratação. Depois disso o nome do plano não
   * é mais consultado por ninguém.
   *
   * ADITIVO de propósito: não revoga o que a empresa já tem. Quem comprou um
   * recurso avulso ou ganhou cortesia não perde isso ao ter o plano aplicado de
   * novo. Este é o caminho da CONTRATAÇÃO (Story 1.9), onde a empresa nasce e
   * não há o que perder; a TROCA de plano de uma empresa existente é
   * `setForCompany` (Story 6.16), que precisa poder DESCER.
   */
  async applyPlanPreset(companyId: string, plan: string): Promise<void> {
    await this.grant(companyId, capabilitiesForPlan(plan), `preset:${plan}`);
  }

  /**
   * DEFINE o conjunto EXATO de capabilities da empresa (Story 6.16).
   *
   * É o único método que REBAIXA, e é declarativo de propósito: o chamador diz
   * o estado final, não a operação. `grant`/`revoke` isolados obrigariam quem
   * troca o plano a calcular o diff — e é exatamente aí que se esquece o lado de
   * DESCER, entregando um sistema que só sabe subir.
   *
   * O que ele faz, nesta ordem: revoga o que sobra, concede o que falta, e
   * devolve o antes/depois para o registro de auditoria. Quem já tinha o direito
   * NÃO tem a linha reescrita — `granted_at` continua sendo a data em que o
   * direito passou a valer, não a da última chamada deste método.
   *
   * O CORTE É IMEDIATO em todas as camadas, e sem nada além disto: a camada 2
   * (`CapabilityGuard`) e a camada 3 (webhook/agendador) leem a LINHA FRESCA a
   * cada decisão, sem cache (ver a nota de topo desta classe), e a camada 1
   * converge no polling do `/users/me` (DL-062). Apagar a linha aqui é o corte.
   *
   * O QUE ESTE MÉTODO NÃO TOCA — e o teste
   * `test/platform-plan.e2e-spec.ts` prova por snapshot de TODAS as tabelas:
   * - **credenciais de conexão** (Story 6.1): rebaixar desliga o USO, não destrói
   *   o vínculo. Refazer a conexão com a Meta (conta, verificação, aprovação) é a
   *   parte cara e confusa para o dono — quem atrasa um mês e volta não pode ter
   *   de refazer aquilo, ou desiste no caminho;
   * - **preferências do dono** (Story 6.17): campo separado por desenho (DL-072)
   *   — revogar o DIREITO não apaga o USO que ele escolheu;
   * - **tarefas já enfileiradas** (Stories 6.2/6.10): ver DL-082 — quem checa é o
   *   executor no disparo, que a camada 3 já obriga a consultar a linha fresca.
   *
   * SEM TRANSAÇÃO, e conscientemente: revogar vem ANTES de conceder, então uma
   * falha no meio deixa a empresa com MENOS direito, nunca com mais — o lado
   * seguro. O operador vê o erro (a auditoria também não é gravada) e repete;
   * a chamada é idempotente, e aplicar o mesmo estado de novo conserta.
   */
  async setForCompany(
    companyId: string,
    desired: readonly CapabilityKey[],
    grantedBy: string,
  ): Promise<{ before: CapabilityKey[]; after: CapabilityKey[] }> {
    const before = await this.listForCompany(companyId);
    // Desduplica a entrada: pedir a mesma chave duas vezes é erro de digitação
    // do operador, não uma ordem diferente.
    const target = [...new Set(desired)];

    const toRevoke = before.filter((key) => !target.includes(key));
    const toGrant = target.filter((key) => !before.includes(key));

    await this.revoke(companyId, toRevoke);
    await this.grant(companyId, toGrant, grantedBy);

    return { before, after: await this.listForCompany(companyId) };
  }
}
