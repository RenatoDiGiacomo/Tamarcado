import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/**
 * `GET /clients` — autocomplete (só `search`) OU listagem paginada da gestão
 * (Story 4.1). O controller entra em **modo lista** quando `page`/`pageSize`
 * chegam; senão mantém o autocomplete da 3.3 (vazio→[], `{ clients }`).
 */
export class ListClientsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** `POST /clients` — cadastro inline (FR-D7): nome obrigatório, WhatsApp opcional. */
export class CreateClientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_whatsapp?: string;
}

/** `PATCH /clients/:id` — edição (Story 4.1): nome e/ou WhatsApp. Vazio remove o WhatsApp. */
export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_whatsapp?: string;
}
