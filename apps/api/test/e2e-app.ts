import { INestApplication, Type } from "@nestjs/common";
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
 *
 * `extraModules` monta módulos de FIXTURE junto do app real (Story 6.11): a
 * fundação de capabilities não gateia nenhum recurso de produção ainda, então o
 * 403 da camada 2 só é demonstrável ponta a ponta contra um controller de prova.
 * Fora esse caso, chame sem argumento.
 */
export async function bootstrapE2E(
  extraModules: Type[] = [],
): Promise<E2EContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...extraModules],
  }).compile();

  // `rawBody` espelha o main.ts — sem ele o e2e do webhook não conseguiria
  // conferir a assinatura da Meta (Story 6.1).
  const app = moduleRef.createNestApplication({ rawBody: true });
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
