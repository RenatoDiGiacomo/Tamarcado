import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService, AuthTokens, LoginOutcome } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
