import { INestApplication, ValidationPipe } from "@nestjs/common";

/** Origens permitidas para CORS (painel web). Configurável por CORS_ORIGIN (CSV). */
export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Configuração compartilhada entre o bootstrap de produção (main.ts) e os
 * testes e2e (e2e-app.ts), para que os testes exerçam exatamente o mesmo setup
 * — incluindo CORS, cuja ausência quebrava o login pelo navegador.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api", { exclude: ["health"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: corsOrigins(), credentials: true });
}
