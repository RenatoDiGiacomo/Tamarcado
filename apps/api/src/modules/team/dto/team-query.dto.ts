import { Matches } from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `GET /team?from&to` — período da PREVISÃO (datas civis, fuso do tenant). */
export class TeamQueryDto {
  @Matches(DATE_RE, { message: "from deve ser YYYY-MM-DD" })
  from!: string;

  @Matches(DATE_RE, { message: "to deve ser YYYY-MM-DD" })
  to!: string;
}
