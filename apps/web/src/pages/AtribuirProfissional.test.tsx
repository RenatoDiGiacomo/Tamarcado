import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AtribuirProfissional } from "./AtribuirProfissional";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const ATTENDERS = {
  users: [
    { id: "7", name: "Fernanda" },
    { id: "8", name: "Bruno" },
  ],
};

/** Router padrão: atendentes, vínculos (só 7 executa), disponibilidade e PATCH ok.
 *  `slotsFor` decide os horários livres por profissional (default: 09:00 livre). */
function route(
  opts: {
    professionalIds?: string[];
    slotsFor?: (pid: string) => string[];
    patchOk?: boolean;
    patchBody?: unknown;
  } = {},
) {
  const {
    professionalIds = ["7"],
    slotsFor = () => ["08:00", "09:00", "10:00"],
    patchOk = true,
    patchBody = { appointment: {}, overbooked: false },
  } = opts;
  return (path: string, o?: { method?: string }) => {
    if (o?.method === "PATCH") return Promise.resolve(jsonRes(patchBody, patchOk));
    if (path === "/users/attenders") return Promise.resolve(jsonRes(ATTENDERS));
    if (path.startsWith("/services/")) {
      return Promise.resolve(jsonRes({ professionalIds }));
    }
    if (path.startsWith("/availability")) {
      const pid = new URL(`http://x/${path}`).searchParams.get("professionalId") ?? "";
      return Promise.resolve(
        jsonRes({ slots: slotsFor(pid).map((time) => ({ time })) }),
      );
    }
    return Promise.resolve(jsonRes({}));
  };
}

function renderAny(over: Partial<Parameters<typeof AtribuirProfissional>[0]> = {}) {
  const onAssigned = vi.fn();
  render(
    <dl>
      <AtribuirProfissional
        appointmentId="10"
        serviceId="3"
        date="2026-07-20"
        start="09:00"
        currentProfessionalId="7"
        currentProfessionalName="Fernanda"
        mode="any"
        selfId="7"
        onAssigned={onAssigned}
        {...over}
      />
    </dl>,
  );
  return { onAssigned };
}

describe("AtribuirProfissional", () => {
  beforeEach(() => {
    apiMock.mockReset();
    toastSuccess.mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("owner: troca o profissional → PATCH com o novo id + toast + onAssigned (AC1)", async () => {
    apiMock.mockImplementation(route({ slotsFor: () => ["08:00", "09:00", "10:00"] }));
    const { onAssigned } = renderAny();

    fireEvent.click(screen.getByRole("button", { name: "trocar" }));
    const select = await screen.findByLabelText("Profissional");
    // Bruno carregado (aguarda o fetch de atendentes).
    await screen.findByRole("option", { name: "Bruno" });
    fireEvent.change(select, { target: { value: "8" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/appointments/10/professional");
      expect(patch?.[1].body).toEqual({ professionalId: "8" });
    });
    expect(toastSuccess).toHaveBeenCalled();
    expect(onAssigned).toHaveBeenCalled();
  });

  it("owner: agendamento sem profissional mostra 'atribuir' e envia o id escolhido", async () => {
    apiMock.mockImplementation(route());
    renderAny({ currentProfessionalId: null, currentProfessionalName: null });

    fireEvent.click(screen.getByRole("button", { name: "atribuir" }));
    const select = await screen.findByLabelText("Profissional");
    await screen.findByRole("option", { name: "Fernanda" });
    fireEvent.change(select, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[1].body).toEqual({ professionalId: "7" });
    });
  });

  it("destaca quem executa o serviço no grupo próprio (AC4)", async () => {
    apiMock.mockImplementation(route({ professionalIds: ["7"] }));
    renderAny();
    fireEvent.click(screen.getByRole("button", { name: "trocar" }));
    await screen.findByLabelText("Profissional");
    // Fernanda (id 7) está no grupo "Executa este serviço"; Bruno em "Outros".
    const executa = await screen.findByRole("group", { name: "Executa este serviço" });
    const outros = screen.getByRole("group", { name: "Outros" });
    expect(executa).toHaveTextContent("Fernanda");
    expect(outros).toHaveTextContent("Bruno");
  });

  it("avisa antes de aplicar quando o novo profissional está ocupado, mas deixa seguir (AC3/D1)", async () => {
    // Bruno (8) não tem 09:00 livre, mas está dentro da janela (08:00–10:00) → conflito.
    apiMock.mockImplementation(
      route({ slotsFor: (pid) => (pid === "8" ? ["08:00", "10:00"] : ["09:00"]) }),
    );
    renderAny();
    fireEvent.click(screen.getByRole("button", { name: "trocar" }));
    const select = await screen.findByLabelText("Profissional");
    await screen.findByRole("option", { name: "Bruno" });
    fireEvent.change(select, { target: { value: "8" } });

    expect(
      await screen.findByText(/Bruno já tem atendimento neste horário/i),
    ).toBeInTheDocument();
    // Botão vira "Atribuir mesmo assim" e ainda aplica.
    fireEvent.click(screen.getByRole("button", { name: "Atribuir mesmo assim" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[1].body).toEqual({ professionalId: "8" });
    });
  });

  it("basic (self): mostra 'Atribuir a mim' e envia o próprio id (D5)", async () => {
    apiMock.mockImplementation(route());
    const { onAssigned } = renderAny({
      mode: "self",
      selfId: "8",
      currentProfessionalId: null,
      currentProfessionalName: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Atribuir a mim" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/appointments/10/professional");
      expect(patch?.[1].body).toEqual({ professionalId: "8" });
    });
    expect(onAssigned).toHaveBeenCalled();
  });

  it("mostra a mensagem REAL da API quando o PATCH falha (3.3.1)", async () => {
    apiMock.mockImplementation(
      route({
        patchOk: false,
        patchBody: { message: "Profissional inválido.", statusCode: 400 },
      }),
    );
    renderAny();
    fireEvent.click(screen.getByRole("button", { name: "trocar" }));
    const select = await screen.findByLabelText("Profissional");
    await screen.findByRole("option", { name: "Bruno" });
    fireEvent.change(select, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Profissional inválido.")).toBeInTheDocument();
  });
});
