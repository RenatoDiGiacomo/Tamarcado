import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Protege rotas exigindo um access token JWT válido (NFR-S3). */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
