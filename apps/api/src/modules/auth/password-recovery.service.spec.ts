import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { User } from "../../database/entities/user.entity";
import { MailService } from "../mail/mail.service";
import { UsersService } from "../users/users.service";
import { PasswordRecoveryService } from "./password-recovery.service";

function usuario(parcial: Partial<User> = {}): User {
  return {
    id: "u1",
    company_id: "c1",
    name: "Ana Souza",
    email: "ana@salao.com.br",
    is_active: true,
    ...parcial,
  } as User;
}

describe("PasswordRecoveryService", () => {
  let users: jest.Mocked<Pick<UsersService, "findActiveByEmail" | "createPasswordReset">>;
  let mail: jest.Mocked<Pick<MailService, "send">>;
  let companies: jest.Mocked<Pick<Repository<Company>, "find">>;
  let service: PasswordRecoveryService;

  beforeEach(() => {
    users = {
      findActiveByEmail: jest.fn(),
      createPasswordReset: jest.fn(),
    };
    mail = { send: jest.fn().mockResolvedValue(true) };
    companies = { find: jest.fn().mockResolvedValue([{ id: "c1", name: "Salão da Ana" }]) };
    service = new PasswordRecoveryService(
      users as unknown as UsersService,
      mail as unknown as MailService,
      companies as unknown as Repository<Company>,
    );
  });

  it("e-mail sem conta: não gera token, não envia nada e NÃO lança", async () => {
    users.findActiveByEmail.mockResolvedValue([]);

    // Quem chama responde a mesma coisa dos dois jeitos — é isso que impede o
    // endpoint de virar sonda de e-mails cadastrados.
    await expect(service.requestReset("ninguem@x.com", "1.2.3.4")).resolves.toBeUndefined();
    expect(users.createPasswordReset).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("e-mail com conta: gera o link pelo mecanismo da 1.9.01 e envia", async () => {
    users.findActiveByEmail.mockResolvedValue([usuario()]);
    users.createPasswordReset.mockResolvedValue({
      link: "https://app.tamarcado.tec.br/definir-senha?token=abc",
      token: "abc",
    });

    await service.requestReset("ANA@salao.com.br ", "1.2.3.4");

    // E-mail normalizado antes da busca (veio com maiúsculas e espaço).
    expect(users.findActiveByEmail).toHaveBeenCalledWith("ana@salao.com.br");
    expect(users.createPasswordReset).toHaveBeenCalledWith("c1", expect.objectContaining({ id: "u1" }));

    const enviado = mail.send.mock.calls[0][0];
    expect(enviado.to).toBe("ana@salao.com.br");
    expect(enviado.html).toContain("Salão da Ana");
    expect(enviado.html).toContain("definir-senha?token=abc");
    expect(enviado.text).toContain("1 hora");
  });

  it("mesmo e-mail em duas empresas: um e-mail por conta, cada um com o nome certo", async () => {
    users.findActiveByEmail.mockResolvedValue([
      usuario({ id: "u1", company_id: "c1" }),
      usuario({ id: "u2", company_id: "c2" }),
    ]);
    companies.find.mockResolvedValue([
      { id: "c1", name: "Salão da Ana" },
      { id: "c2", name: "Studio Bela" },
    ] as Company[]);
    users.createPasswordReset
      .mockResolvedValueOnce({ link: "https://x/definir-senha?token=1", token: "1" })
      .mockResolvedValueOnce({ link: "https://x/definir-senha?token=2", token: "2" });

    await service.requestReset("ana@salao.com.br", "1.2.3.4");

    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(mail.send.mock.calls[0][0].html).toContain("Salão da Ana");
    expect(mail.send.mock.calls[1][0].html).toContain("Studio Bela");
  });

  it("falha no envio não propaga — o pedido continua 'dando certo'", async () => {
    users.findActiveByEmail.mockResolvedValue([usuario()]);
    users.createPasswordReset.mockResolvedValue({ link: "https://x", token: "t" });
    mail.send.mockResolvedValue(false);

    await expect(service.requestReset("ana@salao.com.br", "1.2.3.4")).resolves.toBeUndefined();
  });
});
