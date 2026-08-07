import { Body, Controller, HttpCode, HttpStatus, Ip, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PasswordResetRequestDto } from "./dto/password-reset-request.dto";
import { PlatformKeyGuard } from "./platform-key.guard";
import { PlatformRateLimitService } from "./platform-rate-limit.service";
import { PlatformService, type PasswordResetResult } from "./platform.service";

/**
 * Endpoint de PLATAFORMA (1.9.01): gera um link de redefinição de senha para um
 * dono que esqueceu a senha. Mesmo padrão da 1.9 — protegido por `x-platform-key`
 * (PlatformKeyGuard), PRÉ-TENANT (PRE_TENANT_CONTROLLERS), rate limit por IP.
 *
 * ⚠️ Deploy: enquanto `/api/platform/*` responder na internet aberta, quem tiver
 * a PLATFORM_KEY gera link de reset para qualquer dono. Restringir por IP no
 * Nginx antes de subir ao VPS (ver nota de deploy no epics.md).
 */
@ApiTags("platform")
@Controller("platform/password-reset")
@UseGuards(PlatformKeyGuard)
export class PasswordResetController {
  constructor(
    private readonly platform: PlatformService,
    private readonly rateLimit: PlatformRateLimitService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  reset(
    @Body() dto: PasswordResetRequestDto,
    @Ip() ip: string,
  ): Promise<PasswordResetResult> {
    this.rateLimit.assertWithinLimit(ip);
    return this.platform.resetPassword(dto, ip);
  }
}
