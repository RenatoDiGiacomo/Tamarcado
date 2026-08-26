import { ConfigService } from "@nestjs/config";
import { MailService } from "./mail.service";

/** Config falso: devolve o que estiver no mapa, senão o default do chamador. */
function config(valores: Record<string, string | undefined>): ConfigService {
  return {
    get: (chave: string, padrao?: string) => valores[chave] ?? padrao,
  } as unknown as ConfigService;
}

const email = {
  to: "dona@salao.com.br",
  subject: "Criar uma nova senha do Tamarcado",
  html: "<p>oi</p>",
  text: "oi",
};

describe("MailService", () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it("sem BREVO_API_KEY fica desligado e NÃO chama a rede", async () => {
    const chamou = jest.fn();
    global.fetch = chamou as unknown as typeof fetch;
    const service = new MailService(config({}));

    expect(service.enabled).toBe(false);
    await expect(service.send(email)).resolves.toBe(false);
    expect(chamou).not.toHaveBeenCalled();
  });

  it("envia pela API do Brevo com o remetente configurado", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new MailService(
      config({
        BREVO_API_KEY: "chave-de-teste",
        MAIL_FROM: "contato@tamarcado.tec.br",
        MAIL_FROM_NAME: "Tamarcado",
      }),
    );

    await expect(service.send(email)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("chave-de-teste");
    const corpo = JSON.parse(init.body);
    expect(corpo.sender).toEqual({
      name: "Tamarcado",
      email: "contato@tamarcado.tec.br",
    });
    expect(corpo.to).toEqual([{ email: "dona@salao.com.br" }]);
    // Texto puro sempre acompanha o HTML (cliente sem HTML e filtro antispam).
    expect(corpo.textContent).toBe("oi");
  });

  it("resposta de erro do provedor NÃO lança — devolve false", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"code":"unauthorized"}',
    }) as unknown as typeof fetch;
    const service = new MailService(config({ BREVO_API_KEY: "chave-errada" }));

    await expect(service.send(email)).resolves.toBe(false);
  });

  it("falha de rede NÃO lança — devolve false", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("getaddrinfo ENOTFOUND")) as unknown as typeof fetch;
    const service = new MailService(config({ BREVO_API_KEY: "chave" }));

    // É o que garante que uma queda do provedor não derruba a requisição de
    // quem pediu o link de senha.
    await expect(service.send(email)).resolves.toBe(false);
  });
});
