import { INestApplication, ValidationPipe } from "@nestjs/common";

/** Origens permitidas para CORS (painel web). Configurável por CORS_ORIGIN (CSV). */
export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Dev = ambiente de desenvolvimento/teste **explícito**. **Fail-closed:** se
 * `NODE_ENV` estiver AUSENTE (ou tiver qualquer valor não reconhecido), tratamos
 * como PRODUÇÃO — CORS estrito. O modo permissivo (rede local) só liga quando
 * `NODE_ENV` é `"development"` ou `"test"`. Assim um VPS que suba **sem**
 * `NODE_ENV` definido NÃO cai no CORS de dev. Ver nota de deploy no epics.md.
 */
export function isDevEnv(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

// Hosts de rede local: loopback + faixas privadas RFC 1918. Usado SOMENTE para
// liberar CORS EM DEV, permitindo testar o painel pelo celular no mesmo Wi-Fi
// (http://<IP-da-máquina>:5173). Em produção isto NÃO é usado — lá vale apenas
// o allowlist de CORS_ORIGIN (produção continua restrita).
const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

type CorsCallback = (err: Error | null, allow?: boolean) => void;

/**
 * CORS de dev: reflete a origem quando ela é da rede local (loopback ou IP
 * privado), em qualquer porta; senão cai no allowlist de CORS_ORIGIN.
 * Requisições sem `Origin` (curl, health check, webview) passam.
 */
export function devCorsOrigin(
  origin: string | undefined,
  callback: CorsCallback,
): void {
  if (!origin) return callback(null, true);
  let host = "";
  try {
    host = new URL(origin).hostname;
  } catch {
    return callback(null, false);
  }
  if (PRIVATE_HOST.test(host) || corsOrigins().includes(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
}

/**
 * Configuração compartilhada entre o bootstrap de produção (main.ts) e os
 * testes e2e (e2e-app.ts), para que os testes exerçam exatamente o mesmo setup
 * — incluindo CORS, cuja ausência quebrava o login pelo navegador.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api", { exclude: ["health"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Produção: allowlist estrito (CORS_ORIGIN). Dev: libera a rede local para o
  // teste pelo celular — sem afrouxar produção.
  app.enableCors(
    isDevEnv()
      ? { origin: devCorsOrigin, credentials: true }
      : { origin: corsOrigins(), credentials: true },
  );
}
