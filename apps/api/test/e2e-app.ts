import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app-setup";

export interface E2EContext {
  app: INestApplication;
  dataSource: DataSource;
}

/**
 * Sobe a app de testes espelhando o main.ts (prefixo /api + ValidationPipe) e
 * reaproveita a ÚNICA conexão do app (`app.get(DataSource)`) para seed/reset —
 * sem abrir um DataSource paralelo. Isso, com `teardownE2E`, fecha todos os
 * handles e dispensa `--forceExit` (AC5).
 */
export async function bootstrapE2E(): Promise<E2EContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, dataSource: app.get(DataSource) };
}

/** Fecha a app (e com ela a conexão TypeORM). Idempotente. */
export async function teardownE2E(ctx: E2EContext | undefined): Promise<void> {
  if (ctx?.app) {
    await ctx.app.close();
  }
}
