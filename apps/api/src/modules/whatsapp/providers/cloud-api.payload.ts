/**
 * Tradução do payload do webhook da **Cloud API** para eventos nossos
 * (Story 6.1). Arquivo de FUNÇÕES PURAS, sem injeção e sem banco: é o pedaço
 * mais fácil de errar do épico e o mais barato de testar isolado.
 *
 * TRÊS FATOS DO FORMATO DA META QUE O CÓDIGO PRECISA RESPEITAR (DL-080, item d):
 *
 * 1. **UM POST TRAZ VÁRIOS EVENTOS.** `entry[]` × `changes[]` × (`messages[]` +
 *    `statuses[]`). Tratar só `entry[0].changes[0]` perde mensagem em pico — que
 *    é exatamente quando doeria.
 * 2. **NEM TODO EVENTO É MENSAGEM.** Chegam status de entrega (enviado/entregue/
 *    lido/falhou), eventos de conta e, na coexistência (DL-074), o **eco** do
 *    que o próprio dono manda pelo celular. Nada disso pode derrubar nada.
 * 3. **O QUE NÃO CONHECEMOS VIRA `desconhecido`, NÃO EXCEÇÃO.** A Meta
 *    acrescenta campo e tipo de evento sem avisar. Um `parse` que lança diante de
 *    um campo novo transforma uma novidade da Meta numa queda do canal de todos
 *    os tenants.
 *
 * Por isso a leitura é toda por acesso defensivo a `unknown` — nada aqui confia
 * no formato, nem para dizer que ele está errado.
 */

/** Um evento já isolado do payload, com o número a que ele pertence. */
export type CloudApiEvent =
  | {
      kind: "message";
      /** Identificador do NÚMERO que recebeu — é por ele que o tenant é achado. */
      phoneNumberId: string;
      providerMessageId: string;
      from: string;
      contactName?: string;
      tipo: string;
      text: string;
      timestamp: Date;
    }
  | {
      kind: "status";
      phoneNumberId: string;
      /** `wamid` da mensagem NOSSA cujo estado mudou. */
      providerMessageId: string;
      /** `sent` | `delivered` | `read` | `failed`. */
      status: string;
      timestamp: Date;
    }
  | {
      kind: "desconhecido";
      /** Pode faltar: nem todo evento traz `metadata`. */
      phoneNumberId?: string;
      /** O que deu para entender. Vai para log, nunca para o handler. */
      descricao: string;
    };

function obj(valor: unknown): Record<string, unknown> | undefined {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : undefined;
}

function arr(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function str(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

/**
 * `timestamp` da Meta vem em SEGUNDOS, como string. Valor ausente ou ilegível
 * vira "agora" — a hora exata de um evento nunca vale derrubar o evento.
 */
function instante(valor: unknown): Date {
  const segundos = Number(valor);
  if (!Number.isFinite(segundos) || segundos <= 0) {
    return new Date();
  }
  return new Date(segundos * 1000);
}

/**
 * Extrai o texto de uma mensagem. Só `text` tem corpo legível nesta story;
 * `button` e `interactive` chegam na 6.2/6.3 e por ora caem em texto vazio,
 * que é a forma honesta de dizer "recebi, não sei ler".
 */
function textoDaMensagem(mensagem: Record<string, unknown>): string {
  const tipo = str(mensagem.tipo ?? mensagem.type) ?? "";
  if (tipo === "text") {
    return str(obj(mensagem.text)?.body) ?? "";
  }
  return "";
}

/**
 * Quebra o payload inteiro em eventos. **Nunca lança.** Payload irreconhecível
 * devolve um único `desconhecido` — o webhook responde 200 e o log conta o que
 * chegou.
 */
export function parseCloudApiWebhook(payload: unknown): CloudApiEvent[] {
  const raiz = obj(payload);
  if (!raiz) {
    return [{ kind: "desconhecido", descricao: "payload não é um objeto" }];
  }
  // `object` identifica a assinatura do webhook. Outro valor não é erro nosso:
  // é assinatura que não pedimos, e ignorá-la é o certo.
  const assinatura = str(raiz.object);
  if (assinatura && assinatura !== "whatsapp_business_account") {
    return [
      {
        kind: "desconhecido",
        descricao: `assinatura de webhook não tratada: ${assinatura}`,
      },
    ];
  }

  const eventos: CloudApiEvent[] = [];
  for (const entrada of arr(raiz.entry)) {
    for (const mudanca of arr(obj(entrada)?.changes)) {
      const campo = str(obj(mudanca)?.field);
      const valor = obj(obj(mudanca)?.value);
      const phoneNumberId = str(obj(valor?.metadata)?.phone_number_id);

      // `field` diferente de `messages` são eventos de CONTA (qualidade do
      // número, aprovação de modelo, limite alterado). Chegam no mesmo webhook,
      // não são nossos nesta story, e ignorá-los é o comportamento correto.
      if (!valor || (campo && campo !== "messages")) {
        eventos.push({
          kind: "desconhecido",
          phoneNumberId,
          descricao: `evento de campo "${campo ?? "?"}" não tratado`,
        });
        continue;
      }
      if (!phoneNumberId) {
        eventos.push({
          kind: "desconhecido",
          descricao: "evento sem metadata.phone_number_id — sem como rotear",
        });
        continue;
      }

      // Nome do perfil vem numa lista separada, casada por `wa_id`.
      const nomePorWaId = new Map<string, string>();
      for (const contato of arr(valor.contacts)) {
        const c = obj(contato);
        const waId = str(c?.wa_id);
        const nome = str(obj(c?.profile)?.name);
        if (waId && nome) {
          nomePorWaId.set(waId, nome);
        }
      }

      for (const bruta of arr(valor.messages)) {
        const mensagem = obj(bruta);
        const id = str(mensagem?.id);
        const from = str(mensagem?.from);
        if (!mensagem || !id || !from) {
          eventos.push({
            kind: "desconhecido",
            phoneNumberId,
            descricao: "mensagem sem id ou sem remetente",
          });
          continue;
        }
        eventos.push({
          kind: "message",
          phoneNumberId,
          providerMessageId: id,
          from,
          contactName: nomePorWaId.get(from),
          tipo: str(mensagem.type) ?? "desconhecido",
          text: textoDaMensagem(mensagem),
          timestamp: instante(mensagem.timestamp),
        });
      }

      for (const bruto of arr(valor.statuses)) {
        const estado = obj(bruto);
        const id = str(estado?.id);
        const status = str(estado?.status);
        if (!estado || !id || !status) {
          eventos.push({
            kind: "desconhecido",
            phoneNumberId,
            descricao: "status sem id ou sem estado",
          });
          continue;
        }
        eventos.push({
          kind: "status",
          phoneNumberId,
          providerMessageId: id,
          status,
          timestamp: instante(estado.timestamp),
        });
      }

      // `errors` no nível do value: a Meta avisando que algo falhou do lado dela.
      for (const bruto of arr(valor.errors)) {
        const erro = obj(bruto);
        eventos.push({
          kind: "desconhecido",
          phoneNumberId,
          descricao: `erro reportado pela Meta: ${str(erro?.title) ?? str(erro?.message) ?? "sem título"}`,
        });
      }

      // Mudança do tipo `messages` que não trouxe nem mensagem nem status nem
      // erro: formato novo. Registrar é melhor que sumir com ele.
      if (
        arr(valor.messages).length === 0 &&
        arr(valor.statuses).length === 0 &&
        arr(valor.errors).length === 0
      ) {
        eventos.push({
          kind: "desconhecido",
          phoneNumberId,
          descricao: "mudança sem messages/statuses/errors",
        });
      }
    }
  }

  if (eventos.length === 0) {
    return [
      { kind: "desconhecido", descricao: "payload sem entry/changes utilizáveis" },
    ];
  }
  return eventos;
}
