import {
  Controller,
  Get,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Perfil do usuário autenticado — consumido pelo shell do painel. */
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() authUser: AuthUser) {
    const user = await this.users.findById(authUser.userId);
    if (!user) {
      throw new NotFoundException();
    }
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
}
