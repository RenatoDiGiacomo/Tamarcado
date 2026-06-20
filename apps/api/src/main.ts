import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api", { exclude: ["health"] });
  const parsedPort = Number(process.env.PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  await app.listen(port);
  console.log(`Tamarcado API rodando na porta ${port}`);
}

void bootstrap();
