import { IsString, Matches, MaxLength } from "class-validator";

/**
 * Troca do slug do link público (`/agendar/{slug}`). Mesmas regras do
 * provisionamento (Story 1.9): kebab-case ASCII — minúsculas, dígitos e hífens
 * simples, sem acento/espaço/caractere especial. NÃO há redirect do slug antigo
 * (DL-049): trocar quebra todo link já divulgado — a confirmação fica no front.
 */
export class UpdateSlugDto {
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      "Endereço inválido: use apenas minúsculas, números e hífens (sem acento, espaço ou caractere especial).",
  })
  slug!: string;
}
