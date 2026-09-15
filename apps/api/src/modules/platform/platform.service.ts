import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { CompanyPlanChange } from "../../database/entities/company-plan-change.entity";
import { UsersService } from "../users/users.service";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import {
  capabilitiesForPlan,
  DEFAULT_PLAN,
} from "../capabilities/capability-presets";
import type { CapabilityKey } from "../../common/capabilities/capability";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { PasswordResetRequestDto } from "./dto/password-reset-request.dto";
import { UpdateCompanyPlanDto } from "./dto/update-company-plan.dto";

export interface ProvisionResult {
  slug: string;
  painelUrl: string;
  publicUrl: string;
  inviteUrl: string;
}

export interface PasswordResetResult {
  resetUrl: string;
}

/**
 * O que o operador vê de volta ao trocar o plano (Story 6.16). Devolve o
 * ANTES e o DEPOIS, não um "ok": quem acabou de cortar um cliente precisa ler na
 * resposta o que de fato saiu — é a diferença entre conferir e torcer.
 */
export interface PlanChangeResult {
  slug: string;
  planBefore: string | null;
  planAfter: string | null;
  capabilitiesBefore: CapabilityKey[];
  capabilitiesAfter: CapabilityKey[];
  granted: CapabilityKey[];
  revoked: CapabilityKey[];
}

/**
 * Provisionamento de estabelecimento (Story 1.9), PRÉ-TENANT. Cria a company e
 * o convite do `owner` (reusando o fluxo de `user_invites` — o mesmo do
 * `POST /users/invite`). NÃO cria serviços/horários/dados de exemplo e NÃO
 * define senha (o dono define pelo link de aceite).
 *
 * A Story 6.16 acrescenta `changePlan` — a TROCA do que uma empresa existente
 * pode usar. A superfície segue pequena de propósito: criar a empresa, mudar o
 * que ela contratou e gerar link de senha. Não lista, não edita dado do salão,
 * não apaga.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    // Auditoria comercial da Story 6.16 — escrita apendada, nunca lida para
    // decidir acesso (quem decide é `company_capabilities`, DL-072).
    @InjectRepository(CompanyPlanChange)
    private readonly planChanges: Repository<CompanyPlanChange>,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    // Story 6.11 (DL-072): a contratação é o momento em que o PLANO vira LISTA.
    private readonly capabilities: CapabilitiesService,
  ) {}

  /**
   * TROCA o que uma empresa existente pode usar (Story 6.16, DL-076) — nos dois
   * sentidos, e o sentido difícil é o de DESCER.
   *
   * SUBIR é o caso fácil: concede, e o dono vê no próximo ciclo do polling.
   * DESCER precisa cortar em todas as camadas ao mesmo tempo, e o que faz isso
   * acontecer é NÃO haver caminho paralelo: a camada 2 (`CapabilityGuard`) e a
   * camada 3 (webhook/agendador, Stories 6.20/6.2) consultam a linha fresca a
   * cada decisão, e a camada 1 converge no polling do `/users/me`. Apagar a
   * linha é o corte — não existe "avisar as camadas".
   *
   * O QUE O REBAIXAMENTO PRESERVA (e por quê): as **credenciais de conexão** com
   * a Meta (Story 6.1). Rebaixar desliga o USO, não destrói o vínculo — conta
   * Meta, verificação e aprovação são a parte cara e confusa para o dono, e
   * obrigá-lo a refazer tudo por um mês de atraso é o atrito que faz ele
   * desistir em vez de voltar. Este método só escreve em `company_capabilities`,
   * `companies.plan` e no registro de auditoria; o e2e prova isso por SNAPSHOT
   * de todas as tabelas, então a garantia vale para a tabela de credenciais no
   * dia em que a 6.1 a criar, sem ninguém precisar lembrar de voltar aqui.
   *
   * O DESTINO DA FILA (DL-082): tarefas já agendadas NÃO são canceladas nem
   * apagadas. Quem decide é o executor, no disparo, lendo a linha fresca.
   */
  async changePlan(
    slug: string,
    dto: UpdateCompanyPlanDto,
    ip: string,
  ): Promise<PlanChangeResult> {
    // EXATAMENTE UM dos dois caminhos. `plan` + `capabilities` juntos são duas
    // ordens contraditórias, e nenhum dos dois é uma opção "esquecível": um
    // corpo sem os dois não diz o que a empresa passa a ter.
    const byPlan = dto.plan !== undefined;
    const byList = dto.capabilities !== undefined;
    if (byPlan === byList) {
      throw new BadRequestException(
        byPlan
          ? "Envie plan OU capabilities, não os dois: são ordens contraditórias."
          : "Envie plan (preset) ou capabilities (lista explícita).",
      );
    }

    const company = await this.companies.findOne({ where: { slug } });
    if (!company) {
      throw new NotFoundException("Estabelecimento não encontrado.");
    }

    // O PLANO é só um PRESET (DL-072): ele é TRADUZIDO em lista aqui e não volta
    // a ser consultado. Daqui para baixo, só existe lista.
    const desired: readonly CapabilityKey[] = byPlan
      ? capabilitiesForPlan(dto.plan as string)
      : (dto.capabilities as CapabilityKey[]);

    const planBefore = company.plan;
    const { before, after } = await this.capabilities.setForCompany(
      company.id,
      desired,
      dto.changedBy,
    );

    // O rótulo comercial só muda no caminho do PRESET. Pela LISTA ele fica como
    // está — é o que permite dar cortesia sem registrar uma venda que não houve.
    if (byPlan && dto.plan !== planBefore) {
      await this.companies.update(company.id, { plan: dto.plan });
    }
    const planAfter = byPlan ? (dto.plan as string) : planBefore;

    const granted = after.filter((key) => !before.includes(key));
    const revoked = before.filter((key) => !after.includes(key));

    // 1) Registro PERSISTENTE — sobrevive à rotação de log do PM2, que é o que
    //    uma divergência comercial meses depois exige.
    await this.planChanges.save(
      this.planChanges.create({
        company_id: company.id,
        plan_before: planBefore,
        plan_after: planAfter,
        capabilities_before: before,
        capabilities_after: after,
        changed_by: dto.changedBy,
        // Trim vazio vira NULL, não "": coluna opcional sem motivo declarado.
        reason: dto.reason || null,
        ip,
      }),
    );

    // 2) Linha de log, mesmo padrão da 1.9.01 — é o que se acompanha no momento
    //    da operação, quando ninguém vai abrir o banco para conferir.
    this.logger.log(
      `plan changed: company=${company.slug} plan=${planBefore}->${planAfter} ` +
        `capabilities=[${before.join(",")}]->[${after.join(",")}] ` +
        `by=${dto.changedBy} ip=${ip} at=${new Date().toISOString()}` +
        (dto.reason ? ` reason=${dto.reason}` : ""),
    );

    return {
      slug: company.slug,
      planBefore,
      planAfter,
      capabilitiesBefore: before,
      capabilitiesAfter: after,
      granted,
      revoked,
    };
  }

  /**
   * Gera um link de REDEFINIÇÃO de senha (1.9.01) para um usuário existente. O
   * operador dispara pelo Insomnia (protegido por `x-platform-key`) e repassa o
   * link ao dono, que define a própria senha — o operador NUNCA sabe a senha.
   * Link de uso único, expira em 1h; gerar um novo invalida o anterior.
   *
   * O mesmo token serve para a recuperação por E-MAIL futura — muda só o canal
   * de entrega (hoje devolvemos o link; amanhã um serviço de e-mail o envia).
   */
  async resetPassword(
    dto: PasswordResetRequestDto,
    ip: string,
  ): Promise<PasswordResetResult> {
    const company = await this.companies.findOne({ where: { slug: dto.slug } });
    if (!company) {
      throw new NotFoundException("Estabelecimento não encontrado.");
    }
    const user = await this.users.findByCompanyAndEmail(company.id, dto.email);
    if (!user) {
      throw new NotFoundException("Usuário não encontrado nesta empresa.");
    }

    const { link } = await this.users.createPasswordReset(company.id, user);
    // Auditoria de GERAÇÃO: quem (usuário-alvo), qual empresa, de onde, quando.
    this.logger.log(
      `password-reset generated: user=${user.id} email=${user.email} company=${company.slug} ip=${ip} at=${new Date().toISOString()}`,
    );
    return { resetUrl: link };
  }

  async provision(dto: CreateCompanyDto): Promise<ProvisionResult> {
    // O slug é a URL pública e o identificador de login — imutável na prática.
    const existing = await this.companies.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException("Slug já está em uso");
    }

    const plan = dto.plan ?? DEFAULT_PLAN;
    const company = await this.companies.save(
      this.companies.create({ name: dto.name, slug: dto.slug, plan }),
    );

    // O PLANO como PRESET (DL-072, Story 6.11): traduz o que foi vendido em
    // linhas de `company_capabilities`, UMA VEZ, aqui. Depois disso quem manda é
    // a capability — `companies.plan` fica só como rótulo comercial/histórico.
    // Mudar o que uma empresa já contratada pode usar é a Story 6.16, não isto.
    await this.capabilities.applyPlanPreset(company.id, plan);

    // Convite do owner (auto-login no aceite define a senha). invited_by = null:
    // provisionamento de plataforma, sem usuário que convida.
    const { link: inviteUrl } = await this.users.createInviteForCompany(
      company.id,
      {
        name: dto.ownerName,
        email: dto.ownerEmail,
        access_level: "owner",
        attends_clients: true,
      },
      null,
    );

    const base = this.config.get<string>(
      "WEB_BASE_URL",
      "http://localhost:5173",
    );
    return {
      slug: company.slug,
      // URL ÚNICA do painel (DL-052): o dono entra pelo e-mail; o backend
      // resolve o tenant. Não há mais slug na rota do painel. O slug segue só
      // no publicUrl (/agendar/{slug}), que é o endereço da cliente final.
      painelUrl: `${base}/login`,
      publicUrl: `${base}/agendar/${company.slug}`,
      inviteUrl,
    };
  }
}
