import "reflect-metadata";
import "../load-env";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppModule } from "../app.module";
import { Company } from "../database/entities/company.entity";
import { WhatsAppService } from "../modules/whatsapp/whatsapp.service";
import { WhatsAppConnectionService } from "../modules/whatsapp/whatsapp-connection.service";
import { CapabilitiesService } from "../modules/capabilities/capabilities.service";

/**
 * SMOKE TEST da Story 6.1 — o lado do ENVIO.
 *
 * O ciclo completo do AC-5 é `recebe → processa → envia`, e o lado do
 * **recebimento** não cabe em script nenhum: quem manda a mensagem é uma pessoa,
 * de um celular de verdade, e quem entrega é a Meta. O procedimento inteiro está
 * no artefato de implementação desta story.
 *
 * Este script existe para o que dá para automatizar e para o que se repete: a
 * conferência das credenciais e um envio real por um tenant, **pelo mesmo
 * caminho que o bot usa** — fachada, gate de capability, factory por tenant e
 * provider. Um `curl` direto na Graph API provaria só que o token existe, que é
 * a parte fácil.
 *
 *   pnpm --filter api run smoke:whatsapp -- <slug> [telefone-destino] [texto]
 *
 * Sem telefone, ele só confere o estado da conexão e não envia nada.
 * O telefone vai em E.164 **sem** o `+` (ex.: `5511942458672`).
 */
async function main(): Promise<void> {
  const logger = new Logger("smoke:whatsapp");
  const [slug, destino, ...resto] = process.argv.slice(2);
  if (!slug) {
    logger.error(
      "uso: pnpm --filter api run smoke:whatsapp -- <slug> [telefone] [texto]",
    );
    process.exitCode = 1;
    return;
  }
  const texto = resto.join(" ") || "Smoke test da Story 6.1 — TaMarcado.";

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const company = await app
      .get(DataSource)
      .getRepository(Company)
      .findOne({ where: { slug } });
    if (!company) {
      logger.error(`estabelecimento "${slug}" não existe`);
      process.exitCode = 1;
      return;
    }

    const conexao = await app.get(WhatsAppConnectionService).view(company.id);
    if (!conexao) {
      logger.error(
        `"${slug}" não tem conexão de WhatsApp. Grave pelo endpoint de plataforma ` +
          "(PUT /api/platform/companies/{slug}/whatsapp) — ver RUNBOOK §16.",
      );
      process.exitCode = 1;
      return;
    }
    // A view não tem campo de token, por construção — não há o que vazar aqui.
    logger.log(`conexão: ${JSON.stringify(conexao)}`);

    const capabilities = await app
      .get(CapabilitiesService)
      .listForCompany(company.id);
    logger.log(`capabilities: ${capabilities.join(", ") || "(nenhuma)"}`);

    const whatsapp = app.get(WhatsAppService);
    const estado = await whatsapp.connectionStatus(company.id);
    logger.log(`estado junto ao provider: ${JSON.stringify(estado)}`);
    if (!estado.conectado) {
      logger.error(
        "o provider não reconheceu esta conexão — não adianta tentar enviar.",
      );
      process.exitCode = 1;
      return;
    }

    if (!destino) {
      logger.log("sem telefone de destino: nada foi enviado.");
      return;
    }

    const r = await whatsapp.sendMessage(
      company.id,
      { to: destino, text: texto },
      "whatsapp_bot",
    );
    logger.log(`ENVIADO. id da mensagem na Meta: ${r.providerMessageId}`);
  } finally {
    await app.close();
  }
}

void main();
