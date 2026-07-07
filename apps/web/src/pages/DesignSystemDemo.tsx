import { CalendarX } from "lucide-react";
import { AgendaGrid } from "@/components/agenda/AgendaGrid";
import {
  MOCK_APPOINTMENTS,
  MOCK_APPOINTMENTS_FULL_DAY,
} from "@/components/agenda/mock";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/StatusChip";
import { EmptyState } from "@/components/EmptyState";
import { PageLayout } from "@/components/PageLayout";

/** Demo pública do Design System (Story 2.1) — em /demo, para revisão visual. */
export function DesignSystemDemo() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageLayout title="Design System — demo" action={<Button>Ação</Button>}>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Danger</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusChip status="pending" />
          <StatusChip status="confirmed" />
          <StatusChip status="done" />
          <StatusChip status="cancelled" />
          <StatusChip status="noshow" />
        </div>

        <AgendaGrid
          dateLabel="Ter, 17/06"
          businessHours={{ start: "08:00", end: "17:00" }}
          appointments={MOCK_APPOINTMENTS}
          onSelect={() => {}}
          onNew={() => {}}
        />

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Dia lotado (08h–20h) — scroll vertical, cabeçalho fixo
          </h2>
          <AgendaGrid
            dateLabel="Qua, 18/06"
            businessHours={{ start: "08:00", end: "20:00" }}
            appointments={MOCK_APPOINTMENTS_FULL_DAY}
            onSelect={() => {}}
            onNew={() => {}}
          />
        </div>

        <EmptyState
          icon={CalendarX}
          title="Nenhum agendamento neste dia"
          description="Que tal criar o primeiro?"
          action={<Button>+ Novo agendamento</Button>}
        />
      </PageLayout>
    </div>
  );
}
