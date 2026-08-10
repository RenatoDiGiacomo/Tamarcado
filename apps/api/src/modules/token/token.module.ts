import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TokenService } from "./token.service";

/**
 * Emissão de JWT isolada (1.2.04). Configura o JwtModule (segredo + TTL do
 * access) e exporta o TokenService para quem precisa assinar tokens —
 * AuthModule e UsersModule — sem que nenhum deles importe o outro (evita ciclo).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          // segundos (jsonwebtoken aceita number = segundos)
          expiresIn: Number(config.get<string>("JWT_ACCESS_TTL", "900")),
        },
      }),
    }),
  ],
  providers: [TokenService],
  exports: [TokenService, JwtModule],
})
export class TokenModule {}