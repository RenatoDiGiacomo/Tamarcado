import { SetMetadata } from "@nestjs/common";
import type { CapabilityKey } from "../capabilities/capability";

export const REQUIRE_CAPABILITY_KEY = "requireCapability";
export const GATED_BY_CAPABILITY_KEY = "gatedByCapability";

/**
 * CAMADA 2 do bloqueio (DL-072): exige que a EMPRESA tenha o recurso contratado.
 * Lido pelo `CapabilityGuard`, que responde **403** quando falta — independente
 * do que o front mostrou.
 *
 * NÃO é `@RequireModule` (DL-062). Módulo é *quem da equipe vê*; capability é
 * *o que a empresa comprou*. São eixos independentes e valem juntos: a empresa
 * pode TER o recurso e a pessoa NÃO poder vê-lo — e o contrário também.
 * Por isso os dois decorators coexistem no mesmo handler quando fizer sentido.
 *
 * Ex.: `@RequireCapability("whatsapp_bot")`.
 */
export const RequireCapability = (
  capability: CapabilityKey,
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, capability);

/**
 * Marca um PROVIDER como pertencente a um domínio gateado por capability —
 * ex.: o serviço do bot de WhatsApp (Story 6.1+).
 *
 * Não gateia nada sozinho: existe para o GUARD-RAIL (`capability-coverage.ts`,
 * padrão DL-027/DL-053). O teste varre o `AppModule` real e FALHA a suíte se um
 * controller que depende (transitivamente) de um provider marcado assim não
 * declarar `@RequireCapability` em todas as suas rotas.
 *
 * É o que faz a camada 2 não ser esquecida quando o domínio do Épico 6 nascer:
 * quem marcar o serviço e esquecer o gate na rota quebra a suíte na hora.
 *
 * Ex.: `@GatedByCapability("whatsapp_bot") @Injectable() class WhatsAppService {}`
 */
export const GatedByCapability = (
  capability: CapabilityKey,
): ClassDecorator =>
  SetMetadata(GATED_BY_CAPABILITY_KEY, capability) as ClassDecorator;
