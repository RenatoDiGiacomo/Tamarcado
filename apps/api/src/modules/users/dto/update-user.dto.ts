import { IsBoolean, IsIn, IsOptional } from "class-validator";

/**
 * Edição de usuário pelo Dono (AC2, AC5, AC6). `access_level` aqui é só
 * `manager`/`basic`: promover a `owner` seria transferência de titularidade,
 * fora do escopo da 1.4 (DL-029 item 4). Rebaixar/desativar o último Dono é
 * bloqueado no serviço (FR-I3).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsIn(["manager", "basic"])
  access_level?: "manager" | "basic";

  @IsOptional()
  @IsBoolean()
  attends_clients?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
