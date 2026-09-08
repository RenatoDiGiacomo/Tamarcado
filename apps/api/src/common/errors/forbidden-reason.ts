import { ForbiddenException } from "@nestjs/common";
import type { CapabilityKey } from "../capabilities/capability";
import type { ModuleName } from "../decorators/require-module.decorator";

/**
 * POR QUE O 403 PRECISA DIZER O MOTIVO (Story 6.15).
 *
 * Depois da Story 6.11 existem TRÊS motivos distintos de 403 no sistema, e para
 * o usuário eles não são a mesma coisa nem de longe:
 *
 * | motivo       | quem barrou                       | o que o usuário pode fazer          |
 * |--------------|-----------------------------------|-------------------------------------|
 * | `capability` | a EMPRESA não contratou (DL-072)  | contratar — tem caminho de venda    |
 * | `module`     | a PESSOA não tem o módulo (DL-062)| falar com o dono do estabelecimento |
 * | `role`       | o PAPEL não permite (FR-I2)       | falar com o dono do estabelecimento |
 *
 * Sem esta marcação o front não tem como distinguir, e só lhe restaria adivinhar
 * pelo texto da mensagem ou pela rota — heurística que quebra no primeiro ajuste
 * de copy. Pior: tratar os três igual faria a profissional SEM PERMISSÃO receber
 * oferta de plano que ela não tem como comprar, e ela vai cobrar o dono por isso.
 *
 * O `reason` viaja no CORPO da resposta, ao lado do `message` que o Nest já
 * serializa. O front lê o campo, nunca o texto.
 */
export type ForbiddenReason = "capability" | "module" | "role";

/** Corpo de um 403 marcado. `capability`/`module` só aparecem no motivo deles. */
export interface ForbiddenBody {
  statusCode: 403;
  error: "Forbidden";
  message: string;
  reason: ForbiddenReason;
  capability?: CapabilityKey;
  module?: ModuleName;
}

/**
 * A EMPRESA não contratou o recurso (DL-072, camada 2). É o único dos três que
 * abre caminho de VENDA — o front mostra a coroa e o modal do Pró (Story 6.15).
 *
 * A `message` é neutra e SEM PREÇO de propósito: quem vende é a tela, e preço no
 * backend prenderia a decisão comercial antes do primeiro cliente pagante
 * (DL-075). O front nem usa este texto — ele lê o `reason`.
 */
export class CapabilityRequiredException extends ForbiddenException {
  constructor(capability: CapabilityKey) {
    const body: ForbiddenBody = {
      statusCode: 403,
      error: "Forbidden",
      message: "Recurso não contratado",
      reason: "capability",
      capability,
    };
    super(body);
  }
}

/**
 * A PESSOA não tem o módulo liberado (DL-062). NÃO é venda: quem libera é o dono
 * do estabelecimento, dentro da equipe dele. Oferecer upgrade aqui seria vender
 * para quem não compra.
 */
export class ModuleAccessDeniedException extends ForbiddenException {
  constructor(module: ModuleName) {
    const body: ForbiddenBody = {
      statusCode: 403,
      error: "Forbidden",
      message: "Acesso ao módulo negado",
      reason: "module",
      module,
    };
    super(body);
  }
}

/**
 * O PAPEL não permite a ação (matriz FR-I2) — ex.: profissional tentando editar
 * a remuneração da equipe. Mesmo destino do `module` na UI (falar com o dono),
 * mas motivo diferente, e por isso marcado à parte: sem ele, este terceiro 403
 * voltaria a cair no "erro de servidor" genérico, que é o defeito que a Story
 * 6.15 existe para fechar.
 */
export class RoleAccessDeniedException extends ForbiddenException {
  constructor() {
    const body: ForbiddenBody = {
      statusCode: 403,
      error: "Forbidden",
      message: "Acesso negado para o seu nível",
      reason: "role",
    };
    super(body);
  }
}
