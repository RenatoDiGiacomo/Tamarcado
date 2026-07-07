import { CalendarX } from "lucide-react";
import { AgendaGrid } from "@/components/agenda/AgendaGrid";
import { MOCK_APPOINTMENTS } from "@/components/agenda/mock";
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
