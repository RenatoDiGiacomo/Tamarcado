import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_CAPABILITY_KEY } from "../../../common/decorators/require-capability.decorator";
import type { CapabilityKey } from "../../../common/capabilities/capability";
import type { User } from "../../../database/entities/user.entity";
import { CapabilitiesService } from "../../capabilities/capabilities.service";
import { CapabilityRequiredException } from "../../../common/errors/forbidden-reason";

/**
 * CAMADA 2 do bloqueio por capability (DL-072, Story 6.11): rota autenticada de
 * empresa SEM o recurso contratado → **403**, independentemente do que o front
 * mostrou. A camada 1 (front) é UX; segurança é este 403.
 *
 * Roda DEPOIS do `ActiveUserGuard` — precisa da LINHA FRESCA do usuário
 * (`req.currentUser`) para saber de que empresa ele é. A capability em si também
 * é lida fresca do banco, NUNCA do token (mesma razão do DL-062): revogar acesso
 * não pode esperar o token expirar.
 *
 * SEPARADO do `ModuleGuard` de propósito (DL-072, camada 2). São eixos distintos
 * e valem JUNTOS:
 *   - `ModuleGuard` (DL-062): *esta pessoa* enxerga o módulo? owner passa sempre.
 *   - `CapabilityGuard` (aqui): *a empresa* comprou o recurso? **owner NÃO passa
 *     por cima** — não existe papel que compre recurso, e o dono de uma empresa
 *     sem o direito é justamente quem mais tentaria.
 *
 * Sem `@RequireCapability` no handler/classe → libera (a rota não é gateada).
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      CapabilityKey | undefined
    >(REQUIRE_CAPABILITY_KEY, [context.getHandler(), context.getClass()]);
    if (!required) {
      return true;
    }

    const { currentUser } = context
      .switchToHttp()
      .getRequest<{ currentUser?: User }>();
    if (!currentUser) {
      // Sem a linha fresca não há empresa para consultar — nega por segurança
      // (mesma postura do ModuleGuard). Na prática significa `ActiveUserGuard`
      // ausente na rota, o que o guard-rail de cobertura já denuncia.
      throw new CapabilityRequiredException(required);
    }

    const allowed = await this.capabilities.hasCapability(
      currentUser.company_id,
      required,
    );
    if (!allowed) {
      // Mensagem NEUTRA e sem preço: quem vende é a tela (a coroa e o modal da
      // Story 6.15). O backend só nega — mas nega DIZENDO O MOTIVO, para o front
      // distinguir "a empresa não contratou" de "esta pessoa não tem permissão".
      throw new CapabilityRequiredException(required);
    }
    return true;
  }
}
