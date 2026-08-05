import { CalendarDays, MessageCircle } from "lucide-react";
import { PageLayout } from "../components/PageLayout";
import { EmptyState } from "../components/EmptyState";
import { StatusChip } from "../components/StatusChip";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { AgendaGrid } from "../components/agenda/AgendaGrid";
import { useAgenda } from "../components/agenda/useAgenda";
import { NovoAgendamento } from "./NovoAgendamento";
import { formatDateLabel, toAgendaAppointment } from "./agendaMap";

/**
 * Agenda do painel. A LÓGICA (busca, período, permissões, status, cancelamento)
 * vive em `useAgenda` — esta página só orquestra a apresentação e os sheets
 * compartilhados. Desktop = `AgendaGrid` (grade). *(Mobile = `AgendaList` — lista;
 * ligado por breakpoint num passo seguinte.)*
 */
export function Agenda() {
  const a = useAgenda();

  const emptyState = (
    <EmptyState
      icon={CalendarDays}
      title={
        a.view === "dia"
          ? "Nenhum agendamento neste dia"
          : "Nenhum agendamento nesta semana"
      }
      description="Os agendamentos deste período aparecem aqui. Use ‹ › para navegar ou crie um novo."
    />
  );

  return (
    <PageLayout title="Agenda">
      {a.loading && !a.hasData ? (
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      ) : a.error ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a agenda.
        </p>
      ) : (
        <AgendaGrid
          dateLabel={formatDateLabel(a.anchor, a.view)}
          businessHours={a.businessHours}
          appointments={a.appointments}
          view={a.view}
          onViewChange={a.setView}
          emptyState={emptyState}
          onPrev={a.prev}
          onNext={a.next}
          onSelect={a.setSelectedId}
          onNew={() => a.setNovoOpen(true)}
        />
      )}

      {/* Novo agendamento manual (Story 3.3) — modal sobre a agenda (D4). */}
      <NovoAgendamento
        open={a.novoOpen}
        onOpenChange={a.setNovoOpen}
        date={a.anchor}
        onCreated={a.onSaved}
      />

      {/* Editar agendamento (Story 3.6) — mesmo formulário, pré-preenchido. */}
      <NovoAgendamento
        open={a.editing !== null}
        onOpenChange={(open) => !open && a.setEditing(null)}
        date={a.anchor}
        editing={a.editing}
        onCreated={(saved) => {
          a.onSaved(saved);
          a.setEditing(null);
        }}
      />

      {/* Detalhe read-only (D3) → confirmação de cancelamento (Story 3.4). */}
      <Dialog
        open={a.selected !== null}
        onOpenChange={(open) => !open && a.closeDetail()}
      >
        <DialogContent>
          {a.selected && !a.cancelMode && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{a.selected.clientName}</span>
                  {a.selected.source === "whatsapp" && (
                    <MessageCircle
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-label="WhatsApp"
                    />
                  )}
                  <StatusChip status={toAgendaAppointment(a.selected).status} />
                </DialogTitle>
              </DialogHeader>
              <dl className="flex flex-col gap-3 text-sm">
                <Row label="Serviço" value={a.selected.serviceName} />
                <Row
                  label="Horário"
                  value={`${a.selected.date.split("-").reverse().join("/")} · ${a.selected.start}–${a.selected.end}`}
                />
                <Row
                  label="Profissional"
                  value={a.selected.professionalName ?? "Não atribuído"}
                  muted={!a.selected.professionalName}
                />
              </dl>
              {(a.canConfirm || a.canMark || a.canEdit || a.canCancel) && (
                <div className="flex flex-col gap-3 pt-1">
                  {a.canConfirm && (
                    <div className="flex flex-col gap-3">
                      <div className="border-t border-border" />
                      <div className="flex items-center gap-2">
                        <span className="mr-auto text-sm font-medium text-foreground">
                          Confirmar esta solicitação?
                        </span>
                        <Button
                          disabled={a.confirming}
                          onClick={() => void a.confirmAppointment()}
                        >
                          {a.confirming ? "Confirmando…" : "Confirmar"}
                        </Button>
                      </div>
                    </div>
                  )}
                  {a.canMark && (
                    <div className="flex flex-col gap-3">
                      <div className="border-t border-border" />
                      <div className="flex items-center gap-2">
                        <span className="mr-auto text-sm font-medium text-foreground">
                          Como foi?
                        </span>
                        <Button
                          disabled={a.marking}
                          onClick={() => void a.markStatus("completed")}
                        >
                          Concluído
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-muted-foreground"
                          disabled={a.marking}
                          onClick={() => void a.markStatus("no_show")}
                        >
                          Não compareceu
                        </Button>
                      </div>
                    </div>
                  )}
                  {(a.canEdit || a.canCancel) && (
                    <div className="flex flex-col gap-3">
                      <div className="border-t border-border" />
                      <div className="flex items-center justify-between gap-2">
                        {a.canEdit ? (
                          <Button variant="secondary" onClick={a.openEdit}>
                            Editar
                          </Button>
                        ) : (
                          <span />
                        )}
                        {a.canCancel && (
                          <Button
                            variant="destructive"
                            onClick={() => a.setCancelMode(true)}
                          >
                            Cancelar agendamento
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {a.selected && a.cancelMode && (
            <>
              <DialogHeader>
                <DialogTitle>Cancelar agendamento</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">
                  Cancelar o atendimento de{" "}
                  <strong className="text-foreground">
                    {a.selected.clientName}
                  </strong>{" "}
                  ({a.selected.serviceName} · {a.selected.start}–{a.selected.end}).
                  O horário volta a ficar disponível e a ação não pode ser desfeita.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-foreground">
                    Motivo (opcional)
                  </span>
                  <textarea
                    aria-label="Motivo do cancelamento"
                    rows={3}
                    maxLength={500}
                    value={a.cancelReason}
                    onChange={(e) => a.setCancelReason(e.target.value)}
                    placeholder="Ex.: cliente pediu para remarcar"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
                {a.cancelError && (
                  <p role="alert" className="text-sm text-destructive">
                    {a.cancelError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      a.setCancelMode(false);
                      a.setCancelError(null);
                    }}
                    disabled={a.cancelSubmitting}
                  >
                    Voltar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void a.cancelAppointment()}
                    disabled={a.cancelSubmitting}
                  >
                    {a.cancelSubmitting ? "Cancelando…" : "Confirmar cancelamento"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={muted ? "italic text-muted-foreground" : "text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
