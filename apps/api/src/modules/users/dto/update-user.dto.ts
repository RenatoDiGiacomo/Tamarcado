import { IsBoolean, IsIn, IsOptional } from "class-validator";

/**
 * Edição de usuário pelo Dono (AC2, AC5, AC6 + DL-062). `access_level` aqui só
 * pode ser `professional` (o `basic` foi aposentado; promover a `owner` seria
 * transferência de titularidade, fora de escopo). Rebaixar/desativar o último
 * Dono é bloqueado no serviço (FR-I3).
 *
 * Flags de permissão (DL-062), concedidos só pelo Dono, OFF por padrão:
 * - `can_view_financeiro` / `can_view_dashboard` — visibilidade de MÓDULO;
 * - `can_manage_all_appointments` — escopo de AÇÃO da Agenda (opera a de toda a
 *   equipe). O `owner` ignora todos (sempre pode) — o serviço não os aplica a ele.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsIn(["professional"])
  access_level?: "professional";

  @IsOptional()
  @IsBoolean()
  attends_clients?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  can_view_financeiro?: boolean;

  @IsOptional()
  @IsBoolean()
  can_view_dashboard?: boolean;

  @IsOptional()
  @IsBoolean()
  can_manage_all_appointments?: boolean;
}
