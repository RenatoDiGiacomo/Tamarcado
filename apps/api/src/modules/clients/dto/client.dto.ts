import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** `GET /clients?search=` — autocomplete do agendamento manual. */
export class SearchClientsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
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
