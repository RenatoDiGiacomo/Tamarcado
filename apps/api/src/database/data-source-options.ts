import { DataSourceOptions } from "typeorm";
import { Company } from "./entities/company.entity";
import { User } from "./entities/user.entity";
import { UserInvite } from "./entities/user-invite.entity";
import { SalonService } from "./entities/salon-service.entity";
import { ProfessionalService } from "./entities/professional-service.entity";
import { ProfessionalSchedule } from "./entities/professional-schedule.entity";
import { Client } from "./entities/client.entity";
import { Appointment } from "./entities/appointment.entity";
import { AppointmentChange } from "./entities/appointment-change.entity";
import { Payment } from "./entities/payment.entity";
import { CreateCompanies1718900000000 } from "./migrations/1718900000000-CreateCompanies";
import { CreateUsers1718900100000 } from "./migrations/1718900100000-CreateUsers";
import { CreateUserInvites1718900200000 } from "./migrations/1718900200000-CreateUserInvites";
import { CreateServices1718900300000 } from "./migrations/1718900300000-CreateServices";
import { CreateProfessionalSchedules1718900400000 } from "./migrations/1718900400000-CreateProfessionalSchedules";
import { CreateAppointmentsBase1718900500000 } from "./migrations/1718900500000-CreateAppointmentsBase";
import { AddCancelledByUserIdToAppointments1718900600000 } from "./migrations/1718900600000-AddCancelledByUserIdToAppointments";
import { AddAssignmentAuditToAppointments1718900700000 } from "./migrations/1718900700000-AddAssignmentAuditToAppointments";
import { CreateAppointmentChanges1718900800000 } from "./migrations/1718900800000-CreateAppointmentChanges";
import { AddLinkToAppointmentSource1718900900000 } from "./migrations/1718900900000-AddLinkToAppointmentSource";
import { AddTokenVersionToUsers1718901000000 } from "./migrations/1718901000000-AddTokenVersionToUsers";
import { AddModuleFlagsAndRetireBasic1718901100000 } from "./migrations/1718901100000-AddModuleFlagsAndRetireBasic";
import { RenameManagerToProfessional1718901200000 } from "./migrations/1718901200000-RenameManagerToProfessional";
import { CreatePayments1718901300000 } from "./migrations/1718901300000-CreatePayments";
import { AddTeamRemuneration1718901400000 } from "./migrations/1718901400000-AddTeamRemuneration";

/**
 * Opções de conexão TypeORM compartilhadas entre o runtime (DatabaseModule)
 * e a CLI de migrations (typeorm.config.ts).
 *
 * Lê DATABASE_URL quando presente (ex.: docker-compose), senão monta a partir
 * de variáveis discretas com defaults de desenvolvimento local.
 *
 * `synchronize` é sempre false — o schema evolui exclusivamente por migrations.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;

  const base = {
    type: "mysql" as const,
    entities: [
      Company,
      User,
      UserInvite,
      SalonService,
      ProfessionalService,
      ProfessionalSchedule,
      Client,
      Appointment,
      AppointmentChange,
      Payment,
    ],
    migrations: [
      CreateCompanies1718900000000,
      CreateUsers1718900100000,
      CreateUserInvites1718900200000,
      CreateServices1718900300000,
      CreateProfessionalSchedules1718900400000,
      CreateAppointmentsBase1718900500000,
      AddCancelledByUserIdToAppointments1718900600000,
      AddAssignmentAuditToAppointments1718900700000,
      CreateAppointmentChanges1718900800000,
      AddLinkToAppointmentSource1718900900000,
      AddTokenVersionToUsers1718901000000,
      AddModuleFlagsAndRetireBasic1718901100000,
      RenameManagerToProfessional1718901200000,
      CreatePayments1718901300000,
      AddTeamRemuneration1718901400000,
    ],
    synchronize: false,
    migrationsRun: false,
    timezone: "Z", // banco em UTC; conversão de fuso na aplicação (ADR-008)
    // Resiliência do POOL a inatividade: o MySQL derruba conexões ociosas
    // (`wait_timeout`, 8h por padrão). Sem keep-alive, a 1ª query após um longo
    // ocioso (ex.: recepção volta do almoço) pegava uma conexão morta e falhava.
    // `enableKeepAlive` manda TCP keep-alive nas conexões do pool, impedindo o
    // drop silencioso; conexões inválidas são recicladas pelo mysql2. Repassado
    // ao driver mysql2 via `extra`.
    extra: {
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    },
    // Tolera o MySQL não estar pronto no instante do boot (ex.: subida via
    // compose). Lidos pelo @nestjs/typeorm em forRoot; ignorados pelo
    // DataSource da CLI. (A separação liveness/readiness — /health responder
    // com 'db down' — fica como melhoria futura, ver story 1.1 Pendências.)
    retryAttempts: 10,
    retryDelay: 3000,
  };

  if (url) {
    return { ...base, url };
  }

  return {
    ...base,
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    username: process.env.DATABASE_USER ?? "root",
    password: process.env.DATABASE_PASSWORD ?? "root",
    database: process.env.DATABASE_NAME ?? "tamarcado_dev",
  };
}
