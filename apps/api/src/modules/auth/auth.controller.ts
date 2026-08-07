import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService, AuthTokens } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthTokens> {
    const user = await this.auth.validateUser(
      dto.email,
      dto.password,
      dto.companySlug,
    );
    if (!user) {
      throw new UnauthorizedException("Credenciais inválidas");
    }
    return this.auth.login(user);
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
