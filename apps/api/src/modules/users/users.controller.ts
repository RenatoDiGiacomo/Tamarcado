import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { User } from "../../database/entities/user.entity";
import { UsersService } from "./users.service";

interface UserProfile {
  id: string;
  companyId: string;
  name: string;
  email: string;
  accessLevel: User["access_level"];
  attendsClients: boolean;
  theme: User["theme"];
}

function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    companyId: user.company_id,
    name: user.name,
    email: user.email,
    accessLevel: user.access_level,
    attendsClients: user.attends_clients,
    theme: user.theme,
  };
}

@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Perfil do usuário autenticado (tenant-scoped). Antes de :id na ordem de rotas. */
  @Get("me")
  async me(@CurrentUser() authUser: AuthUser): Promise<UserProfile> {
    const user = await this.users.findById(authUser.userId);
    if (!user) {
      throw new NotFoundException();
    }
    return toProfile(user);
  }

  /** Lista os usuários do tenant atual (nunca de outro tenant — NFR-S1). */
  @Get()
  async list(): Promise<{ total: number; users: UserProfile[] }> {
    const [users, total] = await Promise.all([
      this.users.listForTenant(),
      this.users.countForTenant(),
    ]);
    return { total, users: users.map(toProfile) };
  }

  /** Busca tenant-scoped: id de outra instalação → 404 (inexistente). */
  @Get(":id")
  async byId(@Param("id") id: string): Promise<UserProfile> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException();
    }
    return toProfile(user);
  }
}
