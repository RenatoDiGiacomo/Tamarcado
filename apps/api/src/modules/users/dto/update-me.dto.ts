import { IsIn } from "class-validator";

/** Preferências do próprio usuário (Story 1.7). Hoje só o tema (DL-021). */
export class UpdateMeDto {
  @IsIn(["light", "dark"])
  theme!: "light" | "dark";
}
