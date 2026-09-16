import { parseCloudApiWebhook } from "./cloud-api.payload";

/**
 * O parser do webhook é o pedaço do Épico 6 em que "nem todo evento é mensagem"
 * (DL-080, item d) deixa de ser aviso e vira código. Todo teste aqui é sobre a
 * mesma promessa: **nada que a Meta mande pode derrubar nada**.
 */

const NUMERO = "111222333";

function envelope(valor: unknown, field = "messages"): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA1", changes: [{ field, value: valor }] }],
  };
}

function valorComMensagem(extra: Record<string, unknown> = {}): unknown {
  return {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5511942458672", phone_number_id: NUMERO },
    contacts: [{ profile: { name: "Ana" }, wa_id: "5511999990000" }],
    messages: [
      {
        from: "5511999990000",
        id: "wamid.AAA",
        timestamp: "1757000000",
        type: "text",
        text: { body: "oi" },
      },
    ],
    ...extra,
  };
}

describe("parseCloudApiWebhook — mensagens", () => {
  it("lê texto, remetente, nome do perfil e identificador", () => {
    const eventos = parseCloudApiWebhook(envelope(valorComMensagem()));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      kind: "message",
      phoneNumberId: NUMERO,
      providerMessageId: "wamid.AAA",
      from: "5511999990000",
      contactName: "Ana",
      tipo: "text",
      text: "oi",
    });
  });

  it("timestamp da Meta vem em SEGUNDOS e vira Date", () => {
    const [evento] = parseCloudApiWebhook(envelope(valorComMensagem()));
    expect(evento.kind).toBe("message");
    if (evento.kind !== "message") return;
    expect(evento.timestamp.toISOString()).toBe("2025-09-04T15:33:20.000Z");
  });

  it("timestamp ausente ou torto não derruba o evento — vira 'agora'", () => {
    const bruto = JSON.parse(
      JSON.stringify(valorComMensagem()),
    ) as Record<string, unknown>;
    (bruto.messages as Record<string, unknown>[])[0].timestamp = "abacaxi";
    const [evento] = parseCloudApiWebhook(envelope(bruto));
    expect(evento.kind).toBe("message");
    if (evento.kind !== "message") return;
    expect(evento.timestamp.getTime()).toBeGreaterThan(0);
  });

  it("mensagem que não é texto chega com o TIPO e texto vazio", () => {
    const bruto = JSON.parse(JSON.stringify(valorComMensagem())) as Record<
      string,
      unknown
    >;
    const mensagens = bruto.messages as Record<string, unknown>[];
    mensagens[0].type = "audio";
    delete mensagens[0].text;
    const [evento] = parseCloudApiWebhook(envelope(bruto));
    // A cliente manda áudio no primeiro dia. Quem trata precisa poder dizer
    // "ainda não entendo isso" em vez de receber `undefined` e quebrar.
    expect(evento).toMatchObject({ kind: "message", tipo: "audio", text: "" });
  });

  it("UM POST com VÁRIAS mudanças e várias mensagens devolve todas", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA1",
          changes: [
            { field: "messages", value: valorComMensagem() },
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: NUMERO },
                messages: [
                  { from: "5521", id: "wamid.BBB", type: "text", text: { body: "dois" } },
                  { from: "5531", id: "wamid.CCC", type: "text", text: { body: "três" } },
                ],
              },
            },
          ],
        },
      ],
    };
    // Tratar só `entry[0].changes[0]` perderia duas mensagens — e perderia
    // exatamente em pico, que é quando a Meta agrupa.
    expect(parseCloudApiWebhook(payload)).toHaveLength(3);
  });
});

describe("parseCloudApiWebhook — o que NÃO é mensagem", () => {
  it("status de entrega vira evento de status, não de mensagem", () => {
    const eventos = parseCloudApiWebhook(
      envelope({
        metadata: { phone_number_id: NUMERO },
        statuses: [
          {
            id: "wamid.SAIDA",
            status: "delivered",
            timestamp: "1757000000",
            recipient_id: "5511999990000",
          },
        ],
      }),
    );
    expect(eventos).toEqual([
      expect.objectContaining({
        kind: "status",
        providerMessageId: "wamid.SAIDA",
        status: "delivered",
      }),
    ]);
  });

  it("mensagem E status no MESMO envio saem separados", () => {
    const eventos = parseCloudApiWebhook(
      envelope(
        valorComMensagem({
          statuses: [{ id: "wamid.SAIDA", status: "read", timestamp: "1757000000" }],
        }),
      ),
    );
    expect(eventos.map((e) => e.kind)).toEqual(["message", "status"]);
  });

  it("campo que não é `messages` (evento de conta, eco da coexistência) é ignorado", () => {
    const eventos = parseCloudApiWebhook(
      envelope({ metadata: { phone_number_id: NUMERO } }, "message_template_status_update"),
    );
    expect(eventos[0].kind).toBe("desconhecido");
  });

  it("erro reportado pela Meta não vira exceção nossa", () => {
    const eventos = parseCloudApiWebhook(
      envelope({
        metadata: { phone_number_id: NUMERO },
        errors: [{ code: 131000, title: "Something went wrong" }],
      }),
    );
    expect(eventos[0]).toMatchObject({ kind: "desconhecido" });
  });
});

describe("parseCloudApiWebhook — payload torto NUNCA lança", () => {
  // A Meta acrescenta campo e tipo de evento sem avisar. Um parser que lança
  // diante de uma novidade transforma a novidade numa queda do canal de TODOS.
  it.each([
    ["null", null],
    ["string", "oi"],
    ["número", 42],
    ["objeto vazio", {}],
    ["entry não é lista", { object: "whatsapp_business_account", entry: "x" }],
    ["changes vazio", { object: "whatsapp_business_account", entry: [{ changes: [] }] }],
  ])("%s devolve evento desconhecido em vez de exceção", (_nome, payload) => {
    const eventos = parseCloudApiWebhook(payload);
    expect(eventos.every((e) => e.kind === "desconhecido")).toBe(true);
  });

  it("assinatura de webhook que não é nossa é ignorada", () => {
    const eventos = parseCloudApiWebhook({ object: "instagram", entry: [] });
    expect(eventos[0]).toMatchObject({ kind: "desconhecido" });
  });

  it("evento sem phone_number_id não tem como ser roteado — e diz isso", () => {
    const eventos = parseCloudApiWebhook(
      envelope({ messages: [{ from: "55", id: "wamid.X", type: "text" }] }),
    );
    expect(eventos[0]).toMatchObject({
      kind: "desconhecido",
      descricao: expect.stringContaining("phone_number_id"),
    });
  });

  it("mensagem sem id ou sem remetente não vira mensagem", () => {
    const eventos = parseCloudApiWebhook(
      envelope({
        metadata: { phone_number_id: NUMERO },
        messages: [{ type: "text", text: { body: "sem id" } }],
      }),
    );
    expect(eventos[0].kind).toBe("desconhecido");
  });
});
