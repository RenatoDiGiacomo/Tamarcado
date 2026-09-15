import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { CAPABILITY_KEYS } from "../../../common/capabilities/capability";
import { PLAN_NAMES } from "../../capabilities/capability-presets";

/**
 * Troca do que uma empresa EXISTENTE pode usar (Story 6.16, DL-076).
 *
 * DOIS CAMINHOS, EXATAMENTE UM POR CHAMADA:
 *
 * | corpo             | efeito                                               |
 * |-------------------|------------------------------------------------------|
 * | `plan`            | aplica o PRESET do plano como estado final, e atualiza o rótulo `companies.plan` |
 * | `capabilities`    | define a lista NA MÃO, e **não mexe no plano** |
 *
 * O segundo caminho é o que permite **venda avulsa** ("quero só o lembrete") e
 * **cortesia** sem mentir o plano da empresa (DL-072/DL-076). Se ele também
 * mexesse no rótulo, a empresa apareceria como "pró" no histórico comercial sem
 * ter comprado o pró — que é a mentira que o campo separado existe para evitar.
 *
 * OS DOIS JUNTOS SÃO RECUSADOS, e isso não é preciosismo: `plan: "pro"` +
 * `capabilities: []` são duas ordens contraditórias, e qualquer regra de
 * precedência que inventássemos seria invisível para quem digita o corpo.
 *
 * ⚠️ **A LISTA É O ESTADO FINAL, NÃO UM ACRÉSCIMO.** `capabilities: []` REVOGA
 * tudo. É o desenho certo — sem ele não existe caminho para DESCER —, mas é
 * também o corpo mais fácil de mandar por engano, então está dito aqui e no
 * Swagger.
 *
 * ⚠️ **VALIDAÇÃO ESTRITA — a armadilha do `whitelist`.** O `ValidationPipe`
 * global roda com `whitelist: true`: campo com nome errado é **descartado em
 * silêncio**. Num endpoint que só CONCEDE isso seria chato; aqui seria grave —
 * `capabilies: ["whatsapp_bot"]` (com o typo) viraria um corpo sem lista, e um
 * corpo sem lista com `plan` ausente vira `400`… mas `plan: "pro"` +
 * `capabilies: [...]` aplicaria o preset silenciosamente. Por isso a lista
 * rejeita chave desconhecida em vez de ignorá-la: o operador precisa ler
 * "ativei e não funcionou" **na resposta**, não descobrir pelo cliente reclamando.
 */
export class UpdateCompanyPlanDto {
  /**
   * PRESET a aplicar. Validação de ENTRADA (recusar um plano que não vendemos),
   * nunca decisão de acesso — a tradução para capabilities acontece uma vez, em
   * `capability-presets.ts`.
   */
  @IsOptional()
  @IsString()
  @IsIn([...PLAN_NAMES], {
    message: `plan desconhecido. Planos válidos: ${PLAN_NAMES.join(", ")}.`,
  })
  plan?: string;

  /**
   * Estado final da lista de capabilities. Vazio = corta tudo.
   *
   * A checagem é por INCLUSÃO (todo item precisa estar em `CAPABILITY_KEYS`), e
   * não por uma lista de proibidos — o conjunto de chaves erradas é infinito, e
   * é justamente o typo que ninguém previu que precisa falhar alto.
   */
  @IsOptional()
  @IsArray()
  @IsIn([...CAPABILITY_KEYS], {
    each: true,
    message: `capability desconhecida. Chaves válidas: ${CAPABILITY_KEYS.join(", ")}.`,
  })
  capabilities?: string[];

  /**
   * QUEM está fazendo isto. Obrigatório — "Plano aplicado sem registro de quem
   * fez" é a falha que esta story existe para impedir.
   *
   * A `x-platform-key` é única e compartilhada: ela prova que alguém COM A CHAVE
   * agiu, nunca quem. O nome é declarado aqui e sustentado pelo IP registrado
   * junto. Não é autenticação, e não pretende ser — é o rastro que transforma
   * "eu paguei em março" numa consulta em vez de uma discussão.
   */
  // O `trim` ANTES da validação é o que impede `"   "` de virar um registro de
  // auditoria assinado por ninguém — `IsNotEmpty` sozinho aceita espaços.
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: "changedBy é obrigatório: registre quem está ativando." })
  @MaxLength(100)
  changedBy!: string;

  /**
   * O PORQUÊ comercial — "pix recebido 15/09", "cortesia até o fim do mês",
   * "inadimplente desde agosto". Opcional, e é o campo que de fato resolve uma
   * divergência meses depois: o "o que mudou" as outras colunas já contam.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  reason?: string;
}
