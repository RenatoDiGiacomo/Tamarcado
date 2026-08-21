import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Financeiro } from "./Financeiro";
import { downloadCsv } from "../lib/csv";

const apiMock = vi.fn();
vi.mock("../lib/session", () => ({
  authedRequest: (...args: unknown[]) => apiMock(...args),
}));
const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
const useAuthMock = vi.fn(() => ({ user: { id: "o1", accessLevel: "owner" } }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => useAuthMock() }));
// Espiona só o download (efeito no DOM); toCsv/csvAmount seguem REAIS, então o
// teste valida o conteúdo do CSV de verdade.
vi.mock("../lib/csv", async (orig) => ({
  ...(await orig<typeof import("../lib/csv")>()),
  downloadCsv: vi.fn(),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/**
 * jsdom não tem layout, então quem decide a forma da tela é o `matchMedia` que o
 * `useIsDesktop` consulta. O padrão da suíte é CELULAR (o público do sistema);
 * os testes que guardam o painel do desktop pedem "desktop" explicitamente.
 */
function setViewport(kind: "mobile" | "desktop"): void {
  window.matchMedia = ((query: string) => ({
    matches: kind === "desktop",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("Financeiro — recebimentos (Stories 5.2/5.3)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    navigateMock.mockReset();
    vi.mocked(downloadCsv).mockReset();
    localStorage.setItem("tamarcado.access", "tok");
    setViewport("mobile");
  });

  it("busca recebimentos do período e mostra totais + lista", async () => {
    apiMock.mockResolvedValue(
      jsonRes({
        receipts: [
          {
            appointmentId: "1",
            clientName: "Ana Lima",
            serviceName: "Corte",
            date: "2026-09-10",
            amount: 50,
            method: "pix",
            status: "pago",
          },
          {
            appointmentId: "2",
            clientName: "Bruno",
            serviceName: "Barba",
            date: "2026-09-11",
            amount: 30,
            method: null,
            status: "pendente",
          },
        ],
        totalReceived: 50,
        totalPending: 30,
      }),
    );
    render(<Financeiro />);

    expect(await screen.findByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
    // consulta o endpoint de recebimentos com período
    expect(String(apiMock.mock.calls[0][0])).toContain("/appointments/payments?from=");
    // totais + status ("Pendente" aparece no total E no status → getAllByText)
    expect(screen.getByText("Recebido")).toBeInTheDocument();
    expect(screen.getAllByText("Pendente").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pago")).toBeInTheDocument();
  });

  it("desktop: filtro por SITUAÇÃO (pagos) esconde os pendentes na lista", async () => {
    setViewport("desktop"); // no PC os filtros ficam no painel, sem sheet
    apiMock.mockResolvedValue(
      jsonRes({
        receipts: [
          { appointmentId: "1", clientId: "c1", clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" },
          { appointmentId: "2", clientId: "c2", clientName: "Bruno", serviceName: "Barba", date: "2026-09-11", amount: 30, method: null, status: "pendente" },
        ],
        totalReceived: 50,
        totalPending: 30,
      }),
    );
    render(<Financeiro />);
    await screen.findByText(/Corte/); // "Corte · PIX" (forma anexada)
    // filtra por Pagos → some o pendente (Barba/Bruno), fica o pago (Corte/Ana).
    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "pago" } });
    expect(screen.getByText(/Corte/)).toBeInTheDocument();
    // O serviço "Barba" (do pendente) some da LISTA.
    expect(screen.queryByText(/Barba/)).toBeNull();
  });

  it("desktop: filtra por cliente via BUSCA (nome/telefone), como no Novo agendamento", async () => {
    setViewport("desktop");
    apiMock.mockImplementation((url: string) => {
      if (String(url).includes("/clients?search=")) {
        return Promise.resolve(
          jsonRes({
            clients: [
              { id: "c1", name: "Ana Lima", phone_whatsapp: "+5511999990000" },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonRes({
          receipts: [
            { appointmentId: "1", clientId: "c1", clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" },
            { appointmentId: "2", clientId: "c2", clientName: "Bruno", serviceName: "Barba", date: "2026-09-11", amount: 30, method: null, status: "pendente" },
          ],
          totalReceived: 50,
          totalPending: 30,
        }),
      );
    });
    render(<Financeiro />);
    await screen.findByText(/Corte/);
    // Digita na busca → autocomplete (backend por nome/telefone, debounce).
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Ana" } });
    // A opção mostra nome · telefone; o telefone é único do resultado (o card não o tem).
    const opt = await screen.findByRole("button", { name: /5511999990000/ });
    fireEvent.click(opt);
    // Recorta a lista para a Ana; o pendente do Bruno (Barba) some.
    await waitFor(() => expect(screen.queryByText(/Barba/)).toBeNull());
    expect(screen.getByText(/Corte/)).toBeInTheDocument();
  });

  it("clicar num item abre o PaymentForm; salvar faz PUT e recarrega (DL-065)", async () => {
    apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === "PUT") return Promise.resolve(jsonRes({}));
      return Promise.resolve(
        jsonRes({
          receipts: [
            {
              appointmentId: "9",
              clientId: "c1",
              clientName: "Ana Lima",
              serviceName: "Corte",
              date: "2026-09-10",
              amount: 50,
              method: null,
              status: "pendente",
            },
          ],
          totalReceived: 0,
          totalPending: 50,
        }),
      );
    });
    render(<Financeiro />);
    // Abre o registro clicando no recebimento pendente da lista.
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Editar pagamento de Ana Lima/,
      }),
    );
    // O mesmo formulário do agendamento — valor pré-preenchido, situação, forma.
    const valor = (await screen.findByLabelText(
      "Valor recebido",
    )) as HTMLInputElement;
    expect(valor.value).toMatch(/R\$\s*50,00/);
    fireEvent.change(screen.getByLabelText("Situação do pagamento"), {
      target: { value: "pago" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const put = apiMock.mock.calls.find(
        ([, o]) => (o as { method?: string } | undefined)?.method === "PUT",
      );
      expect(put?.[0]).toBe("/appointments/9/payment");
      expect((put?.[1] as { body: Record<string, unknown> }).body).toEqual({
        amount: 50,
        method: undefined,
        status: "pago",
      });
    });
    // Recarrega os recebimentos após salvar (GET além do inicial).
    await waitFor(() => {
      const gets = apiMock.mock.calls.filter(([u]) =>
        String(u).includes("/appointments/payments?from="),
      );
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("clicar no NOME do card leva ao perfil da cliente, sem abrir o pagamento (DL-066)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({
        receipts: [
          { appointmentId: "1", clientId: "c1", clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" },
        ],
        totalReceived: 50,
        totalPending: 0,
      }),
    );
    render(<Financeiro />);
    // Nome (exato) = link ao perfil; o card (aria-label "Editar pagamento…") é outro alvo.
    fireEvent.click(await screen.findByRole("button", { name: "Ana Lima" }));
    expect(navigateMock).toHaveBeenCalledWith("/clientes/c1");
    // stopPropagation: NÃO abriu o formulário de pagamento.
    expect(screen.queryByLabelText("Valor recebido")).toBeNull();
  });

  it("Exportar CSV: não baixa direto — abre modal e só então gera o CSV (5.4)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({
        receipts: [
          { appointmentId: "1", clientId: "c1", clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" },
          { appointmentId: "2", clientId: "c2", clientName: "Bruno", serviceName: "Barba", date: "2026-09-11", amount: 30, method: null, status: "pendente" },
        ],
        totalReceived: 50,
        totalPending: 30,
      }),
    );
    render(<Financeiro />);
    // "Corte" (serviço) é único; "Ana Lima" aparece no card E na option do filtro.
    await screen.findByText(/Corte/);
    // Não exporta direto: abre o modal de confirmação.
    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));
    expect(await screen.findByText("Exportar recebimentos")).toBeInTheDocument();
    expect(vi.mocked(downloadCsv)).not.toHaveBeenCalled();
    // Confirma → gera e baixa o CSV com o conteúdo real.
    fireEvent.click(screen.getByRole("button", { name: /^Exportar$/ }));
    expect(vi.mocked(downloadCsv)).toHaveBeenCalledTimes(1);
    const [filename, content] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toMatch(/^recebimentos_.*\.csv$/);
    expect(content).toContain("Data;Cliente;Serviço;Forma;Situação;Valor");
    expect(content).toContain("Ana Lima");
    expect(content).toContain("PIX");
    expect(content).toContain("50,00");
  });

  it("estado vazio quando não há recebimentos no período", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ receipts: [], totalReceived: 0, totalPending: 0 }),
    );
    render(<Financeiro />);
    await waitFor(() =>
      expect(
        screen.getByText(/Nenhum recebimento no período/i),
      ).toBeInTheDocument(),
    );
  });

  it("SAÍDAS (5.10): lista, Resultado = recebido − saídas, e registra pagamento", async () => {
    apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
      const u = String(url);
      if (u.includes("/team/payments") && opts?.method === "POST") return Promise.resolve(jsonRes({ ok: true }));
      if (u.includes("/team/payments")) return Promise.resolve(jsonRes({ payments: [{ id: "x", professionalName: "Bia", amount: 50, paidOn: "2026-09-08", periodFrom: "2026-09-01", periodTo: "2026-09-30", note: null }], total: 50 }));
      if (u.startsWith("/team?")) return Promise.resolve(jsonRes({ members: [{ id: "m1", name: "Bia", forecast: { total: 60 } }] }));
      if (u.includes("/appointments/payments")) return Promise.resolve(jsonRes({ receipts: [], totalReceived: 100, totalPending: 0 }));
      return Promise.resolve(jsonRes({}));
    });
    render(<Financeiro />);
    // Resultado (KPI, sempre visível) = recebido − saídas.
    expect(await screen.findByText("Resultado")).toBeInTheDocument();
    // A lista de saídas vive na ABA "Saídas".
    fireEvent.click(screen.getByRole("tab", { name: "Saídas" }));
    expect(await screen.findByText("Bia")).toBeInTheDocument();
    expect(screen.getByText(/−\s*R\$\s*50,00/)).toBeInTheDocument();
    // Registro fica no header (Dono).
    fireEvent.click(screen.getByRole("button", { name: /Pagar à equipe/ }));
    expect(await screen.findByText("Pagar à equipe (saída)")).toBeInTheDocument();
    // Escolhe o profissional → valor pré-preenche com a previsão (R$ 60,00).
    fireEvent.change(await screen.findByLabelText("Profissional"), { target: { value: "m1" } });
    await waitFor(() => expect((screen.getByLabelText("Valor pago") as HTMLInputElement).value).toMatch(/60,00/));
    fireEvent.click(screen.getByRole("button", { name: /Registrar saída/ }));
    await waitFor(() => {
      const post = apiMock.mock.calls.find(([u, o]) => String(u) === "/team/payments" && (o as { method?: string })?.method === "POST");
      const body = (post?.[1] as { body: Record<string, unknown> }).body;
      expect(body).toMatchObject({ professionalId: "m1", amount: 60 });
      expect(body.periodFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("desktop — abas (reorg UX): Recebimentos mostra a lista + filtros; Saídas troca a leitura", async () => {
    setViewport("desktop");
    apiMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/team/payments")) return Promise.resolve(jsonRes({ payments: [{ id: "x", professionalName: "Bia", amount: 50, paidOn: "2026-09-08", periodFrom: "2026-09-01", periodTo: "2026-09-30", note: null }], total: 50 }));
      if (u.startsWith("/team?")) return Promise.resolve(jsonRes({ members: [] }));
      return Promise.resolve(jsonRes({ receipts: [{ appointmentId: "1", clientId: null, clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" }], totalReceived: 50, totalPending: 0 }));
    });
    render(<Financeiro />);
    // Recebimentos (aba padrão): recibo visível + filtro Situação presente.
    expect(await screen.findByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByLabelText("Situação")).toBeInTheDocument();
    // Troca para Saídas: recibo some, filtro Situação some, saída aparece.
    fireEvent.click(screen.getByRole("tab", { name: "Saídas" }));
    expect(screen.queryByText("Ana Lima")).toBeNull();
    expect(screen.queryByLabelText("Situação")).toBeNull();
    expect(screen.getByText("Bia")).toBeInTheDocument();
  });

  // ---- MOBILE: três filtros lado a lado não cabiam (o campo da cliente
  // aparecia cortado em "Bu"). Fica o período; o resto vai para o sheet. ----
  describe("mobile — filtros no sheet", () => {
    function comDoisRecebimentos(): void {
      apiMock.mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes("/clients?search=")) {
          return Promise.resolve(
            jsonRes({
              clients: [
                { id: "c1", name: "Ana Lima", phone_whatsapp: "+5511999990000" },
              ],
            }),
          );
        }
        if (u.includes("/team/payments")) {
          return Promise.resolve(jsonRes({ payments: [], total: 0 }));
        }
        return Promise.resolve(
          jsonRes({
            receipts: [
              { appointmentId: "1", clientId: "c1", clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" },
              { appointmentId: "2", clientId: "c2", clientName: "Bruno", serviceName: "Barba", date: "2026-09-11", amount: 30, method: null, status: "pendente" },
            ],
            totalReceived: 50,
            totalPending: 30,
          }),
        );
      });
    }

    it("período fica visível; situação/forma/cliente só dentro do sheet", async () => {
      comDoisRecebimentos();
      render(<Financeiro />);
      await screen.findByText(/Corte/);
      // O período é o mais usado — segue na tela.
      expect(screen.getByLabelText("De")).toBeInTheDocument();
      expect(screen.getByLabelText("Até")).toBeInTheDocument();
      // Os outros três saem da tela (era o que cortava o campo da cliente).
      expect(screen.queryByLabelText("Situação")).toBeNull();
      expect(screen.queryByLabelText("Forma de pagamento")).toBeNull();
      expect(screen.queryByLabelText("Cliente")).toBeNull();
      // E aparecem ao abrir "Filtros".
      fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
      expect(await screen.findByLabelText("Situação")).toBeInTheDocument();
      expect(screen.getByLabelText("Forma de pagamento")).toBeInTheDocument();
      expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    });

    it("filtrar pelo sheet recorta a lista e o botão passa a contar os ativos", async () => {
      comDoisRecebimentos();
      render(<Financeiro />);
      await screen.findByText(/Corte/);
      fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
      fireEvent.change(await screen.findByLabelText("Situação"), {
        target: { value: "pago" },
      });
      // O botão de fechar já diz o que vai aparecer na lista.
      fireEvent.click(screen.getByRole("button", { name: "Ver 1 recebimento" }));
      await waitFor(() => expect(screen.queryByText(/Barba/)).toBeNull());
      expect(screen.getByText(/Corte/)).toBeInTheDocument();
      // O filtro escondido não some de vista: o botão passa a contar.
      expect(
        screen.getByRole("button", { name: "Filtros (1 ativo)" }),
      ).toBeInTheDocument();
    });

    it("a busca da cliente funciona dentro do sheet e soma na contagem", async () => {
      comDoisRecebimentos();
      render(<Financeiro />);
      await screen.findByText(/Corte/);
      fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
      fireEvent.change(await screen.findByLabelText("Situação"), {
        target: { value: "pago" },
      });
      fireEvent.change(screen.getByLabelText("Cliente"), {
        target: { value: "Ana" },
      });
      fireEvent.click(await screen.findByRole("button", { name: /5511999990000/ }));
      fireEvent.click(screen.getByRole("button", { name: "Ver 1 recebimento" }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Filtros (2 ativos)" }),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/Barba/)).toBeNull();
    });

    it("Limpar zera os filtros escondidos e devolve a lista inteira", async () => {
      comDoisRecebimentos();
      render(<Financeiro />);
      await screen.findByText(/Corte/);
      fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
      fireEvent.change(await screen.findByLabelText("Situação"), {
        target: { value: "pago" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Ver 2 recebimentos" }),
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument(),
      );
      expect(screen.getByText(/Barba/)).toBeInTheDocument();
    });

    it("na aba Saídas não há botão de Filtros (não se aplicam)", async () => {
      comDoisRecebimentos();
      render(<Financeiro />);
      await screen.findByText(/Corte/);
      expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "Saídas" }));
      expect(screen.queryByRole("button", { name: "Filtros" })).toBeNull();
      // O período continua — ele vale para as duas leituras do caixa.
      expect(screen.getByLabelText("De")).toBeInTheDocument();
    });
  });
});
