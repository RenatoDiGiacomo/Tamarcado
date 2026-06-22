import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService, AuthTokens } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";

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
}
