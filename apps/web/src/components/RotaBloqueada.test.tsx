import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider, type CurrentUser } from "../auth/AuthContext";
import { RequireCapability, RequireModule } from "./RotaBloqueada";

/**
 * Story 6.15 — O CAMINHO CRU: o usuário chega na rota bloqueada DIRETO pela URL
 * (link antigo, favorito, endereço digitado, alguém mandou o link). Aqui não há
 * coroa para clicar; é este caminho que decide se o produto explica ou parece
 * quebrado.
 *
 * O ponto central da story está no último bloco: os dois bloqueios precisam ser
 * DIFERENTES. Se parecerem iguais, a profissional sem permissão recebe oferta de
 * plano que ela não tem como comprar — e vai cobrar o dono por isso.
 */

vi.mock("../lib/useInstallation", () => ({
  useInstallation: () => ({ name: "Salão da Rê", logoUrl: null, primaryColor: null }),
  refreshInstallation: vi.fn(),
}));

const PERFIL_BASE: CurrentUser = {
  id: "1",
  companyId: "1",
  name: "Rê",
  email: "re@salao.dev",
  accessLevel: "professional",
  attendsClients: true,
  theme: "light",
  canViewFinanceiro: false,
  canViewDashboard: false,
  canViewEquipe: false,
  canManageAllAppointments: false,
  companyCapabilities: [],
};

/** Sobe o app com um perfil já autenticado, sem rede real. */
function renderRota(perfil: Partial<CurrentUser>, elemento: ReactNode) {
  localStorage.setItem("tamarcado.access", "token-de-teste");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ ...PERFIL_BASE, ...perfil }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  return render(
    <MemoryRouter initialEntries={["/alvo"]}>
      <AuthProvider>
        <Routes>
          <Route path="/alvo" element={elemento} />
          <Route path="/" element={<p>Agenda (redirecionou)</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RequireModule — rota bloqueada por PERMISSÃO, acessada direto pela URL", () => {
  it("explica quem libera, em vez de redirecionar em silêncio", async () => {
    renderRota(
      { canViewFinanceiro: false },
      <RequireModule module="financeiro">
        <p>conteúdo secreto</p>
      </RequireModule>,
    );
    expect(await screen.findByText(/não tem acesso a esta área/i)).toBeInTheDocument();
    expect(screen.getByText(/dono do estabelecimento/i)).toBeInTheDocument();
    expect(screen.queryByText("conteúdo secreto")).toBeNull();
    // Antes desta story a pessoa era jogada na Agenda sem uma palavra.
    expect(screen.queryByText(/redirecionou/i)).toBeNull();
  });

  it("NÃO oferece plano — quem barrou foi o dono, não a Tamarcado", async () => {
    renderRota(
      { canViewFinanceiro: false },
      <RequireModule module="financeiro">
        <p>conteúdo</p>
      </RequireModule>,
    );
    await screen.findByText(/não tem acesso a esta área/i);
    expect(screen.queryByText(/plano pró/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /quero saber mais/i })).toBeNull();
    // Repetir não muda permissão — botão aqui seria promessa falsa.
    expect(screen.queryByRole("button", { name: /tentar de novo/i })).toBeNull();
  });

  it("com o módulo liberado, a tela abre normalmente", async () => {
    renderRota(
      { canViewFinanceiro: true },
      <RequireModule module="financeiro">
        <p>conteúdo liberado</p>
      </RequireModule>,
    );
    expect(await screen.findByText("conteúdo liberado")).toBeInTheDocument();
  });

  it("o owner passa sempre (DL-062 — os flags não o restringem)", async () => {
    renderRota(
      { accessLevel: "owner", canViewFinanceiro: false },
      <RequireModule module="financeiro">
        <p>conteúdo do dono</p>
      </RequireModule>,
    );
    expect(await screen.findByText("conteúdo do dono")).toBeInTheDocument();
  });
});

describe("RequireCapability — rota bloqueada por PLANO, acessada direto pela URL", () => {
  it("mostra a oferta do Pró, não um erro de servidor", async () => {
    renderRota(
      { accessLevel: "owner", companyCapabilities: [] },
      <RequireCapability capability="whatsapp_bot" titulo="WhatsApp">
        <p>tela do whatsapp</p>
      </RequireCapability>,
    );
    expect(await screen.findByText(/Disponível no plano Pró/i)).toBeInTheDocument();
    expect(screen.getByText("Agendamento pelo WhatsApp")).toBeInTheDocument();
    expect(screen.queryByText("tela do whatsapp")).toBeNull();
    // O defeito que a story fecha: bloqueio comercial com cara de falha técnica.
    expect(screen.queryByText(/problema no servidor/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /tentar de novo/i })).toBeNull();
  });

  it("o OWNER também é barrado — papel não compra recurso (DL-072)", async () => {
    renderRota(
      { accessLevel: "owner", companyCapabilities: [] },
      <RequireCapability capability="whatsapp_bot" titulo="WhatsApp">
        <p>tela do whatsapp</p>
      </RequireCapability>,
    );
    await screen.findByText(/Disponível no plano Pró/i);
    expect(screen.queryByText("tela do whatsapp")).toBeNull();
  });

  it("com a capability contratada, a tela abre e não sobra vestígio da coroa", async () => {
    renderRota(
      { companyCapabilities: ["whatsapp_bot"] },
      <RequireCapability capability="whatsapp_bot" titulo="WhatsApp">
        <p>tela do whatsapp</p>
      </RequireCapability>,
    );
    expect(await screen.findByText("tela do whatsapp")).toBeInTheDocument();
    expect(screen.queryByText(/plano Pró/i)).toBeNull();
  });

  it("as duas metades se vendem separadas: ter o bot não libera o lembrete", async () => {
    renderRota(
      { companyCapabilities: ["whatsapp_bot"] },
      <RequireCapability capability="lembrete_automatico" titulo="Lembretes">
        <p>tela de lembretes</p>
      </RequireCapability>,
    );
    expect(await screen.findByText("Lembrete automático")).toBeInTheDocument();
    expect(screen.queryByText("tela de lembretes")).toBeNull();
  });
});

describe("OS DOIS BLOQUEIOS NÃO PODEM PARECER IGUAIS (o coração da 6.15)", () => {
  it("plano oferece compra; permissão manda falar com o dono", async () => {
    const porPlano = renderRota(
      { accessLevel: "owner", companyCapabilities: [] },
      <RequireCapability capability="whatsapp_bot" titulo="WhatsApp">
        <p>x</p>
      </RequireCapability>,
    );
    const textoPlano = (await screen.findByRole("alert")).textContent ?? "";
    porPlano.unmount();

    renderRota(
      { canViewFinanceiro: false },
      <RequireModule module="financeiro">
        <p>x</p>
      </RequireModule>,
    );
    const textoPermissao = (await screen.findByRole("alert")).textContent ?? "";

    expect(textoPlano).not.toBe(textoPermissao);
    // Só o de PLANO fala em contratar.
    expect(textoPlano).toMatch(/plano pró/i);
    expect(textoPermissao).not.toMatch(/plano pró/i);
    // Só o de PERMISSÃO manda falar com o dono.
    expect(textoPermissao).toMatch(/dono do estabelecimento/i);
    expect(textoPlano).not.toMatch(/dono do estabelecimento/i);
  });
});
