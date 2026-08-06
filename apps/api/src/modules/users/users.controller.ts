import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { User } from "../../database/entities/user.entity";
import { UsersService } from "./users.service";
import { InviteUserDto } from "./dto/invite-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateMeDto } from "./dto/update-me.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";

interface UserProfile {
  id: string;
  companyId: string;
  name: string;
  email: string;
  accessLevel: User["access_level"];
  attendsClients: boolean;
  isActive: boolean;
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
    isActive: user.is_active,
    theme: user.theme,
  };
}

// JwtAuthGuard (autentica) → ActiveUserGuard (revoga inativo na hora, AC6) →
// RolesGuard (matriz FR-I2; só atua onde há @Roles).
@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
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

  /** Preferências do próprio usuário — tema claro/escuro (AC3, Story 1.7). Antes de :id. */
  @Patch("me")
  async updateMe(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: UpdateMeDto,
  ): Promise<UserProfile> {
    return toProfile(await this.users.setTheme(authUser.userId, dto.theme));
  }

  /**
   * Troca a própria senha (Perfil). Valida a senha atual; 400 se não conferir.
   * Nova senha usa a política do aceite de convite (mín. 8). Antes de :id.
   */
  @Patch("me/password")
  async changePassword(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    await this.users.changeOwnPassword(
      authUser.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { ok: true };
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

  /** Usuários com agenda própria e ativos (AC4). Antes de :id na ordem de rotas. */
  @Get("attenders")
  async attenders(): Promise<{ users: UserProfile[] }> {
    const users = await this.users.listAttenders();
    return { users: users.map(toProfile) };
  }

  /** Convida um novo usuário e devolve o link de aceite (AC1). Somente Dono. */
  @Post("invite")
  @Roles("owner")
  async invite(
    @Body() dto: InviteUserDto,
    @CurrentUser() authUser: AuthUser,
  ): Promise<{ link: string; expiresAt: Date }> {
    const { invite, link } = await this.users.createInvite(dto, authUser.userId);
    return { link, expiresAt: invite.expires_at };
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

  /** Edita nível/atende/ativo (AC2/AC5/AC6). Somente Dono. */
  @Patch(":id")
  @Roles("owner")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserProfile> {
    return toProfile(await this.users.updateUser(id, dto));
  }
}
