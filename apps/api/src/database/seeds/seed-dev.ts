import "reflect-metadata";
// Carrega apps/api/.env (mesma porta/credenciais da API) antes de montar a
// conexão — sem isto o seed cairia nos defaults do código (ex.: porta 3306) e
// divergiria do fluxo dev. Ver load-env.ts.
import "../../load-env";
import { DataSource } from "typeorm";
import * as bcrypt from "bcryptjs";
import { buildDataSourceOptions } from "../data-source-options";
import { Company } from "../entities/company.entity";
import { User } from "../entities/user.entity";
import { SalonService } from "../entities/salon-service.entity";
import { ProfessionalService } from "../entities/professional-service.entity";
import { ProfessionalSchedule } from "../entities/professional-schedule.entity";
import { Client } from "../entities/client.entity";
import { Appointment } from "../entities/appointment.entity";
import type {
  AppointmentSource,
  AppointmentStatus,
} from "../entities/appointment.entity";

/**
 * Seed de desenvolvimento — idempotente. Cria uma instalação de teste e um
 * usuário owner para tornar o login do painel testável. SÓ PARA DEV.
 */
export const SEED_COMPANY_SLUG = "salao-teste";
export const SEED_OWNER_EMAIL = "dono@tamarcado.dev";
export const SEED_OWNER_PASSWORD = "tamarcado123";

/** Aplica o seed sobre um DataSource já inicializado. Reutilizável em testes. */
export async function seedDev(dataSource: DataSource): Promise<void> {
  const companies = dataSource.getRepository(Company);
  const users = dataSource.getRepository(User);

  let company = await companies.findOne({ where: { slug: SEED_COMPANY_SLUG } });
  if (!company) {
    company = await companies.save(
      companies.create({ name: "Salão Teste", slug: SEED_COMPANY_SLUG }),
    );
    console.log(`Company criada (${company.id}): Salão Teste`);
  } else {
    console.log("Company 'Salão Teste' já existe.");
  }

  let owner = await users.findOne({
    where: { company_id: company.id, email: SEED_OWNER_EMAIL },
  });
  if (!owner) {
    owner = await users.save(
      users.create({
        company_id: company.id,
        name: "Dono Teste",
        email: SEED_OWNER_EMAIL,
        password_hash: await bcrypt.hash(SEED_OWNER_PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
    console.log(
      `Owner criado: ${owner.email} / senha: ${SEED_OWNER_PASSWORD} (DEV)`,
    );
  } else {
    console.log("Owner de dev já existe, nada a fazer.");
  }

  await seedAgenda(dataSource, company, owner);
}

/**
 * Agendamentos de exemplo (Story 3.2) para a Agenda ter dados realistas no
 * login. Ancorados na SEMANA ATUAL (fuso America/Sao_Paulo) — vários hoje (visão
 * Dia) e espalhados de seg a sáb (visão Semana), variando status, origem e
 * profissional (inclui não atribuído). Idempotente: só popula se ainda não houver
 * agendamentos para a empresa. SÓ PARA DEV.
 */
async function seedAgenda(
  dataSource: DataSource,
  company: Company,
  owner: User,
): Promise<void> {
  const users = dataSource.getRepository(User);
  const services = dataSource.getRepository(SalonService);
  const clients = dataSource.getRepository(Client);
  const appts = dataSource.getRepository(Appointment);

  // Uma segunda profissional (basic, atende) para contrastar com o dono.
  const findOrCreateUser = async (
    email: string,
    name: string,
  ): Promise<User> => {
    const found = await users.findOne({
      where: { company_id: company.id, email },
    });
    if (found) return found;
    return users.save(
      users.create({
        company_id: company.id,
        name,
        email,
        password_hash: await bcrypt.hash(SEED_OWNER_PASSWORD, 10),
        access_level: "basic",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
  };
  const ana = await findOrCreateUser("ana@tamarcado.dev", "Ana Prof");

  // Idempotente: acha ou cria o serviço por nome (não duplica em re-runs).
  const findOrCreateService = async (
    name: string,
    duration: number,
    price: string | null,
  ): Promise<SalonService> => {
    const found = await services.findOne({
      where: { company_id: company.id, name },
    });
    if (found) return found;
    return services.save(
      services.create({
        company_id: company.id,
        name,
        duration_minutes: duration,
        price,
        is_active: true,
      }),
    );
  };
  const corte = await findOrCreateService("Corte", 60, "50.00");
  const escova = await findOrCreateService("Escova", 45, "40.00");
  const coloracao = await findOrCreateService("Coloração", 90, "180.00");

  // Vínculo prof↔serviço + horários (idempotente, SEMPRE — mesmo em banco já
  // povoado). Sem eles o AvailabilityService devolve vazio e o modal não lista
  // horários. Opera sobre TODO atendente ativo × serviço ativo, cobrindo bancos
  // criados antes desta correção. Rodar `pnpm --filter api run seed:dev` conserta.
  await ensureLinksAndSchedules(dataSource, company.id);
  console.log("Vínculos e horários garantidos (seg–sáb 09–18h).");

  // Agendamentos de exemplo — só na primeira vez (idempotência).
  if ((await appts.count({ where: { company_id: company.id } })) > 0) {
    console.log("Agendamentos de dev já existem, nada a fazer.");
    return;
  }

  const mkClient = async (name: string): Promise<Client> =>
    clients.save(clients.create({ company_id: company.id, name }));
  const [paula, maria, joana, bianca, rita] = await Promise.all([
    mkClient("Paula Nunes"),
    mkClient("Maria das Dores"),
    mkClient("Joana Silva"),
    mkClient("Bianca Reis"),
    mkClient("Rita Alves"),
  ]);

  // Segunda-feira da semana atual (fuso do tenant).
  const monday = mondayOfCurrentWeek();

  interface Row {
    dayOffset: number; // 0=seg .. 5=sáb
    time: string; // HH:MM (fuso SP)
    service: SalonService;
    client: Client;
    professional: User | null;
    status: AppointmentStatus;
    source: AppointmentSource;
  }
  const todayOffset = mondayOffsetOfToday();
  const rows: Row[] = [
    // Hoje — garante a visão Dia populada (independe do dia da semana).
    { dayOffset: todayOffset, time: "09:00", service: corte, client: paula, professional: owner, status: "confirmed", source: "whatsapp" },
    { dayOffset: todayOffset, time: "10:30", service: coloracao, client: maria, professional: ana, status: "confirmed", source: "manual" },
    // Sobreposição proposital com a de cima (10:30) — exercita o layout de colisão.
    { dayOffset: todayOffset, time: "10:30", service: corte, client: joana, professional: owner, status: "confirmed", source: "manual" },
    { dayOffset: todayOffset, time: "14:00", service: escova, client: joana, professional: null, status: "confirmed", source: "whatsapp" },
    { dayOffset: todayOffset, time: "16:00", service: corte, client: bianca, professional: owner, status: "completed", source: "manual" },
    // Resto da semana — visão Semana.
    { dayOffset: 0, time: "08:00", service: escova, client: rita, professional: ana, status: "completed", source: "manual" },
    { dayOffset: 1, time: "11:00", service: corte, client: joana, professional: owner, status: "confirmed", source: "whatsapp" },
    { dayOffset: 2, time: "15:30", service: coloracao, client: paula, professional: ana, status: "cancelled", source: "whatsapp" },
    { dayOffset: 3, time: "09:30", service: corte, client: maria, professional: null, status: "confirmed", source: "manual" },
    { dayOffset: 4, time: "17:00", service: escova, client: bianca, professional: owner, status: "no_show", source: "whatsapp" },
    { dayOffset: 5, time: "10:00", service: corte, client: rita, professional: ana, status: "confirmed", source: "manual" },
  ];

  for (const r of rows) {
    await appts.save(
      appts.create({
        company_id: company.id,
        client_id: r.client.id,
        service_id: r.service.id,
        professional_id: r.professional ? r.professional.id : null,
        scheduled_at: spWallTimeToUtc(monday, r.dayOffset, r.time),
        duration_minutes: r.service.duration_minutes,
        price_snapshot: r.service.price,
        status: r.status,
        source: r.source,
        created_by_user_id: r.source === "manual" ? owner.id : null,
      }),
    );
  }
  console.log(`Agenda de dev populada: ${rows.length} agendamentos.`);
}

/**
 * Garante (idempotente) o vínculo prof↔serviço e os horários de atendimento
 * (seg–sáb 09–18h) para TODO atendente ativo × serviço ativo do tenant. Só
 * insere o que falta — seguro rodar quantas vezes quiser. É o que faz o
 * `seed:dev` consertar um banco antigo (sem horários) sem apagar nada.
 */
async function ensureLinksAndSchedules(
  dataSource: DataSource,
  companyId: string,
): Promise<void> {
  const users = dataSource.getRepository(User);
  const services = dataSource.getRepository(SalonService);
  const profServices = dataSource.getRepository(ProfessionalService);
  const schedules = dataSource.getRepository(ProfessionalSchedule);

  const staff = await users.find({
    where: { company_id: companyId, attends_clients: true, is_active: true },
  });
  const catalog = await services.find({
    where: { company_id: companyId, is_active: true },
  });

  for (const person of staff) {
    for (const svc of catalog) {
      const link = await profServices.findOne({
        where: {
          company_id: companyId,
          professional_id: person.id,
          service_id: svc.id,
        },
      });
      if (!link) {
        await profServices.save(
          profServices.create({
            company_id: companyId,
            professional_id: person.id,
            service_id: svc.id,
          }),
        );
      }
    }
    // day_of_week: 0=domingo..6=sábado (getUTCDay). Seg–sáb = 1..6.
    for (let dow = 1; dow <= 6; dow++) {
      const sched = await schedules.findOne({
        where: {
          company_id: companyId,
          professional_id: person.id,
          day_of_week: dow,
        },
      });
      if (!sched) {
        await schedules.save(
          schedules.create({
            company_id: companyId,
            professional_id: person.id,
            day_of_week: dow,
            start_time: "09:00:00",
            end_time: "18:00:00",
            is_active: true,
          }),
        );
      }
    }
  }
}

/** Data (UTC 00:00) da segunda-feira da semana civil atual no fuso SP. */
function mondayOfCurrentWeek(): Date {
  const parts = spParts(new Date());
  const base = Date.UTC(parts.y, parts.m - 1, parts.d);
  return new Date(base - mondayOffset(parts.dow) * 86400000);
}

/** Quantos dias hoje está após a segunda (0=seg..6=dom), no fuso SP. */
function mondayOffsetOfToday(): number {
  return mondayOffset(spParts(new Date()).dow);
}

/** getUTCDay (0=dom) → offset a partir de segunda (0=seg..6=dom). */
function mondayOffset(dow: number): number {
  return (dow + 6) % 7;
}

/**
 * Wall-time do tenant (America/Sao_Paulo, UTC-3 fixo hoje) → instante UTC.
 * `monday` é a segunda (UTC 00:00); soma `dayOffset` dias + `HH:MM` + 3h.
 */
function spWallTimeToUtc(monday: Date, dayOffset: number, time: string): Date {
  const [h, min] = time.split(":").map(Number);
  return new Date(
    monday.getTime() + dayOffset * 86400000 + (h + 3) * 3600000 + min * 60000,
  );
}

/** Ano/mês/dia e dia-da-semana civis de um instante no fuso SP. */
function spParts(instant: Date): { y: number; m: number; d: number; dow: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = dtf.format(instant).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dow };
}

/** Entry point CLI (`pnpm --filter api run seed:dev`). */
async function run(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    await seedDev(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

// Executa só quando rodado diretamente (não quando importado por um teste).
if (require.main === module) {
  run().catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
}
