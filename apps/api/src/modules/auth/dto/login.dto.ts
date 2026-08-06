import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /**
   * Escolha do estabelecimento na DESAMBIGUAÇÃO (DL-052). O tenant do painel é
   * resolvido pelo backend a partir do e-mail — não há slug na URL do painel.
   * Quando o mesmo e-mail existe em mais de uma empresa (e-mail é único POR
   * empresa, DL-026), o login responde com a lista de empresas; o front reenvia
   * com o `companyId` escolhido e só então a senha é validada naquele tenant.
   */
  @IsOptional()
  @IsString()
  companyId?: string;
}
