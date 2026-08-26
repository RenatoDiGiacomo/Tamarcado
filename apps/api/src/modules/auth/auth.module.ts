import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../../database/entities/company.entity";
import { UsersModule } from "../users/users.module";
import { TokenModule } from "../token/token.module";
import { MailModule } from "../mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ForgotPasswordRateLimitService } from "./forgot-password-rate-limit.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  // TokenModule dona a config do JwtModule e o TokenService (emissão de tokens,
  // 1.2.04). O JwtStrategy só verifica o access e usa o segredo do ConfigService.
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([Company]),
    TokenModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PasswordRecoveryService,
    ForgotPasswordRateLimitService,
  ],
})
export class AuthModule {}
