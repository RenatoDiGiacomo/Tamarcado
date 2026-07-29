import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

/** Nome: letras (com acento) + espaço + apóstrofo (reto/curvo) + hífen; 2–100. */
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’-]{0,98}[\p{L}\p{M}]$/u;
/** Telefone BR: só dígitos, DDD(2) + `9?` (celular) + número(8) = 10 ou 11. */
const PHONE_RE = /^\d{2}9?\d{8}$/;
const ID_RE = /^\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * `POST /public/:slug/appointments` — criação pública (Story 5B.2). HOSTIL por
 * padrão: validação estrita no BACKEND (o front valida só para UX). Aplicado com
 * `whitelist + forbidNonWhitelisted + transform` no handler — campo a mais é
 * REJEITADO (§AC4/DL-034: sem companyId/status/id no body). Ver os 7 ACs na
 * spec 5B-2 e no e2e `public-booking-security`.
 */
export class CreatePublicAppointmentDto {
  @Matches(NAME_RE, {
    message:
      "Nome inválido. Use apenas letras, espaço, apóstrofo e hífen (2 a 100).",
  })
  @MaxLength(100)
  name!: string;

  @Matches(PHONE_RE, {
    message: "Telefone inválido. Informe DDD + número (só dígitos).",
  })
  phone!: string;

  @Matches(ID_RE, { message: "Serviço inválido." })
  serviceId!: string;

  @Matches(DATE_RE, { message: "date deve ser YYYY-MM-DD" })
  date!: string;

  @Matches(TIME_RE, { message: "time deve ser HH:MM" })
  time!: string;

  // Profissional OPCIONAL (DL-049) — em branco = não atribuído.
  @IsOptional()
  @Matches(ID_RE, { message: "Profissional inválido." })
  professionalId?: string;

  // Consentimento LGPD obrigatório (NFR-S2).
  @IsBoolean()
  @Equals(true, { message: "É necessário aceitar o aviso de privacidade." })
  consent!: boolean;

  // Honeypot: campo oculto no form; bots preenchem. Precisa existir na whitelist
  // (senão forbidNonWhitelisted rejeitaria), mas o service exige que venha VAZIO.
  @IsOptional()
  @IsString()
  website?: string;
}
