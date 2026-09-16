import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { WhatsAppConfigException } from "./whatsapp.errors";

/**
 * Cifra do token de operação em nome do cliente (Story 6.1, DL-084).
 *
 * POR QUE CIFRAR, já que a chave mora no mesmo servidor: não é contra quem já
 * está dentro da máquina — é contra o **dump de banco**. O backup do MySQL sai
 * do servidor por desenho; o `/etc/tamarcado/api.env` não sai. Quem tem este
 * token envia WhatsApp **como o salão**, para as clientes dele.
 *
 * E por que AGORA e não depois: cifrar uma coluna que já tem dado é migration
 * que **converte dado**, com teste contra base populada (DL-064). Nascer cifrada
 * custa este arquivo.
 *
 * AES-256-GCM: cifra **e autentica**. Token adulterado no banco não decifra —
 * falha alto em vez de virar uma requisição estranha à Meta.
 *
 * FORMATO ARMAZENADO: `v1:<iv b64>:<tag b64>:<cifra b64>`. O prefixo de versão é
 * o que permite trocar de algoritmo depois lendo o formato antigo.
 *
 * FAIL-CLOSED: sem `WHATSAPP_TOKEN_KEY` não grava **nem lê**. A alternativa
 * ("sem chave, guarda em texto puro") é o caminho que faz produção subir sem a
 * variável e ninguém descobrir — cifra opcional é cifra que não existe.
 */
@Injectable()
export class WhatsAppTokenCipher {
  private static readonly VERSAO = "v1";
  private static readonly ALGORITMO = "aes-256-gcm";

  constructor(private readonly config: ConfigService) {}

  /** `true` se a chave existe e é válida — usado para diagnóstico, não para desviar. */
  get configurada(): boolean {
    try {
      this.chave();
      return true;
    } catch {
      return false;
    }
  }

  encrypt(plano: string): string {
    if (!plano) {
      throw new WhatsAppConfigException("token vazio não pode ser cifrado");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv(WhatsAppTokenCipher.ALGORITMO, this.chave(), iv);
    const cifra = Buffer.concat([cipher.update(plano, "utf8"), cipher.final()]);
    return [
      WhatsAppTokenCipher.VERSAO,
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      cifra.toString("base64"),
    ].join(":");
  }

  decrypt(armazenado: string): string {
    const partes = armazenado.split(":");
    if (partes.length !== 4 || partes[0] !== WhatsAppTokenCipher.VERSAO) {
      // Sem eco do conteúdo: o que está guardado é segredo mesmo quando ilegível.
      throw new WhatsAppConfigException(
        "token guardado em formato desconhecido — regrave a conexão",
      );
    }
    const [, ivB64, tagB64, cifraB64] = partes;
    try {
      const decipher = createDecipheriv(
        WhatsAppTokenCipher.ALGORITMO,
        this.chave(),
        Buffer.from(ivB64, "base64"),
      );
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(cifraB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch (erro) {
      if (erro instanceof WhatsAppConfigException) {
        throw erro;
      }
      // Causa quase certa: WHATSAPP_TOKEN_KEY trocada depois da gravação.
      throw new WhatsAppConfigException(
        "não foi possível decifrar o token da conexão — a WHATSAPP_TOKEN_KEY " +
          "mudou desde a gravação, ou a linha foi adulterada. Regrave a conexão " +
          "pelo endpoint de plataforma.",
      );
    }
  }

  /**
   * Chave de 32 bytes vinda do ambiente, em hex (64 caracteres).
   * `openssl rand -hex 32` gera uma.
   */
  private chave(): Buffer {
    const bruta = this.config.get<string>("WHATSAPP_TOKEN_KEY") ?? "";
    if (!bruta) {
      throw new WhatsAppConfigException(
        "WHATSAPP_TOKEN_KEY ausente — sem ela não há como guardar nem ler o " +
          "token do cliente. Gere com `openssl rand -hex 32`.",
      );
    }
    if (!/^[0-9a-fA-F]{64}$/.test(bruta)) {
      throw new WhatsAppConfigException(
        "WHATSAPP_TOKEN_KEY precisa ter 64 caracteres hexadecimais (32 bytes).",
      );
    }
    return Buffer.from(bruta, "hex");
  }
}

/**
 * Comparação de segredos em tempo constante, tolerante a tamanhos diferentes.
 * Mora aqui por proximidade de assunto — é usada pela validação de assinatura do
 * webhook e pela conferência do `verify_token` do handshake da Meta.
 *
 * `timingSafeEqual` **lança** quando os buffers têm tamanhos diferentes, e é
 * exatamente o caso mais comum (segredo errado costuma ter outro tamanho); por
 * isso a checagem de tamanho vem antes. Ela vaza só o TAMANHO, nunca o conteúdo.
 */
export function segredosIguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
