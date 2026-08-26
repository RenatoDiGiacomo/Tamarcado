import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiConnectionError } from "../lib/api";
import { EsqueciSenha } from "./EsqueciSenha";

const apiMock = vi.fn();
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  apiRequest: (...a: unknown[]) => apiMock(...a),
}));

const res = (status: number) => ({ ok: status < 400, status }) as Response;

function renderTela() {
  return render(
    <MemoryRouter initialEntries={["/esqueci-senha"]}>
      <EsqueciSenha />
    </MemoryRouter>,
  );
}

async function pedir(email = "ana@salao.com.br") {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));
}

describe("EsqueciSenha", () => {
  beforeEach(() => apiMock.mockReset());

  it("envia o e-mail digitado para o endpoint", async () => {
    apiMock.mockResolvedValue(res(200));
    renderTela();
    await pedir();

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith("/auth/forgot-password", {
        method: "POST",
        body: { email: "ana@salao.com.br" },
      }),
    );
  });

  it("mostra a MESMA confirmação para e-mail cadastrado e não cadastrado", async () => {
    // O backend responde 200 nos dois casos; a tela não pode desfazer isso
    // mostrando uma diferença — senão vira sonda de quem tem conta.
    apiMock.mockResolvedValue(res(200));
    const { unmount } = renderTela();
    await pedir("existe@salao.com.br");
    const primeira = await screen.findByRole("status");
    const textoCadastrado = primeira.textContent;
    unmount();

    renderTela();
    await pedir("naoexiste@qualquer.com");
    const segunda = await screen.findByRole("status");
    expect(segunda.textContent).toBe(textoCadastrado);
    expect(segunda.textContent).toMatch(/se este e-mail estiver cadastrado/i);
  });

  it("diz o prazo do link na confirmação", async () => {
    apiMock.mockResolvedValue(res(200));
    renderTela();
    await pedir();
    expect(await screen.findByRole("status")).toHaveTextContent("1 hora");
  });

  it("no 429 avisa para esperar, sem dizer que o e-mail existe", async () => {
    apiMock.mockResolvedValue(res(429));
    renderTela();
    await pedir();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/muitas tentativas/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("erro do servidor (500) NÃO vira 'enviado'", async () => {
    apiMock.mockResolvedValue(res(500));
    renderTela();
    await pedir();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("servidor fora: mostra falha de conexão e deixa tentar de novo", async () => {
    // A promessa rejeitada é criada DENTRO do mock, no momento da chamada, e
    // consumida na hora pelo `await` do componente. Com `mockRejectedValue` ela
    // nasceria na montagem do teste e o vitest a acusaria como rejeição não
    // tratada antes de alguém consumi-la.
    // `mockImplementationOnce` + um padrão resolvido: só a chamada do teste
    // rejeita. Com `mockRejectedValue`, qualquer chamada extra deixaria uma
    // promessa rejeitada sem consumidor e o vitest reprovaria o arquivo por
    // rejeição não tratada, mesmo com o componente tratando a dela.
    apiMock.mockResolvedValue(res(200));
    apiMock.mockImplementationOnce(() => Promise.reject(new ApiConnectionError()));
    renderTela();
    await pedir();

    expect(await screen.findByRole("alert")).toHaveTextContent(/conectar ao servidor/i);
    expect(screen.getByRole("button", { name: /enviar link/i })).toBeEnabled();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
});
