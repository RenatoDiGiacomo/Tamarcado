import { Matches } from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `GET /appointments?from&to` — período de datas civis (fuso do tenant). */
export class ListAppointmentsQueryDto {
  @Matches(DATE_RE, { message: "from deve ser YYYY-MM-DD" })
  from!: string;

  @Matches(DATE_RE, { message: "to deve ser YYYY-MM-DD" })
  to!: string;
}
