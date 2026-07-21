import type { AgendaAppointment } from "./AgendaGrid";

/** Dados de exemplo para a demo/testes da casca (Story 2.1; dados reais na 3.2). */
export const MOCK_APPOINTMENTS: AgendaAppointment[] = [
  {
    id: "1",
    clientName: "Paula Nunes",
    serviceName: "Corte",
    start: "08:00",
    end: "08:45",
    status: "cancelled",
    origin: "manual",
    professionalName: "Fernanda",
    weekday: 0,
  },
  {
    id: "2",
    clientName: "Maria das Dores",
    serviceName: "Coloração",
    start: "09:00",
    end: "12:00",
    status: "confirmed",
    origin: "manual",
    professionalName: "Fernanda",
    weekday: 1,
  },
  {
    id: "3",
    clientName: "Joana Silva",
    serviceName: "Corte",
    start: "12:30",
    end: "13:30",
    status: "confirmed",
    origin: "manual",
    professionalName: "Ana",
    weekday: 2,
  },
  {
    id: "4",
    clientName: "Bianca Reis",
    serviceName: "Manicure",
    start: "14:00",
    end: "15:00",
    status: "done",
    origin: "manual",
    professionalName: "Ana",
    weekday: 3,
  },
  {
    id: "5",
    clientName: "Rita Alves",
    serviceName: "Escova",
    start: "15:30",
    end: "16:30",
    status: "pending",
    origin: "whatsapp",
    professionalName: null,
    weekday: 4,
  },
  {
    id: "6",
    clientName: "Sônia Braga",
    serviceName: "Cílios",
    start: "16:30",
    end: "17:00",
    status: "noshow",
    origin: "manual",
    professionalName: "Fernanda",
    weekday: 5,
  },
  // Sobreposições (overbooking/encaixe, D1) — colidem com "Maria das Dores"
  // (09:00–12:00) para exercitar o layout de colisão em colunas lado a lado.
  {
    id: "7",
    clientName: "Larissa Prado",
    serviceName: "Coloração",
    start: "09:30",
    end: "11:00",
    status: "confirmed",
    origin: "manual",
    professionalName: "Ana",
    weekday: 1,
  },
  {
    id: "8",
    clientName: "Teste Encaixe",
    serviceName: "Corte",
    start: "10:00",
    end: "10:45",
    status: "done",
    origin: "manual",
    professionalName: "Fernanda",
    weekday: 1,
  },
];

/**
 * Dia LOTADO (08h–20h) para validar o scroll vertical da agenda com o
 * cabeçalho fixo. Só demo/visual — dados reais chegam na Story 3.2.
 */
export const MOCK_APPOINTMENTS_FULL_DAY: AgendaAppointment[] = [
  { id: "f1", clientName: "Paula Nunes", serviceName: "Corte", start: "08:00", end: "08:45", status: "done", origin: "manual", professionalName: "Fernanda" },
  { id: "f2", clientName: "Carla Menezes", serviceName: "Escova", start: "08:45", end: "09:30", status: "done", origin: "whatsapp", professionalName: "Ana" },
  { id: "f3", clientName: "Maria das Dores", serviceName: "Coloração", start: "09:30", end: "11:00", status: "confirmed", origin: "manual", professionalName: "Fernanda" },
  { id: "f4", clientName: "Joana Silva", serviceName: "Corte", start: "11:00", end: "11:45", status: "confirmed", origin: "whatsapp", professionalName: "Ana" },
  { id: "f5", clientName: "Bianca Reis", serviceName: "Manicure", start: "11:45", end: "12:30", status: "confirmed", origin: "manual", professionalName: null },
  { id: "f6", clientName: "Letícia Prado", serviceName: "Corte + Escova", start: "13:00", end: "14:15", status: "confirmed", origin: "whatsapp", professionalName: "Fernanda" },
  { id: "f7", clientName: "Sônia Braga", serviceName: "Hidratação", start: "14:15", end: "15:00", status: "pending", origin: "whatsapp", professionalName: null },
  { id: "f8", clientName: "Rita Alves", serviceName: "Escova", start: "15:00", end: "15:45", status: "confirmed", origin: "manual", professionalName: "Ana" },
  { id: "f9", clientName: "Débora Lima", serviceName: "Coloração", start: "15:45", end: "17:15", status: "confirmed", origin: "manual", professionalName: "Fernanda" },
  { id: "f10", clientName: "Vanessa Rocha", serviceName: "Corte", start: "17:15", end: "18:00", status: "cancelled", origin: "whatsapp", professionalName: "Ana" },
  { id: "f11", clientName: "Amanda Souza", serviceName: "Manicure", start: "18:00", end: "18:45", status: "pending", origin: "whatsapp", professionalName: null },
  { id: "f12", clientName: "Priscila Gomes", serviceName: "Escova", start: "19:00", end: "20:00", status: "confirmed", origin: "manual", professionalName: "Ana" },
];
