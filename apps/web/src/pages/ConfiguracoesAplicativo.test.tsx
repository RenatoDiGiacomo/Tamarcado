import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __limparEventoGuardado } from "../lib/usePwaInstall";
import { ConfiguracoesAplicativo } from "./ConfiguracoesAplicativo";

/** Dispara o evento que o Chrome/Edge emitem quando o site é instalável. */
function emitirBeforeInstallPrompt() {
  const evento = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  evento.prompt = promptMock;
  evento.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => {
    window.dispatchEvent(evento);
  });
  return evento;
}

const promptMock = vi.fn().mockResolvedValue(undefined);

function comNavegador(ua: string, standalone = false) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) =>
      ({
        matches: q.includes("standalone") ? standalone : false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const FIREFOX_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("Configurações → Aplicativo", () => {
  beforeEach(() => {
    promptMock.mockClear();
    // O evento do navegador é guardado fora do React (chega uma vez só):
    // sem limpar, um caso contamina o seguinte.
    __limparEventoGuardado();
  });
  afterEach(() => vi.restoreAllMocks());

  it("no Chrome, quando o navegador libera a instalação, mostra o botão e dispara o diálogo", () => {
    comNavegador(CHROME_DESKTOP);
    render(<ConfiguracoesAplicativo />);
    emitirBeforeInstallPrompt();

    const botao = screen.getByRole("button", {
      name: /instalar o tamarcado no computador/i,
    });
    fireEvent.click(botao);
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it("rodando em janela própria, NÃO oferece instalação", () => {
    comNavegador(CHROME_DESKTOP, true);
    render(<ConfiguracoesAplicativo />);

    expect(
      screen.queryByRole("button", { name: /instalar/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/já está instalado neste aparelho/i)).toBeInTheDocument();
  });

  it("depois de instalar, o botão some", () => {
    comNavegador(CHROME_DESKTOP);
    render(<ConfiguracoesAplicativo />);
    emitirBeforeInstallPrompt();
    expect(screen.getByRole("button", { name: /instalar/i })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button", { name: /instalar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/já está instalado neste aparelho/i)).toBeInTheDocument();
  });

  it("no Firefox (sem suporte) mostra instrução, não botão morto", () => {
    comNavegador(FIREFOX_DESKTOP);
    render(<ConfiguracoesAplicativo />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/não instala aplicativos/i)).toBeInTheDocument();
    expect(screen.getByText(/Google Chrome/)).toBeInTheDocument();
  });

  it("no Chrome antes do evento, ensina o caminho pela barra de endereço", () => {
    comNavegador(CHROME_DESKTOP);
    render(<ConfiguracoesAplicativo />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/barra de endereço/i)).toBeInTheDocument();
  });

  it("no iPhone/Safari mostra o caminho do Compartilhar", () => {
    comNavegador(SAFARI_IPHONE);
    render(<ConfiguracoesAplicativo />);

    expect(screen.getByText(/Adicionar à Tela de Início/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Compartilhar")).toBeInTheDocument();
  });
});
