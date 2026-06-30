import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/**
 * Monta o Swagger UI em `/api/docs` (1.5.01).
 *
 * SEGURANÇA: chamar SOMENTE em dev — Swagger aberto em produção expõe a API
 * inteira. O `main.ts` só invoca quando `NODE_ENV !== 'production'`.
 *
 * O botão "Authorize" aceita o access token (JWT) — cole o token e dispare as
 * chamadas direto pelo navegador.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Tamarcado API")
    .setDescription(
      "API do painel Tamarcado. Faça login em POST /api/auth/login, copie o " +
        "accessToken e cole no botão Authorize (Bearer).",
    )
    .setVersion("1.5.01")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // setGlobalPrefix('api') não afeta este path; servimos em /api/docs explícito.
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
