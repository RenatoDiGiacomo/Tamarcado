import { IsIn } from "class-validator";

/**
 * `PATCH /appointments/:id/status` — marcar comparecimento (Story 3.7). Só os
 * alvos desta story: `completed` (concluído) e `no_show` (não compareceu). Cancelar
 * é a 3.4 (`:id/cancel`); editar é a 3.6. O mapa de transição (origem/condição) é
 * validado no service.
 */
export class ChangeStatusDto {
  @IsIn(["completed", "no_show"], {
    message: "Transição inválida (use completed ou no_show).",
  })
  to!: "completed" | "no_show";
}
