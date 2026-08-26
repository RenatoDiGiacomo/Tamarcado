import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService, AuthTokens, LoginOutcome } from "./auth.service";
import { ForgotPasswordRateLimitService } from "./forgot-password-rate-limit.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly recovery: PasswordRecoveryService,
    private readonly rateLimit: ForgotPasswordRateLimitService,
  ) {}

  /**
   * "Esqueci minha senha" da tela de login. Gera o link pelo mecanismo da
   * 1.9.01 e envia por e-mail.
   *
   * **A resposta é SEMPRE a mesma**, exista ou não conta com aquele e-mail.
   * Responder diferente transformaria o endpoint numa sonda para descobrir
   * quem tem conta no sistema. Pelo mesmo motivo o 429 do rate limit tem texto
   * único, sem dizer se o estouro foi por e-mail ou por IP.
   */
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    this.rateLimit.assertWithinLimit(ip, dto.email);
    await this.recovery.requestReset(dto.email, ip);
    return {
      message:
        "Se este e-mail estiver cadastrado, você receberá as instruções para criar uma senha nova.",
    };
  }

  /**
   * Login do painel por e-mail (DL-052). Devolve os tokens quando entra direto,
   * ou `{ companies }` quando o e-mail existe em mais de uma empresa — o front
   * mostra a escolha e reenvia com `companyId`.
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginOutcome> {
    return this.auth.attemptLogin(dto.email, dto.password, dto.companyId);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string }> {
    return this.auth.refresh(dto.refreshToken);
  }

  /**
   * Aceite de convite / redefinição de senha — define a senha a partir do token
   * (primeiro acesso OU reset, 1.9.01). Pré-tenant. `ip` entra na auditoria.
   */
  @Post("accept-invite")
  @HttpCode(HttpStatus.OK)
  acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Ip() ip: string,
  ): Promise<AuthTokens> {
    return this.auth.acceptInvite(dto.token, dto.password, ip);
  }
}
