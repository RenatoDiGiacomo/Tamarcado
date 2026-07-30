import { devCorsOrigin } from "./app-setup";

/** Coleta o resultado do callback estilo-cors (err, allow). */
function check(origin: string | undefined): boolean {
  let allowed = false;
  devCorsOrigin(origin, (_err, allow) => {
    allowed = Boolean(allow);
  });
  return allowed;
}

describe("devCorsOrigin (CORS de dev — só rede local)", () => {
  const OLD = process.env.CORS_ORIGIN;
  afterEach(() => {
    if (OLD === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = OLD;
  });

  it("libera loopback (localhost / 127.0.0.1) em qualquer porta", () => {
    expect(check("http://localhost:5173")).toBe(true);
    expect(check("http://127.0.0.1:5173")).toBe(true);
  });

  it("libera IPs privados (RFC 1918) — o celular no mesmo Wi-Fi", () => {
    expect(check("http://192.168.0.42:5173")).toBe(true);
    expect(check("http://10.1.2.3:5173")).toBe(true);
    expect(check("http://172.16.5.9:5173")).toBe(true);
  });

  it("rejeita origem pública que não está no allowlist", () => {
    expect(check("https://evil.example.com")).toBe(false);
    // 172.32.x está FORA da faixa privada (172.16–172.31) → rejeitada.
    expect(check("http://172.32.0.1:5173")).toBe(false);
  });

  it("libera origem pública SE estiver no CORS_ORIGIN (allowlist)", () => {
    process.env.CORS_ORIGIN = "https://painel.tamarcado.app";
    expect(check("https://painel.tamarcado.app")).toBe(true);
    expect(check("https://outro.app")).toBe(false);
  });

  it("passa requisições sem Origin (curl, health check, webview)", () => {
    expect(check(undefined)).toBe(true);
  });

  it("rejeita origem malformada", () => {
    expect(check("nao-e-url")).toBe(false);
  });
});
