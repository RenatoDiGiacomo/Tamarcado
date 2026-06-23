import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /**
   * Identificador da instalação (slug da company). Opcional: em deploy de
   * tenant único o login resolve a única company existente (DL-026).
   */
  @IsOptional()
  @IsString()
  companySlug?: string;
}
