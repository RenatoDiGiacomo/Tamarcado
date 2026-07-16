import "reflect-metadata";
// PRIMEIRO import: popula process.env com apps/api/.env antes de qualquer
// módulo (o DatabaseModule lê as DATABASE_* no import-time). Ver load-env.ts.
import "./load-env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app-setup";
import { setupSwagger } from "./swagger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // Swagger UI em /api/docs — SOMENTE fora de produção (1.5.01).
  if (process.env.NODE_ENV !== "production") {
    setupSwagger(app);
  }
  const parsedPort = Number(process.env.PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  await app.listen(port);
  console.log(`Tamarcado API rodando na porta ${port}`);
}

void bootstrap();
